// Browser-side driver for the three candidate renderers and the independent
// original React reference. Each actor has its own Chromium context.

import { mountKeyedDOM } from "/keyed-editor/dom.mjs";
import { createNegotiatedHost, descriptor, validateNegotiation } from "/renderer-conformance/registry.mjs";
import { validateSnapshotAgainstManifest } from "/renderer-conformance/protocol.mjs";
import { loadGoDOM, mountGoDOM } from "/renderer-conformance/adapter.mjs";
import { pathForKey, keyAtPath } from "/keyed-editor/protocol.mjs";
import { createHTTPTransport } from "/http-effects/transport.mjs";
import { createFetchTracker } from "/keyed-editor/harness-tracker.mjs";
import { mountKeyedReact } from "/keyed-editor/build/react.bundle.mjs";
import {
  mountCollectionReference,
  referenceReactVersion,
  referenceReactDOMVersion,
} from "/keyed-editor/build/reference.bundle.mjs";

const globalErrors = [];
let actor = null;
let runtimeSequence = 0;
let manifest = null;
let goDOMReady = null;
let descriptors = null;

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = clone(item);
    return result;
  }
  return value;
}

function safeJSON(value) {
  try { return JSON.stringify(value); } catch (error) { return String(error?.stack ?? error); }
}

function errorText(error) {
  return String(error?.stack ?? error?.message ?? error);
}

function exactError(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    typeof value.error === "string" && value.error.length > 0);
}

function elementAtPath(root, path) {
  let element = root.firstElementChild;
  if (!element) throw new Error("actor renderer has no mounted root element");
  if (path === "") return element;
  for (const component of path.split("/")) {
    const index = Number(component);
    if (!Number.isSafeInteger(index) || index < 0 || index >= element.childNodes.length) {
      throw new Error(`invalid DOM path ${JSON.stringify(path)}`);
    }
    element = element.childNodes[index];
  }
  return element;
}

function pathFromRoot(element, top) {
  const indexes = [];
  let current = element;
  while (current && current !== top) {
    const parent = current.parentNode;
    if (!parent) return null;
    indexes.push(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === top ? indexes.reverse().join("/") : null;
}

function findInputByKey(currentActor, key) {
  const path = pathForKey(currentActor.api.snapshot().tree, key);
  if (path === null) return null;
  const input = elementAtPath(currentActor.root, path);
  return input?.localName === "input" ? input : null;
}

function focusRecord(currentActor) {
  const apiState = currentActor.api.focusState?.() ?? null;
  if (apiState) {
    if (typeof apiState.key === "string") return {
      key: apiState.key,
      selectionStart: apiState.selectionStart,
      selectionEnd: apiState.selectionEnd,
      selectionDirection: apiState.selectionDirection,
    };
    if (typeof apiState.Key === "string") return {
      key: apiState.Key,
      selectionStart: apiState.SelectionStart,
      selectionEnd: apiState.SelectionEnd,
      selectionDirection: apiState.SelectionDirection,
    };
  }
  const snapshot = currentActor.api.snapshot();
  const top = currentActor.root.firstElementChild;
  const active = currentActor.root.ownerDocument.activeElement;
  if (!top || !active || !top.contains(active) || active.localName !== "input") return null;
  const path = pathFromRoot(active, top);
  if (path == null) return null;
  return {
    key: keyAtPath(snapshot.tree, path),
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd,
    selectionDirection: active.selectionDirection,
  };
}

function countRuntime(raw) {
  const counts = {
    init: 0, snapshot: 0, dispatch: 0, complete: 0, effects: 0, audit: 0,
    encodeHTTP: 0, decodeHTTP: 0,
  };
  const runtime = Object.fromEntries(Object.keys(counts).map((method) => [method, (...args) => {
    counts[method] += 1;
    return raw[method](...args);
  }]));
  return { runtime, counts };
}

async function makeGoRuntime() {
  const previous = globalThis.gobiCollection;
  const go = new Go();
  const response = await fetch("/keyed-editor/build/keyed-collection.wasm", { cache: "no-store" });
  if (!response.ok) throw new Error(`collection WASM request failed: ${response.status}`);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  const run = go.run(instance);
  run.catch((error) => globalErrors.push(errorText(error)));
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const candidate = globalThis.gobiCollection;
    if (candidate && candidate !== previous && typeof candidate.init === "function") break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const runtime = globalThis.gobiCollection;
  const required = ["init", "snapshot", "dispatch", "complete", "effects", "audit", "encodeHTTP", "decodeHTTP"];
  if (!runtime || runtime === previous || required.some((method) => typeof runtime[method] !== "function")) {
    throw new Error("WASM did not publish a fresh strict globalThis.gobiCollection API");
  }
  runtimeSequence += 1;
  return { runtime, go, instance, run, sequence: runtimeSequence };
}

async function initializeRendererContract() {
  const response = await fetch("/renderer-conformance/build/manifest.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Go renderer manifest request failed: ${response.status}`);
  manifest = await response.json();
  await loadGoDOM({ wasmURL: "/renderer-conformance/build/godom.wasm" });
  descriptors = [
    descriptor("dom", mountKeyedDOM, manifest),
    descriptor("react", mountKeyedReact, manifest),
    descriptor("godom", mountGoDOM, manifest),
  ];
  return true;
}

async function startHTTPTransport(currentActor) {
  return createHTTPTransport({
    runtime: currentActor.runtime,
    url: (command) => `${currentActor.serverURL}/api/save?lane=${encodeURIComponent(currentActor.lane)}&mode=${encodeURIComponent(currentActor.mode)}`,
    fetchImpl: currentActor.tracker.fetchImpl,
  });
}

async function createActor({ index, name, participant, serverURL, initialBackend }) {
  await disposeActor();
  if (!descriptors || !manifest) throw new Error("renderer contract did not initialize");
  const root = document.createElement("div");
  root.id = `keyed-${participant}-${index}`;
  document.querySelector("#fixture").replaceChildren(root);
  const currentActor = {
    index,
    name,
    participant,
    root,
    serverURL: serverURL.replace(/\/$/, ""),
    lane: `renderer-conformance-${index}-${participant}`,
    mode: "success",
    host: null,
    runtime: null,
    rawRuntime: null,
    runtimeCounts: null,
    transport: null,
    api: null,
    wasm: null,
    tracker: null,
    detachedInputs: new Map(),
    releaseResults: [],
    rawResults: [],
  };
  if (participant === "reference") {
    currentActor.rawRuntime = mountCollectionReference(root);
    const counted = countRuntime(currentActor.rawRuntime);
    currentActor.runtimeCounts = counted.counts;
    currentActor.runtime = new Proxy(currentActor.rawRuntime, {
      get(target, property) {
        if (Object.hasOwn(counted.runtime, property)) return counted.runtime[property];
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    currentActor.api = currentActor.runtime;
  } else {
    currentActor.wasm = await makeGoRuntime();
    currentActor.rawRuntime = currentActor.wasm.runtime;
    const counted = countRuntime(currentActor.rawRuntime);
    currentActor.runtime = counted.runtime;
    currentActor.runtimeCounts = counted.counts;
  }
  currentActor.tracker = createFetchTracker(window.fetch.bind(window), location.href);
  currentActor.transport = await startHTTPTransport(currentActor);
  if (participant === "reference") {
    currentActor.api = currentActor.runtime;
  } else {
    currentActor.host = createNegotiatedHost(root, currentActor.runtime, descriptors, currentActor.transport,
      initialBackend ?? participant, manifest);
    currentActor.api = currentActor.host;
  }
  actor = currentActor;
  return { participant, lane: currentActor.lane, snapshot: currentActor.api.snapshot() };
}

async function disposeActor() {
  if (!actor) return;
  const currentActor = actor;
  actor = null;
  try {
    if (currentActor.host) currentActor.host.unmount();
    else currentActor.api?.unmount?.();
  } finally {
    currentActor.transport?.dispose();
    currentActor.root?.remove();
  }
}

async function serverRecords(currentActor) {
  const response = await window.fetch(`${currentActor.serverURL}/api/requests?lane=${encodeURIComponent(currentActor.lane)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP lab request-record lookup failed: ${response.status}`);
  const result = await response.json();
  if (result?.lane !== currentActor.lane || !Array.isArray(result?.requests)) {
    throw new Error(`HTTP lab returned invalid records for lane ${currentActor.lane}`);
  }
  return result.requests;
}

async function pollServerRecords(currentActor, expected, description) {
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    const records = await serverRecords(currentActor);
    const byID = new Map(records.map((record) => [record.ID, record]));
    if (expected.every((item) => {
      const record = byID.get(item.id);
      return record && (!item.states || item.states.includes(record.State));
    })) return records;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`timed out waiting for HTTP lab records: ${description}`);
}

function terminalLogs(transport) {
  const terminal = new Set();
  for (const event of transport.log()) {
    if (event.Kind === "cancel" || event.Kind === "reply") terminal.add(event.ID);
  }
  return terminal;
}

async function settleActor(currentActor, forceIDs = []) {
  if (currentActor.host) await currentActor.host.flush();
  let log = currentActor.transport.log();
  let terminal = terminalLogs(currentActor.transport);
  let starts = log.filter((event) => event.Kind === "start");
  const waitIDs = starts
    .filter((event) => !terminal.has(event.ID))
    .filter((event) => forceIDs.includes(event.ID) || currentActor.tracker.records.get(event.ID)?.mode !== "held")
    .map((event) => event.ID);
  await Promise.all(waitIDs.map((id) => currentActor.tracker.waitFor(id)));
  // Let the transport publish and the keyed host pump the completion callback.
  await Promise.resolve();
  await Promise.resolve();
  if (currentActor.host) {
    await currentActor.host.flush();
    await currentActor.host.settled();
  }
  log = currentActor.transport.log();
  terminal = terminalLogs(currentActor.transport);
  starts = log.filter((event) => event.Kind === "start");
  const expectations = starts.map((event) => {
    if (terminal.has(event.ID)) {
      const cancellation = log.some((item) => item.Kind === "cancel" && item.ID === event.ID);
      return { id: event.ID, states: cancellation ? ["cancelled"] : ["completed", "dropped"] };
    }
    return { id: event.ID, states: ["held"] };
  });
  await pollServerRecords(currentActor, expectations, `${currentActor.name}: settled action`);
}

function stepFor(action, snapshot) {
  const stepForKey = (key, event, value) => {
    const path = pathForKey(snapshot.tree, key);
    if (path == null) return { Path: "", Event: event, Value: value, Key: key };
    return { Path: path, Event: event, Value: value, Key: key };
  };
  if (action.kind === "add") return stepForKey("add", "click", "");
  if (action.kind === "reset") return stepForKey("reset", "click", "");
  if (action.kind === "fill") return stepForKey(`row-${action.rowID}-input`, "input", action.value);
  if (action.kind === "click") {
    const key = action.rowID === undefined ? action.action : `row-${action.rowID}-${action.action}`;
    return stepForKey(key, "click", "");
  }
  if (action.kind === "focus") return stepForKey(`row-${action.rowID}-input`, "focus", "");
  if (action.kind === "raw-dispatch") return clone(action.step);
  if (action.kind === "detached-input") {
    const record = actor.detachedInputs.get(action.rowID);
    return record?.step ?? { Path: "", Event: "input", Value: action.value, Key: `row-${action.rowID}-input` };
  }
  if (action.kind === "swap") return { Path: "", Event: `backend:${action.backend}`, Value: action.host, Key: "" };
  if (action.kind === "mode") return { Path: "", Event: `mode:${action.mode}`, Value: "", Key: "" };
  if (action.kind === "release") return { Path: "", Event: `release:${action.mode ?? "success"}`, Value: String(action.id), Key: "" };
  return { Path: "", Event: String(action.kind ?? ""), Value: "", Key: "" };
}

function retainDetached(currentActor, rowID) {
  const key = `row-${rowID}-input`;
  const input = findInputByKey(currentActor, key);
  if (!input) return null;
  const path = pathForKey(currentActor.api.snapshot().tree, key);
  currentActor.detachedInputs.set(rowID, { input, step: { Path: path, Event: "input", Value: "", Key: key } });
  return input;
}

async function releaseHeld(currentActor, action) {
  const url = `${currentActor.serverURL}/api/release?lane=${encodeURIComponent(currentActor.lane)}&id=${encodeURIComponent(action.id)}&mode=${encodeURIComponent(action.mode ?? "success")}`;
  const response = await window.fetch(url, { method: "POST", cache: "no-store" });
  const body = await response.text();
  const result = { lane: currentActor.lane, id: action.id, status: response.status, body };
  currentActor.releaseResults.push(result);
  if (action.expectedStatus !== undefined && response.status !== action.expectedStatus) {
    throw new Error(`release ${action.id} returned ${response.status}; expected ${action.expectedStatus}`);
  }
  return result;
}

async function apply(action) {
  if (!actor) throw new Error("no keyed actor is active");
  const currentActor = actor;
  const before = currentActor.api.snapshot();
  const step = stepFor(action, before);
  const beforeDispatchCalls = currentActor.runtimeCounts?.dispatch ?? 0;
  let result = null;
  let nativeTargetDisabled = null;

  if (action.kind === "add" || action.kind === "reset" || action.kind === "click") {
    if (action.kind === "reset") {
      for (const row of before.state.Rows) retainDetached(currentActor, row.ID);
    } else if (action.kind === "click" && action.action === "remove") {
      retainDetached(currentActor, action.rowID);
    }
    const path = step.Path;
    if (!path) throw new Error(`action ${action.kind} could not resolve its current keyed target`);
    const target = elementAtPath(currentActor.root, path);
    nativeTargetDisabled = Boolean(target.disabled);
    target.click();
  } else if (action.kind === "fill") {
    const input = findInputByKey(currentActor, `row-${action.rowID}-input`);
    if (!input) throw new Error(`row ${action.rowID} has no current input`);
    nativeTargetDisabled = Boolean(input.disabled);
    input.value = action.value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (action.kind === "focus") {
    const input = findInputByKey(currentActor, `row-${action.rowID}-input`);
    if (!input || typeof input.setSelectionRange !== "function") throw new Error(`row ${action.rowID} has no selectable input`);
    input.focus();
    input.setSelectionRange(action.selectionStart, action.selectionEnd, action.selectionDirection ?? "none");
  } else if (action.kind === "mode") {
    currentActor.mode = action.mode;
  } else if (action.kind === "release") {
    result = await releaseHeld(currentActor, action);
  } else if (action.kind === "swap") {
    if (currentActor.host && action.host === currentActor.participant) {
      for (const row of before.state.Rows) retainDetached(currentActor, row.ID);
      currentActor.host.replaceBackend(action.backend);
    }
  } else if (action.kind === "raw-dispatch") {
    try { result = currentActor.runtime.dispatch(action.step); }
    catch (error) { result = { thrown: errorText(error) }; }
    currentActor.rawResults.push({ action: clone(action), result: clone(result) });
  } else if (action.kind === "detached-input") {
    const record = currentActor.detachedInputs.get(action.rowID);
    if (!record) throw new Error(`no removed or replaced input was retained for row ${action.rowID}`);
    const beforeDispatchCalls = currentActor.runtimeCounts?.dispatch ?? 0;
    record.input.value = action.value;
    record.input.dispatchEvent(new Event("input", { bubbles: true }));
    const afterDispatchCalls = currentActor.runtimeCounts?.dispatch ?? 0;
    result = { dispatchDelta: afterDispatchCalls - beforeDispatchCalls };
  } else {
    throw new Error(`unknown keyed action kind ${JSON.stringify(action.kind)}`);
  }

  if (action.kind === "raw-dispatch") {
    // The malformed step is intentionally sent directly to each runtime; it
    // must not be normalized by a renderer before Go sees it.
    await settleActor(currentActor);
  } else {
    if (currentActor.participant === "reference") {
      const commands = currentActor.api.effects();
      for (const command of commands) {
        if (command.Kind === "cancel") currentActor.transport.cancel(command.ID);
        else if (command.Kind === "start") currentActor.transport.start(command, (reply) => {
          currentActor.api.complete(reply);
        });
        else throw new Error(`reference emitted unsupported effect ${safeJSON(command)}`);
      }
    }
    await settleActor(currentActor, action.kind === "release" ? [action.id] : []);
  }
  return {
    step,
    result,
    focus: focusRecord(currentActor),
    delivery: {
      dispatchDelta: (currentActor.runtimeCounts?.dispatch ?? beforeDispatchCalls) - beforeDispatchCalls,
      disabledTarget: nativeTargetDisabled,
    },
  };
}

function domObservation(currentActor, snapshot) {
  if (currentActor.participant !== "reference") validateSnapshotAgainstManifest(snapshot, manifest);
  const container = currentActor.root;
  const top = container.firstElementChild;
  const reported = currentActor.api.domSnapshot();
  const controls = top ? Array.from(top.querySelectorAll("input, button"), (element) => ({
    path: pathFromRoot(element, top),
    tag: element.localName,
    type: element.getAttribute("type"),
    value: "value" in element ? element.value : null,
    disabled: Boolean("disabled" in element && element.disabled),
    label: element.getAttribute("aria-label"),
    text: element.localName === "button" ? element.textContent : null,
  })) : [];
  const liveProps = top ? Array.from(top.querySelectorAll("input, button"), (element) => ({
    path: pathFromRoot(element, top),
    tag: element.localName,
    value: "value" in element ? element.value : null,
    defaultValue: "defaultValue" in element ? element.defaultValue : null,
    disabled: Boolean("disabled" in element && element.disabled),
    checked: "checked" in element ? element.checked : null,
    type: "type" in element ? element.type : null,
  })) : [];
  const disabled = controls.filter((control) => control.disabled).map((control) => control.path);
  const rowsRoot = top?.querySelector(":scope > .rows");
  const order = rowsRoot ? Array.from(rowsRoot.children, (row) => row.querySelector("input")?.getAttribute("aria-label") ?? null) : [];
  const active = focusRecord(currentActor);
  const input = active
    ? findInputByKey(currentActor, active.key)
    : top?.querySelector("input") ?? null;
  const currentDOM = {
    html: container.innerHTML,
    root: top?.outerHTML ?? "",
    disabled,
    inputPath: input && top ? pathFromRoot(input, top) : null,
    inputValue: input?.value ?? null,
    inputDisabled: input ? Boolean(input.disabled) : null,
    controls,
    order,
    reportedHTML: reported.html,
    reportedDisabled: reported.disabled,
  };
  const rawRecords = currentActor.latestServerRecords ?? [];
  const log = currentActor.transport.log();
  const terminal = new Set(log.filter((event) => event.Kind === "cancel" || event.Kind === "reply").map((event) => event.ID));
  return {
    snapshot,
    audit: clone(currentActor.api.audit()),
    transportLog: clone(currentActor.transport.log()),
    serverRequests: rawRecords.map(({ Lane, ...record }) => record),
    serverLane: currentActor.lane,
    pending: log.filter((event) => event.Kind === "start" && !terminal.has(event.ID)).map(({ ID, Value }) => ({ ID, Value })),
    dom: currentDOM,
    liveProps,
    focus: active,
    backendName: currentActor.host?.backendName?.() ?? "reference-react",
    runtimeCalls: currentActor.runtimeCounts ? clone(currentActor.runtimeCounts) : null,
    releaseResults: clone(currentActor.releaseResults),
    rawResults: clone(currentActor.rawResults),
  };
}

async function capture() {
  if (!actor) throw new Error("no keyed actor is active");
  const records = await serverRecords(actor);
  actor.latestServerRecords = records;
  return domObservation(actor, actor.api.snapshot());
}

function currentInputFor(currentActor, rowID) {
  return findInputByKey(currentActor, `row-${rowID}-input`);
}

function currentFocusMatches(currentActor, rowID, start, end, direction) {
  const current = focusRecord(currentActor);
  return Boolean(current && current.key === `row-${rowID}-input` &&
    current.selectionStart === start && current.selectionEnd === end &&
    current.selectionDirection === direction);
}

let nextProbeActorIndex = 9000;

async function setupProbeActor(initialBackend = "dom") {
  await disposeActor();
  const index = nextProbeActorIndex++;
  await createActor({
    index,
    name: `adversarial-real-go-${index}`,
    participant: "dom",
    serverURL: location.origin,
    initialBackend,
  });
}

async function runAdversarial() {
  const probes = [];
  const record = async (name, action, kind = "real-go") => {
    const probe = { name, kind, pass: false, observations: null };
    probes.push(probe);
    try {
      probe.observations = await action();
      probe.pass = true;
    } catch (error) {
      probe.observations = { error: errorText(error) };
    }
  };

  await record("same-backend-retained-key-reorder-and-async-focus", async () => {
    await setupProbeActor("dom");
    for (const action of [
      { kind: "add" }, { kind: "add" },
      { kind: "fill", rowID: 1, value: "first" },
      { kind: "fill", rowID: 2, value: "focused draft" },
      { kind: "mode", mode: "held" },
      { kind: "focus", rowID: 2, selectionStart: 2, selectionEnd: 8, selectionDirection: "forward" },
      { kind: "click", action: "save", rowID: 2 },
    ]) await apply(action);
    const before = currentInputFor(actor, 2);
    const beforeFocus = focusRecord(actor);
    await apply({ kind: "click", action: "up", rowID: 2 });
    const afterReorder = currentInputFor(actor, 2);
    const afterReorderFocus = focusRecord(actor);
    if (before !== afterReorder) throw new Error("same-backend keyed reorder replaced the retained input element");
    if (!currentFocusMatches(actor, 2, 2, 8, "forward")) throw new Error(`logical focus/selection did not survive reorder: ${safeJSON(afterReorderFocus)}`);
    await apply({ kind: "release", id: 1, mode: "success", expectedStatus: 202 });
    const afterCompletion = currentInputFor(actor, 2);
    const afterCompletionFocus = focusRecord(actor);
    if (before !== afterCompletion) throw new Error("same-backend async completion replaced the retained input element");
    if (!currentFocusMatches(actor, 2, 2, 8, "forward")) throw new Error(`logical focus/selection did not survive async completion: ${safeJSON(afterCompletionFocus)}`);
    return {
      key: "row-2-input",
      sameNodeAfterReorder: before === afterReorder,
      sameNodeAfterCompletion: before === afterCompletion,
      beforeFocus,
      afterReorderFocus,
      afterCompletionFocus,
      final: (await capture()).snapshot,
    };
  });

  await record("same-backend-react-retained-key-reorder-and-async-focus", async () => {
    await setupProbeActor("react");
    for (const action of [
      { kind: "add" }, { kind: "add" },
      { kind: "fill", rowID: 1, value: "first" },
      { kind: "fill", rowID: 2, value: "focused draft" },
      { kind: "mode", mode: "held" },
      { kind: "focus", rowID: 2, selectionStart: 2, selectionEnd: 8, selectionDirection: "forward" },
      { kind: "click", action: "save", rowID: 2 },
    ]) await apply(action);
    const before = currentInputFor(actor, 2);
    const beforeFocus = focusRecord(actor);
    await apply({ kind: "click", action: "up", rowID: 2 });
    const afterReorder = currentInputFor(actor, 2);
    const afterReorderFocus = focusRecord(actor);
    if (before !== afterReorder) throw new Error("same-backend React keyed reorder replaced the retained input element");
    if (!currentFocusMatches(actor, 2, 2, 8, "forward")) throw new Error(`React logical focus/selection did not survive reorder: ${safeJSON(afterReorderFocus)}`);
    await apply({ kind: "release", id: 1, mode: "success", expectedStatus: 202 });
    const afterCompletion = currentInputFor(actor, 2);
    const afterCompletionFocus = focusRecord(actor);
    if (before !== afterCompletion) throw new Error("same-backend React async completion replaced the retained input element");
    if (!currentFocusMatches(actor, 2, 2, 8, "forward")) throw new Error(`React logical focus/selection did not survive async completion: ${safeJSON(afterCompletionFocus)}`);
    return {
      backend: "react",
      key: "row-2-input",
      sameNodeAfterReorder: before === afterReorder,
      sameNodeAfterCompletion: before === afterCompletion,
      beforeFocus,
      afterReorderFocus,
      afterCompletionFocus,
      final: (await capture()).snapshot,
    };
  });

  await record("same-backend-godom-retained-key-reorder-and-async-focus", async () => {
    await setupProbeActor("godom");
    for (const action of [
      { kind: "add" }, { kind: "add" },
      { kind: "fill", rowID: 1, value: "first" },
      { kind: "fill", rowID: 2, value: "focused draft" },
      { kind: "mode", mode: "held" },
      { kind: "focus", rowID: 2, selectionStart: 2, selectionEnd: 8, selectionDirection: "forward" },
      { kind: "click", action: "save", rowID: 2 },
    ]) await apply(action);
    const before = currentInputFor(actor, 2);
    const beforeFocus = focusRecord(actor);
    await apply({ kind: "click", action: "up", rowID: 2 });
    const afterReorder = currentInputFor(actor, 2);
    const afterReorderFocus = focusRecord(actor);
    if (before !== afterReorder) throw new Error("same-backend GoDOM keyed reorder replaced the retained input element");
    if (!currentFocusMatches(actor, 2, 2, 8, "forward")) throw new Error(`GoDOM logical focus/selection did not survive reorder: ${safeJSON(afterReorderFocus)}`);
    await apply({ kind: "release", id: 1, mode: "success", expectedStatus: 202 });
    const afterCompletion = currentInputFor(actor, 2);
    const afterCompletionFocus = focusRecord(actor);
    if (before !== afterCompletion) throw new Error("same-backend GoDOM async completion replaced the retained input element");
    if (!currentFocusMatches(actor, 2, 2, 8, "forward")) throw new Error(`GoDOM logical focus/selection did not survive async completion: ${safeJSON(afterCompletionFocus)}`);
    return {
      backend: "godom",
      key: "row-2-input",
      sameNodeAfterReorder: before === afterReorder,
      sameNodeAfterCompletion: before === afterCompletion,
      beforeFocus,
      afterReorderFocus,
      afterCompletionFocus,
      final: (await capture()).snapshot,
    };
  });

  await record("all-six-directed-swaps-replace-node-and-restore-logical-selection", async () => {
    await setupProbeActor("dom");
    await apply({ kind: "add" });
    await apply({ kind: "fill", rowID: 1, value: "selection survives swap" });
    await apply({ kind: "focus", rowID: 1, selectionStart: 3, selectionEnd: 10, selectionDirection: "backward" });
    const transitions = ["react", "godom", "react", "dom", "godom", "dom"];
    const seen = [];
    for (const backend of transitions) {
      const before = currentInputFor(actor, 1);
      const from = actor.host.backendName();
      const beforeFocus = focusRecord(actor);
      await apply({ kind: "swap", host: "dom", backend });
      const after = currentInputFor(actor, 1);
      const afterFocus = focusRecord(actor);
      if (before === after) throw new Error(`${from}→${backend} retained the old DOM input object`);
      if (actor.root.contains(before)) throw new Error(`${from}→${backend} left the old input attached`);
      if (!currentFocusMatches(actor, 1, 3, 10, "backward")) throw new Error(`${from}→${backend} did not restore logical focus/selection: ${safeJSON(afterFocus)}`);
      seen.push({ from, to: backend, oldNodeDetached: !actor.root.contains(before), newNodeAllocated: before !== after, beforeFocus, afterFocus });
    }
    const edges = new Set(seen.map(({ from, to }) => `${from}->${to}`));
    const expectedEdges = ["dom->react", "react->godom", "godom->react", "react->dom", "dom->godom", "godom->dom"];
    if (expectedEdges.some((edge) => !edges.has(edge))) throw new Error(`directed swap coverage incomplete: ${safeJSON([...edges])}`);
    return { transitions: seen, finalBackend: actor.host.backendName(), finalFocus: focusRecord(actor) };
  });

  await record("deleted-focused-key-does-not-misfocus-other-row", async () => {
    await setupProbeActor("dom");
    await apply({ kind: "add" });
    await apply({ kind: "add" });
    await apply({ kind: "focus", rowID: 1, selectionStart: 1, selectionEnd: 3, selectionDirection: "none" });
    const before = focusRecord(actor);
    await apply({ kind: "click", action: "remove", rowID: 1 });
    const after = focusRecord(actor);
    if (after && after.key === "row-2-input") throw new Error("deleting the focused key transferred focus to another row");
    if (after && after.key !== "row-1-input") throw new Error(`unexpected logical focus after deletion: ${safeJSON(after)}`);
    return { before, after, activeElementIsOtherInput: Boolean(after && after.key !== "row-1-input") };
  });

  await record("godom-removed-input-event-makes-zero-go-dispatches", async () => {
    await setupProbeActor("godom");
    await apply({ kind: "add" });
    const removed = currentInputFor(actor, 1);
    await apply({ kind: "click", action: "remove", rowID: 1 });
    const before = actor.runtimeCounts.dispatch;
    removed.value = "late detached event";
    removed.dispatchEvent(new Event("input", { bubbles: true }));
    const after = actor.runtimeCounts.dispatch;
    if (after !== before) throw new Error(`detached input called Go dispatch ${after - before} time(s)`);
    return { detached: !actor.root.contains(removed), goDispatchDelta: after - before, snapshot: actor.api.snapshot() };
  });

  await record("disabled-controls-suppress-native-click-and-preserve-snapshot", async () => {
    await setupProbeActor("godom");
    for (let row = 0; row < 4; row += 1) await apply({ kind: "add" });
    const disabledAdd = actor.root.querySelector("button.add");
    if (!disabledAdd?.disabled) throw new Error("four-row maximum did not disable the Add control");
    const before = actor.rawRuntime.snapshot();
    const beforeDispatch = actor.runtimeCounts.dispatch;
    disabledAdd.click();
    const afterDispatch = actor.runtimeCounts.dispatch;
    const after = actor.rawRuntime.snapshot();
    if (afterDispatch !== beforeDispatch) throw new Error(`disabled Add called Go dispatch ${afterDispatch - beforeDispatch} time(s)`);
    if (safeJSON(before) !== safeJSON(after)) throw new Error("clicking disabled Add changed the Go snapshot");
    return { disabled: disabledAdd.disabled, dispatchDelta: afterDispatch - beforeDispatch, before, after };
  });

  await record("manifest-version-and-capability-reject-before-init-mount-or-transport", async () => {
    await disposeActor();
    const attempt = (mutate) => {
      const counts = { init: 0, mount: 0, transport: 0 };
      const runtime = {
        init() { counts.init += 1; return {}; },
        snapshot() { return {}; }, dispatch() { return {}; }, complete() { return {}; },
        effects() { return []; }, audit() { return []; },
      };
      const candidateDescriptors = descriptors.map((item) => {
        const changed = { ...item, capabilities: [...item.capabilities], methods: [...item.methods] };
        if (changed.name === "godom") mutate(changed);
        const mount = changed.mount;
        changed.mount = (...args) => { counts.mount += 1; return mount(...args); };
        return changed;
      });
      const transport = {
        start() { counts.transport += 1; },
        cancel() { counts.transport += 1; },
      };
      const probeRoot = document.createElement("div");
      let validationRejected = false;
      let validationError = "";
      try {
        validateNegotiation(candidateDescriptors, manifest);
      } catch (caught) {
        validationRejected = true;
        validationError = errorText(caught);
      }
      let hostRejected = false;
      let hostError = "";
      let created = null;
      try {
        created = createNegotiatedHost(probeRoot, runtime, candidateDescriptors, transport, "godom", manifest);
      } catch (caught) {
        hostRejected = true;
        hostError = errorText(caught);
      }
      if (created) created.unmount();
      probeRoot.remove();
      return { validationRejected, validationError, hostRejected, hostError, counts };
    };
    const version = attempt((item) => { item.version += 1; });
    const capability = attempt((item) => { item.capabilities = item.capabilities.filter((value) => value !== "logical-focus"); });
    for (const [name, result] of [["version", version], ["capability", capability]]) {
      if (!result.validationRejected || !result.hostRejected) throw new Error(`${name} incompatibility was accepted`);
      if (result.counts.init !== 0 || result.counts.mount !== 0 || result.counts.transport !== 0) {
        throw new Error(`${name} incompatibility caused activity before rejection: ${safeJSON(result.counts)}`);
      }
    }
    return { version, capability };
  }, "registry-contract");

  await record("raw-old-path-key-rejects-atomically", async () => {
    await setupProbeActor("dom");
    await apply({ kind: "add" });
    await apply({ kind: "add" });
    const oldStep = { Path: "2/1/0", Event: "input", Value: "wrong row", Key: "row-2-input" };
    await apply({ kind: "click", action: "up", rowID: 2 });
    const before = actor.rawRuntime.snapshot();
    const beforeAudit = actor.rawRuntime.audit();
    const beforeEffects = actor.rawRuntime.effects();
    const result = actor.rawRuntime.dispatch(oldStep);
    const after = actor.rawRuntime.snapshot();
    const afterAudit = actor.rawRuntime.audit();
    const afterEffects = actor.rawRuntime.effects();
    if (!exactError(result)) throw new Error(`Go did not reject old path/key dispatch: ${safeJSON(result)}`);
    if (safeJSON(before) !== safeJSON(after) || safeJSON(beforeAudit) !== safeJSON(afterAudit) ||
        safeJSON(beforeEffects) !== safeJSON(afterEffects)) {
      throw new Error("raw old-path/key rejection mutated snapshot, audit, or effects");
    }
    return { oldStep, result, before, after, beforeAudit, afterAudit, beforeEffects, afterEffects };
  });

  await record("remove-add-path-reuse-keeps-new-row-identity", async () => {
    await setupProbeActor("dom");
    await apply({ kind: "add" });
    await apply({ kind: "add" });
    const removed = currentInputFor(actor, 2);
    const removedPath = pathForKey(actor.api.snapshot().tree, "row-2-input");
    await apply({ kind: "click", action: "remove", rowID: 2 });
    await apply({ kind: "add" });
    const current = currentInputFor(actor, 3);
    const currentPath = pathForKey(actor.api.snapshot().tree, "row-3-input");
    if (removedPath !== currentPath) throw new Error(`test did not reuse the old input path: ${removedPath} -> ${currentPath}`);
    if (removed === current) throw new Error("new logical key reused the removed row's DOM input object");
    if (actor.api.snapshot().state.Rows[1]?.ID !== 3) throw new Error("row ID 3 was reused at the wrong position");
    return { removedPath, currentPath, oldKey: "row-2-input", newKey: "row-3-input", newID: 3, nodeReplaced: removed !== current };
  });

  await record("strict-wasm-bridge-invalid-calls-are-atomic", async () => {
    await setupProbeActor("dom");
    await apply({ kind: "add" });
    const before = actor.rawRuntime.snapshot();
    const beforeAudit = actor.rawRuntime.audit();
    const beforeEffects = actor.rawRuntime.effects();
    const invalid = [];
    invalid.push(actor.rawRuntime.dispatch());
    invalid.push(actor.rawRuntime.dispatch({ Path: "0", Event: "click", Value: "", Key: "add", Extra: true }));
    const exotic = { Event: "click", Value: "", Key: "add" };
    Object.defineProperty(exotic, "Path", { enumerable: true, get() { throw new Error("getter sentinel"); } });
    try { invalid.push(actor.rawRuntime.dispatch(exotic)); }
    catch (error) { invalid.push({ thrown: errorText(error) }); }
    invalid.push(actor.rawRuntime.complete({ ID: 0, Value: "", Error: "" }));
    const after = actor.rawRuntime.snapshot();
    const afterAudit = actor.rawRuntime.audit();
    const afterEffects = actor.rawRuntime.effects();
    if (invalid.length !== 4 || invalid.some((value) => !exactError(value))) {
      throw new Error(`one or more invalid WASM calls escaped error containment: ${safeJSON(invalid)}`);
    }
    if (safeJSON(before) !== safeJSON(after) || safeJSON(beforeAudit) !== safeJSON(afterAudit) ||
        safeJSON(beforeEffects) !== safeJSON(afterEffects)) {
      throw new Error("invalid bridge calls mutated snapshot, audit, or effects");
    }
    return { invalidResults: invalid, before, after, beforeAudit, afterAudit, beforeEffects, afterEffects };
  });

  await disposeActor();
  return { probes, errors: clone(globalErrors) };
}

const keyedHarness = {
  errors: globalErrors,
  readyPromise: (goDOMReady = initializeRendererContract()).catch((error) => {
    window.__rendererInitError = errorText(error);
    throw error;
  }),
  versions: () => ({ react: referenceReactVersion, reactDOM: referenceReactDOMVersion }),
  createActor,
  disposeActor,
  apply,
  capture,
  runAdversarial,
};

window.__keyedHarness = keyedHarness;
