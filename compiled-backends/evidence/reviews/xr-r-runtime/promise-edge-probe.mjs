import assert from "node:assert/strict";
import { mountCompiledApp, RuntimeFailure } from "../../../../compiled-frontend/frontend/runtime/runtime.mjs";

const COMPONENT_ID = "audit.App";
const STATE_TYPE = "audit.State";

function makeRenderer({ update = () => undefined, focusState = () => null, restoreFocus = () => true } = {}) {
  return {
    current: null,
    unmounted: false,
    update(view, callbacks) {
      this.current = view;
      this.callbacks = callbacks;
      return update(view, callbacks);
    },
    viewRecord() {
      return {
        tree: { kind: "element", tag: "div", key: "root", attrs: [], on: [], kids: [], text: this.current?.Text ?? "" },
        bindings: [],
      };
    },
    domSnapshot() {
      return { normalization: "outerHTML-v1", html: this.current ? `<div>${this.current.Text}</div>` : "", controls: [] };
    },
    unmount() {
      this.unmounted = true;
      this.current = null;
    },
    focusState,
    restoreFocus,
  };
}

function makeRuntime(renderer) {
  const module = {
    schema: "gobi.compiled-module/v1",
    appIR: {
      schema: "gobi.app-ir/v1",
      packagePath: "audit",
      components: [{
        id: COMPONENT_ID,
        packagePath: "audit",
        stateType: STATE_TYPE,
        messageType: "audit.Message",
        init: "audit.Init",
        update: "audit.Update",
        view: "audit.View",
        capabilities: ["view.node"],
      }],
    },
    symbols: {
      "audit.Init": () => 0,
      "audit.Update": (state) => [state, []],
      "audit.View": (state) => ({ Kind: 1, Tag: "div", Key: "root", Attrs: [], On: [], Kids: [], Text: String(state) }),
    },
  };
  return mountCompiledApp({
    module,
    componentId: COMPONENT_ID,
    encoder: { gobiEncodeState: (state) => ({ typeId: STATE_TYPE, kind: "integer", int: state }) },
    renderer,
  });
}

const observations = [];
const unhandled = [];
const onUnhandled = (reason) => unhandled.push(reason instanceof Error ? reason.message : String(reason));
process.on("unhandledRejection", onUnhandled);

try {
  let subclassThenCalls = 0;
  class AuditPromise extends Promise {
    then(...args) {
      subclassThenCalls += 1;
      return super.then(...args);
    }
  }

  // Focus capture happens before teardown. The rejected subclass promise must be
  // observed without invoking an overridden `.then`, while the old runtime stays usable.
  const oldCaptureRenderer = makeRenderer({ focusState: () => AuditPromise.reject(new Error("capture rejection")) });
  const captureRuntime = makeRuntime(oldCaptureRenderer);
  const captureTrace = captureRuntime.trace();
  assert.throws(() => captureRuntime.replaceRenderer(makeRenderer()), TypeError);
  assert.equal(oldCaptureRenderer.unmounted, false);
  assert.equal(captureRuntime.failure(), null);
  assert.deepEqual(captureRuntime.trace(), captureTrace);
  assert.doesNotThrow(() => captureRuntime.snapshot());
  captureRuntime.unmount();
  observations.push("rejected Promise subclass from focusState: pre-teardown rejection; old renderer usable; overridden then not called");

  // The same Promise brand guard handles subclasses returned after teardown.
  const oldCommitRenderer = makeRenderer();
  const commitRuntime = makeRuntime(oldCommitRenderer);
  const commitTrace = commitRuntime.trace();
  assert.throws(() => commitRuntime.replaceRenderer(makeRenderer({
    update: () => AuditPromise.reject(new Error("commit rejection")),
  })), RuntimeFailure);
  assert.equal(oldCommitRenderer.unmounted, true);
  assert.notEqual(commitRuntime.failure(), null);
  assert.deepEqual(commitRuntime.trace(), commitTrace);
  observations.push("rejected Promise subclass from update: post-teardown fail-closed RuntimeFailure");

  // A user-defined thenable is rejected synchronously but its then method is never called.
  let customThenCalls = 0;
  const thenableRuntime = makeRuntime(makeRenderer());
  assert.throws(() => thenableRuntime.replaceRenderer(makeRenderer({
    update: () => ({ then() { customThenCalls += 1; } }),
  })), RuntimeFailure);
  assert.equal(customThenCalls, 0);
  observations.push("custom thenable returned by update: fail closed; then method not invoked");

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(unhandled, [], "rejected native Promise and subclass returns must not leak unhandled rejections");
  assert.equal(subclassThenCalls, 0, "native Promise intrinsic bypasses subclass then override");
  observations.push("no unhandled rejection observed on next event-loop turn");
} finally {
  process.off("unhandledRejection", onUnhandled);
}

process.stdout.write(`${JSON.stringify({ observations, unhandled }, null, 2)}\n`);
