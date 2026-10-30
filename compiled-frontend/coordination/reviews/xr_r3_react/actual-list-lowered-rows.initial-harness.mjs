import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { lowerView } from '../../../frontend/react/renderer.mjs';

const modulePath = '/tmp/gondola-compiled-atomic/apps/list-f8359aa2866d/gobi-compiled.mjs';
const { gobiCompiled } = await import(pathToFileURL(modulePath));
const component = gobiCompiled.appIR.components[0];
const role = (name) => Object.getOwnPropertyDescriptor(gobiCompiled.symbols, component[name])?.value;
const init = role('init');
const update = role('update');
const view = role('view');
const own = (value, key) => Object.getOwnPropertyDescriptor(value, key)?.value;
const markerInfo = (backing) => {
  const marker = Reflect.ownKeys(backing).find((key) => typeof key === 'symbol' && key.description === 'goscript.spareZero');
  if (!marker) return null;
  const descriptor = Object.getOwnPropertyDescriptor(backing, marker);
  return {
    nonGlobal: Symbol.keyFor(marker) === undefined,
    enumerable: descriptor.enumerable,
    writable: descriptor.writable,
    configurable: descriptor.configurable,
    valueType: typeof descriptor.value,
    invoked: false,
  };
};
let state = init();
const results = [];
for (let rowCount = 1; rowCount <= 5; rowCount += 1) {
  state = update(state, { Name: 'add', Arg: '' })[0];
  const rows = own(state, 'Rows');
  const backing = own(rows, 'backing');
  const offset = own(rows, 'offset');
  const length = own(rows, 'length');
  const capacity = own(rows, 'capacity');
  const descriptors = Reflect.ownKeys(backing).filter((key) => typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key));
  const visiblePresent = descriptors.filter((key) => +key >= offset && +key < offset + length).length;
  const sparePresent = descriptors.filter((key) => +key >= offset + length && +key < offset + capacity).length;
  assert.equal(length, rowCount);
  assert.equal(visiblePresent, length, 'GoScript slice visible row window must be dense');
  const marker = markerInfo(backing);
  assert.equal(capacity - length - sparePresent > 0, rowCount === 3 || rowCount === 5, 'expected spare holes at 3 and 5 rows');
  if (capacity !== length) {
    assert.deepEqual(marker, { nonGlobal: true, enumerable: true, writable: true, configurable: true, valueType: 'function', invoked: false });
  }
  const lowered = lowerView(view(state), { dispatch() {}, onStaleAction() {}, isCurrent: () => true, refFor: () => null });
  const root = lowered.element;
  const rootChildren = own(own(root, 'props'), 'children');
  assert.equal(own(root, 'type'), 'div');
  assert.equal(own(root, 'key'), 'list');
  assert.equal(rootChildren.length, 3);
  const rowsElement = rootChildren[2];
  const renderedRows = own(own(rowsElement, 'props'), 'children');
  assert.equal(own(rowsElement, 'key'), 'rows');
  assert.equal(renderedRows.length, rowCount, 'lowered React rows must match Go state length');
  results.push({ rowCount, capacity, backingLength: Object.getOwnPropertyDescriptor(backing, 'length').value, visiblePresent, spareHoles: capacity - length - sparePresent, marker, renderedRows: renderedRows.length, lowered: true });
}
console.log(JSON.stringify({ node: process.version, packagePath: component.packagePath, rows: results }, null, 2));
