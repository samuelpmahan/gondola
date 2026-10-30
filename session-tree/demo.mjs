import { mountKeyedDOM } from "../keyed-editor/dom.mjs";
import { mountKeyedReact } from "./build/react.bundle.mjs";
import { createHTTPTransport } from "../http-effects/transport.mjs";
import { loadGoDOM, mountGoDOM } from "../renderer-conformance/adapter.mjs";
import { createSessionTreeHost } from "./host.mjs";

const BUILD = "/session-tree/build";
const familyMount = document.getElementById("family-mount");
const siblingMount = document.getElementById("sibling-mount");
const controlsRoot = document.getElementById("session-controls");
const errorOutput = document.getElementById("error");
const liveCountOutput = document.getElementById("live-count");
const treeOutput = document.getElementById("tree-output");
const snapshotOutput = document.getElementById("snapshot-output");
const disposalOutput = document.getElementById("disposal-output");
const transportOutput = document.getElementById("transport-output");
const httpOutput = document.getElementById("http-output");
const records = new Map();
const controlsByID = new Map();
const bridgeCalls = { complete: 0 };
let manager;
let treeHost;
let familyRootID = null;
let siblingRootID = null;
let familyBackend = "dom";
let siblingBackend = "godom";
let lastDisposal = [];
let refreshQueued = false;
let serverRefreshRunning = false;
let started = false;
const initialIDs = {};

function json(value) {
  return JSON.stringify(value, null, 2);
}

function field(object, name) {
  if (object && Object.hasOwn(object, name)) return object[name];
  const exported = name[0].toUpperCase() + name.slice(1);
  return object?.[exported];
}

function showError(error) {
  errorOutput.textContent = error instanceof Error ? error.message : String(error);
  errorOutput.hidden = false;
}

function clearError() {
  errorOutput.textContent = "";
  errorOutput.hidden = true;
}

function unwrapResult(method, result) {
  if (result && typeof result === "object" && !Array.isArray(result) &&
      Object.keys(result).length === 1 && typeof result.error === "string") {
    throw new Error(`gobiMultiRoot.${method}: ${result.error}`);
  }
  return result;
}

function wrapManager(raw) {
  const methods = [
    "create", "createChild", "tree", "snapshot", "dispatch", "effects", "complete", "audit",
    "dispose", "disposeTree", "list", "encodeHTTP", "decodeHTTP",
  ];
  const wrapped = {};
  for (const method of methods) {
    if (typeof raw?.[method] !== "function") {
      throw new Error(`gobiMultiRoot does not expose ${method}()`);
    }
    wrapped[method] = (...args) => {
      if (method === "complete") bridgeCalls.complete += 1;
      return unwrapResult(method, raw[method](...args));
    };
  }
  return wrapped;
}

async function loadWasmBridge(globalName, url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`could not load ${url} (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  const go = new Go();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  Promise.resolve(go.run(instance)).catch(showError);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (globalThis[globalName]) return globalThis[globalName];
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${globalName} was not published by its WebAssembly program`);
}

function readFocus(record, input) {
  if (!input || input.localName !== "input" || !record.viewRoot.contains(input) ||
      typeof input.selectionStart !== "number" || typeof input.selectionEnd !== "number") return;
  record.lastFocus = {
    label: input.getAttribute("aria-label"),
    start: input.selectionStart,
    end: input.selectionEnd,
    direction: input.selectionDirection ?? "none",
  };
}

function restoreRememberedFocus(record) {
  const saved = record.lastFocus;
  if (!saved) return;
  const input = [...record.viewRoot.querySelectorAll('input[type="text"]')]
    .find((candidate) => candidate.getAttribute("aria-label") === saved.label);
  if (!input || input.disabled) return;
  input.focus();
  try { input.setSelectionRange(saved.start, saved.end, saved.direction); }
  catch { /* Keep focus when selection restoration is unavailable. */ }
}

function watchView(record) {
  record.viewRoot.dataset.sessionView = String(record.sessionID);
  record.shell.dataset.shellSession = String(record.sessionID);
  record.shell.classList.add("tree-session-shell");
  record.viewRoot.classList.add("tree-session-view");
  record.childrenRoot.classList.add("tree-session-children");
  record.childrenRoot.dataset.childrenFor = String(record.sessionID);
  for (const eventName of ["focusin", "focusout", "select", "keyup", "input", "click"]) {
    record.viewRoot.addEventListener(eventName, (event) => {
      readFocus(record, event.target);
      queueRefresh();
    });
  }
  record.observer = new MutationObserver(queueRefresh);
  record.observer.observe(record.viewRoot, {
    subtree: true, childList: true, attributes: true, characterData: true,
  });
}

function makeTransport(sessionID) {
  const lane = `tree-${sessionID}-${crypto.randomUUID()}`;
  const record = {
    sessionID,
    name: `Session ${sessionID}`,
    parentID: 0,
    depth: 1,
    backend: "dom",
    lane,
    mode: "success",
    active: true,
    shell: null,
    viewRoot: null,
    childrenRoot: null,
    lastFocus: null,
    callbacks: new Map(),
    requests: [],
    lateResults: new Map(),
    http: null,
    transport: null,
  };
  const http = createHTTPTransport({
    runtime: manager,
    url: (command) => `/api/save?lane=${encodeURIComponent(lane)}&mode=${encodeURIComponent(record.mode)}`,
  });
  const transport = {
    start(command, deliver) {
      record.callbacks.set(command.ID, deliver);
      return http.start(command, deliver);
    },
    cancel(id) { return http.cancel(id); },
  };
  record.http = http;
  record.transport = transport;
  records.set(sessionID, record);
  return transport;
}

function normalizeTree() {
  return treeHost.tree().map((entry) => ({
    sessionID: field(entry, "sessionID"),
    parentID: field(entry, "parentID"),
    depth: field(entry, "depth"),
  }));
}

function normalizeSnapshots() {
  return treeHost.snapshotAll().map((entry) => ({
    sessionID: field(entry, "sessionID"),
    parentID: field(entry, "parentID"),
    depth: field(entry, "depth"),
    backend: field(entry, "backend"),
    snapshot: field(entry, "snapshot"),
    audit: field(entry, "audit"),
    domSnapshot: field(entry, "domSnapshot"),
    focus: field(entry, "focus"),
    lifecycle: field(entry, "lifecycle"),
    errors: field(entry, "errors") ?? [],
  }));
}

function replaceRenderer(record, backend) {
  try {
    restoreRememberedFocus(record);
    treeHost.replace(record.sessionID, backend);
    record.backend = backend;
    const control = controlsByID.get(record.sessionID);
    if (control) control.requestedBackend = backend;
    if (record.parentID === 0) {
      if (record.sessionID === familyRootID) familyBackend = backend;
      if (record.sessionID === siblingRootID) siblingBackend = backend;
    }
    clearError();
    refreshUI();
  } catch (error) { showError(error); }
}

function focusFirstInput(record) {
  const input = record.viewRoot.querySelector('input[type="text"]');
  if (!input) return;
  input.focus();
  try { input.setSelectionRange(0, input.value.length, "forward"); }
  catch { /* Focusing the control is still useful. */ }
  readFocus(record, input);
  queueRefresh();
}

function createControl(record, treeInfo, snapshotInfo) {
  const card = document.createElement("article");
  card.className = "node-control";
  card.dataset.controlSession = String(record.sessionID);
  const title = document.createElement("h3");
  const details = document.createElement("p");
  details.dataset.details = "";
  const actions = document.createElement("div");
  actions.className = "node-actions";

  const backendSelect = document.createElement("select");
  backendSelect.dataset.backendSelect = "";
  backendSelect.setAttribute("aria-label", `${record.name} renderer`);
  for (const backend of ["dom", "react", "godom"]) {
    const option = document.createElement("option");
    option.value = backend;
    option.textContent = backend === "godom" ? "GoDOM" : backend.toUpperCase();
    backendSelect.append(option);
  }
  const replaceButton = document.createElement("button");
  replaceButton.type = "button";
  replaceButton.dataset.action = "replace";
  replaceButton.textContent = "Apply renderer";
  replaceButton.addEventListener("click", () => replaceRenderer(record, backendSelect.value));
  backendSelect.addEventListener("change", () => {
    const control = controlsByID.get(record.sessionID);
    if (control) control.requestedBackend = backendSelect.value;
  });

  const childBackend = document.createElement("select");
  childBackend.dataset.childBackend = "";
  childBackend.setAttribute("aria-label", `${record.name} child renderer`);
  for (const backend of ["dom", "react", "godom"]) {
    const option = document.createElement("option");
    option.value = backend;
    option.textContent = `Child: ${backend === "godom" ? "GoDOM" : backend.toUpperCase()}`;
    childBackend.append(option);
  }
  childBackend.value = record.depth < 3 ? "react" : "godom";
  const addChild = document.createElement("button");
  addChild.type = "button";
  addChild.dataset.action = "add-child";
  addChild.textContent = "Add child session";
  addChild.disabled = record.depth >= 32;
  addChild.addEventListener("click", () => {
    try {
      const mounted = treeHost.mountChild(record.sessionID, childBackend.value);
      registerMount(mounted, `Child ${field(mounted, "sessionID")}`);
      clearError();
      refreshUI();
    } catch (error) { showError(error); }
  });

  const modeSelect = document.createElement("select");
  modeSelect.dataset.responseMode = "";
  modeSelect.setAttribute("aria-label", `${record.name} next save response`);
  for (const [value, label] of [["success", "Next save: success"], ["held", "Next save: hold"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    modeSelect.append(option);
  }
  modeSelect.value = record.mode;
  modeSelect.addEventListener("change", () => { record.mode = modeSelect.value; });

  const focusButton = document.createElement("button");
  focusButton.type = "button";
  focusButton.dataset.action = "focus";
  focusButton.textContent = "Focus first input";
  focusButton.addEventListener("click", () => focusFirstInput(record));

  const disposeButton = document.createElement("button");
  disposeButton.type = "button";
  disposeButton.dataset.action = "dispose";
  disposeButton.textContent = "Dispose this subtree";
  disposeButton.addEventListener("click", () => { void disposeSubtree(record.sessionID); });

  actions.append(backendSelect, replaceButton, childBackend, addChild, modeSelect, focusButton, disposeButton);
  card.append(title, details, actions);
  controlsByID.set(record.sessionID, { card, title, details, backendSelect, modeSelect, treeInfo, snapshotInfo, requestedBackend: record.backend });
  return card;
}

function renderControls(tree, snapshots) {
  const snapshotByID = new Map(snapshots.map((entry) => [entry.sessionID, entry]));
  const liveIDs = new Set(tree.map((entry) => entry.sessionID));
  for (const [id, control] of controlsByID) {
    if (!liveIDs.has(id)) {
      control.card.remove();
      controlsByID.delete(id);
    }
  }
  for (const info of tree) {
    const record = records.get(info.sessionID);
    if (!record) continue;
    record.parentID = info.parentID;
    record.depth = info.depth;
    record.active = true;
    const snapshot = snapshotByID.get(info.sessionID);
    if (snapshot?.backend) record.backend = snapshot.backend;
    let control = controlsByID.get(info.sessionID);
    if (!control) {
      controlsRoot.querySelector(".muted")?.remove();
      controlsRoot.append(createControl(record, info, snapshot));
      control = controlsByID.get(info.sessionID);
    }
    control.title.textContent = `${record.name} · session ${record.sessionID}`;
    control.details.textContent = `parent ${record.parentID || "root"} · depth ${record.depth} · ${record.backend}`;
    control.backendSelect.value = control.requestedBackend ?? record.backend;
    control.modeSelect.value = record.mode;
  }
  liveCountOutput.textContent = `${tree.length} live session${tree.length === 1 ? "" : "s"}`;
  document.getElementById("recreate-family").disabled = familyRootID !== null;
  document.getElementById("recreate-sibling").disabled = siblingRootID !== null;
}

function renderInspection(tree, snapshots) {
  treeOutput.textContent = json(tree);
  snapshotOutput.textContent = json(snapshots.map((entry) => ({
    sessionID: entry.sessionID,
    parentID: entry.parentID,
    depth: entry.depth,
    backend: entry.backend,
    lifecycle: entry.lifecycle,
    state: entry.snapshot?.state,
    audit: entry.audit,
    focus: entry.focus,
    domSnapshot: entry.domSnapshot,
    errors: entry.errors,
  })));
  disposalOutput.textContent = lastDisposal.length ? json(lastDisposal) : "No subtree has been disposed.";
  transportOutput.textContent = json([...records.values()].map((record) => ({
    sessionID: record.sessionID,
    parentID: record.parentID,
    depth: record.depth,
    lane: record.lane,
    active: record.active,
    events: record.http?.log() ?? [],
    lateReleases: [...record.lateResults.entries()].map(([id, result]) => ({ id, ...result })),
  })));
}

async function releaseHeld(record, requestID, mode = "success") {
  const response = await fetch(`/api/release?lane=${encodeURIComponent(record.lane)}&id=${encodeURIComponent(requestID)}&mode=${encodeURIComponent(mode)}`, {
    method: "POST", credentials: "same-origin", cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP lab release returned ${response.status}: ${await response.text()}`);
  await record.http.settled();
  await treeHost.settled();
  await refreshServerRecords();
  refreshUI();
}

async function releaseLate(record, requestID) {
  const response = await fetch(`/api/release?lane=${encodeURIComponent(record.lane)}&id=${encodeURIComponent(requestID)}&mode=success`, {
    method: "POST", credentials: "same-origin", cache: "no-store",
  });
  const detail = await response.text();
  const result = { status: response.status, detail };
  record.lateResults.set(requestID, result);
  if (response.status !== 409) throw new Error(`expected late HTTP release to return 409, got ${response.status}: ${detail}`);
  await refreshServerRecords();
  refreshUI();
  return result;
}

async function disposeSubtree(sessionID) {
  try {
    const bundles = treeHost.dispose(sessionID);
    lastDisposal = bundles.map((bundle) => ({
      sessionID: field(bundle, "sessionID"),
      commands: (field(bundle, "commands") ?? []).map((command) => ({ ...command })),
    }));
    for (const bundle of bundles) {
      const id = field(bundle, "sessionID");
      const record = records.get(id);
      if (record) {
        record.active = false;
        record.observer?.disconnect();
        record.http?.dispose();
      }
      if (id === familyRootID) familyRootID = null;
      if (id === siblingRootID) siblingRootID = null;
    }
    clearError();
  } catch (error) { showError(error); }
  await refreshServerRecords();
  refreshUI();
}

function mountRoot(container, name, backend) {
  const mounted = treeHost.mountRoot(container, backend);
  registerMount(mounted, name);
  return mounted;
}

function registerMount(mounted, name) {
  const id = field(mounted, "sessionID");
  const record = records.get(id);
  if (!record) throw new Error(`transport was not created for session ${id}`);
  record.name = name;
  record.parentID = field(mounted, "parentID");
  record.depth = field(mounted, "depth");
  record.backend = record.parentID === 0
    ? (id === familyRootID ? familyBackend : id === siblingRootID ? siblingBackend : "dom")
    : record.backend;
  record.shell = field(mounted, "shell");
  record.viewRoot = field(mounted, "viewRoot");
  record.childrenRoot = field(mounted, "childrenRoot");
  if (!record.shell || !record.viewRoot || !record.childrenRoot) {
    throw new Error("tree host mount must return shell, viewRoot and childrenRoot");
  }
  watchView(record);
  return record;
}

async function refreshServerRecords() {
  if (serverRefreshRunning || !records.size) return;
  serverRefreshRunning = true;
  try {
    await Promise.all([...records.values()].map(async (record) => {
      if (!record.lane) return;
      const response = await fetch(`/api/requests?lane=${encodeURIComponent(record.lane)}`, {
        cache: "no-store", credentials: "same-origin",
      });
      if (!response.ok) throw new Error(`HTTP lab request list returned ${response.status}`);
      const result = await response.json();
      if (result.lane !== record.lane || !Array.isArray(result.requests)) {
        throw new Error(`HTTP lab returned invalid records for lane ${record.lane}`);
      }
      record.requests = result.requests;
    }));
  } finally {
    serverRefreshRunning = false;
  }
}

function renderHTTP() {
  const fragment = document.createDocumentFragment();
  const entries = [...records.values()];
  if (!entries.length) {
    fragment.append(Object.assign(document.createElement("p"), { className: "muted", textContent: "No HTTP lanes yet." }));
  }
  for (const record of entries) {
    const heading = document.createElement("h3");
    heading.textContent = `${record.name} · lane ${record.lane}${record.active ? "" : " · retired"}`;
    fragment.append(heading);
    if (!record.requests.length) {
      fragment.append(Object.assign(document.createElement("p"), {
        className: "muted", textContent: "No request records for this lane.",
      }));
      continue;
    }
    for (const request of record.requests) {
      const row = document.createElement("div");
      row.className = "server-record";
      row.dataset.requestSession = String(record.sessionID);
      row.dataset.requestID = String(request.ID);
      const detail = document.createElement("code");
      detail.textContent = `#${request.ID} ${JSON.stringify(request.Value)} · ${request.State}` +
        (request.CancelObserved ? " · cancel observed" : "") +
        (request.Error ? ` · ${request.Error}` : "");
      row.append(detail);
      if (request.State === "held" && record.active) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.release = `${record.sessionID}:${request.ID}`;
        button.textContent = "Release success";
        button.addEventListener("click", () => { void releaseHeld(record, request.ID).catch(showError); });
        row.append(button);
      }
      if (request.State === "cancelled" && !record.active) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.lateRelease = `${record.sessionID}:${request.ID}`;
        const result = record.lateResults.get(request.ID);
        button.textContent = result ? `Late release rejected (${result.status})` : "Attempt late release";
        button.addEventListener("click", () => { void releaseLate(record, request.ID).catch(showError); });
        row.append(button);
      }
      fragment.append(row);
    }
  }
  httpOutput.replaceChildren(fragment);
}

function refreshUI() {
  if (!treeHost) return;
  const tree = normalizeTree();
  const snapshots = normalizeSnapshots();
  const liveIDs = new Set(tree.map((entry) => entry.sessionID));
  for (const record of records.values()) {
    const active = liveIDs.has(record.sessionID);
    if (record.active && !active) record.observer?.disconnect();
    record.active = active;
  }
  renderControls(tree, snapshots);
  renderInspection(tree, snapshots);
  renderHTTP();
}

function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    try { refreshUI(); } catch (error) { showError(error); }
  });
}

function recreateRoot(which) {
  try {
    if (which === "family") {
      const mounted = mountRoot(familyMount, "Family root", familyBackend);
      familyRootID = field(mounted, "sessionID");
    } else {
      const mounted = mountRoot(siblingMount, "Sibling root", siblingBackend);
      siblingRootID = field(mounted, "sessionID");
    }
    clearError();
    refreshUI();
  } catch (error) { showError(error); }
}

document.getElementById("recreate-family").addEventListener("click", () => recreateRoot("family"));
document.getElementById("recreate-sibling").addEventListener("click", () => recreateRoot("sibling"));

window.addEventListener("error", (event) => {
  if (event.error) showError(event.error);
  else if (event.message) showError(event.message);
});
window.addEventListener("unhandledrejection", (event) => showError(event.reason));
window.addEventListener("pagehide", () => {
  if (treeHost) {
    for (const entry of normalizeTree().filter((item) => item.parentID === 0)) {
      try { treeHost.dispose(entry.sessionID); } catch { /* the page is already leaving */ }
    }
  }
  for (const record of records.values()) {
    try { record.http?.dispose(); } catch { /* the page is already leaving */ }
  }
});

async function start() {
  if (typeof Go !== "function") throw new Error("wasm_exec.js did not define Go");
  manager = wrapManager(await loadWasmBridge("gobiMultiRoot", `${BUILD}/multi-root.wasm`));
  await loadGoDOM({ wasmURL: `${BUILD}/godom.wasm` });
  treeHost = createSessionTreeHost({
    manager,
    descriptors: { dom: mountKeyedDOM, react: mountKeyedReact, godom: mountGoDOM },
    transportFactory: makeTransport,
  });

  const family = mountRoot(familyMount, "Family root", "dom");
  familyRootID = field(family, "sessionID");
  const child = treeHost.mountChild(familyRootID, "react");
  registerMount(child, "Child");
  const grandchild = treeHost.mountChild(field(child, "sessionID"), "godom");
  registerMount(grandchild, "Grandchild");
  const sibling = mountRoot(siblingMount, "Sibling root", "godom");
  siblingRootID = field(sibling, "sessionID");

  initialIDs.family = familyRootID;
  initialIDs.child = field(child, "sessionID");
  initialIDs.grandchild = field(grandchild, "sessionID");
  initialIDs.sibling = siblingRootID;
  globalThis.__sessionTreeDemo = {
    host: treeHost,
    manager,
    initialIDs: { ...initialIDs },
    records,
    bridgeCalls,
    record(sessionID) {
      const record = records.get(sessionID);
      return record ? { sessionID, parentID: record.parentID, depth: record.depth, lane: record.lane, active: record.active } : null;
    },
    async refreshServerRecords() { await refreshServerRecords(); refreshUI(); },
    async releaseHeld(sessionID, requestID) { return releaseHeld(records.get(sessionID), requestID); },
    async releaseLate(sessionID, requestID) { return releaseLate(records.get(sessionID), requestID); },
    replayRetiredCallback(sessionID, requestID, value) {
      const record = records.get(sessionID);
      const callback = record?.callbacks.get(requestID);
      if (typeof callback !== "function") throw new Error(`no captured callback for session ${sessionID} request ${requestID}`);
      const before = bridgeCalls.complete;
      let error = null;
      try { callback({ ID: requestID, Value: value, Error: "" }); }
      catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
      return { completeCalls: bridgeCalls.complete - before, error, tree: normalizeTree() };
    },
  };
  refreshUI();
  await refreshServerRecords();
  refreshUI();
  started = true;
  setInterval(() => {
    if (!started) return;
    void refreshServerRecords().then(refreshUI).catch(showError);
  }, 400);
}

start().catch(showError);
