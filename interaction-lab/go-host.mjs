import { mountCompiledApp } from '../compiled-frontend/frontend/runtime/runtime.mjs';
import { parameters } from './registry.mjs';
import { MAX_EVENTS, firstDifference, validateEvents } from './journal.mjs';

export function plainGo(value) {
  if (value.kind === 'struct') return Object.fromEntries(value.fields.map(f => [f.name, plainGo(f.value)]));
  if (value.kind === 'slice') return value.isNil ? null : (value.items ?? []).map(plainGo);
  if (value.kind === 'string') return value.string;
  if (value.kind === 'bool') return value.bool;
  if (value.kind === 'int' || value.kind === 'uint') return value.integer;
  if (value.kind === 'float64') return { bits: value.bits ?? value.floatBits ?? value.float64Bits };
  return value;
}

/** Gallery policy around the existing Go runtime, never an alternate reducer. */
const TRACE_BUDGET = 4 * 1024 * 1024;
const byteSize = value => new TextEncoder().encode(JSON.stringify(value)).length;
function createGoHost({ id, container, compiled, renderers, backend = 'dom', params = {}, auto = true, onChange = () => {}, onFailure = () => {} }) {
  let p = parameters(id, params), runtime, active = true, replaying = false;
  let traceBytes = 0;
  const initialParams = { ...p }, initialBackend = backend, events = [], requests = [];
  const notify = () => { if (active) onChange(); };
  const append = event => { if (!replaying) { if (events.length >= MAX_EVENTS) throw Error('Recording is full. Save or reset this experiment.'); events.push(structuredClone(event)); } };
  function checkBudget(extra = 0) {
    // A tick embeds one full state/view/DOM snapshot plus input descriptors.
    // Reserve for replacement text and structural overhead before execution.
    if (traceBytes + byteSize(runtime.snapshot()) + extra * 12 + 4096 > TRACE_BUDGET) throw Error('Go trace budget reached (4 MiB). Export evidence and reset the study.');
  }
  function checkAction(message) {
    if (message.Arg.length > 4000) throw Error('Input exceeds 4,000 characters');
    checkBudget(new TextEncoder().encode(message.Arg).length);
    if (id === 'list' && message.Name === 'add') {
      const state = plainGo(runtime.snapshot().state);
      if ((state.Rows?.length ?? 0) >= 40) throw Error('This lab bounds the list to 40 rows.');
    }
  }
  function renderer(name) {
    const base = renderers[name]({ container, onFailure });
    return { ...base, update(view, callbacks) {
      const guardedCallbacks = { ...callbacks, dispatch(action, message) {
        try {
          checkAction(message); append({ type: 'action', action, message });
          const result = callbacks.dispatch(action, message); notify(); return result;
        } catch (e) { base.update(view, guardedCallbacks); onFailure(e); }
      } };
      return base.update(view, guardedCallbacks);
    } };
  }
  function clearRequests() {
    for (const item of requests) if (item.timer) clearTimeout(item.timer);
    requests.length = 0;
  }
  function start() {
    const item = compiled[id];
    runtime = mountCompiledApp({ module: item.module, encoder: item.encoder, componentId: item.module.appIR.components[0].id,
      renderer: renderer(backend), effectHost: {
        request(request, deliver) {
          const index = requests.length;
          const entry = { request, deliver, done: false, timer: null };
          requests.push(entry);
          if (auto && !replaying) entry.timer = setTimeout(() => { try { reply(index); } catch (e) { onFailure(e); } }, p.latency ?? 1500);
        },
      }, onTick: tick => { traceBytes += byteSize(tick); queueMicrotask(notify); }, onFailure,
    });
  }
  function reply(index = requests.findIndex(r => !r.done)) {
    const item = requests[index];
    if (!active || !item || item.done) throw Error('No pending request at index ' + index);
    checkBudget(new TextEncoder().encode(item.request.effect.arg).length);
    append({ type: 'reply', index });
    if (item.timer) clearTimeout(item.timer);
    item.done = true;
    const r = item.request;
    const result = item.deliver({ dispatchId: r.dispatchId, effectIndex: r.effectIndex, message: { name: r.effect.reply, arg: r.effect.arg } });
    notify(); return result;
  }
  function swap(next) {
    if (!['dom', 'react'].includes(next)) throw Error('Unknown backend');
    if (next === backend) return null;
    const before = runtime.snapshot();
    append({ type: 'renderer', backend: next });
    runtime.replaceRenderer(renderer(next)); backend = next;
    const difference = firstDifference(before, runtime.snapshot());
    notify(); return { difference, diagnostics: runtime.rendererDiagnostics() };
  }
  function reset() { append({ type: 'reset' }); clearRequests(); runtime.unmount(); start(); notify(); }
  function param(key, value) { const next = parameters(id, { ...p, [key]: value }); append({ type: 'parameter', key, value }); p = next; notify(); }
  function apply(event) {
    if (event.type === 'parameter') return param(event.key, event.value);
    if (event.type === 'renderer') return swap(event.backend);
    if (event.type === 'reply') return reply(event.index);
    if (event.type === 'reset') return reset();
    checkAction(event.message);
    const outcome = runtime.dispatch(event.action, event.message);
    if (!outcome.accepted) throw Error(outcome.error ?? 'Component action rejected');
    return outcome;
  }
  start();
  return {
    snapshot: () => runtime.snapshot(), trace: () => runtime.trace(),
    diagnostics: () => ({ renderer: runtime.rendererDiagnostics(), effects: runtime.effectDiagnostics() }),
    pending: () => requests.filter(r => !r.done).length,
    events: () => structuredClone(events), params: () => ({ ...p }), initialParams, initialBackend,
    autoEnabled: () => auto,
    backend: () => backend, swap, reply, reset, param,
    replay(journal) {
      validateEvents(id, initialParams, journal);
      replaying = true;
      try {
        clearRequests(); runtime.unmount(); backend = initialBackend; p = { ...initialParams }; traceBytes = 0; start();
        for (const event of journal) apply(event);
        events.splice(0, events.length, ...structuredClone(journal));
      } finally { replaying = false; }
      notify(); return runtime.snapshot();
    },
    setAuto(value) { auto = !!value; for (const [index, item] of requests.entries()) { if (item.timer) clearTimeout(item.timer); item.timer = null; if (auto && !item.done) item.timer = setTimeout(() => { try { reply(index); } catch (e) { onFailure(e); } }, p.latency ?? 1500); } },
    destroy() { active = false; clearRequests(); runtime.unmount(); },
  };
}

/** Admit the entire journal in a disposable host before touching the live one. */
export function mountGoExperiment(options) {
  const host = createGoHost(options);
  return { ...host, replay(journal) {
    validateEvents(options.id, host.initialParams, journal);
    const staging = options.container.ownerDocument.createElement('div');
    const trial = createGoHost({ ...options, container: staging, auto: false, onChange() {}, onFailure() {} });
    try { trial.replay(journal); } finally { trial.destroy(); }
    const previous = host.events(), previousAuto = host.autoEnabled();
    try { const snapshot = host.replay(journal); host.setAuto(false); return snapshot; }
    catch (error) { host.replay(previous); host.setAuto(previousAuto); throw error; }
  } };
}
