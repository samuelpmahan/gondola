import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { mountLifecycleApp } from "../runtime/runtime.mjs";

const rendererFactories = {
  react: (container, onFailure) => createReactRenderer({ container, onFailure, strictMode: true }),
  dom: (container, onFailure) => createDOMRenderer({ container, onFailure }),
};

const pretty = (value) => JSON.stringify(value, null, 2);

export function startLifecycleDemo(module, encoder) {
  const status = document.querySelector("#status");
  const container = document.querySelector("#go-view");
  const statePanel = document.querySelector("#state-snapshot");
  const viewPanel = document.querySelector("#view-snapshot");
  const effectPanel = document.querySelector("#effect-snapshot");
  const tracePanel = document.querySelector("#runtime-trace");
  const activeRenderer = document.querySelector("#active-renderer");
  const selector = document.querySelector(".renderer-switch");
  const pendingCount = document.querySelector("#pending-count");
  const pendingList = document.querySelector("#pending-list");
  const completeNext = document.querySelector("#complete-next");
  const replayToken = document.querySelector("#replay-token");
  const replaySelected = document.querySelector("#replay-selected");
  const probeRetired = document.querySelector("#probe-retired");
  const probeGoMessage = document.querySelector("#probe-go-message");
  const failures = [];
  const probedRetiredTokens = new Set();
  const probedGoMessageTokens = new Set();
  const completedTokens = [];
  let backend = "dom";
  let renderer;
  let session;
  let lastDeliveredToken = null;
  let lastHostResult = null;

  const recordFailure = (stage, error) => {
    const details = error !== null && typeof error === "object" ? error : null;
    const record = {
      stage: details?.stage ?? stage,
      name: details?.error ?? details?.name ?? (error instanceof Error ? error.name : "Error"),
      message: details?.message ?? (error instanceof Error ? error.message : String(error)),
    };
    failures.push(record);
    status.dataset.state = "error";
    status.textContent = `${stage}: ${record.message}`;
  };

  const makeRenderer = (name) => rendererFactories[name](container, (error) => recordFailure(`${name}-renderer`, error));

  const renderPending = (pending) => {
    pendingList.replaceChildren();
    for (const item of pending) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pending-token";
      button.dataset.deliverToken = item.token;
      button.textContent = `Complete ${item.token}`;
      button.addEventListener("click", () => deliverToken(item.token, "manual token completion"));
      pendingList.append(button);
    }
  };

  const renderReplayOptions = () => {
    const selected = replayToken.value;
    replayToken.replaceChildren(new Option("Choose completed reply…", ""));
    for (const token of completedTokens) replayToken.append(new Option(token, token));
    if (completedTokens.includes(selected)) replayToken.value = selected;
    else if (lastDeliveredToken) replayToken.value = lastDeliveredToken;
    replayToken.disabled = completedTokens.length === 0;
    replaySelected.disabled = completedTokens.length === 0 || replayToken.value === "";
  };

  const pendingAndRetired = () => {
    const pending = session.effects.pending();
    const cancelled = session.effects.records()
      .filter((record) => record.kind === "cancel")
      .map((record) => record.token);
    const nextRetired = cancelled.find((token) => !probedRetiredTokens.has(token)) ?? null;
    const nextGoMessageToken = cancelled.find((token) => !probedGoMessageTokens.has(token)) ?? null;
    return { pending, cancelled, nextRetired, nextGoMessageToken };
  };

  const updateHostStatus = (label, result) => {
    lastHostResult = { label, ...result };
    const summary = document.querySelector("#host-action-status");
    summary.textContent = `${label}: ${result.outcome ?? (result.accepted ? "accepted" : "rejected")}`;
    summary.dataset.state = result.accepted ? "accepted" : "rejected";
  };

  function deliverToken(token, label) {
    const result = session.effects.deliver(token);
    if (result.accepted) {
      lastDeliveredToken = token;
      if (!completedTokens.includes(token)) completedTokens.push(token);
    }
    updateHostStatus(label, result);
    show();
    return result;
  }

  const show = () => {
    if (!session) return;
    const snapshot = session.runtime.snapshot();
    const lifecycle = pendingAndRetired();
    statePanel.textContent = pretty(snapshot.state);
    viewPanel.textContent = pretty(snapshot.view);
    effectPanel.textContent = pretty({
      pending: lifecycle.pending,
      cancelled: lifecycle.cancelled,
      goMessageProbes: [...probedGoMessageTokens],
      records: session.effects.records(),
      lastHostResult,
    });
    tracePanel.textContent = pretty({
      trace: session.runtime.trace(),
      rendererDiagnostics: session.runtime.rendererDiagnostics?.() ?? null,
    });
    activeRenderer.textContent = `Renderer: ${backend === "react" ? "React" : "DOM"}`;
    for (const button of selector.querySelectorAll("[data-renderer]")) {
      button.setAttribute("aria-pressed", String(button.dataset.renderer === backend));
    }
    pendingCount.textContent = lifecycle.pending.length === 0
      ? "No pending requests"
      : `${lifecycle.pending.length} pending request${lifecycle.pending.length === 1 ? "" : "s"}`;
    completeNext.disabled = lifecycle.pending.length === 0;
    probeRetired.disabled = lifecycle.nextRetired === null;
    probeGoMessage.disabled = lifecycle.nextGoMessageToken === null;
    renderPending(lifecycle.pending);
    renderReplayOptions();
  };

  const completeOldest = () => {
    const next = session.effects.pending()[0];
    if (next) deliverToken(next.token, "oldest request completed");
  };

  const replaySelectedReply = () => {
    const token = replayToken.value;
    if (!token) return;
    const result = session.effects.deliver(token);
    updateHostStatus(`replay ${token}`, result);
    show();
  };

  const probeNextRetired = () => {
    const { nextRetired } = pendingAndRetired();
    if (!nextRetired) return;
    probedRetiredTokens.add(nextRetired);
    const result = session.effects.forceDeliverRetired(nextRetired);
    updateHostStatus(`retired reply ${nextRetired}`, result);
    show();
  };

  const probeNextGoMessage = () => {
    const { nextGoMessageToken } = pendingAndRetired();
    if (!nextGoMessageToken) return;
    probedGoMessageTokens.add(nextGoMessageToken);
    const result = session.runtime.dispatch(
      { path: "host/retired-reply", event: "probe", value: nextGoMessageToken },
      { Name: "complete", Arg: nextGoMessageToken },
    );
    updateHostStatus(`old Go completion ${nextGoMessageToken}`, {
      accepted: result.accepted,
      outcome: result.accepted ? "Go Update ran; stale token made no state change" : result.error ?? "rejected",
      dispatchId: result.dispatchId ?? null,
    });
    show();
  };

  completeNext.addEventListener("click", completeOldest);
  replayToken.addEventListener("change", () => {
    replaySelected.disabled = replayToken.value === "";
  });
  replaySelected.addEventListener("click", replaySelectedReply);
  probeRetired.addEventListener("click", probeNextRetired);
  probeGoMessage.addEventListener("click", probeNextGoMessage);

  renderer = makeRenderer(backend);
  session = mountLifecycleApp({
    module,
    componentId: module.appIR.components[0].id,
    appId: "compiled-lifecycle-demo",
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
      const nextRenderer = makeRenderer(nextBackend);
      session.runtime.replaceRenderer(nextRenderer);
      renderer = nextRenderer;
      backend = nextBackend;
      status.dataset.state = "ready";
      status.textContent = "Compiled Go lifecycle active · renderer changed without a Go update";
      show();
    } catch (error) {
      recordFailure("renderer-swap", error);
    }
  });

  window.lifecycleDemo = {
    runtime: session.runtime,
    effects: session.effects,
    failures,
    get backend() { return backend; },
    get renderer() { return renderer; },
    get lastSnapshot() { return session.runtime.snapshot(); },
    get lastPending() { return session.effects.pending(); },
    get probedRetiredTokens() { return [...probedRetiredTokens]; },
    get probedGoMessageTokens() { return [...probedGoMessageTokens]; },
  };
  show();
  status.dataset.state = "ready";
  status.textContent = "Compiled Go lifecycle active · manual effects ready";
  return window.lifecycleDemo;
}
