import test from "node:test";
import assert from "node:assert/strict";
import { createEffectHost } from "./host.mjs";
import { createManualTransport, createTimeoutTransport } from "./transport.mjs";

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key: "", Attrs, On, Kids, Text: "",
});

function fakeRuntime() {
  const calls = { init: 0, dispatch: 0, complete: 0, effects: 0, audit: 0 };
  const state = { Draft: "", Saved: "", Saves: 0, NextID: 0, PendingID: 0, Status: "idle" };
  const messages = [];
  const outbox = [];
  const outcomes = [];

  function snapshot() {
    return {
      state: { ...state },
      tree: element("div", { Kids: [
        element("input", { Attrs: [attr("type", "text"), attr("value", state.Draft)] }),
        element("p", { Kids: [text(`Saved: ${state.Saved}`)] }),
        element("p", { Kids: [text(`Saves: ${state.Saves}`)] }),
        element("button", {
          Attrs: [attr("class", "save"), ...(state.Draft === "" ? [attr("disabled", "", true)] : [])],
          On: [{ Event: "click", Message: "save", Arg: "" }], Kids: [text("Save")],
        }),
        element("button", { On: [{ Event: "click", Message: "reset", Arg: "" }], Kids: [text("Reset")] }),
        element("button", {
          Attrs: [attr("class", "cancel"), ...(state.PendingID === 0 ? [attr("disabled", "", true)] : [])],
          On: [{ Event: "click", Message: "cancel", Arg: "" }], Kids: [text("Cancel")],
        }),
        element("p", { Kids: [text(`Status: ${state.Status}`)] }),
        element("p", { Kids: [text(`Pending: ${state.PendingID}`)] }),
      ] }),
      bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
      messages: messages.map((message) => ({ ...message })),
    };
  }

  return {
    calls,
    init() {
      calls.init += 1;
      Object.assign(state, { Draft: "", Saved: "", Saves: 0, NextID: 0, PendingID: 0, Status: "idle" });
      messages.splice(0);
      outbox.splice(0);
      outcomes.splice(0);
      return snapshot();
    },
    dispatch(step) {
      calls.dispatch += 1;
      if (step.Path === "0" && step.Event === "input") {
        state.Draft = step.Value;
      } else if (step.Path === "3" && step.Event === "click" && state.Draft !== "") {
        messages.push({ Name: "save", Arg: "" });
        if (state.PendingID !== 0) outbox.push({ Kind: "cancel", ID: state.PendingID });
        state.NextID += 1;
        state.PendingID = state.NextID;
        state.Status = "pending";
        outbox.push({ Kind: "start", ID: state.PendingID, Value: state.Draft });
      } else if (step.Path === "5" && step.Event === "click" && state.PendingID !== 0) {
        messages.push({ Name: "cancel", Arg: "" });
        outbox.push({ Kind: "cancel", ID: state.PendingID });
        state.PendingID = 0;
        state.Status = "cancelled";
      } else if (step.Path === "4" && step.Event === "click") {
        messages.push({ Name: "reset", Arg: "" });
        if (state.PendingID !== 0) outbox.push({ Kind: "cancel", ID: state.PendingID });
        state.Draft = "";
        state.Saved = "";
        state.Saves = 0;
        state.PendingID = 0;
        state.Status = "idle";
      }
      return snapshot();
    },
    complete(reply) {
      calls.complete += 1;
      messages.push({ Name: "reply", Arg: String(reply.ID) });
      const accepted = state.PendingID === reply.ID;
      outcomes.push({
        ID: reply.ID,
        Value: reply.Value,
        Error: reply.Error,
        Accepted: accepted,
        Reason: accepted ? (reply.Error === "" ? "saved" : "error") : "stale",
      });
      if (accepted) {
        state.PendingID = 0;
        if (reply.Error === "") {
          state.Saved = reply.Value;
          state.Saves += 1;
          state.Status = "saved";
        } else {
          state.Status = `error: ${reply.Error}`;
        }
      }
      return snapshot();
    },
    effects() {
      calls.effects += 1;
      return outbox.splice(0);
    },
    audit() {
      calls.audit += 1;
      return outcomes.map((outcome) => ({ ...outcome }));
    },
  };
}

function testRenderers(records) {
  function mount(name, root, runtime) {
    const initial = runtime.init();
    const record = {
      name,
      runtime,
      mounted: true,
      initial,
      fill(value) { return runtime.dispatch({ Path: "0", Event: "input", Value: value }); },
    };
    records.push(record);
    return {
      snapshot: () => runtime.init(),
      domSnapshot: () => ({ html: `<${name}>${runtime.init().state.Status}</${name}>`, disabled: [] }),
      click(path) {
        const normalized = String(path);
        if (normalized === "0") throw new Error("use fill() in this fake renderer");
        return runtime.dispatch({ Path: normalized, Event: "click", Value: "" });
      },
      unmount() { record.mounted = false; },
      root,
    };
  }
  return {
    dom: (root, runtime) => mount("dom", root, runtime),
    react: (root, runtime) => mount("react", root, runtime),
  };
}

function rootElement() {
  return { replaceChildren() { this.cleared = (this.cleared ?? 0) + 1; } };
}

test("effect draining is deferred until after dispatch returns; completion remounts without Go init", async () => {
  const runtime = fakeRuntime();
  const transport = createManualTransport();
  const mounts = [];
  const host = createEffectHost(rootElement(), runtime, testRenderers(mounts), transport);
  assert.equal(runtime.calls.init, 1);

  mounts.at(-1).runtime.dispatch({ Path: "0", Event: "input", Value: "draft" });
  await host.settled();
  const effectsBeforeSave = runtime.calls.effects;
  host.click("3");
  assert.equal(runtime.calls.effects, effectsBeforeSave, "effects do not run inside the renderer event callback");
  assert.equal(transport.log().length, 0, "no transport start occurs on the event handler stack");
  await host.flush();
  assert.deepEqual(transport.log(), [{ kind: "start", command: { Kind: "start", ID: 1, Value: "draft" } }]);

  transport.deliver(1, { value: "server result" });
  assert.equal(runtime.calls.complete, 0, "transport callback only queues Go completion");
  await host.settled();
  assert.equal(host.snapshot().state.Saved, "server result");
  assert.equal(host.audit()[0].Reason, "saved");
  assert.equal(runtime.calls.init, 1, "completion remounts from the cached snapshot");
  assert.equal(mounts.length, 2, "completion remounted the active renderer");
  host.unmount();
});

test("replacement, late replies, duplicate replies, and current replies preserve Go request-ID authority", async () => {
  const runtime = fakeRuntime();
  const transport = createManualTransport();
  const mounts = [];
  const host = createEffectHost(rootElement(), runtime, testRenderers(mounts), transport);

  mounts.at(-1).fill("first");
  await host.settled();
  host.click("3");
  await host.settled();
  mounts.at(-1).fill("second");
  await host.settled();
  host.click("3");
  await host.settled();
  assert.deepEqual(transport.log().map((entry) => entry.kind), ["start", "cancel", "start"]);
  assert.equal(host.snapshot().state.PendingID, 2);

  const late = transport.deliver(1, { value: "stale first" });
  assert.deepEqual(late, { ID: 1, Value: "stale first", Error: "" });
  await host.settled();
  assert.equal(host.snapshot().state.PendingID, 2, "the stale reply cannot clear the current pending ID");
  assert.equal(host.audit()[0].Reason, "stale");

  transport.deliver(2, { value: "saved second" });
  await host.settled();
  assert.equal(host.snapshot().state.Saved, "saved second");
  assert.equal(host.snapshot().state.Saves, 1);

  transport.deliver(2, { value: "duplicate second" });
  await host.settled();
  assert.equal(host.snapshot().state.Saved, "saved second", "a duplicate cannot overwrite the accepted result");
  assert.equal(host.audit().length, 3, "Go keeps stale and duplicate replies observable");
  assert.equal(host.audit()[2].Reason, "stale");
  host.unmount();
});

test("renderer swaps use cached Go snapshots and fence the previous facade", async () => {
  const runtime = fakeRuntime();
  const transport = createManualTransport();
  const mounts = [];
  const host = createEffectHost(rootElement(), runtime, testRenderers(mounts), transport);
  const oldFacade = mounts[0].runtime;
  mounts[0].fill("unsaved draft");
  await host.settled();
  host.replaceBackend("react");
  assert.equal(host.backendName(), "react");
  assert.equal(host.snapshot().state.Draft, "unsaved draft");
  assert.equal(runtime.calls.init, 1);
  assert.throws(() => oldFacade.dispatch({ Path: "0", Event: "input", Value: "stale" }), /stale renderer/);
  assert.equal(runtime.calls.dispatch, 1, "stale callbacks cannot reach Go");
  assert.deepEqual(host.replaceBackend("react").state, host.snapshot().state, "same-backend replacement is a no-op");
  assert.throws(() => host.replaceBackend("missing"), /unknown renderer/);
  assert.equal(host.backendName(), "react");
  host.unmount();
});

test("one runtime object cannot be initialized by a second live host; ownership transfers after unmount", async () => {
  const runtime = fakeRuntime();
  const firstTransport = createManualTransport();
  const firstMounts = [];
  const firstHost = createEffectHost(rootElement(), runtime, testRenderers(firstMounts), firstTransport);
  firstMounts.at(-1).fill("first session request");
  await firstHost.settled();
  firstHost.click("3");
  await firstHost.settled();
  assert.equal(firstHost.snapshot().state.PendingID, 1);

  assert.throws(
    () => createEffectHost(rootElement(), runtime, testRenderers([]), createManualTransport()),
    /runtime already has a live async effect host/,
  );
  assert.equal(runtime.calls.init, 1, "rejected owner never calls runtime.init()");
  assert.equal(firstHost.snapshot().state.PendingID, 1, "rejected owner leaves the current request untouched");

  firstHost.unmount();
  const secondTransport = createManualTransport();
  const secondMounts = [];
  const secondHost = createEffectHost(rootElement(), runtime, testRenderers(secondMounts), secondTransport);
  assert.equal(runtime.calls.init, 2, "ownership transfers after the previous host is disposed");
  secondMounts.at(-1).fill("second session request");
  await secondHost.settled();
  secondHost.click("3");
  await secondHost.settled();
  assert.equal(secondHost.snapshot().state.PendingID, 1, "the new Go session starts its ID sequence fresh");

  const callsBeforeOldReply = { ...runtime.calls };
  firstTransport.deliver(1, { value: "old session reply" });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(runtime.calls, callsBeforeOldReply, "the old callback cannot reach the new Go session");
  assert.equal(secondHost.snapshot().state.PendingID, 1);
  assert.deepEqual(secondHost.audit(), []);

  secondTransport.deliver(1, { value: "new session reply" });
  await secondHost.settled();
  assert.equal(secondHost.snapshot().state.Saved, "new session reply");
  secondHost.unmount();
});

test("failed initial renderer mount releases its runtime lease", () => {
  const runtime = fakeRuntime();
  assert.throws(() => createEffectHost(rootElement(), runtime, {
    broken() { throw new Error("initial mount failed"); },
  }, createManualTransport(), "broken"), /initial mount failed/);
  assert.equal(runtime.calls.init, 1);

  const host = createEffectHost(rootElement(), runtime, testRenderers([]), createManualTransport());
  assert.equal(runtime.calls.init, 2, "a fresh host can own the runtime after failed initial mounting");
  host.unmount();
});

test("failed cleanup still releases runtime ownership and fences old callbacks", async () => {
  const runtime = fakeRuntime();
  const manual = createManualTransport();
  const mounts = [];
  const renderers = testRenderers(mounts);
  const normalDOM = renderers.dom;
  renderers.dom = (root, facade) => {
    const renderer = normalDOM(root, facade);
    renderer.unmount = () => { throw new Error("renderer cleanup failed"); };
    return renderer;
  };
  const failingTransport = {
    start: (...args) => manual.start(...args),
    cancel() { throw new Error("transport cancel failed"); },
  };
  const oldHost = createEffectHost(rootElement(), runtime, renderers, failingTransport);
  mounts.at(-1).fill("still active at teardown");
  await oldHost.settled();
  oldHost.click("3");
  await oldHost.settled();

  assert.throws(() => oldHost.unmount(), /async effect host unmount failed/);
  const newHost = createEffectHost(rootElement(), runtime, testRenderers([]), createManualTransport());
  assert.equal(runtime.calls.init, 2, "lease releases in the cleanup finally path despite both failures");
  const callsAfterNewInit = { ...runtime.calls };
  manual.deliver(1, { value: "must stay in old session" });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(runtime.calls, callsAfterNewInit, "old callback is fenced after failed cleanup");
  assert.equal(newHost.snapshot().state.PendingID, 0);
  newHost.unmount();
});

test("mount-time dispatch is blocked and a failed replacement restores the prior renderer", () => {
  const runtime = fakeRuntime();
  const mounts = [];
  const renderers = testRenderers(mounts);
  let failedFacade;
  renderers.broken = (_root, facade) => {
    failedFacade = facade;
    assert.deepEqual(facade.init().state, {
      Draft: "", Saved: "", Saves: 0, NextID: 0, PendingID: 0, Status: "idle",
    });
    assert.throws(() => facade.dispatch({ Path: "0", Event: "input", Value: "mount" }), /before mount completes/);
    throw new Error("broken mount");
  };
  const host = createEffectHost(rootElement(), runtime, renderers, createManualTransport());

  assert.throws(() => host.replaceBackend("broken"), /failed to mount; restored "dom"/);
  assert.equal(host.backendName(), "dom");
  assert.equal(runtime.calls.dispatch, 0, "mount-time dispatch never reaches Go");
  assert.equal(runtime.calls.init, 1);
  assert.throws(() => failedFacade.dispatch({ Path: "0", Event: "input", Value: "stale" }), /stale renderer/);
  host.unmount();
});

test("a save's queued effect survives an immediate renderer swap in the same Go session", async () => {
  const runtime = fakeRuntime();
  const transport = createManualTransport();
  const mounts = [];
  const host = createEffectHost(rootElement(), runtime, testRenderers(mounts), transport);
  mounts.at(-1).fill("swap before start");
  await host.settled();
  host.click("3");
  const effectsBeforeSwap = runtime.calls.effects;
  host.replaceBackend("react");
  assert.equal(runtime.calls.effects, effectsBeforeSwap, "swap did not drain inside the click callback");
  await host.settled();
  assert.deepEqual(transport.pending(), [{ Kind: "start", ID: 1, Value: "swap before start" }]);
  assert.equal(runtime.calls.init, 1);

  transport.deliver(1, { value: "completed after swap" });
  await host.settled();
  assert.equal(host.backendName(), "react");
  assert.equal(host.snapshot().state.Saved, "completed after swap");
  assert.equal(runtime.calls.init, 1);
  host.unmount();
});

test("unmount before the drain microtask fences the unsent start command", async () => {
  const runtime = fakeRuntime();
  const transport = createManualTransport();
  const mounts = [];
  const host = createEffectHost(rootElement(), runtime, testRenderers(mounts), transport);
  mounts.at(-1).fill("never sent");
  await host.settled();
  host.click("3");
  const callsAtDispatch = { ...runtime.calls };
  host.unmount();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(runtime.calls, callsAtDispatch, "the queued drain does not call Go after unmount");
  assert.deepEqual(transport.log(), [], "the unsent transport command is fenced with the host");
});

test("unmount cancels active transport and fences late callbacks from every Go method", async () => {
  const runtime = fakeRuntime();
  const transport = createManualTransport();
  const mounts = [];
  const host = createEffectHost(rootElement(), runtime, testRenderers(mounts), transport);
  mounts.at(-1).fill("leave pending");
  await host.settled();
  host.click("3");
  await host.settled();
  host.unmount();
  const callsAtUnmount = { ...runtime.calls };
  assert.deepEqual(transport.log().map(({ kind }) => kind), ["start", "cancel"]);
  transport.deliver(1, { value: "too late" });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(runtime.calls, callsAtUnmount, "a callback after unmount makes no Go calls");
  assert.throws(() => host.snapshot(), /disposed/);
  assert.throws(() => host.unmount(), /disposed/);
});

test("unmount remains available after a renderer failure and fences its outstanding reply", async () => {
  const runtime = fakeRuntime();
  const transport = createManualTransport();
  const mounts = [];
  const renderers = testRenderers(mounts);
  const normalDOM = renderers.dom;
  renderers.dom = (root, facade) => {
    const renderer = normalDOM(root, facade);
    const normalClick = renderer.click;
    renderer.click = (path) => {
      const result = normalClick(path);
      if (String(path) === "4") throw new Error("paint failed after reset dispatch");
      return result;
    };
    return renderer;
  };
  const host = createEffectHost(rootElement(), runtime, renderers, transport);
  mounts.at(-1).fill("request remains active");
  await host.settled();
  host.click("3");
  await host.settled();
  assert.deepEqual(transport.log().map(({ kind }) => kind), ["start"]);

  assert.throws(() => host.click("4"), /click failed; host is now unusable/);
  host.unmount();
  const callsAtUnmount = { ...runtime.calls };
  assert.deepEqual(transport.log().map(({ kind }) => kind), ["start", "cancel"]);
  transport.deliver(1, { value: "late after failure" });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(runtime.calls, callsAtUnmount, "failed/disposed host makes no late Go calls");
});

test("the timeout transport exercises a real setTimeout completion path", async () => {
  const runtime = fakeRuntime();
  const transport = createTimeoutTransport({ delayMs: 1, valueForCommand: (command) => `${command.Value} resolved` });
  const mounts = [];
  const host = createEffectHost(rootElement(), runtime, testRenderers(mounts), transport);
  mounts.at(-1).fill("timer");
  await host.settled();
  host.click("3");
  await host.settled();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await host.settled();
  assert.equal(host.snapshot().state.Saved, "timer resolved");
  assert.equal(runtime.calls.complete, 1);
  host.unmount();
});

test("transport start failures reject flush instead of disappearing", async () => {
  const runtime = fakeRuntime();
  const mounts = [];
  const transport = {
    start() { throw new Error("offline"); },
    cancel() {},
  };
  const host = createEffectHost(rootElement(), runtime, testRenderers(mounts), transport);
  mounts.at(-1).fill("will fail");
  await host.settled();
  host.click("3");
  await assert.rejects(host.settled(), /queued work failed/);
  assert.equal(host.snapshot().state.Status, "pending", "transport failure does not rewrite Go-owned state");
  host.unmount();
});

test("a cancellation failure is surfaced without dropping later commands from the same outbox", async () => {
  const runtime = fakeRuntime();
  const normalEffects = runtime.effects;
  let effectCalls = 0;
  runtime.effects = () => {
    const normal = normalEffects();
    effectCalls += 1;
    if (effectCalls === 1) return normal;
    return [
      { Kind: "cancel", ID: 99 },
      { Kind: "start", ID: 1, Value: "still started" },
    ];
  };
  const manual = createManualTransport();
  let cancelCalls = 0;
  const transport = {
    start: (...args) => manual.start(...args),
    cancel(id) {
      cancelCalls += 1;
      if (cancelCalls === 1) throw new Error("cancel adapter failed");
      manual.cancel(id);
    },
  };
  const mounts = [];
  const host = createEffectHost(rootElement(), runtime, testRenderers(mounts), transport);
  mounts.at(-1).fill("ignored by replaced outbox");
  await host.settled();
  host.click("3");
  await assert.rejects(host.settled(), /queued work failed/);
  assert.deepEqual(manual.log(), [{
    kind: "start", command: { Kind: "start", ID: 1, Value: "still started" },
  }], "the start command after a failing cancellation still reaches transport");
  host.unmount();
  assert.equal(cancelCalls, 2, "unmount retries cancel for a request whose first cancel failed");
});
