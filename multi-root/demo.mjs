import { mountKeyedDOM } from "../keyed-editor/dom.mjs";
import { mountKeyedReact } from "./build/react.bundle.mjs";
import { createHTTPTransport } from "../http-effects/transport.mjs";
import { loadGoDOM, mountGoDOM } from "../renderer-conformance/adapter.mjs";
import { createMultiRootHost } from "./host.mjs";

const ROOT = "/multi-root/build";
const errorOutput = document.getElementById("error");
const liveCountOutput = document.getElementById("live-sessions");
const slots = [...document.querySelectorAll("article[data-slot]")].map((card) => ({
  name: card.dataset.slot,
  card,
  root: card.querySelector("[data-app-root]"),
  sessionOutput: card.querySelector("[data-session]"),
  laneOutput: card.querySelector("[data-lane]"),
  backendOutput: card.querySelector("[data-active-backend]"),
  modeInput: card.querySelector("[data-mode]"),
  requestOutput: card.querySelector("[data-requests]"),
  snapshotOutput: card.querySelector("[data-snapshot]"),
  eventsOutput: card.querySelector("[data-events]"),
  domOutput: card.querySelector("[data-dom]"),
  sessionID: null,
  generation: null,
  lane: null,
  transport: null,
  requests: [],
  renderedRequestsKey: null,
  lateRelease: null,
  lastInputFocus: null,
  lastSnapshot: null,
  disposed: false,
  pendingRefresh: false,
}));
const slotByRoot = new Map(slots.map((slot) => [slot.root, slot]));

function json(value) {
  return JSON.stringify(value, null, 2);
}

function showError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  errorOutput.textContent = `Action failed: ${detail}`;
  errorOutput.hidden = false;
}

function clearError() {
  errorOutput.textContent = "";
  errorOutput.hidden = true;
}

function logicalInputKey(input) {
  const match = /^Row ([1-9][0-9]*)$/.exec(input?.getAttribute("aria-label") ?? "");
  return match ? `row-${match[1]}-input` : null;
}

function rememberInputFocus(slot, input) {
  if (!input || input.localName !== "input" || !slot.root.contains(input) ||
      typeof input.selectionStart !== "number" || typeof input.selectionEnd !== "number") return;
  const key = logicalInputKey(input);
  if (!key) return;
  slot.lastInputFocus = {
    key,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
    selectionDirection: input.selectionDirection ?? "none",
  };
}

function focusRememberedInput(slot) {
  if (!slot.lastInputFocus) return;
  const input = [...slot.root.querySelectorAll('input[type="text"]')]
    .find((candidate) => logicalInputKey(candidate) === slot.lastInputFocus.key);
  if (!input || input.disabled) return;
  input.focus();
  try {
    input.setSelectionRange(
      slot.lastInputFocus.selectionStart,
      slot.lastInputFocus.selectionEnd,
      slot.lastInputFocus.selectionDirection,
    );
  } catch {
    // Keep the input focus if the browser limits selection restoration.
  }
}

function unwrapManager(raw) {
  const methods = ["create", "snapshot", "dispatch", "effects", "complete", "audit", "dispose", "list", "encodeHTTP", "decodeHTTP"];
  const manager = {};
  for (const method of methods) {
    if (typeof raw?.[method] !== "function") throw new Error(`multi-root Go bridge does not expose ${method}()`);
    manager[method] = (...args) => {
      const result = raw[method](...args);
      if (result && typeof result === "object" && !Array.isArray(result) &&
          Object.keys(result).length === 1 && typeof result.error === "string") {
        throw new Error(`gobiMultiRoot.${method}: ${result.error}`);
      }
      return result;
    };
  }
  return manager;
}

async function loadWasmBridge(globalName, url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`could not load ${url} (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  const go = new Go();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  Promise.resolve(go.run(instance)).catch(showError);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const api = globalThis[globalName];
    if (api) return api;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`${globalName} was not published by its WebAssembly program`);
}

function currentEntry(slot) {
  if (!multiRootHost) return null;
  return multiRootHost.snapshotAll().find((entry) => entry.sessionID === slot.sessionID) ?? null;
}

function renderRequests(slot) {
  if (!slot.lane) return;
  const renderKey = JSON.stringify({ requests: slot.requests, disposed: slot.disposed, lateRelease: slot.lateRelease });
  if (slot.renderedRequestsKey === renderKey) return;
  slot.renderedRequestsKey = renderKey;
  if (slot.requests.length === 0) {
    slot.requestOutput.replaceChildren(Object.assign(document.createElement("span"), {
      className: "muted",
      textContent: slot.disposed ? "No request records for this retired lane." : "No HTTP requests recorded yet.",
    }));
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const request of slot.requests) {
    const row = document.createElement("div");
    row.className = "server-row";
    row.dataset.requestId = String(request.ID);
    const detail = document.createElement("code");
    detail.textContent = `#${request.ID} ${JSON.stringify(request.Value)} · ${request.Mode} → ${request.ResultMode || "pending"} · ${request.State}` +
      (request.CancelObserved ? " · cancel observed" : "") +
      (request.Error ? ` · ${request.Error}` : "");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = request.State;
    row.append(detail, badge);
    if (request.State === "held" && !slot.disposed) {
      for (const [mode, label] of [["success", "Release success"], ["error", "Release error"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.releaseId = String(request.ID);
        button.dataset.releaseMode = mode;
        button.textContent = label;
        button.addEventListener("click", () => {
          focusRememberedInput(slot);
          void releaseHeld(slot, request.ID, mode).then(clearError).catch(showError);
        });
        row.append(button);
      }
    }
    if (slot.disposed && request.State === "cancelled") {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.lateReleaseId = String(request.ID);
      button.textContent = slot.lateRelease?.id === request.ID
        ? `Late release rejected (${slot.lateRelease.status})`
        : "Attempt late release";
      button.addEventListener("click", () => {
        void attemptLateRelease(slot, request.ID).then(clearError).catch(showError);
      });
      row.append(button);
    }
    fragment.append(row);
  }
  slot.requestOutput.replaceChildren(fragment);
}

function refreshSlot(slot) {
  const entry = currentEntry(slot);
  if (entry) {
    slot.lastSnapshot = entry;
    slot.disposed = false;
    slot.backendOutput.textContent = entry.backend;
    slot.sessionOutput.textContent = String(entry.sessionID);
    for (const button of slot.card.querySelectorAll("[data-backend]")) {
      button.setAttribute("aria-pressed", String(button.dataset.backend === entry.backend));
      button.disabled = false;
    }
    slot.card.querySelector('[data-action="dispose"]').disabled = false;
    slot.card.querySelector('[data-action="remount"]').disabled = true;
    slot.snapshotOutput.textContent = json({
      sessionID: entry.sessionID,
      generation: entry.generation,
      state: entry.snapshot?.state,
      tree: entry.snapshot?.tree,
      bindings: entry.snapshot?.bindings,
      messages: entry.snapshot?.messages,
      lifecycle: entry.lifecycle,
      errors: entry.errors,
    });
    slot.eventsOutput.textContent = json({
      audit: entry.audit,
      transport: slot.transport?.log() ?? [],
      lateRelease: slot.lateRelease,
    });
    const activeInput = document.activeElement instanceof HTMLInputElement && slot.root.contains(document.activeElement)
      ? document.activeElement
      : null;
    slot.domOutput.textContent = json({
      renderer: entry.backend,
      focus: entry.focus,
      liveFocus: activeInput ? {
        label: activeInput.getAttribute("aria-label"),
        value: activeInput.value,
        start: activeInput.selectionStart,
        end: activeInput.selectionEnd,
        direction: activeInput.selectionDirection,
      } : null,
      dom: entry.domSnapshot,
      actualHTML: slot.root.innerHTML,
    });
  } else if (slot.disposed) {
    const previous = slot.lastSnapshot;
    slot.backendOutput.textContent = "disposed";
    for (const button of slot.card.querySelectorAll("[data-backend]")) button.disabled = true;
    slot.card.querySelector('[data-action="dispose"]').disabled = true;
    slot.card.querySelector('[data-action="remount"]').disabled = false;
    slot.snapshotOutput.textContent = json({
      lifecycle: "disposed",
      retiredSessionID: slot.sessionID,
      lastSnapshot: previous?.snapshot ?? null,
      lateReply: "callbacks from this root generation are fenced",
    });
    slot.eventsOutput.textContent = json({
      audit: previous?.audit ?? [],
      transport: slot.transport?.log() ?? [],
      lateRelease: slot.lateRelease,
    });
    slot.domOutput.textContent = json({ renderer: "disposed", actualHTML: slot.root.innerHTML });
  }
  liveCountOutput.textContent = `${slots.filter((item) => !item.disposed && item.sessionID !== null).length} / ${slots.length}`;
  renderRequests(slot);
}

function queueRefresh(slot, refreshServer = true) {
  if (slot.pendingRefresh) return;
  slot.pendingRefresh = true;
  queueMicrotask(() => {
    slot.pendingRefresh = false;
    try { refreshSlot(slot); } catch (error) { showError(error); }
    if (refreshServer) void refreshServerRequests(slot).catch(showError);
  });
}

async function refreshServerRequests(slot) {
  if (!slot.lane) return [];
  const response = await fetch(`/api/requests?lane=${encodeURIComponent(slot.lane)}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`HTTP lab request list returned ${response.status}`);
  const result = await response.json();
  if (result.lane !== slot.lane || !Array.isArray(result.requests)) {
    throw new Error(`HTTP lab returned invalid records for lane ${slot.lane}`);
  }
  slot.requests = result.requests;
  renderRequests(slot);
  return slot.requests;
}

function mountSlot(slot, backend) {
  slot.requests = [];
  slot.renderedRequestsKey = null;
  const result = multiRootHost.mount(slot.root, backend);
  slot.sessionID = result.sessionID;
  slot.generation = result.generation;
  slot.disposed = false;
  slot.lateRelease = null;
  refreshSlot(slot);
  void refreshServerRequests(slot).catch(showError);
  return result;
}

async function releaseHeld(slot, requestID, mode = "success") {
  const response = await fetch(`/api/release?lane=${encodeURIComponent(slot.lane)}&id=${encodeURIComponent(requestID)}&mode=${encodeURIComponent(mode)}`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTP lab release returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  if (slot.transport) await slot.transport.settled();
  if (!slot.disposed) await multiRootHost.settled(slot.root);
  await refreshServerRequests(slot);
  refreshSlot(slot);
}

async function attemptLateRelease(slot, requestID) {
  const response = await fetch(`/api/release?lane=${encodeURIComponent(slot.lane)}&id=${encodeURIComponent(requestID)}&mode=success`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  const detail = await response.text();
  slot.lateRelease = { id: requestID, status: response.status, detail };
  refreshSlot(slot);
  await refreshServerRequests(slot);
  if (response.status !== 409) throw new Error(`expected late release to be rejected with 409, got ${response.status}`);
  return slot.lateRelease;
}

function disposeSlot(slot) {
  if (slot.disposed) return;
  const entry = currentEntry(slot);
  if (entry) slot.lastSnapshot = entry;
  const transport = slot.transport;
  multiRootHost.unmount(slot.root);
  transport?.dispose();
  slot.disposed = true;
  refreshSlot(slot);
  void refreshServerRequests(slot).catch(showError);
}

let multiRootHost;
let manager;

for (const slot of slots) {
  slot.card.querySelectorAll("[data-backend]").forEach((button) => {
    button.addEventListener("click", () => {
      try {
        focusRememberedInput(slot);
        multiRootHost.replace(slot.root, button.dataset.backend);
        clearError();
        queueRefresh(slot, false);
      } catch (error) { showError(error); }
    });
  });
  slot.card.querySelector('[data-action="focus"]').addEventListener("click", () => {
    const input = slot.root.querySelector('input[type="text"]');
    if (!input) return;
    input.focus();
    input.setSelectionRange(0, input.value.length, "forward");
    rememberInputFocus(slot, input);
    queueRefresh(slot, false);
  });
  slot.card.querySelector('[data-action="dispose"]').addEventListener("click", () => {
    try { disposeSlot(slot); clearError(); } catch (error) { showError(error); }
  });
  slot.card.querySelector('[data-action="remount"]').addEventListener("click", () => {
    try {
      const defaultBackend = slot.card.querySelector('[data-backend][aria-pressed="true"]')?.dataset.backend ?? "dom";
      mountSlot(slot, defaultBackend);
      clearError();
    } catch (error) { showError(error); }
  });
  slot.root.addEventListener("input", () => queueRefresh(slot));
  slot.root.addEventListener("click", () => queueRefresh(slot));
  for (const eventName of ["focusin", "focusout", "select", "keyup"]) {
    slot.root.addEventListener(eventName, (event) => {
      rememberInputFocus(slot, event.target);
      queueRefresh(slot, false);
    });
  }
  new MutationObserver(() => queueRefresh(slot, false)).observe(slot.root, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
}

window.addEventListener("error", (event) => {
  if (event.error) showError(event.error);
  else if (event.message) showError(event.message);
});
window.addEventListener("unhandledrejection", (event) => showError(event.reason));
window.addEventListener("pagehide", () => {
  for (const slot of slots) {
    if (!multiRootHost || slot.disposed || slot.sessionID === null) continue;
    try { multiRootHost.unmount(slot.root); } catch { /* the page is already leaving */ }
    try { slot.transport?.dispose(); } catch { /* the page is already leaving */ }
    slot.disposed = true;
  }
});

async function start() {
  if (typeof Go !== "function") throw new Error("wasm_exec.js did not define Go");
  const rawManager = await loadWasmBridge("gobiMultiRoot", `${ROOT}/multi-root.wasm`);
  manager = unwrapManager(rawManager);
  await loadGoDOM({ wasmURL: `${ROOT}/godom.wasm` });

  const renderers = {
    dom: mountKeyedDOM,
    react: mountKeyedReact,
    godom: mountGoDOM,
  };
  multiRootHost = createMultiRootHost({
    manager,
    descriptors: renderers,
    transportFactory(sessionID, root, generation) {
      const slot = slotByRoot.get(root);
      if (!slot) throw new Error("a renderer root is not assigned to a demo panel");
      slot.lane = `multi-${slot.name.toLowerCase()}-${sessionID}-${generation}-${crypto.randomUUID()}`;
      slot.laneOutput.textContent = slot.lane;
      slot.transport = createHTTPTransport({
        runtime: manager,
        url: (command) => `/api/save?lane=${encodeURIComponent(slot.lane)}&mode=${encodeURIComponent(slot.modeInput.value)}`,
      });
      return slot.transport;
    },
  });

  const backends = ["dom", "react", "godom"];
  for (let index = 0; index < slots.length; index += 1) {
    mountSlot(slots[index], backends[index]);
  }
  globalThis.__multiRootDemo = {
    host: multiRootHost,
    manager,
    slots,
    refreshServerRequests,
    releaseHeld,
    attemptLateRelease,
  };
  clearError();
  setInterval(() => {
    for (const slot of slots) {
      void refreshServerRequests(slot).catch(showError);
      try { refreshSlot(slot); } catch (error) { showError(error); }
    }
  }, 250);
}

start().catch(showError);
