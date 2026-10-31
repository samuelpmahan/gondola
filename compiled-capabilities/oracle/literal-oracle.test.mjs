import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mountCompiledApp } from "../../compiled-frontend/frontend/runtime/runtime.mjs";

const EXPECTED = JSON.parse(await readFile(new URL("./expectations.json", import.meta.url), "utf8"));
const ID = EXPECTED.component.id;
const REQUIRED_COMPONENT_CAPABILITIES = Object.freeze([...EXPECTED.component.capabilities]);
const REQUIRED_HOST_CAPABILITIES = Object.freeze([...EXPECTED.host.requiredForComponent]);
const REQUIRED_RENDERER_CAPABILITIES = Object.freeze([...EXPECTED.renderer.requiredForComponent]);

function freezeTree(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

freezeTree(EXPECTED);

class GoEffect {
  constructor({ kind, name, arg, reply }) {
    this.Kind = kind;
    this.Name = name;
    this.Arg = arg;
    this.Reply = reply;
    this.__goStructValue = true;
  }

  clone() {}
  __goscriptAssign() {}
}

function makeModule(capabilities = REQUIRED_COMPONENT_CAPABILITIES) {
  const calls = { init: 0, update: 0, view: 0 };
  const component = {
    id: ID,
    packagePath: "example/capability-oracle",
    stateType: "capability-oracle.State",
    messageType: "gobi.Message",
    init: "capability-oracle.Init",
    update: "capability-oracle.Update",
    view: "capability-oracle.View",
    capabilities: [...capabilities],
  };
  const compiled = {
    schema: "gobi.compiled-module/v1",
    appIR: {
      schema: "gobi.app-ir/v1",
      packagePath: component.packagePath,
      components: [component],
      symbols: [],
      types: [],
    },
    symbols: {
      [component.init]() {
        calls.init += 1;
        return { Count: 0, Pending: false, Reply: "" };
      },
      [component.update](previous, message) {
        calls.update += 1;
        const next = { ...previous };
        let effects = [];
        switch (message.Name) {
          case "request":
            next.Pending = true;
            effects = [new GoEffect({
              kind: "fixture.request",
              name: "lookup",
              arg: "capability-oracle:pending-1",
              reply: "complete",
            })];
            break;
          case "cancel":
            effects = [new GoEffect({
              kind: "lifecycle.cancel",
              name: "cancel",
              arg: "capability-oracle:pending-1",
              reply: "",
            })];
            break;
          case "complete":
            next.Pending = false;
            next.Reply = message.Arg;
            break;
          case "increment":
            next.Count += 1;
            break;
          default:
            break;
        }
        return [next, effects];
      },
      [component.view](state) {
        calls.view += 1;
        return { count: state.Count, pending: state.Pending, reply: state.Reply };
      },
    },
  };
  const encoder = {
    gobiEncodeState(state, typeId) {
      return {
        typeId,
        kind: "struct",
        fields: [
          { name: "Count", value: { typeId: "int64", kind: "int", int: String(state.Count) } },
          { name: "Pending", value: { typeId: "bool", kind: "bool", bool: state.Pending } },
          { name: "Reply", value: { typeId: "string", kind: "string", string: state.Reply } },
        ],
      };
    },
  };
  return { compiled, encoder, calls };
}

function makeRenderer({ name = "renderer", viewCapabilities = REQUIRED_RENDERER_CAPABILITIES, capabilityGetter = null } = {}) {
  const calls = { update: 0, unmount: 0, focusState: 0, restoreFocus: 0 };
  let view = { count: 0, pending: false, reply: "" };
  let callbacks = null;
  const renderer = {
    name,
    calls,
    update(rawView, nextCallbacks) {
      calls.update += 1;
      view = structuredClone(rawView);
      callbacks = nextCallbacks;
    },
    viewRecord() {
      return {
        tree: {
          kind: "element",
          tag: "main",
          key: "root",
          text: `count=${view.count};pending=${view.pending};reply=${view.reply}`,
          kids: [],
        },
        bindings: [],
      };
    },
    domSnapshot() {
      return {
        normalization: "outerHTML-v1",
        html: `<main>count=${view.count};pending=${view.pending};reply=${view.reply}</main>`,
        controls: [],
      };
    },
    unmount() {
      calls.unmount += 1;
    },
    fire(messageName) {
      if (!callbacks) throw new Error(`${name} has no mounted callback`);
      return callbacks.dispatch(
        { path: "", event: "click", value: "" },
        { Name: messageName, Arg: "" },
      );
    },
  };
  if (capabilityGetter) {
    Object.defineProperty(renderer, "viewCapabilities", {
      enumerable: true,
      configurable: true,
      get: capabilityGetter,
    });
  } else if (viewCapabilities !== null) {
    Object.defineProperty(renderer, "viewCapabilities", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: viewCapabilities,
    });
  }
  return renderer;
}

function makeHostCapabilities(value, id) {
  if (id === "accessor-host-capability") {
    let reads = 0;
    const list = [];
    Object.defineProperty(list, "0", {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;
        return "effect.request-reply";
      },
    });
    list.length = 1;
    return { list, reads: () => reads };
  }
  if (id === "sparse-host-capabilities") {
    const list = new Array(2);
    list[0] = "effect.request-reply";
    return { list, reads: () => 0 };
  }
  return { list: value, reads: () => 0 };
}

function makeHostMountOptions(module, renderer) {
  return {
    module: module.compiled,
    componentId: ID,
    encoder: module.encoder,
    renderer,
  };
}

function makeRendererCapabilities(value, id) {
  if (id === "accessor-renderer-capability") {
    let reads = 0;
    const list = [];
    Object.defineProperty(list, "0", {
      enumerable: true,
      configurable: true,
      get() {
        reads += 1;
        return "view.node";
      },
    });
    list.length = 1;
    return { list, reads: () => reads };
  }
  if (id === "sparse-renderer-capabilities") {
    const list = new Array(2);
    list[0] = "view.node";
    return { list, reads: () => 0 };
  }
  return { list: value, reads: () => 0 };
}

function mount({
  module = makeModule(),
  renderer = makeRenderer(),
  hostCapabilities,
  omitHostCapabilities = false,
  effectHost = null,
  effectPolicy = null,
} = {}) {
  const options = {
    module: module.compiled,
    componentId: ID,
    encoder: module.encoder,
    renderer,
    effectHost,
    effectPolicy,
  };
  if (!omitHostCapabilities) options.hostCapabilities = hostCapabilities;
  return mountCompiledApp(options);
}

function assertNoInitOrRender(module, renderer) {
  assert.deepEqual(module.calls, { init: 0, update: 0, view: 0 });
  assert.equal(renderer.calls.update, 0);
}

function sorted(values) {
  return [...values].sort();
}

test("literal capability contract separates host effect semantics from renderer view and binding support", () => {
  assert.equal(EXPECTED.schema, "gobi.capability-oracle/v1");
  assert.deepEqual(sorted(EXPECTED.host.knownCapabilities), ["effect.cancel", "effect.request-reply"]);
  assert.deepEqual(sorted(EXPECTED.host.legacyDefault), ["effect.request-reply"]);
  assert.deepEqual(sorted(EXPECTED.renderer.knownCapabilities), ["binding.checked", "binding.value", "view.node"]);
  assert.deepEqual(sorted(REQUIRED_COMPONENT_CAPABILITIES), [
    "binding.checked", "binding.value", "effect.cancel", "effect.request-reply", "view.node",
  ]);
  assert.equal(EXPECTED.renderer.knownCapabilities.includes("effect.cancel"), false,
    "a renderer's view profile cannot claim cancellation of Go effects");
  assert.equal(EXPECTED.swap.expectedRendererNames.join("/"), "react/dom");
});

test("missing component host or renderer support rejects mount before Init or rendering", () => {
  for (const scenario of EXPECTED.admission.rejectBeforeInitOrRender) {
    const module = makeModule();
    const noRendererProfile = scenario.rendererCapabilities === null;
    const renderer = makeRenderer({
      viewCapabilities: noRendererProfile
        ? null
        : (scenario.rendererCapabilities ?? REQUIRED_RENDERER_CAPABILITIES),
    });
    const options = { module, renderer, omitHostCapabilities: scenario.hostCapabilities === null };
    if (scenario.hostCapabilities !== null) options.hostCapabilities = scenario.hostCapabilities;
    assert.throws(() => mount(options), undefined, scenario.id);
    assertNoInitOrRender(module, renderer);
  }
});

test("host capability declarations reject unknown, malformed, sparse, duplicate, and accessor entries without evaluating getters", () => {
  const invalid = EXPECTED.admission.strictHostDeclarations;
  for (const scenario of invalid) {
    const module = makeModule();
    const renderer = makeRenderer();
    const built = makeHostCapabilities(scenario.value, scenario.id);
    let propertyGetterReads = 0;
    if (scenario.id === "accessor-host-capabilities-property") {
      const options = makeHostMountOptions(module, renderer);
      Object.defineProperty(options, "hostCapabilities", {
        enumerable: true,
        get() {
          propertyGetterReads += 1;
          return REQUIRED_HOST_CAPABILITIES;
        },
      });
      assert.throws(() => mountCompiledApp(options), undefined, scenario.id);
    } else {
      assert.throws(() => mount({ module, renderer, hostCapabilities: built.list }), undefined, scenario.id);
    }
    assert.equal(built.reads(), 0, `${scenario.id} must be rejected without invoking an accessor`);
    assert.equal(propertyGetterReads, 0, `${scenario.id} must be rejected without invoking the host profile getter`);
    assertNoInitOrRender(module, renderer);
  }
});

test("renderer capability declarations reject unknown, malformed, sparse, duplicate, and accessor entries without evaluating getters", () => {
  for (const scenario of EXPECTED.admission.strictRendererDeclarations) {
    const module = makeModule();
    const built = makeRendererCapabilities(scenario.value, scenario.id);
    let getterReads = 0;
    const renderer = scenario.id === "accessor-renderer-capabilities-property"
      ? makeRenderer({
        viewCapabilities: null,
        capabilityGetter() {
          getterReads += 1;
          return REQUIRED_RENDERER_CAPABILITIES;
        },
      })
      : makeRenderer({ viewCapabilities: built.list });
    assert.throws(() => mount({ module, renderer, hostCapabilities: REQUIRED_HOST_CAPABILITIES }), undefined, scenario.id);
    assert.equal(built.reads(), 0, `${scenario.id} must be rejected without invoking an array accessor`);
    assert.equal(getterReads, 0, `${scenario.id} must be rejected without invoking the profile getter`);
    assertNoInitOrRender(module, renderer);
  }
});

test("legacy implicit host and profile-less renderer remain admitted for an app without effect.cancel", () => {
  const module = makeModule(["view.node", "effect.request-reply"]);
  const renderer = makeRenderer({ viewCapabilities: null });
  const runtime = mount({ module, renderer, omitHostCapabilities: true });
  assert.deepEqual(module.calls, { init: 1, update: 0, view: 1 });
  assert.equal(renderer.calls.update, 1);
  assert.equal(runtime.snapshot().state.typeId, "capability-oracle.State");
  runtime.unmount();
});

test("lifecycle.cancel requires both the component and host declarations before optional policy validation", () => {
  const module = makeModule(["view.node", "effect.request-reply"]);
  const renderer = makeRenderer({ viewCapabilities: REQUIRED_RENDERER_CAPABILITIES });
  let policyCalls = 0;
  const hostRequests = [];
  const runtime = mount({
    module,
    renderer,
    hostCapabilities: REQUIRED_HOST_CAPABILITIES,
    effectHost: { request(request) { hostRequests.push(request); } },
    effectPolicy(effect) {
      policyCalls += 1;
      assert.equal(effect.kind, "lifecycle.cancel");
      return undefined;
    },
  });
  const result = renderer.fire("cancel");
  assert.equal(result.accepted, false);
  assert.equal(policyCalls, 0, "policy cannot supply the missing component declaration");
  assert.deepEqual(hostRequests, []);
  runtime.unmount();

  const admittedModule = makeModule();
  const admittedRenderer = makeRenderer({ viewCapabilities: REQUIRED_RENDERER_CAPABILITIES });
  let admittedPolicyCalls = 0;
  const admittedRequests = [];
  const admittedRuntime = mount({
    module: admittedModule,
    renderer: admittedRenderer,
    hostCapabilities: REQUIRED_HOST_CAPABILITIES,
    effectHost: { request(request) { admittedRequests.push(request); } },
    effectPolicy(effect) {
      admittedPolicyCalls += 1;
      assert.deepEqual(effect, {
        kind: "lifecycle.cancel",
        name: "cancel",
        arg: "capability-oracle:pending-1",
        reply: "",
      });
      return undefined;
    },
  });
  assert.equal(admittedRenderer.fire("cancel").accepted, true);
  assert.equal(admittedPolicyCalls, 1);
  assert.equal(admittedRequests.length, 1);
  assert.deepEqual(admittedRequests[0].effect, {
    kind: "lifecycle.cancel",
    name: "cancel",
    arg: "capability-oracle:pending-1",
    reply: "",
  });
  admittedRuntime.unmount();
});

test("incompatible renderer rejection preserves state, tree, DOM, pending work, and old callbacks before a compatible swap", () => {
  const module = makeModule();
  const oldRenderer = makeRenderer({ name: "old", viewCapabilities: REQUIRED_RENDERER_CAPABILITIES });
  let deliverPending = null;
  const requests = [];
  const effectHost = {
    request(request, deliver) {
      requests.push(structuredClone(request));
      deliverPending = deliver;
    },
  };
  const runtime = mount({
    module,
    renderer: oldRenderer,
    hostCapabilities: REQUIRED_HOST_CAPABILITIES,
    effectHost,
  });
  assert.equal(oldRenderer.fire("request").accepted, true);
  assert.deepEqual(requests[0], EXPECTED.swap.pendingRequest);
  assert.deepEqual(runtime.effectDiagnostics().pending, [
    { dispatchId: "dispatch-0001", effectIndex: 0, queued: false },
  ]);

  const beforeRejectedSwap = runtime.snapshot();
  assert.deepEqual(beforeRejectedSwap, EXPECTED.swap.pendingSnapshot,
    "the pending Go state, literal view and DOM are checked against fixed expectations");
  const incompatible = makeRenderer({
    name: "incompatible",
    viewCapabilities: EXPECTED.swap.incompatibleRendererCapabilities,
  });
  assert.throws(() => runtime.replaceRenderer(incompatible));
  assert.deepEqual(runtime.snapshot(), beforeRejectedSwap);
  assert.deepEqual(runtime.effectDiagnostics().pending, [
    { dispatchId: "dispatch-0001", effectIndex: 0, queued: false },
  ]);
  assert.equal(oldRenderer.calls.unmount, 0);
  assert.equal(incompatible.calls.update, 0);
  assert.equal(incompatible.calls.unmount, 0);
  const rejection = runtime.rendererDiagnostics().replacements.at(-1);
  assert.equal(rejection.outcome, "rejected");
  assert.equal(rejection.oldUnmounted, false);
  assert.equal(runtime.rendererDiagnostics().currentGeneration, 1,
    "the rejected candidate cannot retire or replace the old renderer lease");

  const oldCallbackResult = oldRenderer.fire("increment");
  assert.equal(oldCallbackResult.accepted, true, "the active callback on the old renderer remains callable after rejection");
  assert.deepEqual(runtime.snapshot(), EXPECTED.swap.afterOldCallbackSnapshot,
    "the surviving old callback executes against the still-mounted Go state and tree");
  assert.equal(runtime.effectDiagnostics().pending.length, 1);

  const beforeCompatibleSwap = runtime.snapshot();
  const compatible = makeRenderer({
    name: "compatible",
    viewCapabilities: EXPECTED.swap.compatibleRendererCapabilities,
  });
  const afterCompatibleSwap = runtime.replaceRenderer(compatible);
  assert.deepEqual(afterCompatibleSwap, beforeCompatibleSwap);
  assert.deepEqual(runtime.snapshot(), beforeCompatibleSwap);
  assert.equal(oldRenderer.calls.unmount, 1);
  assert.equal(compatible.calls.update, 1);
  assert.equal(runtime.effectDiagnostics().pending.length, 1);
  const oldCallbackAfterCommit = oldRenderer.fire("increment");
  assert.equal(oldCallbackAfterCommit.accepted, false);
  assert.equal(oldCallbackAfterCommit.stale, true);
  assert.deepEqual(runtime.snapshot(), beforeCompatibleSwap);
  assert.equal(compatible.fire("increment").accepted, true);

  assert.equal(typeof deliverPending, "function");
  const completionResult = deliverPending({
    dispatchId: "dispatch-0001",
    effectIndex: 0,
    message: { name: "complete", arg: "reply-live" },
  });
  assert.equal(completionResult.accepted, true, "the outstanding completion survives rejection and a compatible swap");
  assert.equal(runtime.effectDiagnostics().pending.length, 0);
  assert.equal(runtime.snapshot().state.fields[1].value.bool, false);
  assert.equal(runtime.snapshot().state.fields[2].value.string, "reply-live");
  runtime.unmount();
});

test("mutation controls detect a missing renderer requirement and any change to preserved snapshots", () => {
  const expectedPreservation = EXPECTED.swap.preservedAfterRejectedSwap;
  assert.ok(expectedPreservation.includes("dom"));
  assert.ok(expectedPreservation.includes("pendingEffect"));
  const before = {
    state: { count: 1, pending: true },
    view: { text: "count=1;pending=true" },
    dom: { html: "<main>count=1;pending=true</main>" },
    pendingEffect: EXPECTED.swap.pendingRequest,
  };
  const unchanged = structuredClone(before);
  assert.deepEqual(unchanged, before);
  const changedDOM = structuredClone(before);
  changedDOM.dom.html = "<main>count=1;pending=false</main>";
  assert.throws(() => assert.deepEqual(changedDOM, before));
  const changedPendingRequest = structuredClone(before);
  changedPendingRequest.pendingEffect.effect.arg = "lost-during-swap";
  assert.throws(() => assert.deepEqual(changedPendingRequest, before));
});
