import { mountKeyedDOM } from "./dom.mjs";
import { mountKeyedReact } from "./build/react.bundle.mjs";
import { createKeyedHost } from "./host.mjs";
import { createHTTPTransport } from "../http-effects/transport.mjs";

const root = document.getElementById("editor-root");
const outputs = {
  backend: document.getElementById("active-backend"),
  runtime: document.getElementById("runtime-snapshot"),
  tree: document.getElementById("tree-snapshot"),
  keys: document.getElementById("key-snapshot"),
  bindings: document.getElementById("binding-snapshot"),
  messages: document.getElementById("message-snapshot"),
  audit: document.getElementById("completion-audit"),
  transport: document.getElementById("transport-log"),
  dom: document.getElementById("dom-snapshot"),
  focus: document.getElementById("focus-snapshot"),
  error: document.getElementById("error"),
  requests: document.getElementById("server-requests"),
};
const modeInput = document.getElementById("next-mode");
const queryLane = new URLSearchParams(location.search).get("lane");
const lane = queryLane || `keyed-${crypto.randomUUID()}`;
document.getElementById("lane-label").textContent = lane;

let runtime = null;
let host = null;
let httpTransport = null;
let disposed = false;
let currentRequests = [];
let refreshQueued = false;
let nextNodeIdentity = 1;
let lastInputFocus = null;
const nodeIdentities = new WeakMap();

function showError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  outputs.error.textContent = `Could not complete that action: ${detail}`;
  outputs.error.hidden = false;
}

function clearError() {
  outputs.error.textContent = "";
  outputs.error.hidden = true;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function elementKeys(tree) {
  const keys = [];
  const visit = (node, path) => {
    if (!node || typeof node !== "object") return;
    if (node.Key) keys.push({ key: node.Key, kind: node.Kind, tag: node.Tag || null, path });
    if (Array.isArray(node.Kids)) {
      node.Kids.forEach((child, index) => visit(child, path === "" ? String(index) : `${path}/${index}`));
    }
  };
  visit(tree, "");
  return keys;
}

function identityOf(element) {
  let identity = nodeIdentities.get(element);
  if (identity === undefined) {
    identity = nextNodeIdentity++;
    nodeIdentities.set(element, identity);
  }
  return identity;
}

function logicalKeyForInput(input) {
  const label = input?.getAttribute("aria-label") ?? "";
  const match = /^Row ([1-9][0-9]*)$/.exec(label);
  return match ? `row-${match[1]}-input` : null;
}

function selectionOf(input) {
  if (!input || typeof input.selectionStart !== "number") return null;
  return {
    start: input.selectionStart,
    end: input.selectionEnd,
    direction: input.selectionDirection,
  };
}

function rememberInputFocus(input) {
  if (!input || input.localName !== "input" || !root.contains(input)) return;
  const key = logicalKeyForInput(input);
  const selection = selectionOf(input);
  if (!key || !selection) return;
  lastInputFocus = {
    key,
    selectionStart: selection.start,
    selectionEnd: selection.end,
    selectionDirection: selection.direction ?? "none",
  };
}

function focusRememberedInputBeforeSwap() {
  if (!lastInputFocus) return;
  const input = [...root.querySelectorAll('input[type="text"]')]
    .find((candidate) => logicalKeyForInput(candidate) === lastInputFocus.key);
  if (!input || input.disabled) return;
  input.focus();
  try {
    input.setSelectionRange(
      lastInputFocus.selectionStart,
      lastInputFocus.selectionEnd,
      lastInputFocus.selectionDirection,
    );
  } catch {
    // Keep focus even if a browser exposes a limited selection API.
  }
}

function refreshSnapshots() {
  if (!host || disposed) return;
  const snapshot = host.snapshot();
  const backend = host.backendName();
  const inputs = [...root.querySelectorAll('input[type="text"]')].map((input) => ({
    logicalKey: logicalKeyForInput(input),
    ariaLabel: input.getAttribute("aria-label"),
    nodeIdentity: identityOf(input),
    value: input.value,
    focused: input === document.activeElement,
    selection: selectionOf(input),
  }));
  const activeInput = document.activeElement instanceof HTMLInputElement && root.contains(document.activeElement)
    ? document.activeElement
    : null;
  const focus = {
    logical: host.focusState(),
    live: activeInput ? {
      key: logicalKeyForInput(activeInput),
      selection: selectionOf(activeInput),
      nodeIdentity: identityOf(activeInput),
    } : null,
  };

  outputs.backend.textContent = backend;
  outputs.runtime.textContent = json(snapshot);
  outputs.tree.textContent = json(snapshot.tree);
  outputs.keys.textContent = json(elementKeys(snapshot.tree));
  outputs.bindings.textContent = json(snapshot.bindings);
  outputs.messages.textContent = json(snapshot.messages);
  outputs.audit.textContent = json(host.audit());
  outputs.transport.textContent = json(httpTransport.log());
  outputs.dom.textContent = json({
    backend,
    ...host.domSnapshot(),
    actualHTML: root.innerHTML,
    inputs,
    buttons: [...root.querySelectorAll("button")].map((button) => ({
      text: button.textContent,
      disabled: button.disabled,
    })),
  });
  outputs.focus.textContent = json(focus);
  for (const button of document.querySelectorAll("[data-backend]")) {
    button.setAttribute("aria-pressed", String(button.dataset.backend === backend));
  }
}

function queueSnapshotRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  const refresh = () => {
    refreshQueued = false;
    try { refreshSnapshots(); } catch (error) { showError(error); }
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(refresh);
  else setTimeout(refresh, 0);
}

function refreshAfterRendererWork() {
  for (const delay of [0, 50]) {
    setTimeout(() => {
      if (!host || disposed) return;
      try { refreshSnapshots(); } catch (error) { showError(error); }
    }, delay);
  }
}

async function refreshServerRequests() {
  const response = await fetch(`/api/requests?lane=${encodeURIComponent(lane)}`, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP lab request list returned ${response.status}`);
  const result = await response.json();
  if (result.lane !== lane || !Array.isArray(result.requests)) {
    throw new Error("HTTP lab returned an invalid request list");
  }
  currentRequests = result.requests;
  renderServerRequests();
  return currentRequests;
}

function renderServerRequests() {
  if (currentRequests.length === 0) {
    outputs.requests.replaceChildren(Object.assign(document.createElement("p"), {
      className: "muted",
      textContent: "No HTTP requests recorded for this lane yet.",
    }));
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const request of currentRequests) {
    const row = document.createElement("div");
    row.className = "server-row";
    row.dataset.requestId = String(request.ID);
    const detail = document.createElement("code");
    detail.textContent = `#${request.ID} ${JSON.stringify(request.Value)} · ${request.Mode} → ${request.ResultMode || "pending"} · ${request.State}` +
      (request.CancelObserved ? " · cancellation observed" : "") +
      (request.Error ? ` · ${request.Error}` : "");
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = request.State;
    row.append(detail, badge);
    if (request.State === "held") {
      for (const [releaseMode, label] of [["success", "Release success"], ["error", "Release error"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.releaseId = String(request.ID);
        button.dataset.releaseMode = releaseMode;
        button.textContent = label;
        row.append(button);
      }
    }
    fragment.append(row);
  }
  outputs.requests.replaceChildren(fragment);
}

async function settleEffects() {
  if (!host || disposed) return;
  await host.settled();
  refreshSnapshots();
  refreshAfterRendererWork();
}

async function releaseHeldRequest(id, releaseMode) {
  // Releasing a held response is an explicit completion action. Return focus
  // to the last valid row input before the network reply triggers an update.
  focusRememberedInputBeforeSwap();
  const response = await fetch(`/api/release?lane=${encodeURIComponent(lane)}&id=${encodeURIComponent(id)}&mode=${encodeURIComponent(releaseMode)}`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTP lab release returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  await httpTransport.settled();
  await settleEffects();
  await refreshServerRequests();
}

function dispatchObservedAction() {
  queueSnapshotRefresh();
  refreshAfterRendererWork();
  setTimeout(() => { void refreshServerRequests().catch(showError); }, 0);
}

for (const button of document.querySelectorAll("[data-backend]")) {
  button.addEventListener("click", () => {
    try {
      // Pointer and keyboard activation can focus the outer renderer button
      // before click. Re-establish the last explicitly focused row input so
      // the host captures that logical key and selection during replacement.
      focusRememberedInputBeforeSwap();
      host.replaceBackend(button.dataset.backend);
      refreshSnapshots();
      refreshAfterRendererWork();
      clearError();
    } catch (error) {
      showError(error);
      try { refreshSnapshots(); } catch (snapshotError) { showError(snapshotError); }
    }
  });
}

document.getElementById("focus-first").addEventListener("click", () => {
  const input = root.querySelector('input[type="text"]');
  if (!input) return;
  input.focus();
  input.setSelectionRange(0, input.value.length, "forward");
  refreshSnapshots();
});

document.getElementById("refresh-requests").addEventListener("click", () => {
  void refreshServerRequests().catch(showError);
});

outputs.requests.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-release-id]");
  if (!button) return;
  void releaseHeldRequest(Number(button.dataset.releaseId), button.dataset.releaseMode)
    .then(clearError)
    .catch(showError);
});

root.addEventListener("input", dispatchObservedAction);
root.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("button") : null;
  if (!button) return;
  if (button.classList.contains("remove")) {
    const rowInput = button.closest(".row")?.querySelector('input[type="text"]');
    if (rowInput && logicalKeyForInput(rowInput) === lastInputFocus?.key) return;
  }
  // Preserve an explicitly focused draft across row actions such as Save,
  // Up, Cancel, Add, and Reset. Deleting that same row intentionally drops it.
  focusRememberedInputBeforeSwap();
}, true);
root.addEventListener("click", dispatchObservedAction);
root.addEventListener("focusin", (event) => {
  rememberInputFocus(event.target);
  queueSnapshotRefresh();
});
root.addEventListener("focusout", (event) => {
  rememberInputFocus(event.target);
  queueSnapshotRefresh();
});
root.addEventListener("select", (event) => {
  rememberInputFocus(event.target);
  queueSnapshotRefresh();
});
root.addEventListener("keyup", (event) => {
  rememberInputFocus(event.target);
  queueSnapshotRefresh();
});
document.addEventListener("selectionchange", () => {
  rememberInputFocus(document.activeElement);
  queueSnapshotRefresh();
});
const inspectorObserver = new MutationObserver(queueSnapshotRefresh);
inspectorObserver.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });

window.addEventListener("error", (event) => {
  if (event.error) showError(event.error);
  else if (event.message) showError(event.message);
});
window.addEventListener("unhandledrejection", (event) => showError(event.reason));

async function start() {
  if (typeof Go !== "function") throw new Error("wasm_exec.js did not define Go");
  const go = new Go();
  const response = await fetch("/keyed-editor/build/keyed-collection.wasm");
  if (!response.ok) throw new Error(`Could not load keyed-collection.wasm (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  void go.run(instance).catch(showError);

  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (globalThis.gobiCollection && typeof globalThis.gobiCollection.init === "function") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  runtime = globalThis.gobiCollection;
  if (!runtime || typeof runtime.init !== "function" || typeof runtime.encodeHTTP !== "function") {
    throw new Error("The Go collection runtime did not publish its API");
  }

  httpTransport = createHTTPTransport({
    runtime,
    url: () => `/api/save?lane=${encodeURIComponent(lane)}&mode=${encodeURIComponent(modeInput.value)}`,
  });
  const effectTransport = {
    start(command, deliver) {
      httpTransport.start(command, (reply) => {
        deliver(reply);
        queueMicrotask(() => {
          void settleEffects().catch(showError);
          void refreshServerRequests().catch(showError);
        });
      });
    },
    cancel(id) { httpTransport.cancel(id); },
  };

  host = createKeyedHost(root, runtime, {
    dom: mountKeyedDOM,
    react: mountKeyedReact,
  }, effectTransport, "dom");
  globalThis.__keyedCollectionDemo = {
    lane,
    runtime,
    host,
    httpTransport,
    refreshServerRequests,
    refreshSnapshots,
    releaseHeldRequest,
  };
  refreshSnapshots();
  clearError();
  await refreshServerRequests();
}

window.addEventListener("pagehide", () => {
  if (!host || disposed) return;
  disposed = true;
  inspectorObserver.disconnect();
  try { host.unmount(); } catch (error) { showError(error); }
  try { httpTransport.dispose(); } catch (error) { showError(error); }
});

start().catch(showError);
