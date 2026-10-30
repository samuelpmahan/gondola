import { createReactRenderer } from '../frontend/react/renderer.mjs';
import { mountCompiledApp } from '../frontend/runtime/runtime.mjs';

export function startDemo(apps) {
  const failures = [];
  for (const name of ['Module', 'Instance', 'compile', 'instantiate', 'compileStreaming', 'instantiateStreaming']) {
    if (typeof WebAssembly[name] === 'function') WebAssembly[name] = () => { throw new Error('This compiled Go demo does not admit WebAssembly'); };
  }
  const status = document.querySelector('#status');
  window.gobiDemo = { sessions: {}, failures };
  for (const { name, module, encoder } of apps) {
    const card = document.createElement('article');
    const heading = document.createElement('h2'); heading.textContent = name;
    const container = document.createElement('div'); container.dataset.app = name;
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = 'Inspect Go state and event trace';
    const panel = document.createElement('pre'); details.append(summary, panel);
    card.append(heading, container, details); document.querySelector('#apps').append(card);
    const pending = [];
    const complete = document.createElement('button'); complete.textContent = 'Complete next request'; complete.disabled = true;
    let runtime;
    const show = () => {
      if (runtime) panel.textContent = JSON.stringify(runtime.trace(), null, 2);
      complete.disabled = pending.length === 0;
    };
    const fail = failure => { failures.push({ name, ...failure }); status.textContent = `${name}: ${failure.message}`; };
    const renderer = createReactRenderer({ container, strictMode: true, onFailure: fail });
    runtime = mountCompiledApp({
      module, encoder, componentId: module.appIR.components[0].id, renderer,
      effectHost: { request(request, deliver) { pending.push({ request, deliver }); show(); } },
      onTick: () => { queueMicrotask(show); }, onFailure: fail,
    });
    if (name === 'effect') {
      const host = document.createElement('div'); host.className = 'effect-host'; host.append(complete); card.append(host);
      complete.addEventListener('click', () => {
        const item = pending.shift();
        if (item) item.deliver({ dispatchId: item.request.dispatchId, effectIndex: item.request.effectIndex, message: { name: item.request.effect.reply, arg: item.request.effect.arg } });
        show();
      });
    }
    show(); window.gobiDemo.sessions[name] = runtime;
  }
  if (!failures.length) status.textContent = 'Four compiled Go components mounted · React 19.3.1 · no WASM';
}
