import { createDOMRenderer } from "../../compiled-frontend/frontend/dom/renderer.mjs";
import { createReactRenderer } from "../../compiled-frontend/frontend/react/renderer.mjs";
import { mountCompiledApp } from "../../compiled-frontend/frontend/runtime/runtime.mjs";

const rendererFactories = {
  react: (container, onFailure) => createReactRenderer({ container, onFailure, strictMode: true }),
  dom: (container, onFailure) => createDOMRenderer({ container, onFailure }),
};

export function startMethodDemo(module, encoder) {
  const status = document.querySelector("#status");
  const container = document.querySelector("#go-view");
  const statePanel = document.querySelector("#state-snapshot");
  const tracePanel = document.querySelector("#runtime-trace");
  const activeRenderer = document.querySelector("#active-renderer");
  const selector = document.querySelector(".renderer-switch");
  const failures = [];
  let backend = "react";
  const fail = (stage, error) => {
    const record = {
      stage,
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    };
    failures.push(record);
    status.dataset.state = "error";
    status.textContent = `${stage}: ${record.message}`;
  };
  const makeRenderer = (name) => rendererFactories[name](container, (error) => fail(`${name}-renderer`, error));
  let renderer = makeRenderer(backend);
  let runtime;

  const show = () => {
    if (!runtime) return;
    const snapshot = runtime.snapshot();
    statePanel.textContent = JSON.stringify(snapshot.state, null, 2);
    tracePanel.textContent = JSON.stringify(runtime.trace(), null, 2);
    activeRenderer.textContent = backend === "react" ? "React" : "DOM";
    for (const button of selector.querySelectorAll("[data-renderer]")) {
      button.setAttribute("aria-pressed", String(button.dataset.renderer === backend));
    }
  };

  runtime = mountCompiledApp({
    module,
    encoder,
    componentId: module.appIR.components[0].id,
    renderer,
    effectHost: {
      request(request) {
        fail("unexpected-effect", new Error(`fixture emitted ${request.effect.kind}`));
      },
    },
    onTick: show,
    onFailure: (error) => fail("runtime", error),
  });

  selector.addEventListener("click", (event) => {
    const button = event.target.closest("[data-renderer]");
    if (!button || !selector.contains(button)) return;
    const nextBackend = button.dataset.renderer;
    if (!Object.hasOwn(rendererFactories, nextBackend) || nextBackend === backend) return;
    try {
      const nextRenderer = makeRenderer(nextBackend);
      runtime.replaceRenderer(nextRenderer);
      renderer = nextRenderer;
      backend = nextBackend;
      status.dataset.state = "ready";
      status.textContent = "Go methods active · renderer changed without an application update";
      show();
    } catch (error) {
      fail("renderer-swap", error);
    }
  });

  show();
  status.dataset.state = "ready";
  status.textContent = "Go View mounted · value methods ready";
  window.methodsDemo = {
    runtime,
    failures,
    get backend() { return backend; },
    get renderer() { return renderer; },
  };
  return window.methodsDemo;
}
