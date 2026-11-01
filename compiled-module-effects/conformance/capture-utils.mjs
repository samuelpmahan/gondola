import { createHash } from "node:crypto";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function messageValue(value) {
  if (value === null || value === undefined) return null;
  return { name: value.Name ?? value.name, arg: value.Arg ?? value.arg ?? "" };
}

export function nativeEventFor(native, index) {
  const row = native?.events?.[index];
  if (!row || row.index !== index) throw new TypeError(`native event row ${index} is missing or out of order`);
  return row;
}

export function nativeStateFor(native, index) {
  if (index < 0) {
    const stateIndex = native.initialStateIndex ?? 0;
    const state = native.states?.[stateIndex];
    if (state === undefined) throw new TypeError("native initial state is missing");
    return state;
  }
  const event = nativeEventFor(native, index);
  const state = native.states?.[event.stateIndex];
  if (state === undefined) throw new TypeError(`native state index ${event.stateIndex} is missing for event ${index}`);
  return state;
}

export function scenarioDigest(scenario) {
  return sha256(Buffer.from(JSON.stringify(scenario), "utf8"));
}

export function exactEventMetadata(source, nativeRow, index) {
  const checks = [
    [nativeRow.index, index, "index"],
    [nativeRow.kind, source.kind, "kind"],
    [nativeRow.target ?? null, source.target ?? null, "target"],
    [nativeRow.key ?? null, source.key ?? null, "key"],
    [nativeRow.generation ?? null, source.generation ?? null, "generation"],
    [nativeRow.sourceEvent ?? null, source.sourceEvent ?? null, "sourceEvent"],
    [nativeRow.token ?? null, source.token ?? null, "token"],
    [nativeRow.to ?? null, source.to ?? null, "to"],
    [JSON.stringify(nativeRow.action ?? null), JSON.stringify(source.action ?? null), "action"],
  ];
  for (const [actual, expected, field] of checks) {
    if (actual !== expected) throw new Error(`native event ${index} ${field} differs from scenario`);
  }
}

export function assertScenarioMatchesNative(scenario, native) {
  if (scenario?.schema !== "gobi.module-effects-scenario/v1" ||
      native?.schema !== "gobi.module-effects-native/v1") {
    throw new TypeError("scenario or native module-effects schema is invalid");
  }
  if (scenario.name !== native.name || scenario.events.length !== native.events?.length) {
    throw new TypeError("native module-effects capture does not match scenario identity/event count");
  }
  for (let index = 0; index < scenario.events.length; index += 1) {
    exactEventMetadata(scenario.events[index], nativeEventFor(native, index), index);
  }
  if (!Array.isArray(native.states) || native.states.length !== scenario.events.length + 1 || native.initialStateIndex !== 0) {
    throw new TypeError("native state array must contain one initial full Go state and one per source event");
  }
}

export function expectedEvent(sourceEvent, nativeRow) {
  let message = null;
  if (sourceEvent.kind === "click" && nativeRow.accepted === true) message = messageValue(nativeRow.message);
  if (sourceEvent.kind === "transport-reply" && nativeRow.accepted === true) {
    message = { name: "complete", arg: sourceEvent.token };
  }
  return {
    accepted: nativeRow.accepted === true,
    declaredMessage: messageValue(nativeRow.message),
    message,
    stateIndex: nativeRow.stateIndex ?? nativeRow.index,
    effectIndices: clone(nativeRow.effectIndices ?? []),
  };
}

export function normalizedDOMSnapshot(container) {
  if (!container || typeof container.innerHTML !== "string") return null;
  return {
    html: container.innerHTML,
    controls: [...container.querySelectorAll("button,input,select,textarea")].map((element) => ({
      tag: element.localName,
      type: element.type ?? "",
      text: element.textContent ?? "",
      value: typeof element.value === "string" ? element.value : "",
      disabled: element.disabled === true,
      connected: element.isConnected === true,
      className: typeof element.className === "string" ? element.className : "",
      parentKey: element.closest?.("[data-gobi-key]")?.getAttribute("data-gobi-key") ?? null,
      parentGeneration: element.closest?.("[data-gobi-generation]")?.getAttribute("data-gobi-generation") ?? null,
    })),
  };
}

export function captureHostSnapshot(handle, eventIndex, dom = null) {
  return { eventIndex, snapshot: clone(handle.snapshot()), dom: clone(dom) };
}

export function cleanLedger(handle) {
  const raw = handle.trace();
  const events = Array.isArray(raw?.events) ? raw.events : [];
  return clone(events);
}
