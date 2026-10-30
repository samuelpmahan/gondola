import { mountEditorDOM } from "./dom.mjs";
import { createBackendHost } from "../backend-replacement/host.mjs";
import { mountEditorReact } from "./build/react.bundle.mjs";

const root = document.getElementById("editor-root");
const runtimeOutput = document.getElementById("runtime-snapshot");
const domOutput = document.getElementById("dom-snapshot");
const backendOutput = document.getElementById("active-backend");
const errorOutput = document.getElementById("error");
let host = null;
let activeRenderer = null;

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

function refreshSnapshots() {
  if (!host) return;
  const failure = readRendererFailure();
  if (failure) showError(failure);
  backendOutput.textContent = host.backendName();
  runtimeOutput.textContent = JSON.stringify(host.snapshot(), null, 2);
  const rendered = host.domSnapshot();
  domOutput.textContent = JSON.stringify({
    backend: host.backendName(),
    ...rendered,
    inputValue: root.querySelector('input[type="text"]')?.value ?? null,
    inputFocused: root.ownerDocument.activeElement === root.querySelector('input[type="text"]'),
  }, null, 2);
  for (const button of document.querySelectorAll("[data-backend]")) {
    button.setAttribute("aria-pressed", String(button.dataset.backend === host.backendName()));
  }
}

function observeRendererAction() {
  // React delegates input and click handlers at the root. Read after its
  // delegated handler has synchronously dispatched and rendered the Go state.
  setTimeout(() => {
    try {
      refreshSnapshots();
      if (!readRendererFailure()) clearError();
    } catch (error) {
      showError(error);
    }
  }, 0);
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

root.addEventListener("input", observeRendererAction);
root.addEventListener("click", observeRendererAction);

window.addEventListener("error", (event) => {
  if (event.error) showError(event.error);
  else if (event.message) showError(event.message);
});
window.addEventListener("unhandledrejection", (event) => showError(event.reason));

function mount(backend) {
  return (mountRoot, runtime) => {
    activeRenderer = null;
    const renderer = backend(mountRoot, runtime);
    activeRenderer = renderer;
    return renderer;
  };
}

async function start() {
  if (typeof Go !== "function") throw new Error("wasm_exec.js did not define Go");
  const go = new Go();
  const response = await fetch("/controlled-input/build/editor.wasm");
  if (!response.ok) throw new Error(`Could not load editor.wasm (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  void go.run(instance).catch(showError);

  for (let attempt = 0; attempt < 500; attempt++) {
    if (globalThis.gobiEditor && typeof globalThis.gobiEditor.init === "function") break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (!globalThis.gobiEditor || typeof globalThis.gobiEditor.init !== "function") {
    throw new Error("The Go editor did not publish its runtime API");
  }

  host = createBackendHost(root, globalThis.gobiEditor, {
    dom: mount(mountEditorDOM),
    react: mount(mountEditorReact),
  }, "dom");
  refreshSnapshots();
  clearError();
}

start().catch(showError);
