import { mountCompiledKeyedModules } from "../runtime/runtime.mjs";
import {
  ACTION_NODE_CAPABILITIES,
  assertScenarioMatchesNative,
  goMessage,
  nativeEventFor,
  normalizeKeyedSnapshot,
  normalizeRuntimeEvent,
  normalizeRawGoView,
  nativeSnapshot,
  scenarioDigest,
  wirePublication,
} from "./capture-utils.mjs";

function makeFakeElement(document) {
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
    remove() {
      if (!this.parentNode) return;
      const siblings = this.parentNode.childNodes;
      const index = siblings.indexOf(this);
      if (index >= 0) siblings.splice(index, 1);
      this.parentNode = null;
    },
  };
  return element;
}

function makeFakeContainer() {
  const document = { createElement: () => makeFakeElement(document) };
  return makeFakeElement(document);
}

function createMemoryRendererFactory(captures, currentSourceIndex) {
  return ({ container }) => {
    let view = null;
    let callbacks = null;
    let mounted = true;
    return {
      viewCapabilities: ACTION_NODE_CAPABILITIES,
      update(rawView, nextCallbacks) {
        if (!mounted) throw new Error("memory renderer is unmounted");
        view = normalizeRawGoView(rawView);
        callbacks = nextCallbacks;
        const key = container.getAttribute("data-gobi-key");
        const index = currentSourceIndex.value;
        if (Number.isSafeInteger(index) && index >= 0 && key !== null) {
          captures.set(`${index}|${key}`, { callbacks, view, key, sourceEvent: index });
        }
      },
      viewRecord() {
        if (!mounted) return null;
        return view?.record ?? null;
      },
      domSnapshot() { return null; },
      unmount() {
        mounted = false;
        view = null;
        callbacks = null;
      },
      currentCallbacks() { return callbacks; },
    };
  };
}

function normalizedIdentity(snapshot) {
  return snapshot.children.map((child) => ({ key: child.key, generation: child.generation,
    logicalInstanceId: `${child.key}:${child.generation}`, rootDOMId: child.domIdentity?.root ?? null,
    contentDOMId: child.domIdentity?.content ?? null }));
}

function nativeChildPublication(snapshot, key) {
  const child = snapshot.children.find((item) => item.key === key);
  if (!child) throw new Error(`native source snapshot has no mounted child ${key}`);
  return wirePublication(child.publication);
}

export async function runCompiledKeyedDirect({ build, scenario, native, seed = null }) {
  assertScenarioMatchesNative(scenario, native);
  const callbacksBySource = new Map();
  const currentSourceIndex = { value: null };
  const container = makeFakeContainer();
  const handle = await mountCompiledKeyedModules({
    parent: build.parent,
    child: build.child,
    renderers: { [build.backend]: createMemoryRendererFactory(callbacksBySource, currentSourceIndex) },
    backend: build.backend,
    container,
  });
  const initialSnapshot = normalizeKeyedSnapshot(handle.snapshot());
  const snapshots = [{ eventIndex: -1, snapshot: initialSnapshot }];
  const events = [];
  const sourceScenarioMessages = new Map();

  for (let eventIndex = 0; eventIndex < scenario.events.length; eventIndex += 1) {
    const sourceEvent = scenario.events[eventIndex];
    const nativeRow = nativeEventFor(native, eventIndex);
    currentSourceIndex.value = eventIndex;
    const runtimeEventsBefore = handle.trace().events.length;
    let result;
    if (sourceEvent.kind === "click") {
      const message = goMessage(nativeRow.message);
      if (nativeRow.accepted !== true) {
        result = handle.recordSuppressedAction(sourceEvent.target, sourceEvent.key ?? null, sourceEvent.action);
      } else if (sourceEvent.target === "parent") {
        result = handle.dispatchParent(sourceEvent.action, message);
      } else {
        result = handle.dispatchChild(sourceEvent.key, sourceEvent.action, message);
      }
      if (message !== null) sourceScenarioMessages.set(eventIndex, message);
    } else if (sourceEvent.kind === "stale-callback") {
      const captured = callbacksBySource.get(`${sourceEvent.sourceEvent}|${sourceEvent.key}`);
      if (!captured || typeof captured.callbacks?.dispatch !== "function") {
        throw new Error(`direct renderer did not retain callback ${sourceEvent.sourceEvent}/${sourceEvent.key}`);
      }
      const originalEvent = scenario.events[sourceEvent.sourceEvent];
      const originalMessage = sourceScenarioMessages.get(sourceEvent.sourceEvent);
      if (!originalEvent || !originalMessage) throw new Error(`stale callback source event ${sourceEvent.sourceEvent} has no accepted message`);
      result = captured.callbacks.dispatch(originalEvent.action, originalMessage);
    } else if (sourceEvent.kind === "publication") {
      const captured = callbacksBySource.get(`${sourceEvent.sourceEvent}|${sourceEvent.key}`);
      if (!captured || typeof captured.callbacks?.publish !== "function") {
        throw new Error(`direct renderer did not retain publication callback ${sourceEvent.sourceEvent}/${sourceEvent.key}`);
      }
      result = captured.callbacks.publish(nativeChildPublication(nativeSnapshot(native, sourceEvent.sourceEvent), sourceEvent.key));
    } else {
      throw new TypeError(`unsupported keyed scenario event kind ${JSON.stringify(sourceEvent.kind)}`);
    }
    currentSourceIndex.value = null;

    const runtimeTrace = handle.trace();
    const runtimeEventsAfter = runtimeTrace.events.length;
    if (runtimeEventsAfter !== runtimeEventsBefore + 1) {
      throw new Error(`direct event ${eventIndex} emitted ${runtimeEventsAfter - runtimeEventsBefore} host trace events`);
    }
    const runtimeEvent = runtimeTrace.events.at(-1);
    events.push(normalizeRuntimeEvent(runtimeEvent, sourceEvent, eventIndex, nativeRow, result));
    const snapshot = normalizeKeyedSnapshot(handle.snapshot());
    snapshots.push({ eventIndex, snapshot });
  }

  const trace = handle.trace();
  const failed = handle.failure();
  if (failed !== null) throw new Error(`direct keyed host failed: ${failed.message}`);
  const mountedIdentities = normalizedIdentity(handle.snapshot());
  const result = {
    schema: "gobi.keyed-module-capture/v1",
    profile: "direct",
    backend: build.backend,
    moduleBuildBackend: build.backend,
    rendererBackend: "memory",
    scenarioName: scenario.name,
    scenario: structuredClone(scenario),
    scenarioSHA256: scenarioDigest(scenario),
    scenarioHash: scenarioDigest(scenario),
    seed,
    sourceEventCount: scenario.events.length,
    snapshots,
    events,
    trace,
    identity: {
      schema: "gobi.keyed-module-identity/v1",
      identityBasis: "key+generation logical slot identity; direct profile has no browser DOM",
      mounted: mountedIdentities,
    },
    modulePins: build.pins,
  };
  handle.unmount();
  return result;
}
