import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { mountCompiledKeyedModules } from "../runtime/runtime.mjs";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function need(condition, message) {
  if (!condition) throw new Error(message);
}

function messageValue(value) {
  if (value === null || value === undefined) return null;
  return { name: value.Name ?? value.name, arg: value.Arg ?? value.arg ?? "" };
}

function wirePublication(value) {
  if (value === null || value === undefined) return null;
  return { Count: value.Count ?? value.count, Revision: value.Revision ?? value.revision };
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createWrappedRenderer(kind, container, currentSourceIndex, callbackState, onFailure) {
  const renderer = kind === "react"
    ? createReactRenderer({ container, onFailure })
    : createDOMRenderer({ container, onFailure });
  return {
    viewCapabilities: renderer.viewCapabilities,
    update(view, callbacks) {
      const key = container.getAttribute("data-gobi-key");
      const wrapped = {
        dispatch(action, message) {
          const observation = {
            channel: "dispatch",
            sourceEventIndex: currentSourceIndex.value,
            rendererBackend: kind,
            key,
            action: clone(action),
            message: clone(message),
            result: null,
          };
          callbackState.observations.push(observation);
          const result = callbacks.dispatch(action, message);
          observation.result = clone(result ?? null);
          if (Number.isSafeInteger(currentSourceIndex.value) && currentSourceIndex.value >= 0) {
            callbackState.byObservedSource.set(currentSourceIndex.value, {
              key,
              action: clone(action),
              message: clone(message),
              result: clone(result ?? null),
            });
          }
          return result;
        },
        onStaleAction(action, epoch) {
          if (typeof callbacks.onStaleAction === "function") return callbacks.onStaleAction(action, epoch);
          return undefined;
        },
      };
      if (typeof callbacks.publish === "function") {
        wrapped.publish = (publication) => {
          const observation = {
            channel: "publish",
            sourceEventIndex: currentSourceIndex.value,
            rendererBackend: kind,
            key,
            publication: clone(publication),
            result: null,
          };
          callbackState.observations.push(observation);
          const result = callbacks.publish(publication);
          observation.result = clone(result ?? null);
          return result;
        };
      }
      if (Number.isSafeInteger(currentSourceIndex.value) && currentSourceIndex.value >= 0 && key !== null) {
        callbackState.bySource.set(`${currentSourceIndex.value}|${key}`, { callbacks: wrapped, key, rendererBackend: kind });
      }
      return renderer.update(view, wrapped);
    },
    viewRecord: (...args) => renderer.viewRecord(...args),
    domSnapshot: (...args) => renderer.domSnapshot(...args),
    unmount: (...args) => renderer.unmount(...args),
  };
}

function domNodeIdFactory() {
  const ids = new WeakMap();
  let next = 1;
  return (node) => {
    if (!node || (typeof node !== "object" && typeof node !== "function")) return null;
    if (!ids.has(node)) ids.set(node, `dom-${next++}`);
    return ids.get(node);
  };
}

function currentIdentity(handle, container, backend, domId) {
  const mounted = handle.mountedHandles();
  return {
    rendererBackend: backend,
    containerOrder: [...container.children].map((root) => root.getAttribute("data-gobi-module-root") === "parent"
      ? "parent" : root.getAttribute("data-gobi-key")),
    childInitCalls: handle.trace().callCounts.childInit,
    children: mounted.children.map(({ key, generation, root }) => {
      const add = handle.elementAtPath("child", key, "2/1");
      return {
        key,
        generation,
        logicalInstanceId: `${key}:${generation}`,
        rootDOMId: domId(root),
        contentDOMId: domId(root.firstElementChild),
        addControlDOMId: domId(add),
        addControlDisabled: add?.disabled === true,
      };
    }),
  };
}

function expectedMessage(event) {
  if (event === null || event === undefined) return null;
  return { name: event.Name ?? event.name, arg: event.Arg ?? event.arg ?? "" };
}

function snapshotStructure(snapshot) {
  return {
    parentState: snapshot.parent.state,
    controllerState: snapshot.parent.controllerState,
    parentView: snapshot.parent.view,
    children: snapshot.children.map((child) => ({ key: child.key, generation: child.generation, input: child.input,
      childState: child.childState, publication: child.publication, view: child.view })),
  };
}

function rawEventRecord(sourceEvent, eventIndex, result, runtimeEvent, observation, domClick, nativeRow) {
  return {
    eventIndex,
    sourceEvent: clone(sourceEvent),
    inputKind: sourceEvent.kind,
    target: sourceEvent.target ?? null,
    key: sourceEvent.key ?? null,
    generation: sourceEvent.generation ?? null,
    action: clone(sourceEvent.action ?? null),
    requestedMessage: nativeRow.accepted === true ? expectedMessage(nativeRow.message) : null,
    declaredHandlerMessage: expectedMessage(nativeRow.message),
    observedMessage: messageValue(observation?.message),
    message: messageValue(runtimeEvent?.message),
    nativeAccepted: nativeRow.accepted === true,
    dispatched: runtimeEvent?.dispatched === true,
    suppressed: runtimeEvent?.suppressed === true,
    stale: runtimeEvent?.stale === true || runtimeEvent?.kind === "stale-publication",
    sourceEventIndex: sourceEvent.sourceEvent ?? null,
    result: clone(result ?? null),
    runtimeEvent: clone(runtimeEvent),
    domClick: clone(domClick),
    bridgeCalls: clone(runtimeEvent?.bridgeCalls ?? []),
    callOrder: clone(runtimeEvent?.callOrder ?? []),
    callCountsBefore: clone(runtimeEvent?.callCountsBefore ?? null),
    callCountsAfter: clone(runtimeEvent?.callCountsAfter ?? null),
  };
}

export function installKeyedConformanceBrowser({ modules }) {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app container is required");
  const domId = domNodeIdFactory();

  async function runProfile({ profile, scenario, native, seed = null }) {
    if (!["react", "dom", "swap"].includes(profile)) throw new TypeError(`unsupported keyed profile ${profile}`);
    const startBackend = profile === "swap" ? "dom" : profile;
    const moduleBackend = profile === "react" ? "react" : "dom";
    const build = modules[moduleBackend];
    if (!build?.parent || !build?.child) throw new TypeError(`missing ${moduleBackend} keyed module pair`);
    if (app.childNodes.length !== 0) throw new Error("profile container must be empty before mount");
    const container = document.createElement("div");
    container.setAttribute("data-profile", profile);
    app.appendChild(container);
    const currentSourceIndex = { value: null };
    const callbackState = { observations: [], bySource: new Map(), byObservedSource: new Map() };
    const failures = [];
    const renderers = {
      dom: ({ container: root, onFailure }) => createWrappedRenderer("dom", root, currentSourceIndex, callbackState, (error) => {
        failures.push(error.message);
        onFailure?.(error);
      }),
      react: ({ container: root, onFailure }) => createWrappedRenderer("react", root, currentSourceIndex, callbackState, (error) => {
        failures.push(error.message);
        onFailure?.(error);
      }),
    };
    const handle = await mountCompiledKeyedModules({
      parent: build.parent,
      child: build.child,
      renderers,
      backend: startBackend,
      container,
      onFailure(error) { failures.push(error.message); },
    });
    if (failures.length !== 0) throw new Error(`keyed host mount failed: ${failures.join(" | ")}`);
    const initial = handle.snapshot();
    const snapshots = [{ eventIndex: -1, snapshot: clone(initial) }];
    const events = [];
    const identityCheckpoints = [{ label: "initial", eventIndex: -1, ...currentIdentity(handle, container, startBackend, domId) }];
    const rendererSwaps = [];
    let activeBackend = startBackend;
    const beforeBySource = new Map();
    const retainedPublications = new Map();

    function mountedChild(key, generation) {
      const child = handle.mountedHandles().children.find((item) => item.key === key && item.generation === generation);
      if (!child) throw new Error(`current child ${key}@${generation} is not mounted`);
      return child;
    }

    function takeIdentityCheckpoint(label, eventIndex) {
      const checkpoint = { label, eventIndex, ...currentIdentity(handle, container, activeBackend, domId) };
      identityCheckpoints.push(checkpoint);
      return checkpoint;
    }

    function swapBackend(to, sourceEventIndex, label) {
      const beforeTrace = handle.trace();
      const beforeSnapshot = handle.snapshot();
      const beforeIdentity = currentIdentity(handle, container, activeBackend, domId);
      const beforeCounts = clone(beforeTrace.callCounts);
      const from = activeBackend;
      const result = handle.replaceBackend(to);
      activeBackend = to;
      const afterTrace = handle.trace();
      const afterSnapshot = handle.snapshot();
      const afterIdentity = currentIdentity(handle, container, activeBackend, domId);
      need(equal(beforeCounts, afterTrace.callCounts), `${label} renderer swap called Go roles or bridges`);
      need(equal(snapshotStructure(beforeSnapshot), snapshotStructure(afterSnapshot)), `${label} renderer swap changed Go state/order/View`);
      const logicalBefore = beforeIdentity.children.map(({ key, generation, logicalInstanceId }) => ({ key, generation, logicalInstanceId }));
      const logicalAfter = afterIdentity.children.map(({ key, generation, logicalInstanceId }) => ({ key, generation, logicalInstanceId }));
      need(equal(logicalBefore, logicalAfter), `${label} renderer swap changed logical keyed identities`);
      need(beforeIdentity.children.every((child, index) => child.rootDOMId !== afterIdentity.children[index]?.rootDOMId &&
        child.addControlDOMId !== afterIdentity.children[index]?.addControlDOMId), `${label} renderer swap reused old physical DOM elements`);
      const runtimeSwap = afterTrace.events.at(-1);
      need(runtimeSwap?.kind === "renderer-swap" && runtimeSwap.from === from && runtimeSwap.to === to,
        `${label} host trace did not record the actual ${from} to ${to} swap`);
      const probe = {
        eventIndex: sourceEventIndex,
        label,
        accepted: true,
        from,
        to,
        beforeCallCounts: beforeCounts,
        afterCallCounts: clone(afterTrace.callCounts),
        stateAndTreeUnchanged: true,
        stateTreeEqual: true,
        stateEqual: true,
        logicalBefore,
        logicalAfter,
        domBefore: beforeIdentity.children.map(({ key, generation, rootDOMId, contentDOMId, addControlDOMId }) => ({ key, generation, rootDOMId, contentDOMId, addControlDOMId })),
        domAfter: afterIdentity.children.map(({ key, generation, rootDOMId, contentDOMId, addControlDOMId }) => ({ key, generation, rootDOMId, contentDOMId, addControlDOMId })),
        runtimeEvent: clone(runtimeSwap),
        result: clone(result),
      };
      rendererSwaps.push(probe);
      identityCheckpoints.push({ label: `before-${label}`, eventIndex: sourceEventIndex, ...beforeIdentity });
      identityCheckpoints.push({ label: `after-${label}`, eventIndex: sourceEventIndex, ...afterIdentity });
      return probe;
    }

    for (let eventIndex = 0; eventIndex < scenario.events.length; eventIndex += 1) {
      const sourceEvent = scenario.events[eventIndex];
      const nativeRow = native.events[eventIndex];
      if (!nativeRow || nativeRow.index !== eventIndex) throw new Error(`native event row ${eventIndex} is missing`);
      currentSourceIndex.value = eventIndex;
      const traceBefore = handle.trace();
      const eventCountBefore = traceBefore.events.length;
      const callbackCountBefore = callbackState.observations.length;
      let result = null;
      let runtimeEvent = null;
      let observation = null;
      let domClick = null;

      if (sourceEvent.kind === "click") {
        const childKey = sourceEvent.target === "child" ? sourceEvent.key : null;
        if (sourceEvent.target === "child") mountedChild(childKey, sourceEvent.generation);
        const target = handle.elementAtPath(sourceEvent.target, childKey, sourceEvent.action.path);
        need(target?.localName === "button", `event ${eventIndex} action path did not resolve to an actual button`);
        need(target.isConnected, `event ${eventIndex} physical button is detached`);
        const disabled = target.disabled === true;
        const declaredHandlerMessage = expectedMessage(nativeRow.message);
        const expected = nativeRow.accepted === true ? declaredHandlerMessage : null;
        need((nativeRow.accepted !== true) === disabled, `event ${eventIndex} native acceptance/physical disabled state disagree`);
        const targetBefore = { connected: target.isConnected, disabled, type: target.type ?? "", value: typeof target.value === "string" ? target.value : "",
          text: target.textContent, outerHTML: target.outerHTML };
        const callbackObservationCount = callbackState.observations.length;
        target.click();
        const afterClickTrace = handle.trace();
        const callbackDelta = callbackState.observations.length - callbackObservationCount;
        if (disabled) {
          need(callbackDelta === 0, `event ${eventIndex} disabled button invoked a renderer callback`);
          need(equal(traceBefore.callCounts, afterClickTrace.callCounts) && afterClickTrace.events.length === eventCountBefore,
            `event ${eventIndex} disabled click caused a host role call before suppression was recorded`);
          result = handle.recordSuppressedAction(sourceEvent.target, childKey, sourceEvent.action);
        } else {
          need(callbackDelta === 1, `event ${eventIndex} enabled physical click did not invoke one renderer callback`);
          observation = callbackState.observations.at(-1);
          need(observation.channel === "dispatch" && observation.sourceEventIndex === eventIndex,
            `event ${eventIndex} renderer callback provenance is wrong`);
          need(equal(messageValue(observation.message), expected), `event ${eventIndex} actual Go View handler message differs from native`);
          result = observation.result;
          need(result?.accepted === true, `event ${eventIndex} physical dispatch was rejected`);
          beforeBySource.set(eventIndex, { key: sourceEvent.key ?? null, action: clone(observation.action), message: clone(observation.message) });
        }
        if (sourceEvent.target === "child" && !disabled) {
          const now = handle.snapshot().children.find((item) => item.key === sourceEvent.key);
          if (now) retainedPublications.set(eventIndex, wirePublication(now.publication));
        }
        domClick = {
          method: "HTMLElement.click",
          attempted: true,
          targetBefore,
          targetAfter: { connected: target.isConnected, disabled: target.disabled === true, outerHTML: target.outerHTML },
          callbackInvocations: callbackDelta,
          requestedMessage: expected,
          declaredHandlerMessage,
          observed: clone(observation),
          beforeTraceEvents: eventCountBefore,
          afterClickTraceEvents: afterClickTrace.events.length,
          afterSuppressionTraceEvents: handle.trace().events.length,
        };
      } else if (sourceEvent.kind === "stale-callback") {
        const retained = callbackState.bySource.get(`${sourceEvent.sourceEvent}|${sourceEvent.key}`);
        const prior = beforeBySource.get(sourceEvent.sourceEvent);
        need(retained && prior && typeof retained.callbacks.dispatch === "function", `event ${eventIndex} has no retained renderer callback source`);
        const beforeObservations = callbackState.observations.length;
        result = retained.callbacks.dispatch(prior.action, prior.message);
        observation = callbackState.observations.at(-1);
        need(callbackState.observations.length === beforeObservations + 1 && observation?.channel === "dispatch",
          `event ${eventIndex} did not invoke the retained dispatch callback`);
        need(result?.accepted === false && result?.stale === true, `event ${eventIndex} old generation callback was not rejected as stale`);
      } else if (sourceEvent.kind === "publication") {
        const retained = callbackState.bySource.get(`${sourceEvent.sourceEvent}|${sourceEvent.key}`);
        const publication = retainedPublications.get(sourceEvent.sourceEvent);
        need(retained && publication && typeof retained.callbacks.publish === "function", `event ${eventIndex} has no retained publication source`);
        const beforeObservations = callbackState.observations.length;
        result = retained.callbacks.publish(publication);
        observation = callbackState.observations.at(-1);
        need(callbackState.observations.length === beforeObservations + 1 && observation?.channel === "publish",
          `event ${eventIndex} did not invoke the retained publication callback`);
        need(result?.accepted === false && result?.stale === true, `event ${eventIndex} old generation publication was not rejected`);
      } else {
        throw new TypeError(`unsupported keyed event kind ${JSON.stringify(sourceEvent.kind)}`);
      }

      currentSourceIndex.value = null;
      const traceAfter = handle.trace();
      need(traceAfter.events.length === eventCountBefore + 1, `event ${eventIndex} emitted an unexpected number of host events`);
      runtimeEvent = traceAfter.events.at(-1);
      const sourceObservation = observation ?? callbackState.observations.slice(callbackCountBefore).at(-1) ?? null;
      events.push(rawEventRecord(sourceEvent, eventIndex, result, runtimeEvent, sourceObservation, domClick, nativeRow));
      const currentSnapshot = handle.snapshot();
      snapshots.push({ eventIndex, snapshot: clone(currentSnapshot) });
      if (eventIndex === 8) takeIdentityCheckpoint("after-reorder", eventIndex);
      if (eventIndex === 10) takeIdentityCheckpoint("after-remove-a", eventIndex);
      if (eventIndex === 13) takeIdentityCheckpoint("after-remount-a", eventIndex);

    }

    if (profile === "swap") {
      const finalEventIndex = scenario.events.length - 1;
      swapBackend("react", finalEventIndex, "swap-dom-to-react");
      swapBackend("dom", finalEventIndex, "swap-react-to-dom");
    }

    const finalTrace = handle.trace();
    const finalSnapshot = handle.snapshot();
    const finalIdentity = currentIdentity(handle, container, activeBackend, domId);
    const unmountResult = handle.unmount();
    need(container.childNodes.length === 0, `${profile} unmount left keyed module DOM attached`);
    const output = {
      schema: "gobi.keyed-module-browser-capture/v1",
      profile,
      backend: startBackend,
      backendStart: startBackend,
      backendEnd: activeBackend,
      moduleBuildBackend: moduleBackend,
      scenarioName: scenario.name,
      scenario: clone(scenario),
      seed,
      sourceEventCount: scenario.events.length,
      events,
      snapshots,
      trace: finalTrace,
      finalSnapshot: clone(finalSnapshot),
      identity: {
        schema: "gobi.keyed-module-dom-identity/v1",
        identityBasis: "logicalInstanceId is the stable key+generation correlation; DOM IDs are WeakMap IDs from actual HTMLElement references",
        checkpoints: identityCheckpoints,
        final: finalIdentity,
      },
      probes: { rendererSwaps },
      callbackObservations: clone(callbackState.observations),
      failure: handle.failure(),
      unmount: { accepted: unmountResult, containerChildrenAfter: container.childNodes.length },
    };
    container.remove();
    return output;
  }

  return { runProfile };
}
