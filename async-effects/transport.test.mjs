import test from "node:test";
import assert from "node:assert/strict";
import { createManualTransport, createTimeoutTransport } from "./transport.mjs";

test("manual transport captures the command value and returns defensive logs", () => {
  const transport = createManualTransport();
  const replies = [];
  const command = { Kind: "start", ID: 7, Value: "captured draft" };
  transport.start(command, (reply) => replies.push(reply));
  command.Value = "mutated after start";

  assert.deepEqual(transport.pending(), [{ Kind: "start", ID: 7, Value: "captured draft" }]);
  const reply = transport.deliver(7);
  assert.deepEqual(reply, { ID: 7, Value: "captured draft", Error: "" });
  assert.deepEqual(replies, [reply]);
  reply.Value = "caller mutation";
  assert.deepEqual(transport.log(), [
    { kind: "start", command: { Kind: "start", ID: 7, Value: "captured draft" } },
    { kind: "deliver", reply: { ID: 7, Value: "captured draft", Error: "" } },
  ]);
  assert.deepEqual(transport.pending(), []);
});

test("cancel is advisory; late and duplicate deliveries still reach the callback", () => {
  const transport = createManualTransport({ defaultValue: "fallback" });
  const replies = [];
  transport.start({ Kind: "start", ID: 3, Value: "original" }, (reply) => replies.push(reply));
  transport.cancel(3);

  assert.deepEqual(transport.pending(), [{ Kind: "start", ID: 3, Value: "original" }],
    "a canceled request remains manually deliverable");
  assert.deepEqual(transport.deliver(3, { error: "disk unavailable" }), {
    ID: 3, Value: "fallback", Error: "disk unavailable",
  });
  assert.deepEqual(transport.deliver(3, { value: "duplicate" }), {
    ID: 3, Value: "duplicate", Error: "",
  });
  assert.equal(replies.length, 2);
  assert.deepEqual(transport.log().map((event) => event.kind), ["start", "cancel", "deliver", "deliver"]);
});

test("manual transport rejects malformed commands, options, IDs, and unknown deliveries", () => {
  const transport = createManualTransport();
  assert.throws(() => createManualTransport({ surprise: true }), /unsupported option/);
  assert.throws(() => transport.start({ Kind: "cancel", ID: 1, Value: "x" }, () => {}), /start command/);
  assert.throws(() => transport.start({ Kind: "start", ID: 0, Value: "x" }, () => {}), /positive safe ID/);
  assert.throws(() => transport.start({ Kind: "start", ID: 1, Value: "x" }, null), /delivery callback/);
  assert.throws(() => transport.cancel(1.5), /positive safe ID/);
  assert.throws(() => transport.deliver(1), /unknown request ID/);

  transport.start({ Kind: "start", ID: 1, Value: "one" }, () => {});
  assert.throws(() => transport.start({ Kind: "start", ID: 1, Value: "one" }, () => {}), /more than once/);
  assert.throws(() => transport.deliver(1, { value: 9 }), /must be a string/);
  assert.throws(() => transport.deliver(1, { value: "yes", error: "no" }), /both value and error/);
});

test("timeout transport delivers through a timer and cancellation clears queued work", async () => {
  const transport = createTimeoutTransport({ delayMs: 1, valueForCommand: ({ Value }) => `${Value}!` });
  let reply;
  transport.start({ Kind: "start", ID: 5, Value: "async" }, (value) => { reply = value; });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(reply, { ID: 5, Value: "async!", Error: "" });

  let cancelledReply = false;
  transport.start({ Kind: "start", ID: 6, Value: "cancel" }, () => { cancelledReply = true; });
  transport.cancel(6);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(cancelledReply, false);
});

test("timeout result-provider failures become visible error replies", async () => {
  const transport = createTimeoutTransport({
    delayMs: 1,
    valueForCommand() { throw new Error("local provider broke"); },
  });
  let reply;
  transport.start({ Kind: "start", ID: 9, Value: "draft" }, (value) => { reply = value; });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(reply, {
    ID: 9,
    Value: "",
    Error: "transport failure: local provider broke",
  });
});
