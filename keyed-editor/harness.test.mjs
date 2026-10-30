import assert from "node:assert/strict";
import test from "node:test";
import { createFetchTracker } from "./harness-tracker.mjs";

test("fetch tracker resolves a request waiter only after the response body is consumed", async () => {
  let releaseBody;
  const bodyGate = new Promise((resolve) => { releaseBody = resolve; });
  const tracker = createFetchTracker(async () => ({
    status: 200,
    text: async () => bodyGate,
  }), "http://127.0.0.1:8123/");

  const response = await tracker.fetchImpl("/api/save?lane=probe&mode=success", {
    method: "POST",
    body: JSON.stringify({ ID: 7, Value: "captured" }),
  });
  const reading = response.text();
  let completed = false;
  const waiting = tracker.waitFor(7).then((error) => { completed = true; return error; });
  await Promise.resolve();
  assert.equal(completed, false, "waitFor must remain pending until the body resolves");

  releaseBody('{"ID":7,"Value":"captured","Error":""}');
  assert.equal(await reading, '{"ID":7,"Value":"captured","Error":""}');
  assert.equal(await waiting, null);
  assert.equal(completed, true);
});

test("fetch tracker resolves aborted or failed fetch waiters with the original failure", async () => {
  const tracker = createFetchTracker(async () => {
    throw new Error("aborted by caller");
  }, "http://127.0.0.1:8123/");
  await assert.rejects(tracker.fetchImpl("/api/save?lane=probe&mode=held", {
    method: "POST",
    body: JSON.stringify({ ID: 9, Value: "pending" }),
  }), /aborted by caller/);
  assert.match(await tracker.waitFor(9), /aborted by caller/);
});
