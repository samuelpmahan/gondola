import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const buildRoot = "/tmp/gondola-compiled-atomic";
const appDirs = [
  ["counter", "counter-b05e9eb0e4e6"],
  ["form", "form-a3fe6b48b000"],
  ["list", "list-f8359aa2866d"],
  ["effect", "effect-ff8449e8f5b2"],
];
const symbolIds = new Map();
let nextSymbolId = 1;

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function keyRecord(key) {
  if (typeof key !== "symbol") return { type: "string", value: key };
  if (!symbolIds.has(key)) symbolIds.set(key, `symbol-${nextSymbolId++}`);
  return {
    type: "symbol",
    identityWithinProbe: symbolIds.get(key),
    description: key.description ?? null,
    globalKey: Symbol.keyFor(key) ?? null,
    string: String(key),
  };
}

function descriptorRecord(descriptor) {
  return {
    enumerable: descriptor.enumerable,
    writable: "writable" in descriptor ? descriptor.writable : null,
    configurable: descriptor.configurable,
    accessor: "get" in descriptor || "set" in descriptor,
    valueType: "value" in descriptor ? typeof descriptor.value : null,
    valueFunctionSource: typeof descriptor.value === "function" ? Function.prototype.toString.call(descriptor.value) : null,
  };
}

function describeSlice(value, path) {
  if (value === null || value === undefined) return { path, representation: value === null ? "null" : "undefined" };
  if (Array.isArray(value)) {
    const keys = Reflect.ownKeys(value);
    return {
      path,
      representation: "native-array",
      length: value.length,
      ownKeys: keys.map(keyRecord),
      symbolProperties: keys.filter((key) => typeof key === "symbol").map((key) => ({
        key: keyRecord(key),
        descriptor: descriptorRecord(Object.getOwnPropertyDescriptor(value, key)),
      })),
    };
  }
  const keys = Reflect.ownKeys(value);
  const descriptors = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(value, key)]));
  const backingDescriptor = descriptors.get("backing");
  const backing = backingDescriptor && "value" in backingDescriptor ? backingDescriptor.value : null;
  const backingKeys = Array.isArray(backing) ? Reflect.ownKeys(backing) : [];
  const targetDescriptor = descriptors.get("target");
  const prototype = Object.getPrototypeOf(value);
  const prototypeConstructor = prototype && Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  return {
    path,
    representation: "GoScript-slice-wrapper",
    prototypeConstructorName: typeof prototypeConstructor === "function" ? prototypeConstructor.name : null,
    prototypeOwnKeys: prototype ? Reflect.ownKeys(prototype).map(keyRecord) : null,
    ownKeys: keys.map(keyRecord),
    ownFields: Object.fromEntries(keys.filter((key) => typeof key === "string").map((key) => {
      const descriptor = descriptors.get(key);
      return [key, {
        descriptor: descriptorRecord(descriptor),
        primitiveValue: descriptor && "value" in descriptor && (descriptor.value === null || ["string", "number", "boolean", "undefined", "bigint"].includes(typeof descriptor.value))
          ? String(descriptor.value)
          : null,
      }];
    })),
    targetDescriptorValueIsUndefined: !!targetDescriptor && "value" in targetDescriptor && targetDescriptor.value === undefined,
    backingIsNativeArray: Array.isArray(backing),
    backingLength: Array.isArray(backing) ? backing.length : null,
    backingOwnKeys: backingKeys.map(keyRecord),
    backingSymbolProperties: backingKeys.filter((key) => typeof key === "symbol").map((key) => ({
      key: keyRecord(key),
      descriptor: descriptorRecord(Object.getOwnPropertyDescriptor(backing, key)),
    })),
  };
}

function field(object, key) {
  const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function describeTree(tree, app, phase) {
  const nodes = [];
  const seen = new Set();
  function visit(node, path) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    const attrs = field(node, "Attrs");
    const handlers = field(node, "On");
    const kids = field(node, "Kids");
    nodes.push({
      path,
      attrs: describeSlice(attrs, `${app}.${phase}.${path}.Attrs`),
      handlers: describeSlice(handlers, `${app}.${phase}.${path}.On`),
    });
    const attrBacking = attrs && field(attrs, "backing");
    if (Array.isArray(attrBacking)) {
      const offset = field(attrs, "offset") ?? 0;
      const length = field(attrs, "length") ?? attrBacking.length;
      for (let index = offset; index < offset + length; index += 1) {
        const attr = Object.getOwnPropertyDescriptor(attrBacking, String(index))?.value;
        if (attr) nodes.at(-1).styles ??= [];
        if (attr) nodes.at(-1).styles.push(describeSlice(field(attr, "Style"), `${app}.${phase}.${path}.Attrs[${index}].Style`));
      }
    }
    if (Array.isArray(kids)) {
      for (let index = 0; index < kids.length; index += 1) {
        const child = Object.getOwnPropertyDescriptor(kids, String(index))?.value;
        visit(child, path === "" ? String(index) : `${path}/${index}`);
      }
    } else if (kids && Array.isArray(field(kids, "backing"))) {
      const backing = field(kids, "backing");
      const offset = field(kids, "offset") ?? 0;
      const length = field(kids, "length") ?? backing.length;
      for (let index = offset; index < offset + length; index += 1) {
        const child = Object.getOwnPropertyDescriptor(backing, String(index))?.value;
        visit(child, path === "" ? String(index) : `${path}/${index}`);
      }
    }
  }
  visit(tree, "");
  return nodes;
}

const manifestBytes = await readFile(`${buildRoot}/buildmanifest.json`);
const apps = [];
for (const [name, dir] of appDirs) {
  const modulePath = `${buildRoot}/apps/${dir}/gobi-compiled.mjs`;
  const moduleBytes = await readFile(modulePath);
  const { gobiCompiled } = await import(pathToFileURL(modulePath).href);
  const component = gobiCompiled.appIR.components[0];
  const Init = gobiCompiled.symbols[component.init];
  const Update = gobiCompiled.symbols[component.update];
  const View = gobiCompiled.symbols[component.view];
  const state = Init();
  const initialView = View(state);
  const phases = [{ name: "Init+View", view: describeTree(field(initialView, "Tree"), name, "init") }];
  if (name === "list") {
    const [addedState] = Update(state, { Name: "add", Arg: "" });
    const addedView = View(addedState);
    phases.push({ name: "Update(add)+View", view: describeTree(field(addedView, "Tree"), name, "after-add") });
  }
  apps.push({
    app: name,
    modulePath,
    moduleSha256: hash(moduleBytes),
    componentId: component.id,
    phases,
  });
}

console.log(JSON.stringify({
  schema: "xr-r2-react.goscript-slice-probe/v1",
  node: process.version,
  buildRoot,
  buildManifestSha256: hash(manifestBytes),
  goscriptModule: "github.com/s4wave/goscript v0.6.2",
  goscriptSliceSource: "/root/go/pkg/mod/github.com/s4wave/goscript@v0.6.2/gs/builtin/slice.ts",
  sourceSymbolDeclaration: "const spareZero = Symbol('goscript.spareZero')",
  sourceAssignment: "setSpareZero writes backing[spareZero] = zero only when length < backing.length",
  apps,
}, null, 2));
