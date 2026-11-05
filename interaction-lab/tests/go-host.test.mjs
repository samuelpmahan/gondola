import test from 'node:test';
import assert from 'node:assert/strict';
import { mountGoExperiment, plainGo } from '../go-host.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createViewTools } from '../../compiled-frontend/frontend/shared/view.mjs';
import { booleanAttributes, eventNames } from '../../compiled-frontend/frontend/react/react-map.gen.mjs';
const viewTools = createViewTools({ eventNames, booleanAttributes });
function testContainer() { return { ownerDocument: { createElement: testContainer } }; }
function testRenderer({ container }) {
  let value;
  return { viewCapabilities: ['view.node', 'binding.value', 'binding.checked'],
    update(view, callbacks) { value = viewTools.normalizeAndValidate(view); container.dispatch = callbacks.dispatch; },
    viewRecord: () => ({ tree: viewTools.nodeRecord(value.view.Tree), bindings: value.bindings.map(viewTools.bindingRecord) }),
    domSnapshot: () => ({ normalization: 'outerHTML-v1', html: 'headless-state-test', controls: [] }),
    unmount() {},
  };
}
const edit = (text, row) => ({ type: 'action', action: { path: row ? '2/' + (row - 1) + '/0' : '0', event: 'input', value: text }, message: { Name: row ? 'edit/' + row : 'edit', Arg: text } });
async function withCompiled(run) {
  const root = fileURLToPath(new URL('../../', import.meta.url)), temp = await mkdtemp(join(tmpdir(), 'gondola-lab-test-'));
  try {
    execFileSync('tar', ['-xJf', join(root, 'compiled-frontend/evidence/compiled-artifacts.tar.xz'), '-C', temp, './compiled/apps/form-a3fe6b48b000', './compiled/apps/list-f8359aa2866d']);
    const compiled = {};
    for (const [id, folder] of [['form', 'form-a3fe6b48b000'], ['list', 'list-f8359aa2866d']]) {
      compiled[id] = { module: (await import(pathToFileURL(join(temp, 'compiled/apps', folder, 'gobi-compiled.mjs')))).gobiCompiled, encoder: await import(pathToFileURL(join(temp, 'compiled/apps', folder, 'encoder.mjs'))) };
    }
    await run(compiled);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
test('inspectable Go values preserve nil slices, rows and exact integers', () => {
  assert.equal(plainGo({ kind: 'slice', isNil: true, items: [] }), null);
  assert.deepEqual(plainGo({ kind: 'slice', isNil: false, items: [{ kind: 'struct', fields: [{ name: 'ID', value: { kind: 'uint', integer: '9007199254740991' } }] }] }), [{ ID: '9007199254740991' }]);
});
test('a semantically rejected replay leaves the original Go state and journal intact', async () => withCompiled(compiled => {
  const container = testContainer(), h = mountGoExperiment({ id: 'form', container, compiled, renderers: { dom: testRenderer, react: testRenderer }, auto: false });
  try {
    const original = edit('keep this'); container.dispatch(original.action, original.message);
    const before = h.snapshot(), journal = h.events();
    assert.throws(() => h.replay([edit('do not retain'), { type: 'reply', index: 0 }]), /No pending request/);
    assert.deepEqual(h.snapshot(), before);
    assert.deepEqual(h.events(), journal);
  } finally { h.destroy(); }
}));
test('a small journal cannot amplify into an unbounded retained Go trace', async () => withCompiled(compiled => {
  const container = testContainer(), h = mountGoExperiment({ id: 'list', container, compiled, renderers: { dom: testRenderer, react: testRenderer }, auto: false });
  try {
    const journal = Array.from({ length: 4 }, () => ({ type: 'action', action: { path: '0', event: 'click', value: '' }, message: { Name: 'add', Arg: '' } }));
    for (let row = 1; row <= 4; row++) journal.push(edit('x'.repeat(4000), row));
    for (let i = 0; i < 300; i++) journal.push({ type: 'action', action: { path: '2/0/1', event: 'change', value: i % 2 ? 'true' : 'false' }, message: { Name: 'check/1', Arg: i % 2 ? 'true' : 'false' } });
    const before = h.snapshot();
    assert.throws(() => h.replay(journal), /trace budget/i);
    assert.deepEqual(h.snapshot(), before);
    assert.equal(h.events().length, 0);
  } finally { h.destroy(); }
}));
