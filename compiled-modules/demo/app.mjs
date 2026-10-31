import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { mountCompiledModulePair } from "../runtime/runtime.mjs";

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`compiled modules demo is missing #${id}`);
  return element;
}

function rendererRegistry() {
  return Object.freeze({
    dom: ({ container, onFailure }) => createDOMRenderer({ container, onFailure }),
    react: ({ container, onFailure }) => createReactRenderer({ container, onFailure }),
  });
}

/** Start the browser demo with generated module records from demo/build.mjs. */
export async function startCompiledModulesDemo({ profiles }) {
  if (!profiles || !profiles.dom || !profiles.react) throw new TypeError("profiles.dom and profiles.react are required");
  const host = requireElement("module-pair");
  const status = requireElement("module-status");
  const stateOutput = requireElement("module-snapshot");
  const traceOutput = requireElement("module-trace");
  const backendButtons = [...document.querySelectorAll("[data-module-backend]")];
  const initial = profiles.dom;
  const pair = await mountCompiledModulePair({
    parent: initial.parent,
    child: initial.child,
    renderers: rendererRegistry(),
    backend: "dom",
    container: host,
    onFailure(error) {
      status.textContent = `Runtime stopped: ${error.message}`;
      status.dataset.state = "failed";
    },
  });

  function refresh() {
    stateOutput.textContent = JSON.stringify(pair.snapshot(), null, 2);
    status.textContent = `Mounted with ${pair.snapshot().backend} renderer`;
    status.dataset.state = "ready";
  }

  async function swapBackend(backend) {
    pair.replaceBackend(backend);
    refresh();
    return pair.snapshot();
  }

  for (const button of backendButtons) {
    button.addEventListener("click", () => {
      const backend = button.dataset.moduleBackend;
      try {
        swapBackend(backend);
      } catch (error) {
        status.textContent = `Renderer swap failed: ${error.message}`;
        status.dataset.state = "failed";
      }
    });
  }
  requireElement("read-snapshot").addEventListener("click", refresh);
  requireElement("read-trace").addEventListener("click", () => {
    traceOutput.textContent = JSON.stringify(pair.trace(), null, 2);
  });

  const api = Object.freeze({
    pair,
    profiles,
    snapshot: () => pair.snapshot(),
    trace: () => pair.trace(),
    swapBackend,
    dispatchGoMessage: (target, message) => {
      const result = pair.dispatchGoMessage(target, message);
      refresh();
      return result;
    },
    unmount: () => pair.unmount(),
  });
  window.compiledModulesDemo = api;
  refresh();
  return api;
}
