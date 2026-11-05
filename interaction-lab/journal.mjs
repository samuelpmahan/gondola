import { experiment, parameters } from './registry.mjs';
import { initialMotion, motionEvent } from './motion.mjs';
export const SCHEMA = 'gondola.interaction-variant/v1';
export const MAX_EVENTS = 5000;
export const MAX_MOTION_TICKS = 144000;
export function appendMotionRecord(events, event, ticks) {
  const nextTicks = ticks + (event.type === 'tick' ? event.steps : 0);
  if (nextTicks > MAX_MOTION_TICKS) throw Error('Motion recording limit reached. Save this checkpoint, then reset the study.');
  const last = events.at(-1);
  if (event.type === 'tick' && last?.type === 'tick' && last.steps + event.steps <= 1200) { last.steps += event.steps; return nextTicks; }
  if (events.length >= MAX_EVENTS) throw Error('Event recording limit reached. Save this checkpoint, then reset the study.');
  events.push({ ...event });
  return nextTicks;
}
const clone = v => JSON.parse(JSON.stringify(v));
function plain(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function dataBudget(v, depth = 0, budget = { count: 0 }) {
  if (depth > 48 || ++budget.count > 60000) throw new TypeError('Variant structure exceeds limits');
  if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError('Nonfinite data');
  if (v && typeof v === 'object') for (const item of Object.values(v)) dataBudget(item, depth + 1, budget);
}
export function validateEvents(id, params, events) {
  const e = experiment(id);
  if (!Array.isArray(events) || events.length > MAX_EVENTS) throw new TypeError('Too many events');
  let p = parameters(id, params), work = 0;
  for (const item of events) {
    if (!plain(item)) throw new TypeError('Invalid event');
    if (item.type === 'parameter') {
      p = parameters(id, { ...p, [item.key]: item.value });
    } else if (e.kind === 'motion') {
      motionEvent(id, p, initialMotion(id, p), item);
      work += item.type === 'tick' ? item.steps : 0;
      if (work > MAX_MOTION_TICKS) throw new TypeError('Replay exceeds 20 minutes of fixed ticks');
    } else if (item.type === 'action') {
      if (!plain(item.action) || !plain(item.message) || typeof item.action.path !== 'string' || item.action.path.length > 300 || !['click', 'input', 'change'].includes(item.action.event) || typeof item.action.value !== 'string' || item.action.value.length > 4000 || typeof item.message.Name !== 'string' || item.message.Name.length > 100 || typeof item.message.Arg !== 'string' || item.message.Arg.length > 4000) throw new TypeError('Invalid component action');
    } else if (item.type === 'renderer') {
      if (!['dom', 'react'].includes(item.backend)) throw new TypeError('Invalid renderer');
    } else if (item.type === 'reply') {
      if (!Number.isInteger(item.index) || item.index < 0 || item.index > MAX_EVENTS) throw new TypeError('Invalid reply index');
    } else if (item.type !== 'reset') throw new TypeError('Unknown component event');
  }
  return p;
}
export function makeVariant({ name, experiment: id, params, events = [], final, seed = 1, backend = 'dom', id: givenID }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 100) throw new TypeError('Name must contain 1–100 characters');
  const p = parameters(id, params);
  validateEvents(id, p, events);
  if (!['dom', 'react'].includes(backend)) throw new TypeError('Invalid starting renderer');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TypeError('Invalid seed');
  if (!plain(final)) throw new TypeError('Final state is required');
  dataBudget(final);
  const result = { schema: SCHEMA, version: 1, id: givenID ?? ('v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)), name: name.trim(), experiment: id, params: p, backend, seed, events: clone(events), final: clone(final) };
  if (typeof result.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(result.id)) throw new TypeError('Invalid variant ID');
  if (new TextEncoder().encode(JSON.stringify(result)).length > 1000000) throw new TypeError('Portable variant exceeds 1 MB. Export evidence to keep the complete session.');
  return result;
}
export function parseVariant(text) {
  if (typeof text !== 'string' || text.length > 1000000 || new TextEncoder().encode(text).length > 1000000) throw new TypeError('Variant exceeds 1 MB');
  const value = JSON.parse(text);
  if (value?.schema !== SCHEMA || value.version !== 1) throw new TypeError('Unsupported variant schema');
  dataBudget(value);
  return makeVariant(value);
}
export function replayMotion(id, initialParams, events) {
  validateEvents(id, initialParams, events);
  let params = parameters(id, initialParams), state = initialMotion(id, params);
  const trace = [];
  for (const [i, event] of events.entries()) {
    if (event.type === 'parameter') params = parameters(id, { ...params, [event.key]: event.value });
    else state = motionEvent(id, params, state, event);
    trace.push({ index: i, event: clone(event), state: { ...state } });
  }
  return { params, state, trace };
}
export function firstDifference(a, b, path = '$') {
  if (Object.is(a, b)) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return { path, expected: a, actual: b };
  if (Array.isArray(a) !== Array.isArray(b)) return { path, expected: a, actual: b };
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  for (const key of keys) {
    if (!Object.hasOwn(a, key) || !Object.hasOwn(b, key)) return { path: path + '.' + key, expected: a[key], actual: b[key] };
    const d = firstDifference(a[key], b[key], path + '.' + key);
    if (d) return d;
  }
  return null;
}
