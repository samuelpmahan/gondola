import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";
import { goSliceValues, recordGoNode, resolveDirectMessage } from "../../compiled-frontend/conformance/direct-js.mjs";

const PACKAGE_PATH = "github.com/samuelpmahan/gondola/fixtures/compiled/publications";
const SCENARIO_SCHEMA = "gobi.compiled-publications-scenario/v1";
const DIRECT_SCHEMA = "gobi.compiled-publications-direct/v1";
const TRACE_SCHEMA = "gobi.trace/v1";

function require(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function messageRecord(message) {
  return message === null ? null : { name: message.name, arg: message.arg };
}

function actionForEvent(event) {
  if (event?.action && typeof event.action === "object") return event.action;
  if (typeof event?.path === "string" && typeof event?.event === "string") {
    return { path: event.path, event: event.event, value: typeof event.value === "string" ? event.value : "" };
  }
  return null;
}

function readGoView(viewFunction, state) {
  const raw = viewFunction(state);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TypeError("compiled View must return a Go value object");
  }
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
  return {
    tree,
    bindings: rawBindings,
    record: {
      tree: recordGoNode(tree),
      bindings: bindings.map(({ path, event, message, source }) => ({ path, event, message, source })),
    },
  };
}

function decodeEffect(value) {
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

function normalizeEffects(encoded, dispatchId, effectSliceTypeId, effectTypeId) {
  if (!encoded || encoded.typeId !== effectSliceTypeId || encoded.kind !== "slice" ||
      typeof encoded.isNil !== "boolean" || !Array.isArray(encoded.items)) {
    throw new TypeError("generic effect encoder returned a malformed declared slice Value");
  }
  return encoded.items.map((effect, effectIndex) => {
    if (effect?.typeId !== effectTypeId) throw new TypeError(`encoded effect ${effectIndex} has an unexpected typeId`);
    return { dispatchId, effectIndex, effect: decodeEffect(effect) };
  });
}

function tokenForEffect(request) {
  return request.effect.arg;
}

function assertScenario(fixture) {
  if (fixture?.schema !== SCENARIO_SCHEMA) throw new TypeError(`expected ${SCENARIO_SCHEMA}`);
  assertExactTraceValue(PACKAGE_PATH, fixture.packagePath, "$.fixture.packagePath");
  assertExactTraceValue(PACKAGE_PATH, fixture.componentID, "$.fixture.componentID");
  if (!Array.isArray(fixture.events)) throw new TypeError("scenario events must be an array");
}

/** Directly replays emitted GoScript symbols. The host book-keeping below only
 * records requests/cancellation correlations; every state transition and view
 * remains owned by the compiled Go Update/View functions. */
export function replayPublicationsDirect({ compiled, helpers, fixture, label = "direct" }) {
  if (compiled?.schema !== "gobi.compiled-module/v1") throw new TypeError("compiled module must be gobi.compiled-module/v1");
  if (typeof helpers?.gobiEncodeState !== "function") throw new TypeError("generated gobiEncodeState helper is required");
  assertScenario(fixture);

  const components = compiled.appIR?.components;
  if (!Array.isArray(components)) throw new TypeError("compiled AppIR has no component table");
  const component = components.find((item) => item.id === fixture.componentID);
  if (!component || component.packagePath !== fixture.packagePath) {
    throw new Error("compiled component identity differs from the frozen fixture");
  }
  const symbols = compiled.symbols;
  if (!symbols || typeof symbols[component.init] !== "function" || typeof symbols[component.update] !== "function" ||
      typeof symbols[component.view] !== "function") {
    throw new Error("compiled publications Init/Update/View symbols are not callable");
  }

  const init = symbols[component.init];
  const update = symbols[component.update];
  const viewFunction = symbols[component.view];
  const updateIR = compiled.appIR.symbols?.find((symbol) => symbol.id === component.update);
  const results = updateIR?.signature?.results;
  if (!Array.isArray(results) || results.length !== 2 || results[0] !== component.stateType) {
    throw new Error("AppIR Update must return State and one declared effects slice");
  }
  const effectSliceType = compiled.appIR.types?.find((type) => type.id === results[1]);
  if (effectSliceType?.kind !== "slice" || effectSliceType.elemType !== "github.com/samuelpmahan/gondola/gobi.Effect") {
    throw new Error("AppIR Update effects result is not the declared gobi.Effect slice");
  }
  const effectType = compiled.appIR.types?.find((type) => type.id === effectSliceType.elemType);
  assertExactTraceValue([
    { name: "Kind", type: "string" },
    { name: "Name", type: "string" },
    { name: "Arg", type: "string" },
    { name: "Reply", type: "string" },
  ], effectType?.fields, "$.appIR.publications.effectFields");

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
    return effectRecords.push({ sequence: effectSequence, ...record }) && effectRecords.at(-1);
  }

  function capture({ action = null, message = null, dispatchId = null, requestedEffects = [], completedEffects = [] }) {
    const currentView = readGoView(viewFunction, state);
    const tick = {
      index: ticks.length,
      action: action === null ? null : clone(action),
      message: messageRecord(message),
      dispatchId,
      state: helpers.gobiEncodeState(state, component.stateType),
      requestedEffects: clone(requestedEffects),
      completedEffects: clone(completedEffects),
      view: currentView.record,
      dom: null,
    };
    ticks.push(tick);
    return currentView;
  }

  function recordEffects(requestedEffects) {
    for (const request of requestedEffects) {
      const token = tokenForEffect(request);
      if (request.effect.kind === "fixture.request") {
        require(!pending.has(token), `duplicate direct publication-host request token ${token}`);
        const record = appendEffectRecord({
          kind: "request", dispatchId: request.dispatchId, effectIndex: request.effectIndex,
          token, effect: clone(request.effect), outcome: "queued",
        });
        pending.set(token, {
          token,
          dispatchId: request.dispatchId,
          effectIndex: request.effectIndex,
          sequence: record.sequence,
          status: "pending",
          effect: clone(request.effect),
        });
      } else if (request.effect.kind === "lifecycle.cancel") {
        const target = pending.get(token);
        require(target?.status === "pending", `cancel effect does not target a pending direct host request: ${token}`);
        target.status = "cancelled";
        appendEffectRecord({
          kind: "cancel", dispatchId: request.dispatchId, effectIndex: request.effectIndex,
          token, target: { dispatchId: target.dispatchId, effectIndex: target.effectIndex }, outcome: "cancelled",
        });
      } else {
        throw new Error(`unsupported direct publications effect kind ${request.effect.kind}`);
      }
    }
  }

  function invoke(message, { eventIndex, event, action = null, completionToken = null, outcome = null }) {
    const before = ticks.length;
    const dispatchId = nextDispatchId();
    const result = update(state, { Name: message.name, Arg: message.arg });
    if (!Array.isArray(result) || result.length !== 2) throw new TypeError("compiled Update must return [state,effects]");
    state = result[0];
    const encodedEffects = helpers.gobiEncodeState(result[1], results[1]);
    assertExactTraceValue(results[1], encodedEffects?.typeId, `$.${label}.steps[${eventIndex}].effects.typeId`);
    const requestedEffects = normalizeEffects(encodedEffects, dispatchId, results[1], effectSliceType.elemType);
    let completedEffects = [];
    if (completionToken !== null) {
      const target = pending.get(completionToken);
      if (target?.status === "pending") {
        const delivery = appendEffectRecord({
          kind: "deliver", dispatchId: target.dispatchId, effectIndex: target.effectIndex,
          token: completionToken, outcome: "accepted", message: clone(message),
        });
        target.status = "delivered";
        target.deliverySequence = delivery.sequence;
        completedEffects = [{ dispatchId: target.dispatchId, effectIndex: target.effectIndex, message: clone(message) }];
        outcome = outcome ?? "accepted";
      } else {
        appendEffectRecord({ kind: "deliver", token: completionToken, outcome: "rejected-stale", message: clone(message) });
        outcome = outcome ?? "stale-no-op";
      }
    }
    const currentView = capture({ action, message, dispatchId, requestedEffects, completedEffects });
    recordEffects(requestedEffects);
    const tick = ticks.at(-1);
    const step = {
      eventIndex,
      event: clone(event),
      message: clone(message),
      action: action === null ? null : clone(action),
      dispatchId,
      requestedEffects,
      typedEffects: clone(encodedEffects),
      tickIndex: tick.index,
      stateIndex: tick.index,
      stepIndex: tick.index - 1,
      state: helpers.gobiEncodeState(state, component.stateType),
      view: currentView.record,
      traceTick: clone(tick),
      pending: [...pending.values()].filter((item) => item.status === "pending")
        .map(({ token, dispatchId: id, effectIndex }) => ({ token, dispatchId: id, effectIndex })),
      effectRecords: clone(effectRecords),
      outcome,
      tickCountBefore: before,
      tickCountAfter: ticks.length,
    };
    steps.push(step);
    return step;
  }

  capture({});
  for (let eventIndex = 0; eventIndex < fixture.events.length; eventIndex += 1) {
    const event = fixture.events[eventIndex];
    if (!event || typeof event !== "object" || typeof event.kind !== "string") {
      throw new TypeError(`scenario event ${eventIndex} must have a kind`);
    }
    if (event.kind === "renderer-swap" || event.kind === "disabled-action" || event.kind === "stale-callback") {
      const prior = ticks.at(-1);
      const action = actionForEvent(event);
      if (event.kind === "disabled-action") {
        if (action === null) throw new TypeError(`scenario disabled-action ${eventIndex} is missing path/event`);
        const currentView = readGoView(viewFunction, state);
        const resolved = resolveDirectMessage({ tree: currentView.tree, bindings: currentView.bindings }, action);
        require(resolved === null, `disabled direct publications action ${eventIndex} unexpectedly resolves to a Go Message`);
      }
      if (event.kind === "stale-callback") {
        if (!Number.isSafeInteger(event.sourceEvent) || event.sourceEvent < 0) {
          throw new TypeError(`scenario stale-callback ${eventIndex} requires a nonnegative sourceEvent`);
        }
        const source = fixture.events[event.sourceEvent];
        require(source?.kind === "click", `stale-callback ${eventIndex} sourceEvent is not a click`);
        if (event.message && source.message) {
          assertExactTraceValue(source.message, event.message, `$.fixture.events[${eventIndex}].sourceMessage`);
        }
      }
      if (event.kind === "renderer-swap" && event.from === "dom" && event.to === "react") {
        // This is a compatible projection change; application transitions are intentionally absent.
      } else if (event.kind === "renderer-swap" && event.expect !== "rejected") {
        throw new Error(`renderer candidate event ${eventIndex} must be compatible or explicitly rejected`);
      }
      steps.push({
        eventIndex,
        event: clone(event),
        message: null,
        action: action === null ? null : clone(action),
        dispatchId: null,
        requestedEffects: [],
        typedEffects: null,
        tickIndex: null,
        stateIndex: prior.index,
        stepIndex: null,
        state: helpers.gobiEncodeState(state, component.stateType),
        view: readGoView(viewFunction, state).record,
        traceTick: null,
        pending: [...pending.values()].filter((item) => item.status === "pending")
          .map(({ token, dispatchId: id, effectIndex }) => ({ token, dispatchId: id, effectIndex })),
        effectRecords: clone(effectRecords),
        outcome: event.expect ?? "state-preserved",
        tickCountBefore: ticks.length,
        tickCountAfter: ticks.length,
      });
      continue;
    }

    let message;
    let action = null;
    let completionToken = null;
    let outcome = event.expect ?? null;
    if (event.kind === "click") {
      action = actionForEvent(event);
      if (action === null || typeof action.path !== "string" || typeof action.event !== "string" ||
          typeof action.value !== "string") {
        throw new TypeError(`scenario click ${eventIndex} is missing an action path/event/value`);
      }
      const currentView = readGoView(viewFunction, state);
      const resolved = resolveDirectMessage({ tree: currentView.tree, bindings: currentView.bindings }, action);
      require(resolved !== null, `compiled View has no enabled message for event ${eventIndex} at ${action.path}`);
      message = { name: resolved.name, arg: resolved.arg };
      if (event.message) assertExactTraceValue(event.message, message, `$.fixture.events[${eventIndex}].message`);
    } else if (event.kind === "go-message") {
      if (!event.message || typeof event.message.name !== "string" || typeof event.message.arg !== "string") {
        throw new TypeError(`scenario go-message ${eventIndex} is missing name/arg`);
      }
      message = clone(event.message);
    } else if (event.kind === "effect-reply") {
      if (typeof event.token !== "string" || event.token.length === 0) {
        throw new TypeError(`scenario effect-reply ${eventIndex} is missing token`);
      }
      require(pending.get(event.token)?.status === "pending",
        `scenario effect-reply ${eventIndex} does not name a pending direct request: ${event.token}`);
      message = { name: "complete", arg: event.token };
      if (event.message) assertExactTraceValue(message, event.message, `$.fixture.events[${eventIndex}].message`);
      completionToken = event.token;
    } else {
      throw new Error(`unsupported publications scenario event kind ${event.kind}`);
    }
    invoke(message, { eventIndex, event, action, completionToken, outcome });
  }

  return {
    schema: DIRECT_SCHEMA,
    name: fixture.name,
    packagePath: fixture.packagePath,
    componentID: component.id,
    label,
    trace: { schema: TRACE_SCHEMA, appId: fixture.componentID, ticks },
    steps,
    effectRecords,
    pending: [...pending.values()].filter((item) => item.status === "pending")
      .map(({ token, dispatchId, effectIndex }) => ({ token, dispatchId, effectIndex })),
  };
}

export { readGoView };
