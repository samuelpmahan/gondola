import React from "react";
import { version as reactDOMVersion } from "react-dom";
import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import {
  COMPILED_PUBLICATIONS_HOST_CAPABILITIES,
  mountCompiledPublicationsApp,
} from "../runtime/runtime.mjs";

const rendererFactories = {
  react: (container, onFailure) => createReactRenderer({ container, onFailure, strictMode: true }),
  dom: (container, onFailure) => createDOMRenderer({ container, onFailure }),
};

const pretty = (value) => JSON.stringify(value, null, 2);

/**
 * Start the executable publications demo. App state and publication queue
 * transitions stay in the generated Go module; this shell only swaps shared
 * renderers and displays read-only runtime/effect diagnostics.
 */
export function startPublicationsDemo(module, encoder) {
  const status = document.querySelector("#status");
  const container = document.querySelector("#go-view");
  const statePanel = document.querySelector("#state-snapshot");
  const eventPanel = document.querySelector("#host-events");
  const activeRenderer = document.querySelector("#active-renderer");
  const rendererControls = document.querySelector(".toolbar");
  const swapStatus = document.querySelector("#swap-status");
  const pendingCount = document.querySelector("#pending-count");
  const pendingList = document.querySelector("#pending-list");
  const cancelledList = document.querySelector("#cancelled-list");
  const hostActionStatus = document.querySelector("#host-action-status");
  const requirements = document.querySelector("#compiled-requirements");
  const hostSupport = document.querySelector("#host-support");
  const rendererSupport = document.querySelector("#renderer-support");
  const component = module?.appIR?.components?.[0];
  if (!component || !Array.isArray(component.capabilities)) {
    throw new TypeError("compiled publications AppIR must declare component capabilities");
  }

  const failures = [];
  let backend = "dom";
  let renderer;
  let session;
  let swapOutcome = { kind: "idle", message: "No renderer negotiation attempted yet." };
  let lastHostResult = null;

  function recordFailure(stage, error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ stage, message });
    status.dataset.state = "error";
    status.textContent = `${stage}: ${message}`;
  }

  function makeRenderer(name) {
    return rendererFactories[name](container, (error) => recordFailure(`${name}-renderer`, error));
  }

  function renderCapabilities(target, values) {
    target.replaceChildren();
    for (const value of values) {
      const item = document.createElement("li");
      item.textContent = value;
      target.append(item);
    }
  }

  function deliverHostToken(token, label) {
    const result = session.effects.deliver(token);
    lastHostResult = { label, ...result };
    hostActionStatus.textContent = `${label}: ${result.outcome ?? (result.accepted ? "accepted" : "rejected")}`;
    hostActionStatus.dataset.state = result.accepted ? "accepted" : "rejected";
    show();
    return result;
  }

  function renderHostReplies() {
    const pending = session.effects.pending();
    const records = session.effects.records();
    pendingList.replaceChildren();
    for (const item of pending) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.deliverToken = item.token;
      button.textContent = `Reply to ${item.token}`;
      button.addEventListener("click", () => deliverHostToken(item.token, "Manual Go reply"));
      pendingList.append(button);
    }
    const cancelledTokens = [...new Set(records.filter((record) => record.kind === "cancel").map((record) => record.token))];
    cancelledList.replaceChildren();
    for (const token of cancelledTokens) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.staleToken = token;
      button.textContent = `Try stale reply ${token}`;
      button.addEventListener("click", () => deliverHostToken(token, "Cancelled reply probe"));
      cancelledList.append(button);
    }
    pendingCount.textContent = pending.length === 0
      ? "No pending replies"
      : `${pending.length} pending ${pending.length === 1 ? "reply" : "replies"}`;
  }

  function show() {
    if (!session) return;
    const snapshot = session.runtime.snapshot();
    statePanel.textContent = pretty({ state: snapshot.state, view: snapshot.view });
    eventPanel.textContent = pretty({ effects: session.effects.records(), lastHostResult });
    activeRenderer.textContent = `Renderer: ${backend === "react" ? "React" : "DOM"}`;
    for (const button of rendererControls.querySelectorAll("[data-renderer]")) {
      button.setAttribute("aria-pressed", String(button.dataset.renderer === backend));
    }
    renderCapabilities(rendererSupport, renderer.viewCapabilities ?? []);
    renderHostReplies();
    swapStatus.dataset.state = swapOutcome.kind;
    swapStatus.textContent = swapOutcome.message;
  }

  function swapTo(nextBackend) {
    if (!Object.hasOwn(rendererFactories, nextBackend) || nextBackend === backend) return;
    const candidate = makeRenderer(nextBackend);
    session.runtime.replaceRenderer(candidate);
    renderer = candidate;
    backend = nextBackend;
    swapOutcome = {
      kind: "accepted",
      message: `Compatible ${nextBackend.toUpperCase()} renderer accepted; Go state and queued publications remain in the compiled module.`,
    };
    status.dataset.state = "ready";
    status.textContent = "Compiled Go publication app active · renderer changed";
    show();
  }

  function rejectIncompatibleRenderer() {
    const candidate = { ...makeRenderer(backend), viewCapabilities: [] };
    try {
      session.runtime.replaceRenderer(candidate);
      swapOutcome = { kind: "error", message: "A renderer missing view.node was unexpectedly accepted." };
      status.dataset.state = "error";
      status.textContent = swapOutcome.message;
    } catch (error) {
      swapOutcome = { kind: "rejected", message: `Incompatible renderer rejected: ${error.message}` };
      status.dataset.state = "ready";
      status.textContent = "Compiled Go publication app active · incompatible renderer rejected";
    }
    show();
  }

  renderCapabilities(requirements, component.capabilities);
  renderCapabilities(hostSupport, COMPILED_PUBLICATIONS_HOST_CAPABILITIES);
  renderer = makeRenderer(backend);
  session = mountCompiledPublicationsApp({
    module,
    componentId: component.id,
    appId: "compiled-publications-demo",
    encoder,
    renderer,
    onTick: () => {
      show();
      queueMicrotask(show);
    },
    onFailure: (error) => recordFailure("runtime", error),
  });

  rendererControls.addEventListener("click", (event) => {
    const button = event.target.closest("[data-renderer]");
    if (!button || !rendererControls.contains(button)) return;
    try {
      swapTo(button.dataset.renderer);
    } catch (error) {
      recordFailure("renderer-swap", error);
      swapOutcome = { kind: "error", message: error.message };
      show();
    }
  });
  document.querySelector("#reject-incompatible").addEventListener("click", rejectIncompatibleRenderer);

  window.publicationsDemo = {
    runtime: session.runtime,
    effects: session.effects,
    failures,
    reactVersions: { react: React.version, reactDOM: reactDOMVersion },
    get backend() { return backend; },
    get renderer() { return renderer; },
    get lastSnapshot() { return session.runtime.snapshot(); },
    get pending() { return session.effects.pending(); },
    get hostRecords() { return session.effects.records(); },
    get lastHostResult() { return lastHostResult; },
    get swapOutcome() { return { ...swapOutcome }; },
  };
  show();
  status.dataset.state = "ready";
  status.textContent = "Compiled Go typed-input and publication app active";
  return window.publicationsDemo;
}
