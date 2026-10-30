import { pathToFileURL } from "node:url";

const appDir = "/tmp/gondola-compiled-atomic/apps/list-f8359aa2866d";
const appURL = pathToFileURL(`${appDir}/gobi-compiled.mjs`).href;
const encoderURL = pathToFileURL("/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r_abi_codec/evidence/old-encoder.mjs").href;
const { gobiCompiled } = await import(appURL);
const { gobiEncodeState } = await import(encoderURL);

const component = gobiCompiled.appIR.components[0];
const Init = gobiCompiled.symbols[component.init];
const Update = gobiCompiled.symbols[component.update];
const stateType = component.stateType;

function descriptorValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function ownKeys(value) {
  return Reflect.ownKeys(value).map((key) => {
    if (typeof key !== "symbol") return { kind: "string", key };
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const factory = descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
    const factoryDescriptors = typeof factory === "function"
      ? Reflect.ownKeys(factory).map((name) => {
          const d = Object.getOwnPropertyDescriptor(factory, name);
          return {
            key: String(name),
            enumerable: d.enumerable,
            writable: "writable" in d ? d.writable : null,
            configurable: d.configurable,
            valueType: Object.hasOwn(d, "value") ? typeof d.value : null,
            value: Object.hasOwn(d, "value") && ["string", "number", "boolean"].includes(typeof d.value) ? d.value : null,
          };
        })
      : [];
    return {
      kind: "symbol",
      description: key.description ?? null,
      globalKey: Symbol.keyFor(key) ?? null,
      descriptor: descriptor && {
        enumerable: descriptor.enumerable,
        writable: "writable" in descriptor ? descriptor.writable : null,
        configurable: descriptor.configurable,
        valueType: factory === undefined ? "undefined" : typeof factory,
      },
      factoryDescriptors,
    };
  });
}

function visibleRows(state) {
  const rows = descriptorValue(state, "Rows");
  if (rows === null) return { representation: "nil" };
  if (Array.isArray(rows)) return { representation: "array", length: rows.length, ownKeys: ownKeys(rows) };
  const backing = descriptorValue(rows, "backing");
  const offset = descriptorValue(rows, "offset");
  const length = descriptorValue(rows, "length");
  const capacity = descriptorValue(rows, "capacity");
  const rowIDs = [];
  for (let i = offset; i < offset + length; i += 1) {
    const row = Object.getOwnPropertyDescriptor(backing, String(i));
    const rowValue = row && Object.hasOwn(row, "value") ? row.value : undefined;
    const id = descriptorValue(rowValue, "ID");
    rowIDs.push(typeof id === "bigint" ? id.toString() : id);
  }
  return {
    representation: "GoSlice",
    offset,
    length,
    capacity,
    backingLength: backing.length,
    backingOwnKeys: ownKeys(backing),
    visibleRowIDs: rowIDs,
  };
}

let state = Init();
const observations = [];
let firstFailure = null;
for (let count = 0; count <= 6; count += 1) {
  const observation = { appendCount: count, rows: visibleRows(state) };
  try {
    const encoded = gobiEncodeState(state, stateType);
    observation.encodeAccepted = true;
    observation.encodedRowCount = encoded.fields.find((field) => field.name === "Rows").value.items.length;
  } catch (error) {
    observation.encodeAccepted = false;
    observation.error = String(error);
    firstFailure ??= { appendCount: count, stack: error.stack };
  }
  observations.push(observation);
  if (firstFailure) break;
  if (count < 6) [state] = Update(state, { Name: "add", Arg: "" });
}

console.log(JSON.stringify({
  probe: "actual GoScript list state -> generated gobiEncodeState before repair",
  node: process.version,
  appDir,
  module: "github.com/s4wave/goscript v0.6.2 emitted list fixture",
  stateType,
  observations,
  firstFailure,
}, null, 2));
if (firstFailure) process.exitCode = 1;
