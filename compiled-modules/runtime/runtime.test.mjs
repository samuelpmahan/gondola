import test from "node:test";
import assert from "node:assert/strict";
import { makeValidTestPair, rehashTestDescriptor } from "../abi/test-fixtures.mjs";
import { mountCompiledModulePair } from "./runtime.mjs";

const EFFECTS_TYPE = "[]github.com/samuelpmahan/gondola/gobi.Effect";

class FakeElement {
  constructor(ownerDocument, tag = "div") {
    this.nodeType = 1;
    this.localName = tag;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  contains(node) { return node === this || this.childNodes.some((child) => child.contains?.(node)); }
  replaceChildren(...nodes) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = nodes;
    for (const child of nodes) child.parentNode = this;
  }
  remove() {
    if (this.parentNode) this.parentNode.replaceChildren(...this.parentNode.childNodes.filter((node) => node !== this));
  }
}

function makeDocument() {
  return { createElement(tag) { return new FakeElement(this, tag); } };
}

function makeViewNode(disabled, message, text) {
  return {
    Kind: 1, Tag: "button", Key: "action",
    Attrs: disabled ? [{ Name: "disabled", Value: "", Flag: true, Style: null }] : [],
    On: [{ Event: "click", Message: message, Arg: "" }],
    Kids: [], Text: text,
  };
}

async function sha256(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function prepareSide(side, capabilities) {
  side.appIR.components[0].capabilities = capabilities;
  side.descriptor.capabilities = [...capabilities].sort();
  const appIRPath = side.descriptor.artifacts.find((item) => item.path.endsWith("/app-ir.json")).path;
  const appIRBytes = new TextEncoder().encode(JSON.stringify(side.appIR));
  side.artifactBytes.set(appIRPath, appIRBytes);
  const artifact = side.descriptor.artifacts.find((item) => item.path === appIRPath);
  artifact.bytes = appIRBytes.byteLength;
  artifact.sha256 = await sha256(appIRBytes);
  await rehashTestDescriptor(side.descriptor);
  side.descriptorBytes = new TextEncoder().encode(JSON.stringify(side.descriptor));
  return side;
}

function encodeScalar(value) {
  if (typeof value === "boolean") return { typeId: "bool", kind: "bool", bool: value };
  if (typeof value === "number") {
    const kind = Number.isInteger(value) ? "int" : "float64";
    return { typeId: kind, kind, value };
  }
  return { typeId: "string", kind: "string", string: String(value) };
}

function makeEncoder() {
  return {
    gobiEncodeState(value, typeId) {
      if (typeId === EFFECTS_TYPE) {
        return { typeId, kind: "slice", isNil: false, items: Array.isArray(value) ? value : [] };
      }
      return {
        typeId, kind: "struct",
        fields: Object.keys(value).sort().map((name) => ({ name, value: encodeScalar(value[name]) })),
      };
    },
  };
}

function makeCompiled(side, appIR, initialState, emitEffect) {
  const component = appIR.components[0];
  return {
    schema: "gobi.compiled-module/v1",
    appIR,
    symbols: {
      [component.init]: initialState,
      [component.update](state, message) {
        const next = { ...state };
        if (side === "parent") {
          if (message.Name === "step.up" && next.Step < 3) { next.Step += 1; next.Revision += 1; }
          if (message.Name === "lock.toggle") { next.Locked = !next.Locked; next.Revision += 1; }
        } else {
          if (message.Name === "add" && !next.Locked) next.Count += next.Step;
          if (message.Name === "reset" && next.Count > 0) next.Count = 0;
        }
        const effects = emitEffect ? [{ Kind: "fixture.request", Name: "lookup", Arg: "x", Reply: "done" }] : [];
        return [next, effects];
      },
      [component.view](state) {
        const node = makeViewNode(side === "child" && state.Locked, side === "parent" ? "step.up" : "add",
          side === "parent" ? "step=" + state.Step : "count=" + state.Count);
        return node;
      },
    },
  };
}

async function makeTestModules({ parentCapabilities = ["view.node"], childCapabilities = ["view.node"], emitEffect = false } = {}) {
  const abi = await makeValidTestPair();
  const parentABI = await prepareSide(abi.parent, parentCapabilities);
  const childABI = await prepareSide(abi.child, childCapabilities);
  let parentInitCalls = 0;
  let childInitCalls = 0;
  const parent = {
    module: makeCompiled("parent", parentABI.appIR, () => {
      parentInitCalls += 1;
      return { Step: 1, Locked: false, Revision: 1, Count: 0, PublishedCount: 0, PublishedRevision: 0 };
    }, emitEffect),
    bridges: {
      output(state) { return { Step: state.Step, Locked: state.Locked, Revision: state.Revision }; },
      receive(state, publication) {
        return { ...state, PublishedCount: publication.Count, PublishedRevision: publication.Revision };
      },
    },
    encoder: makeEncoder(),
    descriptor: parentABI.descriptor,
    descriptorBytes: parentABI.descriptorBytes,
    artifactBytes: parentABI.artifactBytes,
    componentId: parentABI.descriptor.componentID,
  };
  const child = {
    module: makeCompiled("child", childABI.appIR, () => {
      childInitCalls += 1;
      return { Step: 1, Locked: false, Revision: 0, Count: 0 };
    }, emitEffect),
    bridges: {
      input(state, input) { return { ...state, Step: input.Step, Locked: input.Locked, Revision: input.Revision }; },
      publication(state) { return { Count: state.Count, Revision: state.Revision }; },
    },
    encoder: makeEncoder(),
    descriptor: childABI.descriptor,
    descriptorBytes: childABI.descriptorBytes,
    artifactBytes: childABI.artifactBytes,
    componentId: childABI.descriptor.componentID,
  };
  return { parent, child, calls: () => ({ parentInitCalls, childInitCalls }) };
}

function rendererRegistry(log) {
  function factory(id) {
    return ({ container }) => {
      log.factories.push(id);
      let view = null;
      let callbacks = null;
      let active = true;
      const renderer = {
        viewCapabilities: ["view.node", "binding.value", "binding.checked"],
        update(nextView, nextCallbacks) { view = nextView; callbacks = nextCallbacks; },
        viewRecord() {
          if (!view) return null;
          return {
            tree: {
              kind: "element", tag: view.Tag, key: view.Key, text: view.Text, kids: [],
              attrs: view.Attrs.map((attr) => ({ name: attr.Name, value: attr.Value, flag: attr.Flag, style: null })),
              on: view.On.map((handler) => ({ event: handler.Event, message: handler.Message, arg: handler.Arg })),
            },
            bindings: [],
          };
        },
        domSnapshot() {
          return { normalization: "outerHTML-v1", html: view ? "<button>" + view.Text + "</button>" : "", controls: [] };
        },
        unmount() { active = false; view = null; },
        get callbacks() { return callbacks; },
        get active() { return active; },
        container,
      };
      log.instances.push(renderer);
      return renderer;
    };
  }
  return { dom: factory("dom"), react: factory("react"), third: factory("third") };
}

function mountOptions(modules, renderers = null, backend = "dom") {
  const doc = makeDocument();
  const container = new FakeElement(doc, "main");
  const log = { factories: [], instances: [] };
  return {
    options: {
      parent: modules.parent, child: modules.child,
      renderers: renderers ?? rendererRegistry(log), backend, container,
    },
    log, container,
  };
}

function stateField(snapshot, name) {
  return snapshot.state.fields.find((field) => field.name === name).value.value;
}

test("invalid ABI pair fails before renderer factories, Go roles, or outer DOM writes", async () => {
  const modules = await makeTestModules();
  const testCase = mountOptions(modules);
  testCase.options.child = {
    ...modules.child,
    descriptor: { ...modules.child.descriptor, packagePath: modules.child.descriptor.packagePath + "-wrong" },
  };
  await assert.rejects(mountCompiledModulePair(testCase.options), /module ABI|descriptor|package|digest/i);
  assert.deepEqual(testCase.log.factories, []);
  assert.equal(testCase.container.childNodes.length, 0);
  assert.deepEqual(modules.calls(), { parentInitCalls: 0, childInitCalls: 0 });
});

test("renderer capability mismatch fails before Go roles and leaves outer DOM untouched", async () => {
  const modules = await makeTestModules({ parentCapabilities: ["view.node", "binding.value"] });
  const calls = [];
  const candidates = [];
  const weak = ({ container }) => {
    calls.push("factory");
    const candidate = {
      viewCapabilities: ["view.node"],
      update() {}, viewRecord() { return null; },
      domSnapshot() { return { normalization: "outerHTML-v1", html: "", controls: [] }; },
      unmountCalls: 0,
      unmount() { this.unmountCalls += 1; throw new Error("cleanup sentinel"); }, container,
    };
    candidates.push(candidate);
    return candidate;
  };
  const testCase = mountOptions(modules, { weak }, "weak");
  await assert.rejects(mountCompiledModulePair(testCase.options), /missing capabilities binding.value/);
  assert.deepEqual(calls, ["factory"]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].unmountCalls, 1);
  assert.equal(testCase.container.childNodes.length, 0);
  assert.deepEqual(modules.calls(), { parentInitCalls: 0, childInitCalls: 0 });
});

test("initial capability failure cleans both rejected and previously accepted candidates", async () => {
  const modules = await makeTestModules({ childCapabilities: ["view.node", "binding.value"] });
  const testCase = mountOptions(modules);
  const candidates = [];
  const factory = ({ container }) => {
    const parentCandidate = candidates.length === 0;
    const candidate = {
      viewCapabilities: parentCandidate ? ["view.node", "binding.value"] : ["view.node"],
      update() {}, viewRecord() { return null; },
      domSnapshot() { return { normalization: "outerHTML-v1", html: "", controls: [] }; },
      unmountCalls: 0,
      unmount() {
        this.unmountCalls += 1;
        if (!parentCandidate) throw new Error("cleanup sentinel");
      },
      container,
    };
    candidates.push(candidate);
    return candidate;
  };
  testCase.options.renderers = { candidate: factory };
  testCase.options.backend = "candidate";
  await assert.rejects(mountCompiledModulePair(testCase.options), /child renderer is missing capabilities binding.value/);
  assert.equal(candidates.length, 2);
  assert.deepEqual(candidates.map((candidate) => candidate.unmountCalls), [1, 1]);
  assert.equal(testCase.container.childNodes.length, 0);
  assert.deepEqual(modules.calls(), { parentInitCalls: 0, childInitCalls: 0 });
});

test("failed swap cleans rejected candidate, preserves the live pair, and keeps the capability error", async () => {
  const modules = await makeTestModules({ parentCapabilities: ["view.node", "binding.value"] });
  const testCase = mountOptions(modules);
  const renderers = rendererRegistry(testCase.log);
  const candidates = [];
  renderers.weak = ({ container }) => {
    const candidate = {
      viewCapabilities: ["view.node"],
      update() {}, viewRecord() { return null; },
      domSnapshot() { return { normalization: "outerHTML-v1", html: "", controls: [] }; },
      unmountCalls: 0,
      unmount() { this.unmountCalls += 1; throw new Error("cleanup sentinel"); },
      container,
    };
    candidates.push(candidate);
    return candidate;
  };
  testCase.options.renderers = renderers;
  const pair = await mountCompiledModulePair(testCase.options);
  const before = pair.snapshot();
  const countsBefore = pair.trace().callCounts;
  const oldRoots = [...testCase.container.childNodes];
  const oldChildCallback = testCase.log.instances[1].callbacks.dispatch;

  assert.throws(() => pair.replaceBackend("weak"), /parent renderer is missing capabilities binding.value/);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].unmountCalls, 1);
  assert.equal(pair.snapshot().backend, "dom");
  assert.deepEqual(pair.snapshot().parent.state, before.parent.state);
  assert.deepEqual(pair.snapshot().child.state, before.child.state);
  assert.deepEqual(testCase.container.childNodes, oldRoots);
  assert.deepEqual(pair.trace().callCounts, countsBefore);

  assert.equal(oldChildCallback({ path: "", event: "click", value: "" }, { Name: "add", Arg: "" }).accepted, true);
  assert.equal(stateField(pair.snapshot().child, "Count"), 1);
  pair.unmount();
});

test("init order, Go-only messages, bridges, disabled suppression, swap, and stale callback fencing", async () => {
  const modules = await makeTestModules();
  const testCase = mountOptions(modules);
  const pair = await mountCompiledModulePair(testCase.options);
  assert.deepEqual(pair.trace().initial.callOrder.map((call) => call.owner + "." + call.role), [
    "parent.Init", "child.Init", "parent.output", "child.input", "child.publication", "parent.receive",
    "parent.View", "child.View",
  ]);
  assert.equal(testCase.container.childNodes.length, 2);
  assert.equal(testCase.container.childNodes[0].getAttribute("data-gobi-module-root"), "parent");
  assert.equal(testCase.container.childNodes[1].getAttribute("data-gobi-module-root"), "child");

  const childRenderer = testCase.log.instances[1];
  const countBeforeMismatch = pair.trace().callCounts.childUpdate;
  const mismatch = pair.dispatchChild({ path: "", event: "click", value: "" }, { Name: "reset", Arg: "" });
  assert.equal(mismatch.accepted, false);
  assert.equal(pair.trace().callCounts.childUpdate, countBeforeMismatch);
  const first = childRenderer.callbacks.dispatch({ path: "", event: "click", value: "" }, { Name: "add", Arg: "" });
  assert.equal(first.accepted, true);
  assert.equal(stateField(pair.snapshot().parent, "PublishedCount"), 1);
  assert.deepEqual(pair.trace().events.at(-1).callOrder.map((call) => call.owner + "." + call.role), [
    "child.Update", "child.publication", "parent.receive", "parent.View", "child.View",
  ]);

  assert.equal(pair.dispatchGoMessage("parent", { Name: "lock.toggle", Arg: "" }).accepted, true);
  const countBeforeDisabledClick = pair.trace().callCounts.childUpdate;
  assert.equal(childRenderer.callbacks.dispatch({ path: "", event: "click", value: "" }, { Name: "add", Arg: "" }).suppressed, true);
  assert.equal(pair.trace().callCounts.childUpdate, countBeforeDisabledClick);
  const recordedDisabled = pair.recordSuppressedAction("child", { path: "", event: "click", value: "" });
  assert.equal(recordedDisabled.accepted, true);
  assert.equal(pair.trace().events.at(-1).kind, "disabled-action");
  assert.deepEqual(pair.trace().events.at(-1).callOrder, []);
  assert.equal(pair.dispatchGoMessage("child", { Name: "add", Arg: "" }).accepted, true);
  assert.equal(stateField(pair.snapshot().child, "Count"), 1);

  const beforeSwap = pair.snapshot();
  const callsBeforeSwap = pair.trace().callCounts;
  const oldCallback = childRenderer.callbacks.dispatch;
  pair.replaceBackend("third");
  assert.deepEqual(pair.snapshot().parent.state, beforeSwap.parent.state);
  assert.deepEqual(pair.snapshot().child.state, beforeSwap.child.state);
  assert.deepEqual(pair.trace().callCounts, callsBeforeSwap);
  assert.equal(oldCallback({ path: "", event: "click", value: "" }, { Name: "add", Arg: "" }).stale, true);
  assert.deepEqual(pair.trace().callCounts, callsBeforeSwap);
  assert.equal(pair.trace().events.at(-1).kind, "stale-callback");
  pair.unmount();
});

test("nonempty Update effects fail closed", async () => {
  const modules = await makeTestModules({ emitEffect: true });
  const testCase = mountOptions(modules);
  const pair = await mountCompiledModulePair(testCase.options);
  const result = testCase.log.instances[1].callbacks.dispatch({ path: "", event: "click", value: "" }, { Name: "add", Arg: "" });
  assert.equal(result.accepted, false);
  assert.match(result.error, /emitted effects/);
  assert.match(pair.failure().message, /emitted effects/);
  pair.unmount();
});

test("admission uses captured metadata, function references, and artifact bytes across async hashing", async () => {
  const modules = await makeTestModules();
  const testCase = mountOptions(modules);
  let capturedInitCalls = 0;
  const initID = modules.parent.componentId + ".Init";
  modules.parent.module.symbols[initID] = () => {
    capturedInitCalls += 1;
    return { Step: 1, Locked: false, Revision: 1, Count: 0, PublishedCount: 0, PublishedRevision: 0 };
  };
  const pending = mountCompiledModulePair(testCase.options);
  modules.parent.descriptor.packagePath = "mutated-after-admission-start";
  modules.parent.module.appIR.components[0].packagePath = "mutated-after-admission-start";
  modules.parent.descriptorBytes.fill(0);
  for (const bytes of modules.parent.artifactBytes.values()) bytes.fill(0);
  await pending;
  assert.equal(capturedInitCalls, 1);
});
