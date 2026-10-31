import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [backend, compiledArg, encoderArg] = process.argv.slice(2);
if (!backend || !compiledArg || !encoderArg) {
  throw new Error('usage: node encoder-probe.mjs <backend> <gobi-compiled.mjs> <encoder.mjs>');
}

const { gobiCompiled } = await import(pathToFileURL(resolve(compiledArg)));
const { gobiEncodeState } = await import(pathToFileURL(resolve(encoderArg)));
const appIR = gobiCompiled.appIR;
const component = appIR.components[0];
const init = gobiCompiled.symbols[component.init];
const update = gobiCompiled.symbols[component.update];
if (typeof init !== 'function' || typeof update !== 'function') {
  throw new TypeError('compiled AppIR role symbols did not resolve to functions');
}

function valueField(value, name) {
  if (value?.kind !== 'struct' || !Array.isArray(value.fields)) {
    throw new TypeError(`encoded value has no struct field list for ${name}`);
  }
  const field = value.fields.find((entry) => entry.name === name);
  if (!field) throw new TypeError(`encoded struct omits ${name}`);
  return field.value;
}

function scalar(value) {
  switch (value.kind) {
    case 'bool': return value.bool;
    case 'string': return value.string;
    case 'int':
    case 'uint': return value.integer;
    case 'float64': return value.float64Bits;
    default: throw new TypeError(`unexpected scalar kind ${value.kind}`);
  }
}

function summarize(encoded) {
  const parentValue = valueField(encoded, 'Parent');
  const childrenValue = valueField(encoded, 'Children');
  const parent = Object.fromEntries(['Alive', 'Generation', 'RequestSeq', 'Pending', 'Token', 'Reply']
    .map((name) => [name, scalar(valueField(parentValue, name))]));
  const children = childrenValue.items.map((child) => ({
    key: scalar(valueField(child, 'Key')),
    counterBits: scalar(valueField(valueField(child, 'Counter'), 'Count')),
    generation: scalar(valueField(child, 'Generation')),
    requestSeq: scalar(valueField(child, 'RequestSeq')),
    pending: scalar(valueField(child, 'Pending')),
    token: scalar(valueField(child, 'Token')),
    reply: scalar(valueField(child, 'Reply')),
  }));
  return {
    parent,
    children,
    nextGeneration: scalar(valueField(encoded, 'NextGeneration')),
    childrenIsNil: childrenValue.isNil,
  };
}

function actualChildrenSlice(state) {
  const slice = state.Children;
  const wrapperKeys = Reflect.ownKeys(slice).map((key) => String(key));
  if (Array.isArray(slice)) {
    const length = Object.getOwnPropertyDescriptor(slice, 'length')?.value;
    if (!Number.isSafeInteger(length)) throw new TypeError('actual Children array has no safe own length');
    const holes = [];
    for (let index = 0; index < length; index += 1) {
      if (!Object.getOwnPropertyDescriptor(slice, String(index))) holes.push(index);
    }
    return {
      representation: 'array',
      wrapperKeys,
      length,
      capacity: length,
      arrayHoles: holes,
      backingOwnKeys: wrapperKeys,
      spareZero: null,
    };
  }
  const properties = Object.create(null);
  const wrapperProperties = Object.create(null);
  for (const key of ['backing', 'offset', 'length', 'capacity', 'target']) {
    const descriptor = Object.getOwnPropertyDescriptor(slice, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`actual Children GoSlice.${key} is not an own data property`);
    }
    properties[key] = descriptor.value;
    wrapperProperties[key] = {
      enumerable: descriptor.enumerable,
      writable: descriptor.writable,
      configurable: descriptor.configurable,
      valueType: typeof descriptor.value,
      value: descriptor.value === undefined
        ? '<undefined>'
        : descriptor.value === null || typeof descriptor.value !== 'object'
          ? descriptor.value
          : '<object>',
    };
  }
  const backing = properties.backing;
  const backingKeys = Reflect.ownKeys(backing);
  const symbol = backingKeys.find((key) => typeof key === 'symbol') ?? null;
  const markerDescriptor = symbol ? Object.getOwnPropertyDescriptor(backing, symbol) : null;
  const markerValue = markerDescriptor && Object.hasOwn(markerDescriptor, 'value') ? markerDescriptor.value : null;
  const functionProperties = Object.create(null);
  if (typeof markerValue === 'function') {
    for (const key of ['length', 'name']) {
      const descriptor = Object.getOwnPropertyDescriptor(markerValue, key);
      functionProperties[key] = descriptor ? {
        value: descriptor.value,
        enumerable: descriptor.enumerable,
        writable: descriptor.writable,
        configurable: descriptor.configurable,
      } : null;
    }
  }
  const holes = [];
  for (let index = properties.offset + properties.length; index < properties.offset + properties.capacity; index += 1) {
    if (!Object.getOwnPropertyDescriptor(backing, String(index))) holes.push(index);
  }
  return {
    representation: 'goscript-slice',
    wrapperKeys,
    wrapperProperties,
    offset: properties.offset,
    length: properties.length,
    capacity: properties.capacity,
    targetIsUndefined: properties.target === undefined,
    backingLength: Object.getOwnPropertyDescriptor(backing, 'length')?.value,
    backingOwnKeys: backingKeys.map((key) => typeof key === 'symbol' ? `Symbol(${key.description})` : key),
    backingCapacityHoles: holes,
    spareZero: symbol ? {
      description: symbol.description,
      globalKey: Symbol.keyFor(symbol) ?? null,
      enumerable: markerDescriptor.enumerable,
      writable: markerDescriptor.writable,
      configurable: markerDescriptor.configurable,
      valueType: typeof markerValue,
      functionOwnKeys: typeof markerValue === 'function' ? Reflect.ownKeys(markerValue).map(String) : [],
      functionProperties,
    } : null,
  };
}

const snapshots = [];
let state = init();
function record(name, arg) {
  const encoded = gobiEncodeState(state, component.stateType);
  const slice = actualChildrenSlice(state);
  if (slice.length !== summarize(encoded).children.length) {
    throw new Error(`${name} encoded child count does not match actual GoSlice length`);
  }
  snapshots.push({
    message: { Name: name, Arg: arg },
    summary: summarize(encoded),
    actualChildrenSlice: slice,
    encodedState: encoded,
  });
}

record('Init', '');
for (const [name, arg] of [
  ['child.add', 'ash'],
  ['child.add', 'pine'],
  ['child.add', 'birch'],
  ['child.request', 'oak'],
  ['children.swap', 'oak:birch'],
  ['complete', 'child:oak:g2:r1'],
  ['child.remove', 'elm'],
  ['child.add', 'elm'],
  ['child.request', 'pine'],
  ['parent.request', ''],
  ['children.clear', ''],
  ['parent.remove', ''],
  ['parent.remount', ''],
]) {
  [state] = update(state, { Name: name, Arg: arg });
  record(name, arg);
}

process.stdout.write(`${JSON.stringify({
  schema: 'gobi.compiled-children-encoder-probe/v1',
  backend,
  appPackage: component.packagePath,
  stateType: component.stateType,
  snapshots,
}, null, 2)}\n`);
