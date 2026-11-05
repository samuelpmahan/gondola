import test from 'node:test';
import assert from 'node:assert/strict';
import { experiments, parameters, candidate } from '../registry.mjs';
import { initialMotion, motionEvent, cubicBezier, exactSpring } from '../motion.mjs';
import { makeVariant, parseVariant, replayMotion, firstDifference, appendMotionRecord } from '../journal.mjs';
import { createShelf } from '../variants.mjs';

test('registry contains six experiments and rejects unknown or unsafe parameters', () => {
  assert.equal(experiments.length, 6);
  assert.throws(() => parameters('spring', { stiffness: Infinity }));
  assert.throws(() => parameters('spring', { stiffness: -1 }));
  assert.throws(() => parameters('spring', { arbitrary: 3 }));
  assert.throws(() => parameters('unknown', {}));
  assert.equal(parameters('spring', {}).mass, 1);
});
test('seeded candidate generation is repeatable and remains inside each schema', () => {
  for (const e of experiments) for (let seed = 0; seed < 100; seed++) {
    assert.deepEqual(candidate(e.id, seed), candidate(e.id, seed));
    assert.deepEqual(parameters(e.id, candidate(e.id, seed)), candidate(e.id, seed));
  }
});
test('analytic critically damped spring matches a known solution', () => {
  const s = exactSpring({ x: 0, v: 0, target: 1 }, { stiffness: 100, damping: 20, mass: 1 }, .1);
  assert.ok(Math.abs(s.x - (1 - 2 / Math.E)) < 1e-12);
  assert.ok(Math.abs(s.v - 10 / Math.E) < 1e-12);
});
test('fixed-tick replay is deterministic and two integrators expose a real difference', () => {
  const params = parameters('spring', {});
  const events = [{ type: 'target', value: .85 }, { type: 'tick', steps: 30 }];
  const a = replayMotion('spring', params, events);
  const b = replayMotion('spring', params, events);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.state.x - a.state.referenceX) > 1e-6);
  let state = initialMotion('spring', params);
  for (const e of events) state = motionEvent('spring', params, state, e);
  assert.deepEqual(state, a.state);
});
test('bezier solves time rather than using x as the curve parameter', () => {
  assert.equal(cubicBezier(0, [.25, .1, .25, 1]), 0);
  assert.equal(cubicBezier(1, [.25, .1, .25, 1]), 1);
  assert.ok(cubicBezier(.5, [.25, .1, .25, 1]) > .79);
});
test('variant JSON round trip retains evidence and detects altered final state', () => {
  const p = parameters('spring', {}), events = [{ type: 'target', value: .8 }, { type: 'tick', steps: 40 }];
  const state = replayMotion('spring', p, events).state;
  const v = makeVariant({ name: 'Soft', experiment: 'spring', params: p, events, final: state });
  assert.deepEqual(parseVariant(JSON.stringify(v)), v);
  assert.equal(firstDifference(state, { ...state, x: -1 }).path, '$.x');
  assert.equal(firstDifference(state, structuredClone(state)), null);
});
test('import rejects excessive work, unknown events, invalid schemas and HTML names stay data', () => {
  const base = makeVariant({ name: '<img onerror=alert(1)>', experiment: 'spring', params: parameters('spring', {}), events: [], final: initialMotion('spring', {}) });
  assert.equal(parseVariant(JSON.stringify(base)).name, base.name);
  for (const events of [[{ type: 'tick', steps: 1e9 }], [{ type: 'eval', value: 'alert(1)' }], [{ type: 'target', value: NaN }]]) {
    assert.throws(() => parseVariant(JSON.stringify({ ...base, events })));
  }
  assert.throws(() => parseVariant(JSON.stringify({ ...base, schema: 'wrong' })));
  assert.throws(() => parseVariant(' '.repeat(1000001)));
});
test('shelf preserves variants across instances and reports storage failures without claiming a save', () => {
  const memory = new Map(), storage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  const v = makeVariant({ name: 'My spring', experiment: 'spring', params: parameters('spring', {}), events: [], final: initialMotion('spring', {}) });
  const a = createShelf(storage); assert.equal(a.save(v).ok, true);
  const b = createShelf(storage); assert.equal(b.list().length, 1);
  assert.equal(b.remove(v.id).ok, true); assert.equal(b.list().length, 0);
  const failed = createShelf({ getItem: () => null, setItem: () => { throw Error('quota'); } });
  assert.equal(failed.save(v).ok, false); assert.equal(failed.list().length, 0);
});
test('motion recording rejects the prospective tick count before coalescing and preserves a portable checkpoint', () => {
  const journal = [{ type: 'tick', steps: 1199 }];
  assert.throws(() => appendMotionRecord(journal, { type: 'tick', steps: 2 }, 143999), /limit/i);
  assert.equal(journal[0].steps, 1199);
  assert.equal(appendMotionRecord(journal, { type: 'tick', steps: 1 }, 143999), 144000);
  assert.equal(journal[0].steps, 1200);
  assert.throws(() => appendMotionRecord(journal, { type: 'tick', steps: 1 }, 144000), /limit/i);
  assert.equal(journal.length, 1);
});
test('variant creation refuses an export that its importer cannot accept, including UTF-8 byte size', () => {
  assert.throws(() => makeVariant({ name: 'Too large', experiment: 'spring', params: {}, events: [], final: { text: '🪁'.repeat(260000) } }), /1 MB/i);
});
