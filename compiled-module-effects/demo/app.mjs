import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import {
  createTimerModuleEffectTransport,
  mountCompiledModuleEffects,
} from "../runtime/runtime.mjs";

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`module effects demo is missing #${id}`);
  return element;
}

function rendererRegistry() {
  return Object.freeze({
    dom: ({ container, onFailure }) => createDOMRenderer({ container, onFailure }),
    react: ({ container, onFailure }) => createReactRenderer({ container, onFailure }),
  });
}

/** Mount the independently compiled Go modules with a timer that echoes request tokens. */
export async function startModuleEffectsDemo({ profiles }) {
  if (!profiles?.dom || !profiles?.react) throw new TypeError("profiles.dom and profiles.react are required");
  const container = requireElement("effects-modules");
  const status = requireElement("effects-status");
  const snapshotOutput = requireElement("effects-snapshot");
  const traceOutput = requireElement("effects-trace");
  const timerTransport = createTimerModuleEffectTransport({ delayMs: 1500 });
  const transportStartObservations = [];
  let host;
  const transport = {
    start(request, deliver) {
      const [key, generationToken] = request.effect.arg.split(":");
      const generation = Number(generationToken?.slice(1));
      const childRoot = container.querySelector(`[data-gobi-module-root='child-${key}']`);
      const save = childRoot?.querySelector(".effect-request-controls button:first-child");
      const cancel = childRoot?.querySelector(".effect-request-controls button:last-child");
      const state = host.snapshot().children.find((item) => item.key === key && item.generation === generation);
      transportStartObservations.push({
        token: request.effect.arg,
        kind: request.effect.kind,
        name: request.effect.name,
        goPending: state?.goState?.Pending === true,
        goToken: state?.goState?.Token ?? null,
        statusLabel: childRoot?.querySelector(".effect-request-status")?.textContent ?? null,
        saveDisabled: save?.disabled ?? null,
        cancelDisabled: cancel?.disabled ?? null,
        backend: host.snapshot().backend,
      });
      timerTransport.start(request, deliver);
    },
    cancel(token, correlation) { return timerTransport.cancel(token, correlation); },
    pending() { return timerTransport.pending(); },
    records() { return timerTransport.records(); },
  };
  host = await mountCompiledModuleEffects({
    parent: profiles.dom.parent,
    child: profiles.dom.child,
    renderers: rendererRegistry(),
    backend: "dom",
    container,
    transport,
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

  for (const button of document.querySelectorAll("[data-effects-backend]")) {
    button.addEventListener("click", () => {
      try { swapBackend(button.dataset.effectsBackend); }
      catch (error) {
        status.textContent = `Renderer swap failed: ${error.message}`;
        status.dataset.state = "failed";
      }
    });
  }
  requireElement("read-effects-snapshot").addEventListener("click", refresh);
  requireElement("read-effects-trace").addEventListener("click", () => {
    traceOutput.textContent = JSON.stringify(host.trace(), null, 2);
  });
  container.addEventListener("click", () => queueMicrotask(refresh));

  const api = Object.freeze({
    host,
    profiles,
    snapshot: () => host.snapshot(),
    trace: () => host.trace(),
    transportLog: () => host.transportLog(),
    transportStartObservations: () => structuredClone(transportStartObservations),
    pending: () => host.pending(),
    swapBackend,
    dispatch: (options) => {
      const result = host.dispatch(options);
      refresh();
      return result;
    },
    unmount: () => host.unmount(),
  });
  window.moduleEffectsDemo = api;
  refresh();
  return api;
}
