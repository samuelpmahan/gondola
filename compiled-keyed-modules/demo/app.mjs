import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { mountCompiledKeyedModules } from "../runtime/runtime.mjs";

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`keyed modules demo is missing #${id}`);
  return element;
}

function rendererRegistry() {
  return Object.freeze({
    dom: ({ container, onFailure }) => createDOMRenderer({ container, onFailure }),
    react: ({ container, onFailure }) => createReactRenderer({ container, onFailure }),
  });
}

/** Start the browser demo with independently built parent and child records. */
export async function startKeyedModulesDemo({ profiles }) {
  if (!profiles?.dom || !profiles?.react) throw new TypeError("profiles.dom and profiles.react are required");
  const container = requireElement("keyed-modules");
  const status = requireElement("keyed-status");
  const snapshotOutput = requireElement("keyed-snapshot");
  const traceOutput = requireElement("keyed-trace");
  const host = await mountCompiledKeyedModules({
    parent: profiles.dom.parent,
    child: profiles.dom.child,
    renderers: rendererRegistry(),
    backend: "dom",
    container,
    onFailure(error) {
      status.textContent = `Runtime stopped: ${error.message}`;
      status.dataset.state = "failed";
    },
  });

  function refresh() {
    const snapshot = host.snapshot();
    snapshotOutput.textContent = JSON.stringify(snapshot, null, 2);
    status.textContent = `Mounted ${snapshot.children.length} keyed children with ${snapshot.backend} renderer`;
    status.dataset.state = "ready";
    return snapshot;
  }

  function swapBackend(backend) {
    const snapshot = host.replaceBackend(backend);
    refresh();
    return snapshot;
  }

  for (const button of document.querySelectorAll("[data-keyed-backend]")) {
    button.addEventListener("click", () => {
      try { swapBackend(button.dataset.keyedBackend); }
      catch (error) {
        status.textContent = `Renderer swap failed: ${error.message}`;
        status.dataset.state = "failed";
      }
    });
  }
  requireElement("read-keyed-snapshot").addEventListener("click", refresh);
  requireElement("read-keyed-trace").addEventListener("click", () => {
    traceOutput.textContent = JSON.stringify(host.trace(), null, 2);
  });
  container.addEventListener("click", () => queueMicrotask(refresh));

  const api = Object.freeze({
    host,
    profiles,
    snapshot: () => host.snapshot(),
    trace: () => host.trace(),
    swapBackend,
    dispatchParent: (action, message) => {
      const result = host.dispatchParent(action, message);
      refresh();
      return result;
    },
    dispatchChild: (key, action, message) => {
      const result = host.dispatchChild(key, action, message);
      refresh();
      return result;
    },
    dispatchGoMessage: (target, message, options = null) => {
      const result = host.dispatchGoMessage(target, message, options);
      refresh();
      return result;
    },
    publishChild: (key, generation, publication) => host.publishChild(key, generation, publication),
    unmount: () => host.unmount(),
  });
  window.keyedModulesDemo = api;
  refresh();
  return api;
}
