// Fetch-backed delivery for the Go-owned HTTP effects. This module owns only
// request mechanics; Go remains the owner of application state and effects.

function fail(message, cause) {
  return new Error(`HTTP effect transport: ${message}`, cause === undefined ? undefined : { cause });
}

function validID(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function cloneEvent(event) {
  return { ...event };
}

function validateStart(command) {
  if (!command || typeof command !== "object" || Array.isArray(command) ||
      command.Kind !== "start" || !validID(command.ID) || typeof command.Value !== "string") {
    throw fail("start() requires a Go start command with a positive safe ID and string Value");
  }
  return { Kind: "start", ID: command.ID, Value: command.Value };
}

function validateID(id) {
  if (!validID(id)) throw fail("cancel() requires a positive safe ID");
}

function isExactReply(reply, expectedID) {
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) return false;
  const keys = Object.keys(reply).sort();
  return keys.length === 3 && keys[0] === "Error" && keys[1] === "ID" && keys[2] === "Value" &&
    Object.hasOwn(reply, "ID") && reply.ID === expectedID &&
    Object.hasOwn(reply, "Value") && typeof reply.Value === "string" &&
    Object.hasOwn(reply, "Error") && typeof reply.Error === "string";
}

/**
 * Create a same-origin fetch transport for the unchanged async effect host.
 * `url` may be a fixed URL or a synchronous command-to-URL resolver, which is
 * useful for routing each save to a distinct HTTP laboratory mode.
 */
export function createHTTPTransport({ runtime, url, fetchImpl = globalThis.fetch } = {}) {
  if (!runtime || typeof runtime !== "object" ||
      typeof runtime.encodeHTTP !== "function" || typeof runtime.decodeHTTP !== "function") {
    throw fail("runtime must expose encodeHTTP() and decodeHTTP()");
  }
  if (typeof url !== "string" && typeof url !== "function" && !(url instanceof URL)) {
    throw fail("url must be a string, URL, or command-to-URL function");
  }
  if (typeof fetchImpl !== "function") throw fail("fetchImpl must be a function");

  const requests = new Map();
  const work = new Set();
  const events = [];
  const settledErrors = [];
  let disposed = false;

  function abortRecord(record, shouldLog) {
    if (record.delivered || record.cancelled) return;
    record.cancelled = true;
    if (shouldLog) events.push({ Kind: "cancel", ID: record.command.ID });
    try {
      record.controller?.abort();
    } catch {
      // AbortController is advisory; the record fence below still suppresses delivery.
    }
  }

  function publish(record, reply) {
    if (disposed || record.cancelled || record.delivered) return;
    record.delivered = true;
    const normalized = { ID: reply.ID, Value: reply.Value, Error: reply.Error };
    events.push({ Kind: "reply", ...normalized });
    record.deliver(normalized);
  }

  async function perform(record) {
    const id = record.command.ID;
    let reply;
    try {
      const body = runtime.encodeHTTP(id, record.command.Value);
      if (typeof body !== "string") throw fail("runtime.encodeHTTP() must return a JSON string");
      const target = typeof url === "function" ? url({ ...record.command }) : url;
      if (typeof target !== "string" && !(target instanceof URL)) {
        throw fail("URL resolver must return a string or URL");
      }
      const init = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        mode: "same-origin",
        credentials: "same-origin",
        redirect: "error",
      };
      if (record.controller) init.signal = record.controller.signal;

      const response = await fetchImpl(target, init);
      if (!response || !Number.isInteger(response.status) || response.status < 100 || response.status > 599 ||
          typeof response.text !== "function") {
        reply = { ID: id, Value: "", Error: "invalid response" };
      } else {
        const responseBody = await response.text();
        if (typeof responseBody !== "string") {
          reply = { ID: id, Value: "", Error: "invalid response" };
        } else {
          try {
            const decoded = runtime.decodeHTTP(id, response.status, responseBody);
            reply = isExactReply(decoded, id)
              ? { ID: id, Value: decoded.Value, Error: decoded.Error }
              : { ID: id, Value: "", Error: "invalid response" };
          } catch {
            reply = { ID: id, Value: "", Error: "invalid response" };
          }
        }
      }
    } catch {
      reply = { ID: id, Value: "", Error: "network error" };
    }
    publish(record, reply);
  }

  function start(command, deliver) {
    if (disposed) throw fail("start() called after dispose()");
    const copied = validateStart(command);
    if (typeof deliver !== "function") throw fail("start() requires a delivery callback");
    if (requests.has(copied.ID)) throw fail(`request ID ${copied.ID} was started more than once`);

    const record = {
      command: copied,
      deliver,
      controller: typeof AbortController === "function" ? new AbortController() : null,
      cancelled: false,
      delivered: false,
    };
    requests.set(copied.ID, record);
    events.push({ Kind: "start", ID: copied.ID, Value: copied.Value });

    let pending;
    pending = perform(record)
      .catch((error) => { settledErrors.push(error); })
      .finally(() => work.delete(pending));
    work.add(pending);
    // The catch above retains unexpected work or delivery callback failures
    // until settled() observes them. This also prevents unhandled rejections
    // when the request finishes before the caller next asks for settlement.
    pending.catch(() => {});
  }

  function cancel(id) {
    validateID(id);
    if (disposed) return;
    const record = requests.get(id);
    if (!record || record.delivered || record.cancelled) return;
    abortRecord(record, true);
  }

  async function settled() {
    while (work.size) await Promise.all([...work]);
    if (settledErrors.length) {
      const errors = settledErrors.splice(0);
      if (errors.length === 1) throw errors[0];
      throw new AggregateError(errors, "HTTP effect transport work failed");
    }
  }

  function log() {
    return events.map(cloneEvent);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const record of requests.values()) abortRecord(record, true);
  }

  return { start, cancel, settled, log, dispose };
}
