import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { assertExactTraceValue } from "./compare.mjs";
import { validateFixtureExpectations } from "./fixture-expectations.mjs";
import { assertStableProvenance, captureConformanceProvenance } from "./provenance.mjs";
import { validateHostScript, validateTrace } from "./trace.mjs";

const FIXTURE_SCHEMA = "gobi.fixture-script/v1";

function requireRecord(value, description) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${description} must be an object`);
}

function own(value, key) {
  return Object.hasOwn(value, key);
}

export function goSliceValues(value, path = "GoSlice") {
  if (value === null) return null;
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray(value.backing) && Number.isSafeInteger(value.offset) &&
      Number.isSafeInteger(value.length) && value.offset >= 0 && value.length >= 0 &&
      value.offset + value.length <= value.backing.length) {
    return value.backing.slice(value.offset, value.offset + value.length);
  }
  throw new TypeError(`${path} is not a probed goscript slice representation`);
}

const readSlice = goSliceValues;

function requiredField(value, key, path) {
  if (value === null || typeof value !== "object" || !own(value, key)) throw new TypeError(`${path}.${key} is missing`);
  return value[key];
}

export function recordGoNode(node, path = "$.view.tree") {
  requireRecord(node, path);
  const attrs = readSlice(requiredField(node, "Attrs", path), `${path}.Attrs`);
  const handlers = readSlice(requiredField(node, "On", path), `${path}.On`);
  const kids = readSlice(requiredField(node, "Kids", path), `${path}.Kids`);
  const outAttrs = attrs === null ? null : attrs.map((attr, index) => {
    const attrPath = `${path}.Attrs[${index}]`;
    const styles = readSlice(requiredField(attr, "Style", attrPath), `${attrPath}.Style`);
    return {
      name: requiredField(attr, "Name", attrPath),
      value: requiredField(attr, "Value", attrPath),
      flag: requiredField(attr, "Flag", attrPath),
      style: styles === null ? null : styles.map((style, styleIndex) => ({
        property: requiredField(style, "Property", `${attrPath}.Style[${styleIndex}]`),
        value: requiredField(style, "Value", `${attrPath}.Style[${styleIndex}]`),
      })),
    };
  });
  const outHandlers = handlers === null ? null : handlers.map((handler, index) => {
    const handlerPath = `${path}.On[${index}]`;
    return {
      event: requiredField(handler, "Event", handlerPath),
      message: requiredField(handler, "Message", handlerPath),
      arg: requiredField(handler, "Arg", handlerPath),
    };
  });
  return {
    kind: requiredField(node, "Kind", path),
    tag: requiredField(node, "Tag", path),
    key: requiredField(node, "Key", path),
    attrs: outAttrs,
    on: outHandlers,
    kids: kids === null ? null : kids.map((child, index) => recordGoNode(child, `${path}.Kids[${index}]`)),
    text: requiredField(node, "Text", path),
  };
}

function readView(raw) {
  requireRecord(raw, "View result");
  let tree = raw;
  let bindings = [];
  if (own(raw, "Tree") || own(raw, "Bindings")) {
    if (!own(raw, "Tree") || !own(raw, "Bindings")) throw new TypeError("View result must contain both Tree and Bindings");
    tree = raw.Tree;
    bindings = readSlice(raw.Bindings, "View.Bindings") ?? [];
  }
  const normalizedBindings = bindings.map((binding, index) => ({
    path: requiredField(binding, "Path", `View.Bindings[${index}]`),
    event: requiredField(binding, "Event", `View.Bindings[${index}]`),
    message: requiredField(binding, "Message", `View.Bindings[${index}]`),
    source: requiredField(binding, "Source", `View.Bindings[${index}]`),
  }));
  return { tree, bindings, record: { tree: recordGoNode(tree), bindings: normalizedBindings } };
}

function nodeAtPath(tree, path) {
  if (path === "") return tree;
  let node = tree;
  for (const part of path.split("/")) {
    if (!/^(0|[1-9][0-9]*)$/.test(part)) throw new TypeError(`invalid Action.path ${JSON.stringify(path)}`);
    const index = Number(part);
    if (!Number.isSafeInteger(index)) throw new TypeError(`Action.path index is outside safe range: ${part}`);
    const kids = readSlice(requiredField(node, "Kids", `Node at ${path}`), `Node.Kids at ${path}`) ?? [];
    if (index >= kids.length) return null;
    node = kids[index];
  }
  return node;
}

export function resolveDirectMessage(view, action) {
  const node = nodeAtPath(view.tree, action.path);
  if (node === null) return null;
  const attrs = readSlice(requiredField(node, "Attrs", `Node at ${action.path}`), "Node.Attrs") ?? [];
  if (attrs.some((attr) => attr.Name === "disabled" && attr.Flag === true)) return null;
  const candidates = [];
  for (const binding of view.bindings) {
    if (binding.Path === action.path && binding.Event === action.event) {
      candidates.push({ name: binding.Message, arg: action.value, source: "binding" });
    }
  }
  const handlers = readSlice(requiredField(node, "On", `Node at ${action.path}`), "Node.On") ?? [];
  for (const handler of handlers) {
    if (handler.Event === action.event) candidates.push({ name: handler.Message, arg: handler.Arg, source: "literal" });
  }
  if (candidates.length > 1) throw new TypeError(`multiple handlers target ${action.path}/${action.event}`);
  return candidates[0] ?? null;
}

function arrayOrEmpty(value, path) {
  return readSlice(value, path) ?? [];
}

function effectRecord(effect, path) {
  requireRecord(effect, path);
  return {
    kind: requiredField(effect, "Kind", path),
    name: requiredField(effect, "Name", path),
    arg: requiredField(effect, "Arg", path),
    reply: requiredField(effect, "Reply", path),
  };
}

function messageObject(message) {
  return { Name: message.name, Arg: message.arg };
}

/** Directly invokes generated Go Init/Update/View symbols; it never mounts N4 runtime. */
export function replayDirectJavaScript({ compiled, helpers, fixtureScript }) {
  requireRecord(compiled, "compiled module");
  if (compiled.schema !== "gobi.compiled-module/v1") throw new TypeError("unknown compiled-module schema");
  requireRecord(compiled.appIR, "compiled.appIR");
  requireRecord(compiled.symbols, "compiled.symbols");
  requireRecord(helpers, "generated value helpers");
  if (typeof helpers.gobiEncodeState !== "function") throw new TypeError("helpers.gobiEncodeState is required");
  requireRecord(fixtureScript, "fixture script");
  if (fixtureScript.schema !== FIXTURE_SCHEMA) throw new TypeError(`expected ${FIXTURE_SCHEMA}`);
  if (!Array.isArray(fixtureScript.actions)) throw new TypeError("fixture actions must be an array");
  const component = compiled.appIR.components.find((item) => item.packagePath === fixtureScript.packagePath);
  if (!component) throw new TypeError(`component ${fixtureScript.packagePath} is absent from AppIR`);
  const init = compiled.symbols[component.init];
  const update = compiled.symbols[component.update];
  const viewFn = compiled.symbols[component.view];
  if (typeof init !== "function" || typeof update !== "function" || typeof viewFn !== "function") {
    throw new TypeError(`compiled component roles are not callable for ${component.id}`);
  }

  let state = init();
  let nextDispatch = 0;
  let nextHostStep = 0;
  const pending = [];
  const ticks = [];
  const trace = { schema: "gobi.trace/v1", appId: component.id, ticks };

  function dispatchId() {
    nextDispatch += 1;
    return `dispatch-${String(nextDispatch).padStart(4, "0")}`;
  }

  function capture({ action = null, message = null, id = null, requestedEffects = [], completedEffects = [] }) {
    const rawView = readView(viewFn(state));
    const encodedState = helpers.gobiEncodeState(state, component.stateType);
    ticks.push({
      index: ticks.length,
      action,
      message,
      dispatchId: id,
      state: encodedState,
      requestedEffects,
      completedEffects,
      view: rawView.record,
      dom: null,
    });
    return rawView;
  }

  function updateAndCapture(message, action, completedEffects = []) {
    const id = dispatchId();
    const result = update(state, messageObject(message));
    if (!Array.isArray(result) || result.length !== 2) throw new TypeError("generated Update must return [state,effects]");
    state = result[0];
    const requestedEffects = arrayOrEmpty(result[1], "Update.effects").map((effect, index) => ({
      dispatchId: id,
      effectIndex: index,
      effect: effectRecord(effect, `Update.effects[${index}]`),
    }));
    pending.push(...requestedEffects);
    capture({ action, message, id, requestedEffects, completedEffects });
  }

  function drainScriptedReplies() {
    while (pending.length > 0 && nextHostStep < fixtureScript.hostScript.steps.length) {
      const request = pending.shift();
      const step = fixtureScript.hostScript.steps[nextHostStep++];
      assertExactTraceValue(step.request, request, `$.hostScript.steps[${nextHostStep - 1}].request`);
      if (step.completion !== null) {
        const deliveredMessage = { name: step.completion.name, arg: step.completion.arg };
        updateAndCapture(deliveredMessage, null, [{
          dispatchId: request.dispatchId,
          effectIndex: request.effectIndex,
          message: deliveredMessage,
        }]);
      }
    }
  }

  capture({});
  for (let actionIndex = 0; actionIndex < fixtureScript.actions.length; actionIndex += 1) {
    const inputAction = fixtureScript.actions[actionIndex];
    requireRecord(inputAction, `fixtureScript.actions[${actionIndex}]`);
    const action = { path: inputAction.path, event: inputAction.event, value: inputAction.value };
    const view = readView(viewFn(state));
    const delivered = resolveDirectMessage(view, action);
    if (delivered === null) capture({ action });
    else updateAndCapture({ name: delivered.name, arg: delivered.arg }, action);
    drainScriptedReplies();
  }
  if (pending.length !== 0 || nextHostStep !== fixtureScript.hostScript.steps.length) {
    throw new Error(`HostScript incomplete: consumed ${nextHostStep}/${fixtureScript.hostScript.steps.length} steps; ${pending.length} request(s) pending`);
  }
  validateTrace(trace, compiled.appIR);
  validateHostScript(fixtureScript.hostScript, trace);
  validateFixtureExpectations(trace, fixtureScript, compiled.appIR);
  return trace;
}

async function loadJSON(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function flag(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) throw new Error(`missing ${name} <path>`);
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const compiledPath = resolve(flag(args, "--compiled"));
  const helpersPath = resolve(flag(args, "--helpers"));
  const fixturePath = resolve(flag(args, "--fixture"));
  const outputPath = resolve(flag(args, "--output"));
  const provenanceBefore = await captureConformanceProvenance({
    compiledPath, helpersPath, fixturePath, command: process.argv.slice(0),
  });
  const [compiledModule, helperModule, fixtureScript] = await Promise.all([
    import(pathToFileURL(compiledPath).href),
    import(pathToFileURL(helpersPath).href),
    loadJSON(fixturePath),
  ]);
  const trace = replayDirectJavaScript({
    compiled: compiledModule.gobiCompiled,
    helpers: helperModule,
    fixtureScript,
  });
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(outputPath), { recursive: true });
  const serialized = `${JSON.stringify(trace, null, 2)}\n`;
  await writeFile(outputPath, serialized, "utf8");
  const provenanceAfter = await captureConformanceProvenance({
    compiledPath, helpersPath, fixturePath, command: process.argv.slice(0),
  });
  assertStableProvenance(provenanceBefore, provenanceAfter);
  const manifestIndex = args.indexOf("--manifest");
  let manifestPath = null;
  if (manifestIndex >= 0) {
    if (manifestIndex + 1 >= args.length) throw new Error("missing --manifest <path>");
    manifestPath = resolve(args[manifestIndex + 1]);
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify({
      schema: "gobi.direct-js-manifest/v1",
      appId: trace.appId,
      tracePath: outputPath,
      traceSha256: createHash("sha256").update(serialized).digest("hex"),
      traceBytes: Buffer.byteLength(serialized),
      provenance: provenanceBefore,
    }, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify({ appId: trace.appId, ticks: trace.ticks.length, output: outputPath, manifest: manifestPath })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
