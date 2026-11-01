import { createHash } from "node:crypto";

import { goSliceValues, recordGoNode } from "../../compiled-frontend/conformance/direct-js.mjs";

export const ACTION_NODE_CAPABILITIES = Object.freeze(["view.node", "binding.value", "binding.checked"]);
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function scenarioDigest(scenario) {
  return sha256(Buffer.from(`${JSON.stringify(scenario, null, 2)}\n`, "utf8"));
}

export function goMessage(message) {
  if (message === null || message === undefined) return null;
  return {
    Name: message.Name ?? message.name,
    Arg: message.Arg ?? message.arg ?? "",
  };
}

export function nativeMessage(message) {
  if (message === null || message === undefined) return null;
  return { name: message.Name ?? message.name, arg: message.Arg ?? message.arg ?? "" };
}

export function wirePublication(publication) {
  if (publication === null || publication === undefined) return null;
  return {
    Count: publication.Count ?? publication.count,
    Revision: publication.Revision ?? publication.revision,
  };
}

export function nativeEventFor(native, index) {
  const event = native.events?.[index];
  if (!event || event.index !== index) throw new TypeError(`native event row ${index} is missing or out of order`);
  return event;
}

export function nativeSnapshot(native, index) {
  return index < 0 ? native.initial : nativeEventFor(native, index).snapshot;
}

export function normalizeKeyedSnapshot(snapshot) {
  if (snapshot?.schema !== "gobi.keyed-module-snapshot/v1") throw new TypeError("host snapshot schema is invalid");
  const parentView = snapshot.parent?.view;
  const parent = {
    state: structuredClone(snapshot.parent.state),
    view: structuredClone(parentView?.tree ?? parentView),
    bindings: structuredClone(parentView?.bindings ?? []),
    dom: snapshot.parent.dom === null ? null : structuredClone(snapshot.parent.dom),
    domIdentity: structuredClone(snapshot.parent.domIdentity ?? null),
  };
  const children = snapshot.children.map((child) => ({
    key: child.key,
    generation: child.generation,
    input: structuredClone(child.input),
    state: structuredClone(child.state ?? child.childState),
    childState: structuredClone(child.childState),
    publication: structuredClone(child.publication),
    view: structuredClone(child.view?.tree ?? child.view),
    bindings: structuredClone(child.view?.bindings ?? []),
    dom: child.dom === null ? null : structuredClone(child.dom),
    domIdentity: structuredClone(child.domIdentity ?? null),
  }));
  return {
    schema: snapshot.schema,
    backend: snapshot.backend,
    parent,
    parentState: structuredClone(snapshot.parent.state),
    controllerState: structuredClone(snapshot.parent.controllerState),
    children,
    failed: structuredClone(snapshot.failed ?? null),
  };
}

export function normalizeRawGoView(view) {
  if (view === null || typeof view !== "object") throw new TypeError("Go View is not an object");
  const hasTree = Object.hasOwn(view, "Tree");
  const hasBindings = Object.hasOwn(view, "Bindings");
  if (hasTree !== hasBindings) throw new TypeError("Go View must provide both Tree and Bindings or neither");
  const tree = hasTree ? view.Tree : view;
  const rawBindings = hasBindings ? (goSliceValues(view.Bindings, "View.Bindings") ?? []) : [];
  return {
    tree,
    record: {
      tree: recordGoNode(tree, "$.view.tree"),
      bindings: rawBindings.map((binding) => ({
        path: binding.Path,
        event: binding.Event,
        message: binding.Message,
        source: binding.Source,
      })),
    },
  };
}

export function resolveViewMessage(view, action) {
  if (!view || !action) throw new TypeError("view and action are required");
  let node = view.tree;
  for (const part of action.path === "" ? [] : action.path.split("/")) {
    if (!/^(0|[1-9][0-9]*)$/.test(part)) throw new TypeError(`invalid action path ${JSON.stringify(action.path)}`);
    node = goSliceValues(node.Kids, "View node.Kids")?.[Number(part)] ?? null;
    if (node === null) return { disabled: false, message: null };
  }
  const attrs = goSliceValues(node.Attrs, "View node.Attrs") ?? [];
  if (attrs.some((attr) => attr.Name === "disabled" && attr.Flag === true)) return { disabled: true, message: null };
  const candidates = [];
  for (const binding of view.bindings ?? []) {
    if (binding.Path === action.path && binding.Event === action.event) {
      candidates.push({ Name: binding.Message, Arg: action.value });
    }
  }
  for (const handler of goSliceValues(node.On, "View node.On") ?? []) {
    if (handler.Event === action.event) candidates.push({ Name: handler.Message, Arg: handler.Arg });
  }
  if (candidates.length > 1) throw new TypeError(`multiple handlers target ${action.path}/${action.event}`);
  return { disabled: false, message: candidates[0] ?? null };
}

export function normalizeRuntimeEvent(runtimeEvent, sourceEvent, sourceIndex, nativeRow, result) {
  const runtime = runtimeEvent === null ? null : structuredClone(runtimeEvent);
  const nativeDeclaredMessage = nativeMessage(nativeRow.message);
  const requestedMessage = nativeRow.accepted === true ? nativeDeclaredMessage : null;
  return {
    eventIndex: sourceIndex,
    inputKind: sourceEvent.kind,
    kind: sourceEvent.kind,
    target: sourceEvent.target ?? runtime?.target ?? null,
    key: sourceEvent.key ?? runtime?.key ?? null,
    generation: sourceEvent.generation ?? runtime?.generation ?? null,
    action: structuredClone(sourceEvent.action ?? runtime?.action ?? null),
    requestedMessage,
    declaredHandlerMessage: nativeDeclaredMessage,
    observedMessage: nativeMessage(runtime?.message),
    message: nativeMessage(runtime?.message),
    accepted: nativeRow.accepted === true,
    dispatched: runtime?.dispatched === true,
    suppressed: runtime?.suppressed === true,
    stale: runtime?.stale === true || runtime?.kind === "stale-publication",
    sourceEvent: sourceEvent.sourceEvent ?? null,
    result: result === undefined ? null : structuredClone(result),
    runtimeEvent: runtime,
    bridgeCalls: structuredClone(runtime?.bridgeCalls ?? []),
    callOrder: structuredClone(runtime?.callOrder ?? []),
    callCountsBefore: structuredClone(runtime?.callCountsBefore ?? null),
    callCountsAfter: structuredClone(runtime?.callCountsAfter ?? null),
  };
}

export function assertScenarioMatchesNative(scenario, native) {
  if (scenario?.schema !== "gobi.keyed-modules-scenario/v1" || native?.schema !== "gobi.keyed-module-native/v1") {
    throw new TypeError("scenario or native keyed-module schema is invalid");
  }
  if (scenario.name !== native.name || scenario.events.length !== native.events.length) {
    throw new TypeError("native capture does not match the requested scenario identity/event count");
  }
  for (let index = 0; index < scenario.events.length; index += 1) {
    const expected = scenario.events[index];
    const actual = native.events[index];
    if (actual.index !== index || actual.kind !== expected.kind || (actual.target ?? null) !== (expected.target ?? null) ||
        (actual.key ?? null) !== (expected.key ?? null) || (actual.generation ?? null) !== (expected.generation ?? null) ||
        JSON.stringify(actual.action ?? null) !== JSON.stringify(expected.action ?? null) ||
        (actual.sourceEvent ?? null) !== (expected.sourceEvent ?? null)) {
      throw new Error(`native event ${index} metadata differs from the requested scenario`);
    }
  }
}
