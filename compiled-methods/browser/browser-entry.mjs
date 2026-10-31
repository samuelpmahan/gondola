import { mountCompiledApp, createDeterministicEffectHost } from "../../compiled-frontend/frontend/runtime/runtime.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { expectedMethodsDOM, METHODS_ACTIONS, METHODS_STATES } from "./dom-oracle.mjs";

export function installMethodsBrowser({ gobiCompiled, encoder }) {

const nativeClickListeners = [];
const originalAddEventListener = EventTarget.prototype.addEventListener;
EventTarget.prototype.addEventListener = function(type, listener, options) {
  if (type === "click" && this instanceof Element && this.localName === "button" && typeof listener === "function") {
    nativeClickListeners.push({ target: this, listener });
  }
  return originalAddEventListener.call(this, type, listener, options);
};

const callbacks = { dispatch: 0, stale: 0 };
const observations = { dispatch: [], stale: [] };
const retainedCallbacks = new Map();
let nextRetainedId = 1;
let activeIntent = null;
let instance = null;
let activeBackend = null;
const unmountWitnesses = [];
const root = document.getElementById("app");

function clone(value) { return structuredClone(value); }

function requireIntent(observed) {
  if (activeIntent === null) throw new Error("renderer callback arrived without an Action intent");
  if (!observed || observed.path !== activeIntent.path || observed.event !== activeIntent.event ||
      typeof observed.value !== "string" || observed.value !== activeIntent.value) {
    throw new Error("renderer observation differs from the requested physical Action");
  }
  return { path: observed.path, event: observed.event, value: observed.value };
}

function rendererFor(kind) {
  const base = kind === "react"
    ? createReactRenderer({ container: root })
    : kind === "dom"
      ? createDOMRenderer({ container: root })
      : null;
  if (!base) throw new TypeError("renderer kind must be react or dom");
  const wrapper = {
    update(view, hooks) {
      return base.update(view, {
        dispatch(observed, message) {
          callbacks.dispatch += 1;
          const action = requireIntent(observed);
          const record = { action, message: clone(message), backend: kind };
          observations.dispatch.push(record);
          return hooks.dispatch(observed, message);
        },
        onStaleAction(observed, renderEpoch) {
          callbacks.stale += 1;
          const action = requireIntent(observed);
          observations.stale.push({ action, renderEpoch, backend: kind });
          return hooks.onStaleAction(observed, renderEpoch);
        },
      });
    },
    viewRecord: (...args) => base.viewRecord(...args),
    domSnapshot: (...args) => base.domSnapshot(...args),
    focusState: (...args) => base.focusState(...args),
    restoreFocus: (...args) => base.restoreFocus(...args),
    unmount(...args) {
      const result = base.unmount(...args);
      unmountWitnesses.push({ backend: kind, containerHTML: root.innerHTML });
      return result;
    },
    base,
  };
  return wrapper;
}

function pathElement(path) {
  let element = root.firstElementChild;
  if (!element) return null;
  if (path === "") return element;
  for (const part of path.split("/")) element = element?.childNodes?.[Number(part)] ?? null;
  return element?.nodeType === Node.ELEMENT_NODE ? element : null;
}

function physicalSnapshot(state) {
  const expected = expectedMethodsDOM(state);
  const controls = expected.controls.map((slot) => {
    const element = pathElement(slot.path);
    return {
      path: slot.path,
      key: slot.key,
      tag: element?.localName ?? "",
      type: typeof element?.type === "string" ? element.type : "",
      value: typeof element?.value === "string" ? element.value : "",
      checked: typeof element?.checked === "boolean" ? element.checked : false,
      disabled: typeof element?.disabled === "boolean" ? element.disabled : false,
    };
  });
  return {
    normalization: "outerHTML-v1",
    html: root.firstElementChild?.outerHTML ?? "",
    controls,
  };
}

function captureTickEvidence(tickIndex) {
  const state = clone(METHODS_STATES[tickIndex]);
  const oracle = expectedMethodsDOM(state);
  const trace = instance.runtime.trace();
  const tick = trace.ticks[tickIndex];
  if (!tick) throw new Error(`trace is missing tick ${tickIndex}`);
  assertExactTraceValue(oracle, tick.dom, `$.browser.${activeBackend}.trace.ticks[${tickIndex}].dom`);
  const physical = physicalSnapshot(state);
  assertExactTraceValue(oracle, physical, `$.browser.${activeBackend}.physicalDOMSnapshots[${tickIndex}]`);
  assertExactTraceValue(oracle, instance.renderer.domSnapshot(), `$.browser.${activeBackend}.rendererSnapshot[${tickIndex}]`);
  return {
    oracle: { tickIndex, state, snapshot: oracle },
    physical: { tickIndex, state, snapshot: physical },
  };
}

function captureCallback(path, event) {
  const target = pathElement(path);
  if (!target) throw new Error(`cannot retain callback at missing path ${path}`);
  let callback = null;
  if (activeBackend === "react") {
    const propsKey = Object.keys(target).find((key) => key.startsWith("__reactProps$"));
    const propName = event === "click" ? "onClick" : null;
    callback = propName === null || !propsKey ? null : target[propsKey]?.[propName] ?? null;
  } else {
    callback = nativeClickListeners.filter((entry) => entry.target === target).at(-1)?.listener ?? null;
  }
  if (typeof callback !== "function") throw new Error(`renderer did not expose a callable ${event} callback at ${path}`);
  const id = `retired-${nextRetainedId++}`;
  retainedCallbacks.set(id, { target, callback, path, event });
  return { id, target, path, event, originallyConnected: target.isConnected };
}

function invokeRetained(id, action) {
  const retained = retainedCallbacks.get(id);
  if (!retained) throw new Error(`unknown retained callback ${id}`);
  activeIntent = clone(action);
  try {
    retained.callback({ currentTarget: retained.target, target: retained.target });
  } finally {
    activeIntent = null;
  }
  return { targetConnectedAfter: retained.target.isConnected, callbackCount: callbacks.stale };
}

function createInstance(kind, fixtureScript, componentId) {
  if (root.childNodes.length !== 0) throw new Error("#app must be empty before profile mount");
  callbacks.dispatch = 0;
  callbacks.stale = 0;
  observations.dispatch.length = 0;
  observations.stale.length = 0;
  retainedCallbacks.clear();
  unmountWitnesses.length = 0;
  const renderer = rendererFor(kind);
  let runtime = null;
  const effectHost = createDeterministicEffectHost(fixtureScript.hostScript);
  runtime = mountCompiledApp({
    module: gobiCompiled,
    componentId,
    appId: componentId,
    encoder: { gobiEncodeState: encoder.gobiEncodeState },
    renderer,
    effectHost,
  });
  activeBackend = kind;
  instance = { runtime, renderer, effectHost, fixtureScript, componentId };
  return instance;
}

async function runAction(actionIndex) {
  const action = METHODS_ACTIONS[actionIndex];
  const tickIndex = actionIndex + 1;
  const target = pathElement(action.path);
  if (!target || target.localName !== "button") throw new Error(`action ${actionIndex} target ${action.path} is missing or not a button`);
  const beforeTrace = instance.runtime.trace();
  const beforeTickCount = beforeTrace.ticks.length;
  const beforeCallbacks = clone(callbacks);
  const targetBefore = {
    connected: target.isConnected,
    disabled: target.disabled === true,
    value: typeof target.value === "string" ? target.value : "",
    type: target.type,
    text: target.textContent,
  };
  const expectedMessage = action.message === null ? null : { name: action.message, arg: "" };
  const record = {
    actionIndex,
    action: { path: action.path, event: action.event, value: action.value },
    expectedMessage,
    beforeTickCount,
    beforeCallbacks,
    target: targetBefore,
    physicalClick: { method: "HTMLElement.click", attempted: true },
    observed: null,
    suppressedDispatch: null,
  };

  if (action.message === null) {
    if (!targetBefore.disabled) throw new Error(`suppressed action ${actionIndex} target was not physically disabled`);
    target.click();
    const afterPhysical = instance.runtime.trace().ticks.length;
    if (afterPhysical !== beforeTickCount) throw new Error(`disabled click ${actionIndex} unexpectedly reached a renderer callback`);
    record.physicalClick.disabled = true;
    record.physicalClick.traceTicksUnchanged = true;
    const result = instance.runtime.dispatch(record.action, null);
    if (result.accepted !== true || result.dispatchId !== null) throw new Error(`runtime rejected suppressed action ${actionIndex}`);
    record.suppressedDispatch = clone(result);
  } else {
    if (targetBefore.disabled) throw new Error(`active action ${actionIndex} target is physically disabled`);
    activeIntent = clone(record.action);
    try {
      target.click();
    } finally {
      activeIntent = null;
    }
    const observed = observations.dispatch.at(-1);
    if (!observed) throw new Error(`active action ${actionIndex} did not reach the renderer callback`);
    record.observed = clone(observed);
  }

  const trace = instance.runtime.trace();
  if (trace.ticks.length !== beforeTickCount + 1) throw new Error(`action ${actionIndex} did not add exactly one trace tick`);
  const tick = trace.ticks[tickIndex];
  if (expectedMessage === null) {
    assertExactTraceValue(null, tick.message, `$.browser.${activeBackend}.actions[${actionIndex}].tick.message`);
    assertExactTraceValue(null, tick.dispatchId, `$.browser.${activeBackend}.actions[${actionIndex}].tick.dispatchId`);
  } else {
    assertExactTraceValue(expectedMessage, tick.message, `$.browser.${activeBackend}.actions[${actionIndex}].tick.message`);
    const activeCount = METHODS_ACTIONS.slice(0, actionIndex + 1).filter((item) => item.message !== null).length;
    assertExactTraceValue(`dispatch-${String(activeCount).padStart(4, "0")}`, tick.dispatchId,
      `$.browser.${activeBackend}.actions[${actionIndex}].tick.dispatchId`);
  }
  assertExactTraceValue(record.action, tick.action, `$.browser.${activeBackend}.actions[${actionIndex}].tick.action`);
  const evidence = captureTickEvidence(tickIndex);
  record.tickIndex = tickIndex;
  record.afterTickCount = trace.ticks.length;
  record.afterCallbacks = clone(callbacks);
  record.tick = {
    message: clone(tick.message),
    dispatchId: tick.dispatchId,
    state: evidence.oracle.state,
  };
  record.domOracle = evidence.oracle;
  record.physicalDOMSnapshot = evidence.physical;
  if (action.message === null) {
    assertExactTraceValue(beforeCallbacks, callbacks, `$.browser.${activeBackend}.actions[${actionIndex}].disabledCallbacks`);
  } else if (callbacks.dispatch !== beforeCallbacks.dispatch + 1) {
    throw new Error(`action ${actionIndex} expected exactly one renderer dispatch callback`);
  }
  return record;
}

function renderTraceData(trace) {
  return clone(trace);
}

function buildProfileRecord({ kind, actionRecords, snapshotEvidence, retiredCallbacks, swaps, rendererSequence, noWasm }) {
  const trace = instance.runtime.trace();
  return {
    backend: kind,
    trace: renderTraceData(trace),
    actions: actionRecords,
    domOracle: snapshotEvidence.map((entry) => entry.oracle),
    physicalDOMSnapshots: snapshotEvidence.map((entry) => entry.physical),
    callbackCounts: clone(callbacks),
    retiredCallbacks,
    noWasm,
    unmount: null,
    pageErrors: [],
    ...(kind === "swap" ? { rendererSequence, swaps } : {}),
  };
}

function snapshotEvidenceAt(tickIndex) {
  return captureTickEvidence(tickIndex);
}

function performSwap(to, afterActionIndex) {
  const from = activeBackend;
  if (from === to) throw new Error("renderer swap must change backend");
  const beforeTrace = instance.runtime.trace();
  const beforeSnapshot = instance.runtime.snapshot();
  const beforeDiagnostic = instance.runtime.rendererDiagnostics();
  const beforeRootHTML = root.innerHTML;
  const oldRootNode = root.firstElementChild;
  const focusBefore = instance.renderer.focusState();
  const action = { path: "0/1", event: "click", value: "" };
  const retained = captureCallback(action.path, action.event);
  const witnessCount = unmountWitnesses.length;
  const nextRenderer = rendererFor(to);
  const replacementSnapshot = instance.runtime.replaceRenderer(nextRenderer);
  const afterTrace = instance.runtime.trace();
  const afterSnapshot = instance.runtime.snapshot();
  const afterDiagnostic = instance.runtime.rendererDiagnostics();
  const witness = unmountWitnesses.slice(witnessCount).find((item) => item.backend === from);
  if (!witness || witness.containerHTML !== "") throw new Error(`renderer ${from} did not physically empty #app during replacement`);
  if (afterTrace.ticks.length !== beforeTrace.ticks.length) throw new Error("renderer swap added an application trace tick");
  if (afterDiagnostic.replacements.at(-1)?.outcome !== "committed") throw new Error("runtime did not commit the renderer replacement");
  assertExactTraceValue(beforeSnapshot.state, replacementSnapshot.state, "$.browser.swap.state");
  assertExactTraceValue(beforeSnapshot.view, replacementSnapshot.view, "$.browser.swap.view");
  assertExactTraceValue(beforeSnapshot.state, afterSnapshot.state, "$.browser.swap.stateAfter");
  assertExactTraceValue(beforeSnapshot.view, afterSnapshot.view, "$.browser.swap.viewAfter");
  if (!oldRootNode || oldRootNode.isConnected) throw new Error("renderer swap did not detach the old root node");
  activeBackend = to;
  instance.renderer = nextRenderer;
  const currentTick = beforeTrace.ticks.length - 1;
  const swapSnapshot = snapshotEvidenceAt(currentTick);

  const fencedBefore = afterDiagnostic.fencedCallbacks.length;
  const ticksBeforeRetiredCall = afterTrace.ticks.length;
  const stateBeforeRetiredCall = instance.runtime.snapshot().state;
  const staleCountBefore = callbacks.stale;
  const invokeEvidence = invokeRetained(retained.id, action);
  const ticksAfterRetiredCall = instance.runtime.trace().ticks.length;
  const stateAfterRetiredCall = instance.runtime.snapshot().state;
  const diagnosticAfterRetiredCall = instance.runtime.rendererDiagnostics();
  const staleObservation = observations.stale.at(-1);
  if (ticksAfterRetiredCall !== ticksBeforeRetiredCall) throw new Error("retired renderer callback advanced the Go trace");
  assertExactTraceValue(stateBeforeRetiredCall, stateAfterRetiredCall, "$.browser.swap.retiredCallback.state");
  if (diagnosticAfterRetiredCall.fencedCallbacks.length !== fencedBefore + 1) {
    throw new Error("retired renderer callback was not recorded as exactly one runtime fence");
  }
  if (callbacks.stale !== staleCountBefore + 1 || !staleObservation) {
    throw new Error("retired renderer callback did not reach the renderer stale-action callback");
  }
  assertExactTraceValue(action, staleObservation.action, "$.browser.swap.retiredCallback.action");
  const swap = {
    actionIndex: afterActionIndex,
    afterActionIndex,
    from,
    to,
    beforeTickCount: beforeTrace.ticks.length,
    afterTickCount: afterTrace.ticks.length,
    stateUnchanged: true,
    viewUnchanged: true,
    oldRootHTMLBefore: beforeRootHTML,
    oldRootEmptyAfterUnmount: witness.containerHTML === "",
    oldRootDetached: !oldRootNode.isConnected,
    newRootDistinct: root.firstElementChild !== oldRootNode,
    focus: {
      rendererFocusPairAvailable: typeof instance.renderer.focusState === "function" && typeof instance.renderer.restoreFocus === "function",
      captured: focusBefore !== null,
      oldFocusState: focusBefore,
      restored: afterDiagnostic.replacements.at(-1)?.focusRestored === true,
      fixtureHasInputControls: false,
      limitation: "fixture actions are buttons; the renderers' portable focus records cover inputs and therefore return null",
    },
    newSnapshot: swapSnapshot,
    retiredCallback: {
      captured: true,
      id: retained.id,
      path: retained.path,
      originallyConnected: retained.originallyConnected,
      detachedAtInvocation: !invokeEvidence.targetConnectedAfter,
      invoked: true,
      rendererStaleCallbackObserved: true,
      rendererObservation: clone(staleObservation),
      runtimeFenceCountBefore: fencedBefore,
      runtimeFenceCountAfter: diagnosticAfterRetiredCall.fencedCallbacks.length,
      traceTicksBefore: ticksBeforeRetiredCall,
      traceTicksAfter: ticksAfterRetiredCall,
      traceTicksUnchanged: ticksAfterRetiredCall === ticksBeforeRetiredCall,
      runtimeFence: clone(diagnosticAfterRetiredCall.fencedCallbacks.at(-1)),
    },
  };
  return swap;
}

window.__gobiMethods = {
  mount({ kind, fixtureScript, componentId }) {
    return createInstance(kind, fixtureScript, componentId);
  },
  async runProfile({ kind, fixtureScript, componentId, schedule }) {
    const swapProfile = kind === "swap";
    const initialBackend = swapProfile ? "react" : kind;
    createInstance(initialBackend, fixtureScript, componentId);
    const actionRecords = [];
    const snapshotEvidence = [snapshotEvidenceAt(0)];
    const swaps = [];
    const rendererSequence = [initialBackend];
    const retiredCallbacks = [];
    const scheduleByAction = new Map((schedule ?? []).map((entry) => [entry.afterActionIndex, entry]));

    for (let actionIndex = 0; actionIndex < METHODS_ACTIONS.length; actionIndex += 1) {
      const actionRecord = await runAction(actionIndex);
      actionRecords.push(actionRecord);
      snapshotEvidence.push({ oracle: actionRecord.domOracle, physical: actionRecord.physicalDOMSnapshot });
      const entry = scheduleByAction.get(actionIndex);
      if (swapProfile && entry) {
        const swap = performSwap(entry.to, actionIndex);
        swaps.push(swap);
        retiredCallbacks.push(swap.retiredCallback);
        rendererSequence.push(entry.to);
      }
    }
    instance.effectHost.assertDone();
    const noWasm = { apiAttempts: clone(window.__gobiNoWasmAttempts ?? []), wasmRequests: [] };
    if (noWasm.apiAttempts.length !== 0) throw new Error("WebAssembly API was invoked during the methods browser run");
    const record = buildProfileRecord({ kind, actionRecords, snapshotEvidence, retiredCallbacks, swaps, rendererSequence, noWasm });
    const physicalBeforeUnmount = { html: root.innerHTML, controlCount: root.querySelectorAll("button").length };
    instance.runtime.unmount();
    const rendererAfterUnmount = instance.renderer.domSnapshot();
    const physicalAfterUnmount = { normalization: "container-innerHTML-v1", html: root.innerHTML, controls: root.querySelectorAll("button").length };
    if (physicalAfterUnmount.html !== "" || physicalAfterUnmount.controls !== 0) throw new Error("runtime unmount left DOM nodes in #app");
    assertExactTraceValue({ normalization: "outerHTML-v1", html: "", controls: [] }, rendererAfterUnmount, "$.browser.unmount.rendererSnapshot");
    record.unmount = { before: physicalBeforeUnmount, physicalDOM: physicalAfterUnmount, rendererSnapshot: rendererAfterUnmount };
    return record;
  },
};
  return window.__gobiMethods;
}
