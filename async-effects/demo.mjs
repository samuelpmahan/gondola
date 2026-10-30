import { mountEditorDOM } from "../controlled-input/dom.mjs";
import { mountEditorReact } from "../controlled-input/build/react.bundle.mjs";
import { createAsyncReference } from "./build/reference.bundle.mjs";
import { createEffectHost } from "./host.mjs";
import { createManualTransport, createTimeoutTransport } from "./transport.mjs";

const root = document.getElementById("editor-root");
const manualReplies = document.getElementById("manual-replies");
const runtimeOutput = document.getElementById("runtime-snapshot");
const auditOutput = document.getElementById("completion-audit");
const transportOutput = document.getElementById("transport-log");
const domOutput = document.getElementById("dom-snapshot");
const backendOutput = document.getElementById("active-backend");
const errorOutput = document.getElementById("error");
const autoReply = document.getElementById("auto-reply");
const delayInput = document.getElementById("delay-ms");

const manualTransport = createManualTransport();
const transportEvents = [];
const transportForID = new Map();
let runtime = null;
let reference = null;
let host = null;
let activeRenderer = null;
let disposed = false;

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = clone(item);
    return copy;
  }
  return value;
}

function showError(error) {
  const detail = error instanceof Error ? error.message : String(error);
  errorOutput.textContent = `Could not complete that action: ${detail}`;
  errorOutput.hidden = false;
}

function clearError() {
  errorOutput.textContent = "";
  errorOutput.hidden = true;
}

function readRendererFailure() {
  if (!activeRenderer || !("lastError" in activeRenderer)) return null;
  try {
    const failure = typeof activeRenderer.lastError === "function"
      ? activeRenderer.lastError()
      : activeRenderer.lastError;
    return failure ?? null;
  } catch (error) {
    return error;
  }
}

function makeTransport() {
  return {
    start(command, deliver) {
      const id = command.ID;
      const selectedMode = autoReply.checked ? "timer" : "manual";
      const selected = selectedMode === "manual"
        ? manualTransport
        : createTimeoutTransport({ delayMs: Number(delayInput.value) });
      transportForID.set(id, { kind: selectedMode, transport: selected });
      transportEvents.push({ kind: "start", transport: selectedMode, command: clone(command) });
      selected.start(command, (reply) => {
        transportEvents.push({ kind: "reply", transport: selectedMode, reply: clone(reply) });
        deliver(reply);
        if (host && !disposed) {
          void host.settled().then(refreshSnapshots).catch(showError);
        }
      });
    },
    cancel(id) {
      const selected = transportForID.get(id);
      transportEvents.push({ kind: "cancel", id, transport: selected?.kind ?? "unknown" });
      selected?.transport.cancel(id);
    },
  };
}

function renderManualReplies() {
  const requests = transportEvents.filter((event) => event.kind === "start" && event.transport === "manual");
  if (requests.length === 0) {
    manualReplies.replaceChildren(Object.assign(document.createElement("p"), {
      className: "muted",
      textContent: "No manual requests yet.",
    }));
    return;
  }

  const deliveredCounts = new Map();
  for (const event of manualTransport.log()) {
    if (event.kind === "deliver") {
      deliveredCounts.set(event.reply.ID, (deliveredCounts.get(event.reply.ID) ?? 0) + 1);
    }
  }

  const fragment = document.createDocumentFragment();
  for (const { command } of requests) {
    const row = document.createElement("div");
    row.className = "reply-row";
    row.dataset.requestId = String(command.ID);
    const label = document.createElement("code");
    const active = host?.snapshot().state.PendingID === command.ID;
    const deliveryCount = deliveredCounts.get(command.ID) ?? 0;
    const canceled = transportEvents.some((event) => event.kind === "cancel" && event.id === command.ID);
    label.textContent = `request ${command.ID}: ${JSON.stringify(command.Value)} · ` +
      (active ? "pending" : canceled ? "canceled or superseded" : deliveryCount > 0 ? "delivered" : "no longer active");
    row.append(label);

    for (const [kind, text] of [
      ["success", "Reply success"],
      ["error", "Reply error"],
      ...(deliveryCount > 0 ? [["duplicate", "Deliver again"]] : []),
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.dataset.replyId = String(command.ID);
      button.dataset.replyKind = kind;
      row.append(button);
    }
    fragment.append(row);
  }
  manualReplies.replaceChildren(fragment);
}

function refreshSnapshots() {
  if (!host || disposed) return;
  const failure = readRendererFailure();
  if (failure) showError(failure);
  backendOutput.textContent = host.backendName();
  runtimeOutput.textContent = JSON.stringify(host.snapshot(), null, 2);
  auditOutput.textContent = JSON.stringify(host.audit(), null, 2);
  transportOutput.textContent = JSON.stringify(transportEvents, null, 2);
  const rendered = host.domSnapshot();
  const input = root.querySelector('input[type="text"]');
  domOutput.textContent = JSON.stringify({
    backend: host.backendName(),
    ...rendered,
    actualHTML: root.innerHTML,
    inputValue: input?.value ?? null,
    inputDisabled: input?.disabled ?? null,
  }, null, 2);
  for (const button of document.querySelectorAll("[data-backend]")) {
    button.setAttribute("aria-pressed", String(button.dataset.backend === host.backendName()));
  }
  renderManualReplies();
}

function observeRendererAction() {
  // Dispatch is synchronous, while effect delivery and completion remounts are
  // queued by the host after the renderer's event handler returns.
  setTimeout(() => {
    void host.settled().then(() => {
      refreshSnapshots();
      if (!readRendererFailure()) clearError();
    }).catch(showError);
  }, 0);
}

function mount(mountRenderer) {
  return (mountRoot, runtimeFacade) => {
    activeRenderer = null;
    const renderer = mountRenderer(mountRoot, runtimeFacade);
    activeRenderer = renderer;
    return renderer;
  };
}

for (const button of document.querySelectorAll("[data-backend]")) {
  button.addEventListener("click", () => {
    try {
      host.replaceBackend(button.dataset.backend);
      refreshSnapshots();
      if (!readRendererFailure()) clearError();
    } catch (error) {
      showError(error);
      try { refreshSnapshots(); } catch (snapshotError) { showError(snapshotError); }
    }
  });
}

document.addEventListener("input", observeRendererAction, true);
document.addEventListener("click", observeRendererAction, true);

manualReplies.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-reply-id]");
  if (!button || !host) return;
  try {
    const id = Number(button.dataset.replyId);
    if (button.dataset.replyKind === "error") {
      manualTransport.deliver(id, { error: "demo transport rejected the save" });
    } else {
      manualTransport.deliver(id);
    }
    await host.flush();
    refreshSnapshots();
    clearError();
  } catch (error) {
    showError(error);
  }
});

window.addEventListener("error", (event) => {
  if (event.error) showError(event.error);
  else if (event.message) showError(event.message);
});
window.addEventListener("unhandledrejection", (event) => showError(event.reason));

async function start() {
  if (typeof Go !== "function") throw new Error("wasm_exec.js did not define Go");
  const go = new Go();
  const response = await fetch("/async-effects/build/async-save.wasm");
  if (!response.ok) throw new Error(`Could not load async-save.wasm (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  void go.run(instance).catch(showError);

  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (globalThis.gobiAsyncSave && typeof globalThis.gobiAsyncSave.init === "function") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  runtime = globalThis.gobiAsyncSave;
  if (!runtime || typeof runtime.init !== "function") {
    throw new Error("The Go async-save runtime did not publish its API");
  }

  reference = createAsyncReference();
  const renderers = {
    dom: mount(mountEditorDOM),
    react: mount(mountEditorReact),
  };
  host = createEffectHost(root, runtime, renderers, makeTransport(), "dom");
  globalThis.__asyncExperiment = {
    runtime,
    runtimes: { go: runtime, reference },
    renderers,
    host,
    manualTransport,
    reference,
    transportEvents,
    root,
    isDisposed: () => disposed,
  };
  refreshSnapshots();
  clearError();
}

window.addEventListener("pagehide", () => {
  if (!host || disposed) return;
  disposed = true;
  try { host.unmount(); } catch (error) { showError(error); }
});

start().catch(showError);
