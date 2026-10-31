import { mountCompiledPublicationsApp } from "../runtime/runtime.mjs";
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
export function installPublicationsBrowser({ gobiReact, encoderReact, gobiDom, encoderDom, rendererDecorator = null }) {
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
      updateCount: 0,
    };
    const renderer = {
      viewCapabilities: candidateOnly ? [] : core.viewCapabilities,
      update(view, hooks) {
        const updateIndex = record.updateCount++;
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
        const getActiveEventIndex = () => activeEventIndex;
        const decoratedCallbacks = rendererDecorator?.wrapCallbacks?.({
          backend,
          rendererId: record.id,
          callbacks,
          getActiveEventIndex,
          container,
        }) ?? callbacks;
        record.callbackBatches.push({ callbacks: decoratedCallbacks, hooks });
        const result = core.update(view, decoratedCallbacks);
        rendererDecorator?.afterUpdate?.({
          backend,
          rendererId: record.id,
          updateIndex,
          container,
          core,
          view: clone(view),
          getActiveEventIndex,
          getActiveAction: () => clone(activeAction),
        });
        return result;
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

  function pathFromRoot(root, target) {
    if (!root || !target) return null;
    if (root === target) return "";
    const indexes = [];
    let node = target;
    while (node && node !== root) {
      const parent = node.parentNode;
      if (!parent) return null;
      const index = Array.prototype.indexOf.call(parent.childNodes, node);
      if (index < 0) return null;
      indexes.unshift(index);
      node = parent;
    }
    return node === root ? indexes.join("/") : null;
  }

  function actualPhysicalSnapshot() {
    const root = container.firstElementChild;
    const controls = [...container.querySelectorAll("button, input, select, textarea")].map((element) => ({
      path: pathFromRoot(root, element),
      key: element.getAttribute("data-key"),
      tag: element.localName,
      type: typeof element.type === "string" ? element.type : "",
      value: typeof element.value === "string" ? element.value : "",
      checked: typeof element.checked === "boolean" ? element.checked : false,
      disabled: element.disabled === true,
      text: element.textContent ?? "",
      outerHTML: element.outerHTML,
    }));
    return {
      normalization: "outerHTML-v1",
      html: root?.outerHTML ?? "",
      controls,
    };
  }

  function rawRead(callback) {
    try {
      return { value: clone(callback()), error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
  }

  function inspectRaw() {
    const instance = activeInstance;
    const snapshot = instance ? rawRead(() => instance.runtime.snapshot()) : { value: null, error: null };
    const trace = instance ? rawRead(() => instance.runtime.trace()) : { value: null, error: null };
    const rendererDOM = instance ? rawRead(() => instance.renderer.domSnapshot()) : { value: null, error: null };
    const effects = instance
      ? {
          records: rawRead(() => instance.effects.records()),
          pending: rawRead(() => instance.effects.pending()),
        }
      : { records: { value: [], error: null }, pending: { value: [], error: null } };
    let physicalDOM;
    let physicalDOMError = null;
    try {
      physicalDOM = actualPhysicalSnapshot();
    } catch (error) {
      physicalDOM = null;
      physicalDOMError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
    return {
      mounted: Boolean(instance),
      profile: instance?.profile ?? null,
      backend: instance?.backend ?? null,
      componentId: instance?.component?.id ?? null,
      runtime: { snapshot: snapshot.value, snapshotError: snapshot.error, trace: trace.value, traceError: trace.error },
      rendererDOM: rendererDOM.value,
      rendererDOMError: rendererDOM.error,
      physicalDOM,
      physicalDOMError,
      callbackCounts: clone(callbackCounts),
      observations: clone(observations),
      effects: { records: effects.records.value, recordsError: effects.records.error,
        pending: effects.pending.value, pendingError: effects.pending.error },
      pageErrors: [...pageErrors],
      rendererSequence: rendererRecords.map(({ id, backend }) => ({ id, backend })),
    };
  }

  let disposed = false;
  let disposeResult = null;
  function dispose() {
    if (disposed) return clone(disposeResult);
    const errors = [];
    const wasMounted = Boolean(activeInstance);
    if (activeInstance) {
      try {
        activeInstance.runtime.unmount();
      } catch (error) {
        errors.push(error instanceof Error ? `runtime.unmount: ${error.name}: ${error.message}` : `runtime.unmount: ${String(error)}`);
      }
    }
    activeInstance = null;
    try {
      rendererDecorator?.dispose?.();
    } catch (error) {
      errors.push(error instanceof Error ? `rendererDecorator.dispose: ${error.name}: ${error.message}` : `rendererDecorator.dispose: ${String(error)}`);
    }
    try {
      container.replaceChildren();
    } catch (error) {
      errors.push(error instanceof Error ? `container cleanup: ${error.name}: ${error.message}` : `container cleanup: ${String(error)}`);
      while (container.firstChild) container.removeChild(container.firstChild);
    }
    let physicalDOMCleared = false;
    try {
      physicalDOMCleared = (container.firstElementChild?.outerHTML ?? "") === "" && container.childNodes.length === 0;
    } catch (error) {
      errors.push(error instanceof Error ? `cleanup inspection: ${error.name}: ${error.message}` : `cleanup inspection: ${String(error)}`);
    }
    disposed = true;
    disposeResult = { disposed: true, wasMounted, physicalDOMCleared, errors };
    return clone(disposeResult);
  }

  function currentInstance() {
    if (!activeInstance) throw new Error("compiled publications profile is not mounted");
    return activeInstance;
  }

  function captureSnapshot(eventIndex, label) {
    const instance = currentInstance();
    const trace = instance.runtime.trace();
    const snapshot = instance.runtime.snapshot();
    const traceTick = trace.ticks.at(-1) ?? null;
    assertEqual(snapshot.state, traceTick?.state, `${label} runtime/trace state parity`);
    assertEqual(snapshot.view, traceTick?.view, `${label} runtime/trace view parity`);
    assertEqual(snapshot.dom, traceTick?.dom, `${label} runtime/trace DOM parity`);
    const rendererSnapshot = clone(instance.renderer.domSnapshot());
    const physicalDOM = physicalSnapshot(rendererSnapshot);
    assert(physicalDOM.html === rendererSnapshot.html, `${label} raw mounted DOM differs from renderer snapshot`);
    return {
      eventIndex,
      stateIndex: trace.ticks.length - 1,
      traceTickIndex: traceTick?.index ?? null,
      physicalDOM,
      pending: clone(instance.effects.pending()),
    };
  }

  function assertSnapshotAgainstLiteral(snapshot, expectations, label) {
    const projection = expectations?.stateProjections?.[snapshot.stateIndex];
    if (!projection) return;
    assertEqual(projection.dom, snapshot.physicalDOM, `${label} physical DOM literal`);
  }

  function createInstance(kind, fixture) {
    assert(container.childNodes.length === 0, "#app must be empty before compiled publications profile mount");
    callbackCounts = { dispatch: 0, stale: 0 };
    observations = { dispatch: [], stale: [] };
    rendererRecords = [];
    callbackByEvent = new Map();
    nextRendererId = 0;
    const compiled = kind === "react" ? gobiReact : gobiDom;
    const encoder = kind === "react" ? encoderReact : encoderDom;
    const component = compiled.appIR?.components?.find((item) => item.id === fixture.componentID);
    if (!component || component.packagePath !== fixture.packagePath) {
      throw new Error("compiled publications component identity differs from the frozen fixture");
    }
    const renderer = rendererFor(kind === "swap" ? "dom" : kind);
    const mounted = mountCompiledPublicationsApp({
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
      throw new Error(`event ${eventIndex} click target precondition failed: connected=${targetBefore.connected} ` +
        `disabled=${targetBefore.disabled} target=${targetBefore.outerHTML} ` +
        `root=${container.firstElementChild?.outerHTML ?? ""}`);
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
    const beforeRuntimeSnapshot = instance.runtime.snapshot();
    const beforeEffectRecords = instance.effects.records();
    const before = {
      tickCount: instance.runtime.trace().ticks.length,
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
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
      tickCount: instance.runtime.trace().ticks.length,
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
      physicalDOM: physicalSnapshot(),
    };
    assertEqual(before.tickCount, after.tickCount, `event ${eventIndex} disabled click trace fence`);
    assertEqual(beforeRuntimeSnapshot, instance.runtime.snapshot(), `event ${eventIndex} disabled click snapshot fence`);
    assertEqual(before.callbacks, after.callbacks, `event ${eventIndex} disabled click callback fence`);
    assertEqual(before.pending, after.pending, `event ${eventIndex} disabled click pending fence`);
    assertEqual(beforeEffectRecords, instance.effects.records(), `event ${eventIndex} disabled click effect fence`);
    assertEqual(before.physicalDOM, after.physicalDOM, `event ${eventIndex} disabled click DOM fence`);
    return { method: "disabled-HTMLElement.click", attempted: true, targetBefore,
      before: { tickCount: before.tickCount, callbacks: before.callbacks, pending: before.pending },
      after: { tickCount: after.tickCount, callbacks: after.callbacks, pending: after.pending },
      invariants: { traceUnchanged: true, snapshotUnchanged: true, effectsUnchanged: true, physicalDOMUnchanged: true } };
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
    return { method: "manual compiled-publications effect driver", token: event.token, result: clone(result) };
  }

  function swapRenderer(to, eventIndex, expectedOutcome) {
    const instance = currentInstance();
    const previous = instance.renderer;
    const oldRoot = container.firstElementChild;
    const initialChildren = container.childNodes.length;
    const mutationObserver = new MutationObserver(() => {});
    mutationObserver.observe(container, { childList: true });
    const beforeTrace = instance.runtime.trace();
    const beforeSnapshot = instance.runtime.snapshot();
    const beforePending = instance.effects.pending();
    const beforeEffectRecords = instance.effects.records();
    const beforePhysicalHTML = container.innerHTML;
    const before = {
      renderer: { id: previous.record.id, backend: previous.record.backend },
      tickCount: beforeTrace.ticks.length,
      pending: clone(beforePending),
    };
    const candidate = rendererFor(to);
    let error = null;
    let accepted = false;
    try {
      instance.runtime.replaceRenderer(candidate);
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
      tickCount: instance.runtime.trace().ticks.length,
      pending: instance.effects.pending(),
      renderer: { id: instance.renderer.record.id, backend: instance.renderer.record.backend },
      oldRootDetached: oldRoot === null || !oldRoot.isConnected,
      oldRootEmptyDuringSwap: emptyAfterOldRemoval,
      rootMutationEvidence: { childListRecords: mutations.length, oldRootRemoved, newRootAdded, emptyAfterOldRemoval },
    };
    const afterTrace = instance.runtime.trace();
    const afterSnapshot = instance.runtime.snapshot();
    const afterEffectRecords = instance.effects.records();
    if (accepted) {
      assertEqual(beforeTrace, afterTrace, `event ${eventIndex} compatible swap trace preservation`);
      assertEqual(beforeSnapshot.state, afterSnapshot.state, `event ${eventIndex} compatible swap state preservation`);
      assertEqual(beforeSnapshot.view, afterSnapshot.view, `event ${eventIndex} compatible swap view preservation`);
      assertEqual(beforePending, after.pending, `event ${eventIndex} compatible swap pending preservation`);
      assertEqual(beforeEffectRecords, afterEffectRecords, `event ${eventIndex} compatible swap effect preservation`);
      assert(after.oldRootDetached, `event ${eventIndex} compatible swap left old root attached`);
      assert(after.oldRootEmptyDuringSwap && after.rootMutationEvidence.oldRootRemoved && after.rootMutationEvidence.newRootAdded,
        `event ${eventIndex} compatible swap did not observe removal and replacement root mutations`);
      const oldRecord = previous.record;
      const source = callbackByEvent.get(0);
      if (!source || source.record !== oldRecord) throw new Error("compatible swap cannot find the original DOM callback to fence");
      const fenceBefore = { tickCount: instance.runtime.trace().ticks.length, snapshot: instance.runtime.snapshot() };
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
      const fenceAfter = { tickCount: instance.runtime.trace().ticks.length, snapshot: instance.runtime.snapshot() };
      assertEqual(fenceBefore.tickCount, fenceAfter.tickCount, `event ${eventIndex} retired callback trace fence`);
      assertEqual(fenceBefore.snapshot, fenceAfter.snapshot, `event ${eventIndex} retired callback snapshot fence`);
      assert(dispatch?.accepted === false && dispatch?.stale === true, `event ${eventIndex} retired dispatch callback was not fenced`);
      assert(stale?.accepted === false && stale?.stale === true, `event ${eventIndex} retired stale callback was not fenced`);
      after.retiredCallback = { sourceEvent: 0, dispatch: clone(dispatch), stale: clone(stale),
        fence: { tickCountUnchanged: true, snapshotUnchanged: true } };
    } else {
      assertEqual(beforeTrace, afterTrace, `event ${eventIndex} rejected candidate trace preservation`);
      assertEqual(beforeSnapshot, afterSnapshot, `event ${eventIndex} rejected candidate snapshot preservation`);
      assertEqual(beforePending, after.pending, `event ${eventIndex} rejected candidate pending preservation`);
      assertEqual(beforeEffectRecords, afterEffectRecords, `event ${eventIndex} rejected candidate effect preservation`);
      assertEqual(beforePhysicalHTML, container.innerHTML, `event ${eventIndex} rejected candidate physical DOM preservation`);
      after.rejectionPreserved = { trace: true, snapshot: true, pending: true, effects: true, physicalDOM: true };
      assertEqual(before.renderer, after.renderer, `event ${eventIndex} rejected candidate renderer identity`);
    }
    return { eventIndex, to, expectedOutcome, accepted, error, before, after,
      acceptedPreserved: accepted ? { trace: true, state: true, view: true, pending: true, effects: true } : null };
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
    const beforeTrace = instance.runtime.trace();
    const beforeSnapshot = instance.runtime.snapshot();
    const beforeEffectRecords = instance.effects.records();
    const before = {
      tickCount: beforeTrace.ticks.length,
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
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
    const afterTrace = instance.runtime.trace();
    const afterSnapshot = instance.runtime.snapshot();
    const afterEffectRecords = instance.effects.records();
    const after = {
      tickCount: afterTrace.ticks.length,
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
    };
    assert(result?.accepted === false && result?.stale === true,
      `event ${eventIndex} retired renderer callback was not fenced`);
    assertEqual(beforeTrace, afterTrace, `event ${eventIndex} retired callback trace fence`);
    assertEqual(beforeSnapshot, afterSnapshot, `event ${eventIndex} retired callback snapshot fence`);
    assertEqual(before.pending, after.pending, `event ${eventIndex} retired callback pending fence`);
    assertEqual(beforeEffectRecords, afterEffectRecords, `event ${eventIndex} retired callback effect fence`);
    return { method: "retained-retired-renderer.dispatch", sourceEvent: event.sourceEvent, result: clone(result),
      before, after, invariants: { traceUnchanged: true, snapshotUnchanged: true, pendingUnchanged: true, effectsUnchanged: true } };
  }

  function applyHostStaleDelivery(token, label) {
    const instance = currentInstance();
    const beforeTrace = instance.runtime.trace();
    const beforeSnapshot = instance.runtime.snapshot();
    const before = { tickCount: beforeTrace.ticks.length, pending: instance.effects.pending() };
    const result = instance.effects.deliver(token);
    const afterTrace = instance.runtime.trace();
    const afterSnapshot = instance.runtime.snapshot();
    const after = { tickCount: afterTrace.ticks.length, pending: instance.effects.pending() };
    assert(result?.accepted === false, `${label} stale effect delivery unexpectedly succeeded`);
    assertEqual(beforeTrace, afterTrace, `${label} stale delivery trace fence`);
    assertEqual(beforeSnapshot, afterSnapshot, `${label} stale delivery snapshot fence`);
    assertEqual(before.pending, after.pending, `${label} stale delivery pending fence`);
    return { token, result: clone(result), before, after,
      invariants: { traceUnchanged: true, snapshotUnchanged: true, pendingUnchanged: true } };
  }

  async function runProfile({ kind, fixture, expectations }) {
    if (!["react", "dom", "swap"].includes(kind)) throw new TypeError(`unknown publications browser profile ${kind}`);
    createInstance(kind, fixture);
    const instance = currentInstance();
    const events = [];
    const initialSnapshot = captureSnapshot(null, `${kind} init`);
    assertSnapshotAgainstLiteral(initialSnapshot, expectations, `${kind} init`);
    const snapshots = [initialSnapshot];
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
        throw new Error(`unsupported compiled publications event kind ${event.kind}`);
      }

      const trace = instance.runtime.trace();
      const expectedTick = ["click", "go-message", "effect-reply"].includes(event.kind);
      if (expectedTick && trace.ticks.length !== beforeTicks + 1) {
        throw new Error(`event ${eventIndex} did not produce exactly one Go tick`);
      }
      if (!expectedTick && trace.ticks.length !== beforeTicks) {
        throw new Error(`tick-free event ${eventIndex} unexpectedly changed Go trace`);
      }
      const snapshot = captureSnapshot(eventIndex, `${kind} event ${eventIndex}`);
      assertSnapshotAgainstLiteral(snapshot, expectations, `${kind} event ${eventIndex}`);
      snapshots.push(snapshot);
      events.push({
        eventIndex,
        stepIndex: expectedTick ? trace.ticks.length - 2 : null,
        stateIndex: trace.ticks.length - 1,
        event: clone(event),
        operation: clone(operation),
        applied,
        traceTickCount: trace.ticks.length,
        snapshotIndex: eventIndex + 1,
      });

      const cancelledReplyProbe = expectations?.probes?.cancelledOldReply;
      if (cancelledReplyProbe?.afterEvent === eventIndex) {
        const evidence = applyHostStaleDelivery(cancelledReplyProbe.token, `${kind} cancelled old generation`);
        staleDeliveries.push(evidence);
        probes.push({ name: "cancelledOldReply", afterEvent: eventIndex, ...evidence });
      }
    }

    const beforeUnmountTrace = instance.runtime.trace();
    const beforeUnmountPending = instance.effects.pending();
    const beforeUnmountEffects = instance.effects.records();
    const unmountResult = instance.runtime.unmount();
    const afterUnmountTrace = instance.runtime.trace();
    const physicalDOMAfterUnmount = physicalSnapshot();
    const rendererDOMAfterUnmount = instance.renderer.domSnapshot();
    const effectsAfterUnmount = instance.effects.records();
    const unmount = {
      result: clone(unmountResult),
      physicalDOMCleared: physicalDOMAfterUnmount.html === "" && physicalDOMAfterUnmount.controls.length === 0,
      rendererDOMCleared: rendererDOMAfterUnmount.html === "" && rendererDOMAfterUnmount.controls.length === 0,
      traceTickCountBefore: beforeUnmountTrace.ticks.length,
      traceTickCountAfter: afterUnmountTrace.ticks.length,
      pendingAtUnmount: clone(beforeUnmountPending),
      effectRecordCountBefore: beforeUnmountEffects.length,
      effectRecordCountAfter: effectsAfterUnmount.length,
    };
    assert(unmount.physicalDOMCleared,
      `${kind} unmount left physical DOM behind`);
    assert(unmount.rendererDOMCleared,
      `${kind} unmount left renderer DOM behind`);
    assertEqual(beforeUnmountTrace, afterUnmountTrace, `${kind} unmount trace preservation`);
    assertEqual(beforeUnmountEffects, effectsAfterUnmount, `${kind} unmount effect preservation`);

    const result = {
      schema: "gobi.compiled-publications-browser-profile/v1",
      backend: kind,
      initialBackend: kind === "swap" ? "dom" : kind,
      componentId: instance.component.id,
      appId: fixture.componentID,
      trace: beforeUnmountTrace,
      events,
      actions: clickEvidence,
      snapshots,
      swaps,
      probes,
      staleDeliveries,
      effectRecords: beforeUnmountEffects,
      pendingAtEnd: beforeUnmountPending,
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

  window.__gobiCompiledPublications = {
    compiled: { react: gobiReact, dom: gobiDom },
    runProfile,
    deliverStale(token, label = "probe") { return applyHostStaleDelivery(token, label); },
    inspectRaw,
    dispose,
  };
  return { runProfile, inspectRaw, dispose };
}
