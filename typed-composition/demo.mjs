import { mountKeyedDOM } from "../keyed-editor/dom.mjs";
import { mountKeyedReact } from "./build/react.bundle.mjs";
import { createHTTPTransport } from "../http-effects/transport.mjs";
import { loadGoDOM, mountGoDOM } from "../renderer-conformance/adapter.mjs";
import { createCompositionHost } from "./host.mjs";

const BUILD = "/typed-composition/build";
const parentMount = document.getElementById("parent-mount");
const controlsRoot = document.getElementById("session-controls");
const errorOutput = document.getElementById("error");
const liveCountOutput = document.getElementById("live-count");
const snapshotOutput = document.getElementById("snapshot-output");
const receiptsOutput = document.getElementById("receipts-output");
const httpOutput = document.getElementById("http-output");
const records = new Map();
const controlsByID = new Map();
let manager;
let host;
let parentID = null;
let childID = null;
let refreshQueued = false;
let serverRefreshRunning = false;
let active = true;
let parentBackend = "dom";
let childBackend = "react";
let policy = { Title: "Review ticket", ReadOnly: false };

function json(value) { return JSON.stringify(value, null, 2); }

function field(object, name) {
  if (object && Object.hasOwn(object, name)) return object[name];
  const upper = name[0].toUpperCase() + name.slice(1);
  return object?.[upper];
}

function failOnFrame(method, result) {
  if (result && typeof result === "object" && !Array.isArray(result) &&
      Object.keys(result).length === 1 && typeof result.error === "string") {
    throw new Error(`gobiComposition.${method}: ${result.error}`);
  }
  return result;
}

function showError(error) {
  errorOutput.textContent = error instanceof Error ? error.message : String(error);
  errorOutput.hidden = false;
}

function clearError() {
  errorOutput.textContent = "";
  errorOutput.hidden = true;
}

function wrapManager(raw) {
  const methods = [
    "create", "createChild", "tree", "list", "snapshot", "dispatch", "effects", "complete", "audit",
    "dispose", "disposeTree", "setChildInputs", "publish", "changes", "encodeHTTP", "decodeHTTP",
  ];
  const wrapped = {};
  for (const method of methods) {
    if (typeof raw?.[method] !== "function") throw new Error(`gobiComposition does not expose ${method}()`);
    wrapped[method] = (...args) => failOnFrame(method, Reflect.apply(raw[method], raw, args));
  }
  return wrapped;
}

async function loadCompositionWasm() {
  if (typeof Go !== "function") throw new Error("wasm_exec.js did not define Go");
  const response = await fetch(`${BUILD}/composition.wasm`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load composition.wasm (HTTP ${response.status})`);
  const go = new Go();
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  void go.run(instance).catch(showError);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (globalThis.gobiComposition) return wrapManager(globalThis.gobiComposition);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("The Go composition runtime did not publish gobiComposition");
}

function makeTransport(sessionID) {
  const lane = `composition-${sessionID}-${crypto.randomUUID()}`;
  const record = {
    sessionID, lane, name: `Session ${sessionID}`, parentID: 0, depth: 1,
    backend: "dom", mode: "success", active: true, shell: null, viewRoot: null,
    childrenRoot: null, lastFocus: null, requests: [], http: null,
  };
  const http = createHTTPTransport({
    runtime: manager,
    url: () => `/api/save?lane=${encodeURIComponent(lane)}&mode=${encodeURIComponent(record.mode)}`,
  });
  record.http = http;
  records.set(sessionID, record);
  return http;
}

function normalizeTree() {
  return host.tree().map((entry) => ({
    sessionID: field(entry, "sessionID"),
    parentID: field(entry, "parentID"),
    depth: field(entry, "depth"),
  }));
}

function snapshotFor(sessionID) {
  return host.snapshot(sessionID);
}

function snapshotState(snapshot) { return field(snapshot, "state") ?? {}; }

function policyForChild(child) {
  const input = field(snapshotState(child), "inputs") ?? {};
  return {
    Title: field(input, "title") ?? "",
    ReadOnly: field(input, "readOnly") ?? false,
    InputRevision: field(snapshotState(child), "inputRevision") ?? 0,
  };
}

function rememberFocus(record, input) {
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

function observeView(record) {
  record.viewRoot.dataset.sessionView = String(record.sessionID);
  record.shell.dataset.shellSession = String(record.sessionID);
  record.shell.classList.add("tree-shell");
  record.viewRoot.classList.add("tree-view");
  record.childrenRoot.classList.add("tree-children");
  record.childrenRoot.dataset.childrenFor = String(record.sessionID);
  for (const eventName of ["focusin", "focusout", "select", "keyup", "input", "click"]) {
    record.viewRoot.addEventListener(eventName, (event) => {
      rememberFocus(record, event.target);
      queueRefresh();
    });
  }
  record.observer = new MutationObserver(queueRefresh);
  record.observer.observe(record.viewRoot, { subtree: true, childList: true, attributes: true, characterData: true });
}

function mountRecord(mounted, name) {
  const id = field(mounted, "sessionID");
  const record = records.get(id);
  if (!record) throw new Error(`the HTTP transport was not created for session ${id}`);
  record.name = name;
  record.parentID = field(mounted, "parentID");
  record.depth = field(mounted, "depth");
  record.shell = field(mounted, "shell");
  record.viewRoot = field(mounted, "viewRoot");
  record.childrenRoot = field(mounted, "childrenRoot");
  if (!record.shell || !record.viewRoot || !record.childrenRoot) throw new Error("composition host returned an incomplete mount");
  observeView(record);
  return record;
}

function rendererSelect(record) {
  const select = document.createElement("select");
  select.dataset.backendSelect = "";
  select.setAttribute("aria-label", `${record.name} renderer`);
  for (const [value, label] of [["dom", "DOM"], ["react", "React"], ["godom", "GoDOM"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = record.backend;
  const apply = document.createElement("button");
  apply.type = "button";
  apply.dataset.action = "replace";
  apply.textContent = "Apply renderer";
  apply.addEventListener("click", () => {
    try {
      restoreRememberedFocus(record);
      host.replace(record.sessionID, select.value);
      record.backend = select.value;
      if (record.sessionID === parentID) parentBackend = record.backend;
      if (record.sessionID === childID) childBackend = record.backend;
      clearError();
      refreshUI();
    } catch (error) { showError(error); }
  });
  select.addEventListener("change", () => { record.requestedBackend = select.value; });
  return { select, apply };
}

function addPolicyControls(card) {
  const section = document.createElement("section");
  section.className = "policy";
  section.dataset.policyControls = "";
  const titleLabel = document.createElement("label");
  titleLabel.textContent = "Child title";
  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.maxLength = 256;
  titleInput.dataset.policyTitle = "";
  titleInput.value = policy.Title;
  titleLabel.append(titleInput);
  const readonlyLabel = document.createElement("label");
  readonlyLabel.className = "checkbox";
  const readonlyInput = document.createElement("input");
  readonlyInput.type = "checkbox";
  readonlyInput.dataset.policyReadonly = "";
  readonlyInput.checked = policy.ReadOnly;
  readonlyLabel.append(readonlyInput, document.createTextNode("Child is read-only"));
  const revision = document.createElement("span");
  revision.dataset.policyRevision = "";
  revision.className = "muted";
  const applyPolicy = () => {
    policy = { Title: titleInput.value, ReadOnly: readonlyInput.checked };
    if (childID === null) return;
    try {
      host.setChildInputs(parentID, childID, { ...policy });
      clearError();
      refreshUI();
    } catch (error) { showError(error); }
  };
  titleInput.addEventListener("change", applyPolicy);
  readonlyInput.addEventListener("change", applyPolicy);
  section.append(titleLabel, readonlyLabel, revision);
  card.append(section);
  return { titleInput, readonlyInput, revision };
}

function makeControl(record) {
  const card = document.createElement("article");
  card.className = "session-control";
  card.dataset.controlSession = String(record.sessionID);
  const heading = document.createElement("h3");
  const details = document.createElement("p");
  details.dataset.details = "";
  const actions = document.createElement("div");
  actions.className = "actions";
  const renderer = rendererSelect(record);
  actions.append(renderer.select, renderer.apply);
  let modeSelect = null;
  if (record.sessionID === childID) {
    modeSelect = document.createElement("select");
    modeSelect.dataset.responseMode = "";
    modeSelect.setAttribute("aria-label", "Child next save response");
    for (const [value, label] of [["success", "Next save: success"], ["held", "Next save: hold"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      modeSelect.append(option);
    }
    modeSelect.value = record.mode;
    modeSelect.addEventListener("change", () => { record.mode = modeSelect.value; });
    actions.append(modeSelect);
  }
  const dispose = document.createElement("button");
  dispose.type = "button";
  dispose.dataset.action = "dispose";
  dispose.textContent = "Dispose child subtree";
  dispose.hidden = record.sessionID !== childID;
  dispose.addEventListener("click", () => { disposeChild().catch(showError); });
  actions.append(dispose);
  card.append(heading, details, actions);
  let policyControls = null;
  if (record.sessionID === parentID) policyControls = addPolicyControls(card);
  controlsByID.set(record.sessionID, { card, heading, details, renderer, modeSelect, dispose, policyControls });
  return card;
}

function renderControls(tree) {
  const liveIDs = new Set(tree.map((item) => item.sessionID));
  for (const [id, control] of controlsByID) {
    if (!liveIDs.has(id)) {
      control.card.remove();
      controlsByID.delete(id);
    }
  }
  for (const item of tree) {
    const record = records.get(item.sessionID);
    if (!record) continue;
    record.parentID = item.parentID;
    record.depth = item.depth;
    record.active = true;
    const control = controlsByID.get(item.sessionID);
    if (!control) {
      controlsRoot.querySelector(".muted")?.remove();
      controlsRoot.append(makeControl(record));
    }
    const current = controlsByID.get(item.sessionID);
    record.backend = item.sessionID === parentID ? parentBackend : item.sessionID === childID ? childBackend : record.backend;
    current.heading.textContent = `${record.name} · session ${record.sessionID}`;
    current.details.textContent = `parent ${record.parentID || "root"} · depth ${record.depth} · ${record.backend}`;
    current.renderer.select.value = record.requestedBackend ?? record.backend;
    current.dispose.hidden = item.sessionID !== childID;
    if (current.modeSelect) current.modeSelect.value = record.mode;
    if (current.policyControls) {
      const input = childID === null ? null : policyForChild(snapshotFor(childID));
      current.policyControls.titleInput.value = policy.Title;
      current.policyControls.readonlyInput.checked = policy.ReadOnly;
      current.policyControls.revision.textContent = input
        ? `Child input revision ${input.InputRevision}`
        : "No child session";
    }
  }
  liveCountOutput.textContent = `${tree.length} live session${tree.length === 1 ? "" : "s"}`;
  document.getElementById("recreate-child").disabled = childID !== null || parentID === null;
}

function renderSnapshots(tree) {
  const snapshots = tree.map((item) => {
    const record = records.get(item.sessionID);
    const snapshot = snapshotFor(item.sessionID);
    return {
      sessionID: item.sessionID,
      parentID: item.parentID,
      depth: item.depth,
      backend: record?.backend,
      snapshot,
    };
  });
  snapshotOutput.textContent = json(snapshots);
  if (parentID === null) {
    receiptsOutput.textContent = "Parent session is disposed.";
    return;
  }
  const state = snapshotState(snapshotFor(parentID));
  const inbox = field(state, "inbox") ?? [];
  receiptsOutput.textContent = json(inbox.map((receipt) => ({
    Sequence: field(receipt, "sequence"),
    ParentID: field(receipt, "parentID"),
    ChildID: field(receipt, "childID"),
    RowID: field(receipt, "rowID"),
    Saved: field(receipt, "saved"),
    Saves: field(receipt, "saves"),
    InputRevision: field(receipt, "inputRevision"),
  })));
}

async function refreshServerRecords() {
  if (serverRefreshRunning || records.size === 0) return;
  serverRefreshRunning = true;
  try {
    await Promise.all([...records.values()].map(async (record) => {
      const response = await fetch(`/api/requests?lane=${encodeURIComponent(record.lane)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP lab request list returned ${response.status}`);
      const result = await response.json();
      if (result.lane !== record.lane || !Array.isArray(result.requests)) throw new Error("HTTP lab returned invalid lane records");
      record.requests = result.requests;
    }));
  } finally { serverRefreshRunning = false; }
}

function renderHTTP() {
  const fragment = document.createDocumentFragment();
  const entries = [...records.values()];
  if (!entries.length) fragment.append(Object.assign(document.createElement("p"), {
    className: "muted", textContent: "No HTTP lanes yet.",
  }));
  for (const record of entries) {
    const title = document.createElement("h4");
    title.textContent = `${record.name} · ${record.active ? "live" : "retired"} · lane ${record.lane}`;
    fragment.append(title);
    for (const request of record.requests) {
      const row = document.createElement("div");
      row.className = "server-record";
      row.dataset.requestID = `${record.sessionID}:${request.ID}`;
      const detail = document.createElement("code");
      detail.textContent = `#${request.ID} ${JSON.stringify(request.Value)} · ${request.State}` +
        (request.Error ? ` · ${request.Error}` : "");
      row.append(detail);
      if (request.State === "held" && record.active) {
        const release = document.createElement("button");
        release.type = "button";
        release.dataset.release = `${record.sessionID}:${request.ID}`;
        release.textContent = "Release success";
        row.append(release);
      }
      fragment.append(row);
    }
  }
  httpOutput.replaceChildren(fragment);
}

function refreshUI() {
  if (!host || !active) return;
  const tree = normalizeTree();
  const liveIDs = new Set(tree.map((entry) => entry.sessionID));
  for (const record of records.values()) record.active = liveIDs.has(record.sessionID);
  renderControls(tree);
  renderSnapshots(tree);
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

async function settle() {
  if (!host || !active) return;
  await host.settled();
  refreshUI();
  await refreshServerRecords();
  refreshUI();
}

async function applyPolicy() {
  if (childID === null) return;
  host.setChildInputs(parentID, childID, { ...policy });
  await host.settled();
  refreshUI();
}

async function releaseHeld(record, requestID) {
  const response = await fetch(`/api/release?lane=${encodeURIComponent(record.lane)}&id=${encodeURIComponent(requestID)}&mode=success`, {
    method: "POST", credentials: "same-origin", cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP lab release returned ${response.status}: ${await response.text()}`);
  await record.http.settled();
  await settle();
  clearError();
}

async function disposeChild() {
  if (childID === null) return;
  const retiredID = childID;
  const record = records.get(retiredID);
  host.dispose(retiredID);
  childID = null;
  record.active = false;
  record.observer?.disconnect();
  record.http.dispose();
  clearError();
  await refreshServerRecords();
  refreshUI();
}

function createChild() {
  if (childID !== null) throw new Error("a child session is already mounted");
  const mounted = host.mountChild(parentID, childBackend);
  const record = mountRecord(mounted, "Child collection");
  childID = record.sessionID;
  host.setChildInputs(parentID, childID, { ...policy });
  refreshUI();
  return childID;
}

document.getElementById("recreate-child").addEventListener("click", () => {
  try { createChild(); clearError(); } catch (error) { showError(error); }
});

httpOutput.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-release]");
  if (!button) return;
  const [sessionText, requestText] = button.dataset.release.split(":");
  const record = records.get(Number(sessionText));
  if (record) releaseHeld(record, Number(requestText)).catch(showError);
});

document.addEventListener("input", (event) => {
  if (event.target.closest(".tree-view")) {
    setTimeout(() => { void settle().catch(showError); }, 0);
  }
}, true);
document.addEventListener("click", (event) => {
  if (event.target.closest(".tree-view")) {
    setTimeout(() => { void settle().catch(showError); }, 0);
  }
}, true);

window.addEventListener("error", (event) => showError(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => showError(event.reason));
window.addEventListener("pagehide", () => {
  active = false;
  if (host && parentID !== null) {
    try { host.dispose(parentID); } catch { /* page is already leaving */ }
  }
  for (const record of records.values()) {
    record.observer?.disconnect();
    try { record.http.dispose(); } catch { /* page is already leaving */ }
  }
});

async function start() {
  manager = await loadCompositionWasm();
  await loadGoDOM({ wasmURL: `${BUILD}/godom.wasm` });
  host = createCompositionHost({
    manager,
    descriptors: { dom: mountKeyedDOM, react: mountKeyedReact, godom: mountGoDOM },
    transportFactory: makeTransport,
  });
  const mountedParent = host.mountRoot(parentMount, parentBackend);
  const parentRecord = mountRecord(mountedParent, "Parent collection");
  parentID = parentRecord.sessionID;
  createChild();
  await host.settled();
  globalThis.__typedCompositionDemo = {
    host,
    manager,
    records,
    initialIDs: { parent: parentID, child: childID },
    policy: () => ({ ...policy }),
    async setPolicy(next) {
      policy = { Title: next.Title, ReadOnly: next.ReadOnly };
      const control = controlsByID.get(parentID)?.policyControls;
      if (control) {
        control.titleInput.value = policy.Title;
        control.readonlyInput.checked = policy.ReadOnly;
      }
      await applyPolicy();
    },
    async settled() { await settle(); },
    async refreshServerRecords() { await refreshServerRecords(); refreshUI(); },
    async releaseHeld(sessionID, requestID) { return releaseHeld(records.get(sessionID), requestID); },
    async disposeChild() { return disposeChild(); },
    createChild() { return createChild(); },
  };
  refreshUI();
  await refreshServerRecords();
  refreshUI();
  setInterval(() => { if (active) void refreshServerRecords().then(refreshUI).catch(showError); }, 450);
}

start().catch(showError);
