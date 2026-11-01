import { mountCompiledModuleEffects } from "../runtime/runtime.mjs";
import { goSliceValues, recordGoNode } from "../../compiled-frontend/conformance/direct-js.mjs";
import {
  assertScenarioMatchesNative,
  captureHostSnapshot,
  clone,
  expectedEvent,
  messageValue,
  nativeEventFor,
  scenarioDigest,
} from "./capture-utils.mjs";

function fakeElement(document) {
  const attributes = new Map();
  const element = {
    nodeType: 1,
    ownerDocument: document,
    childNodes: [],
    parentNode: null,
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    replaceChildren(...children) {
      for (const child of this.childNodes) child.parentNode = null;
      this.childNodes = [...children];
      for (const child of this.childNodes) child.parentNode = this;
    },
  };
  return element;
}

function fakeContainer() {
  const document = { createElement: () => fakeElement(document) };
  return fakeElement(document);
}

function memoryRendererFactory(captures, currentSourceIndex) {
  return ({ container }) => {
    let mounted = true;
    let view = null;
    let callbacks = null;
    return {
      viewCapabilities: ["view.node", "binding.value", "binding.checked"],
      update(rawView, nextCallbacks) {
        if (!mounted) throw new Error("memory renderer is unmounted");
        const hasTree = Object.hasOwn(rawView, "Tree");
        const hasBindings = Object.hasOwn(rawView, "Bindings");
        if (hasTree !== hasBindings) throw new TypeError("Go View must provide Tree and Bindings together");
        const tree = hasTree ? rawView.Tree : rawView;
        const bindings = hasBindings ? (goSliceValues(rawView.Bindings, "View.Bindings") ?? []) : [];
        view = {
          tree: recordGoNode(tree),
          bindings: bindings.map((binding) => ({ path: binding.Path, event: binding.Event,
            message: binding.Message, source: binding.Source })),
        };
        callbacks = nextCallbacks;
        const key = container.getAttribute?.("data-gobi-key") ?? null;
        if (Number.isSafeInteger(currentSourceIndex.value) && currentSourceIndex.value >= 0) {
          captures.set(`${currentSourceIndex.value}|${key ?? ""}`, { key, callbacks, view });
        }
      },
      viewRecord() { return mounted ? clone(view) : null; },
      domSnapshot() { return null; },
      currentCallbacks() { return callbacks; },
      unmount() { mounted = false; view = null; callbacks = null; },
    };
  };
}

function nativeAccepted(row) {
  return row.accepted === true;
}

async function settle(handle) {
  if (typeof handle.flush === "function") await handle.flush();
  else if (typeof handle.settled === "function") await handle.settled();
}

export async function runModuleEffectsDirect({ build, scenario, native, seed = null, backend }) {
  assertScenarioMatchesNative(scenario, native);
  if (!build?.parent || !build?.child) throw new TypeError(`missing ${backend} parent/child build`);
  const captures = new Map();
  const currentSourceIndex = { value: null };
  const renderers = {
    react: memoryRendererFactory(captures, currentSourceIndex),
    dom: memoryRendererFactory(captures, currentSourceIndex),
  };
  const container = fakeContainer();
  const handle = await mountCompiledModuleEffects({
    parent: build.parent,
    child: build.child,
    renderers,
    backend,
    container,
  });
  const snapshots = [captureHostSnapshot(handle, -1, null)];
  const events = [];
  let activeRenderer = backend;
  let rendererEpoch = 1;

  for (let eventIndex = 0; eventIndex < scenario.events.length; eventIndex += 1) {
    const sourceEvent = scenario.events[eventIndex];
    const nativeRow = nativeEventFor(native, eventIndex);
    currentSourceIndex.value = eventIndex;
    let result = null;
    let staleProbe = null;
    if (sourceEvent.kind === "click") {
      result = await handle.click({
        target: sourceEvent.target,
        ...(sourceEvent.key === undefined ? {} : { key: sourceEvent.key, generation: sourceEvent.generation }),
        path: sourceEvent.action.path,
        event: sourceEvent.action.event,
        value: sourceEvent.action.value,
      });
    } else if (sourceEvent.kind === "transport-reply") {
      const pendingTokens = handle.pending().map((item) => item.token);
      const reply = { Name: "complete", Arg: sourceEvent.token };
      result = pendingTokens.includes(sourceEvent.token)
        ? await handle.deliver(sourceEvent.token, reply)
        : await handle.forceDeliverRetained(sourceEvent.token, reply);
    } else if (sourceEvent.kind === "renderer-swap") {
      const from = activeRenderer;
      handle.replaceBackend(sourceEvent.to);
      if (from !== sourceEvent.to) rendererEpoch += 1;
      activeRenderer = sourceEvent.to;
      result = { accepted: true, from, to: activeRenderer, rendererEpoch };
    } else if (sourceEvent.kind === "stale-callback") {
      const original = scenario.events[sourceEvent.sourceEvent];
      const retained = captures.get(`${sourceEvent.sourceEvent}|${sourceEvent.key}`);
      const message = nativeEventFor(native, sourceEvent.sourceEvent).message;
      if (retained && typeof retained.callbacks?.dispatch === "function") {
        result = retained.callbacks.dispatch(original.action, { Name: message.Name, Arg: message.Arg ?? "" });
        staleProbe = { mode: "retained-renderer-callback", accepted: result?.accepted === true,
          sourceEvent: sourceEvent.sourceEvent, key: sourceEvent.key, generation: sourceEvent.generation };
      } else {
        result = handle.dispatch({ target: "child", key: sourceEvent.key, generation: sourceEvent.generation,
          message: { Name: message.Name, Arg: message.Arg ?? "" } });
        staleProbe = { mode: "direct-stale-dispatch", accepted: result?.accepted === true,
          sourceEvent: sourceEvent.sourceEvent, key: sourceEvent.key, generation: sourceEvent.generation };
      }
    } else {
      throw new TypeError(`unsupported module-effects source event ${JSON.stringify(sourceEvent.kind)}`);
    }
    await settle(handle);
    currentSourceIndex.value = null;

    const eventRecord = {
      eventIndex,
      sourceEvent: clone(sourceEvent),
      nativeExpected: expectedEvent(sourceEvent, nativeRow),
      result: clone(result ?? null),
      accepted: nativeAccepted(nativeRow),
      message: messageValue(result?.message),
      manualReply: sourceEvent.kind === "transport-reply" ? { Name: "complete", Arg: sourceEvent.token } : null,
      hostEventIndex: Number.isSafeInteger(result?.eventIndex) ? result.eventIndex : null,
      domClick: null,
      retainedCallback: staleProbe,
    };
    events.push(eventRecord);

    snapshots.push(captureHostSnapshot(handle, eventIndex, null));
  }

  const trace = handle.trace();
  const result = {
    schema: "gobi.module-effects-capture/v1",
    profile: `direct.${backend}`,
    backend,
    rendererBackend: "memory",
    scenarioName: scenario.name,
    scenario: clone(scenario),
    scenarioSHA256: scenarioDigest(scenario),
    seed,
    sourceEventCount: scenario.events.length,
    snapshots,
    events,
    ledger: clone(trace.events ?? []),
    orderedLedger: clone(trace.ledger ?? []),
    effectLedger: clone(trace.effects ?? []),
    lifecycleLedger: clone(trace.lifecycle ?? []),
    retiredChildren: clone(trace.retiredChildren ?? []),
    callOrder: clone(trace.callOrder ?? []),
    transportLedger: clone(trace.transport ?? []),
    trace: clone({ callCounts: trace.callCounts ?? null, failure: handle.failure?.() ?? null, rendererEpoch: trace.rendererEpoch }),
    modulePins: build.pins ?? null,
    versions: { node: process.version },
  };
  await handle.unmount();
  return result;
}
