import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lowerView } from '../../../frontend/react/renderer.mjs';

const modulesRoot = '/tmp/gondola-compiled-atomic/apps';
const rowsOf = (x) => Object.getOwnPropertyDescriptor(x, 'value')?.value;
const own = (x, key) => Object.getOwnPropertyDescriptor(x, key)?.value;
const isSlice = (x) => x !== null && typeof x === 'object' &&
  ['backing', 'offset', 'length', 'capacity', 'target'].every((k) => Object.prototype.hasOwnProperty.call(x, k));
function slicesIn(root) {
  const found = [];
  const seen = new Set();
  function walk(value, path = '$') {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
    seen.add(value);
    if (isSlice(value)) {
      const backing = own(value, 'backing');
      const offset = own(value, 'offset');
      const length = own(value, 'length');
      const capacity = own(value, 'capacity');
      const ownKeys = Reflect.ownKeys(backing);
      const indexCount = ownKeys.filter((k) => typeof k === 'string' && /^(0|[1-9][0-9]*)$/.test(k)).length;
      const presentInVisible = ownKeys.filter((k) => typeof k === 'string' && /^(0|[1-9][0-9]*)$/.test(k) && +k >= offset && +k < offset + length).length;
      const presentInSpare = ownKeys.filter((k) => typeof k === 'string' && /^(0|[1-9][0-9]*)$/.test(k) && +k >= offset + length && +k < offset + capacity).length;
      const symbols = ownKeys.filter((k) => typeof k === 'symbol').map((key) => {
        const d = Object.getOwnPropertyDescriptor(backing, key);
        return { description: key.description, global: Symbol.keyFor(key) !== undefined, descriptor: { enumerable: d?.enumerable, writable: d?.writable, configurable: d?.configurable, valueType: typeof d?.value } };
      });
      found.push({ path, offset, length, capacity, backingLength: Object.getOwnPropertyDescriptor(backing, 'length')?.value, indexCount, presentInVisible, spareHoles: capacity - length - presentInSpare, symbols });
      for (let i = 0; i < length; i++) {
        const d = Object.getOwnPropertyDescriptor(backing, String(offset + i));
        if (d && 'value' in d) walk(d.value, `${path}.backing[${offset + i}]`);
      }
      return;
    }
    for (const key of Reflect.ownKeys(value)) {
      if (key === 'length' || typeof key === 'symbol') continue;
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d && 'value' in d) walk(d.value, `${path}.${String(key)}`);
    }
  }
  walk(root);
  return found;
}
function lower(v) {
  const result = lowerView(v, { dispatch() {}, onStaleAction() {}, isCurrent: () => true, refFor: () => null });
  return { resultType: typeof result, hasElement: Object.prototype.hasOwnProperty.call(result, 'element'), slices: slicesIn(v) };
}

const directories = (await readdir(modulesRoot, { withFileTypes: true })).filter((x) => x.isDirectory()).map((x) => x.name).sort();
const records = [];
let listCapture;
for (const directory of directories) {
  const modulePath = path.join(modulesRoot, directory, 'gobi-compiled.mjs');
  const { gobiCompiled } = await import(pathToFileURL(modulePath));
  const component = gobiCompiled.appIR.components[0];
  const symbols = gobiCompiled.symbols;
  const initFn = Object.getOwnPropertyDescriptor(symbols, component.init)?.value;
  const updateFn = Object.getOwnPropertyDescriptor(symbols, component.update)?.value;
  const viewFn = Object.getOwnPropertyDescriptor(symbols, component.view)?.value;
  let state = initFn();
  const rows = own(state, 'Rows');
  const record = { packagePath: component.packagePath, roles: { init: typeof initFn, update: typeof updateFn, view: typeof viewFn }, initialView: lower(viewFn(state)) };
  if (component.packagePath.endsWith('/list')) {
    const points = [];
    for (let add = 1; add <= 5; add++) {
      const updated = updateFn(state, { Name: 'add', Arg: '' });
      state = Array.isArray(updated) ? updated[0] : updated;
      const view = viewFn(state);
      const lowered = lower(view);
      const rowsSlice = own(state, 'Rows');
      const back = own(rowsSlice, 'backing');
      const indexes = Reflect.ownKeys(back).filter((k) => typeof k === 'string' && /^(0|[1-9][0-9]*)$/.test(k));
      const symbol = Reflect.ownKeys(back).find((k) => typeof k === 'symbol' && k.description === 'goscript.spareZero');
      const factory = symbol ? Object.getOwnPropertyDescriptor(back, symbol)?.value : undefined;
      points.push({ rows: own(rowsSlice, 'length'), rowsCapacity: own(rowsSlice, 'capacity'), rowsBackingLength: Object.getOwnPropertyDescriptor(back, 'length')?.value, backingIndexCount: indexes.length, spareHoles: own(rowsSlice, 'capacity') - own(rowsSlice, 'length') - indexes.filter((k) => +k >= own(rowsSlice, 'offset') + own(rowsSlice, 'length') && +k < own(rowsSlice, 'offset') + own(rowsSlice, 'capacity')).length, spareZero: symbol ? { nonGlobal: Symbol.keyFor(symbol) === undefined, descriptor: { enumerable: Object.getOwnPropertyDescriptor(back, symbol).enumerable, writable: Object.getOwnPropertyDescriptor(back, symbol).writable, configurable: Object.getOwnPropertyDescriptor(back, symbol).configurable, valueType: typeof factory }, called: false } : null, viewSliceStats: lowered.slices });
      if ([3, 5].includes(add)) listCapture = points;
    }
    record.listGrowth = points;
  }
  records.push(record);
}
console.log(JSON.stringify({ node: process.version, moduleCount: records.length, records, listRows3And5: listCapture }, null, 2));
