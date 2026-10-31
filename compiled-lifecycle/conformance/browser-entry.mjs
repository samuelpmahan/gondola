import { mountLifecycleApp } from "../runtime/runtime.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { associateObservedAction } from "../../compiled-frontend/conformance/observed-action.mjs";
import {
  LIFECYCLE_PROBES,
  LIFECYCLE_STEPS,
  expectedLifecycleDOM,
  expectedLifecyclePhysicalControls,
  expectedLifecycleStateAtTick,
} from "../browser/lifecycle-oracle.mjs";

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

export function installLifecycleBrowser({ gobiCompiled, encoder }) {
  const container = document.getElementById("app");
  if (!container) throw new Error("#app container is missing");

  let activeIntent = null;
  let activeInstance = null;
  let nextRendererId = 0;
  let callbackCounts = { dispatch: 0, stale: 0 };
  let observations = { dispatch: [], stale: [] };
  let rendererRecords = [];
  let pageErrors = [];

  function associate(observed) {
    if (activeIntent === null) throw new Error("renderer callback arrived without a lifecycle Action intent");
    return associateObservedAction(observed, activeIntent);
  }

  function rendererFor(backend) {
    let core;
    if (backend === "react") core = createReactRenderer({ container });
    else if (backend === "dom") core = createDOMRenderer({ container });
    else throw new TypeError("lifecycle renderer backend must be react or dom");

    const record = {
      id: ++nextRendererId,
      backend,
      core,
      callbackBatches: [],
      lastObservation: null,
    };
    const renderer = {
      viewCapabilities: core.viewCapabilities,
      update(view, hooks) {
        const callbacks = {
          dispatch(observed, message) {
            callbackCounts.dispatch += 1;
            const action = associate(observed);
            const observation = { rendererId: record.id, backend, observed: clone(observed), action,
              message: clone(message) };
            observations.dispatch.push(observation);
            record.lastObservation = observation;
            return hooks.dispatch(action, message);
          },
          onStaleAction(observed, renderEpoch) {
            callbackCounts.stale += 1;
            const action = associate(observed);
            const observation = { rendererId: record.id, backend, observed: clone(observed), action, renderEpoch };
            observations.stale.push(observation);
            record.lastObservation = observation;
            return hooks.onStaleAction(action, renderEpoch);
          },
        };
        record.callbackBatches.push(callbacks);
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

  function physicalSnapshot(state) {
    const controls = expectedLifecyclePhysicalControls(state).map((slot) => {
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
      html: container.firstElementChild?.outerHTML ?? "",
      controls,
    };
  }

  function currentInstance() {
    if (!activeInstance) throw new Error("lifecycle profile is not mounted");
    return activeInstance;
  }

  function captureSnapshot(stepIndex, label, stateIndexOverride = null) {
    const instance = currentInstance();
    const step = LIFECYCLE_STEPS[stepIndex];
    const stateIndex = stateIndexOverride ?? step.stateIndex;
    const expectedState = expectedLifecycleStateAtTick(stateIndex);
    const trace = instance.runtime.trace();
    const tick = trace.ticks[stateIndex];
    assert(tick, `${label} is missing Go tick ${stateIndex}`);
    assert(tick.index === stateIndex, `${label} Go tick index differs`);
    const snapshot = instance.runtime.snapshot();
    const physicalDOM = physicalSnapshot(expectedState);
    return {
      eventIndex: stepIndex,
      stateIndex,
      traceTickIndex: tick.index,
      traceTick: clone(tick),
      runtimeSnapshot: clone(snapshot),
      rendererSnapshot: clone(instance.renderer.domSnapshot()),
      physicalDOM,
      expectedDOM: expectedLifecycleDOM(expectedState),
    };
  }

  function createInstance(backend, fixture) {
    assert(container.childNodes.length === 0, "#app must be empty before lifecycle profile mount");
    callbackCounts = { dispatch: 0, stale: 0 };
    observations = { dispatch: [], stale: [] };
    rendererRecords = [];
    nextRendererId = 0;
    const component = gobiCompiled.appIR.components.find((item) => item.id === fixture.componentID);
    if (!component || component.packagePath !== fixture.packagePath) {
      throw new Error("compiled lifecycle component identity differs from the frozen fixture");
    }
    const renderer = rendererFor(backend);
    const mounted = mountLifecycleApp({
      module: gobiCompiled,
      componentId: component.id,
      appId: fixture.componentID,
      encoder: { gobiEncodeState: encoder.gobiEncodeState },
      renderer,
      onFailure(failure) { pageErrors.push(failure.message); },
    });
    activeInstance = { runtime: mounted.runtime, effects: mounted.effects, renderer, fixture, component, backend };
    return activeInstance;
  }

  function applyClick(event, eventIndex) {
    const instance = currentInstance();
    const action = { path: event.path, event: event.event, value: event.value };
    const target = pathElement(action.path);
    if (!target || target.localName !== "button") throw new Error(`event ${eventIndex} target ${action.path} is missing or not a button`);
    const beforeTrace = instance.runtime.trace();
    const beforeCallbacks = clone(callbackCounts);
    const targetBefore = {
      connected: target.isConnected,
      disabled: target.disabled === true,
      value: typeof target.value === "string" ? target.value : "",
      type: target.type,
      text: target.textContent,
    };
    if (!targetBefore.connected || targetBefore.disabled) throw new Error(`event ${eventIndex} click target is disconnected or disabled`);
    if (targetBefore.value !== action.value) throw new Error(`event ${eventIndex} physical target value differs`);
    activeIntent = clone(action);
    try {
      target.click();
    } finally {
      activeIntent = null;
    }
    const trace = instance.runtime.trace();
    const callback = observations.dispatch.at(-1);
    assert(trace.ticks.length === beforeTrace.ticks.length + 1, `event ${eventIndex} click did not produce one Go tick`);
    assert(callback, `event ${eventIndex} click did not reach a renderer callback`);
    assertEqual(action, callback.action, `event ${eventIndex} renderer action`);
    assertEqual({ name: event.message.name, arg: event.message.arg },
      { name: callback.message.Name, arg: callback.message.Arg }, `event ${eventIndex} dispatched message`);
    assert(callbackCounts.dispatch === beforeCallbacks.dispatch + 1, `event ${eventIndex} must dispatch exactly once`);
    return {
      method: "HTMLElement.click",
      attempted: true,
      target: targetBefore,
      action,
      expectedMessage: clone(event.message),
      observed: clone(callback),
      beforeTicks: beforeTrace.ticks.length,
      afterTicks: trace.ticks.length,
      callbackCountsBefore: beforeCallbacks,
      callbackCountsAfter: clone(callbackCounts),
    };
  }

  function applyGoMessage(event, eventIndex) {
    const instance = currentInstance();
    const beforeTicks = instance.runtime.trace().ticks.length;
    const result = instance.runtime.dispatch(PROBE_ACTION, {
      Name: event.message.name,
      Arg: event.message.arg,
    });
    assert(result.accepted === true, `event ${eventIndex} direct Go message was rejected: ${result.error ?? "unknown"}`);
    assert(instance.runtime.trace().ticks.length === beforeTicks + 1, `event ${eventIndex} direct Go message did not add one tick`);
    return { method: "runtime.dispatch-direct-Go-message", action: clone(PROBE_ACTION), message: clone(event.message), result: clone(result) };
  }

  function applyEffectReply(event, eventIndex) {
    const instance = currentInstance();
    const beforeTicks = instance.runtime.trace().ticks.length;
    const result = instance.effects.deliver(event.token);
    assert(result.accepted === true, `event ${eventIndex} effect reply was rejected: ${result.error ?? "unknown"}`);
    assert(instance.runtime.trace().ticks.length === beforeTicks + 1, `event ${eventIndex} effect reply did not add one Go tick`);
    return { method: "manual lifecycle effect driver", token: event.token, result: clone(result) };
  }

  function retainSubtreeButtons(eventIndex) {
    const rows = [
      { path: "0/1", message: { name: "addParent", arg: "" } },
      { path: "0/2", message: { name: "requestParent", arg: "" } },
      { path: "0/3/1", message: { name: "addChild", arg: "" } },
      { path: "0/3/2", message: { name: "requestChild", arg: "" } },
      { path: "0/3/3/1", message: { name: "addGrandchild", arg: "" } },
      { path: "0/3/3/2", message: { name: "requestGrandchild", arg: "" } },
    ];
    return rows.map((row) => {
      const target = pathElement(row.path);
      if (!target || target.localName !== "button" || !target.isConnected) {
        throw new Error(`event ${eventIndex} cannot retain old subtree button ${row.path}`);
      }
      return { ...row, target, beforeRemovalConnected: target.isConnected, oldBackend: currentInstance().backend,
        oldRendererId: currentInstance().renderer.record.id };
    });
  }

  function clickRetiredSubtreeButtons(rows, eventIndex) {
    const instance = currentInstance();
    const before = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
      physicalHTML: container.innerHTML,
    };
    const attempts = [];
    for (const row of rows) {
      if (row.target.isConnected) throw new Error(`retained child target ${row.path} unexpectedly reconnected after remount`);
      const beforeTarget = {
        connected: row.target.isConnected,
        text: row.target.textContent,
        disabled: row.target.disabled === true,
      };
      activeIntent = { path: row.path, event: "click", value: "" };
      try {
        row.target.click();
      } finally {
        activeIntent = null;
      }
      attempts.push({
        path: row.path,
        message: clone(row.message),
        method: "retained-detached-HTMLElement.click",
        attempted: true,
        targetBefore: beforeTarget,
        targetConnectedAfter: row.target.isConnected,
        callbackCountsAfter: clone(callbackCounts),
      });
    }
    const after = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      callbacks: clone(callbackCounts),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
      physicalHTML: container.innerHTML,
    };
    assertEqual(before.trace, after.trace, `event ${eventIndex} detached subtree click trace fence`);
    assertEqual(before.snapshot, after.snapshot, `event ${eventIndex} detached subtree click state/view fence`);
    assertEqual(before.callbacks, after.callbacks, `event ${eventIndex} detached subtree click callback fence`);
    assertEqual(before.pending, after.pending, `event ${eventIndex} detached subtree click pending fence`);
    assertEqual(before.effectRecords, after.effectRecords, `event ${eventIndex} detached subtree click effect fence`);
    assertEqual(before.physicalHTML, after.physicalHTML, `event ${eventIndex} detached subtree click physical DOM fence`);
    return { eventIndex, before, attempts, after };
  }

  function runHarnessProbes(eventIndex) {
    const instance = currentInstance();
    const records = instance.effects.records();
    const probes = [];
    for (const probe of LIFECYCLE_PROBES.filter((item) => item.afterEvent === eventIndex)) {
      const request = records.find((record) => record.kind === "request" && record.token === probe.token);
      assert(request, `harness probe token ${probe.token} has no request correlation`);
      const beforeTicks = instance.runtime.trace().ticks.length;
      let result;
      let method;
      if (probe.expectRuntimeCompletion === "rejected-cancelled") {
        method = "forceDeliverRetired";
        result = instance.effects.forceDeliverRetired(probe.token);
      } else {
        method = "runtime.complete-duplicate";
        result = instance.runtime.complete({
          dispatchId: request.dispatchId,
          effectIndex: request.effectIndex,
          message: { name: "complete", arg: probe.token },
        });
      }
      assert(result?.accepted === false, `${method} probe unexpectedly accepted ${probe.token}`);
      assert(instance.runtime.trace().ticks.length === beforeTicks, `${method} probe ${probe.token} changed Go trace ticks`);
      probes.push({ ...clone(probe), method, request: clone(request), result: clone(result), tickCount: beforeTicks });
    }
    return probes;
  }

  function swapTo(backend, reason, action = null) {
    const instance = currentInstance();
    const previous = instance.renderer;
    const oldRendererSnapshotBefore = clone(previous.domSnapshot());
    const before = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
      diagnostics: instance.runtime.rendererDiagnostics(),
      renderer: { id: previous.record.id, backend: previous.record.backend },
      physicalHTML: container.innerHTML,
    };
    const oldRoot = container.firstElementChild;
    const initialChildren = container.childNodes.length;
    const mutationObserver = new MutationObserver(() => {});
    mutationObserver.observe(container, { childList: true });
    const next = rendererFor(backend);
    const returnedSnapshot = instance.runtime.replaceRenderer(next);
    instance.renderer = next;
    instance.backend = backend;
    const mutations = mutationObserver.takeRecords();
    mutationObserver.disconnect();

    let observedChildren = initialChildren;
    let oldRootRemoved = false;
    let newRootAdded = false;
    let emptyAfterOldRemoval = false;
    for (const mutation of mutations) {
      if ([...mutation.removedNodes].includes(oldRoot)) oldRootRemoved = true;
      if ([...mutation.addedNodes].includes(container.firstElementChild)) newRootAdded = true;
      observedChildren -= mutation.removedNodes.length;
      observedChildren += mutation.addedNodes.length;
      if (oldRootRemoved && observedChildren === 0) emptyAfterOldRemoval = true;
    }

    const afterCommit = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
      diagnostics: instance.runtime.rendererDiagnostics(),
      renderer: { id: next.record.id, backend: next.record.backend },
      returnedSnapshot,
      oldRendererSnapshot: oldRendererSnapshotBefore,
      oldRootDetached: oldRoot === null || !oldRoot.isConnected,
      oldRootEmptyDuringSwap: emptyAfterOldRemoval,
      rootMutationEvidence: { childListRecords: mutations.length, oldRootRemoved, newRootAdded, emptyAfterOldRemoval },
      physicalHTML: container.innerHTML,
    };

    assertEqual(before.trace.ticks, afterCommit.trace.ticks, `${reason} trace preservation`);
    assertEqual(before.snapshot.state, afterCommit.snapshot.state, `${reason} state preservation`);
    assertEqual(before.snapshot.view, afterCommit.snapshot.view, `${reason} view preservation`);
    assertEqual(before.pending, afterCommit.pending, `${reason} pending effect preservation`);
    assertEqual(before.effectRecords, afterCommit.effectRecords, `${reason} effect record preservation`);
    assert(afterCommit.oldRootDetached, `${reason} left old physical root attached`);
    assert(afterCommit.oldRootEmptyDuringSwap, `${reason} did not expose an empty physical root between commits`);

    const retiredRecord = previous.record;
    const callbacks = retiredRecord.callbackBatches.at(-1);
    const last = retiredRecord.lastObservation;
    if (callbacks && last) {
      const beforeFence = {
        trace: instance.runtime.trace(),
        snapshot: instance.runtime.snapshot(),
        diagnostics: instance.runtime.rendererDiagnostics(),
      };
      activeIntent = clone(last.action);
      let dispatch;
      let stale;
      try {
        dispatch = callbacks.dispatch(clone(last.observed), clone(last.message));
        stale = callbacks.onStaleAction(clone(last.observed), 0);
      } finally {
        activeIntent = null;
      }
      const afterFence = {
        trace: instance.runtime.trace(),
        snapshot: instance.runtime.snapshot(),
        diagnostics: instance.runtime.rendererDiagnostics(),
      };
      assertEqual(beforeFence.trace, afterFence.trace, `${reason} retired callback trace fence`);
      assertEqual(beforeFence.snapshot, afterFence.snapshot, `${reason} retired callback snapshot fence`);
      assert(dispatch?.accepted === false && dispatch?.stale === true, `${reason} retired dispatch callback was not fenced`);
      assert(stale?.accepted === false && stale?.stale === true, `${reason} retired stale callback was not fenced`);
      const appended = afterFence.diagnostics.fencedCallbacks.slice(beforeFence.diagnostics.fencedCallbacks.length);
      assertEqual([
        { generation: retiredRecord.id, kind: "dispatch" },
        { generation: retiredRecord.id, kind: "stale" },
      ], appended.map(({ generation, kind }) => ({ generation, kind })), `${reason} retired callback diagnostics`);
      afterCommit.retiredCallbacks = {
        eligible: true,
        rendererId: retiredRecord.id,
        action: clone(last.action),
        dispatch,
        stale,
        before: beforeFence,
        after: afterFence,
      };
    } else {
      afterCommit.retiredCallbacks = {
        eligible: false,
        reason: "retired renderer had no user action callback to retain",
        rendererId: retiredRecord.id,
        action: null,
        before: {
          trace: before.trace,
          snapshot: before.snapshot,
          diagnostics: before.diagnostics,
        },
        after: {
          trace: afterCommit.trace,
          snapshot: afterCommit.snapshot,
          diagnostics: afterCommit.diagnostics,
        },
      };
    }

    return {
      reason,
      from: before.renderer,
      to: afterCommit.renderer,
      before,
      after: afterCommit,
    };
  }

  async function runProfile({ kind, fixture, swapSchedule }) {
    if (!swapSchedule || swapSchedule.schema !== "gobi.compiled-lifecycle-swap-schedule/v1" ||
        swapSchedule.initialBackend !== "dom" || !Array.isArray(swapSchedule.backends) ||
        swapSchedule.backends.length !== 2 || !swapSchedule.backends.includes("react") || !swapSchedule.backends.includes("dom") ||
        swapSchedule.policy !== "alternate-after-each-physical-click" || swapSchedule.fixtureSwapEventIndex !== 8) {
      throw new TypeError("unsupported frozen lifecycle renderer swap schedule");
    }
    const initialBackend = kind === "swap" ? swapSchedule.initialBackend : kind;
    createInstance(initialBackend, fixture);
    const swaps = [];
    const events = [];
    const actionEvidence = [];
    const probes = [];
    const snapshots = [captureSnapshot(0, `${kind} init`, 0)];
    let retainedSubtreeButtons = null;
    const stalePhysicalClicks = [];

    for (let eventIndex = 0; eventIndex < fixture.events.length; eventIndex += 1) {
      const event = fixture.events[eventIndex];
      const step = LIFECYCLE_STEPS[eventIndex];
      const instance = currentInstance();
      const beforeTicks = instance.runtime.trace().ticks.length;
      let actionResult = null;
      let operation = null;

      if (eventIndex === 9) retainedSubtreeButtons = retainSubtreeButtons(eventIndex);

      if (event.kind === "click") {
        actionResult = applyClick(event, eventIndex);
        actionEvidence.push({ eventIndex, ...actionResult });
      } else if (event.kind === "go-message") {
        operation = applyGoMessage(event, eventIndex);
      } else if (event.kind === "effect-reply") {
        operation = applyEffectReply(event, eventIndex);
      } else if (event.kind === "renderer-swap") {
        if (kind === "swap") {
          assert(instance.backend === event.from, `fixture swap starts on ${instance.backend}, expected ${event.from}`);
          assert(event.from === swapSchedule.fixtureSwap.from && event.to === swapSchedule.fixtureSwap.to,
            `fixture swap differs from the conformance schedule`);
          swaps.push(swapTo(event.to, `fixture-renderer-swap-${eventIndex}`));
        } else {
          operation = { applied: false, reason: "static-renderer-profile" };
        }
      } else {
        throw new Error(`unsupported lifecycle event ${event.kind}`);
      }

      if (kind === "swap" && event.kind === "click") {
        const nextBackend = swapSchedule.backends.find((backend) => backend !== instance.backend);
        if (!nextBackend) throw new Error("swap schedule must contain the active backend and one alternate backend");
        swaps.push(swapTo(nextBackend, `alternate-after-click-${eventIndex}`, actionResult.action));
      }
      probes.push(...runHarnessProbes(eventIndex));

      if (eventIndex === 10) {
        if (!retainedSubtreeButtons || retainedSubtreeButtons.length !== 6) {
          throw new Error("removed subtree did not retain all six parent/child/grandchild buttons");
        }
        stalePhysicalClicks.push(clickRetiredSubtreeButtons(retainedSubtreeButtons, eventIndex));
      }

      const trace = currentInstance().runtime.trace();
      const expectedTickCount = step.stateIndex + 1;
      assert(trace.ticks.length === expectedTickCount,
        `event ${eventIndex} produced ${trace.ticks.length} ticks, expected ${expectedTickCount}`);
      if (event.kind === "renderer-swap") {
        assert(beforeTicks === expectedTickCount, `renderer swap ${eventIndex} unexpectedly changed trace ticks`);
      } else {
        assert(beforeTicks + 1 === expectedTickCount, `Go event ${eventIndex} did not add exactly one trace tick`);
      }
      const snapshot = captureSnapshot(eventIndex, `${kind} event ${eventIndex}`);
      snapshots.push(snapshot);
      events.push({
        eventIndex,
        event: clone(event),
        stateIndex: step.stateIndex,
        operation: clone(operation),
        click: clone(actionResult),
        traceTickCount: trace.ticks.length,
        snapshot,
      });
    }

    const instance = currentInstance();
    const beforeUnmount = {
      trace: instance.runtime.trace(),
      snapshot: instance.runtime.snapshot(),
      pending: instance.effects.pending(),
      effectRecords: instance.effects.records(),
    };
    const unmountResult = instance.runtime.unmount();
    const unmount = {
      result: clone(unmountResult),
      physicalDOM: { html: container.innerHTML, controls: container.querySelectorAll("button,input,textarea,select").length },
      rendererSnapshot: clone(instance.renderer.domSnapshot()),
      traceBefore: beforeUnmount.trace,
      traceAfter: instance.runtime.trace(),
      pendingBefore: beforeUnmount.pending,
      effectRecordsBefore: beforeUnmount.effectRecords,
      effectRecordsAfter: instance.effects.records(),
    };
    assert(unmount.physicalDOM.html === "" && unmount.physicalDOM.controls === 0, `${kind} unmount left physical DOM behind`);
    assert(unmount.rendererSnapshot.html === "" && unmount.rendererSnapshot.controls.length === 0,
      `${kind} unmount left renderer DOM behind`);

    const result = {
      backend: kind,
      initialBackend,
      componentId: instance.component.id,
      appId: fixture.componentID,
      trace: beforeUnmount.trace,
      events,
      actions: actionEvidence,
      snapshots,
      swaps,
      probes,
      stalePhysicalClicks,
      effectRecords: beforeUnmount.effectRecords,
      pendingAtEnd: beforeUnmount.pending,
      rendererSequence: rendererRecords.map(({ id, backend }) => ({ id, backend })),
      callbackCounts: clone(callbackCounts),
      observations: clone(observations),
      unmount,
      pageErrors: [...pageErrors],
    };
    activeInstance = null;
    return result;
  }

  return { runProfile };
}
