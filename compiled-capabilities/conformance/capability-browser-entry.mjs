import { mountCompiledApp } from "../../compiled-frontend/frontend/runtime/runtime.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { mountLifecycleApp } from "../../compiled-lifecycle/runtime/runtime.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertSame(expected, actual, message) {
  if (!same(expected, actual)) throw new Error(`${message}: values differ`);
}

const VIEW_CAPABILITIES_MISSING = Symbol("view-capabilities-missing");
const HOST_CAPABILITIES_OPTION_GETTER = Symbol("host-capabilities-option-getter");

function instrumentModule(source, componentCapabilities = null) {
  const original = source.appIR.components[0];
  const component = componentCapabilities === null
    ? original
    : { ...original, capabilities: [...componentCapabilities] };
  const appIR = component === original
    ? source.appIR
    : { ...source.appIR, components: source.appIR.components.map((item) => item.id === original.id ? component : item) };
  const calls = { init: 0, update: 0, view: 0 };
  const symbols = { ...source.symbols };
  for (const [role, id] of [["init", component.init], ["update", component.update], ["view", component.view]]) {
    const originalFunction = source.symbols[id];
    symbols[id] = (...args) => {
      calls[role] += 1;
      return originalFunction(...args);
    };
  }
  return { module: { ...source, appIR, symbols }, calls, component };
}

function instrumentRenderer(core, { capabilities = core.viewCapabilities, propertyGetter = false } = {}) {
  const calls = { update: 0, viewRecord: 0, domSnapshot: 0, unmount: 0, focusState: 0, restoreFocus: 0 };
  let capabilityGetterCalls = 0;
  const renderer = {
    update(...args) { calls.update += 1; return core.update(...args); },
    viewRecord(...args) { calls.viewRecord += 1; return core.viewRecord(...args); },
    domSnapshot(...args) { calls.domSnapshot += 1; return core.domSnapshot(...args); },
    unmount(...args) { calls.unmount += 1; return core.unmount(...args); },
    focusState(...args) { calls.focusState += 1; return core.focusState?.(...args) ?? null; },
    restoreFocus(...args) { calls.restoreFocus += 1; return core.restoreFocus?.(...args) ?? false; },
  };
  if (capabilities !== VIEW_CAPABILITIES_MISSING) {
    if (propertyGetter) {
      Object.defineProperty(renderer, "viewCapabilities", {
        enumerable: true,
        configurable: true,
        get() {
          capabilityGetterCalls += 1;
          return capabilities;
        },
      });
    } else {
      renderer.viewCapabilities = capabilities;
    }
  }
  return { renderer, calls, capabilityGetterCalls: () => capabilityGetterCalls };
}

function watchedHostCapabilities(testCase, getterCounter) {
  const value = testCase.value;
  if (value === "accessor-at-index-zero") {
    const capabilities = ["effect.request-reply", "effect.cancel"];
    Object.defineProperty(capabilities, "0", {
      enumerable: true,
      configurable: false,
      get() {
        getterCounter.calls += 1;
        return "effect.request-reply";
      },
    });
    return capabilities;
  }
  if (testCase.id === "sparse-host-capabilities") {
    const capabilities = [];
    capabilities.length = 2;
    capabilities[0] = "effect.request-reply";
    return capabilities;
  }
  if (testCase.id === "accessor-host-capabilities-property") return HOST_CAPABILITIES_OPTION_GETTER;
  return value;
}

function watchedRendererCapabilities(testCase, getterCounter) {
  const value = testCase.value;
  if (value === "accessor-at-index-zero") {
    const capabilities = ["view.node", "binding.value", "binding.checked"];
    Object.defineProperty(capabilities, "0", {
      enumerable: true,
      configurable: false,
      get() {
        getterCounter.calls += 1;
        return "view.node";
      },
    });
    return { capabilities };
  }
  if (value === "getter-property") {
    return { capabilities: ["view.node", "binding.value", "binding.checked"], propertyGetter: true };
  }
  if (testCase.id === "sparse-renderer-capabilities") {
    const capabilities = [];
    capabilities.length = 2;
    capabilities[0] = "view.node";
    return { capabilities };
  }
  return { capabilities: value };
}

function viewCapabilitiesFrom(component, known) {
  return component.capabilities.filter((capability) => known.includes(capability));
}

function rendererFactory(container, backend, options = {}) {
  const core = backend === "react" ? createReactRenderer({ container }) : createDOMRenderer({ container });
  return instrumentRenderer(core, options);
}

function rejectedAttempt({ id, module, encoder, container, hostCapabilities, hostOmitted = false,
  rendererCapabilities = null, rendererProfileMissing = false, rendererPropertyGetter = false,
  optionGetterCounter = { calls: 0 }, optionGetterValue = [] }) {
  const watched = instrumentModule(module);
  const core = createDOMRenderer({ container });
  const rendererWatch = instrumentRenderer(core, {
    capabilities: rendererProfileMissing ? VIEW_CAPABILITIES_MISSING : rendererCapabilities,
    propertyGetter: rendererPropertyGetter,
  });
  const descriptorGetter = { calls: 0 };
  let error = null;
  let mounted = null;
  const options = {
    module: watched.module,
    componentId: watched.component.id,
    appId: watched.component.id,
    encoder: { gobiEncodeState: encoder.gobiEncodeState },
    renderer: rendererWatch.renderer,
    effectHost: { request() {} },
    effectPolicy() {},
    onFailure() {},
  };
  if (!hostOmitted) {
    if (hostCapabilities === HOST_CAPABILITIES_OPTION_GETTER) {
      Object.defineProperty(options, "hostCapabilities", {
        enumerable: true,
        configurable: true,
        get() {
          optionGetterCounter.calls += 1;
          return optionGetterValue;
        },
      });
    } else {
      options.hostCapabilities = hostCapabilities;
    }
  }
  const hostOptionDescriptor = Object.getOwnPropertyDescriptor(options, "hostCapabilities");
  const optionAccessorConstructed = Boolean(hostOptionDescriptor && typeof hostOptionDescriptor.get === "function" &&
    !Object.hasOwn(hostOptionDescriptor, "value"));
  try {
    mounted = mountCompiledApp(options);
  } catch (caught) {
    error = caught;
  }
  if (mounted?.unmount) mounted.unmount();
  const methodCalls = Object.values(rendererWatch.calls).reduce((sum, count) => sum + count, 0);
  return {
    id,
    rejected: error instanceof TypeError,
    errorName: error?.name ?? null,
    initCalls: watched.calls.init,
    updateCalls: watched.calls.update,
    viewCalls: watched.calls.view,
    rendererCalls: methodCalls,
    rendererCapabilityGetterCalls: rendererWatch.capabilityGetterCalls(),
    descriptorGetterCalls: descriptorGetter.calls,
    optionAccessorConstructed,
    optionGetterCalls: optionGetterCounter.calls,
    containerEmpty: container.childNodes.length === 0,
  };
}

function makeAdmissions({ gobiCompiled, encoder, fixture, expectations, container }) {
  const expectedComponentCapabilities = expectations.component.capabilities;
  const expectationModule = instrumentModule(gobiCompiled, expectedComponentCapabilities).module;
  const fullHost = expectations.host.requiredForComponent;
  const fullRenderer = expectations.renderer.requiredForComponent;
  const admissions = [];

  for (const testCase of expectations.admission.rejectBeforeInitOrRender) {
    const hostOmitted = Object.hasOwn(testCase, "hostCapabilities") && testCase.hostCapabilities === null;
    const rendererProfileMissing = Object.hasOwn(testCase, "rendererCapabilities") && testCase.rendererCapabilities === null;
    const row = rejectedAttempt({
      id: testCase.id,
      module: expectationModule,
      encoder,
      container,
      hostOmitted,
      hostCapabilities: hostOmitted ? undefined : (Object.hasOwn(testCase, "hostCapabilities") ? testCase.hostCapabilities : fullHost),
      optionGetterValue: fullHost,
      rendererProfileMissing,
      rendererCapabilities: rendererProfileMissing ? undefined : testCase.rendererCapabilities ?? fullRenderer,
    });
    admissions.push(row);
  }

  const hostDescriptorCases = [];
  for (const testCase of expectations.admission.strictHostDeclarations) {
    const getterCounter = { calls: 0 };
    const hostCapabilities = watchedHostCapabilities(testCase, getterCounter);
    const row = rejectedAttempt({
      id: testCase.id,
      module: expectationModule,
      encoder,
      container,
      hostCapabilities,
      rendererCapabilities: fullRenderer,
      optionGetterCounter: getterCounter,
      optionGetterValue: fullHost,
    });
    row.descriptorGetterCalls = getterCounter.calls;
    row.optionGetterCalls = getterCounter.calls;
    hostDescriptorCases.push(row);
  }

  const rendererDescriptorCases = [];
  for (const testCase of expectations.admission.strictRendererDeclarations) {
    const getterCounter = { calls: 0 };
    const descriptor = watchedRendererCapabilities(testCase, getterCounter);
    const row = rejectedAttempt({
      id: testCase.id,
      module: expectationModule,
      encoder,
      container,
      hostCapabilities: fullHost,
      rendererCapabilities: descriptor.capabilities,
      rendererProfileMissing: descriptor.capabilities === VIEW_CAPABILITIES_MISSING,
      rendererPropertyGetter: descriptor.propertyGetter === true,
    });
    row.descriptorGetterCalls = getterCounter.calls;
    rendererDescriptorCases.push(row);
  }

  return { admissions, hostDescriptorCases, rendererDescriptorCases };
}

function click(container, selector, label) {
  const target = container.querySelector(selector);
  assert(target, `${label} physical target is missing`);
  const before = { disabled: target.disabled === true, connected: target.isConnected, value: target.value ?? "" };
  assert(before.connected, `${label} target is detached`);
  assert(!before.disabled, `${label} target is disabled`);
  target.click();
  return { before, afterConnected: target.isConnected };
}

function requiredPreservation(keys, before, after) {
  const checks = {
    state: same(before.snapshot.state, after.snapshot.state),
    view: same(before.snapshot.view, after.snapshot.view),
    dom: same(before.snapshot.dom, after.snapshot.dom),
    pendingEffect: same(before.pending, after.pending),
    oldRendererLease: before.diagnostics.currentGeneration === after.diagnostics.currentGeneration,
  };
  return { expected: [...keys], observed: keys.filter((key) => checks[key] === true), checks };
}

function snapshotActive(runtime, effects) {
  return {
    snapshot: clone(runtime.snapshot()),
    pending: clone(effects.pending()),
    diagnostics: clone(runtime.rendererDiagnostics()),
  };
}

function runActualSwap({ gobiCompiled, encoder, fixture, expectations, container }) {
  const component = gobiCompiled.appIR.components.find((item) => item.id === fixture.componentID);
  assert(component, "compiled lifecycle AppIR component is missing");
  assert(component.capabilities.includes("effect.cancel"), "compiled lifecycle AppIR does not declare effect.cancel");
  const domInstrument = rendererFactory(container, "dom");
  const callbackBatches = [];
  const domCore = domInstrument.renderer;
  const domRenderer = {
    viewCapabilities: domCore.viewCapabilities,
    update(view, callbacks) {
      callbackBatches.push(callbacks);
      return domCore.update(view, callbacks);
    },
    viewRecord: (...args) => domCore.viewRecord(...args),
    domSnapshot: (...args) => domCore.domSnapshot(...args),
    unmount: (...args) => domCore.unmount(...args),
    focusState: (...args) => domCore.focusState?.(...args) ?? null,
    restoreFocus: (...args) => domCore.restoreFocus?.(...args) ?? false,
  };
  const mounted = mountLifecycleApp({
    module: gobiCompiled,
    componentId: component.id,
    appId: fixture.componentID,
    encoder: { gobiEncodeState: encoder.gobiEncodeState },
    renderer: domRenderer,
    onFailure(failure) { throw new Error(`capability active profile failed: ${failure.message}`); },
  });
  const { runtime, effects } = mounted;
  assert(runtime.trace().ticks.length === 1, "active profile must emit exactly one initial Go tick");
  const eventOrder = ["init"];

  click(container, ".lifecycle-parent .lifecycle-add", "parent Add");
  eventOrder.push("click-add-parent");
  assert(runtime.trace().ticks.length === 2, "parent Add must produce one Go tick");
  click(container, ".lifecycle-parent .lifecycle-request", "parent Request");
  eventOrder.push("click-request-parent");
  assert(runtime.trace().ticks.length === 3, "parent Request must produce one Go tick");
  const disabledRequest = container.querySelector(".lifecycle-parent .lifecycle-request");
  assert(disabledRequest?.disabled === true, "parent Request button must be disabled after its request");
  const ticksBeforeDisabledClick = runtime.trace().ticks.length;
  disabledRequest.click();
  assert(runtime.trace().ticks.length === ticksBeforeDisabledClick,
    "a physical click on the disabled Request button must not dispatch a Go tick");
  const disabledClick = {
    attempted: true,
    targetDisabled: disabledRequest.disabled,
    beforeTicks: ticksBeforeDisabledClick,
    afterTicks: runtime.trace().ticks.length,
  };
  eventOrder.push("disabled-request-click-suppressed");

  const requestRecord = effects.records().find((item) => item.kind === "request" && item.token === "parent:g1:r1");
  assert(requestRecord, "actual GoScript request did not queue parent:g1:r1");
  const oldRoot = container.firstElementChild;
  const oldCallbacks = callbackBatches.at(-1);
  assert(oldCallbacks && typeof oldCallbacks.dispatch === "function", "active DOM renderer callbacks were not retained");
  const beforeRejected = snapshotActive(runtime, effects);
  const beforeHTML = container.innerHTML;

  const requiredRendererCapabilities = viewCapabilitiesFrom(component, expectations.renderer.knownCapabilities);
  assert(requiredRendererCapabilities.length > 0, "compiled lifecycle AppIR has no view capability requirement");
  const missingCapability = requiredRendererCapabilities.at(-1);
  const incompatibleCapabilities = requiredRendererCapabilities.filter((item) => item !== missingCapability);
  const candidateCalls = { update: 0, viewRecord: 0, domSnapshot: 0, unmount: 0, focusState: 0, restoreFocus: 0 };
  const candidateCore = createReactRenderer({ container });
  const incompatibleCandidate = {
    viewCapabilities: incompatibleCapabilities,
    update(...args) { candidateCalls.update += 1; return candidateCore.update(...args); },
    viewRecord(...args) { candidateCalls.viewRecord += 1; return candidateCore.viewRecord(...args); },
    domSnapshot(...args) { candidateCalls.domSnapshot += 1; return candidateCore.domSnapshot(...args); },
    unmount(...args) { candidateCalls.unmount += 1; return candidateCore.unmount(...args); },
    focusState(...args) { candidateCalls.focusState += 1; return candidateCore.focusState?.(...args) ?? null; },
    restoreFocus(...args) { candidateCalls.restoreFocus += 1; return candidateCore.restoreFocus?.(...args) ?? false; },
  };
  let rejectedError = null;
  try {
    runtime.replaceRenderer(incompatibleCandidate);
  } catch (error) {
    rejectedError = error;
  }
  eventOrder.push("reject-incompatible-renderer");
  assert(rejectedError instanceof TypeError, "incompatible renderer swap must throw TypeError");
  assertSame([0, 0, 0, 0, 0, 0], Object.values(candidateCalls), "rejected renderer candidate method calls");
  const afterRejected = snapshotActive(runtime, effects, callbackBatches.at(-1));
  const rejectedDiagnostic = afterRejected.diagnostics.replacements.at(-1);
  assert(rejectedDiagnostic?.phase === "admission" && rejectedDiagnostic.oldUnmounted === false &&
    rejectedDiagnostic.toGeneration === null, "rejected swap diagnostic must report admission before old unmount");
  assert(container.firstElementChild === oldRoot && oldRoot?.isConnected, "rejected swap must leave the old DOM root active");
  assert(container.innerHTML === beforeHTML, "rejected swap must preserve physical DOM before the next user action");
  const rejectedPreservation = requiredPreservation(
    expectations.swap.preservedAfterRejectedSwap,
    beforeRejected,
    afterRejected,
  );

  const ticksBeforeActiveClick = runtime.trace().ticks.length;
  const oldClickBefore = {
    ticks: runtime.trace().ticks.length,
    generation: runtime.rendererDiagnostics().currentGeneration,
  };
  click(container, ".lifecycle-parent .lifecycle-add", "parent Add after rejected swap");
  eventOrder.push("old-active-click-after-rejection");
  const oldClickAfter = {
    ticks: runtime.trace().ticks.length,
    generation: runtime.rendererDiagnostics().currentGeneration,
  };
  const oldActiveClickAccepted = oldClickAfter.ticks === oldClickBefore.ticks + 1 &&
    oldClickAfter.generation === oldClickBefore.generation;
  assert(runtime.trace().ticks.length === ticksBeforeActiveClick + 1,
    "the old physical DOM click must still dispatch after a rejected swap");
  assert(oldActiveClickAccepted, "old active DOM callback did not dispatch on its existing renderer lease");
  if (oldActiveClickAccepted) rejectedPreservation.observed.push("oldRendererCallbacks");
  assertSame(rejectedPreservation.expected, rejectedPreservation.observed,
    "rejected swap preservation behavior and raw snapshots");
  assert(effects.pending().length === 1 && effects.pending()[0].token === requestRecord.token,
    "the pending request must survive the click after rejection");
  const callbacksBeforeCommit = callbackBatches.at(-1);
  const beforeCompatible = snapshotActive(runtime, effects);
  const previousRoot = container.firstElementChild;

  const reactInstrument = rendererFactory(container, "react");
  const compatibleResult = runtime.replaceRenderer(reactInstrument.renderer);
  eventOrder.push("compatible-renderer-commit");
  assertSame(expectations.renderer.knownCapabilities, domRenderer.viewCapabilities,
    "built-in DOM renderer capability profile");
  assertSame(expectations.swap.compatibleRendererCapabilities, reactInstrument.renderer.viewCapabilities,
    "built-in React renderer compatible profile");
  const afterCompatible = snapshotActive(runtime, effects);
  const compatiblePreservation = requiredPreservation(
    expectations.swap.compatibleSwapPreserves,
    beforeCompatible,
    afterCompatible,
  );
  assertSame(compatiblePreservation.expected, compatiblePreservation.observed,
    "compatible swap preservation fields");
  assert(previousRoot === null || !previousRoot.isConnected, "successful compatible swap must detach the old DOM root");
  assert(compatibleResult && typeof compatibleResult === "object", "compatible swap must return the committed snapshot");

  const traceBeforeOldCallback = clone(runtime.trace());
  const generationBeforeOldCallback = runtime.rendererDiagnostics().currentGeneration;
  const oldCallbackResult = callbacksBeforeCommit.dispatch(
    { path: "0/1", event: "click", value: "" },
    { Name: "addParent", Arg: "" },
  );
  const traceAfterOldCallback = clone(runtime.trace());
  const generationAfterOldCallback = runtime.rendererDiagnostics().currentGeneration;
  eventOrder.push("fence-old-callback-after-commit");
  assert(oldCallbackResult?.accepted === false && oldCallbackResult?.stale === true,
    "a callback from the retired DOM renderer must be fenced after successful commit");
  assertSame(traceBeforeOldCallback, traceAfterOldCallback, "retired callback trace fence");

  const pendingAfterSwap = effects.pending();
  assert(pendingAfterSwap.length === 1 && pendingAfterSwap[0].token === requestRecord.token,
    "pending request must remain deliverable after compatible swap");
  const replyResult = effects.deliver(requestRecord.token);
  eventOrder.push("deliver-pending-reply");
  assert(replyResult?.accepted === true, "compatible swap reply must be accepted");
  assert(effects.pending().length === 0, "accepted reply must clear the pending request");

  const trace = runtime.trace();
  const expectedMessages = [
    null,
    { name: "addParent", arg: "" },
    { name: "requestParent", arg: "" },
    { name: "addParent", arg: "" },
    { name: "complete", arg: requestRecord.token },
  ];
  assert(trace.ticks.length === expectedMessages.length, "capability active sequence tick count differs");
  for (let index = 0; index < expectedMessages.length; index += 1) {
    assertSame(index, trace.ticks[index].index, `capability active tick ${index} index`);
    assertSame(expectedMessages[index], trace.ticks[index].message, `capability active tick ${index} message`);
  }

  const finalSnapshot = runtime.snapshot();
  const allEffectRecords = effects.records();
  runtime.unmount();
  return {
    schema: "gobi.compiled-capability-browser/v1",
    fixture: fixture.name,
    componentId: component.id,
    componentCapabilities: [...component.capabilities],
    initialAppIRUsedUnmodified: true,
    admissions: null,
    swap: {
      eventOrder,
      expectedPreservedAfterRejectedSwap: [...expectations.swap.preservedAfterRejectedSwap],
      observedPreservedAfterRejectedSwap: rejectedPreservation.observed,
      rejected: {
        errorName: rejectedError.name,
        candidateCapabilities: incompatibleCapabilities,
        missingCapability,
        diagnostic: rejectedDiagnostic,
        candidateCalls,
        before: beforeRejected,
        after: afterRejected,
      },
      oldActiveClickAccepted,
      oldActiveClick: { before: oldClickBefore, after: oldClickAfter },
      compatible: {
        expectedPreserved: [...expectations.swap.compatibleSwapPreserves],
        observedPreserved: compatiblePreservation.observed,
        before: beforeCompatible,
        after: afterCompatible,
        returnSnapshot: clone(compatibleResult),
        oldRootDetached: previousRoot === null || !previousRoot.isConnected,
      },
      oldCallbackFencedAfterCommit: true,
      oldCallbackResult: clone(oldCallbackResult),
      oldCallbackFence: {
        beforeTrace: traceBeforeOldCallback,
        afterTrace: traceAfterOldCallback,
        beforeGeneration: generationBeforeOldCallback,
        afterGeneration: generationAfterOldCallback,
      },
      replyAccepted: true,
      replyResult: clone(replyResult),
      requestRecord: clone(requestRecord),
      expectedCompatibleRendererCapabilities: [...expectations.swap.compatibleRendererCapabilities],
      activeRendererProfiles: {
        dom: [...domRenderer.viewCapabilities],
        react: [...reactInstrument.renderer.viewCapabilities],
      },
      disabledClick,
      finalTrace: clone(trace),
      finalSnapshot: clone(finalSnapshot),
      effectRecords: clone(allEffectRecords),
    },
    pageErrors: [],
  };
}

export function installCapabilityBrowser({ gobiCompiled, encoder, fixture, expectations }) {
  const container = document.getElementById("app");
  if (!container) throw new Error("#app container is missing");
  if (gobiCompiled?.schema !== "gobi.compiled-module/v1") throw new TypeError("compiled app module is required");
  if (fixture?.schema !== "gobi.compiled-lifecycle-fixture/v1") throw new TypeError("lifecycle fixture is required");
  if (expectations?.schema !== "gobi.capability-oracle/v1") throw new TypeError("capability oracle is required");

  const moduleForAdmission = instrumentModule(gobiCompiled, expectations.component.capabilities).module;
  const admissions = makeAdmissions({ gobiCompiled: moduleForAdmission, encoder, fixture, expectations, container });
  const activeSwap = runActualSwap({ gobiCompiled, encoder, fixture, expectations, container });
  activeSwap.admissions = admissions;
  return activeSwap;
}
