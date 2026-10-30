import test from "node:test";
import assert from "node:assert/strict";
import { createKeyedHost } from "./host.mjs";
import { createManualTransport } from "../async-effects/transport.mjs";

const attr = (Name, Value = "", Flag = false) => ({ Name, Value, Flag, Style: null });
const text = (Text) => ({ Kind: 2, Tag: "", Key: "", Attrs: null, On: null, Kids: null, Text });
const element = (Tag, Key, { Attrs = null, On = null, Kids = null } = {}) => ({
  Kind: 1, Tag, Key, Attrs, On, Kids, Text: "",
});

function fixture(state, messages) {
  return {
    state: { Draft: state.Draft, Saved: state.Saved, PendingID: state.PendingID, Status: state.Status },
    tree: element("div", "collection", {
      Attrs: [attr("class", "collection")],
      Kids: [
        element("input", "draft-input", {
          Attrs: [attr("type", "text"), attr("value", state.Draft), attr("aria-label", "Draft")],
        }),
        element("button", "save", {
          Attrs: [attr("class", "save"), ...(state.Draft === "" ? [attr("disabled", "", true)] : [])],
          On: [{ Event: "click", Message: "save", Arg: "" }],
          Kids: [text("Save")],
        }),
        element("p", "status", { Kids: [text(`Status: ${state.Status}`)] }),
      ],
    }),
    bindings: [{ Path: "0", Event: "input", Message: "edit", Source: "target.value" }],
    messages: messages.map((message) => ({ ...message })),
  };
}

function fakeRuntime() {
  const calls = { init: 0, dispatch: 0, complete: 0, effects: 0, audit: 0 };
  const state = { Draft: "", Saved: "", PendingID: 0, Status: "idle", NextID: 0 };
  const messages = [];
  const outbox = [];
  const outcomes = [];
  const requestRows = new Map();

  function snapshot() { return fixture(state, messages); }
  return {
    calls,
    init() {
      calls.init += 1;
      Object.assign(state, { Draft: "", Saved: "", PendingID: 0, Status: "idle", NextID: 0 });
      messages.splice(0);
      outbox.splice(0);
      outcomes.splice(0);
      requestRows.clear();
      return snapshot();
    },
    dispatch(step) {
      calls.dispatch += 1;
      if (step.Path === "0" && step.Key === "draft-input" && step.Event === "input") {
        state.Draft = step.Value;
        messages.push({ Name: "edit", Arg: step.Value });
      } else if (step.Path === "1" && step.Key === "save" && step.Event === "click" && state.Draft !== "") {
        if (state.PendingID) outbox.push({ Kind: "cancel", ID: state.PendingID });
        state.NextID += 1;
        state.PendingID = state.NextID;
        state.Status = "pending";
        requestRows.set(state.PendingID, 1);
        outbox.push({ Kind: "start", ID: state.PendingID, Value: state.Draft });
        messages.push({ Name: "save", Arg: "" });
      } else {
        throw new Error("invalid dispatch key/path pair");
      }
      return snapshot();
    },
    complete(reply) {
      calls.complete += 1;
      const accepted = state.PendingID === reply.ID;
      messages.push({ Name: "reply", Arg: String(reply.ID) });
      outcomes.push({ ID: reply.ID, RowID: requestRows.get(reply.ID) ?? 0, Accepted: accepted,
        Reason: accepted ? (reply.Error === "" ? "saved" : "error") : "stale" });
      if (accepted) {
        state.PendingID = 0;
        if (reply.Error === "") {
          state.Saved = reply.Value;
          state.Status = "saved";
        } else state.Status = `error: ${reply.Error}`;
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

function fakeRoot() {
  return { clearCount: 0, replaceChildren() { this.clearCount += 1; } };
}

function recordingRenderers(records) {
  function mount(name, root, facade) {
    const initial = facade.init();
    const record = {
      name, root, facade, initial, mounted: true, updates: [], focus: null,
      input(value) {
        const next = facade.dispatch({ Path: "0", Event: "input", Value: value, Key: "draft-input" });
        api.update(next);
        return next;
      },
    };
    const api = {
      update(next) { record.updates.push(next); record.latest = next; },
      snapshot() { return record.latest ?? record.initial; },
      domSnapshot() { return { html: `<${name}>${(record.latest ?? initial).state.Status}</${name}>`, disabled: [] }; },
      focusState() { return record.focus; },
      restoreFocus(state) { record.focus = state; },
      click(path) {
        if (String(path) !== "1") throw new Error("only the save path is clickable in this test renderer");
        const next = facade.dispatch({ Path: "1", Event: "click", Value: "", Key: "save" });
        api.update(next);
        return next;
      },
      unmount() { record.mounted = false; },
    };
    records.push(record);
    return api;
  }
  return {
    dom: (root, facade) => mount("dom", root, facade),
    react: (root, facade) => mount("react", root, facade),
  };
}

test("HTTP completion updates the mounted keyed renderer without a remount or second Go init", async () => {
  const runtime = fakeRuntime();
  const transport = createManualTransport();
  const mounts = [];
  const host = createKeyedHost(fakeRoot(), runtime, recordingRenderers(mounts), transport);
  assert.equal(runtime.calls.init, 1);

  mounts.at(-1).input("draft one");
  await host.flush();
  host.click("1");
  assert.equal(transport.log().length, 0, "effect draining waits until the renderer event returns");
  await host.flush();
  assert.deepEqual(transport.log(), [{ kind: "start", command: { Kind: "start", ID: 1, Value: "draft one" } }]);

  transport.deliver(1, { value: "server value" });
  assert.equal(runtime.calls.complete, 0, "transport callback only queues the Go completion");
  await host.settled();
  assert.equal(host.snapshot().state.Saved, "server value");
  assert.equal(host.snapshot().state.Status, "saved");
  assert.equal(runtime.calls.init, 1);
  assert.equal(mounts.length, 1, "completion preserves renderer and React root identity");
  assert.equal(mounts[0].updates.length, 3, "input, save, and completion all paint their snapshots");
  host.unmount();
});

test("backend replacement transfers key-based selection and fences the old facade", () => {
  const runtime = fakeRuntime();
  const mounts = [];
  const host = createKeyedHost(fakeRoot(), runtime, recordingRenderers(mounts), createManualTransport());
  const oldFacade = mounts[0].facade;
  mounts[0].focus = { key: "draft-input", selectionStart: 2, selectionEnd: 4, selectionDirection: "forward" };
  mounts[0].input("draft");

  host.replaceBackend("react");
  assert.equal(host.backendName(), "react");
  assert.deepEqual(host.focusState(), mounts[1].focus);
  assert.deepEqual(mounts[1].focus, {
    key: "draft-input", selectionStart: 2, selectionEnd: 4, selectionDirection: "forward",
  });
  assert.equal(runtime.calls.init, 1);
  assert.throws(() => oldFacade.dispatch({ Path: "0", Event: "input", Value: "stale", Key: "draft-input" }), /stale renderer/);
  assert.equal(runtime.calls.dispatch, 1, "stale callbacks cannot reach Go");
  assert.deepEqual(host.replaceBackend("react").state, host.snapshot().state, "same-backend replacement is a no-op");
  host.unmount();
});

test("failed replacement cleans the attempted renderer and restores the old backend with focus", () => {
  const runtime = fakeRuntime();
  const mounts = [];
  let failedRendererUnmounted = false;
  const base = recordingRenderers(mounts);
  const host = createKeyedHost(fakeRoot(), runtime, {
    ...base,
    broken: () => { throw new Error("mount exploded"); },
    badRestore(_root, facade) {
      facade.init();
      return {
        update() {},
        snapshot: facade.init,
        domSnapshot: () => ({ html: "", disabled: [] }),
        focusState: () => null,
        restoreFocus() { throw new Error("focus restore exploded"); },
        click() {},
        unmount() { failedRendererUnmounted = true; },
      };
    },
  }, createManualTransport());
  mounts[0].focus = { key: "draft-input", selectionStart: 1, selectionEnd: 3, selectionDirection: "backward" };

  assert.throws(() => host.replaceBackend("broken"), /failed to mount; restored "dom"/);
  assert.equal(host.backendName(), "dom");
  assert.deepEqual(host.focusState(), mounts.at(-1).focus);
  assert.throws(() => host.replaceBackend("badRestore"), /failed to mount; restored "dom"/);
  assert.equal(failedRendererUnmounted, true, "a mounted but failing renderer is unmounted before rollback");
  assert.equal(host.backendName(), "dom");
  assert.deepEqual(host.focusState(), mounts.at(-1).focus);
  assert.equal(runtime.calls.init, 1);
  host.unmount();
});

test("late and duplicate replies are serialized and cannot overwrite the latest save", async () => {
  const runtime = fakeRuntime();
  const transport = createManualTransport();
  const mounts = [];
  const host = createKeyedHost(fakeRoot(), runtime, recordingRenderers(mounts), transport);

  mounts[0].input("first");
  await host.flush();
  host.click("1");
  await host.flush();
  mounts[0].input("second");
  await host.flush();
  host.click("1");
  await host.flush();
  assert.deepEqual(transport.log().filter((event) => event.kind !== "deliver").map((event) => event.kind), [
    "start", "cancel", "start",
  ]);
  assert.equal(host.snapshot().state.PendingID, 2);

  transport.deliver(1, { value: "stale first" });
  await host.settled();
  assert.equal(host.snapshot().state.PendingID, 2);
  assert.equal(host.audit()[0].Reason, "stale");
  transport.deliver(2, { value: "saved second" });
  await host.settled();
  transport.deliver(2, { value: "duplicate second" });
  await host.settled();
  assert.equal(host.snapshot().state.Saved, "saved second");
  assert.deepEqual(host.audit().map((entry) => entry.Reason), ["stale", "saved", "stale"]);
  host.unmount();
});

test("mount and update failures clean up roots and release the runtime lease", async () => {
  const runtime = fakeRuntime();
  const root = fakeRoot();
  const brokenMount = () => { throw new Error("mount exploded"); };
  assert.throws(
    () => createKeyedHost(root, runtime, { broken: brokenMount }, createManualTransport(), "broken"),
    /mount exploded/,
  );
  assert.ok(root.clearCount > 0);
  assert.equal(runtime.calls.init, 1);

  let renderer;
  const renderers = {
    dom(_root, facade) {
      facade.init();
      renderer = {
        update() { throw new Error("paint exploded"); },
        snapshot: facade.init,
        domSnapshot: () => ({ html: "", disabled: [] }),
        focusState: () => null,
        restoreFocus() {},
        click(path) {
          const next = facade.dispatch({ Path: String(path), Event: "click", Value: "", Key: "save" });
          renderer.update(next);
        },
        unmount() { renderer.unmounted = true; },
      };
      return renderer;
    },
  };
  const transport = createManualTransport();
  const host = createKeyedHost(root, runtime, renderers, transport);
  assert.throws(() => host.click("1"), /click failed; host is now unusable/);
  assert.equal(renderer.unmounted, true, "failed renderer is unmounted as part of fencing");
  assert.throws(() => host.snapshot(), /unusable/);
  host.unmount();

  const nextHost = createKeyedHost(root, runtime, recordingRenderers([]), createManualTransport());
  assert.equal(runtime.calls.init, 3, "failed construction and disposed host both release their runtime leases");
  nextHost.unmount();
});

test("native event paint failure fences the host and skips its already queued effect drain", async () => {
  const runtime = fakeRuntime();
  let committedSnapshot;
  const dispatch = runtime.dispatch.bind(runtime);
  runtime.dispatch = (step) => {
    committedSnapshot = dispatch(step);
    return committedSnapshot;
  };
  runtime.effects = () => {
    runtime.calls.effects += 1;
    return [{ Kind: "start", ID: 1, Value: "must not start after paint failure" }];
  };

  const record = { error: null, rendererActive: true, unmounted: false };
  let started = 0;
  let rendererAPI;
  const renderers = {
    react(_root, facade) {
      const initial = facade.init();
      rendererAPI = {
        update() { throw new Error("synthetic React commit failure"); },
        snapshot() { return initial; },
        domSnapshot() { return { html: "", disabled: [] }; },
        focusState() { return null; },
        restoreFocus() {},
        click() {},
        unmount() { record.unmounted = true; },
        // This matches React's browser-event boundary: Go dispatch succeeds,
        // update fails, then the renderer fences locally and reports upstream.
        fireNativeInput() {
          try {
            const next = facade.dispatch({
              Path: "0", Event: "input", Value: "committed draft", Key: "draft-input",
            });
            rendererAPI.update(next);
          } catch (error) {
            record.error = error;
            record.rendererActive = false;
            facade.rendererFailed(error);
          }
        },
      };
      return rendererAPI;
    },
  };
  const host = createKeyedHost(fakeRoot(), runtime, renderers, {
    start() { started += 1; },
    cancel() {},
  }, "react");

  rendererAPI.fireNativeInput();
  assert.equal(record.rendererActive, false, "renderer fences after the update error");
  assert.match(record.error.message, /synthetic React commit failure/);
  assert.equal(committedSnapshot.state.Draft, "committed draft", "a successful Go dispatch is not rolled back");
  assert.throws(() => host.snapshot(), /unusable after a renderer lifecycle failure/);
  await assert.rejects(host.settled(), (error) =>
    error instanceof AggregateError && error.errors.some((item) =>
      /renderer "react" failed while handling an event/.test(item.message)));
  assert.equal(started, 0, "the effect drain queued by dispatch does not start after the renderer reports failure");
  assert.equal(runtime.calls.effects, 0, "Go's outbox is not drained after the paint failure");
  assert.equal(record.unmounted, true, "host cleanup unmounts the failed renderer");
  host.unmount();
});

test("one live host owns the Go runtime object and unmount releases the lease", () => {
  const runtime = fakeRuntime();
  const host = createKeyedHost(fakeRoot(), runtime, recordingRenderers([]), createManualTransport());
  assert.throws(
    () => createKeyedHost(fakeRoot(), runtime, recordingRenderers([]), createManualTransport()),
    /runtime already has a live keyed host/,
  );
  assert.equal(runtime.calls.init, 1, "rejected host never calls init");
  host.unmount();
  const nextHost = createKeyedHost(fakeRoot(), runtime, recordingRenderers([]), createManualTransport());
  assert.equal(runtime.calls.init, 2);
  nextHost.unmount();
});
