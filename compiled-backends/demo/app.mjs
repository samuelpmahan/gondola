import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { mountCompiledApp } from "../../compiled-frontend/frontend/runtime/runtime.mjs";

const rendererFactories = {
  react: (container, onFailure) => createReactRenderer({ container, onFailure, strictMode: true }),
  dom: (container, onFailure) => createDOMRenderer({ container, onFailure }),
};

function forbidWebAssembly() {
  for (const name of ["Module", "Instance", "compile", "instantiate", "compileStreaming", "instantiateStreaming"]) {
    if (typeof WebAssembly[name] === "function") {
      WebAssembly[name] = () => { throw new Error("This compiled Go demo does not admit WebAssembly"); };
    }
  }
}

export function startDemo(apps) {
  forbidWebAssembly();
  const failures = [];
  const sessions = Object.create(null);
  const status = document.querySelector("#status");
  const host = document.querySelector("#apps");

  function reportFailure(name, failure) {
    const record = { name, ...failure };
    failures.push(record);
    status.textContent = `${name}: ${failure.message}`;
  }

  for (const { name, module, encoder } of apps) {
    const card = document.createElement("article");
    card.dataset.card = name;
    const heading = document.createElement("h2");
    heading.textContent = name;

    const selector = document.createElement("div");
    selector.className = "renderer-selector";
    selector.setAttribute("role", "group");
    selector.setAttribute("aria-label", `${name} renderer`);
    const reactButton = document.createElement("button");
    reactButton.type = "button";
    reactButton.textContent = "React";
    reactButton.dataset.renderer = "react";
    const domButton = document.createElement("button");
    domButton.type = "button";
    domButton.textContent = "DOM";
    domButton.dataset.renderer = "dom";
    selector.append(reactButton, domButton);
    const backendStatus = document.createElement("span");
    backendStatus.className = "backend-status";
    backendStatus.setAttribute("role", "status");

    const container = document.createElement("div");
    container.dataset.app = name;
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Inspect Go state and ordered trace";
    const panel = document.createElement("pre");
    panel.className = "trace-panel";
    details.append(summary, panel);

    card.append(heading, selector, backendStatus, container, details);
    host.append(card);

    const pending = [];
    const callbacksByBackend = new Map();
    let retiredCallbacks = null;
    let backend = "react";
    const makeRenderer = targetBackend => {
      const core = rendererFactories[targetBackend](container, failure => reportFailure(name, failure));
      return {
        update(view, callbacks) {
          callbacksByBackend.set(targetBackend, callbacks);
          return core.update(view, callbacks);
        },
        viewRecord: (...args) => core.viewRecord(...args),
        domSnapshot: (...args) => core.domSnapshot(...args),
        focusState: (...args) => core.focusState(...args),
        restoreFocus: (...args) => core.restoreFocus(...args),
        unmount: (...args) => core.unmount(...args),
      };
    };
    let renderer = makeRenderer(backend);
    let runtime;
    const complete = document.createElement("button");
    complete.type = "button";
    complete.className = "complete-request";
    complete.textContent = "Complete next request";
    complete.disabled = true;
    complete.hidden = name !== "effect";

    const show = () => {
      if (!runtime) return;
      backendStatus.textContent = `Active renderer: ${backend === "react" ? "React" : "DOM"}`;
      reactButton.setAttribute("aria-pressed", String(backend === "react"));
      domButton.setAttribute("aria-pressed", String(backend === "dom"));
      complete.disabled = pending.length === 0;
      panel.textContent = JSON.stringify(runtime.trace(), null, 2);
    };
    const choose = nextBackend => {
      if (backend === nextBackend) return;
      try {
        const oldCallbacks = callbacksByBackend.get(backend) ?? null;
        const nextRenderer = makeRenderer(nextBackend);
        runtime.replaceRenderer(nextRenderer);
        if (oldCallbacks) retiredCallbacks = { backend, callbacks: oldCallbacks };
        renderer = nextRenderer;
        backend = nextBackend;
        show();
      } catch (error) {
        backendStatus.textContent = "Renderer replacement failed; inspect status";
        reportFailure(name, { stage: "renderer-swap", message: error instanceof Error ? error.message : String(error), error: error instanceof Error ? error.name : "Error" });
      }
    };
    reactButton.addEventListener("click", () => choose("react"));
    domButton.addEventListener("click", () => choose("dom"));
    complete.addEventListener("click", () => {
      const item = pending.shift();
      if (item) {
        item.deliver({
          dispatchId: item.request.dispatchId,
          effectIndex: item.request.effectIndex,
          message: { name: item.request.effect.reply, arg: item.request.effect.arg },
        });
      }
      show();
    });

    const effectHost = {
      request(request, deliver) {
        pending.push({ request, deliver });
        show();
      },
    };
    runtime = mountCompiledApp({
      module,
      encoder,
      componentId: module.appIR.components[0].id,
      renderer,
      effectHost,
      onTick: show,
      onFailure: failure => reportFailure(name, failure),
    });
    if (name === "effect") {
      const effectHostElement = document.createElement("div");
      effectHostElement.className = "effect-host";
      effectHostElement.append(complete);
      card.append(effectHostElement);
    }
    show();

    sessions[name] = {
      runtime,
      get backend() { return backend; },
      get renderer() { return renderer; },
      pending,
      fenceRetiredCallback(action, message) {
        const retired = retiredCallbacks;
        if (!retired) throw new Error(`${name} has no retired renderer callback`);
        return retired.callbacks.dispatch(action, message);
      },
    };
  }

  window.gobiDemo = { sessions, failures };
  if (!failures.length) status.textContent = "Four compiled Go components mounted · React 19.3.1 · DOM renderer · no WASM";
}
