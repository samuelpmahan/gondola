import React from "react";
import { version as reactDOMVersion } from "react-dom";
import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { COMPILED_CHILDREN_HOST_CAPABILITIES, mountCompiledChildrenApp } from "../runtime/runtime.mjs";

const rendererFactories = {
  react: (container, onFailure) => createReactRenderer({ container, onFailure, strictMode: true }),
  dom: (container, onFailure) => createDOMRenderer({ container, onFailure }),
};

const pretty = (value) => JSON.stringify(value, null, 2);

export function startChildrenDemo(module, encoder) {
  const status = document.querySelector("#status");
  const container = document.querySelector("#go-view");
  const statePanel = document.querySelector("#state-snapshot");
  const eventPanel = document.querySelector("#host-events");
  const activeRenderer = document.querySelector("#active-renderer");
  const selector = document.querySelector(".renderer-switch");
  const swapStatus = document.querySelector("#swap-status");
  const pendingCount = document.querySelector("#pending-count");
  const pendingList = document.querySelector("#pending-list");
  const cancelledList = document.querySelector("#cancelled-list");
  const requirements = document.querySelector("#compiled-requirements");
  const hostSupport = document.querySelector("#host-support");
  const rendererSupport = document.querySelector("#renderer-support");
  const component = module?.appIR?.components?.[0];
  if (!component || !Array.isArray(component.capabilities)) {
    throw new TypeError("compiled children AppIR must declare component capabilities");
  }

  const failures = [];
  let backend = "dom";
  let renderer;
  let session;
  let swapOutcome = { kind: "idle", message: "No renderer negotiation attempted yet." };
  let lastHostResult = null;

  const recordFailure = (stage, error) => {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ stage, message });
    status.dataset.state = "error";
    status.textContent = `${stage}: ${message}`;
  };

  const makeRenderer = (name) => rendererFactories[name](container, (error) => recordFailure(`${name}-renderer`, error));

  const renderCapabilities = (target, values) => {
    target.replaceChildren();
    for (const value of values) {
      const item = document.createElement("li");
      item.textContent = value;
      target.append(item);
    }
  };

  const actionResult = (label, result) => {
    lastHostResult = { label, ...result };
    const summary = document.querySelector("#host-action-status");
    summary.textContent = `${label}: ${result.outcome ?? (result.accepted ? "accepted" : "rejected")}`;
    summary.dataset.state = result.accepted ? "accepted" : "rejected";
  };

  const renderTokens = () => {
    const pending = session.effects.pending();
    const records = session.effects.records();
    const cancelled = records.filter((record) => record.kind === "cancel").map((record) => record.token);
    pendingList.replaceChildren();
    for (const item of pending) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "token-button";
      button.dataset.deliverToken = item.token;
      button.textContent = `Reply to ${item.token}`;
      button.addEventListener("click", () => deliver(item.token, "manual Go reply"));
      pendingList.append(button);
    }
    cancelledList.replaceChildren();
    for (const token of [...new Set(cancelled)]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "token-button token-button-muted";
      button.dataset.staleToken = token;
      button.textContent = `Try stale reply ${token}`;
      button.addEventListener("click", () => deliver(token, "cancelled reply probe"));
      cancelledList.append(button);
    }
    pendingCount.textContent = pending.length === 0
      ? "No pending replies"
      : `${pending.length} pending ${pending.length === 1 ? "reply" : "replies"}`;
  };

  const show = () => {
    if (!session) return;
    const snapshot = session.runtime.snapshot();
    statePanel.textContent = pretty({ state: snapshot.state, view: snapshot.view });
    eventPanel.textContent = pretty({ effects: session.effects.records(), lastHostResult });
    activeRenderer.textContent = `Renderer: ${backend === "react" ? "React" : "DOM"}`;
    for (const button of selector.querySelectorAll("[data-renderer]")) {
      button.setAttribute("aria-pressed", String(button.dataset.renderer === backend));
    }
    renderCapabilities(rendererSupport, renderer.viewCapabilities ?? []);
    renderTokens();
    swapStatus.dataset.state = swapOutcome.kind;
    swapStatus.textContent = swapOutcome.message;
  };

  function deliver(token, label) {
    const result = session.effects.deliver(token);
    actionResult(label, result);
    show();
    return result;
  }

  function swapTo(nextBackend) {
    const nextRenderer = makeRenderer(nextBackend);
    session.runtime.replaceRenderer(nextRenderer);
    renderer = nextRenderer;
    backend = nextBackend;
    swapOutcome = { kind: "accepted", message: `Compatible ${nextBackend.toUpperCase()} renderer accepted. Go state and pending replies stayed live.` };
    status.dataset.state = "ready";
    status.textContent = "Compiled Go child collection active · renderer changed";
    show();
  }

  function rejectIncompatibleRenderer() {
    const candidate = { ...makeRenderer(backend), viewCapabilities: [] };
    try {
      session.runtime.replaceRenderer(candidate);
      swapOutcome = { kind: "error", message: "The renderer missing view.node was unexpectedly accepted." };
      status.dataset.state = "error";
      status.textContent = swapOutcome.message;
    } catch (error) {
      swapOutcome = { kind: "rejected", message: `Incompatible renderer rejected: ${error.message}` };
      status.dataset.state = "ready";
      status.textContent = "Compiled Go child collection active · incompatible renderer rejected";
    }
    show();
  }

  renderCapabilities(requirements, component.capabilities);
  renderCapabilities(hostSupport, COMPILED_CHILDREN_HOST_CAPABILITIES);
  renderer = makeRenderer(backend);
  session = mountCompiledChildrenApp({
    module,
    componentId: component.id,
    appId: "compiled-children-demo",
    encoder,
    renderer,
    onTick: () => {
      show();
      queueMicrotask(show);
    },
    onFailure: (error) => recordFailure("runtime", error),
  });

  selector.addEventListener("click", (event) => {
    const button = event.target.closest("[data-renderer]");
    if (!button || !selector.contains(button)) return;
    const nextBackend = button.dataset.renderer;
    if (!Object.hasOwn(rendererFactories, nextBackend) || nextBackend === backend) return;
    try {
      swapTo(nextBackend);
    } catch (error) {
      recordFailure("renderer-swap", error);
      swapOutcome = { kind: "error", message: error.message };
      show();
    }
  });
  document.querySelector("#reject-incompatible").addEventListener("click", rejectIncompatibleRenderer);

  window.childrenDemo = {
    runtime: session.runtime,
    effects: session.effects,
    failures,
    reactVersions: { react: React.version, reactDOM: reactDOMVersion },
    get backend() { return backend; },
    get renderer() { return renderer; },
    get lastSnapshot() { return session.runtime.snapshot(); },
    get pending() { return session.effects.pending(); },
    get hostRecords() { return session.effects.records(); },
    get swapOutcome() { return { ...swapOutcome }; },
  };
  show();
  status.dataset.state = "ready";
  status.textContent = "Compiled Go child collection active · manual reply host ready";
  return window.childrenDemo;
}
