import { assertExactTraceValue } from "../../compiled-frontend/conformance/compare.mjs";

export const LIFECYCLE_FIXTURE_NAME = "compiled-lifecycle-parent-child-grandchild-remount-fence";
export const LIFECYCLE_PACKAGE_PATH = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle";
export const LIFECYCLE_COMPONENT_ID = LIFECYCLE_PACKAGE_PATH;
export const LIFECYCLE_DISPLAY_LABEL = "compiled-lifecycle";

function freezeTree(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}

function nodeState({ id, parentID, generation, requestID = 0, alive = true, requested = false,
  pending = false, token = "", reply = "", count = 0 }) {
  return {
    ID: id,
    ParentID: parentID,
    Generation: generation,
    RequestID: requestID,
    Alive: alive,
    Requested: requested,
    Pending: pending,
    Token: token,
    Reply: reply,
    Counter: { Count: count },
  };
}

function state(parent, child, grandchild, sibling, nextRequestID) {
  return {
    Parent: parent,
    Child: child,
    Grandchild: grandchild,
    Sibling: sibling,
    NextRequestID: nextRequestID,
  };
}

const P0 = () => nodeState({ id: "parent", parentID: "", generation: 1 });
const C0 = () => nodeState({ id: "child", parentID: "parent", generation: 1 });
const G0 = () => nodeState({ id: "grandchild", parentID: "child", generation: 1 });
const S0 = () => nodeState({ id: "sibling", parentID: "", generation: 1 });
const P2 = () => nodeState({ id: "parent", parentID: "", generation: 2 });
const C2 = () => nodeState({ id: "child", parentID: "parent", generation: 2 });
const G2 = () => nodeState({ id: "grandchild", parentID: "child", generation: 2 });

// This is a manually enumerated state oracle: it records each finite fixture
// checkpoint without executing or copying the Go Update transition logic.
export const LIFECYCLE_STATES = freezeTree([
  state(P0(), C0(), G0(), S0(), 0),
  state(nodeState({ id: "parent", parentID: "", generation: 1, count: 1 }), C0(), G0(), S0(), 0),
  state(nodeState({ id: "parent", parentID: "", generation: 1, count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 1, count: 1 }), G0(), S0(), 0),
  state(nodeState({ id: "parent", parentID: "", generation: 1, count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 1, count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 1, count: 1 }), S0(), 0),
  state(nodeState({ id: "parent", parentID: "", generation: 1, count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 1, count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 1, count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, count: 1 }), 0),
  state(nodeState({ id: "parent", parentID: "", generation: 1, requestID: 1, requested: true, pending: true, token: "parent:g1:r1", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 1, count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 1, count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, count: 1 }), 1),
  state(nodeState({ id: "parent", parentID: "", generation: 1, requestID: 1, requested: true, pending: true, token: "parent:g1:r1", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 1, requestID: 2, requested: true, pending: true, token: "child:g1:r2", count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 1, count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, count: 1 }), 2),
  state(nodeState({ id: "parent", parentID: "", generation: 1, requestID: 1, requested: true, pending: true, token: "parent:g1:r1", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 1, requestID: 2, requested: true, pending: true, token: "child:g1:r2", count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 1, requestID: 3, requested: true, pending: true, token: "grandchild:g1:r3", count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, count: 1 }), 3),
  state(nodeState({ id: "parent", parentID: "", generation: 1, requestID: 1, requested: true, pending: true, token: "parent:g1:r1", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 1, requestID: 2, requested: true, pending: true, token: "child:g1:r2", count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 1, requestID: 3, requested: true, pending: true, token: "grandchild:g1:r3", count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: true, token: "sibling:g1:r4", count: 1 }), 4),
  state(nodeState({ id: "parent", parentID: "", generation: 1, requestID: 1, alive: false, requested: true, count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 1, requestID: 2, alive: false, requested: true, count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 1, requestID: 3, alive: false, requested: true, count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: true, token: "sibling:g1:r4", count: 1 }), 4),
  state(P2(), C2(), G2(),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: true, token: "sibling:g1:r4", count: 1 }), 4),
  state(P2(), C2(), G2(),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: true, token: "sibling:g1:r4", count: 1 }), 4),
  state(P2(), C2(), G2(),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: true, token: "sibling:g1:r4", count: 1 }), 4),
  state(P2(), C2(), G2(),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: true, token: "sibling:g1:r4", count: 1 }), 4),
  state(P2(), C2(), G2(),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 4),
  state(P2(), C2(), G2(),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 4),
  state(nodeState({ id: "parent", parentID: "", generation: 2, count: 1 }), C2(), G2(),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 4),
  state(nodeState({ id: "parent", parentID: "", generation: 2, count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 2, count: 1 }), G2(),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 4),
  state(nodeState({ id: "parent", parentID: "", generation: 2, count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 2, count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 2, count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 4),
  state(nodeState({ id: "parent", parentID: "", generation: 2, requestID: 5, requested: true, pending: true, token: "parent:g2:r5", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 2, count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 2, count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 5),
  state(nodeState({ id: "parent", parentID: "", generation: 2, requestID: 5, requested: true, pending: true, token: "parent:g2:r5", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 2, requestID: 6, requested: true, pending: true, token: "child:g2:r6", count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 2, count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 6),
  state(nodeState({ id: "parent", parentID: "", generation: 2, requestID: 5, requested: true, pending: true, token: "parent:g2:r5", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 2, requestID: 6, requested: true, pending: true, token: "child:g2:r6", count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 2, requestID: 7, requested: true, pending: true, token: "grandchild:g2:r7", count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 7),
  state(nodeState({ id: "parent", parentID: "", generation: 2, requestID: 5, requested: true, pending: true, token: "parent:g2:r5", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 2, requestID: 6, requested: true, pending: true, token: "child:g2:r6", count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 2, requestID: 7, requested: true, pending: false, token: "grandchild:g2:r7", reply: "grandchild:g2:r7", count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 7),
  state(nodeState({ id: "parent", parentID: "", generation: 2, requestID: 5, requested: true, pending: true, token: "parent:g2:r5", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 2, requestID: 6, requested: true, pending: false, token: "child:g2:r6", reply: "child:g2:r6", count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 2, requestID: 7, requested: true, pending: false, token: "grandchild:g2:r7", reply: "grandchild:g2:r7", count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 7),
  state(nodeState({ id: "parent", parentID: "", generation: 2, requestID: 5, requested: true, pending: false, token: "parent:g2:r5", reply: "parent:g2:r5", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 2, requestID: 6, requested: true, pending: false, token: "child:g2:r6", reply: "child:g2:r6", count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 2, requestID: 7, requested: true, pending: false, token: "grandchild:g2:r7", reply: "grandchild:g2:r7", count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 7),
  state(nodeState({ id: "parent", parentID: "", generation: 2, requestID: 5, requested: true, pending: false, token: "parent:g2:r5", reply: "parent:g2:r5", count: 1 }),
    nodeState({ id: "child", parentID: "parent", generation: 2, requestID: 6, requested: true, pending: false, token: "child:g2:r6", reply: "child:g2:r6", count: 1 }),
    nodeState({ id: "grandchild", parentID: "child", generation: 2, requestID: 7, requested: true, pending: false, token: "grandchild:g2:r7", reply: "grandchild:g2:r7", count: 1 }),
    nodeState({ id: "sibling", parentID: "", generation: 1, requestID: 4, requested: true, pending: false, token: "sibling:g1:r4", reply: "sibling:g1:r4", count: 1 }), 7),
]);

const requestEffect = (token) => ({ kind: "fixture.request", name: "lookup", arg: token, reply: "complete" });
const cancelEffect = (token) => ({ kind: "lifecycle.cancel", name: "cancel", arg: token, reply: "" });
const click = (path, message, stateIndex, effects = []) => ({
  kind: "click",
  action: { path, event: "click", value: "" },
  message: { name: message, arg: "" },
  effects,
  stateIndex,
});
const goMessage = (token, expect, stateIndex) => ({
  kind: "go-message",
  message: { name: "complete", arg: token },
  expect,
  effects: [],
  stateIndex,
});
const effectReply = (token, stateIndex) => ({
  kind: "effect-reply",
  token,
  message: { name: "complete", arg: token },
  expect: "accepted",
  effects: [],
  stateIndex,
});

// LIFECYCLE_STEPS includes the renderer swap because it is part of the fixed
// browser schedule, but it intentionally does not add a Go Update tick.
export const LIFECYCLE_STEPS = freezeTree([
  click("0/1", "addParent", 1),
  click("0/3/1", "addChild", 2),
  click("0/3/3/1", "addGrandchild", 3),
  click("1/1", "addSibling", 4),
  click("0/2", "requestParent", 5, [requestEffect("parent:g1:r1")]),
  click("0/3/2", "requestChild", 6, [requestEffect("child:g1:r2")]),
  click("0/3/3/2", "requestGrandchild", 7, [requestEffect("grandchild:g1:r3")]),
  click("1/2", "requestSibling", 8, [requestEffect("sibling:g1:r4")]),
  { kind: "renderer-swap", from: "dom", to: "react", target: "root", stateIndex: 8,
    pendingTokens: ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4"], cancelEffects: [] },
  click("2/0", "removeParent", 9, [
    cancelEffect("grandchild:g1:r3"), cancelEffect("child:g1:r2"), cancelEffect("parent:g1:r1"),
  ]),
  click("2/1", "remountParent", 10),
  goMessage("grandchild:g1:r3", "stale-no-op", 11),
  goMessage("child:g1:r2", "stale-no-op", 12),
  goMessage("parent:g1:r1", "stale-no-op", 13),
  effectReply("sibling:g1:r4", 14),
  goMessage("sibling:g1:r4", "duplicate-no-op", 15),
  click("0/1", "addParent", 16),
  click("0/3/1", "addChild", 17),
  click("0/3/3/1", "addGrandchild", 18),
  click("0/2", "requestParent", 19, [requestEffect("parent:g2:r5")]),
  click("0/3/2", "requestChild", 20, [requestEffect("child:g2:r6")]),
  click("0/3/3/2", "requestGrandchild", 21, [requestEffect("grandchild:g2:r7")]),
  effectReply("grandchild:g2:r7", 22),
  effectReply("child:g2:r6", 23),
  effectReply("parent:g2:r5", 24),
  goMessage("child:g2:r6", "duplicate-no-op", 25),
]);

export const LIFECYCLE_ACTIONS = freezeTree(LIFECYCLE_STEPS.filter((step) => step.kind === "click"));
export const LIFECYCLE_EFFECTS = freezeTree(LIFECYCLE_STEPS.map((step) => step.effects ?? []));
export const LIFECYCLE_EVENTS = LIFECYCLE_STEPS;
export const LIFECYCLE_EXPECTED_CANCEL_ORDER = freezeTree([
  "grandchild:g1:r3", "child:g1:r2", "parent:g1:r1",
]);
export const LIFECYCLE_EXPECTED_PENDING_AFTER_SWAP = freezeTree([
  "parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
]);
export const LIFECYCLE_PROBES = freezeTree([
  { afterEvent: 9, token: "grandchild:g1:r3", expectRuntimeCompletion: "rejected-cancelled" },
  { afterEvent: 9, token: "child:g1:r2", expectRuntimeCompletion: "rejected-cancelled" },
  { afterEvent: 9, token: "parent:g1:r1", expectRuntimeCompletion: "rejected-cancelled" },
  { afterEvent: 14, token: "sibling:g1:r4", expectRuntimeCompletion: "rejected-duplicate" },
  { afterEvent: 24, token: "child:g2:r6", expectRuntimeCompletion: "rejected-duplicate" },
]);

function assertIndex(index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= LIFECYCLE_STATES.length) {
    throw new RangeError(`lifecycle state index must be between 0 and ${LIFECYCLE_STATES.length - 1}`);
  }
}

export function expectedLifecycleStateAtTick(index) {
  assertIndex(index);
  return structuredClone(LIFECYCLE_STATES[index]);
}

function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("lifecycle oracle state must be an object");
  const stateKeys = Object.keys(value).sort();
  if (stateKeys.join("\u0000") !== ["Child", "Grandchild", "NextRequestID", "Parent", "Sibling"].sort().join("\u0000")) {
    throw new TypeError("lifecycle oracle state must contain Parent, Child, Grandchild, Sibling, NextRequestID");
  }
  for (const [label, node] of [["Parent", value.Parent], ["Child", value.Child], ["Grandchild", value.Grandchild], ["Sibling", value.Sibling]]) {
    if (!node || typeof node !== "object" || Array.isArray(node)) throw new TypeError(`lifecycle oracle state.${label} must be a node object`);
    if (typeof node.ID !== "string" || typeof node.ParentID !== "string" ||
        !Number.isSafeInteger(node.Generation) || !Number.isSafeInteger(node.RequestID) ||
        ![node.Alive, node.Requested, node.Pending].every((item) => typeof item === "boolean") ||
        typeof node.Token !== "string" || typeof node.Reply !== "string" ||
        !node.Counter || typeof node.Counter !== "object" || !Number.isFinite(node.Counter.Count)) {
      throw new TypeError(`lifecycle oracle state.${label} has invalid fields`);
    }
  }
  if (!Number.isSafeInteger(value.NextRequestID) || value.NextRequestID < 0) {
    throw new TypeError("lifecycle oracle state.NextRequestID must be a nonnegative safe integer");
  }
}

function textNode(value, key = "") {
  return { kind: 2, tag: "", key, attrs: null, on: null, kids: null, text: value };
}

function attr(name, value = "", flag = false) {
  return { name, value, flag, style: null };
}

function element(tag, { key = "", attrs = null, on = null, kids = [] } = {}) {
  return { kind: 1, tag, key, attrs, on, kids, text: "" };
}

function keyedClass(name, className, kids, on = null, flagDisabled = false) {
  const attrs = [attr("class", className)];
  if (flagDisabled) attrs.push(attr("disabled", "", true));
  return element(name.tag, { key: name.key, attrs, on, kids });
}

function messageHandler(message) {
  return [{ event: "click", message, arg: "" }];
}

function statusFor(node) {
  const count = String(node.Counter.Count);
  const status = node.Pending ? `pending ${node.Token}` : node.Reply !== "" ? `complete ${node.Reply}` : "idle";
  const label = node.ID === "grandchild" ? "Grandchild" : node.ID[0].toUpperCase() + node.ID.slice(1);
  return `${label}: live; count=${count}; ${status}`;
}

function tombstone(label, key) {
  return element("p", {
    key,
    attrs: [attr("class", "lifecycle-removed")],
    kids: [textNode(`${label}: removed`)],
  });
}

function lifecycleNode(node, label, addMessage, requestMessage, children = []) {
  const add = keyedClass({ tag: "button", key: `${node.ID}-add` }, "lifecycle-add", [textNode(`${label} +`)], messageHandler(addMessage));
  const request = keyedClass({ tag: "button", key: `${node.ID}-request` }, "lifecycle-request",
    [textNode(`Request ${node.ID}`)], messageHandler(requestMessage), node.Requested);
  const kids = [
    element("p", { key: `${node.ID}-status`, kids: [textNode(statusFor(node))] }),
    add,
    request,
    ...children,
  ];
  return keyedClass({ tag: "section", key: node.ID }, `lifecycle-node lifecycle-${node.ID}`, kids);
}

/** Independently hand-authored gobi viewRecord projection from a literal state checkpoint. */
export function expectedLifecycleView(state) {
  validateState(state);
  let parent;
  if (!state.Parent.Alive) {
    parent = tombstone("Parent", "parent-removed");
  } else {
    const grandchild = state.Grandchild.Alive
      ? lifecycleNode(state.Grandchild, "Grandchild", "addGrandchild", "requestGrandchild")
      : tombstone("Grandchild", "grandchild-removed");
    const child = state.Child.Alive
      ? lifecycleNode(state.Child, "Child", "addChild", "requestChild", [grandchild])
      : tombstone("Child", "child-removed");
    parent = lifecycleNode(state.Parent, "Parent", "addParent", "requestParent", [child]);
  }
  const sibling = lifecycleNode(state.Sibling, "Sibling", "addSibling", "requestSibling");
  const remove = keyedClass({ tag: "button", key: "parent-remove" }, "lifecycle-remove", [textNode("Remove parent")],
    messageHandler("removeParent"), !state.Parent.Alive);
  const remount = keyedClass({ tag: "button", key: "parent-remount" }, "lifecycle-remount", [textNode("Remount parent")],
    messageHandler("remountParent"), state.Parent.Alive);
  const controls = keyedClass({ tag: "aside", key: "lifecycle-controls" }, "lifecycle-controls", [remove, remount]);
  const tree = keyedClass({ tag: "main", key: "lifecycle" }, "lifecycle", [parent, sibling, controls]);
  return { tree, bindings: [] };
}

function escapeText(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function buttonHTML(label, className, disabled = false) {
  return `<button class="${className}"${disabled ? ' disabled=""' : ""}>${escapeText(label)}</button>`;
}

function statusHTML(node) {
  return `<p>${escapeText(statusFor(node))}</p>`;
}

function nodeHTML(node, label, childrenHTML = "") {
  const requestLabel = `Request ${node.ID}`;
  return `<section class="lifecycle-node lifecycle-${node.ID}">${statusHTML(node)}` +
    `${buttonHTML(`${label} +`, "lifecycle-add")}` +
    `${buttonHTML(requestLabel, "lifecycle-request", node.Requested)}${childrenHTML}</section>`;
}

function tombstoneHTML(label) {
  return `<p class="lifecycle-removed">${label}: removed</p>`;
}

function physicalControl(path, key, text, disabled) {
  return { path, key, tag: "button", type: "submit", value: "", checked: false, disabled, text };
}

function controlsForState(state) {
  const controls = [];
  if (state.Parent.Alive) {
    controls.push(
      physicalControl("0/1", "parent-add", "Parent +", false),
      physicalControl("0/2", "parent-request", "Request parent", state.Parent.Requested),
    );
    if (state.Child.Alive) {
      controls.push(
        physicalControl("0/3/1", "child-add", "Child +", false),
        physicalControl("0/3/2", "child-request", "Request child", state.Child.Requested),
      );
      if (state.Grandchild.Alive) {
        controls.push(
          physicalControl("0/3/3/1", "grandchild-add", "Grandchild +", false),
          physicalControl("0/3/3/2", "grandchild-request", "Request grandchild", state.Grandchild.Requested),
        );
      }
    }
  }
  controls.push(
    physicalControl("1/1", "sibling-add", "Sibling +", false),
    physicalControl("1/2", "sibling-request", "Request sibling", state.Sibling.Requested),
    physicalControl("2/0", "parent-remove", "Remove parent", !state.Parent.Alive),
    physicalControl("2/1", "parent-remount", "Remount parent", state.Parent.Alive),
  );
  return controls;
}

/** Literal outerHTML-v1 and actual live button-property expectations. */
export function expectedLifecycleDOM(state) {
  validateState(state);
  const parent = state.Parent.Alive
    ? nodeHTML(state.Parent, "Parent", nodeHTML(state.Child, "Child",
      nodeHTML(state.Grandchild, "Grandchild")))
    : tombstoneHTML("Parent");
  const sibling = nodeHTML(state.Sibling, "Sibling");
  const controls = `<aside class="lifecycle-controls">${buttonHTML("Remove parent", "lifecycle-remove", !state.Parent.Alive)}` +
    `${buttonHTML("Remount parent", "lifecycle-remount", state.Parent.Alive)}</aside>`;
  return {
    normalization: "outerHTML-v1",
    html: `<main class="lifecycle">${parent}${sibling}${controls}</main>`,
    controls: controlsForState(state).map(({ text: _text, ...control }) => control),
  };
}

export function expectedLifecyclePhysicalControls(state) {
  validateState(state);
  return controlsForState(state).map((control) => ({ ...control }));
}

export function assertLifecycleDOMSnapshot(actual, state, path = "$.lifecycle.dom") {
  assertExactTraceValue(expectedLifecycleDOM(state), actual, path);
  return true;
}

export function assertLifecycleViewRecord(actual, state, path = "$.lifecycle.view") {
  assertExactTraceValue(expectedLifecycleView(state), actual, path);
  return true;
}

export function assertLifecycleState(actual, tickIndex, path = "$.lifecycle.state") {
  assertExactTraceValue(expectedLifecycleStateAtTick(tickIndex), actual, path);
  return true;
}

export function assertLifecycleSteps(actual, path = "$.lifecycle.steps") {
  assertExactTraceValue(LIFECYCLE_STEPS, actual, path);
  return true;
}

export function lifecycleStateIndexForStep(stepIndex) {
  if (!Number.isSafeInteger(stepIndex) || stepIndex < 0 || stepIndex >= LIFECYCLE_STEPS.length) {
    throw new RangeError(`lifecycle step index must be between 0 and ${LIFECYCLE_STEPS.length - 1}`);
  }
  return LIFECYCLE_STEPS[stepIndex].stateIndex;
}

export function lifecycleEventsForFixture() {
  return LIFECYCLE_STEPS.map((step) => {
    if (step.kind === "click") {
      return { kind: "click", ...step.action, message: structuredClone(step.message) };
    }
    if (step.kind === "renderer-swap") {
      return { kind: step.kind, from: step.from, to: step.to, target: step.target };
    }
    if (step.kind === "effect-reply") {
      return { kind: step.kind, token: step.token, message: structuredClone(step.message), expect: step.expect };
    }
    return { kind: step.kind, message: structuredClone(step.message), expect: step.expect };
  });
}

