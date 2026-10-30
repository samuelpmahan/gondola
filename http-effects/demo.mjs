import { mountEditorDOM } from "../controlled-input/dom.mjs";
import { mountEditorReact } from "./build/react.bundle.mjs";
import { createEffectHost } from "../async-effects/host.mjs";
import { createHTTPTransport } from "./transport.mjs";

const root = document.getElementById("editor-root");
const runtimeOutput = document.getElementById("runtime-snapshot");
const auditOutput = document.getElementById("completion-audit");
const transportOutput = document.getElementById("transport-log");
const domOutput = document.getElementById("dom-snapshot");
const backendOutput = document.getElementById("active-backend");
const errorOutput = document.getElementById("error");
const modeInput = document.getElementById("next-mode");
const requestsOutput = document.getElementById("server-requests");

const queryLane = new URLSearchParams(location.search).get("lane");
const lane = queryLane || `demo-${crypto.randomUUID()}`;
document.getElementById("lane-label").textContent = lane;

let runtime = null;
let host = null;
let httpTransport = null;
let disposed = false;
let currentRequests = [];

function showError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  errorOutput.textContent = `Could not complete that action: ${detail}`;
  errorOutput.hidden = false;
}

function clearError() {
  errorOutput.textContent = "";
  errorOutput.hidden = true;
}

function refreshSnapshots() {
  if (!host || disposed) return;
  const snapshot = host.snapshot();
  const backend = host.backendName();
  const input = root.querySelector('input[type="text"]');
  backendOutput.textContent = backend;
  runtimeOutput.textContent = JSON.stringify(snapshot, null, 2);
  auditOutput.textContent = JSON.stringify(host.audit(), null, 2);
  transportOutput.textContent = JSON.stringify(httpTransport.log(), null, 2);
  domOutput.textContent = JSON.stringify({
    backend,
    ...host.domSnapshot(),
    actualHTML: root.innerHTML,
    inputValue: input?.value ?? null,
    inputDisabled: input?.disabled ?? null,
  }, null, 2);
  for (const button of document.querySelectorAll("[data-backend]")) {
    button.setAttribute("aria-pressed", String(button.dataset.backend === backend));
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
    requestsOutput.replaceChildren(Object.assign(document.createElement("p"), {
      className: "muted",
      textContent: "No HTTP requests recorded for this lane yet.",
    }));
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const request of currentRequests) {
    const row = document.createElement("div");
    row.className = "request-row";
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
      for (const [mode, label] of [["success", "Release success"], ["error", "Release error"]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.releaseId = String(request.ID);
        button.dataset.releaseMode = mode;
        button.textContent = label;
        row.append(button);
      }
    }
    fragment.append(row);
  }
  requestsOutput.replaceChildren(fragment);
}

async function releaseHeldRequest(id, mode) {
  const response = await fetch(`/api/release?lane=${encodeURIComponent(lane)}&id=${encodeURIComponent(id)}&mode=${encodeURIComponent(mode)}`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`HTTP lab release returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  await refreshServerRequests();
  await httpTransport.settled();
  await settleHost();
  await refreshServerRequests();
}

async function settleHost() {
  if (!host || disposed) return;
  await host.settled();
  refreshSnapshots();
}

function observeRendererAction() {
  // Go dispatch and DOM updates are synchronous; effect draining is queued by
  // the host after the renderer event handler returns.
  setTimeout(() => {
    void settleHost().catch(showError);
    void refreshServerRequests().catch(showError);
  }, 0);
}

for (const button of document.querySelectorAll("[data-backend]")) {
  button.addEventListener("click", () => {
    try {
      host.replaceBackend(button.dataset.backend);
      refreshSnapshots();
      clearError();
    } catch (error) {
      showError(error);
      try { refreshSnapshots(); } catch (snapshotError) { showError(snapshotError); }
    }
  });
}

root.addEventListener("input", observeRendererAction);
root.addEventListener("click", observeRendererAction);

document.getElementById("refresh-requests").addEventListener("click", () => {
  void refreshServerRequests().catch(showError);
});

requestsOutput.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-release-id]");
  if (!button) return;
  void releaseHeldRequest(Number(button.dataset.releaseId), button.dataset.releaseMode)
    .then(clearError)
    .catch(showError);
});

window.addEventListener("error", (event) => {
  if (event.error) showError(event.error);
  else if (event.message) showError(event.message);
});
window.addEventListener("unhandledrejection", (event) => showError(event.reason));

async function start() {
  if (typeof Go !== "function") throw new Error("wasm_exec.js did not define Go");
  const go = new Go();
  const response = await fetch("/http-effects/build/http-save.wasm");
  if (!response.ok) throw new Error(`Could not load http-save.wasm (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  void go.run(instance).catch(showError);

  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (globalThis.gobiHTTPSave && typeof globalThis.gobiHTTPSave.encodeHTTP === "function") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  runtime = globalThis.gobiHTTPSave;
  if (!runtime || typeof runtime.init !== "function" || typeof runtime.encodeHTTP !== "function") {
    throw new Error("The Go HTTP-save runtime did not publish its API");
  }

  httpTransport = createHTTPTransport({
    runtime,
    url: () => {
      const mode = modeInput.value;
      return `/api/save?lane=${encodeURIComponent(lane)}&mode=${encodeURIComponent(mode)}`;
    },
  });
  const effectTransport = {
    start(command, deliver) {
      httpTransport.start(command, (reply) => {
        deliver(reply);
        queueMicrotask(() => {
          void settleHost().catch(showError);
          void refreshServerRequests().catch(showError);
        });
      });
    },
    cancel(id) {
      httpTransport.cancel(id);
    },
  };
  host = createEffectHost(root, runtime, {
    dom: mountEditorDOM,
    react: mountEditorReact,
  }, effectTransport, "dom");

  globalThis.__httpEffectsDemo = { lane, runtime, host, httpTransport, refreshServerRequests };
  refreshSnapshots();
  clearError();
  await refreshServerRequests();
}

window.addEventListener("pagehide", () => {
  if (!host || disposed) return;
  disposed = true;
  try { host.unmount(); } catch (error) { showError(error); }
  try { httpTransport.dispose(); } catch (error) { showError(error); }
});

start().catch(showError);
