import { mountCompiledModulePair } from "../runtime/runtime.mjs";
import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";

const ACTION_PROBE = Object.freeze({ path: "", event: "click", value: "" });

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function need(condition, message) {
  if (!condition) throw new Error(message);
}

function messageJSON(value) {
  if (value == null) return null;
  return { name: value.Name ?? value.name, arg: value.Arg ?? value.arg ?? "" };
}

function instrumentSide(source, label, counts) {
  const component = source.compiled.appIR.components.find((item) => item.id === source.componentId);
  if (!component) throw new Error(`${label} component is missing from its AppIR`);
  const roleMap = new Map([
    [component.init, `${label}.Init`],
    [component.update, `${label}.Update`],
    [component.view, `${label}.View`],
  ]);
  for (const role of roleMap.values()) counts[role] = 0;
  const symbols = {};
  for (const [symbol, fn] of Object.entries(source.compiled.symbols)) {
    symbols[symbol] = (...args) => {
      const role = roleMap.get(symbol);
      if (role) counts[role] = (counts[role] ?? 0) + 1;
      return fn(...args);
    };
  }
  const bridges = {};
  for (const [role, fn] of Object.entries(source.bridges)) {
    const name = `${label}.${role}`;
    counts[name] = 0;
    bridges[role] = (...args) => {
      counts[name] = (counts[name] ?? 0) + 1;
      return fn(...args);
    };
  }
  return {
    module: { schema: source.compiled.schema, appIR: source.compiled.appIR, symbols },
    bridges,
    encoder: source.encoder,
    descriptor: source.descriptor,
    descriptorBytes: source.descriptorBytes,
    artifactBytes: source.artifactBytes,
    componentId: source.componentId,
  };
}

function physicalDOM(sideRoot) {
  const root = sideRoot?.firstElementChild ?? null;
  const controls = [];
  if (root) {
    const elements = root.querySelectorAll("button,input,select,textarea");
    for (const element of elements) {
      const parts = [];
      let current = element;
      while (current && current !== root) {
        const parent = current.parentNode;
        if (!parent) throw new Error("physical control is detached while capturing its DOM path");
        parts.unshift(String([...parent.childNodes].indexOf(current)));
        current = parent;
      }
      controls.push({
        path: parts.join("/"),
        key: element.getAttribute("data-gobi-key") ?? "",
        tag: element.localName,
        type: typeof element.type === "string" ? element.type : "",
        value: typeof element.value === "string" ? element.value : "",
        checked: typeof element.checked === "boolean" ? element.checked : false,
        disabled: element.disabled === true,
      });
    }
  }
  return {
    normalization: "outerHTML-v1",
    html: root?.outerHTML ?? "",
    controls,
  };
}

function pathTarget(sideRoot, path) {
  let current = sideRoot?.firstElementChild ?? null;
  if (!current) return null;
  if (path === "") return current;
  for (const part of path.split("/")) {
    if (!/^(0|[1-9][0-9]*)$/.test(part)) throw new TypeError(`invalid canonical DOM path ${JSON.stringify(path)}`);
    const index = Number(part);
    if (!Number.isSafeInteger(index)) throw new TypeError("DOM path is outside the safe integer range");
    current = current?.childNodes?.[index] ?? null;
  }
  return current?.nodeType === Node.ELEMENT_NODE ? current : null;
}

function createRenderer(kind, container, callbacks, rendererUpdateCounts, onFailure) {
  const core = kind === "react"
    ? createReactRenderer({ container, onFailure })
    : createDOMRenderer({ container, onFailure });
  const wrapped = {
    viewCapabilities: core.viewCapabilities,
    update(view, hooks) {
      const captured = {
        dispatch(action, message) {
          callbacks.dispatch += 1;
          const observed = {
            sourceEventIndex: callbacks.sourceEventIndex,
            rendererKind: kind,
            action: clone(action),
            message: clone(message),
          };
          callbacks.observations.push(observed);
          callbacks.lastDispatch = observed;
          callbacks.lastDispatchInvocation = { action: clone(action), message: clone(message), result: null };
          const result = hooks.dispatch(action, message);
          callbacks.lastDispatchInvocation.result = clone(result ?? null);
          if (Number.isSafeInteger(callbacks.sourceEventIndex)) {
            callbacks.bySourceEvent.set(callbacks.sourceEventIndex, {
              rendererKind: kind,
              action: clone(action),
              message: clone(message),
              invoke: () => captured.dispatch(action, message),
            });
          }
          return result;
        },
        onStaleAction(action, renderEpoch) {
          callbacks.stale += 1;
          const observed = {
            sourceEventIndex: callbacks.sourceEventIndex,
            rendererKind: kind,
            action: clone(action),
            renderEpoch,
          };
          callbacks.staleObservations.push(observed);
          return hooks.onStaleAction(action, renderEpoch);
        },
      };
      rendererUpdateCounts[kind] = (rendererUpdateCounts[kind] ?? 0) + 1;
      return core.update(view, captured);
    },
    viewRecord: (...args) => core.viewRecord(...args),
    domSnapshot: (...args) => core.domSnapshot(...args),
    unmount: (...args) => core.unmount(...args),
    focusState: (...args) => core.focusState?.(...args) ?? null,
    restoreFocus: (...args) => core.restoreFocus?.(...args) ?? false,
  };
  return wrapped;
}

function rendererRegistry(callbacks, rendererFactoryCounts, rendererUpdateCounts, failures) {
  rendererFactoryCounts.dom = 0;
  rendererFactoryCounts.react = 0;
  rendererUpdateCounts.dom = 0;
  rendererUpdateCounts.react = 0;
  return {
    dom: ({ container, onFailure }) => {
      rendererFactoryCounts.dom = (rendererFactoryCounts.dom ?? 0) + 1;
      return createRenderer("dom", container, callbacks, rendererUpdateCounts, (error) => {
      failures.push(error.message);
      onFailure?.(error);
      });
    },
    react: ({ container, onFailure }) => {
      rendererFactoryCounts.react = (rendererFactoryCounts.react ?? 0) + 1;
      return createRenderer("react", container, callbacks, rendererUpdateCounts, (error) => {
      failures.push(error.message);
      onFailure?.(error);
      });
    },
  };
}

function scenarioRows(fixture, addSeedSwaps) {
  const rows = fixture.events.map((event, sourceEventIndex) => ({ kind: "source", sourceEventIndex, event }));
  if (!addSeedSwaps) return rows;
  const output = [];
  for (const row of rows) {
    output.push(row);
    if (row.sourceEventIndex === 19) {
      output.push({ kind: "injected-swap", sourceEventIndex: null, event: { kind: "renderer-swap", from: "dom", to: "react", expect: "accepted" } });
      output.push({ kind: "injected-stale", sourceEventIndex: null, event: { kind: "stale-callback", sourceEvent: 0 } });
    }
    if (row.sourceEventIndex === 29) {
      output.push({ kind: "injected-swap", sourceEventIndex: null, event: { kind: "renderer-swap", from: "react", to: "dom", expect: "accepted" } });
    }
  }
  return output;
}

export function installCompiledModulePairBrowser({ modules }) {
  const container = document.getElementById("app");
  const admissionContainer = document.getElementById("admission");
  if (!container || !admissionContainer) throw new Error("#app and #admission containers are required");

  async function rejectInvalidABI(pair, kind) {
    const beforeHTML = admissionContainer.outerHTML;
    const roleCounts = {};
    const parent = instrumentSide(pair.parent, "parent", roleCounts);
    const child = instrumentSide(pair.child, "child", roleCounts);
    const badDescriptor = { ...child.descriptor, abiSHA256: "0".repeat(64) };
    const badChild = {
      ...child,
      descriptor: badDescriptor,
      descriptorBytes: new TextEncoder().encode(JSON.stringify(badDescriptor)),
    };
    const rendererFactoryCounts = {};
    const rendererUpdateCounts = {};
    const callbacks = { dispatch: 0, stale: 0, sourceEventIndex: null, observations: [], staleObservations: [], bySourceEvent: new Map() };
    const renderers = rendererRegistry(callbacks, rendererFactoryCounts, rendererUpdateCounts, []);
    let error = null;
    try {
      await mountCompiledModulePair({
        parent, child: badChild, container: admissionContainer, renderers, backend: kind,
      });
    } catch (caught) {
      error = { name: caught?.name ?? "Error", message: String(caught?.message ?? caught) };
    }
    const afterHTML = admissionContainer.outerHTML;
    need(error !== null, "invalid ABI pair unexpectedly mounted");
    need(Object.values(roleCounts).every((count) => count === 0), "invalid ABI pair called a Go role before rejection");
    need(Object.values(rendererFactoryCounts).every((count) => count === 0), "invalid ABI pair called a renderer factory before rejection");
    need(Object.values(rendererUpdateCounts).every((count) => count === 0), "invalid ABI pair updated a renderer before rejection");
    need(beforeHTML === afterHTML && admissionContainer.childNodes.length === 0, "invalid ABI pair mutated the caller DOM");
    return {
      accepted: false,
      error,
      roleCounts,
      rendererFactoryCounts,
      rendererUpdateCounts,
      callerDOMBefore: beforeHTML,
      callerDOMAfter: afterHTML,
      callerDOMUnchanged: beforeHTML === afterHTML,
    };
  }

  async function runProfile({ kind, fixture, runId = null, seed = null, injectSeedSwaps = false }) {
    if (!["react", "dom", "swap"].includes(kind)) throw new TypeError(`unknown profile ${kind}`);
    if (container.childNodes.length !== 0 || admissionContainer.childNodes.length !== 0) {
      throw new Error("profile containers must be empty before each isolated mount");
    }
    const buildKind = kind === "swap" ? "dom" : kind;
    const sourcePair = modules[buildKind];
    if (!sourcePair?.parent || !sourcePair?.child) throw new Error(`missing compiled module pair for ${buildKind}`);
    const roleCounts = {};
    const rendererFactoryCounts = {};
    const rendererUpdateCounts = {};
    const failures = [];
    const callbacks = {
      dispatch: 0,
      stale: 0,
      sourceEventIndex: null,
      observations: [],
      staleObservations: [],
      bySourceEvent: new Map(),
      lastDispatch: null,
      lastDispatchInvocation: null,
    };
    const parent = instrumentSide(sourcePair.parent, "parent", roleCounts);
    const child = instrumentSide(sourcePair.child, "child", roleCounts);
    const selectedBackend = kind === "swap" ? "dom" : kind;
    const mountResult = await rejectInvalidABI(sourcePair, selectedBackend);
    const pair = await mountCompiledModulePair({
      parent,
      child,
      container,
      renderers: rendererRegistry(callbacks, rendererFactoryCounts, rendererUpdateCounts, failures),
      backend: selectedBackend,
      onFailure(error) { failures.push(error.message); },
    });
    if (failures.length !== 0) throw new Error(`module pair mount failure: ${failures.join(" | ")}`);
    const initialTrace = pair.trace();
    const initial = pair.snapshot();
    const initialPhysical = {
      parent: physicalDOM(container.querySelector('[data-gobi-module-root="parent"]')),
      child: physicalDOM(container.querySelector('[data-gobi-module-root="child"]')),
    };
    const snapshots = [{ eventIndex: null, stateIndex: initialTrace.checkpoints.length - 1, snapshot: initial, physical: initialPhysical,
      callCounts: clone(initialTrace.callCounts), bridgeCallCount: initialTrace.bridgeCalls.length }];
    const events = [];
    const sourceRows = scenarioRows(fixture, injectSeedSwaps && kind === "swap");
    let activeBackend = selectedBackend;

    async function runSwap(event, label) {
      const beforeTrace = pair.trace();
      const beforeSnapshot = pair.snapshot();
      const beforePhysical = {
        parent: physicalDOM(container.querySelector('[data-gobi-module-root="parent"]')),
        child: physicalDOM(container.querySelector('[data-gobi-module-root="child"]')),
      };
      if (event.from !== activeBackend) throw new Error(`${label} renderer swap expected from=${event.from}, current=${activeBackend}`);
      if (!Object.hasOwn(modules, event.to)) throw new Error(`${label} renderer swap target ${event.to} is unavailable`);
      const result = pair.replaceBackend(event.to);
      activeBackend = event.to;
      const afterTrace = pair.trace();
      const afterSnapshot = pair.snapshot();
      const afterPhysical = {
        parent: physicalDOM(container.querySelector('[data-gobi-module-root="parent"]')),
        child: physicalDOM(container.querySelector('[data-gobi-module-root="child"]')),
      };
      need(equal(beforeTrace.callCounts, afterTrace.callCounts), `${label} renderer swap called a Go role or bridge`);
      need(equal(beforeSnapshot.parent.state, afterSnapshot.parent.state) && equal(beforeSnapshot.child.state, afterSnapshot.child.state),
        `${label} renderer swap changed module state`);
      need(equal(beforeSnapshot.parent.view, afterSnapshot.parent.view) && equal(beforeSnapshot.child.view, afterSnapshot.child.view),
        `${label} renderer swap changed cached View records`);
      need(equal(beforePhysical.parent, afterPhysical.parent) && equal(beforePhysical.child, afterPhysical.child),
        `${label} renderer swap changed physical DOM projection`);
      return { accepted: true, from: event.from, to: event.to, beforeCallCounts: beforeTrace.callCounts,
        afterCallCounts: afterTrace.callCounts, result: clone(result), callOrder: afterTrace.callOrder.slice(beforeTrace.callOrder.length) };
    }

    function takeEvent(eventIndex, sourceEvent, operation, before, runtimeEvent, physicalClick = null) {
      const trace = pair.trace();
      const snapshot = pair.snapshot();
      const physical = {
        parent: physicalDOM(container.querySelector('[data-gobi-module-root="parent"]')),
        child: physicalDOM(container.querySelector('[data-gobi-module-root="child"]')),
      };
      snapshots.push({ eventIndex, stateIndex: trace.checkpoints.length - 1, snapshot, physical,
        callCounts: clone(trace.callCounts), bridgeCallCount: trace.bridgeCalls.length });
      events.push({
        eventIndex,
        sourceEvent,
        sourceEventIndex: eventIndex,
        kind: sourceEvent?.kind ?? "host-probe",
        target: sourceEvent?.target ?? null,
        action: clone(sourceEvent?.action ?? null),
        message: clone(operation?.message ?? null),
        dispatched: operation?.dispatched === true,
        suppressed: operation?.suppressed === true,
        stale: operation?.stale === true,
        operation: clone(operation),
        physicalClick: clone(physicalClick),
        runtimeEvent: clone(runtimeEvent),
        bridgeCalls: clone(runtimeEvent?.bridgeCalls ?? []),
        callOrder: clone(runtimeEvent?.callOrder ?? []),
        callCountsBefore: clone(before.callCounts),
        callCountsAfter: clone(trace.callCounts),
        bridgeCallCountBefore: before.bridgeCallCount,
        bridgeCallCountAfter: trace.bridgeCalls.length,
      });
      return trace;
    }

    for (const row of sourceRows) {
      const event = row.event;
      const eventIndex = row.sourceEventIndex;
      const label = eventIndex === null ? `${kind}:${row.kind}` : `${kind}:event:${eventIndex}`;
      const beforeTrace = pair.trace();
      const beforeEventsLength = beforeTrace.events.length;
      const before = { callCounts: clone(beforeTrace.callCounts), bridgeCallCount: beforeTrace.bridgeCalls.length,
        callbackCounts: { dispatch: callbacks.dispatch, stale: callbacks.stale },
        checkpointCount: beforeTrace.checkpoints.length };
      let operation = null;
      let physicalClick = null;
      let runtimeEvent = null;

      if (event.kind === "click" || event.kind === "disabled-action") {
        const sideRoot = container.querySelector(`[data-gobi-module-root="${event.target}"]`);
        const target = pathTarget(sideRoot, event.action.path);
        need(target?.localName === "button", `${label} physical path did not resolve to a button`);
        need(target.isConnected, `${label} physical target is disconnected`);
        const isDisabled = target.disabled === true;
        const targetBefore = { connected: target.isConnected, disabled: isDisabled, type: target.type,
          value: typeof target.value === "string" ? target.value : "", text: target.textContent, outerHTML: target.outerHTML };
        if (event.kind === "disabled-action" && !isDisabled) throw new Error(`${label} expected a disabled physical control`);
        if (event.action.value !== targetBefore.value) {
          throw new Error(`${label} action value differs from actual event target value`);
        }
        callbacks.sourceEventIndex = eventIndex;
        const callbackBefore = callbacks.dispatch;
        const observationBefore = callbacks.observations.length;
        const traceBefore = pair.trace();
        target.click();
        callbacks.sourceEventIndex = null;
        const traceAfter = pair.trace();
        const callbackDelta = callbacks.dispatch - callbackBefore;
        if (isDisabled) {
          need(callbackDelta === 0, `${label} disabled physical click invoked renderer callback`);
          need(traceAfter.checkpoints.length === traceBefore.checkpoints.length,
            `${label} disabled physical click caused a Go update`);
          const suppressed = pair.recordSuppressedAction(event.target, event.action);
          need(suppressed?.accepted === true && suppressed?.suppressed === true,
            `${label} host did not record the physically suppressed disabled action`);
        } else {
          need(callbackDelta === 1, `${label} enabled physical click did not invoke exactly one renderer callback`);
          need(traceAfter.checkpoints.length === traceBefore.checkpoints.length + 1,
            `${label} enabled physical click did not produce exactly one Go transaction`);
          const observed = callbacks.lastDispatch;
          need(observed && equal(event.action, observed.action), `${label} renderer callback Action differs from physical target`);
          if (callbacks.lastDispatchInvocation?.result?.accepted === false) {
            throw new Error(`${label} callback dispatch failed: ${callbacks.lastDispatchInvocation.result.error}`);
          }
        }
        const observed = callbacks.observations.length > observationBefore ? callbacks.observations.at(-1) : null;
        physicalClick = {
          method: "HTMLElement.click",
          attempted: true,
          targetBefore,
          targetAfter: { connected: target.isConnected, disabled: target.disabled === true, outerHTML: target.outerHTML },
          callbackInvocations: callbackDelta,
          expectedMessage: isDisabled ? null : event.message ?? null,
          observed: clone(observed),
          beforeTraceEvents: traceBefore.events.length,
          afterTraceEvents: traceAfter.events.length,
          beforeCheckpoints: traceBefore.checkpoints.length,
          afterCheckpoints: traceAfter.checkpoints.length,
        };
        operation = { dispatched: !isDisabled, suppressed: isDisabled,
          message: observed ? messageJSON(observed.message) : null };
      } else if (event.kind === "go-message") {
        const result = pair.dispatchGoMessage(event.target, { Name: event.message.name, Arg: event.message.arg });
        if (result?.accepted !== true) throw new Error(`${label} direct Go message rejected: ${result?.error ?? "unknown"}`);
        operation = { dispatched: true, suppressed: false, message: clone(event.message), result: clone(result) };
      } else if (event.kind === "renderer-swap") {
        if (kind === "swap") {
          const result = await runSwap(event, label);
          operation = { dispatched: false, suppressed: false, swap: result };
        } else {
          operation = { dispatched: false, suppressed: false, applied: false, reason: "static-renderer-profile" };
        }
      } else if (event.kind === "stale-callback") {
        if (kind === "swap") {
          const captured = callbacks.bySourceEvent.get(event.sourceEvent);
          need(captured, `${label} has no actual callback captured from source event ${event.sourceEvent}`);
          callbacks.sourceEventIndex = eventIndex;
          const result = captured.invoke();
          callbacks.sourceEventIndex = null;
          need(result?.accepted === false && result?.stale === true, `${label} old callback was not rejected as stale`);
          operation = { dispatched: false, stale: true, sourceEvent: event.sourceEvent, result: clone(result),
            callbackInvocations: callbacks.dispatch - before.callbackCounts.dispatch };
        } else {
          operation = { dispatched: false, stale: false, applied: false, reason: "static-renderer-profile" };
        }
      } else {
        throw new Error(`${label} unsupported event kind ${event.kind}`);
      }

      const afterTrace = pair.trace();
      if (afterTrace.events.length > beforeEventsLength) runtimeEvent = afterTrace.events.at(-1);
      takeEvent(eventIndex, event, operation, before, runtimeEvent, physicalClick);
      if (row.kind !== "source") {
        const lastEvent = events.at(-1);
        lastEvent.hostProbe = row.kind;
        lastEvent.sourceEventIndex = null;
      }
    }

    const finalTrace = pair.trace();
    const finalSnapshot = pair.snapshot();
    const finalPhysical = {
      parent: physicalDOM(container.querySelector('[data-gobi-module-root="parent"]')),
      child: physicalDOM(container.querySelector('[data-gobi-module-root="child"]')),
    };
    const unmountBefore = { parent: finalPhysical.parent, child: finalPhysical.child };
    const unmountResult = pair.unmount();
    const unmountAfter = { parent: physicalDOM(container.querySelector('[data-gobi-module-root="parent"]')),
      child: physicalDOM(container.querySelector('[data-gobi-module-root="child"]')) };
    need(unmountAfter.parent.html === "" && unmountAfter.child.html === "", `${kind} unmount left module DOM mounted`);
    need(container.childNodes.length === 0, `${kind} unmount left caller roots attached`);
    return {
      schema: "gobi.compiled-modules-browser-profile/v1",
      profile: kind,
      runId,
      seed,
      initialBackend: selectedBackend,
      sourceEventCount: fixture.events.length,
      events,
      snapshots,
      trace: finalTrace,
      finalSnapshot,
      finalPhysical,
      callCounts: clone(finalTrace.callCounts),
      callbackCounts: { dispatch: callbacks.dispatch, stale: callbacks.stale },
      callbackObservations: clone(callbacks.observations),
      staleObservations: clone(callbacks.staleObservations),
      roleCallCounts: clone(roleCounts),
      rendererFactoryCounts: clone(rendererFactoryCounts),
      rendererUpdateCounts: clone(rendererUpdateCounts),
      abiAdmission: mountResult,
      failures,
      unmount: { result: clone(unmountResult), before: unmountBefore, after: unmountAfter },
    };
  }

  return { runProfile };
}
