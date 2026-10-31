import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const fixturePath = resolve(root, "fixtures/compiled/publications/scenario.json");
export const ORACLE_SCENARIO = deepFreeze(JSON.parse(readFileSync(fixturePath, "utf8")));

const parent = (patch = {}) => ({
  Alive: true, Generation: 1, RequestSeq: 0, Pending: false, Token: "", Reply: "",
  PublishedKey: "", PublishedValue: 0, Accepted: 0, Rejected: 0, ...patch,
});
const child = (key, generation, count = 0, requestSeq = 0, pending = false, token = "", reply = "", lastAccepted = 0) => ({
  Key: key, Counter: { Count: count }, Generation: generation, RequestSeq: requestSeq,
  Pending: pending, Token: token, Reply: reply, LastAcceptedPublication: lastAccepted,
});
const publication = (id, key, parentGeneration, childGeneration, inputRevision, value) => ({
  ID: id, Key: key, ParentGeneration: parentGeneration, ChildGeneration: childGeneration,
  InputRevision: inputRevision, Value: value,
});
const snapshot = (Parent, Children, NextGeneration, Input, Publications, NextPublication, LastDecision) => ({
  Parent, Children, NextGeneration,
  Input: { Step: Input[0], Locked: Input[1], Revision: Input[2] },
  Publications, NextPublication, LastDecision,
});

// These are complete, hand-entered Go value checkpoints. Aliases below only
// express literal no-op/host-only repetitions; no reducer generates state.
const pub1 = publication(1, "oak", 1, 2, 2, 4);
const pub2 = publication(2, "oak", 1, 2, 5, 7);
const pub3 = publication(3, "oak", 1, 2, 5, 9);
const pub4 = publication(4, "elm", 1, 3, 5, 0);
const pub5 = publication(5, "elm", 1, 3, 5, 0);
const pub6 = publication(6, "elm", 1, 4, 5, 0);
const pub7 = publication(7, "oak", 1, 2, 5, 9);
const pub8 = publication(8, "oak", 5, 6, 5, 0);

const checkpoint = [
  // 0 initial
  snapshot(parent(), [child("oak", 2), child("elm", 3)], 3, [1, false, 1], [], 0, ""),
  // 1 event 0: oak +1 using initial step
  snapshot(parent(), [child("oak", 2, 1), child("elm", 3)], 3, [1, false, 1], [], 0, ""),
  // 2 event 1: input step 3, revision 2
  snapshot(parent(), [child("oak", 2, 1), child("elm", 3)], 3, [3, false, 2], [], 0, ""),
  // 3 event 2: oak +3 using the new typed input
  snapshot(parent(), [child("oak", 2, 4), child("elm", 3)], 3, [3, false, 2], [], 0, ""),
  // 4 event 3: capture value 4 at revision 2
  snapshot(parent(), [child("oak", 2, 4), child("elm", 3)], 3, [3, false, 2], [pub1], 1, ""),
  // 5 event 4: later count change leaves captured value 4 intact
  snapshot(parent(), [child("oak", 2, 7), child("elm", 3)], 3, [3, false, 2], [pub1], 1, ""),
  // 6 event 5: lock changes input revision
  snapshot(parent(), [child("oak", 2, 7), child("elm", 3)], 3, [3, true, 3], [pub1], 1, ""),
  // 7 event 8: locked direct capture is a no-op
  snapshot(parent(), [child("oak", 2, 7), child("elm", 3)], 3, [3, true, 3], [pub1], 1, ""),
  // 8 event 9: locked direct count update is a no-op
  snapshot(parent(), [child("oak", 2, 7), child("elm", 3)], 3, [3, true, 3], [pub1], 1, ""),
  // 9 event 10: step changes while locked; revision advances
  snapshot(parent(), [child("oak", 2, 7), child("elm", 3)], 3, [2, true, 4], [pub1], 1, ""),
  // 10 event 11: same step is a no-op
  snapshot(parent(), [child("oak", 2, 7), child("elm", 3)], 3, [2, true, 4], [pub1], 1, ""),
  // 11 event 12: unlock at revision 5
  snapshot(parent(), [child("oak", 2, 7), child("elm", 3)], 3, [2, false, 5], [pub1], 1, ""),
  // 12 event 13: capture second oak publication
  snapshot(parent(), [child("oak", 2, 7), child("elm", 3)], 3, [2, false, 5], [pub1, pub2], 2, ""),
  // 13 event 14: oak +2
  snapshot(parent(), [child("oak", 2, 9), child("elm", 3)], 3, [2, false, 5], [pub1, pub2], 2, ""),
  // 14 event 15: capture third oak publication
  snapshot(parent(), [child("oak", 2, 9), child("elm", 3)], 3, [2, false, 5], [pub1, pub2, pub3], 3, ""),
  // 15 event 16: capture elm publication
  snapshot(parent(), [child("oak", 2, 9), child("elm", 3)], 3, [2, false, 5], [pub1, pub2, pub3, pub4], 4, ""),
  // 16 event 17: swap preserves both keyed child values
  snapshot(parent(), [child("elm", 3), child("oak", 2, 9)], 3, [2, false, 5], [pub1, pub2, pub3, pub4], 4, ""),
  // 17 event 18: deliver newer oak ID 3 first
  snapshot(parent({ PublishedKey: "oak", PublishedValue: 9, Accepted: 1 }),
    [child("elm", 3), child("oak", 2, 9, 0, false, "", "", 3)], 3, [2, false, 5], [pub1, pub2, pub4], 4, "accepted:oak:3"),
  // 18 event 19: ID 2 is now older than oak's accepted ID 3
  snapshot(parent({ PublishedKey: "oak", PublishedValue: 9, Accepted: 1, Rejected: 1 }),
    [child("elm", 3), child("oak", 2, 9, 0, false, "", "", 3)], 3, [2, false, 5], [pub1, pub4], 4, "rejected:stale-id:2"),
  // 19 event 20: independent elm publication is accepted
  snapshot(parent({ PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 1 }),
    [child("elm", 3, 0, 0, false, "", "", 4), child("oak", 2, 9, 0, false, "", "", 3)], 3,
    [2, false, 5], [pub1], 4, "accepted:elm:4"),
  // 20 event 21: revision-2 publication is rejected after the edits
  snapshot(parent({ PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("elm", 3, 0, 0, false, "", "", 4), child("oak", 2, 9, 0, false, "", "", 3)], 3,
    [2, false, 5], [], 4, "rejected:stale-input:1"),
  // 21 event 22: duplicate delivery is an exact no-op
  snapshot(parent({ PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("elm", 3, 0, 0, false, "", "", 4), child("oak", 2, 9, 0, false, "", "", 3)], 3,
    [2, false, 5], [], 4, "rejected:stale-input:1"),
  // 22 event 23: parent request
  snapshot(parent({ RequestSeq: 1, Pending: true, Token: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("elm", 3, 0, 0, false, "", "", 4), child("oak", 2, 9, 0, false, "", "", 3)], 3,
    [2, false, 5], [], 4, "rejected:stale-input:1"),
  // 23 event 24: elm request
  snapshot(parent({ RequestSeq: 1, Pending: true, Token: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("elm", 3, 0, 1, true, "child:elm:g3:r1", "", 4), child("oak", 2, 9, 0, false, "", "", 3)], 3,
    [2, false, 5], [], 4, "rejected:stale-input:1"),
  // 24 event 25: oak request; host-only events 26–28 retain this projection
  snapshot(parent({ RequestSeq: 1, Pending: true, Token: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("elm", 3, 0, 1, true, "child:elm:g3:r1", "", 4), child("oak", 2, 9, 1, true, "child:oak:g2:r1", "", 3)], 3,
    [2, false, 5], [], 4, "rejected:stale-input:1"),
  // 25 event 29: parent reply accepted
  snapshot(parent({ RequestSeq: 1, Token: "parent:g1:r1", Reply: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("elm", 3, 0, 1, true, "child:elm:g3:r1", "", 4), child("oak", 2, 9, 1, true, "child:oak:g2:r1", "", 3)], 3,
    [2, false, 5], [], 4, "rejected:stale-input:1"),
  // 26 event 30: elm reply accepted
  snapshot(parent({ RequestSeq: 1, Token: "parent:g1:r1", Reply: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("elm", 3, 0, 1, false, "child:elm:g3:r1", "child:elm:g3:r1", 4), child("oak", 2, 9, 1, true, "child:oak:g2:r1", "", 3)], 3,
    [2, false, 5], [], 4, "rejected:stale-input:1"),
  // 27 event 31: oak reply accepted
  snapshot(parent({ RequestSeq: 1, Token: "parent:g1:r1", Reply: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("elm", 3, 0, 1, false, "child:elm:g3:r1", "child:elm:g3:r1", 4), child("oak", 2, 9, 1, false, "child:oak:g2:r1", "child:oak:g2:r1", 3)], 3,
    [2, false, 5], [], 4, "rejected:stale-input:1"),
  // 28 event 32: capture elm from its first lifetime
  snapshot(parent({ RequestSeq: 1, Token: "parent:g1:r1", Reply: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("elm", 3, 0, 1, false, "child:elm:g3:r1", "child:elm:g3:r1", 4), child("oak", 2, 9, 1, false, "child:oak:g2:r1", "child:oak:g2:r1", 3)], 3,
    [2, false, 5], [pub5], 5, "rejected:stale-input:1"),
  // 29 event 33: remove elm but retain its queued snapshot
  snapshot(parent({ RequestSeq: 1, Token: "parent:g1:r1", Reply: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("oak", 2, 9, 1, false, "child:oak:g2:r1", "child:oak:g2:r1", 3)], 3,
    [2, false, 5], [pub5], 5, "rejected:stale-input:1"),
  // 30 event 34: the same key receives fresh child generation 4
  snapshot(parent({ RequestSeq: 1, Token: "parent:g1:r1", Reply: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 2 }),
    [child("oak", 2, 9, 1, false, "child:oak:g2:r1", "child:oak:g2:r1", 3), child("elm", 4)], 4,
    [2, false, 5], [pub5], 5, "rejected:stale-input:1"),
  // 31 event 35: old generation-3 publication rejected
  snapshot(parent({ RequestSeq: 1, Token: "parent:g1:r1", Reply: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 3 }),
    [child("oak", 2, 9, 1, false, "child:oak:g2:r1", "child:oak:g2:r1", 3), child("elm", 4)], 4,
    [2, false, 5], [], 5, "rejected:child-generation:5"),
  // 32 event 36: fresh generation-4 capture
  snapshot(parent({ RequestSeq: 1, Token: "parent:g1:r1", Reply: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 2, Rejected: 3 }),
    [child("oak", 2, 9, 1, false, "child:oak:g2:r1", "child:oak:g2:r1", 3), child("elm", 4)], 4,
    [2, false, 5], [pub6], 6, "rejected:child-generation:5"),
  // 33 event 37: fresh generation-4 publication accepted
  snapshot(parent({ RequestSeq: 1, Token: "parent:g1:r1", Reply: "parent:g1:r1", PublishedKey: "elm", PublishedValue: 0, Accepted: 3, Rejected: 3 }),
    [child("oak", 2, 9, 1, false, "child:oak:g2:r1", "child:oak:g2:r1", 3), child("elm", 4, 0, 0, false, "", "", 6)], 4,
    [2, false, 5], [], 6, "accepted:elm:6"),
  // 34 event 38: parent request sequence 2
  snapshot(parent({ RequestSeq: 2, Pending: true, Token: "parent:g1:r2", PublishedKey: "elm", PublishedValue: 0, Accepted: 3, Rejected: 3 }),
    [child("oak", 2, 9, 1, false, "child:oak:g2:r1", "child:oak:g2:r1", 3), child("elm", 4, 0, 0, false, "", "", 6)], 4,
    [2, false, 5], [], 6, "accepted:elm:6"),
  // 35 event 39: oak request sequence 2
  snapshot(parent({ RequestSeq: 2, Pending: true, Token: "parent:g1:r2", PublishedKey: "elm", PublishedValue: 0, Accepted: 3, Rejected: 3 }),
    [child("oak", 2, 9, 2, true, "child:oak:g2:r2", "", 3), child("elm", 4, 0, 0, false, "", "", 6)], 4,
    [2, false, 5], [], 6, "accepted:elm:6"),
  // 36 event 40: elm request sequence 1 in generation 4
  snapshot(parent({ RequestSeq: 2, Pending: true, Token: "parent:g1:r2", PublishedKey: "elm", PublishedValue: 0, Accepted: 3, Rejected: 3 }),
    [child("oak", 2, 9, 2, true, "child:oak:g2:r2", "", 3), child("elm", 4, 0, 1, true, "child:elm:g4:r1", "", 6)], 4,
    [2, false, 5], [], 6, "accepted:elm:6"),
  // 37 event 41: queued oak publication for the old parent lifetime
  snapshot(parent({ RequestSeq: 2, Pending: true, Token: "parent:g1:r2", PublishedKey: "elm", PublishedValue: 0, Accepted: 3, Rejected: 3 }),
    [child("oak", 2, 9, 2, true, "child:oak:g2:r2", "", 3), child("elm", 4, 0, 1, true, "child:elm:g4:r1", "", 6)], 4,
    [2, false, 5], [pub7], 7, "accepted:elm:6"),
  // 38 event 42: remove parent; reverse child order then parent cancellation
  snapshot(parent({ Alive: false, RequestSeq: 2, PublishedKey: "elm", PublishedValue: 0, Accepted: 3, Rejected: 3 }),
    [], 4, [2, false, 5], [pub7], 7, "accepted:elm:6"),
  // 39 event 43: remount gets generation 5; queue and parent input survive
  snapshot(parent({ Generation: 5 }), [], 5, [2, false, 5], [pub7], 7, ""),
  // 40 event 44: add oak in the new parent lifetime
  snapshot(parent({ Generation: 5 }), [child("oak", 6)], 6, [2, false, 5], [pub7], 7, ""),
  // 41 event 45: capture oak under parent 5 / child 6
  snapshot(parent({ Generation: 5 }), [child("oak", 6)], 6, [2, false, 5], [pub7, pub8], 8, ""),
  // 42 event 46: old-parent publication rejected
  snapshot(parent({ Generation: 5, Rejected: 1 }), [child("oak", 6)], 6, [2, false, 5], [pub8], 8,
    "rejected:parent-generation:7"),
  // 43 event 47: new lifetime publication accepted
  snapshot(parent({ Generation: 5, PublishedKey: "oak", PublishedValue: 0, Accepted: 1, Rejected: 1 }),
    [child("oak", 6, 0, 0, false, "", "", 8)], 6, [2, false, 5], [], 8, "accepted:oak:8"),
  // 44 event 48: duplicate publication 8 is a no-op
  snapshot(parent({ Generation: 5, PublishedKey: "oak", PublishedValue: 0, Accepted: 1, Rejected: 1 }),
    [child("oak", 6, 0, 0, false, "", "", 8)], 6, [2, false, 5], [], 8, "accepted:oak:8"),
  // 45 event 49: noncanonical ID 01 is a no-op
  snapshot(parent({ Generation: 5, PublishedKey: "oak", PublishedValue: 0, Accepted: 1, Rejected: 1 }),
    [child("oak", 6, 0, 0, false, "", "", 8)], 6, [2, false, 5], [], 8, "accepted:oak:8"),
].map(deepFreeze);

const hostOnly = new Set(["disabled-action", "renderer-swap", "stale-callback"]);
const stateIndexByEvent = [
  1, 2, 3, 4, 5, 6, 6, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
  19, 20, 21, 22, 23, 24, 24, 24, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
  34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45,
];
const requestEffect = (token) => ({ kind: "fixture.request", name: "lookup", arg: token, reply: "complete" });
const cancelEffect = (token) => ({ kind: "lifecycle.cancel", name: "cancel", arg: token, reply: "" });
const effectsAt = {
  23: [requestEffect("parent:g1:r1")],
  24: [requestEffect("child:elm:g3:r1")],
  25: [requestEffect("child:oak:g2:r1")],
  38: [requestEffect("parent:g1:r2")],
  39: [requestEffect("child:oak:g2:r2")],
  40: [requestEffect("child:elm:g4:r1")],
  42: [cancelEffect("child:elm:g4:r1"), cancelEffect("child:oak:g2:r2"), cancelEffect("parent:g1:r2")],
};

function nodeText(text) { return { kind: 2, tag: "", key: "", attrs: null, on: null, kids: null, text }; }
function attr(name, value = "", flag = false) { return { name, value, flag, style: null }; }
function element(tag, { key = "", attrs = null, on = null, kids = [] } = {}) {
  return { kind: 1, tag, key, attrs, on, kids, text: "" };
}
function paragraph(key, text) { return element("p", { key, kids: [nodeText(text)] }); }
function button(key, label, message, arg, disabled = false) {
  return element("button", {
    key,
    attrs: disabled ? [attr("disabled", "", true)] : null,
    on: [{ event: "click", message, arg }],
    kids: [nodeText(label)],
  });
}
function status(pending, token, reply) { return pending ? `pending ${token}` : reply ? `complete ${reply}` : "idle"; }
function number(value) { return String(value); }

// This is the independently authored View contract projection of the literal
// checkpoints, followed by an independent normalized-DOM projection.
export function expectedView(value) {
  const parentStatus = value.Parent.Alive
    ? `Parent generation ${value.Parent.Generation}; input step=${value.Input.Step} locked=${value.Input.Locked} revision=${value.Input.Revision}; ${status(value.Parent.Pending, value.Parent.Token, value.Parent.Reply)}`
    : "Parent removed";
  const publicationStatus = value.Parent.PublishedKey
    ? `Published ${value.Parent.PublishedKey} value=${number(value.Parent.PublishedValue)}`
    : "No accepted publication";
  const parentNode = element("section", { key: "parent", kids: [
    paragraph("parent-status", parentStatus),
    button("input-step-1", "Set input step 1", "input.step", "1", !value.Parent.Alive || value.Input.Step === 1),
    button("input-step-2", "Set input step 2", "input.step", "2", !value.Parent.Alive || value.Input.Step === 2),
    button("input-step-3", "Set input step 3", "input.step", "3", !value.Parent.Alive || value.Input.Step === 3),
    button("input-toggle-lock", value.Input.Locked ? "Unlock input" : "Lock input", "input.toggleLock", "", !value.Parent.Alive),
    button("parent-request", "Request parent", "parent.request", "", !value.Parent.Alive || value.Parent.Pending),
    button("parent-remove", "Remove parent", "parent.remove", "", !value.Parent.Alive),
    button("parent-remount", "Remount parent", "parent.remount", "", value.Parent.Alive),
    paragraph("parent-publication-status", publicationStatus),
    paragraph("parent-publication-counts", `Accepted=${value.Parent.Accepted} Rejected=${value.Parent.Rejected}`),
    paragraph("last-decision", `Last decision: ${value.LastDecision}`),
  ] });
  const children = value.Children.map((item, index) => {
    const childStatus = `Child ${item.Key} generation ${item.Generation}; count=${number(item.Counter.Count)}; last publication=${item.LastAcceptedPublication}; ${status(item.Pending, item.Token, item.Reply)}`;
    const kids = [
      paragraph(`child-${item.Key}-status`, childStatus),
      button(`child-${item.Key}-count`, `Add to ${item.Key}`, "counter.add", item.Key, !value.Parent.Alive || value.Input.Locked),
      button(`child-${item.Key}-request`, `Request ${item.Key}`, "child.request", item.Key, !value.Parent.Alive || item.Pending),
      button(`child-${item.Key}-capture`, `Capture ${item.Key}`, "child.capture", item.Key, !value.Parent.Alive || value.Input.Locked),
      button(`child-${item.Key}-remove`, `Remove ${item.Key}`, "child.remove", item.Key, !value.Parent.Alive),
    ];
    if (index > 0) kids.push(button(`child-${item.Key}-move-up`, `Move ${item.Key} up`, "children.swap", `${value.Children[index - 1].Key}:${item.Key}`));
    return element("section", { key: `child-${item.Key}`, attrs: [attr("class", "child")], kids });
  });
  const controls = ["oak", "elm", "ash", "pine"].map((key) => button(`child-add-${key}`, `Add ${key}`, "child.add", key,
    !value.Parent.Alive || value.Children.some((item) => item.Key === key)));
  controls.push(button("children-clear", "Clear children", "children.clear", "", !value.Parent.Alive || value.Children.length === 0));
  const queue = value.Publications.map((item) => {
    const id = number(item.ID);
    return element("section", { key: `publication-${id}`, kids: [
      button(`publication-deliver-${id}`, `Deliver #${id} ${item.Key} value=${number(item.Value)}`, "publication.deliver", id),
      paragraph(`publication-${id}-metadata`, `parent=${item.ParentGeneration} child=${item.ChildGeneration} input=${item.InputRevision}`),
    ] });
  });
  return element("main", { key: "compiled-publications", attrs: [attr("class", "compiled-publications")], kids: [
    parentNode,
    element("div", { key: "children", attrs: [attr("class", "children")], kids: children }),
    element("aside", { key: "children-controls", kids: controls }),
    element("section", { key: "publications", attrs: [attr("class", "publications")], kids: queue }),
  ] });
}

function escaped(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function buttonHTML(label, disabled = false) { return `<button${disabled ? ' disabled=""' : ""}>${escaped(label)}</button>`; }
function domControl(path, key, disabled) { return { path, key, tag: "button", type: "submit", value: "", checked: false, disabled }; }

export function expectedDOM(value) {
  const controls = [];
  const parentButtons = [
    ["input-step-1", "Set input step 1", !value.Parent.Alive || value.Input.Step === 1],
    ["input-step-2", "Set input step 2", !value.Parent.Alive || value.Input.Step === 2],
    ["input-step-3", "Set input step 3", !value.Parent.Alive || value.Input.Step === 3],
    ["input-toggle-lock", value.Input.Locked ? "Unlock input" : "Lock input", !value.Parent.Alive],
    ["parent-request", "Request parent", !value.Parent.Alive || value.Parent.Pending],
    ["parent-remove", "Remove parent", !value.Parent.Alive],
    ["parent-remount", "Remount parent", value.Parent.Alive],
  ];
  const parentStatus = value.Parent.Alive
    ? `Parent generation ${value.Parent.Generation}; input step=${value.Input.Step} locked=${value.Input.Locked} revision=${value.Input.Revision}; ${status(value.Parent.Pending, value.Parent.Token, value.Parent.Reply)}`
    : "Parent removed";
  const publicationStatus = value.Parent.PublishedKey
    ? `Published ${value.Parent.PublishedKey} value=${number(value.Parent.PublishedValue)}`
    : "No accepted publication";
  const parentHTML = `<section><p>${escaped(parentStatus)}</p>` + parentButtons.map(([key, label, disabled], index) => {
    controls.push(domControl(`0/${index + 1}`, key, disabled));
    return buttonHTML(label, disabled);
  }).join("") +
    `<p>${escaped(publicationStatus)}</p><p>${escaped(`Accepted=${value.Parent.Accepted} Rejected=${value.Parent.Rejected}`)}</p>` +
    `<p>${escaped(`Last decision: ${value.LastDecision}`)}</p></section>`;

  const childHTML = value.Children.map((item, index) => {
    const dead = !value.Parent.Alive;
    const countDisabled = dead || value.Input.Locked;
    const requestDisabled = dead || item.Pending;
    const captureDisabled = dead || value.Input.Locked;
    const childStatus = `Child ${item.Key} generation ${item.Generation}; count=${number(item.Counter.Count)}; last publication=${item.LastAcceptedPublication}; ${status(item.Pending, item.Token, item.Reply)}`;
    const prefix = `1/${index}`;
    controls.push(
      domControl(`${prefix}/1`, `child-${item.Key}-count`, countDisabled),
      domControl(`${prefix}/2`, `child-${item.Key}-request`, requestDisabled),
      domControl(`${prefix}/3`, `child-${item.Key}-capture`, captureDisabled),
      domControl(`${prefix}/4`, `child-${item.Key}-remove`, dead),
    );
    const move = index > 0 ? buttonHTML(`Move ${item.Key} up`) : "";
    if (index > 0) controls.push(domControl(`${prefix}/5`, `child-${item.Key}-move-up`, false));
    return `<section class="child"><p>${escaped(childStatus)}</p>` +
      `${buttonHTML(`Add to ${item.Key}`, countDisabled)}${buttonHTML(`Request ${item.Key}`, requestDisabled)}` +
      `${buttonHTML(`Capture ${item.Key}`, captureDisabled)}${buttonHTML(`Remove ${item.Key}`, dead)}${move}</section>`;
  }).join("");

  const addButtons = ["oak", "elm", "ash", "pine"].map((key, index) => {
    const disabled = !value.Parent.Alive || value.Children.some((item) => item.Key === key);
    controls.push(domControl(`2/${index}`, `child-add-${key}`, disabled));
    return buttonHTML(`Add ${key}`, disabled);
  }).join("");
  const clearDisabled = !value.Parent.Alive || value.Children.length === 0;
  controls.push(domControl("2/4", "children-clear", clearDisabled));
  const controlsHTML = `<aside>${addButtons}${buttonHTML("Clear children", clearDisabled)}</aside>`;

  const publicationHTML = value.Publications.map((item, index) => {
    const id = number(item.ID);
    controls.push(domControl(`3/${index}/0`, `publication-deliver-${id}`, false));
    return `<section><button>${escaped(`Deliver #${id} ${item.Key} value=${number(item.Value)}`)}</button>` +
      `<p>${escaped(`parent=${item.ParentGeneration} child=${item.ChildGeneration} input=${item.InputRevision}`)}</p></section>`;
  }).join("");
  return {
    normalization: "outerHTML-v1",
    html: `<main class="compiled-publications">${parentHTML}<div class="children">${childHTML}</div>${controlsHTML}` +
      `<section class="publications">${publicationHTML}</section></main>`,
    controls,
  };
}

const stateProjections = checkpoint.map((state, stateIndex) => {
  const view = expectedView(state);
  return { stateIndex, state, view, viewRecord: { tree: structuredClone(view), bindings: [] }, dom: expectedDOM(state) };
});

function expectedMessage(event) {
  if (hostOnly.has(event.kind)) return null;
  if (event.kind === "effect-reply") return { name: "complete", arg: event.token };
  return event.message ? structuredClone(event.message) : null;
}
function expectedAction(event) {
  return event.action && typeof event.action === "object" ? structuredClone(event.action) : null;
}

const events = ORACLE_SCENARIO.events.map((source, eventIndex) => {
  const stateIndex = stateIndexByEvent[eventIndex];
  const item = {
    eventIndex,
    stepIndex: hostOnly.has(source.kind) ? null : stateIndex - 1,
    stateIndex,
    kind: source.kind,
    action: expectedAction(source),
    scenarioMessage: source.message ? structuredClone(source.message) : null,
    message: expectedMessage(source),
    effects: structuredClone(effectsAt[eventIndex] ?? []),
  };
  for (const key of ["expect", "sourceEvent", "from", "to", "target", "path", "event", "value", "token"]) {
    if (source[key] !== undefined) item[key] = source[key];
  }
  return item;
});

export const ORACLE_EXPECTATIONS = deepFreeze({
  schema: "gobi.compiled-publications-oracle-expectations/v1",
  scenario: {
    schema: ORACLE_SCENARIO.schema, name: ORACLE_SCENARIO.name, packagePath: ORACLE_SCENARIO.packagePath,
    componentID: ORACLE_SCENARIO.componentID, eventCount: ORACLE_SCENARIO.events.length,
  },
  initialProjection: structuredClone(stateProjections[0]),
  stateProjections,
  events,
  probes: {
    disabledActions: [
      { eventIndex: 6, stateIndex: 6, path: "1/1/3", message: { name: "child.capture", arg: "elm" }, expect: "disabled", addsGoTick: false },
      { eventIndex: 7, stateIndex: 6, path: "1/1/1", message: { name: "counter.add", arg: "elm" }, expect: "disabled", addsGoTick: false },
    ],
    snapshotImmutability: {
      publicationID: 1, capturedAtEvent: 3, capturedValue: 4, capturedRevision: 2,
      laterCountEvent: 4, laterChildCount: 7, publicationValueAfterEdit: 4,
    },
    staleInputRevision: { publicationID: 1, eventIndex: 21, capturedRevision: 2, currentRevision: 5, reason: "stale-input" },
    outOfOrderDelivery: { acceptedFirstEvent: 18, acceptedID: 3, rejectedNextEvent: 19, rejectedID: 2, reason: "stale-id" },
    compatibleSwap: {
      eventIndex: 26, from: "dom", to: "react", target: "root", expect: "accepted", stateIndex: 24,
      pendingTokens: ["parent:g1:r1", "child:elm:g3:r1", "child:oak:g2:r1"], childOrder: ["elm", "oak"], addsGoTick: false,
    },
    retiredCallback: {
      eventIndex: 27, sourceEvent: 0, from: "dom", path: "1/0/1", message: { name: "counter.add", arg: "oak" },
      expect: "suppressed", stateIndex: 24, addsGoTick: false,
    },
    incompatibleSwap: {
      eventIndex: 28, from: "react", to: "incompatible", target: "root", expect: "rejected", stateIndex: 24,
      activeRendererAfter: "react", pendingTokens: ["parent:g1:r1", "child:elm:g3:r1", "child:oak:g2:r1"], addsGoTick: false,
    },
    staleChildGeneration: { publicationID: 5, oldGeneration: 3, currentGeneration: 4, eventIndex: 35, reason: "child-generation" },
    freshChildGeneration: { publicationID: 6, generation: 4, eventIndex: 37, decision: "accepted:elm:6" },
    cancelledOldReply: { afterEvent: 42, stateIndex: 38, token: "child:elm:g4:r1", expect: "rejected-cancelled", addsGoTick: false },
    parentRemoval: {
      afterEvent: 42, stateIndex: 38,
      expectedCancellationOrder: ["child:elm:g4:r1", "child:oak:g2:r2", "parent:g1:r2"],
      childrenAfter: [], parentAliveAfter: false,
    },
    parentRemount: { eventIndex: 43, newParentGeneration: 5, stalePublicationID: 7, staleDeliveryEvent: 46, reason: "parent-generation" },
    newLifetimePublication: { publicationID: 8, parentGeneration: 5, childGeneration: 6, eventIndex: 47, decision: "accepted:oak:8" },
    duplicateDelivery: { eventIndexes: [22, 48], effects: [[], []], stateNoop: true },
    malformedID: { eventIndex: 49, id: "01", stateNoop: true },
  },
});

export function assertNativeLiteral(native) {
  same(ORACLE_EXPECTATIONS.scenario.schema.replace("scenario", "native"), native?.schema, "native.schema");
  same(ORACLE_EXPECTATIONS.scenario.name, native.name, "native.name");
  same(ORACLE_EXPECTATIONS.scenario.packagePath, native.packagePath, "native.packagePath");
  same(ORACLE_EXPECTATIONS.scenario.componentID, native.componentID, "native.componentID");
  same(ORACLE_EXPECTATIONS.initialProjection.state, native.initialState, "native.initialState");
  same(ORACLE_EXPECTATIONS.initialProjection.view, native.initialView, "native.initialView");
  same(50, native.events?.length, "native.events.length");
  same(45, native.steps?.length, "native.steps.length");
  for (const expected of ORACLE_EXPECTATIONS.events) {
    const observed = native.events[expected.eventIndex];
    same(expected.eventIndex, observed.index, `native.events[${expected.eventIndex}].index`);
    for (const key of ["kind", "path", "event", "value", "token", "from", "to", "target", "expect", "sourceEvent", "action", "message", "stepIndex"]) {
      const expectedValue = key === "message" ? expected.message : expected[key] ?? null;
      same(expectedValue, observed[key] ?? null, `native.events[${expected.eventIndex}].${key}`);
    }
    if (expected.stepIndex !== null) {
      const step = native.steps[expected.stepIndex];
      const projection = ORACLE_EXPECTATIONS.stateProjections[expected.stateIndex];
      same(expected.eventIndex, step.eventIndex, `native.steps[${expected.stepIndex}].eventIndex`);
      same(expected.kind, step.kind, `native.steps[${expected.stepIndex}].kind`);
      same(expected.message, step.message, `native.steps[${expected.stepIndex}].message`);
      same(expected.effects, step.effects, `native.steps[${expected.stepIndex}].effects`);
      same(projection.state, step.state, `native.steps[${expected.stepIndex}].state`);
      same(projection.view, step.view, `native.steps[${expected.stepIndex}].view`);
    }
  }
  return true;
}

export function writeExpectationFile(path = resolve(root, "compiled-publications/oracle/expectations.json")) {
  writeFileSync(path, `${JSON.stringify(ORACLE_EXPECTATIONS, null, 2)}\n`);
  return path;
}

function same(expected, actual, label) {
  if (!isDeepStrictEqual(expected, actual)) {
    throw new Error(`${label} differs from independent literal expectation`);
  }
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes("--write")) {
  writeExpectationFile();
}
