import { mountKeyedDOM } from "../keyed-editor/dom.mjs";
import { mountKeyedReact } from "./build/react.bundle.mjs";
import { loadGoDOM, mountGoDOM } from "../renderer-conformance/adapter.mjs";
import { createCompositionHost } from "./host.mjs";
import {
  createCompositionReference,
  mountCompositionReferenceCollection,
  compositionReactDOMVersion,
  compositionReactVersion,
} from "./build/reference.bundle.mjs";

const status = document.getElementById("status");
const candidateArena = document.getElementById("candidate-roots");
const referenceArena = document.getElementById("reference-roots");
const MANAGER_METHODS = [
  "create", "createChild", "tree", "list", "snapshot", "dispatch", "effects", "complete",
  "audit", "dispose", "disposeTree", "setChildInputs", "publish", "changes",
];
const LOGGED_MANAGER_METHODS = new Set([
  "create", "createChild", "dispatch", "effects", "complete", "dispose", "disposeTree",
  "setChildInputs", "publish", "changes",
]);
const BACKENDS = ["dom", "react", "godom"];

function cloneJSON(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function errorFrame(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 1 && typeof value.error === "string";
}

function asOperationError(value) {
  return errorFrame(value) ? { error: value.error } : value;
}

function managerAdapter(raw, side) {
  const adapted = {};
  for (const method of MANAGER_METHODS) {
    if (typeof raw?.[method] !== "function") throw new Error(`gobiComposition is missing ${method}()`);
    adapted[method] = (...args) => {
      const current = side.currentAction;
      try {
        const result = Reflect.apply(raw[method], raw, args);
        if (current && LOGGED_MANAGER_METHODS.has(method)) {
          current.calls.push({ method, args: cloneJSON(args), result: cloneJSON(result) });
          if (method === "changes" && Array.isArray(result)) current.drainedChanges.push(...result);
          if (method === "effects" && Array.isArray(result)) {
            current.managerEffects.push({ sessionID: args[0], commands: cloneJSON(result) });
          }
        }
        return result;
      } catch (error) {
        if (current) current.calls.push({ method, args: cloneJSON(args), error: errorMessage(error) });
        throw error;
      }
    };
  }
  return adapted;
}

async function startCompositionWasm() {
  if (typeof globalThis.Go !== "function") throw new Error("wasm_exec.js did not publish Go");
  const response = await fetch("/typed-composition/build/composition.wasm", { cache: "no-store" });
  if (!response.ok) throw new Error(`composition WASM returned HTTP ${response.status}`);
  const go = new globalThis.Go();
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  Promise.resolve(go.run(instance)).catch((error) => {
    globalThis.__typedCompositionStartupError = errorMessage(error);
  });
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (globalThis.gobiComposition) return globalThis.gobiComposition;
    if (globalThis.__typedCompositionStartupError) throw new Error(globalThis.__typedCompositionStartupError);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("gobiComposition was not published within 10 seconds");
}

function buildElementIndex(viewRoot, tree) {
  const treeElements = [];
  const pathByKey = new Map();
  function visit(node, path) {
    if (!node || typeof node !== "object") return;
    if (node.Kind === 1) {
      treeElements.push({ node, path });
      pathByKey.set(node.Key, path);
    }
    for (const [index, child] of (node.Kids ?? []).entries()) {
      visit(child, path === "" ? String(index) : `${path}/${index}`);
    }
  }
  visit(tree, "");
  const domElements = [...viewRoot.querySelectorAll("*")];
  const byPath = new Map();
  const byKey = new Map();
  const byElement = new WeakMap();
  const countMatches = treeElements.length === domElements.length;
  for (let index = 0; index < Math.min(treeElements.length, domElements.length); index += 1) {
    const { node, path } = treeElements[index];
    const element = domElements[index];
    byPath.set(path, element);
    byKey.set(node.Key, element);
    byElement.set(element, { key: node.Key, path, node });
  }
  return { byPath, byKey, byElement, pathByKey, countMatches, treeElementCount: treeElements.length,
    domElementCount: domElements.length };
}

function inputsFor(viewRoot, index) {
  return [...viewRoot.querySelectorAll('input[type="text"]')].map((element) => {
    const mapped = index.byElement.get(element);
    return {
      key: mapped?.key ?? "",
      path: mapped?.path ?? null,
      value: element.value,
      disabled: element.disabled === true,
      disabledAttribute: element.hasAttribute("disabled"),
      selectionStart: Number.isInteger(element.selectionStart) ? element.selectionStart : 0,
      selectionEnd: Number.isInteger(element.selectionEnd) ? element.selectionEnd : 0,
      selectionDirection: element.selectionDirection ?? "none",
    };
  });
}

function controlsFor(viewRoot, index) {
  return [...viewRoot.querySelectorAll("input,button")].map((element) => {
    const mapped = index.byElement.get(element);
    const rowInput = element.closest(".row")?.querySelector('input[aria-label]');
    return {
      tag: element.localName,
      key: mapped?.key ?? "",
      path: mapped?.path ?? null,
      className: element.className ?? "",
      label: element.getAttribute("aria-label") ?? "",
      rowLabel: rowInput?.getAttribute("aria-label") ?? null,
      text: element.textContent ?? "",
      value: "value" in element ? element.value : null,
      disabled: element.disabled === true,
      disabledAttribute: element.hasAttribute("disabled"),
      type: element.getAttribute("type"),
    };
  });
}

function liveFocusFor(viewRoot, index) {
  const active = viewRoot.ownerDocument.activeElement;
  if (!active || !viewRoot.contains(active) || active.localName !== "input") return null;
  const mapped = index.byElement.get(active);
  if (!mapped || !Number.isInteger(active.selectionStart) || !Number.isInteger(active.selectionEnd)) return null;
  return {
    active: true,
    key: mapped.key,
    path: mapped.path,
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd,
    selectionDirection: active.selectionDirection ?? "none",
    value: active.value,
    disabled: active.disabled === true,
  };
}

function makeTransport(side, sessionID, hostGeneration) {
  const requests = new Map();
  const events = [];
  let localSequence = 0;
  function append(kind, extra = {}) {
    const sequence = ++side.transportClock.sequence;
    const localSequenceValue = ++localSequence;
    const payload = cloneJSON(extra);
    const record = {
      ...payload,
      sequence,
      localSequence: localSequenceValue,
      kind,
      side: side.name,
      sessionID,
      hostGeneration,
      payload,
    };
    events.push(record);
    side.transportClock.events.push(cloneJSON(record));
    return record;
  }
  return {
    side, sessionID, hostGeneration, requests, events,
    start(command, deliver) {
      append("start", { ID: command.ID, Value: command.Value, command: cloneJSON(command) });
      if (requests.has(command.ID)) throw new Error(`${side.name} transport reused request ${command.ID} in session ${sessionID}`);
      const record = { ID: command.ID, Value: command.Value, State: "held", deliver };
      requests.set(command.ID, record);
      side.pendingEffects.push({ sessionID, command: cloneJSON(command) });
    },
    cancel(ID) {
      const record = requests.get(ID);
      const previousState = record?.State ?? "missing";
      const ignored = record !== undefined && record.State !== "held";
      append("cancel", { ID, previousState, ignored });
      if (ignored) return undefined;
      if (record) record.State = "cancelled";
      else requests.set(ID, { ID, Value: "", State: "cancelled", deliver: null });
      return undefined;
    },
    deliver(ID, reply) {
      const record = requests.get(ID);
      const previousState = record?.State ?? "missing";
      append("delivery", { ID, Value: reply?.Value, Error: reply?.Error, previousState });
      if (!record || typeof record.deliver !== "function") throw new Error(`${side.name} has no saved callback for ${sessionID}/${ID}`);
      let callbackError = null;
      try { record.deliver(cloneJSON(reply)); }
      catch (error) { callbackError = errorMessage(error); }
      if (previousState === "held" && callbackError === null) record.State = "delivered";
      return { previousState, callbackError };
    },
  };
}

function createSide(name, rawManager, descriptors, arena) {
  const side = {
    name,
    currentAction: null,
    transports: new Map(),
    pendingEffects: [],
    transportClock: { sequence: 0, events: [] },
    mounted: new Map(),
    history: [],
    rootIndex: 0,
    replaced: new Set(),
    nextBackendByID: new Map(),
  };
  side.manager = managerAdapter(rawManager, side);
  side.host = createCompositionHost({
    manager: side.manager,
    descriptors,
    transportFactory(sessionID, viewRoot, generation) {
      const transport = makeTransport(side, sessionID, generation);
      side.transports.set(sessionID, transport);
      return transport;
    },
  });
  side.arena = arena;
  return side;
}

function createDescriptors(sideName) {
  if (sideName === "reference") {
    return {
      react(root, runtime) {
        return mountCompositionReferenceCollection(root, runtime, runtime.init());
      },
    };
  }
  return { dom: mountKeyedDOM, react: mountKeyedReact, godom: mountGoDOM };
}

function slotFor(side) {
  const slot = side.arena.ownerDocument.createElement("div");
  slot.dataset.rootSlot = `${side.name}-${side.rootIndex++}`;
  side.arena.appendChild(slot);
  return slot;
}

function activeRecord(side, id) {
  return side.mounted.get(id) ?? null;
}

function snapshotFor(side, id) {
  try { return asOperationError(side.manager.snapshot(id)); }
  catch (error) { return { error: errorMessage(error) }; }
}

function treeNodeAt(tree, path) {
  let node = tree;
  if (path === "") return node;
  for (const raw of path.split("/")) {
    const index = Number(raw);
    if (!Number.isSafeInteger(index) || !Array.isArray(node?.Kids) || index >= node.Kids.length) {
      throw new Error(`dispatch path ${JSON.stringify(path)} is not present in the current tree`);
    }
    node = node.Kids[index];
  }
  return node;
}

async function dispatchThroughDOM(side, sessionID, step, inputWitness = null) {
  const record = activeRecord(side, sessionID);
  if (!record) throw new Error(`${side.name} has no mounted session ${sessionID}`);
  const snapshot = side.manager.snapshot(sessionID);
  if (errorFrame(snapshot)) return snapshot;
  const node = treeNodeAt(snapshot.tree, step.Path);
  if (!node || node.Kind !== 1 || node.Key !== step.Key) {
    throw new Error(`dispatch key ${JSON.stringify(step.Key)} does not name the rendered node at ${JSON.stringify(step.Path)}`);
  }
  const index = buildElementIndex(record.viewRoot, snapshot.tree);
  if (!index.countMatches) throw new Error(`rendered element count mismatch in ${side.name}/${sessionID}: tree=${index.treeElementCount}, DOM=${index.domElementCount}`);
  const element = index.byPath.get(step.Path);
  if (!element) throw new Error(`no mounted DOM element for ${side.name}/${sessionID}/${step.Path}`);
  if (element.disabled === true) {
    side.currentAction.disabledStepProbe = true;
    const isInputStep = step.Event === "input" && element.localName === "input";
    const beforeValue = "value" in element ? element.value : null;
    const beforeSnapshot = cloneJSON(side.manager.snapshot(sessionID));
    const nativeChangesBefore = cloneJSON(side.manager.changes());
    const dispatchCallsBeforeClick = side.currentAction.calls.filter((call) => call.method === "dispatch").length;
    let clickEvents = 0;
    let inputEvents = 0;
    const countClick = () => { clickEvents += 1; };
    const countInput = () => { inputEvents += 1; };
    element.addEventListener("click", countClick, true);
    if (isInputStep) element.addEventListener("input", countInput, true);
    element.click();
    await side.host.settled();
    element.removeEventListener("click", countClick, true);
    if (isInputStep) element.removeEventListener("input", countInput, true);
    const afterValue = "value" in element ? element.value : null;
    const afterSnapshot = cloneJSON(side.manager.snapshot(sessionID));
    const nativeChangesAfter = cloneJSON(side.manager.changes());
    const nativeDispatches = side.currentAction.calls.filter((call) => call.method === "dispatch").length - dispatchCallsBeforeClick;

    const directChangesBefore = cloneJSON(side.manager.changes());
    const directSnapshotBefore = cloneJSON(side.manager.snapshot(sessionID));
    const dispatchCallsBeforeGuard = side.currentAction.calls.filter((call) => call.method === "dispatch").length;
    let guardResult;
    let guardError = null;
    try { guardResult = side.manager.dispatch(sessionID, step); }
    catch (error) { guardError = errorMessage(error); }
    const directSnapshotAfter = cloneJSON(side.manager.snapshot(sessionID));
    const directChangesAfter = cloneJSON(side.manager.changes());
    const directDispatchCalls = side.currentAction.calls.filter((call) => call.method === "dispatch").length - dispatchCallsBeforeGuard;
    const directGuard = {
      mode: "direct-manager-guard",
      method: "dispatch",
      args: [sessionID, cloneJSON(step)],
      dispatchCalls: directDispatchCalls,
      snapshotBefore: directSnapshotBefore,
      snapshotAfter: directSnapshotAfter,
      changesBefore: directChangesBefore,
      changesAfter: directChangesAfter,
      ...(guardError === null ? { result: asOperationError(guardResult) } : { error: guardError }),
    };
    if (isInputStep) {
      side.currentAction.inputObservation = {
        mode: "blocked-disabled",
        requested: inputWitness?.requested ?? step.Value,
        key: step.Key,
        beforeValue,
        afterValue,
        nativeDispatches,
        eventValue: null,
        eventStep: null,
        nativeClick: true,
        nativeClickEvents: clickEvents,
        nativeInputEvents: inputEvents,
        snapshotBefore: beforeSnapshot,
        snapshotAfter: afterSnapshot,
        nativeChangesBefore,
        nativeChangesAfter,
        directGuard,
      };
    }
    return guardError === null ? asOperationError(guardResult) : { error: guardError };
  }

  if (step.Event === "input") {
    side.currentAction.didInput = true;
    element.focus();
    const beforeValue = element.value;
    const requested = inputWitness?.requested ?? step.Value;
    element.value = requested;
    const inputObservation = {
      mode: "dispatched",
      requested,
      key: step.Key,
      beforeValue,
      afterValue: null,
      effective: null,
      eventValue: step.Value,
      eventStep: null,
      expectedEffective: inputWitness?.effective ?? step.Value,
      nativeDispatches: 0,
      directGuard: null,
    };
    side.currentAction.inputObservation = inputObservation;
    const dispatchCallsBeforeEvent = side.currentAction.calls.filter((call) => call.method === "dispatch").length;
    // A noncollapsed backward selection makes keyed update and renderer-swap
    // preservation observable in the immediate post-action DOM witness.
    if (typeof element.setSelectionRange === "function" && step.Value.length >= 2) {
      element.setSelectionRange(0, Math.min(2, step.Value.length), "backward");
      side.currentAction.focusSelectionPrepared = true;
    }
    const EventType = element.ownerDocument.defaultView.InputEvent;
    element.dispatchEvent(new EventType("input", { bubbles: true }));
    await side.host.settled();
    inputObservation.afterValue = element.value;
    inputObservation.effective = element.value;
    inputObservation.nativeDispatches = side.currentAction.calls.filter((call) => call.method === "dispatch").length - dispatchCallsBeforeEvent;
    const eventCall = side.currentAction.calls.filter((call) => call.method === "dispatch").at(-1);
    inputObservation.eventStep = cloneJSON(eventCall?.args?.[1] ?? null);
    inputObservation.eventValue = eventCall?.args?.[1]?.Value ?? null;
  } else if (step.Event === "click") {
    element.click();
  } else {
    element.dispatchEvent(new element.ownerDocument.defaultView.Event(step.Event, { bubbles: true }));
  }
  await side.host.settled();
  const invoked = side.currentAction.calls.filter((call) => call.method === "dispatch").at(-1);
  return invoked ? asOperationError(invoked.result) : snapshotFor(side, sessionID);
}

async function replaceForFocusWitness(side, sessionID, action) {
  if (side.name !== "candidate" || action.method !== "dispatch" || side.replaced.has(sessionID)) return null;
  if (!side.currentAction.didInput || !side.currentAction.focusSelectionPrepared) return null;
  const step = action.args[1];
  if (step?.Event !== "input") return null;
  const record = activeRecord(side, sessionID);
  if (!record) return null;
  const beforeIndex = buildElementIndex(record.viewRoot, side.manager.snapshot(sessionID).tree);
  const before = liveFocusFor(record.viewRoot, beforeIndex);
  if (!before?.active) return null;
  const snapshotBefore = cloneJSON(side.manager.snapshot(sessionID));
  const treeBefore = cloneJSON(side.host.tree());
  const currentBackend = side.host.snapshotAll().find((entry) => entry.sessionID === sessionID)?.backend ?? "dom";
  const currentIndex = BACKENDS.indexOf(currentBackend);
  const nextBackend = BACKENDS[(currentIndex + 1 + BACKENDS.length) % BACKENDS.length];
  const result = side.host.replace(sessionID, nextBackend);
  // Capture synchronously after replace() returns, before another side or
  // renderer action can change the active element or selection.
  const afterRecord = activeRecord(side, sessionID);
  const afterSnapshot = side.manager.snapshot(sessionID);
  const snapshotAfter = cloneJSON(afterSnapshot);
  const treeAfter = cloneJSON(side.host.tree());
  const afterIndex = buildElementIndex(afterRecord.viewRoot, afterSnapshot.tree);
  const afterImmediate = liveFocusFor(afterRecord.viewRoot, afterIndex);
  await side.host.settled();
  side.replaced.add(sessionID);
  const settledRecord = activeRecord(side, sessionID);
  const settledSnapshot = side.manager.snapshot(sessionID);
  const settledIndex = buildElementIndex(settledRecord.viewRoot, settledSnapshot.tree);
  return {
    sessionID,
    from: currentBackend,
    to: nextBackend,
    result: cloneJSON(result),
    expectedKey: step.Key,
    before,
    after: afterImmediate,
    afterSettled: liveFocusFor(settledRecord.viewRoot, settledIndex),
    snapshotBefore,
    snapshotAfter,
    treeBefore,
    treeAfter,
    inputValue: afterIndex.byKey.get(before.key)?.value ?? null,
  };
}

async function executeAction(side, action, inputWitness = null) {
  const { method, args } = action;
  let result;
  let disposedIDs = [];
  try {
    switch (method) {
      case "create": {
        const backend = side.name === "reference" ? "react" : BACKENDS[(side.mounted.size) % BACKENDS.length];
        const mounted = side.host.mountRoot(slotFor(side), backend);
        side.mounted.set(mounted.sessionID, {
          ...mounted,
          backend,
          generation: side.transports.get(mounted.sessionID)?.hostGeneration ?? null,
        });
        side.nextBackendByID.set(mounted.sessionID, backend);
        result = mounted.sessionID;
        break;
      }
      case "createChild": {
        const parentID = args[0];
        const parent = activeRecord(side, parentID);
        if (!parent) {
          // Preserve the native public call's rejection for a non-hosted
          // parent without allocating or mutating manager state.
          result = asOperationError(side.manager.createChild(parentID));
          break;
        }
        const backend = side.name === "reference" ? "react" : BACKENDS[(side.mounted.size) % BACKENDS.length];
        const mounted = side.host.mountChild(parentID, backend);
        side.mounted.set(mounted.sessionID, {
          ...mounted,
          backend,
          generation: side.transports.get(mounted.sessionID)?.hostGeneration ?? null,
        });
        side.nextBackendByID.set(mounted.sessionID, backend);
        result = mounted.sessionID;
        break;
      }
      case "dispatch":
        result = await dispatchThroughDOM(side, args[0], args[1], inputWitness);
        break;
      case "setChildInputs":
        result = asOperationError(side.host.setChildInputs(...args));
        break;
      case "publish":
        result = asOperationError(side.host.publish(...args));
        break;
      case "complete": {
        const [sessionID, reply] = args;
        const transport = side.transports.get(sessionID);
        if (!transport) result = asOperationError(side.manager.complete(sessionID, reply));
        else {
          transport.deliver(reply.ID, reply);
          const call = side.currentAction.calls.filter((item) => item.method === "complete").at(-1);
          result = call ? asOperationError(call.result) : snapshotFor(side, sessionID);
        }
        break;
      }
      case "effects": {
        const [sessionID] = args;
        result = side.pendingEffects.filter((entry) => entry.sessionID === sessionID).map((entry) => cloneJSON(entry.command));
        side.pendingEffects = side.pendingEffects.filter((entry) => entry.sessionID !== sessionID);
        break;
      }
      case "dispose":
      case "disposeTree": {
        const [sessionID] = args;
        const bundles = side.host.dispose(sessionID);
        disposedIDs = bundles.map((bundle) => bundle.SessionID);
        result = method === "dispose"
          ? (bundles.find((bundle) => bundle.SessionID === sessionID)?.Commands ?? [])
          : bundles;
        for (const id of disposedIDs) {
          const previous = side.mounted.get(id);
          const transport = side.transports.get(id);
          if (previous) side.history.push({ sessionID: id, parentID: previous.parentID, depth: previous.depth,
            backend: previous.backend,
            generation: transport?.hostGeneration ?? previous.generation ?? null,
            lifecycle: "disposed" });
          side.mounted.delete(id);
          side.transports.delete(id);
        }
        break;
      }
      case "changes":
        result = asOperationError(side.manager.changes());
        break;
      case "tree":
        result = side.host.tree();
        break;
      case "list":
        result = side.manager.list();
        break;
      case "snapshot":
        result = asOperationError(side.host.snapshot(args[0]));
        break;
      case "audit": {
        const session = side.host.snapshotAll().find((entry) => entry.sessionID === args[0]);
        result = session?.audit ?? side.manager.audit(args[0]);
        break;
      }
      default: {
        if (typeof side.manager[method] !== "function") throw new Error(`unknown composition method ${method}`);
        result = asOperationError(side.manager[method](...args));
      }
    }
  } catch (error) {
    result = { error: errorMessage(error) };
  }
  try { await side.host.settled(); }
  catch (error) { side.currentAction.settledError = errorMessage(error); }
  if (method === "complete") {
    const completed = side.currentAction.calls.filter((call) => call.method === "complete").at(-1);
    if (completed?.result !== undefined) result = asOperationError(completed.result);
    else if (completed?.error) result = { error: completed.error };
  }
  const focusReplacement = await replaceForFocusWitness(side, args[0], action).catch((error) => ({ error: errorMessage(error) }));
  const actor = captureActor(side, side.currentAction, { result, disposedIDs, focusReplacement });
  return { result: cloneJSON(result), actor };
}

function expectedDisabled(snapshot, tag, className, rowLabel, parentID) {
  const state = snapshot?.state;
  const rows = state?.Rows ?? [];
  const readOnly = state?.Inputs?.ReadOnly === true;
  if (tag === "input") return readOnly;
  if (readOnly) return true;
  if (className === "add") return rows.length >= 4;
  if (className === "reset") return rows.length === 0;
  const rowID = Number(/^Row ([1-9][0-9]*)$/.exec(rowLabel ?? "")?.[1] ?? 0);
  const rowIndex = rows.findIndex((row) => row.ID === rowID);
  const row = rowIndex < 0 ? null : rows[rowIndex];
  if (className === "publish") return parentID === 0 || !row || row.Saved === "";
  if (className === "save") return !row || row.Draft === "";
  if (className === "cancel") return !row || row.PendingID === 0;
  if (className === "up") return rowIndex <= 0;
  return false;
}

function captureActor(side, currentAction, { result, disposedIDs, focusReplacement }) {
  const managerTree = side.host.tree();
  const managerList = side.manager.list();
  const entries = side.host.snapshotAll();
  const sessions = entries.map((entry) => {
    const id = entry.sessionID;
    const record = activeRecord(side, id);
    const managerSnapshot = side.manager.snapshot(id);
    const hostSnapshot = side.host.snapshot(id);
    const index = buildElementIndex(entry.viewRoot, managerSnapshot.tree);
    const actualDOM = entry.viewRoot.innerHTML;
    const inputs = inputsFor(entry.viewRoot, index);
    const controls = controlsFor(entry.viewRoot, index);
    const focusWitness = liveFocusFor(entry.viewRoot, index);
    const disabledViolations = controls.filter((control) =>
      control.disabled !== expectedDisabled(managerSnapshot, control.tag, control.className, control.rowLabel, entry.parentID));
    const reportedDisabled = Array.isArray(entry.domSnapshot?.disabled) ? [...entry.domSnapshot.disabled].sort() : [];
    const actualDisabled = controls.filter((control) => control.disabled).map((control) => control.path).sort();
    const visibleTitle = index.byKey.get("composition-title")?.textContent ?? null;
    const visibleInbox = index.byKey.get("composition-inbox")?.textContent ?? null;
    return {
      sessionID: id,
      parentID: entry.parentID,
      depth: entry.depth,
      generation: record?.generation ?? side.transports.get(id)?.hostGeneration ?? null,
      backend: entry.backend,
      managerSnapshot: cloneJSON(managerSnapshot),
      snapshot: cloneJSON(entry.snapshot),
      hostSnapshot: cloneJSON(hostSnapshot),
      audit: cloneJSON(entry.audit),
      managerAudit: cloneJSON(side.manager.audit(id)),
      domSnapshot: cloneJSON(entry.domSnapshot),
      actualDOM,
      actualDOMMatchesSnapshot: entry.domSnapshot?.html === actualDOM,
      shellHTML: record?.shell?.outerHTML ?? "",
      focus: cloneJSON(entry.focus),
      focusWitness,
      lifecycle: entry.lifecycle,
      errors: cloneJSON(entry.errors),
      inputs,
      controls,
      elementCountMatches: index.countMatches,
      elementCounts: { tree: index.treeElementCount, dom: index.domElementCount },
      disabledViolations,
      reportedDisabled,
      actualDisabled,
      reportedDisabledMatches: JSON.stringify(reportedDisabled) === JSON.stringify(actualDisabled),
      visibleTitle,
      expectedTitle: `Title: ${managerSnapshot.state?.Inputs?.Title ?? ""}`,
      visibleInbox,
      expectedInbox: `Published: ${managerSnapshot.state?.Inbox?.length ?? 0}`,
      transportLog: cloneJSON(side.transports.get(id)?.events ?? []),
      rowOrder: (managerSnapshot.state?.Rows ?? []).map((row) => `Row ${row.ID}`),
      inputOrder: inputs.map((input) => `Row ${input.key.match(/row-(\d+)-input/)?.[1] ?? ""}`),
      inputValues: inputs.map((input) => input.value),
      shellOwnership: record ? {
        shellChildren: [...record.shell.children].map((child) => child.className),
        viewContained: record.shell.contains(record.viewRoot),
        childrenContained: record.shell.contains(record.childrenRoot),
        physicalParent: record.shell.parentElement?.className ?? record.shell.parentElement?.dataset.rootSlot ?? null,
      } : null,
    };
  });
  const dirty = [...new Set(currentAction.drainedChanges.flat())].sort((left, right) => left - right);
  const allLifecycle = [
    ...side.history,
    ...[...side.mounted.values()].map((record) => ({ sessionID: record.sessionID, parentID: record.parentID,
      depth: record.depth, backend: side.host.snapshotAll().find((entry) => entry.sessionID === record.sessionID)?.backend ?? record.backend,
      generation: record.generation ?? side.transports.get(record.sessionID)?.hostGeneration ?? null,
      lifecycle: side.host.snapshotAll().find((entry) => entry.sessionID === record.sessionID)?.lifecycle ?? "active" })),
  ];
  return {
    managerTree: cloneJSON(managerTree),
    hostTree: cloneJSON(managerTree),
    managerList: cloneJSON(managerList),
    snapshotAllIDs: entries.map((entry) => entry.sessionID),
    activeIDs: managerList.slice(),
    sessions,
    changes: dirty,
    managerCalls: cloneJSON(currentAction.calls),
    managerEffects: cloneJSON(currentAction.managerEffects),
    effectsPending: cloneJSON(side.pendingEffects),
    transportCalls: cloneJSON(side.transportClock.events.filter((event) => event.sequence > currentAction.transportClockStart)),
    transportClock: {
      before: currentAction.transportClockStart,
      after: side.transportClock.sequence,
    },
    lifecycle: allLifecycle,
    actionResult: cloneJSON(result),
    disposedIDs,
    settledError: currentAction.settledError ?? null,
    disabledStepProbe: currentAction.disabledStepProbe === true,
    inputObservation: cloneJSON(currentAction.inputObservation ?? null),
    focusReplacement,
  };
}

async function createFixture() {
  const rawGoManager = await startCompositionWasm();
  await loadGoDOM({ wasmURL: "/typed-composition/build/godom.wasm" });
  const rawReference = createCompositionReference();
  const candidate = createSide("candidate", rawGoManager, createDescriptors("candidate"), candidateArena);
  const reference = createSide("reference", rawReference, createDescriptors("reference"), referenceArena);

  async function runScript(selectedScript) {
    if (!selectedScript || !Array.isArray(selectedScript.actions)) throw new TypeError("script.actions must be an array");
    const frames = [];
    for (const [index, action] of selectedScript.actions.entries()) {
      const actors = {};
      const results = {};
      const inputWitness = selectedScript.inputWitnesses?.find((entry) => entry.actionIndex === index) ?? null;
      for (const side of [candidate, reference]) {
        side.currentAction = {
          index,
          action,
          calls: [],
          drainedChanges: [],
          managerEffects: [],
          transportClockStart: side.transportClock.sequence,
          inputWitness,
        };
        const executed = await executeAction(side, action, inputWitness);
        actors[side.name] = executed.actor;
        results[side.name] = executed.result;
      }
      frames.push({ index, action: cloneJSON(action), operationResults: results, candidate: actors.candidate,
        reference: actors.reference, captureOrder: ["candidate", "reference"], inputWitness: cloneJSON(inputWitness) });
    }
    const rootIDs = [...new Set([
      ...candidate.host.tree().filter((entry) => entry.ParentID === 0).map((entry) => entry.SessionID),
      ...reference.host.tree().filter((entry) => entry.ParentID === 0).map((entry) => entry.SessionID),
    ])];
    return {
      name: selectedScript.name,
      seed: selectedScript.seed ?? null,
      actions: cloneJSON(selectedScript.actions),
      inputWitnesses: cloneJSON(selectedScript.inputWitnesses ?? []),
      frames,
      versions: {
        react: compositionReactVersion,
        reactDOM: compositionReactDOMVersion,
        userAgent: navigator.userAgent,
      },
      remainingRoots: rootIDs,
    };
  }

  async function runDisabledDOMNegative(selectedScript) {
    const scenario = await runScript(selectedScript);
    const session = candidate.host.snapshotAll().find((entry) =>
      entry.snapshot?.state?.Inputs?.ReadOnly === true);
    if (!session) return { scenario, mutation: { status: "unavailable", reason: "no read-only candidate session" } };
    const input = session.viewRoot.querySelector("input,button");
    if (!input) return { scenario, mutation: { status: "unavailable", reason: "no candidate control" } };
    const prior = input.disabled;
    input.disabled = false;
    const syntheticAction = { method: "physical-disabled-mutation", args: [] };
    candidate.currentAction = { index: scenario.frames.length, action: syntheticAction, calls: [], drainedChanges: [],
      managerEffects: [], transportClockStart: candidate.transportClock.sequence };
    reference.currentAction = { index: scenario.frames.length, action: syntheticAction, calls: [], drainedChanges: [],
      managerEffects: [], transportClockStart: reference.transportClock.sequence };
    const mutatedCandidate = captureActor(candidate, candidate.currentAction, {
      result: { mutation: "removed disabled property from a read-only DOM control" }, disposedIDs: [], focusReplacement: null,
    });
    const unchangedReference = captureActor(reference, reference.currentAction, {
      result: { mutation: "reference not mutated" }, disposedIDs: [], focusReplacement: null,
    });
    const index = buildElementIndex(session.viewRoot, session.snapshot.tree);
    const mutant = {
      sessionID: session.sessionID,
      key: index.byElement.get(input)?.key ?? null,
      wasDisabled: prior,
      disabled: input.disabled,
      disabledAttribute: input.hasAttribute("disabled"),
      actualDOM: session.viewRoot.innerHTML,
      expectedReadOnly: session.snapshot.state.Inputs.ReadOnly,
    };
    return { scenario, mutation: mutant, mutationFrame: {
      index: scenario.frames.length,
      action: syntheticAction,
      candidate: mutatedCandidate,
      reference: unchangedReference,
    } };
  }

  async function runRetainedCallbackFenceProbe() {
    async function runSide(side) {
      const backend = side.name === "reference" ? "react" : "dom";
      const begin = (method, args = []) => {
        side.currentAction = {
          index: -1,
          action: { method, args },
          calls: [],
          drainedChanges: [],
          managerEffects: [],
          transportClockStart: side.transportClock.sequence,
        };
      };
      const mountRoot = async () => {
        begin("create");
        const mounted = side.host.mountRoot(slotFor(side), backend);
        side.mounted.set(mounted.sessionID, {
          ...mounted,
          backend,
          generation: side.transports.get(mounted.sessionID)?.hostGeneration ?? null,
        });
        side.nextBackendByID.set(mounted.sessionID, backend);
        await side.host.settled();
        return mounted;
      };
      const mountChild = async (parentID) => {
        begin("createChild", [parentID]);
        const mounted = side.host.mountChild(parentID, backend);
        side.mounted.set(mounted.sessionID, {
          ...mounted,
          backend,
          generation: side.transports.get(mounted.sessionID)?.hostGeneration ?? null,
        });
        side.nextBackendByID.set(mounted.sessionID, backend);
        await side.host.settled();
        return mounted;
      };
      const dispatch = async (sessionID, step) => {
        begin("dispatch", [sessionID, step]);
        await dispatchThroughDOM(side, sessionID, step);
        await side.host.settled();
      };
      const managerProjection = (actor) => ({
        tree: cloneJSON(actor.managerTree),
        sessions: actor.sessions.map((session) => ({ id: session.sessionID, snapshot: cloneJSON(session.managerSnapshot) })),
        changes: cloneJSON(actor.changes),
      });
      const domProjection = (actor) => actor.sessions.map((session) => ({
        sessionID: session.sessionID,
        actualDOM: session.actualDOM,
        inputs: cloneJSON(session.inputs),
        controls: cloneJSON(session.controls),
        visibleTitle: session.visibleTitle,
        visibleInbox: session.visibleInbox,
      }));
      const capture = (label) => {
        begin(label);
        const changes = side.manager.changes();
        const actor = captureActor(side, side.currentAction, {
          result: { label, changes }, disposedIDs: [], focusReplacement: null,
        });
        return { actor, changes: cloneJSON(changes) };
      };

      const oldRoot = await mountRoot();
      const oldChild = await mountChild(oldRoot.sessionID);
      begin("setChildInputs", [oldRoot.sessionID, oldChild.sessionID, { Title: "Ephemeral child", ReadOnly: false }]);
      side.host.setChildInputs(oldRoot.sessionID, oldChild.sessionID, { Title: "Ephemeral child", ReadOnly: false });
      await side.host.settled();
      await dispatch(oldChild.sessionID, { Path: "0", Key: "add", Event: "click", Value: "" });
      await dispatch(oldChild.sessionID, {
        Path: "2/0/0", Key: "row-1-input", Event: "input", Value: "held request before disposal",
      });
      await dispatch(oldChild.sessionID, {
        Path: "2/0/5", Key: "row-1-save", Event: "click", Value: "1",
      });

      const oldSnapshot = side.manager.snapshot(oldChild.sessionID);
      const pendingID = oldSnapshot?.state?.Rows?.[0]?.PendingID ?? 0;
      const oldTransport = side.transports.get(oldChild.sessionID);
      const savedRequest = oldTransport?.requests.get(pendingID);
      const retainedCallback = savedRequest?.deliver;
      const oldIDs = [oldRoot.sessionID, oldChild.sessionID];
      if (!pendingID || typeof retainedCallback !== "function") {
        throw new Error(`${side.name} did not retain a pending transport callback before disposal`);
      }

      begin("disposeTree", [oldRoot.sessionID]);
      const disposed = side.host.dispose(oldRoot.sessionID);
      for (const bundle of disposed) {
        const prior = side.mounted.get(bundle.SessionID);
        const transport = side.transports.get(bundle.SessionID);
        if (prior) side.history.push({ sessionID: bundle.SessionID, parentID: prior.parentID,
          depth: prior.depth, backend: prior.backend,
          generation: transport?.hostGeneration ?? prior.generation ?? null,
          lifecycle: "disposed" });
        side.mounted.delete(bundle.SessionID);
        side.transports.delete(bundle.SessionID);
      }
      await side.host.settled();

      const freshRoot = await mountRoot();
      const freshChild = await mountChild(freshRoot.sessionID);
      begin("setChildInputs", [freshRoot.sessionID, freshChild.sessionID, { Title: "Ephemeral child", ReadOnly: false }]);
      side.host.setChildInputs(freshRoot.sessionID, freshChild.sessionID, { Title: "Ephemeral child", ReadOnly: false });
      await side.host.settled();
      const freshIDs = [freshRoot.sessionID, freshChild.sessionID];
      const before = capture("retained-callback-baseline");

      begin("retained-callback-delivery", [oldChild.sessionID, pendingID]);
      const delivery = oldTransport.deliver(pendingID, {
        ID: pendingID, Value: "late reply must be fenced", Error: "",
      });
      // The retired keyed host pumps the retained callback in a microtask.
      // Wait past that pump, then settle the new live tree and read Changes.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await side.host.settled();
      const after = capture("retained-callback-after");
      const completeCalls = side.currentAction.calls.filter((call) => call.method === "complete");

      return {
        side: side.name,
        actualGoManager: side.name === "candidate",
        old: {
          rootID: oldRoot.sessionID,
          childID: oldChild.sessionID,
          pendingID,
          pendingSnapshot: cloneJSON(oldSnapshot),
          savedCallbackRetained: typeof retainedCallback === "function",
          transportStateBeforeDelivery: savedRequest.State,
        },
        disposedIDs: disposed.map((bundle) => bundle.SessionID),
        freshIDs,
        before: {
          manager: managerProjection(before.actor),
          dom: domProjection(before.actor),
          changes: before.changes,
        },
        after: {
          manager: managerProjection(after.actor),
          dom: domProjection(after.actor),
          changes: after.changes,
        },
        delivery: cloneJSON(delivery),
        goCompleteCalls: completeCalls.length,
        completeCalls: cloneJSON(completeCalls),
        transportEvents: cloneJSON(oldTransport.events),
      };
    }

    return {
      candidate: await runSide(candidate),
      reference: await runSide(reference),
      versions: { react: compositionReactVersion, reactDOM: compositionReactDOMVersion },
    };
  }

  return {
    candidate,
    reference,
    runScript,
    runDisabledDOMNegative,
    runRetainedCallbackFenceProbe,
    versions: { react: compositionReactVersion, reactDOM: compositionReactDOMVersion },
  };
}

try {
  const fixture = await createFixture();
  globalThis.__typedCompositionFixture = fixture;
  status.textContent = `Go typed composition, DOM/React/GoDOM, and pinned React reference are ready (${fixture.versions.react}).`;
} catch (error) {
  status.textContent = `Fixture startup failed: ${error?.stack ?? error}`;
  globalThis.__typedCompositionStartupError = errorMessage(error);
}
