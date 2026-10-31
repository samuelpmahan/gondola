import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { goSliceValues, recordGoNode, resolveDirectMessage } from "../../compiled-frontend/conformance/direct-js.mjs";
import {
  LIFECYCLE_COMPONENT_ID,
  LIFECYCLE_PACKAGE_PATH,
  lifecycleEventsForFixture,
} from "../browser/lifecycle-oracle.mjs";

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function messageRecord(message) {
  return message === null ? null : { name: message.name, arg: message.arg };
}

function readGoView(viewFunction, state) {
  const raw = viewFunction(state);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("compiled View must return a Go value object");
  const tree = Object.hasOwn(raw, "Tree") ? raw.Tree : raw;
  const rawBindings = Object.hasOwn(raw, "Bindings") ? (goSliceValues(raw.Bindings, "View.Bindings") ?? []) : [];
  const bindings = rawBindings.map((binding, index) => ({
    path: binding.Path,
    event: binding.Event,
    message: binding.Message,
    source: binding.Source,
    raw: binding,
    index,
  }));
  const record = {
    tree: recordGoNode(tree),
    bindings: bindings.map(({ path, event, message, source }) => ({ path, event, message, source })),
  };
  return { tree, bindings: rawBindings, record };
}

function decodeEffectValue(value) {
  if (!value || value.kind !== "struct" || !Array.isArray(value.fields)) {
    throw new TypeError("generic effect encoder returned a malformed gobi.Effect Value");
  }
  const names = ["Kind", "Name", "Arg", "Reply"];
  if (value.fields.length !== names.length || value.fields.some((field, index) => field.name !== names[index])) {
    throw new TypeError("encoded gobi.Effect field order differs from the declared type");
  }
  const result = {};
  for (let index = 0; index < names.length; index += 1) {
    const field = value.fields[index];
    if (field.value?.typeId !== "string" || field.value.kind !== "string" || typeof field.value.string !== "string") {
      throw new TypeError(`encoded gobi.Effect.${names[index]} is not a typed string Value`);
    }
    result[names[index].toLowerCase()] = field.value.string;
  }
  return result;
}

function normalizeEffects(typedEffects, dispatchId, effectSliceTypeID, effectTypeID) {
  if (!typedEffects || typedEffects.typeId !== effectSliceTypeID || typedEffects.kind !== "slice" ||
      typeof typedEffects.isNil !== "boolean" || !Array.isArray(typedEffects.items)) {
    throw new TypeError("generic effect encoder returned a malformed declared slice Value");
  }
  return typedEffects.items.map((effect, effectIndex) => {
    if (effect?.typeId !== effectTypeID) throw new TypeError(`encoded effect ${effectIndex} has an unexpected typeId`);
    return {
    dispatchId,
    effectIndex,
      effect: decodeEffectValue(effect),
    };
  });
}

function effectToken(effect) {
  return effect.effect.arg;
}

/**
 * Replay the fixture by directly calling emitted Init/Update/View roles.
 * This is a host trace driver only: all application transitions and effects
 * come from the compiled Go symbols.
 */
export function replayLifecycleDirect({ compiled, helpers, fixture }) {
  if (compiled?.schema !== "gobi.compiled-module/v1") throw new TypeError("compiled module must be gobi.compiled-module/v1");
  if (typeof helpers?.gobiEncodeState !== "function") throw new TypeError("generated gobiEncodeState helper is required");
  if (fixture?.schema !== "gobi.compiled-lifecycle-fixture/v1") throw new TypeError("unsupported lifecycle fixture schema");
  assertExactTraceValue(lifecycleEventsForFixture(), fixture.events, "$.fixture.events");
  assertExactTraceValue(LIFECYCLE_PACKAGE_PATH, fixture.packagePath, "$.fixture.packagePath");
  assertExactTraceValue(LIFECYCLE_COMPONENT_ID, fixture.componentID, "$.fixture.componentID");

  const components = compiled.appIR?.components;
  if (!Array.isArray(components)) throw new TypeError("compiled AppIR has no component table");
  const component = components.find((item) => item.id === fixture.componentID);
  if (!component || component.packagePath !== fixture.packagePath) throw new Error("compiled component identity differs from the frozen fixture");
  for (const capability of ["view.node", "effect.request-reply"]) {
    require(component.capabilities?.includes(capability), `compiled AppIR lacks required capability ${capability}`);
  }
  const symbols = compiled.symbols;
  if (!symbols || typeof symbols[component.init] !== "function" || typeof symbols[component.update] !== "function" ||
      typeof symbols[component.view] !== "function") throw new Error("compiled lifecycle Init/Update/View symbols are not callable");

  const init = symbols[component.init];
  const update = symbols[component.update];
  const viewFunction = symbols[component.view];
  const updateSymbol = compiled.appIR.symbols?.find((item) => item.id === component.update);
  const updateResults = updateSymbol?.signature?.results;
  if (!Array.isArray(updateResults) || updateResults.length !== 2 || updateResults[0] !== component.stateType) {
    throw new Error("AppIR Update signature must return State and one declared effects slice");
  }
  const effectSliceType = compiled.appIR.types?.find((item) => item.id === updateResults[1]);
  if (effectSliceType?.kind !== "slice" || effectSliceType.elemType !== "github.com/samuelpmahan/gondola/gobi.Effect") {
    throw new Error("AppIR Update effects result is not the declared gobi.Effect slice");
  }
  const effectType = compiled.appIR.types?.find((item) => item.id === effectSliceType.elemType);
  assertExactTraceValue([
    { name: "Kind", type: "string" },
    { name: "Name", type: "string" },
    { name: "Arg", type: "string" },
    { name: "Reply", type: "string" },
  ], effectType?.fields, "$.appIR.lifecycle.effectFields");
  let state = init();
  let dispatchSequence = 0;
  let effectSequence = 0;
  const pending = new Map();
  const effectRecords = [];
  const ticks = [];
  const steps = [];

  function nextDispatchId() {
    dispatchSequence += 1;
    return `dispatch-${String(dispatchSequence).padStart(4, "0")}`;
  }

  function appendEffectRecord(record) {
    effectSequence += 1;
    const stamped = { sequence: effectSequence, ...record };
    effectRecords.push(stamped);
    return stamped;
  }

  function emitEffects(requestedEffects) {
    for (const request of requestedEffects) {
      const token = effectToken(request);
      if (request.effect.kind === "fixture.request") {
        require(!pending.has(token), `duplicate direct lifecycle request ${token}`);
        const record = appendEffectRecord({
          kind: "request", dispatchId: request.dispatchId, effectIndex: request.effectIndex,
          token, outcome: "queued",
        });
        pending.set(token, { token, dispatchId: request.dispatchId, effectIndex: request.effectIndex,
          status: "pending", sequence: record.sequence });
      } else if (request.effect.kind === "lifecycle.cancel") {
        const target = pending.get(token);
        require(target?.status === "pending", `cancel effect does not target a pending direct request: ${token}`);
        target.status = "cancelled";
        appendEffectRecord({
          kind: "cancel", dispatchId: request.dispatchId, effectIndex: request.effectIndex,
          token, target: { dispatchId: target.dispatchId, effectIndex: target.effectIndex }, outcome: "cancelled",
        });
      } else {
        throw new Error(`unsupported direct lifecycle effect kind ${request.effect.kind}`);
      }
    }
  }

  function capture({ action = null, message = null, dispatchId = null, requestedEffects = [], completedEffects = [] }) {
    const currentView = readGoView(viewFunction, state);
    const tick = {
      index: ticks.length,
      action,
      message: messageRecord(message),
      dispatchId,
      state: helpers.gobiEncodeState(state, component.stateType),
      requestedEffects,
      completedEffects,
      view: currentView.record,
      dom: null,
    };
    ticks.push(tick);
    return currentView;
  }

  function invokeUpdate(message, action = null, completion = null) {
    const dispatchId = nextDispatchId();
    const result = update(state, { Name: message.name, Arg: message.arg });
    if (!Array.isArray(result) || result.length !== 2) throw new TypeError("compiled Update must return [state,effects]");
    state = result[0];
    const typedEffects = helpers.gobiEncodeState(result[1], updateResults[1]);
    assertExactTraceValue(updateResults[1], typedEffects?.typeId, "$.direct.effects.typeId");
    const requestedEffects = normalizeEffects(typedEffects, dispatchId, updateResults[1], effectSliceType.elemType);
    const completedEffects = completion === null ? [] : [{
      dispatchId: completion.dispatchId,
      effectIndex: completion.effectIndex,
      message: { ...message },
    }];
    const currentView = capture({ action, message, dispatchId, requestedEffects, completedEffects });
    emitEffects(requestedEffects);
    return { dispatchId, requestedEffects, typedEffects, view: currentView };
  }

  capture({});
  for (let eventIndex = 0; eventIndex < fixture.events.length; eventIndex += 1) {
    const event = fixture.events[eventIndex];
    const tickBefore = ticks.length - 1;
    let actualMessage = null;
    let requestedEffects = [];
    let typedEffects = null;
    let action = null;
    let completion = null;
    let outcome = event.expect ?? null;

    if (event.kind === "renderer-swap") {
      require(event.from === "dom" && event.to === "react" && event.target === "root", "unexpected frozen renderer-swap event");
    } else if (event.kind === "click") {
      action = { path: event.path, event: event.event, value: event.value };
      const currentView = readGoView(viewFunction, state);
      const delivered = resolveDirectMessage({ tree: currentView.tree, bindings: currentView.bindings }, action);
      require(delivered !== null, `compiled View has no enabled message at click path ${event.path}`);
      actualMessage = { name: delivered.name, arg: delivered.arg };
      assertExactTraceValue(event.message, actualMessage, `$.fixture.events[${eventIndex}].resolvedMessage`);
    } else if (event.kind === "go-message" || event.kind === "effect-reply") {
      actualMessage = { name: event.message.name, arg: event.message.arg };
      if (event.kind === "effect-reply") {
        const target = pending.get(event.token);
        require(target?.status === "pending", `effect reply does not target a pending direct request: ${event.token}`);
        completion = { dispatchId: target.dispatchId, effectIndex: target.effectIndex };
        const delivery = appendEffectRecord({
          kind: "deliver", dispatchId: target.dispatchId, effectIndex: target.effectIndex,
          token: event.token, outcome: "accepted", message: { ...actualMessage },
        });
        target.status = "delivered";
        target.deliverySequence = delivery.sequence;
      }
    } else {
      throw new Error(`unsupported lifecycle fixture event kind ${event.kind}`);
    }

    if (actualMessage !== null) {
      const result = invokeUpdate(actualMessage, action, completion);
      requestedEffects = result.requestedEffects;
      typedEffects = result.typedEffects;
      const expected = fixture.events[eventIndex].message;
      assertExactTraceValue(expected, actualMessage, `$.fixture.events[${eventIndex}].message`);
    }

    const tickIndex = ticks.length - 1;
    const step = {
      eventIndex,
      event: structuredClone(event),
      message: actualMessage,
      requestedEffects,
      typedEffects: clone(typedEffects),
      tickBefore,
      tickAfter: tickIndex,
      traceTick: actualMessage === null ? null : structuredClone(ticks.at(-1)),
      state: helpers.gobiEncodeState(state, component.stateType),
      view: readGoView(viewFunction, state).record,
      effectRecords: structuredClone(effectRecords),
      pending: [...pending.values()].filter((item) => item.status === "pending").map(({ token, dispatchId, effectIndex }) => ({ token, dispatchId, effectIndex })),
      outcome,
    };
    steps.push(step);
  }

  return {
    schema: "gobi.compiled-lifecycle-direct/v1",
    name: fixture.name,
    packagePath: fixture.packagePath,
    componentID: component.id,
    appId: fixture.componentID,
    trace: { schema: "gobi.trace/v1", appId: fixture.componentID, ticks },
    steps,
    effectRecords,
    pending: [...pending.values()].filter((item) => item.status === "pending").map(({ token, dispatchId, effectIndex }) => ({ token, dispatchId, effectIndex })),
  };
}
