import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { mountCompiledModuleEffects } from "../runtime/runtime.mjs";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function messageValue(value) {
  if (value === null || value === undefined) return null;
  return { name: value.Name ?? value.name, arg: value.Arg ?? value.arg ?? "" };
}

function expectedEvent(sourceEvent, nativeRow) {
  let message = null;
  if (sourceEvent.kind === "click" && nativeRow.accepted === true) message = messageValue(nativeRow.message);
  if (sourceEvent.kind === "transport-reply" && nativeRow.accepted === true) message = { name: "complete", arg: sourceEvent.token };
  return { accepted: nativeRow.accepted === true, declaredMessage: messageValue(nativeRow.message), message,
    stateIndex: nativeRow.stateIndex ?? nativeRow.index, effectIndices: clone(nativeRow.effectIndices ?? []) };
}

function normalizedDOMSnapshot(container) {
  return {
    html: container.innerHTML,
    controls: [...container.querySelectorAll("button,input,select,textarea")].map((element) => ({
      tag: element.localName, type: element.type ?? "", text: element.textContent ?? "",
      value: typeof element.value === "string" ? element.value : "", disabled: element.disabled === true,
      connected: element.isConnected === true, className: typeof element.className === "string" ? element.className : "",
      parentKey: element.closest?.("[data-gobi-key]")?.getAttribute("data-gobi-key") ?? null,
      parentGeneration: element.closest?.("[data-gobi-generation]")?.getAttribute("data-gobi-generation") ?? null,
    })),
  };
}

function wrapRenderer(kind, container, sourceIndex, callbackState, failures) {
  const renderer = kind === "react"
    ? createReactRenderer({ container, onFailure: (error) => failures.push(error.message) })
    : createDOMRenderer({ container, onFailure: (error) => failures.push(error.message) });
  return {
    viewCapabilities: renderer.viewCapabilities,
    update(view, callbacks) {
      const key = container.getAttribute("data-gobi-key");
      const generation = Number(container.getAttribute("data-gobi-generation"));
      const wrapped = {
        dispatch(action, message) {
          const observation = { channel: "dispatch", sourceEventIndex: sourceIndex.value,
            rendererBackend: kind, key, generation, action: clone(action), message: clone(message), result: null };
          callbackState.observations.push(observation);
          const result = callbacks.dispatch(action, message);
          observation.result = clone(result ?? null);
          if (Number.isSafeInteger(sourceIndex.value) && sourceIndex.value >= 0 && key !== null) {
            callbackState.bySource.set(`${sourceIndex.value}|${key}`, { callbacks: wrapped, key, generation, rendererBackend: kind });
          }
          return result;
        },
        onStaleAction(action, reportedEpoch = null) {
          return callbacks.onStaleAction?.(action, reportedEpoch);
        },
      };
      if (Number.isSafeInteger(sourceIndex.value) && sourceIndex.value >= 0 && key !== null) {
        callbackState.bySource.set(`${sourceIndex.value}|${key}`, { callbacks: wrapped, key, generation, rendererBackend: kind });
      }
      return renderer.update(view, wrapped);
    },
    viewRecord: (...args) => renderer.viewRecord(...args),
    domSnapshot: (...args) => renderer.domSnapshot(...args),
    unmount: (...args) => renderer.unmount(...args),
  };
}

function expectedNativeMessage(row) {
  if (!row?.message) return null;
  return { Name: row.message.Name ?? row.message.name, Arg: row.message.Arg ?? row.message.arg ?? "" };
}

function tokenIsPending(handle, token) {
  return handle.pending().some((request) => request.token === token);
}

export function installModuleEffectsConformanceBrowser({ modules }) {
  const app = document.getElementById("app");
  if (!app) throw new Error("#app container is required");

  async function runProfile({ profile, scenario, native, seed = null }) {
    if (!["react", "dom", "swap"].includes(profile)) throw new TypeError(`unsupported effects profile ${profile}`);
    const startBackend = profile === "swap" ? "dom" : profile;
    const moduleBackend = profile === "swap" ? "dom" : profile;
    const build = modules[moduleBackend];
    if (!build?.parent || !build?.child) throw new TypeError(`missing ${moduleBackend} Go module pair`);
    if (app.childNodes.length !== 0) throw new Error("profile container must be empty before mount");

    const container = document.createElement("div");
    container.setAttribute("data-profile", profile);
    app.appendChild(container);
    const sourceIndex = { value: null };
    const callbackState = { observations: [], bySource: new Map() };
    const failures = [];
    const renderers = {
      dom: ({ container: root }) => wrapRenderer("dom", root, sourceIndex, callbackState, failures),
      react: ({ container: root }) => wrapRenderer("react", root, sourceIndex, callbackState, failures),
    };
    const handle = await mountCompiledModuleEffects({
      parent: build.parent,
      child: build.child,
      renderers,
      backend: startBackend,
      container,
      onFailure(error) { failures.push(error.message); },
    });
    if (failures.length !== 0) throw new Error(`module-effects host mount failed: ${failures.join(" | ")}`);

    const snapshots = [{ eventIndex: -1, snapshot: clone(handle.snapshot()), dom: normalizedDOMSnapshot(container) }];
    const events = [];
    const rendererSwaps = [];
    let activeBackend = startBackend;

    for (let eventIndex = 0; eventIndex < scenario.events.length; eventIndex += 1) {
      const sourceEvent = scenario.events[eventIndex];
      const nativeRow = native.events[eventIndex];
      if (!nativeRow || nativeRow.index !== eventIndex) throw new Error(`native source event ${eventIndex} is missing`);
      sourceIndex.value = eventIndex;
      const beforeFailures = failures.length;
      const observationOffset = callbackState.observations.length;
      let result = null;
      let domClick = null;
      let retainedCallback = null;

      if (sourceEvent.kind === "click") {
        const key = sourceEvent.target === "child" ? sourceEvent.key : null;
        const target = handle.elementAtPath(sourceEvent.target, key, sourceEvent.action.path);
        if (!target || target.localName !== "button") throw new Error(`event ${eventIndex} path does not resolve to an actual button`);
        if (!target.isConnected) throw new Error(`event ${eventIndex} button is detached`);
        const before = { connected: target.isConnected, disabled: target.disabled === true,
          type: target.type ?? "", text: target.textContent ?? "", outerHTML: target.outerHTML };
        if ((nativeRow.accepted !== true) !== before.disabled) {
          throw new Error(`event ${eventIndex} native enabled state differs from actual button disabled state`);
        }
        target.click();
        const clickObservations = callbackState.observations.slice(observationOffset);
        const dispatchObservations = clickObservations.filter((row) => row.channel === "dispatch");
        if (before.disabled && dispatchObservations.length !== 0) throw new Error(`disabled event ${eventIndex} invoked a Go callback`);
        if (!before.disabled && dispatchObservations.length !== 1) throw new Error(`event ${eventIndex} did not invoke exactly one Go callback`);
        result = dispatchObservations[0]?.result ?? null;
        domClick = { usedHTMLElementClick: target instanceof HTMLElement && target.click instanceof Function,
          tag: target.localName, connectedBefore: before.connected, disabledBefore: before.disabled,
          type: before.type, text: before.text, outerHTMLBefore: before.outerHTML,
          callbackDelta: dispatchObservations.length,
          observedMessage: messageValue(dispatchObservations[0]?.message),
          callbackResult: clone(result) };
      } else if (sourceEvent.kind === "transport-reply") {
        const reply = { Name: "complete", Arg: sourceEvent.token };
        result = tokenIsPending(handle, sourceEvent.token)
          ? handle.deliver(sourceEvent.token, reply)
          : handle.forceDeliverRetained(sourceEvent.token, reply);
        await handle.flush();
      } else if (sourceEvent.kind === "renderer-swap") {
        if (profile === "swap") {
          const before = clone(handle.snapshot());
          handle.replaceBackend(sourceEvent.to);
          activeBackend = sourceEvent.to;
          const after = clone(handle.snapshot());
          const probe = { eventIndex, from: before.backend, to: after.backend,
            snapshotUnchanged: equal({ parent: before.parent.goState, children: before.children.map((child) => child.goState) },
              { parent: after.parent.goState, children: after.children.map((child) => child.goState) }),
            rendererEpochBefore: before.rendererEpoch, rendererEpochAfter: after.rendererEpoch };
          rendererSwaps.push(probe);
          if (!probe.snapshotUnchanged) throw new Error(`renderer swap at event ${eventIndex} changed Go state`);
          result = { accepted: true, from: probe.from, to: probe.to, rendererEpoch: probe.rendererEpochAfter };
        }
      } else if (sourceEvent.kind === "stale-callback") {
        const retained = callbackState.bySource.get(`${sourceEvent.sourceEvent}|${sourceEvent.key}`);
        if (!retained || typeof retained.callbacks?.dispatch !== "function") {
          throw new Error(`event ${eventIndex} has no retained UI callback for source ${sourceEvent.sourceEvent}/${sourceEvent.key}`);
        }
        const original = scenario.events[sourceEvent.sourceEvent];
        const message = expectedNativeMessage(native.events[sourceEvent.sourceEvent]);
        result = retained.callbacks.dispatch(original.action, message);
        retainedCallback = { invokedRetainedHTMLElementHandler: true, sourceEvent: sourceEvent.sourceEvent,
          key: sourceEvent.key, generation: sourceEvent.generation, result: clone(result), accepted: result?.accepted === true,
          stale: result?.stale === true };
      } else {
        throw new TypeError(`unsupported module-effects source event ${JSON.stringify(sourceEvent.kind)}`);
      }
      await handle.flush();
      sourceIndex.value = null;
      if (failures.length !== beforeFailures) throw new Error(`renderer failure at event ${eventIndex}: ${failures.slice(beforeFailures).join(" | ")}`);

      const currentSnapshot = clone(handle.snapshot());
      events.push({ eventIndex, sourceEvent: clone(sourceEvent), nativeExpected: expectedEvent(sourceEvent, nativeRow),
        result: clone(result ?? null), accepted: nativeRow.accepted === true,
        hostEventIndex: Number.isSafeInteger(result?.eventIndex) ? result.eventIndex : null,
        manualReply: sourceEvent.kind === "transport-reply" ? { Name: "complete", Arg: sourceEvent.token } : null,
        message: messageValue(result?.message ?? domClick?.callbackResult?.message), domClick, retainedCallback,
        rendererBackend: activeBackend, rendererEpoch: currentSnapshot.rendererEpoch });
      snapshots.push({ eventIndex, snapshot: currentSnapshot, dom: normalizedDOMSnapshot(container) });
    }

    const trace = handle.trace();
    const capture = {
      schema: "gobi.module-effects-capture/v1",
      profile: `browser.${profile}`,
      backend: moduleBackend,
      backendStart: startBackend,
      backendEnd: activeBackend,
      moduleBuildBackend: moduleBackend,
      rendererBackend: activeBackend,
      scenarioName: scenario.name,
      scenario: clone(scenario),
      seed,
      sourceEventCount: scenario.events.length,
      snapshots,
      events,
      ledger: clone(trace.events),
      orderedLedger: clone(trace.ledger ?? []),
      effectLedger: clone(trace.effects),
      lifecycleLedger: clone(trace.lifecycle),
      retiredChildren: clone(trace.retiredChildren),
      callOrder: clone(trace.callOrder),
      transportLedger: clone(trace.transport),
      rendererSwaps,
      modulePins: modules[moduleBackend].pins ?? null,
      versions: { userAgent: navigator.userAgent },
      failure: handle.failure(),
    };
    if (capture.failure !== null) throw new Error(`host failed during ${profile}: ${capture.failure.message}`);
    await handle.unmount();
    container.remove();
    return capture;
  }

  return { runProfile };
}
