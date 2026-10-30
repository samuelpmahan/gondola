// Deterministic and timer-backed transports for the Go-owned effect host.
// A transport owns delivery mechanics only; it never decides application state.

function fail(message) {
  return new Error(`async effect transport: ${message}`);
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = clone(item);
    return result;
  }
  return value;
}

function validID(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function validateCommand(command) {
  if (!command || typeof command !== "object" || Array.isArray(command) ||
      !validID(command.ID) || command.Kind !== "start" || typeof command.Value !== "string") {
    throw fail("start() requires a Go start command with a positive safe ID and string Value");
  }
  return { Kind: "start", ID: command.ID, Value: command.Value };
}

function validateDeliveryOptions(options) {
  if (options == null) return {};
  if (typeof options !== "object" || Array.isArray(options)) {
    throw fail("delivery options must be an object");
  }
  const allowed = new Set(["value", "error"]);
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) throw fail(`unsupported delivery option ${JSON.stringify(key)}`);
  }
  if (Object.hasOwn(options, "value") && typeof options.value !== "string") {
    throw fail("delivery value must be a string");
  }
  if (Object.hasOwn(options, "error") && typeof options.error !== "string") {
    throw fail("delivery error must be a string");
  }
  if (options.value && options.error) throw fail("a delivery cannot contain both value and error");
  return options;
}

function validateCancelID(id) {
  if (!validID(id)) throw fail("cancel() requires a positive safe ID");
}

/**
 * Make a manual transport that records every command and permits deliberately
 * late and duplicate replies. cancel() is recorded but never erases a callback.
 * deliver() invokes the saved callback synchronously and returns the normalized
 * reply; the host decides when Go processes it. pending() includes every start
 * that has not received a delivery, even if cancel() was requested, because
 * canceled requests remain manually deliverable.
 */
export function createManualTransport(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw fail("createManualTransport options must be an object");
  }
  for (const key of Object.keys(options)) {
    if (key !== "defaultValue") throw fail(`unsupported option ${JSON.stringify(key)}`);
  }
  const { defaultValue } = options;
  if (defaultValue !== undefined && typeof defaultValue !== "string") {
    throw fail("defaultValue must be a string when supplied");
  }

  const records = new Map();
  const events = [];

  function start(command, deliver) {
    const copied = validateCommand(command);
    if (typeof deliver !== "function") throw fail("start() requires a delivery callback");
    const existing = records.get(copied.ID);
    if (existing && existing.command.Value !== copied.Value) {
      throw fail(`request ID ${copied.ID} was reused with a different value`);
    }
    if (existing) throw fail(`request ID ${copied.ID} was started more than once`);
    const record = { command: copied, deliver, cancelled: false, deliveries: 0 };
    records.set(copied.ID, record);
    events.push({ kind: "start", command: clone(copied) });
    return undefined;
  }

  function cancel(id) {
    validateCancelID(id);
    const record = records.get(id);
    if (record) record.cancelled = true;
    events.push({ kind: "cancel", id });
    // Advisory only: keep the callback so a late transport result remains testable.
    return undefined;
  }

  function deliver(id, options = {}) {
    validateCancelID(id);
    const record = records.get(id);
    if (!record) throw fail(`cannot deliver unknown request ID ${id}`);
    const supplied = validateDeliveryOptions(options);
    const reply = {
      ID: id,
      Value: Object.hasOwn(supplied, "value") ? supplied.value : (defaultValue ?? record.command.Value),
      Error: supplied.error ?? "",
    };
    record.deliveries += 1;
    events.push({ kind: "deliver", reply: clone(reply) });
    record.deliver(clone(reply));
    return clone(reply);
  }

  function pending() {
    return [...records.values()]
      .filter((record) => record.deliveries === 0)
      .map((record) => clone(record.command));
  }

  function log() {
    return clone(events);
  }

  return { start, cancel, deliver, pending, log };
}

/**
 * Create an optional real asynchronous transport. It is intentionally a local
 * timer stand-in, not a network client. Cancellation clears its timer when it
 * can, while callbacks already queued by the event loop may still arrive.
 */
export function createTimeoutTransport({
  delayMs = 0,
  valueForCommand = (command) => command.Value,
  errorForCommand = () => "",
} = {}) {
  if (!Number.isFinite(delayMs) || delayMs < 0) throw fail("delayMs must be a non-negative finite number");
  if (typeof valueForCommand !== "function" || typeof errorForCommand !== "function") {
    throw fail("valueForCommand and errorForCommand must be functions");
  }
  const timers = new Map();
  const records = new Map();

  function start(command, deliver) {
    const copied = validateCommand(command);
    if (typeof deliver !== "function") throw fail("start() requires a delivery callback");
    if (records.has(copied.ID)) throw fail(`request ID ${copied.ID} was started more than once`);
    const record = { command: copied, deliver, cancelled: false, timer: null };
    records.set(copied.ID, record);
    record.timer = setTimeout(() => {
      timers.delete(copied.ID);
      let reply;
      try {
        const error = errorForCommand(clone(copied));
        const value = valueForCommand(clone(copied));
        if (typeof error !== "string" || typeof value !== "string") {
          throw fail("timeout result functions must return strings");
        }
        reply = { ID: copied.ID, Value: value, Error: error };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reply = { ID: copied.ID, Value: "", Error: `transport failure: ${message}` };
      }
      deliver(reply);
    }, delayMs);
    timers.set(copied.ID, record.timer);
  }

  function cancel(id) {
    validateCancelID(id);
    const record = records.get(id);
    if (!record) return;
    record.cancelled = true;
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  return { start, cancel };
}
