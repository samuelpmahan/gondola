import { mountCompiledChildrenApp } from "../runtime/runtime.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { associateObservedAction } from "../../compiled-frontend/conformance/observed-action.mjs";

const PROBE_ACTION = { path: "", event: "click", value: "" };

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertEqual(expected, actual, message) {
  if (!equal(expected, actual)) throw new Error(`${message}: values differ`);
}

function actionForEvent(event) {
  if (event?.action && typeof event.action === "object") return event.action;
  if (typeof event?.path === "string" && typeof event?.event === "string") {
    return { path: event.path, event: event.event, value: typeof event.value === "string" ? event.value : "" };
  }
  return null;
}

function messageObject(message) {
  if (message === null || message === undefined) return null;
  if (typeof message.Name === "string") return { name: message.Name, arg: message.Arg };
  return { name: message.name, arg: message.arg };
}

/** Install the real GoScript module and renderer behind a deterministic manual
 * effect driver. This module records physical browser behavior only; it owns
 * no application state or transition logic. */
export function installChildrenBrowser({ gobiReact, encoderReact, gobiDom, encoderDom }) {
  const container = document.getElementById("app");
  if (!container) throw new Error("#app container is missing");
  let activeAction = null;
  let activeEventIndex = null;
  let activeInstance = null;
  let nextRendererId = 0;
  let callbackCounts = { dispatch: 0, stale: 0 };
  let observations = { dispatch: [], stale: [] };
  let rendererRecords = [];
  let callbackByEvent = new Map();
  let pageErrors = [];

  function associate(observed) {
    if (activeAction === null) throw new Error("renderer callback arrived without a scripted Action intent");
    return associateObservedAction(observed, activeAction);
  }

  function rendererFor(backend) {
    const candidateOnly = backend === "incompatible";
    const core = backend === "react" ? createReactRenderer({ container }) : createDOMRenderer({ container });
    const record = {
      id: ++nextRendererId,
      backend,
      core,
      callbackBatches: [],
      lastObservation: null,
    };
    const renderer = {
      viewCapabilities: candidateOnly ? [] : core.viewCapabilities,
      update(view, hooks) {
        const callbacks = {
          dispatch(observed, message) {
            callbackCounts.dispatch += 1;
            const action = associate(observed);
            const observation = {
              rendererId: record.id,
              backend,
              eventIndex: activeEventIndex,
              observed: clone(observed),
              action,
              message: clone(message),
            };
            observations.dispatch.push(observation);
            record.lastObservation = observation;
            if (Number.isSafeInteger(activeEventIndex)) {
              callbackByEvent.set(activeEventIndex, { record, callbacks, observation });
            }
            return hooks.dispatch(action, message);
          },
          onStaleAction(observed, renderEpoch) {
            callbackCounts.stale += 1;
            const action = associate(observed);
            const observation = {
              rendererId: record.id,
              backend,
              eventIndex: activeEventIndex,
              observed: clone(observed),
              action,
              renderEpoch,
            };
            observations.stale.push(observation);
            record.lastObservation = observation;
            if (Number.isSafeInteger(activeEventIndex)) {
              callbackByEvent.set(activeEventIndex, { record, callbacks, observation });
            }
            return hooks.onStaleAction(action, renderEpoch);
          },
        };
        record.callbackBatches.push({ callbacks, hooks });
        return core.update(view, callbacks);
      },
      viewRecord: (...args) => core.viewRecord(...args),
      domSnapshot: (...args) => core.domSnapshot(...args),
      unmount: (...args) => core.unmount(...args),
      focusState: (...args) => core.focusState?.(...args) ?? null,
      restoreFocus: (...args) => core.restoreFocus?.(...args) ?? false,
      record,
    };
    record.renderer = renderer;
    rendererRecords.push(record);
    return renderer;
  }

  function pathElement(path) {
    let element = container.firstElementChild;
    if (!element) return null;
    if (path === "") return element;
    for (const part of path.split("/")) element = element?.childNodes?.[Number(part)] ?? null;
    return element?.nodeType === Node.ELEMENT_NODE ? element : null;
  }

  function physicalSnapshot(rendererSnapshot = null) {
    const currentRendererSnapshot = rendererSnapshot ?? currentInstance().renderer.domSnapshot();
    return {
      normalization: "outerHTML-v1",
      html: container.firstElementChild?.outerHTML ?? "",
      controls: clone(currentRendererSnapshot.controls),
    };
  }

  function currentInstance() {
    if (!activeInstance) throw new Error("compiled child profile is not mounted");
    return activeInstance;
  }

  function captureSnapshot(eventIndex, label, operation = null) {
    const instance = currentInstance();
    const trace = instance.runtime.trace();
    const snapshot = instance.runtime.snapshot();
    const rendererSnapshot = clone(instance.renderer.domSnapshot());
    const physicalDOM = physicalSnapshot(rendererSnapshot);
    assert(physicalDOM.html === rendererSnapshot.html, `${label} raw mounted DOM differs from renderer snapshot`);
    return {
      eventIndex,
      stateIndex: trace.ticks.length - 1,
      traceTickIndex: trace.ticks.at(-1)?.index ?? null,
      traceTick: clone(trace.ticks.at(-1) ?? null),
      runtimeSnapshot: clone(snapshot),
      rendererSnapshot,
      physicalDOM,
      pending: clone(instance.effects.pending()),
      effectRecords: clone(instance.effects.records()),
      operation: clone(operation),
      label,
    };
  }

  function createInstance(kind, fixture) {
    assert(container.childNodes.length === 0, "#app must be empty before compiled child profile mount");
    callbackCounts = { dispatch: 0, stale: 0 };
    observations = { dispatch: [], stale: [] };
    rendererRecords = [];
    callbackByEvent = new Map();
    nextRendererId = 0;
    const compiled = kind === "react" ? gobiReact : gobiDom;
    const encoder = kind === "react" ? encoderReact : encoderDom;
    const component = compiled.appIR?.components?.find((item) => item.id === fixture.componentID);
    if (!component || component.packagePath !== fixture.packagePath) {
      throw new Error("compiled child component identity differs from the frozen fixture");
    }
    const renderer = rendererFor(kind === "swap" ? "dom" : kind);
    const mounted = mountCompiledChildrenApp({
      module: compiled,
      componentId: component.id,
      appId: fixture.componentID,
      encoder: { gobiEncodeState: encoder.gobiEncodeState },
      renderer,
      onFailure(failure) { pageErrors.push(failure.message); },
    });
    activeInstance = {
      runtime: mounted.runtime,
      effects: mounted.effects,
      renderer,
      fixture,
      component,
      backend: renderer.record.backend,
      profile: kind,
    };
    return activeInstance;
  }

  function applyClick(event, eventIndex) {
    const instance = currentInstance();
    const action = actionForEvent(event);
    if (!action) throw new Error(`event ${eventIndex} click has no physical Action`);
    const target = pathElement(action.path);
    if (!target || target.localName !== "button") {
      throw new Error(`event ${eventIndex} target ${action.path} is missing or not a button`);
    }
    const beforeTrace = instance.runtime.trace();
    const beforeCallbacks = clone(callbackCounts);
    const targetBefore = {
      connected: target.isConnected,
      disabled: target.disabled === true,
      type: target.type,
      value: typeof target.value === "string" ? target.value : "",
      text: target.textContent,
      outerHTML: target.outerHTML,
    };
    if (!targetBefore.connected || targetBefore.disabled) {
      throw new Error(`event ${eventIndex} click target is disconnected or disabled`);
    }
    if (action.value !== targetBefore.value) throw new Error(`event ${eventIndex} physical target value differs`);
    activeAction = clone(action);
    activeEventIndex = eventIndex;
    try {
      target.click();
    } finally {
      activeAction = null;
      activeEventIndex = null;
    }
    const trace = instance.runtime.trace();
    const callback = callbackByEvent.get(eventIndex);
    assert(trace.ticks.length === beforeTrace.ticks.length + 1,
      `event ${eventIndex} physical click did not produce one Go tick`);
    assert(callback, `event ${eventIndex} physical click did not reach a renderer callback`);
    assertEqual(action, callback.observation.action, `event ${eventIndex} renderer Action`);
    const actualMessage = messageObject(callback.observation.message);
    if (event.message) assertEqual(event.message, actualMessage, `event ${eventIndex} dispatched Go message`);
    assert(callbackCounts.dispatch === beforeCallbacks.dispatch + 1,
      `event ${eventIndex} click must dispatch exactly once`);
    return {
      method: "HTMLElement.click",
      attempted: true,
      target: targetBefore,
      action: clone(action),
      expectedMessage: clone(event.message ?? null),
      observed: clone(callback.observation),
      beforeTicks: beforeTrace.ticks.length,
      afterTicks: trace.ticks.length,
      callbackCountsBefore: beforeCallbacks,
      callbackCountsAfter: clone(callbackCounts),
    };
  }

  function applyDisabledAction(event, eventIndex) {
    const instance = currentInstance();
    const action = actionForEvent(event);
    if (!action) throw new Error(`event ${eventIndex} disabled-action has no Action`);
    const target = pathElement(action.path);
    if (!target || target.localName !== "button") throw new Error(`event ${eventIndex} disabled target is missing`);
    const before = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
      physicalDOM: physicalSnapshot(),
    };
    if (!target.isConnected || target.disabled !== true) {
      throw new Error(`event ${eventIndex} disabled target is not a connected disabled button`);
    }
    const targetBefore = { connected: target.isConnected, disabled: target.disabled, outerHTML: target.outerHTML };
    activeAction = clone(action);
    activeEventIndex = eventIndex;
    try {
      target.click();
    } finally {
      activeAction = null;
      activeEventIndex = null;
    }
    const after = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
      physicalDOM: physicalSnapshot(),
    };
    assertEqual(before.trace, after.trace, `event ${eventIndex} disabled click trace fence`);
    assertEqual(before.snapshot, after.snapshot, `event ${eventIndex} disabled click snapshot fence`);
    assertEqual(before.callbacks, after.callbacks, `event ${eventIndex} disabled click callback fence`);
    assertEqual(before.pending, after.pending, `event ${eventIndex} disabled click pending fence`);
    assertEqual(before.effectRecords, after.effectRecords, `event ${eventIndex} disabled click effect fence`);
    assertEqual(before.physicalDOM, after.physicalDOM, `event ${eventIndex} disabled click DOM fence`);
    return { method: "disabled-HTMLElement.click", attempted: true, targetBefore, before, after };
  }

  function applyDirectMessage(event, eventIndex) {
    const instance = currentInstance();
    const beforeTicks = instance.runtime.trace().ticks.length;
    const message = { Name: event.message.name, Arg: event.message.arg };
    const result = instance.runtime.dispatch(PROBE_ACTION, message);
    if (result.accepted !== true) throw new Error(`event ${eventIndex} direct Go message was rejected: ${result.error ?? "unknown"}`);
    if (instance.runtime.trace().ticks.length !== beforeTicks + 1) {
      throw new Error(`event ${eventIndex} direct Go message did not add exactly one tick`);
    }
    return { method: "runtime.dispatch-direct-Go-message", action: clone(PROBE_ACTION), message: clone(event.message), result: clone(result) };
  }

  function applyEffectReply(event, eventIndex) {
    const instance = currentInstance();
    const beforeTicks = instance.runtime.trace().ticks.length;
    const result = instance.effects.deliver(event.token);
    if (result?.accepted !== true) throw new Error(`event ${eventIndex} effect reply was rejected: ${result?.error ?? "unknown"}`);
    if (instance.runtime.trace().ticks.length !== beforeTicks + 1) {
      throw new Error(`event ${eventIndex} effect reply did not add exactly one tick`);
    }
    return { method: "manual compiled-children effect driver", token: event.token, result: clone(result) };
  }

  function swapRenderer(to, eventIndex, expectedOutcome) {
    const instance = currentInstance();
    const previous = instance.renderer;
    const oldRoot = container.firstElementChild;
    const initialChildren = container.childNodes.length;
    const mutationObserver = new MutationObserver(() => {});
    mutationObserver.observe(container, { childList: true });
    const before = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
      diagnostics: instance.runtime.rendererDiagnostics(),
      renderer: { id: previous.record.id, backend: previous.record.backend },
      rendererDOM: clone(previous.domSnapshot()),
      physicalHTML: container.innerHTML,
    };
    const candidate = rendererFor(to);
    let returnedSnapshot = null;
    let error = null;
    let accepted = false;
    try {
      returnedSnapshot = instance.runtime.replaceRenderer(candidate);
      accepted = true;
    } catch (caught) {
      error = { name: caught?.name ?? "Error", message: String(caught?.message ?? caught) };
    }
    const mutations = mutationObserver.takeRecords();
    mutationObserver.disconnect();
    if (expectedOutcome === "accepted" && !accepted) {
      throw new Error(`event ${eventIndex} compatible renderer swap failed: ${error?.message ?? "unknown"}`);
    }
    if (expectedOutcome === "rejected" && accepted) throw new Error(`event ${eventIndex} incompatible candidate was accepted`);
    if (accepted) {
      instance.renderer = candidate;
      instance.backend = to;
    }
    let observedChildren = initialChildren;
    let oldRootRemoved = false;
    let newRootAdded = false;
    let emptyAfterOldRemoval = false;
    if (accepted) {
      for (const mutation of mutations) {
        if ([...mutation.removedNodes].includes(oldRoot)) oldRootRemoved = true;
        if ([...mutation.addedNodes].includes(container.firstElementChild)) newRootAdded = true;
        observedChildren -= mutation.removedNodes.length;
        observedChildren += mutation.addedNodes.length;
        if (oldRootRemoved && observedChildren === 0) emptyAfterOldRemoval = true;
      }
    }
    const after = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
      diagnostics: instance.runtime.rendererDiagnostics(),
      renderer: { id: instance.renderer.record.id, backend: instance.renderer.record.backend },
      oldRootDetached: oldRoot === null || !oldRoot.isConnected,
      retiredRendererDOMBeforeSwap: before.rendererDOM,
      oldRootEmptyDuringSwap: emptyAfterOldRemoval,
      rootMutationEvidence: { childListRecords: mutations.length, oldRootRemoved, newRootAdded, emptyAfterOldRemoval },
      physicalHTML: container.innerHTML,
    };
    if (accepted) {
      assertEqual(before.trace, after.trace, `event ${eventIndex} compatible swap trace preservation`);
      assertEqual(before.snapshot.state, after.snapshot.state, `event ${eventIndex} compatible swap state preservation`);
      assertEqual(before.snapshot.view, after.snapshot.view, `event ${eventIndex} compatible swap view preservation`);
      assertEqual(before.pending, after.pending, `event ${eventIndex} compatible swap pending preservation`);
      assertEqual(before.effectRecords, after.effectRecords, `event ${eventIndex} compatible swap effect preservation`);
      assert(after.oldRootDetached, `event ${eventIndex} compatible swap left old root attached`);
      assert(after.oldRootEmptyDuringSwap && after.rootMutationEvidence.oldRootRemoved && after.rootMutationEvidence.newRootAdded,
        `event ${eventIndex} compatible swap did not observe removal and replacement root mutations`);
      const oldRecord = previous.record;
      const source = callbackByEvent.get(0);
      if (!source || source.record !== oldRecord) throw new Error("compatible swap cannot find the original DOM callback to fence");
      const fenceBefore = {
        trace: instance.runtime.trace(),
        snapshot: instance.runtime.snapshot(),
        diagnostics: instance.runtime.rendererDiagnostics(),
      };
      activeAction = clone(source.observation.action);
      activeEventIndex = eventIndex;
      let dispatch;
      let stale;
      try {
        dispatch = source.callbacks.dispatch(clone(source.observation.observed), clone(source.observation.message));
        stale = source.callbacks.onStaleAction(clone(source.observation.observed), 0);
      } finally {
        activeAction = null;
        activeEventIndex = null;
      }
      const fenceAfter = {
        trace: instance.runtime.trace(),
        snapshot: instance.runtime.snapshot(),
        diagnostics: instance.runtime.rendererDiagnostics(),
      };
      assertEqual(fenceBefore.trace, fenceAfter.trace, `event ${eventIndex} retired callback trace fence`);
      assertEqual(fenceBefore.snapshot, fenceAfter.snapshot, `event ${eventIndex} retired callback snapshot fence`);
      assert(dispatch?.accepted === false && dispatch?.stale === true, `event ${eventIndex} retired dispatch callback was not fenced`);
      assert(stale?.accepted === false && stale?.stale === true, `event ${eventIndex} retired stale callback was not fenced`);
      after.retiredCallback = { sourceEvent: 0, dispatch: clone(dispatch), stale: clone(stale), before: fenceBefore, after: fenceAfter };
    } else {
      assertEqual(before.trace, after.trace, `event ${eventIndex} rejected candidate trace preservation`);
      assertEqual(before.snapshot, after.snapshot, `event ${eventIndex} rejected candidate snapshot preservation`);
      assertEqual(before.pending, after.pending, `event ${eventIndex} rejected candidate pending preservation`);
      assertEqual(before.effectRecords, after.effectRecords, `event ${eventIndex} rejected candidate effect preservation`);
      assertEqual(before.physicalHTML, after.physicalHTML, `event ${eventIndex} rejected candidate physical DOM preservation`);
      assertEqual(before.renderer, after.renderer, `event ${eventIndex} rejected candidate renderer identity`);
    }
    return { eventIndex, to, expectedOutcome, accepted, error, before, after, returnedSnapshot: clone(returnedSnapshot) };
  }

  function applyStaleCallback(event, eventIndex) {
    const instance = currentInstance();
    const source = callbackByEvent.get(event.sourceEvent);
    if (!source) throw new Error(`event ${eventIndex} stale callback has no captured source event ${event.sourceEvent}`);
    const expectedAction = actionForEvent(event);
    if (expectedAction) assertEqual(expectedAction, source.observation.action, `event ${eventIndex} stale callback source Action`);
    if (event.message) assertEqual(event.message, messageObject(source.observation.message), `event ${eventIndex} stale callback source message`);
    if (event.from && event.from !== source.record.backend) {
      throw new Error(`event ${eventIndex} stale callback came from ${source.record.backend}, expected ${event.from}`);
    }
    const before = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
    };
    activeAction = clone(source.observation.action);
    activeEventIndex = eventIndex;
    let result;
    try {
      result = source.callbacks.dispatch(clone(source.observation.observed), clone(source.observation.message));
    } finally {
      activeAction = null;
      activeEventIndex = null;
    }
    const after = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
    };
    assert(result?.accepted === false && result?.stale === true,
      `event ${eventIndex} retired renderer callback was not fenced`);
    assertEqual(before.trace, after.trace, `event ${eventIndex} retired callback trace fence`);
    assertEqual(before.snapshot, after.snapshot, `event ${eventIndex} retired callback snapshot fence`);
    assertEqual(before.pending, after.pending, `event ${eventIndex} retired callback pending fence`);
    assertEqual(before.effectRecords, after.effectRecords, `event ${eventIndex} retired callback effect fence`);
    return { method: "retained-retired-renderer.dispatch", sourceEvent: event.sourceEvent, result: clone(result), before, after };
  }

  function applyHostStaleDelivery(token, label) {
    const instance = currentInstance();
    const before = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
    };
    const result = instance.effects.deliver(token);
    const after = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
    };
    assert(result?.accepted === false, `${label} stale effect delivery unexpectedly succeeded`);
    assertEqual(before.trace, after.trace, `${label} stale delivery trace fence`);
    assertEqual(before.snapshot, after.snapshot, `${label} stale delivery snapshot fence`);
    return { token, result: clone(result), before, after };
  }

  async function runProfile({ kind, fixture, expectations }) {
    if (!["react", "dom", "swap"].includes(kind)) throw new TypeError(`unknown children browser profile ${kind}`);
    createInstance(kind, fixture);
    const instance = currentInstance();
    const events = [];
    const snapshots = [captureSnapshot(null, `${kind} init`)];
    const swaps = [];
    const probes = [];
    const staleDeliveries = [];
    const clickEvidence = [];

    for (let eventIndex = 0; eventIndex < fixture.events.length; eventIndex += 1) {
      const event = fixture.events[eventIndex];
      const beforeTicks = instance.runtime.trace().ticks.length;
      let operation = null;
      let applied = true;
      if (event.kind === "click") {
        operation = applyClick(event, eventIndex);
        clickEvidence.push({ eventIndex, ...operation });
      } else if (event.kind === "go-message") {
        operation = applyDirectMessage(event, eventIndex);
      } else if (event.kind === "effect-reply") {
        operation = applyEffectReply(event, eventIndex);
      } else if (event.kind === "disabled-action") {
        operation = applyDisabledAction(event, eventIndex);
      } else if (event.kind === "stale-callback") {
        if (kind === "swap") operation = applyStaleCallback(event, eventIndex);
        else { applied = false; operation = { applied: false, reason: "static-renderer-profile" }; }
      } else if (event.kind === "renderer-swap") {
        if (kind === "swap") {
          const expected = event.expect === "rejected" ? "rejected" : "accepted";
          const swap = swapRenderer(event.to, eventIndex, expected);
          swaps.push(swap);
          operation = swap;
        } else {
          applied = false;
          operation = { applied: false, reason: "static-renderer-profile" };
        }
      } else {
        throw new Error(`unsupported compiled children event kind ${event.kind}`);
      }

      const trace = instance.runtime.trace();
      const expectedTick = ["click", "go-message", "effect-reply"].includes(event.kind);
      if (expectedTick && trace.ticks.length !== beforeTicks + 1) {
        throw new Error(`event ${eventIndex} did not produce exactly one Go tick`);
      }
      if (!expectedTick && trace.ticks.length !== beforeTicks) {
        throw new Error(`tick-free event ${eventIndex} unexpectedly changed Go trace`);
      }
      const snapshot = captureSnapshot(eventIndex, `${kind} event ${eventIndex}`, operation);
      snapshots.push(snapshot);
      events.push({
        eventIndex,
        stepIndex: expectedTick ? trace.ticks.length - 2 : null,
        stateIndex: trace.ticks.length - 1,
        event: clone(event),
        operation: clone(operation),
        applied,
        traceTickCount: trace.ticks.length,
        snapshot,
      });

      const cancelledReplyProbe = expectations?.probes?.cancelledOldReply;
      if (cancelledReplyProbe?.afterEvent === eventIndex) {
        const evidence = applyHostStaleDelivery(cancelledReplyProbe.token, `${kind} cancelled old generation`);
        staleDeliveries.push(evidence);
        probes.push({ name: "cancelledOldReply", afterEvent: eventIndex, ...evidence });
      }
    }

    const beforeUnmount = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
    };
    const unmountResult = instance.runtime.unmount();
    const unmount = {
      result: clone(unmountResult),
      physicalDOM: physicalSnapshot(),
      rendererSnapshot: clone(instance.renderer.domSnapshot()),
      traceBefore: beforeUnmount.trace,
      traceAfter: instance.runtime.trace(),
      pendingBefore: beforeUnmount.pending,
      effectRecordsBefore: beforeUnmount.effectRecords,
      effectRecordsAfter: instance.effects.records(),
    };
    assert(unmount.physicalDOM.html === "" && unmount.physicalDOM.controls.length === 0,
      `${kind} unmount left physical DOM behind`);
    assert(unmount.rendererSnapshot.html === "" && unmount.rendererSnapshot.controls.length === 0,
      `${kind} unmount left renderer DOM behind`);

    const result = {
      schema: "gobi.compiled-children-browser-profile/v1",
      backend: kind,
      initialBackend: kind === "swap" ? "dom" : kind,
      componentId: instance.component.id,
      appId: fixture.componentID,
      trace: beforeUnmount.trace,
      events,
      actions: clickEvidence,
      snapshots,
      swaps,
      probes,
      staleDeliveries,
      effectRecords: beforeUnmount.effectRecords,
      pendingAtEnd: beforeUnmount.pending,
      rendererSequence: rendererRecords.map(({ id, backend }) => ({ id, backend })),
      callbackCounts: clone(callbackCounts),
      observations: {
        dispatch: observations.dispatch.map(({ rendererId, backend, eventIndex, observed, action, message }) =>
          ({ rendererId, backend, eventIndex, observed, action, message })),
        stale: observations.stale.map(({ rendererId, backend, eventIndex, observed, action, renderEpoch }) =>
          ({ rendererId, backend, eventIndex, observed, action, renderEpoch })),
      },
      unmount,
      pageErrors: [...pageErrors],
    };
    activeInstance = null;
    return result;
  }

  window.__gobiCompiledChildren = {
    compiled: { react: gobiReact, dom: gobiDom },
    runProfile,
    deliverStale(token, label = "probe") { return applyHostStaleDelivery(token, label); },
  };
  return { runProfile };
}
