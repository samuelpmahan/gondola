import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHTTPTransport } from "./transport.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function response(status, body) {
  return { status, async text() { return body; } };
}

function makeRuntime(overrides = {}) {
  return {
    encodeHTTP(id, value) { return JSON.stringify({ ID: id, Value: value }); },
    decodeHTTP(id, status, body) {
      if (status !== 200) return { ID: id, Value: "", Error: `http status ${status}` };
      const parsed = JSON.parse(body);
      if (parsed.ID !== id || typeof parsed.Value !== "string" || typeof parsed.Error !== "string") {
        return { ID: id, Value: "", Error: "invalid response" };
      }
      return parsed;
    },
    ...overrides,
  };
}

function command(ID, Value = "draft") {
  return { Kind: "start", ID, Value };
}

test("HTTP transport POSTs encoded JSON and returns one decoded reply", async () => {
  const calls = [];
  const decoded = [];
  const replies = [];
  const runtime = makeRuntime({
    decodeHTTP(id, status, body) {
      decoded.push({ id, status, body });
      return { ID: id, Value: "saved", Error: "" };
    },
  });
  const transport = createHTTPTransport({
    runtime,
    url: (cmd) => `http://example.test/save?id=${cmd.ID}`,
    fetchImpl: async (...args) => {
      calls.push(args);
      return response(200, '{"ID":8,"Value":"saved","Error":""}');
    },
  });

  transport.start(command(8, "hello"), (reply) => replies.push(reply));
  await transport.settled();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "http://example.test/save?id=8");
  assert.deepEqual(calls[0][1], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"ID":8,"Value":"hello"}',
    mode: "same-origin",
    credentials: "same-origin",
    redirect: "error",
    signal: calls[0][1].signal,
  });
  assert.ok(calls[0][1].signal instanceof AbortSignal);
  assert.deepEqual(decoded, [{ id: 8, status: 200, body: '{"ID":8,"Value":"saved","Error":""}' }]);
  assert.deepEqual(replies, [{ ID: 8, Value: "saved", Error: "" }]);
  assert.deepEqual(transport.log(), [
    { Kind: "start", ID: 8, Value: "hello" },
    { Kind: "reply", ID: 8, Value: "saved", Error: "" },
  ]);
  assert.throws(() => transport.start(command(8, "again"), () => {}), /started more than once/);
  transport.dispose();
});

test("HTTP transport converts fetch, encoder, and resolver failures to safe network replies", async () => {
  for (const [label, options] of [
    ["fetch", { fetchImpl() { throw new Error("socket detail"); } }],
    ["encode", { runtime: makeRuntime({ encodeHTTP() { throw new Error("codec detail"); } }) }],
    ["url", { url() { throw new Error("route detail"); } }],
  ]) {
    const replies = [];
    const transport = createHTTPTransport({
      runtime: makeRuntime(),
      url: "http://example.test/save",
      fetchImpl: async () => response(200, "unused"),
      ...options,
    });
    transport.start(command(11, label), (reply) => replies.push(reply));
    await transport.settled();
    assert.deepEqual(replies, [{ ID: 11, Value: "", Error: "network error" }], label);
    assert.deepEqual(transport.log(), [
      { Kind: "start", ID: 11, Value: label },
      { Kind: "reply", ID: 11, Value: "", Error: "network error" },
    ], label);
    transport.dispose();
  }
});

test("settled retains a delivery callback failure until it is consumed exactly once", async () => {
  const deliveryError = new Error("delivery failed");
  const transport = createHTTPTransport({
    runtime: makeRuntime(),
    url: "http://example.test/save",
    fetchImpl: async () => response(200, '{"ID":13,"Value":"ok","Error":""}'),
  });

  transport.start(command(13), () => { throw deliveryError; });
  await new Promise((resolve) => setImmediate(resolve));

  await assert.rejects(transport.settled(), (error) => error === deliveryError);
  await transport.settled();
  assert.deepEqual(transport.log(), [
    { Kind: "start", ID: 13, Value: "draft" },
    { Kind: "reply", ID: 13, Value: "ok", Error: "" },
  ]);
  transport.dispose();
});

test("decode exceptions and malformed decoder replies become invalid-response replies", async () => {
  for (const decodeHTTP of [
    () => { throw new Error("parser details"); },
    () => ({ ID: 999, Value: "unsafe", Error: "" }),
    () => ({ ID: 12, Value: "unsafe", Error: 5 }),
    () => null,
  ]) {
    const replies = [];
    const transport = createHTTPTransport({
      runtime: makeRuntime({ decodeHTTP }),
      url: "http://example.test/save",
      fetchImpl: async () => response(200, "whatever"),
    });
    transport.start(command(12), (reply) => replies.push(reply));
    await transport.settled();
    assert.deepEqual(replies, [{ ID: 12, Value: "", Error: "invalid response" }]);
    assert.deepEqual(transport.log().at(-1), { Kind: "reply", ID: 12, Value: "", Error: "invalid response" });
    transport.dispose();
  }
});

test("cancel is advisory and fences a late fetch result even when fetch ignores AbortSignal", async () => {
  const pending = deferred();
  let observedSignal;
  let completed = false;
  const replies = [];
  const transport = createHTTPTransport({
    runtime: makeRuntime(),
    url: "http://example.test/save",
    fetchImpl(_url, init) { observedSignal = init.signal; return pending.promise; },
  });

  transport.start(command(21), (reply) => replies.push(reply));
  transport.cancel(21);
  assert.equal(observedSignal.aborted, true);
  let settled = false;
  const waiting = transport.settled().then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, "settled waits while fetch work is unresolved");
  pending.resolve(response(200, '{"ID":21,"Value":"late","Error":""}'));
  await waiting.then(() => { completed = true; });

  assert.equal(completed, true);
  assert.deepEqual(replies, []);
  assert.deepEqual(transport.log(), [
    { Kind: "start", ID: 21, Value: "draft" },
    { Kind: "cancel", ID: 21 },
  ]);
  transport.dispose();
});

test("cancel during response-body reading logs before abort and suppresses decoded completion", async () => {
  const body = deferred();
  const bodyStarted = deferred();
  let transport;
  let eventsAtAbort;
  const replies = [];
  transport = createHTTPTransport({
    runtime: makeRuntime(),
    url: "http://example.test/save",
    fetchImpl: async (_url, init) => {
      init.signal.addEventListener("abort", () => {
        eventsAtAbort = transport.log().map(({ Kind }) => Kind);
      });
      return {
        status: 200,
        text() { bodyStarted.resolve(); return body.promise; },
      };
    },
  });

  transport.start(command(22), (reply) => replies.push(reply));
  await bodyStarted.promise;
  transport.cancel(22);
  assert.deepEqual(eventsAtAbort, ["start", "cancel"]);
  body.resolve('{"ID":22,"Value":"late body","Error":""}');
  await transport.settled();

  assert.deepEqual(replies, []);
  assert.deepEqual(transport.log(), [
    { Kind: "start", ID: 22, Value: "draft" },
    { Kind: "cancel", ID: 22 },
  ]);
  transport.dispose();
});

test("dispose aborts pending requests, suppresses late delivery, and is idempotent", async () => {
  const pending = deferred();
  let observedSignal;
  const replies = [];
  const transport = createHTTPTransport({
    runtime: makeRuntime(),
    url: "http://example.test/save",
    fetchImpl(_url, init) { observedSignal = init.signal; return pending.promise; },
  });

  transport.start(command(31), (reply) => replies.push(reply));
  transport.dispose();
  transport.dispose();
  assert.equal(observedSignal.aborted, true);
  pending.resolve(response(200, '{"ID":31,"Value":"late","Error":""}'));
  await transport.settled();
  assert.deepEqual(replies, []);
  assert.deepEqual(transport.log(), [
    { Kind: "start", ID: 31, Value: "draft" },
    { Kind: "cancel", ID: 31 },
  ]);
  assert.throws(() => transport.start(command(32), () => {}), /dispose/);
});

test("HTTP status is passed to the decoder and response-body read failures are network errors", async () => {
  const seen = [];
  const replies = [];
  const transport = createHTTPTransport({
    runtime: makeRuntime({
      decodeHTTP(id, status, body) {
        seen.push({ id, status, body });
        return { ID: id, Value: "", Error: `http status ${status}` };
      },
    }),
    url: "http://example.test/save",
    fetchImpl: async () => response(503, "maintenance"),
  });
  transport.start(command(41), (reply) => replies.push(reply));
  await transport.settled();
  assert.deepEqual(seen, [{ id: 41, status: 503, body: "maintenance" }]);
  assert.deepEqual(replies, [{ ID: 41, Value: "", Error: "http status 503" }]);
  transport.dispose();

  const bodyReplies = [];
  const bodyFailure = createHTTPTransport({
    runtime: makeRuntime(),
    url: "http://example.test/save",
    fetchImpl: async () => ({ status: 200, async text() { throw new Error("body read failed"); } }),
  });
  bodyFailure.start(command(42), (reply) => bodyReplies.push(reply));
  await bodyFailure.settled();
  assert.deepEqual(bodyReplies, [{ ID: 42, Value: "", Error: "network error" }]);
  bodyFailure.dispose();
});

test("default fetch sends a real HTTP request and decodes the response", async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, contentType: req.headers["content-type"], body });
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ID":51,"Value":"accepted","Error":""}');
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  const replies = [];
  const transport = createHTTPTransport({
    runtime: makeRuntime(),
    url: `http://127.0.0.1:${address.port}/api/save`,
  });

  transport.start(command(51, "send over HTTP"), (reply) => replies.push(reply));
  await transport.settled();

  assert.deepEqual(requests, [{
    method: "POST",
    contentType: "application/json",
    body: '{"ID":51,"Value":"send over HTTP"}',
  }]);
  assert.deepEqual(replies, [{ ID: 51, Value: "accepted", Error: "" }]);
  transport.dispose();
});
