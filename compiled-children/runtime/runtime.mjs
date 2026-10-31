import { mountCompiledApp } from "../../compiled-frontend/frontend/runtime/runtime.mjs";

const EFFECT_FIELDS = ["kind", "name", "arg", "reply"];
const TOKEN_PATTERN = /^(?:parent|child:([a-z][a-z0-9_-]{0,15})):g([1-9][0-9]*):r([1-9][0-9]*)$/;
const MAX_SAFE_ID = BigInt(Number.MAX_SAFE_INTEGER);

export const COMPILED_CHILDREN_HOST_CAPABILITIES = Object.freeze([
  "effect.request-reply",
  "effect.cancel",
]);

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

function validateToken(value, label = "compiled children token") {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const match = TOKEN_PATTERN.exec(value);
  if (!match) throw new TypeError(`${label} has an invalid compiled children token`);
  for (const decimal of [match[2], match[3]]) {
    if (decimal.length > 16) {
      throw new TypeError(`${label} IDs must be positive canonical safe integers`);
    }
    const number = BigInt(decimal);
    if (number < 1n || number > MAX_SAFE_ID) {
      throw new TypeError(`${label} IDs must be positive canonical safe integers`);
    }
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

/** Validate the only request and cancellation profiles admitted by this host. */
export function validateCompiledChildrenEffect(effect, label = "gobi.Effect") {
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
  throw new TypeError(`${label} has unsupported compiled children effect kind ${JSON.stringify(effect.kind)}`);
}

/**
 * Manual deterministic effect host for Go-owned child-collection requests.
 * It stores token correlations only; parent/child identity and liveness stay in Go.
 */
export function createCompiledChildrenEffectDriver() {
  let runtime = null;
  let closed = false;
  let nextSequence = 1;
  const records = [];
  const requests = [];
  const byToken = new Map();

  function record(event) {
    const value = { sequence: nextSequence, ...event };
    nextSequence += 1;
    records.push(value);
    return value;
  }

  function requireRuntime() {
    if (runtime === null) throw new Error("compiled children effect driver is not attached to a runtime");
    return runtime;
  }

  function admissionInProgress() {
    return runtime !== null && typeof runtime.isAdmittingRendererCandidate === "function" &&
      runtime.isAdmittingRendererCandidate() === true;
  }

  function retryableAdmissionResult(token, item) {
    return {
      accepted: false,
      outcome: "retryable",
      retryable: true,
      token,
      correlation: cloneRecord(item.correlation),
      error: "effect delivery is paused during renderer candidate admission",
    };
  }

  function request(requestInput, deliverCallback) {
    if (closed) throw new TypeError("compiled children effect driver is closed");
    exactKeys(requestInput, ["dispatchId", "effectIndex", "effect"], "EffectRequest");
    const correlation = validateCorrelation({
      dispatchId: requestInput.dispatchId,
      effectIndex: requestInput.effectIndex,
    });
    validateCompiledChildrenEffect(requestInput.effect, "EffectRequest.effect");
    if (typeof deliverCallback !== "function") throw new TypeError("effect delivery callback must be a function");
    const token = requestInput.effect.arg;

    if (requestInput.effect.kind === "fixture.request") {
      if (byToken.has(token)) throw new TypeError(`duplicate compiled children request token ${JSON.stringify(token)}`);
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
        deliver: deliverCallback,
      };
      requests.push(item);
      byToken.set(token, item);
      return undefined;
    }

    const target = byToken.get(token);
    if (!target || target.status !== "pending") {
      throw new TypeError(`lifecycle.cancel targets a request that is not pending: ${token}`);
    }
    const cancellation = requireRuntime().cancelEffect(target.correlation);
    if (!cancellation.accepted || cancellation.cancelled !== true) {
      throw new TypeError(`runtime rejected cancellation for ${token}: ${cancellation.error ?? "unknown reason"}`);
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

  function completeItem(token, item, kind, deliverCallback) {
    const event = record({
      kind,
      ...item.correlation,
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
    const retryable = result?.retryable === true;
    event.outcome = accepted ? "accepted" : retryable ? "retryable" : "rejected";
    event.runtimeResult = cloneRecord(result ?? { accepted: false, error: "runtime returned no result" });
    return {
      accepted,
      outcome: event.outcome,
      token,
      correlation: cloneRecord(item.correlation),
      runtimeResult: cloneRecord(event.runtimeResult),
      ...(retryable ? { retryable: true } : {}),
      ...(accepted ? {} : { error: event.runtimeResult.error ?? "runtime rejected compiled children completion" }),
    };
  }

  function deliver(tokenInput) {
    const token = validateToken(tokenInput);
    const item = byToken.get(token);
    if (item?.status === "pending" && admissionInProgress()) return retryableAdmissionResult(token, item);
    if (!item || item.status !== "pending" || typeof item.deliver !== "function") {
      const reason = !item ? "unknown compiled children request token" : `lifecycle request is ${item.status}`;
      record({
        kind: "deliver",
        ...(item?.correlation ?? { dispatchId: null, effectIndex: null }),
        token,
        outcome: "rejected",
        error: reason,
      });
      return {
        accepted: false,
        outcome: "rejected",
        token,
        ...(item ? { correlation: cloneRecord(item.correlation) } : {}),
        error: reason,
      };
    }
    const callback = item.deliver;
    item.status = "delivering";
    const result = completeItem(token, item, "deliver", callback);
    if (result.retryable) {
      item.status = "pending";
      item.deliver = callback;
      return result;
    }
    item.status = result.accepted ? "delivered" : "rejected";
    item.deliver = null;
    return result;
  }

  function retireAll() {
    if (closed) return false;
    const hostRuntime = requireRuntime();
    if (admissionInProgress()) return false;
    closed = true;
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
      } else if (item.status === "cancelled" || item.status === "delivered" || item.status === "rejected") {
        item.status = "unmounted";
      }
      item.deliver = null;
    }
    return true;
  }

  return {
    effectHost: { request },
    attachRuntime(value) {
      if (runtime !== null) throw new TypeError("compiled children effect driver is already attached");
      if (!value || typeof value.cancelEffect !== "function") {
        throw new TypeError("compiled children runtime must provide cancelEffect(correlation)");
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
    retireAll,
  };
}

/** Mount a Go-compiled collection through the shared renderer/effect runtime. */
export function mountCompiledChildrenApp({
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

  const effects = createCompiledChildrenEffectDriver();
  const mounted = mountCompiledApp({
    module,
    componentId,
    appId,
    encoder,
    renderer,
    effectHost: effects.effectHost,
    effectPolicy: validateCompiledChildrenEffect,
    hostCapabilities: COMPILED_CHILDREN_HOST_CAPABILITIES,
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
        checkDeferredUnmountRetirement();
      }
      return accepted;
    },
  };
  const scheduler = Object.freeze({
    pending: effects.pending,
    records: effects.records,
    deliver: effects.deliver,
  });
  return { runtime, effects: scheduler };
}
