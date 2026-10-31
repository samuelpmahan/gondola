import { mountCompiledApp } from "../../compiled-frontend/frontend/runtime/runtime.mjs";

const EFFECT_FIELDS = ["kind", "name", "arg", "reply"];
const TOKEN_PATTERN = /^(parent|child|grandchild|sibling):g([1-9][0-9]*):r([1-9][0-9]*)$/;

function cloneRecord(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneRecord);
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = cloneRecord(child);
  return result;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== "string")) {
    throw new TypeError(`${label} has unsupported symbol properties`);
  }
  const sortedActual = actual.slice().sort();
  const sortedExpected = expected.slice().sort();
  if (sortedActual.length !== sortedExpected.length ||
      sortedActual.some((key, index) => key !== sortedExpected[index])) {
    throw new TypeError(`${label} must contain exactly: ${sortedExpected.join(", ")}`);
  }
  return value;
}

function validateToken(value, label = "lifecycle token") {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const match = TOKEN_PATTERN.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[2])) || !Number.isSafeInteger(Number(match[3]))) {
    throw new TypeError(`${label} has an invalid lifecycle token`);
  }
  return value;
}

function validateCorrelation(value, label = "effect correlation") {
  exactKeys(value, ["dispatchId", "effectIndex"], label);
  if (typeof value.dispatchId !== "string" || value.dispatchId.length === 0) {
    throw new TypeError(`${label}.dispatchId must be a nonempty string`);
  }
  if (!Number.isSafeInteger(value.effectIndex) || value.effectIndex < 0) {
    throw new TypeError(`${label}.effectIndex must be a nonnegative safe integer`);
  }
  return { dispatchId: value.dispatchId, effectIndex: value.effectIndex };
}

/** Closed policy for real fixture requests and explicit Go-owned cancellations. */
export function validateLifecycleEffect(effect, label = "gobi.Effect") {
  exactKeys(effect, EFFECT_FIELDS, label);
  for (const field of EFFECT_FIELDS) {
    if (typeof effect[field] !== "string") throw new TypeError(`${label}.${field} must be a string`);
  }
  validateToken(effect.arg, `${label}.arg`);
  if (effect.kind === "fixture.request") {
    if (effect.name !== "lookup" || effect.reply !== "complete") {
      throw new TypeError(`${label} fixture.request must use lookup/complete`);
    }
    return undefined;
  }
  if (effect.kind === "lifecycle.cancel") {
    if (effect.name !== "cancel" || effect.reply !== "") {
      throw new TypeError(`${label} lifecycle.cancel must use cancel with an empty reply`);
    }
    return undefined;
  }
  throw new TypeError(`${label} has unsupported lifecycle effect kind ${JSON.stringify(effect.kind)}`);
}

/**
 * A deterministic, manual host for Go-emitted lifecycle request/cancel intents.
 * It carries no lifecycle state: Go decides which request token is live.
 */
export function createLifecycleEffectDriver() {
  let runtime = null;
  let closed = false;
  let nextSequence = 1;
  const records = [];
  const byToken = new Map();
  const requests = [];

  function record(event) {
    const value = { sequence: nextSequence, ...event };
    nextSequence += 1;
    records.push(value);
    return value;
  }

  function requireAttachedRuntime() {
    if (!runtime) throw new Error("lifecycle effect driver is not attached to a runtime");
    return runtime;
  }

  function request(requestInput, deliver) {
    if (closed) throw new TypeError("lifecycle effect driver is closed");
    exactKeys(requestInput, ["dispatchId", "effectIndex", "effect"], "EffectRequest");
    const correlation = validateCorrelation({
      dispatchId: requestInput.dispatchId,
      effectIndex: requestInput.effectIndex,
    });
    validateLifecycleEffect(requestInput.effect, "EffectRequest.effect");
    if (typeof deliver !== "function") throw new TypeError("effect delivery callback must be a function");
    const token = requestInput.effect.arg;

    if (requestInput.effect.kind === "fixture.request") {
      if (byToken.has(token)) throw new TypeError(`duplicate lifecycle request token ${JSON.stringify(token)}`);
      const event = record({
        kind: "request",
        ...correlation,
        token,
        outcome: "queued",
      });
      const item = {
        sequence: event.sequence,
        token,
        correlation,
        effect: cloneRecord(requestInput.effect),
        status: "pending",
        deliver,
      };
      requests.push(item);
      byToken.set(token, item);
      return undefined;
    }

    const target = byToken.get(token);
    if (!target || target.status !== "pending") {
      throw new TypeError(`lifecycle.cancel targets a request that is not pending: ${token}`);
    }
    const result = requireAttachedRuntime().cancelEffect(target.correlation);
    if (!result.accepted || result.cancelled !== true) {
      throw new TypeError(`runtime rejected lifecycle cancellation for ${token}: ${result.error ?? "unknown reason"}`);
    }
    target.status = "cancelled";
    record({
      kind: "cancel",
      ...correlation,
      token,
      target: cloneRecord(target.correlation),
      outcome: "cancelled",
    });
    return undefined;
  }

  function deliveryResult(token, item, kind, deliverCallback) {
    const event = record({
      kind,
      ...(item?.correlation ?? { dispatchId: null, effectIndex: null }),
      token,
      outcome: "delivering",
      message: { name: "complete", arg: token },
    });
    let result;
    try {
      result = deliverCallback({
        dispatchId: item.correlation.dispatchId,
        effectIndex: item.correlation.effectIndex,
        message: { name: "complete", arg: token },
      });
    } catch (error) {
      result = { accepted: false, error: error instanceof Error ? error.message : String(error) };
    }
    const accepted = result?.accepted === true;
    event.outcome = accepted ? "accepted" : "rejected";
    event.runtimeResult = cloneRecord(result ?? { accepted: false, error: "runtime returned no result" });
    return {
      accepted,
      outcome: event.outcome,
      token,
      correlation: cloneRecord(item.correlation),
      runtimeResult: cloneRecord(event.runtimeResult),
      ...(accepted ? {} : { error: event.runtimeResult.error ?? "runtime rejected lifecycle completion" }),
    };
  }

  function deliver(tokenInput) {
    const token = validateToken(tokenInput);
    const item = byToken.get(token);
    if (!item || item.status !== "pending" || typeof item.deliver !== "function") {
      const reason = !item ? "unknown lifecycle request token" : `lifecycle request is ${item.status}`;
      record({
        kind: "deliver",
        ...(item?.correlation ?? { dispatchId: null, effectIndex: null }),
        token,
        outcome: "rejected",
        error: reason,
      });
      return { accepted: false, outcome: "rejected", token, ...(item ? { correlation: cloneRecord(item.correlation) } : {}), error: reason };
    }
    const callback = item.deliver;
    item.status = "delivering";
    const result = deliveryResult(token, item, "deliver", callback);
    item.status = result.accepted ? "delivered" : "rejected";
    item.deliver = null;
    return result;
  }

  function forceDeliverRetired(tokenInput) {
    const token = validateToken(tokenInput);
    const item = byToken.get(token);
    if (!item || item.status !== "cancelled" || typeof item.deliver !== "function") {
      const reason = !item ? "unknown lifecycle request token" :
        item.status === "unmounted" ? "callback was released on host unmount" :
          item.status === "force-delivered" ? "retired callback was already force-delivered" :
            "lifecycle request is not retired";
      record({
        kind: "force-deliver-retired",
        ...(item?.correlation ?? { dispatchId: null, effectIndex: null }),
        token,
        outcome: "rejected",
        error: reason,
      });
      return { accepted: false, outcome: "rejected", token, ...(item ? { correlation: cloneRecord(item.correlation) } : {}), error: reason };
    }
    const callback = item.deliver;
    item.status = "force-delivering";
    const result = deliveryResult(token, item, "force-deliver-retired", callback);
    item.status = "force-delivered";
    item.deliver = null;
    return result;
  }

  function retireAll() {
    if (closed) return false;
    closed = true;
    const hostRuntime = requireAttachedRuntime();
    for (const item of requests) {
      if (item.status === "pending") {
        const result = hostRuntime.cancelEffect(item.correlation);
        item.status = "unmounted";
        record({
          kind: "retire",
          ...item.correlation,
          token: item.token,
          outcome: result.accepted ? "retired" : "rejected",
          reason: "host-unmount",
          ...(result.accepted ? {} : { error: result.error }),
        });
      } else if (item.status === "cancelled" || item.status === "force-delivered") {
        item.status = "unmounted";
      }
      item.deliver = null;
    }
    return true;
  }

  return {
    effectHost: { request },
    attachRuntime(value) {
      if (runtime !== null) throw new TypeError("lifecycle effect driver is already attached");
      if (!value || typeof value.cancelEffect !== "function") {
        throw new TypeError("lifecycle runtime must provide cancelEffect(correlation)");
      }
      runtime = value;
    },
    pending() {
      return requests.filter((item) => item.status === "pending").map((item) => ({
        sequence: item.sequence,
        ...cloneRecord(item.correlation),
        token: item.token,
        effect: cloneRecord(item.effect),
      }));
    },
    records() {
      return cloneRecord(records);
    },
    deliver,
    forceDeliverRetired,
    retireAll,
  };
}

/** Mount the existing compiled host with the closed lifecycle effect policy. */
export function mountLifecycleApp({
  module,
  componentId = null,
  appId = null,
  encoder,
  renderer,
  onTick = null,
  onFailure = null,
}) {
  if (componentId === null) {
    const components = module?.appIR?.components;
    if (!Array.isArray(components) || components.length !== 1 || typeof components[0]?.id !== "string") {
      throw new TypeError("componentId is required unless the module contains exactly one component");
    }
    componentId = components[0].id;
  }
  if (appId === null) appId = componentId;
  const effects = createLifecycleEffectDriver();
  const mounted = mountCompiledApp({
    module,
    componentId,
    appId,
    encoder,
    renderer,
    effectHost: effects.effectHost,
    effectPolicy: validateLifecycleEffect,
    onTick,
    onFailure,
  });
  effects.attachRuntime(mounted);
  let deferredUnmountRetirementScheduled = false;
  function checkDeferredUnmountRetirement() {
    if (deferredUnmountRetirementScheduled) return;
    deferredUnmountRetirementScheduled = true;
    queueMicrotask(() => {
      deferredUnmountRetirementScheduled = false;
      if (mounted.isUnmounted()) effects.retireAll();
    });
  }
  const runtime = {
    ...mounted,
    unmount() {
      const accepted = mounted.unmount();
      if (accepted || mounted.isUnmounted()) {
        effects.retireAll();
      } else {
        // Core unmount returns false for both refusal and a deferred admission.
        // Check after the current synchronous admission unwinds so only a
        // deferred unmount that actually disposed the host retires callbacks.
        checkDeferredUnmountRetirement();
      }
      return accepted;
    },
  };
  const scheduler = Object.freeze({
    pending: effects.pending,
    records: effects.records,
    deliver: effects.deliver,
    forceDeliverRetired: effects.forceDeliverRetired,
  });
  return { runtime, effects: scheduler };
}
