import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const appDir = "/tmp/gondola-compiled-atomic/apps/list-f8359aa2866d";
const appPath = `${appDir}/gobi-compiled.mjs`;
const encoderPath = new URL("./fresh-list-encoder.mjs", import.meta.url).pathname;
const { gobiCompiled } = await import(pathToFileURL(appPath).href);
const { gobiEncodeState } = await import(pathToFileURL(encoderPath).href);
const appBytes = await readFile(appPath);
const encoderBytes = await readFile(encoderPath);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const component = gobiCompiled.appIR.components[0];
const Init = gobiCompiled.symbols[component.init];
const Update = gobiCompiled.symbols[component.update];

function descriptorValue(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function descriptorShape(object, key) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  const factory = descriptor?.value;
  return {
    enumerable: descriptor?.enumerable ?? null,
    writable: "writable" in (descriptor ?? {}) ? descriptor.writable : null,
    configurable: descriptor?.configurable ?? null,
    valueType: typeof factory,
    functionOwnKeys: typeof factory === "function" ? Reflect.ownKeys(factory).map((key) => {
      const item = Object.getOwnPropertyDescriptor(factory, key);
      return {
        key: String(key), value: Object.hasOwn(item, "value") ? item.value : null,
        enumerable: item.enumerable, writable: "writable" in item ? item.writable : null,
        configurable: item.configurable,
      };
    }) : [],
  };
}

function inspectRows(state) {
  const rows = descriptorValue(state, "Rows");
  if (rows === null) return { representation: "nil" };
  const backing = descriptorValue(rows, "backing");
  const offset = descriptorValue(rows, "offset");
  const length = descriptorValue(rows, "length");
  const capacity = descriptorValue(rows, "capacity");
  const visibleIDs = [];
  for (let i = offset; i < offset + length; i += 1) {
    const rowDescriptor = Object.getOwnPropertyDescriptor(backing, String(i));
    const row = rowDescriptor && Object.hasOwn(rowDescriptor, "value") ? rowDescriptor.value : undefined;
    const id = descriptorValue(row, "ID");
    visibleIDs.push(typeof id === "bigint" ? id.toString() : id);
  }
  const keys = Reflect.ownKeys(backing);
  return {
    representation: "GoSlice",
    offset,
    length,
    capacity,
    backingLength: backing.length,
    backingOwnKeys: keys.map((key) => typeof key === "symbol"
      ? { kind: "symbol", description: key.description ?? null, globalKey: Symbol.keyFor(key) ?? null, descriptor: descriptorShape(backing, key) }
      : { kind: "string", key }),
    visibleIDs,
  };
}

let state = Init();
const observations = [];
const failures = [];
for (let count = 0; count <= 6; count += 1) {
  const observation = { appendCount: count, rows: inspectRows(state) };
  try {
    const encoded = gobiEncodeState(state, component.stateType);
    const rows = encoded.fields.find((field) => field.name === "Rows").value;
    observation.encodeAccepted = true;
    observation.encodedRowsNil = rows.isNil;
    observation.encodedRowIDs = rows.items.map((item) => item.fields.find((field) => field.name === "ID").value.integer);
  } catch (error) {
    observation.encodeAccepted = false;
    observation.error = String(error);
    failures.push({ appendCount: count, stack: error.stack });
  }
  observations.push(observation);
  if (count < 6) [state] = Update(state, { Name: "add", Arg: "" });
}

const result = {
  schema: "r-abi-codec.actual-list/v1",
  node: process.version,
  goscript: "github.com/s4wave/goscript v0.6.2",
  appDir,
  component: component.packagePath,
  appModuleSha256: sha256(appBytes),
  regeneratedEncoderSha256: sha256(encoderBytes),
  observations,
  failures,
};
console.log(JSON.stringify(result, null, 2));
assert.deepEqual(failures, [], "fresh encoder must encode every actual list state through six appends");
for (let count = 0; count <= 6; count += 1) {
  assert.equal(observations[count].encodedRowIDs.length, count);
  assert.deepEqual(observations[count].encodedRowIDs, Array.from({ length: count }, (_, i) => String(i + 1)));
}
