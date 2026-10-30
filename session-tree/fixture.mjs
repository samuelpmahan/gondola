import { mountKeyedDOM } from "../keyed-editor/dom.mjs";
import { mountKeyedReact } from "./build/react.bundle.mjs";
import { mountGoDOM, loadGoDOM } from "../renderer-conformance/adapter.mjs";
import { createSessionTreeHost } from "./host.mjs";
import {
  createSessionTreeReference,
  mountTreeReferenceCollection,
  referenceReactDOMVersion,
  referenceReactVersion,
} from "./build/reference.bundle.mjs";

const status = document.getElementById("status");
const candidateArena = document.getElementById("candidate-roots");
const referenceFrame = document.getElementById("reference-context");
const candidateSlots = new Map();
const referenceSlots = new Map();
const tokenBySide = {
  candidate: { tokens: new WeakMap(), next: 0 },
  reference: { tokens: new WeakMap(), next: 0 },
};
const logicalGenerations = { candidate: new Map(), reference: new Map() };

function cloneJSON(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isErrorFrame(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 1 && typeof value.error === "string";
}

function managerAdapter(raw) {
  const methods = ["create", "createChild", "tree", "list", "snapshot", "dispatch", "effects",
    "complete", "audit", "dispose", "disposeTree"];
  const adapted = {};
  for (const name of methods) {
    if (typeof raw?.[name] !== "function") throw new Error(`gobiMultiRoot is missing ${name}()`);
    adapted[name] = (...args) => {
      const value = raw[name](...args);
      if (isErrorFrame(value)) throw new Error(`gobiMultiRoot.${name}: ${value.error}`);
      return value;
    };
  }
  return adapted;
}

async function startManagerWasm() {
  if (typeof globalThis.Go !== "function") throw new Error("wasm_exec.js did not publish Go");
  const response = await fetch("/session-tree/build/multi-root.wasm", { cache: "no-store" });
  if (!response.ok) throw new Error(`multi-root WASM returned HTTP ${response.status}`);
  const go = new Go();
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  Promise.resolve(go.run(instance)).catch((error) => { globalThis.__sessionTreeStartupError = String(error?.stack ?? error); });
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (globalThis.gobiMultiRoot) return managerAdapter(globalThis.gobiMultiRoot);
    if (globalThis.__sessionTreeStartupError) throw new Error(globalThis.__sessionTreeStartupError);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("gobiMultiRoot was not published within 10 seconds");
}

function makeTransport(side, sessionID, hostGeneration) {
  const requests = new Map();
  const events = [];
  let sequence = 0;
  const clock = side.transportClock;
  function recordInvocation(kind, requestID, value = "", error = "") {
    const logical = side.allByID.get(sessionID);
    clock.events.push({
      sequence: ++clock.sequence,
      side: side.name,
      kind,
      sessionID,
      generation: logical?.generation ?? null,
      hostGeneration,
      requestID,
      value,
      error,
    });
  }
  return {
    side,
    sessionID,
    hostGeneration,
    requests,
    events,
    start(command, deliver) {
      recordInvocation("start", command.ID, command.Value, "");
      if (requests.has(command.ID)) throw new Error(`${side} transport reused request ${command.ID} in session ${sessionID}`);
      const record = { ID: command.ID, Value: command.Value, State: "held", deliver };
      requests.set(command.ID, record);
      events.push({ sequence: ++sequence, kind: "start", ID: command.ID, Value: command.Value });
    },
    cancel(ID) {
      recordInvocation("cancel", ID, "", "");
      const record = requests.get(ID);
      if (record && record.State !== "held") return undefined;
      if (record) record.State = "cancelled";
      else requests.set(ID, { ID, Value: "", State: "cancelled", deliver: null });
      events.push({ sequence: ++sequence, kind: "cancel", ID });
      return undefined;
    },
    deliver(ID, reply, late = false) {
      recordInvocation(late ? "stale-delivery" : "delivery", ID, reply.Value, reply.Error);
      const record = requests.get(ID);
      if (!record || typeof record.deliver !== "function") throw new Error(`${side} has no saved callback for ${sessionID}/${ID}`);
      const previousState = record.State;
      events.push({ sequence: ++sequence, kind: late ? "stale-release" : "release", ID,
        Value: reply.Value, Error: reply.Error, previousState });
      let callbackError = null;
      try { record.deliver(cloneJSON(reply)); }
      catch (error) { callbackError = String(error?.message ?? error); }
      if (!late && previousState === "held" && callbackError === null) record.State = "delivered";
      return { previousState, callbackError };
    },
  };
}

function token(side, element) {
  if (!element) return null;
  const state = tokenBySide[side];
  let value = state.tokens.get(element);
  if (value === undefined) {
    value = ++state.next;
    state.tokens.set(element, value);
  }
  return value;
}

function makeSide(name, manager, descriptors) {
  const transports = new Map();
  const side = {
    name, manager, transports, active: new Map(), allByID: new Map(), histories: new Map(),
    focusObservations: new Map(), transportClock: { sequence: 0, events: [] },
  };
  side.host = createSessionTreeHost({
    manager,
    descriptors,
    transportFactory(sessionID, viewRoot, generation) {
      const transport = makeTransport(side, sessionID, generation);
      transports.set(sessionID, transport);
      return transport;
    },
  });
  return side;
}

async function ensureReferenceDocument() {
  if (referenceFrame.contentDocument?.body) return referenceFrame.contentDocument;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("reference iframe did not load")), 5000);
    referenceFrame.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  if (!referenceFrame.contentDocument?.body) throw new Error("reference iframe has no body");
  return referenceFrame.contentDocument;
}

async function rootSlot(name) {
  let candidate = candidateSlots.get(name);
  if (!candidate) {
    candidate = document.createElement("div");
    candidate.dataset.rootSlot = name;
    candidateArena.appendChild(candidate);
    candidateSlots.set(name, candidate);
  }
  let reference = referenceSlots.get(name);
  if (!reference) {
    const referenceDocument = await ensureReferenceDocument();
    reference = referenceDocument.createElement("div");
    reference.dataset.rootSlot = name;
    referenceDocument.body.appendChild(reference);
    referenceSlots.set(name, reference);
  }
  return { candidate, reference };
}

function assignName(side, name, parentName, mounted, logicalGeneration) {
  const record = {
    name,
    parentName,
    sessionID: mounted.sessionID,
    parentID: mounted.parentID,
    depth: mounted.depth,
    shell: mounted.shell,
    viewRoot: mounted.viewRoot,
    childrenRoot: mounted.childrenRoot,
    generation: logicalGeneration,
    hostGeneration: side.transports.get(mounted.sessionID)?.hostGeneration ?? null,
    transport: side.transports.get(mounted.sessionID),
  };
  if (!record.transport) throw new Error(`${side.name} host did not allocate a session transport`);
  side.active.set(name, record);
  side.allByID.set(record.sessionID, record);
  if (!side.histories.has(name)) side.histories.set(name, []);
  side.histories.get(name).push(record);
  return record;
}

function nextLogicalGeneration(sideName, name) {
  const map = logicalGenerations[sideName];
  const next = (map.get(name) ?? 0) + 1;
  map.set(name, next);
  return next;
}

function rowInput(record, rowID) {
  return record?.viewRoot?.querySelector(`input[aria-label="Row ${rowID}"]`) ?? null;
}

function rowSave(record, rowID) {
  const input = rowInput(record, rowID);
  return input?.closest(".row")?.querySelector("button.save") ?? null;
}

function expectedMessage(action) {
  if (action.kind === "add") return { Name: "add", Arg: "" };
  if (action.kind === "fill") return {
    Name: `edit/${action.rowID}`,
    Arg: String(action.value).replace(/[\r\n]/g, ""),
  };
  if (action.kind === "save") return { Name: "save", Arg: String(action.rowID) };
  if (action.kind === "release") return { Name: "reply", Arg: String(action.requestID) };
  return null;
}

function fireAction(side, record, action) {
  if (action.kind === "add") {
    const button = record.viewRoot.querySelector("button.add");
    if (!button) throw new Error(`${side.name}/${action.name} has no Add button`);
    button.click();
  } else if (action.kind === "fill") {
    const input = rowInput(record, action.rowID);
    if (!input) throw new Error(`${side.name}/${action.name} row ${action.rowID} input is missing`);
    input.value = String(action.value);
    const EventType = record.viewRoot.ownerDocument.defaultView.InputEvent;
    input.dispatchEvent(new EventType("input", { bubbles: true }));
  } else if (action.kind === "save") {
    const button = rowSave(record, action.rowID);
    if (!button) throw new Error(`${side.name}/${action.name} row ${action.rowID} Save button is missing`);
    button.click();
  }
}

function pathFromRoot(root, element) {
  const indexes = [];
  let current = element;
  while (current && current !== root) {
    const parent = current.parentNode;
    if (!parent) return null;
    indexes.push(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  if (current !== root) return null;
  // The collection snapshot's tree root is the first DOM child of viewRoot;
  // keyed paths are relative to that tree node, not to the mount container.
  indexes.reverse();
  return indexes.slice(1).join("/");
}

function inputRecord(side, root, input) {
  return {
    key: input.getAttribute("aria-label") ?? "",
    path: pathFromRoot(root, input),
    value: input.value,
    disabled: input.disabled === true,
    selectionStart: Number.isInteger(input.selectionStart) ? input.selectionStart : 0,
    selectionEnd: Number.isInteger(input.selectionEnd) ? input.selectionEnd : 0,
    selectionDirection: input.selectionDirection ?? "none",
    token: token(side, input),
  };
}

function captureSession(side, record, flatEntry) {
  const inputs = [...record.viewRoot.querySelectorAll('input[type="text"]')]
    .map((input) => inputRecord(side.name, record.viewRoot, input));
  const controls = [...record.viewRoot.querySelectorAll("input,button")].map((element) => ({
    tag: element.localName,
    className: element.className ?? "",
    label: element.getAttribute("aria-label") ?? "",
    rowLabel: element.closest(".row")?.querySelector('input[aria-label]')?.getAttribute("aria-label") ?? null,
    path: pathFromRoot(record.viewRoot, element),
    text: element.localName === "button" ? element.textContent : "",
    value: element.localName === "input" ? element.value : null,
    disabled: element.disabled === true,
  }));
  const inputLabels = inputs.map((input) => input.key);
  const expectedOrder = (flatEntry?.snapshot?.state?.Rows ?? []).map((row) => `Row ${row.ID}`);
  const liveOrder = inputs.map((input) => input.key);
  const focusObservation = side.focusObservations.get(record.name) ?? null;
  const witness = focusObservation?.focusWitness ?? null;
  const expectedPhysicalParent = record.parentName === null
    ? (side.name === "candidate" ? candidateSlots.get(record.name) : referenceSlots.get(record.name))
    : side.active.get(record.parentName)?.childrenRoot;
  return {
    name: record.name,
    sessionID: record.sessionID,
    parentID: record.parentID,
    parentName: record.parentName,
    depth: record.depth,
    generation: record.generation,
    hostGeneration: record.hostGeneration,
    backend: flatEntry?.backend ?? null,
    managerSnapshot: cloneJSON(side.manager.snapshot(record.sessionID)),
    snapshot: cloneJSON(flatEntry?.snapshot ?? null),
    hostSnapshot: cloneJSON(side.host.snapshot(record.sessionID)),
    audit: cloneJSON(flatEntry?.audit ?? null),
    managerAudit: cloneJSON(side.manager.audit(record.sessionID)),
    domSnapshot: cloneJSON(flatEntry?.domSnapshot ?? null),
    focus: cloneJSON(focusObservation?.focus ?? null),
    lifecycle: cloneJSON(flatEntry?.lifecycle ?? null),
    errors: cloneJSON(flatEntry?.errors ?? null),
    actualDOM: record.viewRoot.innerHTML,
    shellHTML: record.shell.innerHTML,
    shellChildTokens: [...record.shell.children].map((element) => token(side.name, element)),
    shellOrderValid: record.shell.children.length === 2 && record.shell.children[0] === record.viewRoot &&
      record.shell.children[1] === record.childrenRoot,
    physicalParentToken: token(side.name, record.shell.parentNode),
    physicalParentValid: record.shell.parentNode === expectedPhysicalParent,
    controls,
    inputs,
    inputOrder: liveOrder,
    expectedInputOrder: expectedOrder,
    focusWitness: witness,
    shellToken: token(side.name, record.shell),
    viewRootToken: token(side.name, record.viewRoot),
    childrenRootToken: token(side.name, record.childrenRoot),
    transportLog: cloneJSON(record.transport.events),
  };
}

function captureActor(side) {
  const managerTree = cloneJSON(side.manager.tree());
  const hostTree = cloneJSON(side.host.tree());
  const managerList = cloneJSON(side.manager.list());
  const flat = side.host.snapshotAll();
  const byID = new Map(flat.map((entry) => [entry.sessionID, entry]));
  const sessions = [...side.active.values()].sort((a, b) => a.sessionID - b.sessionID)
    .map((record) => captureSession(side, record, byID.get(record.sessionID)));
  const entryIDs = flat.map((entry) => entry.sessionID).sort((a, b) => a - b);
  const activeIDs = [...side.active.values()].map((record) => record.sessionID).sort((a, b) => a - b);
  const transports = [...side.histories.entries()].flatMap(([name, history]) => history.map((record) => ({
    name,
    generation: record.generation,
    sessionID: record.sessionID,
    parentName: record.parentName,
    events: cloneJSON(record.transport.events),
  })));
  const rootSlots = [...candidateSlots.entries()].map(([name, container]) => ({ name, shells: container.children.length }));
  return {
    managerTree,
    hostTree,
    managerList,
    sessions,
    snapshotAllIDs: entryIDs,
    activeIDs,
    transports,
    transportCalls: cloneJSON(side.transportClock.events),
    rootSlots: side.name === "candidate"
      ? rootSlots
      : [...referenceSlots.entries()].map(([name, container]) => ({ name, shells: container.children.length })),
  };
}

function captureFocusObservations(side) {
  const flatByID = new Map(side.host.snapshotAll().map((entry) => [entry.sessionID, entry]));
  const observations = new Map();
  for (const record of side.active.values()) {
    const target = record.viewRoot.ownerDocument.activeElement;
    let focusWitness = null;
    if (target && record.viewRoot.contains(target) && target.matches?.('input[type="text"][aria-label]')) {
      const match = /^Row (\d+)$/.exec(target.getAttribute("aria-label") ?? "");
      if (match) focusWitness = {
        key: `row-${match[1]}-input`,
        selectionStart: Number.isInteger(target.selectionStart) ? target.selectionStart : 0,
        selectionEnd: Number.isInteger(target.selectionEnd) ? target.selectionEnd : 0,
        selectionDirection: target.selectionDirection ?? "none",
        active: true,
      };
    }
    observations.set(record.name, {
      focus: cloneJSON(flatByID.get(record.sessionID)?.focus ?? null),
      focusWitness,
    });
  }
  side.focusObservations = observations;
}

function activateObservedFocus(side) {
  const active = [...side.focusObservations.entries()].filter(([, observation]) => observation.focusWitness?.active === true);
  if (active.length === 0) return { attempted: false, reason: "no-prior-active-focus" };
  if (active.length !== 1) return { attempted: false, reason: "ambiguous-prior-focus", activeNames: active.map(([name]) => name) };
  const [name, observation] = active[0];
  const record = side.active.get(name);
  const witness = observation.focusWitness;
  const keyMatch = /^row-(\d+)-input$/.exec(witness.key ?? "");
  if (!record || !keyMatch) return { attempted: false, reason: "prior-focus-target-missing", name, key: witness.key ?? null };
  const input = rowInput(record, Number(keyMatch[1]));
  if (!input) return { attempted: false, reason: "prior-focus-input-missing", name, key: witness.key };
  const document = record.viewRoot.ownerDocument;
  const before = document.activeElement;
  const beforeWasTarget = before === input;
  const beforeSelection = {
    start: Number.isInteger(input.selectionStart) ? input.selectionStart : 0,
    end: Number.isInteger(input.selectionEnd) ? input.selectionEnd : 0,
    direction: input.selectionDirection ?? "none",
  };
  input.focus();
  input.setSelectionRange(witness.selectionStart, witness.selectionEnd,
    witness.selectionStart === witness.selectionEnd ? "none" : witness.selectionDirection ?? "none");
  const after = document.activeElement;
  return {
    attempted: true,
    name,
    key: witness.key,
    requested: { start: witness.selectionStart, end: witness.selectionEnd,
      direction: witness.selectionStart === witness.selectionEnd ? "none" : witness.selectionDirection ?? "none" },
    before: { targetActive: beforeWasTarget, selection: beforeSelection },
    after: { targetActive: after === input, start: Number.isInteger(input.selectionStart) ? input.selectionStart : 0,
      end: Number.isInteger(input.selectionEnd) ? input.selectionEnd : 0,
      direction: input.selectionDirection ?? "none" },
  };
}

function activeSubtree(side, name) {
  const result = new Set([name]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const record of side.active.values()) {
      if (!result.has(record.name) && result.has(record.parentName)) {
        result.add(record.name);
        grew = true;
      }
    }
  }
  return [...result];
}

function lookupRetired(side, name, requestID) {
  const history = side.histories.get(name) ?? [];
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const record = history[index];
    if (record.transport.requests.has(requestID)) return record;
  }
  return null;
}

function observedTreePostorder(records, rootID) {
  const children = new Map();
  for (const record of records) {
    if (record.ParentID === 0) continue;
    if (!children.has(record.ParentID)) children.set(record.ParentID, []);
    children.get(record.ParentID).push(record.SessionID);
  }
  for (const ids of children.values()) ids.sort((a, b) => a - b);
  const result = [];
  function visit(id) {
    for (const childID of children.get(id) ?? []) visit(childID);
    result.push(id);
  }
  visit(rootID);
  return result;
}

async function actionOnSide(side, action, referenceSide) {
  if (action.kind === "root" || action.kind === "child") {
    const parentName = action.kind === "child" ? action.parent : null;
    const parent = parentName === null ? null : side.active.get(parentName);
    const rootContainer = action.kind === "root" ? await rootSlot(action.name) : null;
    const backend = action.expectError === true ? action.backend : (referenceSide ? "react" : action.backend);
    const beforeTree = cloneJSON(side.manager.tree());
    const beforeCount = side.host.snapshotAll().length;
    const currentHostTransportIDs = new Set(side.transports.keys());
    try {
      const mounted = action.kind === "root"
        ? side.host.mountRoot(rootContainer[side.name], backend)
        : side.host.mountChild(parent?.sessionID ?? Number.MAX_SAFE_INTEGER, backend);
      if (action.expectError === true) {
        return { side: side.name, expectedError: true, threw: false, error: "unexpected mount success", beforeTree,
          afterTree: cloneJSON(side.manager.tree()), beforeCount, afterCount: side.host.snapshotAll().length, sessionID: mounted.sessionID };
      }
      const generation = nextLogicalGeneration(side.name, action.name);
      const record = assignName(side, action.name, parentName, mounted, generation);
      return { side: side.name, expectedError: false, threw: false, sessionID: record.sessionID,
        parentID: record.parentID, depth: record.depth, generation, beforeTree,
        afterTree: cloneJSON(side.manager.tree()), beforeCount, afterCount: side.host.snapshotAll().length,
        newTransportIDs: [...side.transports.keys()].filter((id) => !currentHostTransportIDs.has(id)) };
    } catch (error) {
      return { side: side.name, expectedError: action.expectError === true, threw: true,
        error: String(error?.message ?? error), beforeTree, afterTree: cloneJSON(side.manager.tree()), beforeCount,
        afterCount: side.host.snapshotAll().length, newTransportIDs: [...side.transports.keys()].filter((id) => !currentHostTransportIDs.has(id)) };
    }
  }

  if (action.kind === "add" || action.kind === "fill" || action.kind === "save") {
    const record = side.active.get(action.name);
    if (!record) throw new Error(`${side.name} has no active session ${action.name}`);
    const before = cloneJSON(side.manager.snapshot(record.sessionID));
    fireAction(side, record, action);
    await side.host.settled();
    const after = cloneJSON(side.manager.snapshot(record.sessionID));
    const expected = expectedMessage(action);
    const messages = after.messages ?? [];
    const priorMessages = before.messages ?? [];
    const witness = {
      side: side.name, name: action.name, kind: action.kind,
      prefixPreserved: JSON.stringify(messages.slice(0, priorMessages.length)) === JSON.stringify(priorMessages),
      expectedMessage: expected,
      actualMessage: messages[priorMessages.length] ?? null,
      beforeCount: priorMessages.length,
      afterCount: messages.length,
    };
    return witness;
  }

  if (action.kind === "focus") {
    const record = side.active.get(action.name);
    if (!record) throw new Error(`${side.name} has no active session ${action.name}`);
    const input = rowInput(record, action.rowID);
    if (!input) throw new Error(`${side.name}/${action.name} cannot focus row ${action.rowID}`);
    input.focus();
    input.setSelectionRange(action.start, action.end, action.direction ?? "none");
    side.focusWitness = {
      name: action.name, rowID: action.rowID, start: action.start, end: action.end,
      direction: action.direction ?? "none",
    };
    return { side: side.name, name: action.name, rowID: action.rowID, start: action.start, end: action.end, direction: action.direction ?? "none" };
  }

  if (action.kind === "replace") {
    const record = side.active.get(action.name);
    if (!record) throw new Error(`${side.name} has no active session ${action.name}`);
    const beforeBackend = side.host.snapshotAll().find((entry) => entry.sessionID === record.sessionID)?.backend;
    side.host.replace(record.sessionID, action.backend);
    return { side: side.name, name: action.name, beforeBackend,
      afterBackend: side.host.snapshotAll().find((entry) => entry.sessionID === record.sessionID)?.backend };
  }

  if (action.kind === "dispose") {
    const target = side.active.get(action.name);
    if (!target) throw new Error(`${side.name} cannot dispose missing session ${action.name}`);
    const beforeTree = cloneJSON(side.manager.tree());
    const beforeSnapshot = cloneJSON(side.manager.snapshot(target.sessionID));
    const expectedIDs = observedTreePostorder(beforeTree, target.sessionID);
    const expectedNames = expectedIDs.map((id) => side.allByID.get(id)?.name ?? null);
    const subtreeNames = activeSubtree(side, action.name);
    const beforeSiblings = [...side.active.values()].filter((node) => !subtreeNames.includes(node.name))
      .map((node) => ({ name: node.name, sessionID: node.sessionID, snapshot: cloneJSON(side.manager.snapshot(node.sessionID)),
        tokens: [...node.viewRoot.querySelectorAll('input[type="text"]')].map((input) => [input.getAttribute("aria-label"), token(side.name, input)]) }));
    const invocationSequenceStart = side.transportClock.sequence + 1;
    const bundles = side.host.dispose(target.sessionID);
    const invocationSequenceEnd = side.transportClock.sequence;
    const actualCancelInvocations = side.transportClock.events.filter((entry) =>
      entry.sequence >= invocationSequenceStart && entry.sequence <= invocationSequenceEnd && entry.kind === "cancel");
    const actualInvocationDelta = side.transportClock.events.filter((entry) =>
      entry.sequence >= invocationSequenceStart && entry.sequence <= invocationSequenceEnd);
    await side.host.settled();
    const returned = cloneJSON(bundles);
    const afterTree = cloneJSON(side.manager.tree());
    for (const name of subtreeNames) side.active.delete(name);
    if (side.focusWitness && subtreeNames.includes(side.focusWitness.name)) side.focusWitness = null;
    const afterSiblings = beforeSiblings.map((before) => {
      const active = side.active.get(before.name);
      return active ? { name: before.name, sessionID: active.sessionID,
        snapshot: cloneJSON(side.manager.snapshot(active.sessionID)),
        tokens: [...active.viewRoot.querySelectorAll('input[type="text"]')].map((input) => [input.getAttribute("aria-label"), token(side.name, input)]) } : null;
    });
    return { side: side.name, name: action.name, expectedIDs, expectedNames, returned,
      invocationSequenceStart, invocationSequenceEnd, actualInvocationDelta, actualCancelInvocations,
      beforeTree, afterTree, beforeSnapshot, beforeSiblings, afterSiblings };
  }

  if (action.kind === "release") {
    const record = side.active.get(action.name);
    if (!record) throw new Error(`${side.name} has no active session ${action.name}`);
    const before = cloneJSON(side.manager.snapshot(record.sessionID));
    const callback = record.transport.deliver(action.requestID, {
      ID: action.requestID, Value: action.value, Error: action.error,
    });
    await side.host.settled();
    const after = cloneJSON(side.manager.snapshot(record.sessionID));
    const previous = before.messages ?? [];
    const actual = after.messages?.[previous.length] ?? null;
    return { side: side.name, name: action.name, requestID: action.requestID,
      callbackError: callback.callbackError, previousState: callback.previousState,
      expectedMessage: expectedMessage(action), actualMessage: actual };
  }

  if (action.kind === "stale-release") {
    const record = lookupRetired(side, action.name, action.requestID);
    if (!record) throw new Error(`${side.name} has no historical transport callback for ${action.name}/${action.requestID}`);
    const currentAlias = side.active.get(action.name) ?? null;
    const beforeTree = cloneJSON(side.manager.tree());
    const beforeActive = [...side.active.values()].map((node) => ({ name: node.name, sessionID: node.sessionID,
      generation: node.generation, parentName: node.parentName,
      snapshot: cloneJSON(side.manager.snapshot(node.sessionID)), audit: cloneJSON(side.manager.audit(node.sessionID)) }));
    const currentAliasHadRequestID = currentAlias?.transport.requests.has(action.requestID) ?? false;
    const callback = record.transport.deliver(action.requestID, { ID: action.requestID, Value: action.value, Error: action.error }, true);
    await side.host.settled();
    const afterTree = cloneJSON(side.manager.tree());
    const afterActive = [...side.active.values()].map((node) => ({ name: node.name, sessionID: node.sessionID,
      generation: node.generation, parentName: node.parentName,
      snapshot: cloneJSON(side.manager.snapshot(node.sessionID)), audit: cloneJSON(side.manager.audit(node.sessionID)) }));
    return { side: side.name, name: action.name, requestID: action.requestID, callbackError: callback.callbackError,
      retiredSessionID: record.sessionID, retiredGeneration: record.generation, retiredHostGeneration: record.hostGeneration,
      currentSessionID: currentAlias?.sessionID ?? null, currentGeneration: currentAlias?.generation ?? null, currentAliasHadRequestID,
      beforeTree, afterTree, beforeActive, afterActive };
  }

  throw new Error(`unsupported session-tree action ${JSON.stringify(action)}`);
}

function sessionTreeReferenceMount(root, runtime) {
  const initial = runtime.init();
  return mountTreeReferenceCollection(root, runtime, initial, runtime.rendererFailed?.bind(runtime));
}

async function createFixture() {
  const referenceDocument = await ensureReferenceDocument();
  referenceDocument.body.style.margin = "1rem";
  const candidateManager = await startManagerWasm();
  await loadGoDOM({ wasmURL: "/session-tree/build/godom.wasm" });
  const candidate = makeSide("candidate", candidateManager, {
    dom: mountKeyedDOM,
    react: mountKeyedReact,
    godom: mountGoDOM,
    "throw-on-mount": () => { throw new Error("synthetic renderer mount failure"); },
  });
  const referenceManager = createSessionTreeReference();
  const reference = makeSide("reference", referenceManager, {
    react: sessionTreeReferenceMount,
    "throw-on-mount": () => { throw new Error("synthetic renderer mount failure"); },
  });
  const byName = { candidate, reference };
  let eventSequence = 0;

  async function runScenario(script) {
    const context = {
      candidate,
      reference,
      events: [],
      rejections: [],
      disposals: [],
      focusWitness: null,
    };
    if (candidate.active.size !== 0 || reference.active.size !== 0) {
      throw new Error("previous scenario cleanup left live session-tree nodes");
    }
    for (const side of [candidate, reference]) {
      side.transportClock.sequence = 0;
      side.transportClock.events.length = 0;
    }
    candidate.focusWitness = null;
    reference.focusWitness = null;
    candidate.focusObservations.clear();
    reference.focusObservations.clear();
    eventSequence = 0;

    async function settle() {
      await Promise.all([candidate.host.settled(), reference.host.settled()]);
    }
    async function perform(side, action, isReference) {
      const focusActivation = activateObservedFocus(side);
      const result = await actionOnSide(side, action, isReference);
      // Save the real active element and renderer focus state synchronously
      // after this side's action, before the other document can steal focus.
      captureFocusObservations(side);
      const postActionFocus = [...side.focusObservations.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([name, observation]) => ({ name, focus: cloneJSON(observation.focus), focusWitness: cloneJSON(observation.focusWitness) }));
      return { ...result, focusActivation, postActionFocus };
    }
    function focusContext(side) {
      const focusActivation = activateObservedFocus(side);
      captureFocusObservations(side);
      const postActionFocus = [...side.focusObservations.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([name, observation]) => ({ name, focus: cloneJSON(observation.focus), focusWitness: cloneJSON(observation.focusWitness) }));
      return { side: side.name, kind: "focus-context", contextOnly: true, focusActivation, postActionFocus };
    }
    async function capture(index, action) {
      await settle();
      const candidateObservation = captureActor(candidate);
      const referenceObservation = captureActor(reference);
      return {
        index,
        action: action == null ? null : cloneJSON(action),
        candidate: candidateObservation,
        reference: referenceObservation,
        rejections: cloneJSON(context.rejections),
        disposals: cloneJSON(context.disposals),
        events: cloneJSON(context.events),
        focusWitness: cloneJSON(context.focusWitness),
      };
    }
    const ticks = [await capture(0, null)];

    for (const [index, action] of script.actions.entries()) {
      const actionEvents = [];
      let operationResults = [];
      try {
        if (action.kind === "root" || action.kind === "child") {
          const results = [];
          for (const side of [candidate, reference]) {
            const result = await perform(side, action, side === reference);
            results.push(result);
            if (!result.threw && !result.expectedError && result.sessionID) {
              actionEvents.push({ sequence: ++eventSequence, kind: action.kind, side: side.name,
                name: action.name, sessionID: result.sessionID, parentID: result.parentID, depth: result.depth });
            }
          }
          if (action.expectError === true) {
            context.rejections.push({ actionIndex: index, action: cloneJSON(action), results });
          }
          operationResults = results;
        } else if (action.kind === "dispose") {
          const results = [];
          for (const side of [candidate, reference]) {
            const result = await perform(side, action, side === reference);
            results.push(result);
            for (const id of result.expectedIDs) {
              const record = side.allByID.get(id);
              actionEvents.push({ sequence: ++eventSequence, kind: "dispose", source: "derived-postorder", side: side.name,
                name: record?.name ?? null, sessionID: id });
            }
          }
          context.disposals.push({ actionIndex: index, action: cloneJSON(action), results });
          operationResults = results;
        } else if (action.kind === "focus") {
          const results = [];
          // Observe reference focus before candidate focus; candidate remains
          // the physically active outer document after this paired action.
          results.push(await perform(reference, action, true));
          results.push(await perform(candidate, action, false));
          context.focusWitness = { name: action.name, rowID: action.rowID, start: action.start,
            end: action.end, direction: action.direction ?? "none" };
          actionEvents.push(...results.map((result) => ({ sequence: ++eventSequence, kind: "focus", ...result })));
          operationResults = results;
        } else if (action.kind === "replace") {
          const referenceContext = focusContext(reference);
          const result = await perform(candidate, action, false);
          operationResults = [referenceContext, result];
          actionEvents.push({ sequence: ++eventSequence, kind: "replace", ...result, backend: action.backend });
        } else if (action.kind === "add" || action.kind === "fill" || action.kind === "save") {
          const results = [];
          for (const side of [candidate, reference]) results.push(await perform(side, action, side === reference));
          actionEvents.push(...results.map((result) => ({ sequence: ++eventSequence, kind: "dispatch", ...result })));
          operationResults = results;
        } else if (action.kind === "release") {
          const results = [];
          for (const side of [candidate, reference]) results.push(await perform(side, action, side === reference));
          actionEvents.push(...results.map((result) => ({ sequence: ++eventSequence, kind: "release", ...result })));
          operationResults = results;
        } else if (action.kind === "stale-release") {
          const results = [];
          for (const side of [candidate, reference]) results.push(await perform(side, action, side === reference));
          actionEvents.push(...results.map((result) => ({ sequence: ++eventSequence, kind: "stale-release", ...result })));
          operationResults = results;
        } else {
          throw new Error(`unsupported action kind ${action.kind}`);
        }
      } catch (error) {
        operationResults = [{ error: String(error?.stack ?? error) }];
      }
      await settle();
      context.events.push(...actionEvents);
      const tick = await capture(index + 1, action);
      tick.operationResults = cloneJSON(operationResults);
      ticks.push(tick);
    }

    const nativeSegments = [];
    const segments = new Map();
    for (const tick of ticks) {
      for (const name of new Set([
        ...tick.candidate.sessions.map((session) => session.name),
        ...tick.reference.sessions.map((session) => session.name),
      ])) {
        const left = tick.candidate.sessions.find((session) => session.name === name);
        const right = tick.reference.sessions.find((session) => session.name === name);
        if (!left || !right) continue;
        const key = `${name}:${left.generation}:${right.generation}`;
        let segment = segments.get(key);
        if (!segment) {
          segment = { name, generation: left.generation, referenceGeneration: right.generation, frames: [] };
          segments.set(key, segment);
          nativeSegments.push(segment);
        }
        const previousTick = ticks[tick.index - 1];
        const actionForSession = tick.action?.name === name ? tick.action : null;
        const step = actionForSession ? nativeStep(actionForSession,
          previousTick?.reference.sessions.find((session) => session.name === name)?.snapshot) : { Path: "", Event: "", Value: "" };
        const makeFrame = (session, indexInSegment) => ({
          Index: indexInSegment,
          Step: cloneJSON(step),
          State: canonical(session.snapshot.state),
          Tree: canonical(session.snapshot.tree),
          DOM: session.actualDOM,
          Pixels: "",
          Mutations: 0,
        });
        segment.frames.push({ tickIndex: tick.index, reference: makeFrame(right, segment.frames.length), candidate: makeFrame(left, segment.frames.length) });
      }
    }
    const scenario = { name: script.name, seed: script.seed ?? null, actions: cloneJSON(script.actions), ticks,
      nativeSegments, executionError: operationResultsHasError(ticks) };
    // Each script owns fresh sessions, but the manager itself remains live for
    // the next script so its monotonic IDs are exercised. Retire every root
    // after the final captured tick; cleanup is deliberately outside the trace.
    for (const side of [candidate, reference]) {
      const roots = [...side.active.values()].filter((record) => record.parentID === 0)
        .sort((left, right) => left.sessionID - right.sessionID);
      for (const root of roots) {
        if (!side.active.has(root.name)) continue;
        const subtree = activeSubtree(side, root.name);
        side.host.dispose(root.sessionID);
        await side.host.settled();
        for (const name of subtree) side.active.delete(name);
      }
    }
    return scenario;
  }

  async function runFocusLossNegative() {
    const originalReplace = candidate.host.replace;
    candidate.host.replace = function (sessionID, backend) {
      const result = Reflect.apply(originalReplace, this, [sessionID, backend]);
      const active = document.activeElement;
      if (active?.matches?.('input[type="text"]')) active.blur();
      return result;
    };
    try {
      return await runScenario({
        name: "focus-loss-negative-control",
        seed: null,
        actions: [
          { kind: "root", name: "negative", backend: "dom" },
          { kind: "add", name: "negative" },
          { kind: "fill", name: "negative", rowID: 1, value: "negative focus witness" },
          { kind: "focus", name: "negative", rowID: 1, start: 0, end: 0, direction: "none" },
          { kind: "replace", name: "negative", backend: "react" },
        ],
      });
    } finally {
      candidate.host.replace = originalReplace;
    }
  }

  return {
    candidate,
    reference,
    runScenario,
    runFocusLossNegative,
    environment: {
      separateDocuments: candidateArena.ownerDocument !== referenceDocument,
      react: referenceReactVersion,
      reactDOM: referenceReactDOMVersion,
    },
  };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function operationResultsHasError(ticks) {
  return ticks.some((tick) => tick.operationResults?.some((result) =>
    typeof result.error === "string" && result.expectedError !== true));
}

function nativeStep(action, snapshot) {
  if (!action || !snapshot) return { Path: "", Event: "", Value: "" };
  if (action.kind === "add") return { Path: "0", Event: "click", Value: "" };
  if (action.kind === "fill") {
    const binding = snapshot.bindings?.find((item) => item.Message === `edit/${action.rowID}`);
    return { Path: binding?.Path ?? "", Event: "input", Value: String(action.value).replace(/[\r\n]/g, "") };
  }
  if (action.kind === "save") {
    const index = snapshot.state?.Rows?.findIndex((row) => row.ID === action.rowID) ?? -1;
    return { Path: index < 0 ? "" : `2/${index}/5`, Event: "click", Value: "" };
  }
  if (action.kind === "release") return { Path: "", Event: `release:${action.error ? "error" : "success"}`, Value: String(action.requestID) };
  return { Path: "", Event: "", Value: "" };
}

try {
  const fixture = await createFixture();
  globalThis.__sessionTreeFixture = fixture;
  status.textContent = "Go session tree, GoDOM, and React reference are ready.";
} catch (error) {
  status.textContent = `Fixture startup failed: ${error?.stack ?? error}`;
  globalThis.__sessionTreeStartupError = String(error?.stack ?? error);
}
