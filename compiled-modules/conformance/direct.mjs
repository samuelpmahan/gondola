import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { goSliceValues, recordGoNode, resolveDirectMessage } from "../../compiled-frontend/conformance/direct-js.mjs";
import { assertInputRecord, assertPublicationRecord, validateModulePair } from "../abi/validate.mjs";

const FIXTURE_SCHEMA = "gobi.compiled-modules-scenario/v1";
const DIRECT_SCHEMA = "gobi.compiled-modules-direct/v1";
const PARENT_ROLES = ["init", "update", "view", "output", "receive"];
const CHILD_ROLES = ["init", "update", "view", "input", "publication"];

function need(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function own(value, key) {
  return Object.hasOwn(value, key);
}

function messageJSON(message) {
  if (message === null || message === undefined) return null;
  return { name: message.name ?? message.Name, arg: message.arg ?? message.Arg ?? "" };
}

function goMessage(message) {
  return { Name: message.name ?? message.Name, Arg: message.arg ?? message.Arg ?? "" };
}

function readView(module, state, label) {
  const raw = module.compiled.symbols[module.component.view](state);
  need(raw !== null && typeof raw === "object" && !Array.isArray(raw), `${label} View returned a non-object`);
  const tree = own(raw, "Tree") ? raw.Tree : raw;
  const bindings = own(raw, "Bindings") ? (goSliceValues(raw.Bindings, `${label}.View.Bindings`) ?? []) : [];
  const normalizedBindings = bindings.map((binding, index) => ({
    path: binding.Path,
    event: binding.Event,
    message: binding.Message,
    source: binding.Source,
    index,
  }));
  return {
    raw,
    tree,
    bindings,
    record: {
      tree: recordGoNode(tree, `$.${label}.view.tree`),
      bindings: normalizedBindings.map(({ path, event, message, source }) => ({ path, event, message, source })),
    },
  };
}

function nodeAtPath(tree, path) {
  let node = tree;
  if (path === "") return node;
  for (const part of path.split("/")) {
    if (!/^(0|[1-9][0-9]*)$/.test(part)) throw new TypeError(`invalid action path ${JSON.stringify(path)}`);
    const index = Number(part);
    if (!Number.isSafeInteger(index)) throw new TypeError(`action path index is outside safe range: ${part}`);
    const kids = goSliceValues(node.Kids, `Node.Kids at ${path}`) ?? [];
    if (index >= kids.length) return null;
    node = kids[index];
  }
  return node;
}

function viewMessage(module, state, action, label) {
  const view = readView(module, state, label);
  const node = nodeAtPath(view.tree, action.path);
  const attrs = node ? (goSliceValues(node.Attrs, `${label}.Attrs`) ?? []) : [];
  const disabled = attrs.some((attribute) => attribute.Name === "disabled" && attribute.Flag === true);
  // resolveDirectMessage checks both Gobi On handlers and typed View.Bindings,
  // including a disabled flag at the requested node.
  return { view, disabled, resolved: resolveDirectMessage({ tree: view.tree, bindings: view.bindings }, action) };
}

function componentFor(module, label) {
  need(module && module.compiled?.schema === "gobi.compiled-module/v1", `${label} needs gobi.compiled-module/v1`);
  need(typeof module.encoder?.gobiEncodeState === "function", `${label} needs generated gobiEncodeState`);
  need(Array.isArray(module.compiled.appIR?.components), `${label} AppIR has no component table`);
  const component = module.componentId
    ? module.compiled.appIR.components.find((item) => item.id === module.componentId)
    : module.compiled.appIR.components[0];
  need(component, `${label} AppIR component is missing`);
  need(typeof module.compiled.symbols?.[component.init] === "function" &&
       typeof module.compiled.symbols?.[component.update] === "function" &&
       typeof module.compiled.symbols?.[component.view] === "function", `${label} Go role symbols are missing`);
  return {
    ...module,
    component,
    roles: Object.fromEntries(["init", "update", "view"].map((role) => [role, module.compiled.symbols[component[role]]])),
  };
}

function assertBridgeRoles(parent, child) {
  for (const [module, roles, label] of [[parent, PARENT_ROLES, "parent"], [child, CHILD_ROLES, "child"]]) {
    need(module.bridges && typeof module.bridges === "object", `${label} gobiModuleBridges is required`);
    for (const role of roles.slice(3)) {
      need(typeof module.bridges[role] === "function", `${label} gobiModuleBridges.${role} is missing`);
    }
  }
  need(parent.abi && child.abi, "module ABI descriptors are required");
  need(parent.artifactBytes && child.artifactBytes, "actual module artifact bytes are required for pair admission");
}

function encodeState(module, state, label) {
  return module.encoder.gobiEncodeState(state, module.component.stateType);
}

function snapshot(parent, child, parentState, childState, eventIndex, fields = {}) {
  const parentView = readView(parent, parentState, "parent");
  const childView = readView(child, childState, "child");
  return {
    stateIndex: eventIndex,
    parentState: encodeState(parent, parentState, "parent"),
    childState: encodeState(child, childState, "child"),
    parentView: parentView.record,
    childView: childView.record,
    ...fields,
  };
}

function eventAction(event) {
  if (event?.action && typeof event.action === "object") return event.action;
  if (typeof event?.path === "string" && typeof event?.event === "string") {
    return { path: event.path, event: event.event, value: typeof event.value === "string" ? event.value : "" };
  }
  return null;
}

/**
 * Replays separately compiled parent/child Go modules. State transitions and
 * bridge logic run only in generated Go roles. This host records and forwards
 * the frozen primitive-record ABI; it does not compute application values.
 */
export async function replayCompiledModulesDirect({ parent: parentInput, child: childInput, fixture, label = "direct" }) {
  if (fixture?.schema !== FIXTURE_SCHEMA || !Array.isArray(fixture.events)) {
    throw new TypeError(`fixture must be ${FIXTURE_SCHEMA} with events[]`);
  }
  const parent = componentFor(parentInput, "parent");
  const child = componentFor(childInput, "child");
  assertBridgeRoles(parent, child);
  await validateModulePair({
    parent: { descriptor: parent.abi, descriptorBytes: parent.descriptorBytes, appIR: parent.compiled.appIR, artifactBytes: parent.artifactBytes },
    child: { descriptor: child.abi, descriptorBytes: child.descriptorBytes, appIR: child.compiled.appIR, artifactBytes: child.artifactBytes },
  });

  const counts = { parentInit: 0, childInit: 0, parentUpdate: 0, childUpdate: 0,
    output: 0, input: 0, publication: 0, receive: 0 };
  const bridgeCalls = [];
  function recordRoleCall(call, fn, state, { input = null, publication = null } = {}) {
    const result = fn(state);
    bridgeCalls.push({ call, input: clone(input), publication: clone(publication) });
    return result;
  }
  function bridge(role, owner, fn, state, record = null) {
    counts[role] += 1;
    const result = record === null ? fn(state) : fn(state, record);
    const entry = { call: `${owner}.${role[0].toUpperCase()}${role.slice(1)}`, input: null, publication: null };
    if (role === "output") entry.input = clone(result);
    else if (role === "input") entry.input = clone(record);
    else if (role === "publication") entry.publication = clone(result);
    else if (role === "receive") entry.publication = clone(record);
    bridgeCalls.push(entry);
    return result;
  }
  function applyInput(childState, input) {
    const safe = assertInputRecord(input);
    return bridge("input", "child", child.bridges.input, childState, safe);
  }
  function publishToParent(parentState, childState) {
    const publication = assertPublicationRecord(bridge("publication", "child", child.bridges.publication, childState));
    const nextParent = bridge("receive", "parent", parent.bridges.receive, parentState, publication);
    return { parentState: nextParent, publication };
  }
  function sendOutput(parentState, childState) {
    const input = assertInputRecord(bridge("output", "parent", parent.bridges.output, parentState));
    return { childState: applyInput(childState, input), input };
  }
  function update(module, state, target, message) {
    const call = `${target}.Update`;
    const result = recordRoleCall(call, (current) => module.roles.update(current, goMessage(message)), state);
    if (!Array.isArray(result) || result.length !== 2) throw new TypeError(`${target} Update must return [state,effects]`);
    const effects = goSliceValues(result[1], `${target}.Update.effects`) ?? [];
    if (effects.length !== 0) throw new TypeError(`${target} effects are outside the effect-free module profile`);
    counts[`${target}Update`] += 1;
    return result[0];
  }

  counts.parentInit += 1;
  let parentState = recordRoleCall("parent.Init", parent.roles.init, undefined);
  counts.childInit += 1;
  let childState = recordRoleCall("child.Init", child.roles.init, undefined);
  const initOutput = assertInputRecord(bridge("output", "parent", parent.bridges.output, parentState));
  childState = applyInput(childState, initOutput);
  const initPublication = assertPublicationRecord(bridge("publication", "child", child.bridges.publication, childState));
  parentState = bridge("receive", "parent", parent.bridges.receive, parentState, initPublication);
  const checkpoints = [snapshot(parent, child, parentState, childState, 0, {
    sourceEventIndex: null,
    bridges: clone(bridgeCalls),
    dom: null,
  })];
  const eventRows = [];
  const stepRows = [];
  let snapshotIndex = 0;
  let lastViews = { parent: readView(parent, parentState, "parent"), child: readView(child, childState, "child") };

  for (let eventIndex = 0; eventIndex < fixture.events.length; eventIndex += 1) {
    const event = fixture.events[eventIndex];
    const bridgeStart = bridgeCalls.length;
    let target = event.target ?? null;
    let action = eventAction(event);
    let message = null;
    let dispatched = false;
    let suppressed = false;
    if (event.kind === "click" || event.kind === "disabled-action") {
      if (target !== "parent" && target !== "child") throw new TypeError(`event ${eventIndex} needs target parent or child`);
      const activeModule = target === "parent" ? parent : child;
      const activeState = target === "parent" ? parentState : childState;
      if (!action) throw new TypeError(`event ${eventIndex} needs action`);
      const resolved = viewMessage(activeModule, activeState, action, target);
      message = resolved.resolved ? { name: resolved.resolved.name, arg: resolved.resolved.arg } : null;
      suppressed = message === null;
      if (event.kind === "disabled-action" && (!resolved.disabled || !suppressed)) {
        throw new Error(`event ${eventIndex} expected an actual disabled control and suppressed dispatch`);
      }
      if (event.kind === "click" && suppressed && !resolved.disabled) {
        throw new Error(`event ${eventIndex} click resolved to no Go message and target was not disabled`);
      }
    } else if (event.kind === "go-message") {
      if (target !== "parent" && target !== "child") throw new TypeError(`event ${eventIndex} needs target parent or child`);
      message = messageJSON(event.message);
      if (!message || typeof message.name !== "string" || typeof message.arg !== "string") {
        throw new TypeError(`event ${eventIndex} has malformed Go message`);
      }
    } else if (event.kind === "renderer-swap" || event.kind === "stale-callback") {
      const callCountsBefore = { ...counts };
      eventRows.push({ eventIndex, kind: event.kind, target, action, message: null, dispatched: false,
        bridgeCalls: [], callCountsBefore, callCountsAfter: { ...counts }, event: clone(event) });
      continue;
    } else {
      throw new TypeError(`event ${eventIndex} has unsupported kind ${JSON.stringify(event.kind)}`);
    }

    const countsBefore = { ...counts };
    const priorBridgeCalls = bridgeCalls.length;
    if (message !== null) {
      const activeModule = target === "parent" ? parent : child;
      if (target === "parent") {
        parentState = update(parent, parentState, "parent", message);
        const transfer = sendOutput(parentState, childState);
        childState = transfer.childState;
        // Parent events publish no child value back to the parent.
      } else {
        childState = update(child, childState, "child", message);
        const published = publishToParent(parentState, childState);
        parentState = published.parentState;
      }
      dispatched = true;
      snapshotIndex += 1;
      lastViews = { parent: readView(parent, parentState, "parent"), child: readView(child, childState, "child") };
      checkpoints.push(snapshot(parent, child, parentState, childState, snapshotIndex, {
        sourceEventIndex: eventIndex,
        bridges: bridgeCalls.slice(priorBridgeCalls).map((record) => clone(record)),
        dom: null,
      }));
      const checkpoint = checkpoints.at(-1);
      stepRows.push({
        stepIndex: stepRows.length,
        eventIndex,
        kind: event.kind,
        target,
        message: clone(message),
        bridges: clone(checkpoint.bridges),
        parentState: clone(checkpoint.parentState),
        childState: clone(checkpoint.childState),
        parentView: clone(checkpoint.parentView),
        childView: clone(checkpoint.childView),
      });
    } else if (action) {
      const unchanged = { parent: encodeState(parent, parentState), child: encodeState(child, childState) };
      assertExactTraceValue(unchanged, { parent: encodeState(parent, parentState), child: encodeState(child, childState) }, `$.${label}.disabled[${eventIndex}]`);
    }
    eventRows.push({ eventIndex, kind: event.kind, target, action: clone(action), message: clone(message),
      dispatched, suppressed, bridgeCalls: bridgeCalls.slice(bridgeStart).map((record) => clone(record)),
      callCountsBefore: countsBefore, callCountsAfter: { ...counts }, event: clone(event) });
  }

  return {
    schema: DIRECT_SCHEMA,
    fixture: fixture.name ?? "compiled-modules",
    parent: { componentID: parent.component.id, packagePath: parent.component.packagePath },
    child: { componentID: child.component.id, packagePath: child.component.packagePath },
    eventCount: fixture.events.length,
    events: eventRows,
    initial: checkpoints[0],
    steps: stepRows,
    checkpoints,
    bridgeCalls,
    callCounts: counts,
    final: checkpoints.at(-1),
    renderViews: lastViews,
  };
}
