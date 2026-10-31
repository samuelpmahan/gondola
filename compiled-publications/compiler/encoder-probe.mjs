import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const [backend, outputRootArg, nativeTraceArg] = process.argv.slice(2);
if (!backend || !outputRootArg || !nativeTraceArg) {
  throw new Error('usage: node encoder-probe.mjs <react|dom> <build-output-root> <native-trace.json>');
}
const outputRoot = resolve(outputRootArg);
const buildManifest = JSON.parse(await readFile(resolve(outputRoot, 'buildmanifest.json'), 'utf8'));
if (buildManifest.schema !== 'gobi.build-manifest/v1' || buildManifest.apps?.length !== 1) {
  throw new Error('expected one app in the existing GoScript CLI build manifest');
}
const manifestApp = buildManifest.apps[0];
if (manifestApp.backend !== backend) throw new Error(`manifest backend ${manifestApp.backend} != ${backend}`);
const compiledPath = resolve(outputRoot, manifestApp.module);
const encoderPath = resolve(outputRoot, manifestApp.encoder);
const appIRPath = resolve(outputRoot, manifestApp.appIR);
const [{ gobiCompiled }, { gobiEncodeState }, appIR] = await Promise.all([
  import(pathToFileURL(compiledPath)),
  import(pathToFileURL(encoderPath)),
  readFile(appIRPath, 'utf8').then(JSON.parse),
]);
if (JSON.stringify(canonical(gobiCompiled.appIR)) !== JSON.stringify(canonical(appIR))) {
  throw new Error('bundled compiled module AppIR differs from the manifest AppIR file');
}
const component = appIR.components?.[0];
if (!component || component.packagePath !== 'github.com/samuelpmahan/gondola/fixtures/compiled/publications') {
  throw new Error('compiled manifest AppIR does not contain the publications package');
}
const init = gobiCompiled.symbols[component.init];
const update = gobiCompiled.symbols[component.update];
if (typeof init !== 'function' || typeof update !== 'function') {
  throw new TypeError('compiled AppIR init/update role symbols did not resolve to functions');
}

const nativeTrace = JSON.parse(await readFile(resolve(nativeTraceArg), 'utf8'));
if (!Array.isArray(nativeTrace.steps) || !Object.hasOwn(nativeTrace, 'initialState')) {
  throw new TypeError('expected the frozen N1 native publications trace envelope with initialState and steps');
}

function field(value, name) {
  if (value?.kind !== 'struct' || !Array.isArray(value.fields)) throw new TypeError(`expected encoded struct when reading ${name}`);
  const entry = value.fields.find((candidate) => candidate.name === name);
  if (!entry) throw new TypeError(`encoded struct is missing ${name}`);
  return entry.value;
}

function floatFromBits(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-f]{16}$/.test(hex)) throw new TypeError(`invalid float64Bits ${hex}`);
  const bytes = Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16));
  return new DataView(bytes.buffer).getFloat64(0, false);
}

function valueToPlain(value) {
  switch (value.kind) {
    case 'bool': return value.bool;
    case 'string': return value.string;
    case 'int':
    case 'uint': {
      const integer = BigInt(value.integer);
      const number = Number(integer);
      if (!Number.isSafeInteger(number)) throw new RangeError(`integer ${value.integer} exceeds safe-number fixture bound`);
      return number;
    }
    case 'float64': return floatFromBits(value.float64Bits);
    case 'slice': return value.isNil ? null : value.items.map(valueToPlain);
    case 'array': return value.items.map(valueToPlain);
    case 'struct': return Object.fromEntries(value.fields.map(({ name, value: child }) => [name, valueToPlain(child)]));
    default: throw new TypeError(`unsupported encoded Value kind ${value.kind}`);
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
  }
  return false;
}

function assertSame(actual, expected, context) {
  if (!deepEqual(actual, expected)) {
    throw new Error(`${context} differs from native trace\ncompiled=${JSON.stringify(canonical(actual))}\nnative=${JSON.stringify(canonical(expected))}`);
  }
}

function actualSliceShape(state, fieldName, encodedValue) {
  const raw = state?.[fieldName];
  if (raw == null) {
    if (encodedValue.kind !== 'slice' || !encodedValue.isNil || encodedValue.items.length !== 0) {
      throw new Error(`${fieldName}: nil runtime slice disagrees with encoded slice`);
    }
    return { representation: 'nil', length: 0, isNil: true };
  }
  if (Array.isArray(raw)) {
    const ownKeys = Reflect.ownKeys(raw).map((key) => typeof key === 'symbol' ? `Symbol(${key.description})` : key);
    const length = Object.getOwnPropertyDescriptor(raw, 'length')?.value;
    if (!Number.isSafeInteger(length)) throw new Error(`${fieldName}: JavaScript array has no safe own length`);
    const holes = [];
    for (let i = 0; i < length; i += 1) if (!Object.getOwnPropertyDescriptor(raw, String(i))) holes.push(i);
    if (length !== encodedValue.items.length) throw new Error(`${fieldName}: actual array length != encoded item count`);
    return { representation: 'array', ownKeys, length, holes, isNil: encodedValue.isNil };
  }
  const props = Object.create(null);
  const descriptors = Object.create(null);
  for (const key of ['backing', 'offset', 'length', 'capacity', 'target']) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error(`${fieldName}: GoSlice.${key} must be an own data property`);
    props[key] = descriptor.value;
    descriptors[key] = {
      enumerable: descriptor.enumerable,
      writable: descriptor.writable,
      configurable: descriptor.configurable,
      valueType: typeof descriptor.value,
      isUndefined: descriptor.value === undefined,
    };
  }
  if (!Number.isSafeInteger(props.length) || props.length !== encodedValue.items.length) {
    throw new Error(`${fieldName}: GoSlice length != encoded item count`);
  }
  if (!Number.isSafeInteger(props.offset) || !Number.isSafeInteger(props.capacity) || props.capacity < props.length) {
    throw new Error(`${fieldName}: invalid GoSlice offset/capacity`);
  }
  const backingKeys = Reflect.ownKeys(props.backing);
  const holes = [];
  for (let i = props.offset + props.length; i < props.offset + props.capacity; i += 1) {
    if (!Object.getOwnPropertyDescriptor(props.backing, String(i))) holes.push(i);
  }
  const marker = backingKeys.find((key) => typeof key === 'symbol');
  const markerDescriptor = marker ? Object.getOwnPropertyDescriptor(props.backing, marker) : null;
  return {
    representation: 'goscript-slice',
    descriptors,
    offset: props.offset,
    length: props.length,
    capacity: props.capacity,
    targetIsUndefined: props.target === undefined,
    backingLength: Object.getOwnPropertyDescriptor(props.backing, 'length')?.value,
    backingOwnKeys: backingKeys.map((key) => typeof key === 'symbol' ? `Symbol(${key.description})` : key),
    capacityHoles: holes,
    spareZero: markerDescriptor ? {
      description: marker.description,
      enumerable: markerDescriptor.enumerable,
      writable: markerDescriptor.writable,
      configurable: markerDescriptor.configurable,
      valueType: typeof markerDescriptor.value,
    } : null,
    isNil: encodedValue.isNil,
  };
}

const expectedRootFields = ['Parent', 'Children', 'NextGeneration', 'Input', 'Publications', 'NextPublication', 'LastDecision'];
const expectedParentFields = ['Alive', 'Generation', 'RequestSeq', 'Pending', 'Token', 'Reply', 'PublishedKey', 'PublishedValue', 'Accepted', 'Rejected'];
const expectedInputFields = ['Step', 'Locked', 'Revision'];
const expectedChildFields = ['Key', 'Counter', 'Generation', 'RequestSeq', 'Pending', 'Token', 'Reply', 'LastAcceptedPublication'];
const expectedPublicationFields = ['ID', 'Key', 'ParentGeneration', 'ChildGeneration', 'InputRevision', 'Value'];

function assertFields(value, expected, label) {
  if (value?.kind !== 'struct' || !Array.isArray(value.fields)) throw new TypeError(`${label} did not encode as a struct`);
  const actual = value.fields.map((entry) => entry.name);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} fields ${actual.join(',')} != expected ${expected.join(',')}`);
}

function assertKind(value, kind, label) {
  if (value?.kind !== kind) throw new Error(`${label} encoded as ${value?.kind}, expected ${kind}`);
}

function assertShape(encoded) {
  assertFields(encoded, expectedRootFields, 'State');
  const parent = field(encoded, 'Parent');
  assertFields(parent, expectedParentFields, 'ParentState');
  assertKind(field(parent, 'Alive'), 'bool', 'Parent.Alive');
  assertKind(field(parent, 'Generation'), 'uint', 'Parent.Generation');
  assertKind(field(parent, 'RequestSeq'), 'uint', 'Parent.RequestSeq');
  assertKind(field(parent, 'Pending'), 'bool', 'Parent.Pending');
  assertKind(field(parent, 'Token'), 'string', 'Parent.Token');
  assertKind(field(parent, 'Reply'), 'string', 'Parent.Reply');
  assertKind(field(parent, 'PublishedValue'), 'float64', 'Parent.PublishedValue');
  assertKind(field(parent, 'PublishedKey'), 'string', 'Parent.PublishedKey');
  assertKind(field(parent, 'Accepted'), 'uint', 'Parent.Accepted');
  assertKind(field(parent, 'Rejected'), 'uint', 'Parent.Rejected');
  const input = field(encoded, 'Input');
  assertFields(input, expectedInputFields, 'ParentInput');
  assertKind(field(input, 'Step'), 'int', 'Input.Step');
  assertKind(field(input, 'Locked'), 'bool', 'Input.Locked');
  assertKind(field(input, 'Revision'), 'uint', 'Input.Revision');
  assertKind(field(encoded, 'NextGeneration'), 'uint', 'NextGeneration');
  assertKind(field(encoded, 'NextPublication'), 'uint', 'NextPublication');
  assertKind(field(encoded, 'LastDecision'), 'string', 'LastDecision');
  const childSlice = field(encoded, 'Children');
  assertKind(childSlice, 'slice', 'Children');
  for (const child of childSlice.items) {
    assertFields(child, expectedChildFields, 'ChildState');
    assertKind(field(child, 'Key'), 'string', 'ChildState.Key');
    assertKind(field(child, 'Generation'), 'uint', 'ChildState.Generation');
    assertKind(field(child, 'RequestSeq'), 'uint', 'ChildState.RequestSeq');
    assertKind(field(child, 'Pending'), 'bool', 'ChildState.Pending');
    assertKind(field(child, 'Token'), 'string', 'ChildState.Token');
    assertKind(field(child, 'Reply'), 'string', 'ChildState.Reply');
    assertKind(field(child, 'LastAcceptedPublication'), 'uint', 'ChildState.LastAcceptedPublication');
    const counter = field(child, 'Counter');
    assertFields(counter, ['Count'], 'Counter.State');
    assertKind(field(counter, 'Count'), 'float64', 'Counter.State.Count');
  }
  const publications = field(encoded, 'Publications');
  assertKind(publications, 'slice', 'Publications');
  for (const publication of publications.items) {
    assertFields(publication, expectedPublicationFields, 'Publication');
    for (const name of ['ID', 'ParentGeneration', 'ChildGeneration', 'InputRevision']) assertKind(field(publication, name), 'uint', `Publication.${name}`);
    assertKind(field(publication, 'Key'), 'string', 'Publication.Key');
    assertKind(field(publication, 'Value'), 'float64', 'Publication.Value');
  }
}

const snapshots = [];
let state = init();
function record(index, message, expectedState) {
  const encoded = gobiEncodeState(state, component.stateType);
  assertShape(encoded);
  const plainState = valueToPlain(encoded);
  assertSame(plainState, expectedState, `state checkpoint ${index}`);
  const childrenShape = actualSliceShape(state, 'Children', field(encoded, 'Children'));
  const publicationsShape = actualSliceShape(state, 'Publications', field(encoded, 'Publications'));
  snapshots.push({
    index,
    message,
    actualSlices: { Children: childrenShape, Publications: publicationsShape },
    encodedState: encoded,
    plainState,
  });
}
record(0, null, nativeTrace.initialState);
for (let index = 0; index < nativeTrace.steps.length; index += 1) {
  const step = nativeTrace.steps[index];
  if (!step.message || typeof step.message.name !== 'string' || typeof step.message.arg !== 'string') {
    throw new TypeError(`native step ${index} has no {Name, Arg} message`);
  }
  [state] = update(state, { Name: step.message.name, Arg: step.message.arg });
  record(index + 1, step.message, step.state);
}

process.stdout.write(`${JSON.stringify({
  schema: 'gobi.compiled-publications-encoder-probe/v1',
  backend,
  packagePath: component.packagePath,
  componentID: component.id,
  stateType: component.stateType,
  module: manifestApp.module,
  encoder: manifestApp.encoder,
  appIR: manifestApp.appIR,
  snapshots,
}, null, 2)}\n`);
