import React from "react";
import { version as reactDOMVersion } from "react-dom";
import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { LIFECYCLE_HOST_CAPABILITIES, mountLifecycleApp } from "../../compiled-lifecycle/runtime/runtime.mjs";

const rendererFactories = {
  react: (container, onFailure) => createReactRenderer({ container, onFailure, strictMode: true }),
  dom: (container, onFailure) => createDOMRenderer({ container, onFailure }),
};

const pretty = (value) => JSON.stringify(value, null, 2);

function renderCapabilities(target, capabilities) {
  target.replaceChildren();
  for (const capability of capabilities) {
    const item = document.createElement("li");
    item.textContent = capability;
    target.append(item);
  }
}

export function startCapabilityDemo(module, encoder) {
  const status = document.querySelector("#status");
  const swapStatus = document.querySelector("#swap-status");
  const container = document.querySelector("#go-view");
  const statePanel = document.querySelector("#state-snapshot");
  const tracePanel = document.querySelector("#runtime-trace");
  const activeRenderer = document.querySelector("#active-renderer");
  const rendererSwitch = document.querySelector(".renderer-switch");
  const pendingCount = document.querySelector("#pending-count");
  const pendingList = document.querySelector("#pending-list");
  const completeNext = document.querySelector("#complete-next");
  const rejectionButton = document.querySelector("#reject-incompatible");
  const component = module?.appIR?.components?.[0];
  if (!component || !Array.isArray(component.capabilities)) {
    throw new TypeError("compiled lifecycle AppIR must declare component capabilities");
  }

  const failures = [];
  const hostCapabilities = LIFECYCLE_HOST_CAPABILITIES;
  let backend = "dom";
  let renderer;
  let session;
  let swapOutcome = { kind: "idle", message: "No profile negotiation attempted yet." };

  const recordFailure = (stage, error) => {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ stage, message });
    status.dataset.state = "error";
    status.textContent = `${stage}: ${message}`;
  };

  const makeRenderer = (name) => rendererFactories[name](container, (error) => recordFailure(`${name}-renderer`, error));

  const renderPending = (pending) => {
    pendingList.replaceChildren();
    for (const item of pending) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pending-token";
      button.dataset.deliverToken = item.token;
      button.textContent = `Reply to ${item.token}`;
      button.addEventListener("click", () => deliverToken(item.token));
      pendingList.append(button);
    }
  };

  const show = () => {
    if (!session) return;
    const snapshot = session.runtime.snapshot();
    const trace = session.runtime.trace();
    const pending = session.effects.pending();
    statePanel.textContent = pretty({ state: snapshot.state, pending });
    tracePanel.textContent = pretty({ ticks: trace.ticks, rendererDiagnostics: session.runtime.rendererDiagnostics?.() ?? null });
    activeRenderer.textContent = `Renderer: ${backend === "react" ? "React" : "DOM"}`;
    renderCapabilities(document.querySelector("#renderer-support"), renderer.viewCapabilities ?? []);
    for (const button of rendererSwitch.querySelectorAll("[data-renderer]")) {
      button.setAttribute("aria-pressed", String(button.dataset.renderer === backend));
    }
    pendingCount.textContent = pending.length === 0
      ? "No pending requests"
      : `${pending.length} pending request${pending.length === 1 ? "" : "s"}`;
    completeNext.disabled = pending.length === 0;
    completeNext.dataset.enabled = String(pending.length !== 0);
    renderPending(pending);
    swapStatus.dataset.state = swapOutcome.kind;
    swapStatus.textContent = swapOutcome.message;
  };

  function deliverToken(token) {
    const result = session.effects.deliver(token);
    swapOutcome = result.accepted
      ? { kind: "accepted", message: `Reply ${token} was delivered to Go.` }
      : { kind: "rejected", message: `Reply rejected: ${result.error ?? "unknown request"}` };
    show();
    return result;
  }

  const replace = (nextBackend) => {
    const nextRenderer = makeRenderer(nextBackend);
    session.runtime.replaceRenderer(nextRenderer);
    renderer = nextRenderer;
    backend = nextBackend;
    swapOutcome = { kind: "accepted", message: `Compatible ${nextBackend.toUpperCase()} profile accepted; Go state and pending work stayed mounted.` };
    status.dataset.state = "ready";
    status.textContent = "Compiled Go lifecycle active · profile accepted";
    show();
  };

  const tryIncompatibleProfile = () => {
    const candidate = { ...makeRenderer(backend), viewCapabilities: [] };
    try {
      session.runtime.replaceRenderer(candidate);
      swapOutcome = { kind: "error", message: "The empty view profile was unexpectedly accepted." };
      status.dataset.state = "error";
      status.textContent = swapOutcome.message;
    } catch (error) {
      swapOutcome = { kind: "rejected", message: `Incompatible profile rejected: ${error.message}` };
      status.dataset.state = "ready";
      status.textContent = "Compiled Go lifecycle active · incompatible candidate rejected";
    }
    show();
  };

  renderCapabilities(document.querySelector("#compiled-requirements"), component.capabilities);
  renderCapabilities(document.querySelector("#host-support"), hostCapabilities);
  renderer = makeRenderer(backend);
  session = mountLifecycleApp({
    module,
    componentId: component.id,
    appId: "compiled-capabilities-demo",
    encoder,
    renderer,
    onTick: () => {
      show();
      queueMicrotask(show);
    },
    onFailure: (error) => recordFailure("runtime", error),
  });

  completeNext.addEventListener("click", () => {
    const next = session.effects.pending()[0];
    if (next) deliverToken(next.token);
  });
  rejectionButton.addEventListener("click", tryIncompatibleProfile);
  rendererSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-renderer]");
    if (!button || !rendererSwitch.contains(button)) return;
    const nextBackend = button.dataset.renderer;
    if (!Object.hasOwn(rendererFactories, nextBackend) || nextBackend === backend) return;
    try {
      replace(nextBackend);
    } catch (error) {
      recordFailure("renderer-swap", error);
      swapOutcome = { kind: "error", message: error.message };
      show();
    }
  });

  window.capabilityDemo = {
    runtime: session.runtime,
    effects: session.effects,
    failures,
    get backend() { return backend; },
    get renderer() { return renderer; },
    get reactVersions() { return { react: React.version, reactDOM: reactDOMVersion }; },
    get lastSnapshot() { return session.runtime.snapshot(); },
    get lastPending() { return session.effects.pending(); },
    get swapOutcome() { return { ...swapOutcome }; },
  };
  show();
  status.dataset.state = "ready";
  status.textContent = "Compiled Go lifecycle active · capability profile ready";
  return window.capabilityDemo;
}
