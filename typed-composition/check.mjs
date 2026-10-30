#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { basename, dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { DEFAULT_CASES, DEFAULT_MAX_ACTIONS, DEFAULT_SEEDS, fixedScripts, makeScripts } from "./scripts.mjs";
import { createCompositionReference } from "./reference.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUILD = resolve(HERE, "build");
const requireFromInteraction = createRequire(resolve(ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");
const { build } = requireFromInteraction("esbuild");
const MAX_ROWS = 4;
const REQUIRED_SNAPSHOT_FIELDS = ["state", "tree", "bindings", "messages"];

const own = (value) => value === undefined ? null : value;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => value == null ? value : structuredClone(value);

function mismatch(out, field, context, expected, actual) {
  out.push({ field, context: clone(context), expected: clone(own(expected)), actual: clone(own(actual)) });
}

function isErrorResult(value) {
  return isRecord(value) && Object.keys(value).length === 1 && typeof value.error === "string";
}

function normalizeResult(value) {
  if (isErrorResult(value)) return { outcome: "error" };
  return { outcome: "ok", value: own(value) };
}

function compareResult(out, field, context, expected, actual) {
  const left = normalizeResult(expected);
  const right = normalizeResult(actual);
  if (!isDeepStrictEqual(left, right)) mismatch(out, field, context, left, right);
}

function compareExact(out, field, context, expected, actual) {
  if (!isDeepStrictEqual(expected, actual)) mismatch(out, field, context, expected, actual);
}

function pathIndexes(path) {
  if (path === "") return [];
  if (typeof path !== "string" || !/^(?:0|[1-9][0-9]*)(?:\/(?:0|[1-9][0-9]*))*$/.test(path)) return null;
  return path.split("/").map(Number);
}

function attrValue(node, name) {
  return node?.Attrs?.find((attribute) => attribute.Name === name && !attribute.Flag)?.Value ?? null;
}

function attrFlag(node, name) {
  return node?.Attrs?.some((attribute) => attribute.Name === name && attribute.Flag === true) ?? false;
}

function visitTree(tree, callback, path = "") {
  if (!tree || typeof tree !== "object") return;
  callback(tree, path);
  for (const [index, child] of (tree.Kids ?? []).entries()) {
    visitTree(child, callback, path === "" ? String(index) : `${path}/${index}`);
  }
}

function expectedDisabled(snapshot, session, control) {
  const state = snapshot?.state;
  const rows = Array.isArray(state?.Rows) ? state.Rows : [];
  const readonly = state?.Inputs?.ReadOnly === true;
  if (control.tag === "input") return readonly;
  if (readonly) return true;
  const label = control.rowLabel ?? "";
  const match = /^Row ([1-9][0-9]*)$/.exec(label);
  const rowID = match ? Number(match[1]) : 0;
  const rowIndex = rows.findIndex((row) => row.ID === rowID);
  const row = rowIndex < 0 ? null : rows[rowIndex];
  switch (control.className) {
    case "add": return rows.length >= MAX_ROWS;
    case "reset": return rows.length === 0;
    case "save": return !row || row.Draft === "";
    case "cancel": return !row || row.PendingID === 0;
    case "up": return rowIndex <= 0;
    case "publish": return session.parentID === 0 || !row || row.Saved === "";
    default: return false;
  }
}

function validateTree(records, out, context, prefix) {
  if (!Array.isArray(records)) {
    mismatch(out, `${prefix}.tree.type`, context, "array", records);
    return new Map();
  }
  const byID = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const entry = records[index];
    if (!isRecord(entry) || !Number.isSafeInteger(entry.SessionID) || entry.SessionID <= 0 ||
        !Number.isSafeInteger(entry.ParentID) || entry.ParentID < 0 ||
        !Number.isSafeInteger(entry.Depth) || entry.Depth < 1 || entry.Depth > 32) {
      mismatch(out, `${prefix}.tree.record`, { ...context, index }, "safe session/parent/depth record", entry);
      continue;
    }
    if (byID.has(entry.SessionID)) mismatch(out, `${prefix}.tree.duplicate`, { ...context, index }, "unique session ID", entry.SessionID);
    if (index > 0 && records[index - 1]?.SessionID >= entry.SessionID) {
      mismatch(out, `${prefix}.tree.order`, context, "ascending SessionID", records.map((item) => item?.SessionID));
    }
    byID.set(entry.SessionID, entry);
  }
  for (const entry of records) {
    if (!isRecord(entry)) continue;
    if (entry.ParentID === 0) {
      if (entry.Depth !== 1) mismatch(out, `${prefix}.tree.root-depth`, context, 1, entry.Depth);
    } else {
      const parent = byID.get(entry.ParentID);
      if (!parent || entry.Depth !== parent.Depth + 1) {
        mismatch(out, `${prefix}.tree.parent-depth`, context, "live immediate parent at depth-1", entry);
      }
    }
  }
  return byID;
}

function historicalParentMap(actor) {
  const result = new Map();
  for (const entry of actor?.lifecycle ?? []) {
    if (Number.isSafeInteger(entry?.sessionID) && Number.isSafeInteger(entry?.parentID)) {
      result.set(entry.sessionID, entry.parentID);
    }
  }
  return result;
}

function validatePublicationInbox(snapshot, session, treeByID, historicalParents, allSequences, registerSequences, out, context, prefix) {
  const inbox = snapshot?.state?.Inbox;
  if (!Array.isArray(inbox)) {
    mismatch(out, `${prefix}.inbox.type`, context, "array", inbox);
    return;
  }
  let priorSequence = 0;
  const fields = ["Sequence", "ParentID", "ChildID", "RowID", "Saved", "Saves", "InputRevision"].sort();
  for (const [index, publication] of inbox.entries()) {
    const itemContext = { ...context, publication: index };
    if (!isRecord(publication)) {
      mismatch(out, `${prefix}.inbox.record`, itemContext, "object", publication);
      continue;
    }
    compareExact(out, `${prefix}.inbox.fields`, itemContext, fields, Object.keys(publication).sort());
    if (!Number.isSafeInteger(publication.Sequence) || publication.Sequence <= 0 || publication.Sequence <= priorSequence) {
      mismatch(out, `${prefix}.inbox.sequence-order`, itemContext, `positive sequence greater than ${priorSequence}`, publication.Sequence);
    }
    priorSequence = Number.isSafeInteger(publication.Sequence) ? publication.Sequence : priorSequence;
    if (registerSequences && allSequences.has(publication.Sequence)) {
      mismatch(out, `${prefix}.inbox.sequence-duplicate`, itemContext, "globally unique publication sequence", publication.Sequence);
    }
    if (registerSequences) allSequences.add(publication.Sequence);
    if (publication.ParentID !== session.sessionID) {
      mismatch(out, `${prefix}.inbox.parent`, itemContext, session.sessionID, publication.ParentID);
    }
    const child = treeByID.get(publication.ChildID);
    const historicalParent = historicalParents.get(publication.ChildID);
    if ((child && child.ParentID !== session.sessionID) || (!child && historicalParent !== session.sessionID)) {
      mismatch(out, `${prefix}.inbox.direct-child`, itemContext,
        `child ${publication.ChildID} directly owned by ${session.sessionID} when published`, publication.ChildID);
    }
    if (!Number.isSafeInteger(publication.RowID) || publication.RowID <= 0 ||
        typeof publication.Saved !== "string" || publication.Saved.length === 0 ||
        !Number.isSafeInteger(publication.Saves) || publication.Saves <= 0 ||
        !Number.isSafeInteger(publication.InputRevision) || publication.InputRevision < 0) {
      mismatch(out, `${prefix}.inbox.payload`, itemContext,
        "positive row, nonempty captured Saved, positive Saves and safe InputRevision", publication);
    }
  }
}

function validateSnapshotShape(snapshot, session, treeByID, historicalParents, allSequences, registerSequences, out, context, prefix) {
  if (!isRecord(snapshot)) {
    mismatch(out, `${prefix}.snapshot.type`, context, "object", snapshot);
    return;
  }
  for (const field of REQUIRED_SNAPSHOT_FIELDS) {
    if (!Object.hasOwn(snapshot, field)) mismatch(out, `${prefix}.snapshot.missing.${field}`, context, "present field", undefined);
  }
  const state = snapshot.state;
  if (!isRecord(state) || !Array.isArray(state.Rows)) {
    mismatch(out, `${prefix}.state.shape`, context, "state object with Rows array", state);
    return;
  }
  if (!isRecord(state.Inputs) || typeof state.Inputs.Title !== "string" || typeof state.Inputs.ReadOnly !== "boolean") {
    mismatch(out, `${prefix}.inputs.shape`, context, "Inputs {Title:string, ReadOnly:boolean}", state.Inputs);
  }
  if (!Number.isSafeInteger(state.InputRevision) || state.InputRevision < 0) {
    mismatch(out, `${prefix}.input-revision`, context, "nonnegative safe integer", state.InputRevision);
  }
  validatePublicationInbox(snapshot, session, treeByID, historicalParents, allSequences, registerSequences, out, context, prefix);
  if (!Array.isArray(snapshot.bindings) || !Array.isArray(snapshot.messages)) {
    mismatch(out, `${prefix}.snapshot.collections`, context, "bindings and messages arrays", snapshot);
  }
}

function validateSession(session, treeByID, historicalParents, allSequences, out, context, prefix) {
  if (!isRecord(session)) {
    mismatch(out, `${prefix}.session.type`, context, "object", session);
    return;
  }
  const treeEntry = treeByID.get(session.sessionID);
  if (!treeEntry) mismatch(out, `${prefix}.session.tree-membership`, context, "live tree entry", session.sessionID);
  else {
    compareExact(out, `${prefix}.session.parent`, context, treeEntry.ParentID, session.parentID);
    compareExact(out, `${prefix}.session.depth`, context, treeEntry.Depth, session.depth);
  }
  for (const field of ["managerSnapshot", "snapshot", "hostSnapshot"]) {
    validateSnapshotShape(session[field], session, treeByID, historicalParents, allSequences,
      field === "managerSnapshot", out, context, `${prefix}.${field}`);
  }
  if (isRecord(session.managerSnapshot) && isRecord(session.snapshot)) {
    compareExact(out, `${prefix}.snapshot.manager-parity`, context, session.managerSnapshot, session.snapshot);
  }
  if (isRecord(session.managerSnapshot) && isRecord(session.hostSnapshot)) {
    compareExact(out, `${prefix}.snapshot.host-parity`, context, session.managerSnapshot, session.hostSnapshot);
  }
  const state = session.managerSnapshot?.state;
  if (session.lifecycle !== "active") mismatch(out, `${prefix}.lifecycle`, context, "active", session.lifecycle);
  if (!Array.isArray(session.errors) || session.errors.length > 0) mismatch(out, `${prefix}.lifecycle.errors`, context, [], session.errors);
  if (session.actualDOMMatchesSnapshot !== true) mismatch(out, `${prefix}.dom.snapshot`, context, true, session.actualDOMMatchesSnapshot);
  if (session.elementCountMatches !== true) mismatch(out, `${prefix}.dom.element-count`, context, true, session.elementCounts);
  if (session.reportedDisabledMatches !== true) mismatch(out, `${prefix}.dom.disabled-report`, context, session.actualDisabled, session.reportedDisabled);
  if (!Array.isArray(session.controls) || !Array.isArray(session.inputs)) {
    mismatch(out, `${prefix}.dom.controls`, context, "controls and inputs arrays", session);
    return;
  }
  const expectedRows = (state?.Rows ?? []).map((row) => `Row ${row.ID}`);
  compareExact(out, `${prefix}.dom.input-order`, context, expectedRows, session.inputOrder);
  for (const input of session.inputs) {
    const row = (state?.Rows ?? []).find((candidate) => `row-${candidate.ID}-input` === input.key);
    if (!row) mismatch(out, `${prefix}.dom.input-key`, { ...context, key: input.key }, "row input key", input);
    else compareExact(out, `${prefix}.dom.input-live-value`, { ...context, key: input.key }, row.Draft, input.value);
    if (input.disabled !== (state?.Inputs?.ReadOnly === true)) {
      mismatch(out, `${prefix}.dom.input-disabled`, { ...context, key: input.key }, state?.Inputs?.ReadOnly === true, input.disabled);
    }
  }
  const controlsByKey = new Map(session.controls.map((control) => [control.key, control]));
  const treeNodesByKey = new Map();
  visitTree(session.managerSnapshot?.tree, (node, path) => {
    if (node.Kind === 1) treeNodesByKey.set(node.Key, { node, path });
  });
  for (const control of session.controls) {
    const expected = expectedDisabled(session.managerSnapshot, session, control);
    if (control.disabled !== expected) {
      mismatch(out, `${prefix}.dom.control-disabled-policy`, { ...context, key: control.key, path: control.path }, expected, control.disabled);
    }
    if (control.disabledAttribute !== expected) {
      mismatch(out, `${prefix}.dom.control-disabled-attribute`, { ...context, key: control.key, path: control.path }, expected, control.disabledAttribute);
    }
    if (control.disabled !== expected && state?.Inputs?.ReadOnly === true) {
      mismatch(out, `${prefix}.dom.readonly-control-enabled`, { ...context, key: control.key, path: control.path }, true, control.disabled);
    }
    const treeNode = treeNodesByKey.get(control.key);
    if (!treeNode) mismatch(out, `${prefix}.dom.control-tree-key`, { ...context, key: control.key }, "keyed element in snapshot tree", control);
    else if (treeNode.path !== control.path) mismatch(out, `${prefix}.dom.control-path`, { ...context, key: control.key }, treeNode.path, control.path);
    if (state?.Inputs?.ReadOnly === true && (control.tag === "input" || control.tag === "button") && !control.disabled) {
      mismatch(out, `${prefix}.dom.readonly-disabled`, { ...context, key: control.key }, true, false);
    }
  }
  const title = `Title: ${state?.Inputs?.Title ?? ""}`;
  const inbox = `Published: ${state?.Inbox?.length ?? 0}`;
  compareExact(out, `${prefix}.dom.title`, context, title, session.visibleTitle);
  compareExact(out, `${prefix}.dom.inbox-count`, context, inbox, session.visibleInbox);
  if (session.shellOwnership) {
    compareExact(out, `${prefix}.lifecycle.shell-order`, context,
      ["session-tree-view", "session-tree-children"], session.shellOwnership.shellChildren);
    if (session.shellOwnership.viewContained !== true || session.shellOwnership.childrenContained !== true) {
      mismatch(out, `${prefix}.lifecycle.shell-containment`, context, true, session.shellOwnership);
    }
    if (session.parentID !== 0 && session.shellOwnership.physicalParent !== "session-tree-children") {
      mismatch(out, `${prefix}.lifecycle.physical-parent`, context, "session-tree-children", session.shellOwnership.physicalParent);
    }
  }
  if (session.focusWitness !== null && (!isRecord(session.focusWitness) || session.focusWitness.active !== true ||
      typeof session.focusWitness.key !== "string" || !Number.isSafeInteger(session.focusWitness.selectionStart) ||
      !Number.isSafeInteger(session.focusWitness.selectionEnd))) {
    mismatch(out, `${prefix}.focus.witness`, context, "null or active keyed input with integer selection", session.focusWitness);
  }
}

function managerProjection(actor) {
  return {
    tree: clone(actor?.managerTree),
    sessions: (actor?.sessions ?? []).map((session) => ({ id: session.sessionID, snapshot: clone(session.managerSnapshot) })),
    changes: clone(actor?.changes),
  };
}

function nativeSessionSnapshot(frame, sessionID) {
  const session = frame?.frame?.sessions?.find((entry) => entry?.id === sessionID);
  return session?.snapshot ?? null;
}

function nodeAtPath(tree, path) {
  const indexes = pathIndexes(path);
  if (indexes === null) return null;
  let node = tree;
  for (const index of indexes) {
    if (!Array.isArray(node?.Kids) || !node.Kids[index]) return null;
    node = node.Kids[index];
  }
  return node ?? null;
}

function expectedInputActions(scenario, issues) {
  const actions = new Map();
  const focusBySession = new Map();
  for (let index = 0; index < (scenario.actions?.length ?? 0); index += 1) {
    const action = scenario.actions[index];
    if (action?.method !== "dispatch" || action.args?.[1]?.Event !== "input") continue;
    const [sessionID, step] = action.args;
    const beforeFrame = scenario.nativeFrames?.[index - 1];
    const snapshot = nativeSessionSnapshot(beforeFrame, sessionID);
    const node = nodeAtPath(snapshot?.tree, step?.Path);
    if (!snapshot || node?.Kind !== 1 || node.Tag !== "input" || node.Key !== step?.Key) continue;
    const treeDisabled = attrFlag(node, "disabled");
    const stateDisabled = snapshot?.state?.Inputs?.ReadOnly === true;
    if (treeDisabled !== stateDisabled) {
      mismatch(issues, "input.native-disabled-policy", { name: scenario.name, index, sessionID, key: step.Key },
        stateDisabled, treeDisabled);
    }
    const witness = (scenario.inputWitnesses ?? []).find((entry) => entry.actionIndex === index) ?? null;
    const requested = witness?.requested ?? step.Value;
    actions.set(index, { index, sessionID, step, snapshot, disabled: treeDisabled || stateDisabled,
      requested, effective: typeof requested === "string" ? requested.replace(/[\r\n]/g, "") : null,
      witness, focusRequired: false });
    if (!treeDisabled && !stateDisabled && typeof step.Value === "string" && step.Value.length >= 2 &&
        !focusBySession.has(sessionID)) {
      const required = actions.get(index);
      required.focusRequired = true;
      focusBySession.set(sessionID, index);
    }
  }
  return actions;
}

function priorInputValue(scenario, index, actorName, sessionID, key) {
  const previous = scenario.browserFrames?.[index - 1]?.[actorName];
  const session = previous?.sessions?.find((entry) => entry.sessionID === sessionID);
  return session?.inputs?.find((input) => input.key === key)?.value;
}

function validateInputObservation(scenario, index, actionInput, actorName, previousNative, currentNative,
  previousActor, actor, issues, context) {
  const observation = actor?.inputObservation;
  const expectedMode = actionInput.disabled ? "blocked-disabled" : "dispatched";
  if (!isRecord(observation)) {
    mismatch(issues, `input.${actorName}.observation.missing`, context, expectedMode, observation);
    return;
  }
  const beforeValue = priorInputValue(scenario, index, actorName, actionInput.sessionID, actionInput.step.Key);
  if (typeof beforeValue !== "string") {
    mismatch(issues, `input.${actorName}.before-value.missing`, context, "physical input value before action", beforeValue);
  }
  const expectedEffective = actionInput.effective;
  if (expectedEffective === null || expectedEffective !== actionInput.step.Value) {
    mismatch(issues, `input.${actorName}.expected-effective`, context, actionInput.step.Value, expectedEffective);
  }
  const common = {
    mode: expectedMode,
    requested: actionInput.requested,
    key: actionInput.step.Key,
    beforeValue,
    afterValue: actionInput.disabled ? beforeValue : expectedEffective,
  };
  if (!actionInput.disabled) common.effective = expectedEffective;
  for (const [field, value] of Object.entries(common)) {
    compareExact(issues, `input.${actorName}.${field}`, context, value, observation[field]);
  }

  if (!actionInput.disabled) {
    compareExact(issues, `input.${actorName}.event-value`, context, actionInput.step.Value, observation.eventValue);
    compareExact(issues, `input.${actorName}.event-step`, context, actionInput.step, observation.eventStep);
    compareExact(issues, `input.${actorName}.expected-effective-value`, context, expectedEffective,
      observation.expectedEffective);
    compareExact(issues, `input.${actorName}.native-dispatch-count`, context, 1, observation.nativeDispatches);
    compareExact(issues, `input.${actorName}.direct-guard-absent`, context, null, observation.directGuard);
    const dispatches = actor?.managerCalls?.filter((call) => call?.method === "dispatch" &&
      call.args?.[0] === actionInput.sessionID && isDeepStrictEqual(call.args?.[1], actionInput.step)) ?? [];
    compareExact(issues, `input.${actorName}.manager-dispatch-count`, context, 1, dispatches.length);
    if (isRecord(observation.eventStep)) {
      compareExact(issues, `input.${actorName}.event-step-result`, context, actionInput.step, observation.eventStep);
    }
    return;
  }

  compareExact(issues, `input.${actorName}.event-value`, context, null, observation.eventValue);
  compareExact(issues, `input.${actorName}.event-step`, context, null, observation.eventStep);
  compareExact(issues, `input.${actorName}.native-dispatch-count`, context, 0, observation.nativeDispatches);
  compareExact(issues, `input.${actorName}.native-click`, context, true, observation.nativeClick);
  compareExact(issues, `input.${actorName}.native-click-events`, context, 0, observation.nativeClickEvents);
  compareExact(issues, `input.${actorName}.native-input-events`, context, 0, observation.nativeInputEvents);
  const preSnapshot = nativeSessionSnapshot(previousNative, actionInput.sessionID);
  const postSnapshot = nativeSessionSnapshot(currentNative, actionInput.sessionID);
  for (const [field, expected] of [
    ["snapshotBefore", preSnapshot], ["snapshotAfter", preSnapshot],
  ]) compareExact(issues, `input.${actorName}.${field}`, context, expected, observation[field]);
  compareExact(issues, `input.${actorName}.native-changes-before`, context, [], observation.nativeChangesBefore);
  compareExact(issues, `input.${actorName}.native-changes-after`, context, [], observation.nativeChangesAfter);

  const unchanged = previousNative && currentNative &&
    isDeepStrictEqual(frameStateProjection(previousNative.frame), frameStateProjection(currentNative.frame)) &&
    isDeepStrictEqual(currentNative.frame?.changes, []) &&
    isDeepStrictEqual(frameStateProjection(managerProjection(previousActor)),
      frameStateProjection(managerProjection(actor))) &&
    isDeepStrictEqual(actor?.changes, []);
  if (!unchanged) mismatch(issues, `input.${actorName}.blocked-state-unchanged`, context,
    { manager: frameStateProjection(previousNative?.frame), changes: [] },
    { native: frameStateProjection(currentNative?.frame), manager: frameStateProjection(managerProjection(actor)), changes: actor?.changes });

  const guard = observation.directGuard;
  const directDispatches = actor?.managerCalls?.filter((call) => call?.method === "dispatch" &&
    call.args?.[0] === actionInput.sessionID && isDeepStrictEqual(call.args?.[1], actionInput.step)) ?? [];
  if (guard !== null) {
    if (!isRecord(guard)) {
      mismatch(issues, `input.${actorName}.direct-guard.shape`, context, "null or direct-manager-guard record", guard);
      return;
    }
    compareExact(issues, `input.${actorName}.direct-guard.mode`, context, "direct-manager-guard", guard.mode);
    compareExact(issues, `input.${actorName}.direct-guard.method`, context, "dispatch", guard.method);
    compareExact(issues, `input.${actorName}.direct-guard.args`, context,
      [actionInput.sessionID, actionInput.step], guard.args);
    compareExact(issues, `input.${actorName}.direct-guard.calls`, context, 1, guard.dispatchCalls);
    compareExact(issues, `input.${actorName}.direct-guard.snapshot-before`, context, preSnapshot, guard.snapshotBefore);
    compareExact(issues, `input.${actorName}.direct-guard.snapshot-after`, context, preSnapshot, guard.snapshotAfter);
    compareExact(issues, `input.${actorName}.direct-guard.changes-before`, context, [], guard.changesBefore);
    compareExact(issues, `input.${actorName}.direct-guard.changes-after`, context, [], guard.changesAfter);
    compareExact(issues, `input.${actorName}.direct-guard.manager-call-count`, context, 1, directDispatches.length);
    const guardCall = directDispatches[0];
    if (Object.hasOwn(guard, "result")) {
      compareExact(issues, `input.${actorName}.direct-guard.result`, context, preSnapshot, guard.result);
      if (guardCall) compareExact(issues, `input.${actorName}.direct-guard.manager-result`, context,
        guard.result, guardCall.result);
    } else if (Object.hasOwn(guard, "error")) {
      if (guardCall) compareExact(issues, `input.${actorName}.direct-guard.manager-error-present`, context,
        true, typeof guardCall.error === "string" || isErrorResult(guardCall.result));
    } else {
      mismatch(issues, `input.${actorName}.direct-guard.result-missing`, context,
        "result or error field", guard);
    }
  } else {
    compareExact(issues, `input.${actorName}.direct-guard.manager-call-count`, context, 0, directDispatches.length);
  }
}

function commandsFromManagerCalls(actor, context, issues, actorName) {
  const calls = actor?.managerCalls;
  const effects = [];
  const expected = [];
  if (!Array.isArray(calls)) return { effects, expected };
  for (const [callIndex, call] of calls.entries()) {
    if (!isRecord(call)) continue;
    if (call.method === "effects") {
      if (Array.isArray(call.result)) {
        const sessionID = call.args?.[0];
        effects.push({ sessionID, commands: call.result });
        for (const command of call.result) expected.push({ sessionID, command, source: "effects", callIndex });
      } else if (!call.error && !isErrorResult(call.result)) {
        mismatch(issues, `transport.${actorName}.effects-result`, context, "command array or rejected manager call", call);
      }
    }
    if (call.method === "disposeTree" && Array.isArray(call.result)) {
      for (const [bundleIndex, bundle] of call.result.entries()) {
        if (!isRecord(bundle) || !Array.isArray(bundle.Commands)) {
          mismatch(issues, `transport.${actorName}.dispose-bundle`, { ...context, callIndex, bundleIndex },
            "{SessionID, Commands[]} bundle", bundle);
          continue;
        }
        for (const command of bundle.Commands) expected.push({ sessionID: bundle.SessionID, command,
          source: "disposeTree", callIndex, bundleIndex });
      }
    }
  }
  return { effects, expected };
}

function validateTransportActor(actor, actorName, context, issues, expectedClockBefore = null) {
  for (const [field, value] of [["managerEffects", actor?.managerEffects], ["managerCalls", actor?.managerCalls],
    ["transportCalls", actor?.transportCalls]]) {
    if (!Array.isArray(value)) mismatch(issues, `transport.${actorName}.${field}.missing`, context,
      `${field} array (empty when unused)`, value);
  }
  const clock = actor?.transportClock;
  if (!isRecord(clock) || !Number.isSafeInteger(clock.before) || clock.before < 0 ||
      !Number.isSafeInteger(clock.after) || clock.after < clock.before) {
    mismatch(issues, `transport.${actorName}.clock.shape`, context, "{before,after} nonnegative safe integer clock", clock);
    return { after: expectedClockBefore };
  }
  if (expectedClockBefore !== null) compareExact(issues, `transport.${actorName}.clock.before`, context,
    expectedClockBefore, clock.before);
  const events = Array.isArray(actor?.transportCalls) ? actor.transportCalls : [];
  compareExact(issues, `transport.${actorName}.clock.delta`, context, events.length, clock.after - clock.before);
  events.forEach((event, index) => {
    const eventContext = { ...context, eventIndex: index };
    if (!isRecord(event)) {
      mismatch(issues, `transport.${actorName}.event.shape`, eventContext, "transport invocation record", event);
      return;
    }
    compareExact(issues, `transport.${actorName}.event.side`, eventContext, actorName, event.side);
    if (!Number.isSafeInteger(event.sessionID) || event.sessionID <= 0) {
      mismatch(issues, `transport.${actorName}.event.session`, eventContext, "positive safe session ID", event.sessionID);
    }
    compareExact(issues, `transport.${actorName}.event.sequence`, eventContext, clock.before + index + 1, event.sequence);
    if (!Number.isSafeInteger(event.hostGeneration) || event.hostGeneration <= 0) {
      mismatch(issues, `transport.${actorName}.event.generation`, eventContext, "positive safe host generation", event.hostGeneration);
    }
    if (!new Set(["start", "cancel", "delivery"]).has(event.kind)) {
      mismatch(issues, `transport.${actorName}.event.kind`, eventContext, ["start", "cancel", "delivery"], event.kind);
    }
    if (!isRecord(event.payload)) mismatch(issues, `transport.${actorName}.event.payload`, eventContext,
      "kind-specific payload record", event.payload);
  });
  return { after: clock.after };
}

function validateTransportScenario(scenario, issues) {
  const clocks = { candidate: 0, reference: 0 };
  const requestStates = { candidate: new Map(), reference: new Map() };
  for (const [index, browser] of (scenario.browserFrames ?? []).entries()) {
    const context = { name: scenario.name, index, method: scenario.actions?.[index]?.method };
    for (const actorName of ["candidate", "reference"]) {
      const actor = browser?.[actorName];
      const clock = validateTransportActor(actor, actorName, context, issues, clocks[actorName]);
      if (Number.isSafeInteger(clock.after)) clocks[actorName] = clock.after;
      const { effects, expected } = commandsFromManagerCalls(actor, context, issues, actorName);
      compareExact(issues, `transport.${actorName}.effects-channel`, context, effects, actor?.managerEffects);
      const actualCommands = (Array.isArray(actor?.transportCalls) ? actor.transportCalls : [])
        .filter((event) => event?.kind === "start" || event?.kind === "cancel");
      compareExact(issues, `transport.${actorName}.command-count`, context, expected.length, actualCommands.length);
      for (const [commandIndex, expectedCommand] of expected.entries()) {
        const actual = actualCommands[commandIndex];
        const command = expectedCommand.command;
        const commandContext = { ...context, commandIndex, source: expectedCommand.source,
          sessionID: expectedCommand.sessionID };
        if (!isRecord(command) || !["start", "cancel"].includes(command.Kind) ||
            !Number.isSafeInteger(command.ID) || command.ID <= 0 || typeof command.Value !== "string") {
          mismatch(issues, `transport.${actorName}.manager-command.shape`, commandContext,
            "start/cancel command with positive ID and string Value", command);
          continue;
        }
        if (command.Kind === "cancel" && command.Value !== "") {
          mismatch(issues, `transport.${actorName}.cancel.value`, commandContext, "", command.Value);
        }
        if (!actual) continue;
        compareExact(issues, `transport.${actorName}.command.kind`, commandContext, command.Kind, actual.kind);
        compareExact(issues, `transport.${actorName}.command.session`, commandContext, expectedCommand.sessionID, actual.sessionID);
        if (!isRecord(actual.payload)) continue;
        if (command.Kind === "start") {
          compareExact(issues, `transport.${actorName}.start.payload`, commandContext,
            { ID: command.ID, Value: command.Value, command }, actual.payload);
        } else {
          compareExact(issues, `transport.${actorName}.cancel.id`, commandContext, command.ID, actual.payload.ID);
          if (typeof actual.payload.ignored !== "boolean" ||
              !["missing", "held", "cancelled", "delivered", null].includes(actual.payload.previousState)) {
            mismatch(issues, `transport.${actorName}.cancel.ownership`, commandContext,
              "previousState plus ignored flag for once-only cancellation ownership", actual.payload);
          }
        }
      }
      const allEvents = Array.isArray(actor?.transportCalls) ? actor.transportCalls : [];
      const action = scenario.actions?.[index];
      if (action?.method === "complete") {
        const targetSessionID = action.args?.[0];
        const previousActor = scenario.browserFrames?.[index - 1]?.[actorName];
        const hasHostTransport = previousActor?.sessions?.some((session) => session.sessionID === targetSessionID) === true;
        compareExact(issues, `transport.${actorName}.delivery-count`, context,
          hasHostTransport ? 1 : 0, allEvents.filter((event) => event?.kind === "delivery").length);
      }
      for (const event of allEvents) {
        if (!isRecord(event)) continue;
        const sessionHistory = (scenario.browserFrames ?? []).slice(0, index + 1).reverse()
          .map((frame) => frame?.[actorName]?.sessions?.find((session) => session.sessionID === event.sessionID))
          .find(Boolean);
        if (!sessionHistory) {
          mismatch(issues, `transport.${actorName}.event.session-provenance`, context,
            "session observed in the actor's lifecycle", event.sessionID);
        } else compareExact(issues, `transport.${actorName}.event.host-generation`, context,
          sessionHistory.generation, event.hostGeneration);
        const payload = event.payload;
        if (!isRecord(payload) || !Number.isSafeInteger(payload.ID) || payload.ID <= 0) continue;
        const requestKey = `${event.sessionID}/${payload.ID}`;
        const states = requestStates[actorName];
        if (event.kind === "start") {
          if (states.has(requestKey)) mismatch(issues, `transport.${actorName}.start.reused-id`, context,
            "first invocation for a session request ID", { event, priorState: states.get(requestKey) });
          states.set(requestKey, "held");
        } else if (event.kind === "cancel") {
          const priorState = states.get(requestKey) ?? "missing";
          const expectedIgnored = priorState !== "missing" && priorState !== "held";
          compareExact(issues, `transport.${actorName}.cancel.previous-state`, context,
            priorState, payload.previousState ?? "missing");
          compareExact(issues, `transport.${actorName}.cancel.ignored`, context, expectedIgnored, payload.ignored);
          if (!expectedIgnored) states.set(requestKey, "cancelled");
        } else if (event.kind === "delivery") {
          const priorState = states.get(requestKey) ?? "missing";
          compareExact(issues, `transport.${actorName}.delivery.request-state`, context,
            priorState, payload.previousState ?? "missing");
          if (priorState === "held") states.set(requestKey, "delivered");
        }
      }
      for (const event of allEvents) {
        if (event?.kind !== "delivery") continue;
        const [sessionID, reply] = action?.method === "complete" ? action.args ?? [] : [];
        if (action?.method !== "complete") {
          mismatch(issues, `transport.${actorName}.delivery.action`, context, "complete action", action?.method);
          continue;
        }
        compareExact(issues, `transport.${actorName}.delivery.session`, context, sessionID, event.sessionID);
        compareExact(issues, `transport.${actorName}.delivery.id`, context, reply?.ID, event.payload?.ID);
        compareExact(issues, `transport.${actorName}.delivery.value`, context, reply?.Value, event.payload?.Value);
        compareExact(issues, `transport.${actorName}.delivery.error`, context, reply?.Error, event.payload?.Error);
        if (typeof event.payload?.previousState !== "string") mismatch(issues,
          `transport.${actorName}.delivery.previous-state`, context, "transport request state", event.payload?.previousState);
      }
    }
    compareExact(issues, "transport.candidate-reference.order", context,
      (browser?.candidate?.transportCalls ?? []).map(({ side: _side, ...event }) => event),
      (browser?.reference?.transportCalls ?? []).map(({ side: _side, ...event }) => event));
  }
}

function validateTransitions(previous, current, out, context, prefix) {
  if (!previous || !current) return;
  const previousByID = new Map((previous.sessions ?? []).map((session) => [session.sessionID ?? session.id, session]));
  for (const session of current.sessions ?? []) {
    const sessionID = session.sessionID ?? session.id;
    const before = previousByID.get(sessionID);
    if (!before) continue;
    const oldSnapshot = before.managerSnapshot ?? before.snapshot;
    const newSnapshot = session.managerSnapshot ?? session.snapshot;
    const oldInbox = oldSnapshot?.state?.Inbox;
    const newInbox = newSnapshot?.state?.Inbox;
    if (Array.isArray(oldInbox) && Array.isArray(newInbox)) {
      const retainedPrefix = newInbox.length >= oldInbox.length && oldInbox.every((entry, index) =>
        isDeepStrictEqual(entry, newInbox[index]));
      if (!retainedPrefix) mismatch(out, `${prefix}.transition.inbox-prefix`, context, oldInbox, newInbox);
      const newEntries = newInbox.slice(oldInbox.length);
      const priorSequence = oldInbox.at(-1)?.Sequence ?? 0;
      if (newEntries.some((entry) => !Number.isSafeInteger(entry.Sequence) || entry.Sequence <= priorSequence)) {
        mismatch(out, `${prefix}.transition.inbox-append-order`, context, `new sequences greater than ${priorSequence}`, newEntries);
      }
    }
    const oldMessages = oldSnapshot?.messages;
    const newMessages = newSnapshot?.messages;
    if (Array.isArray(oldMessages) && Array.isArray(newMessages) &&
        (newMessages.length < oldMessages.length || !oldMessages.every((entry, index) => isDeepStrictEqual(entry, newMessages[index])))) {
      mismatch(out, `${prefix}.transition.messages-prefix`, context, oldMessages, newMessages);
    }
  }
}

/** Validate one complete script against the native replay, independent model, and browser actors. */
export function validateScenario(scenario) {
  const issues = [];
  const actions = scenario?.actions;
  if (!Array.isArray(actions)) {
    mismatch(issues, "scenario.actions", { name: scenario?.name }, "actions array", actions);
    return issues;
  }
  const nativeFrames = scenario.nativeFrames;
  const modelFrames = scenario.modelFrames;
  const browserFrames = scenario.browserFrames;
  if (Array.isArray(scenario.browserErrors) && scenario.browserErrors.length > 0) {
    mismatch(issues, "browser.errors", { name: scenario.name }, [], scenario.browserErrors);
  }
  for (const [name, frames] of [["native", nativeFrames], ["model", modelFrames], ["browser", browserFrames]]) {
    if (!Array.isArray(frames) || frames.length === 0) mismatch(issues, `${name}.frames.missing`, { name: scenario.name }, `nonempty ${actions.length}-frame trace`, frames);
    else if (frames.length !== actions.length) mismatch(issues, `${name}.frames.count`, { name: scenario.name }, actions.length, frames.length);
  }
  if (!Array.isArray(nativeFrames) || !Array.isArray(modelFrames) || !Array.isArray(browserFrames)) return issues;
  if (nativeFrames.length === 0) mismatch(issues, "native.empty-frames", { name: scenario.name }, "at least one frame", 0);

  const inputActions = expectedInputActions(scenario, issues);

  let priorNative = null;
  let priorCandidate = null;
  let priorReference = null;
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const native = nativeFrames[index];
    const model = modelFrames[index];
    const browser = browserFrames[index];
    const context = { name: scenario.name, index, method: action?.method };
    if (!isRecord(native) || !isRecord(model) || !isRecord(browser)) {
      mismatch(issues, "frame.shape", context, "native/model/browser frame objects", { native, model, browser });
      continue;
    }
    compareExact(issues, "frame.action.native", context, action, native.action);
    compareExact(issues, "frame.action.model", context, action, model.action);
    compareExact(issues, "frame.action.browser", context, action, browser.action);
    if (browser.captureOrder !== undefined) compareExact(issues, "frame.focus-capture-order", context,
      ["candidate", "reference"], browser.captureOrder);
    const inputWitness = (scenario.inputWitnesses ?? []).find((entry) => entry.actionIndex === index) ?? null;
    compareExact(issues, "input.witness-action", context, inputWitness, browser.inputWitness ?? null);
    if (inputWitness) {
      const effective = String(inputWitness.requested).replace(/[\r\n]/g, "");
      compareExact(issues, "input.witness-normalization", context, effective, inputWitness.effective);
      const inputAction = inputActions.get(index);
      if (!inputAction) mismatch(issues, "input.witness.native-action", context,
        "valid rendered input dispatch in the pre-action native frame", action);
      else compareExact(issues, "input.witness.action-shape", context,
        { requested: inputWitness.requested, effective: inputWitness.effective, key: inputWitness.key },
        { requested: inputAction.requested, effective: inputAction.effective, key: inputAction.step.Key });
    }
    const inputAction = inputActions.get(index);
    if (inputAction?.witness) {
      for (const actorName of ["candidate", "reference"]) {
        const previousActor = scenario.browserFrames[index - 1]?.[actorName] ?? null;
        validateInputObservation(scenario, index, inputAction, actorName,
          scenario.nativeFrames[index - 1], native, previousActor, browser[actorName], issues, context);
      }
    }
    compareResult(issues, "operation.native-model", context, native.result, model.result);
    compareResult(issues, "operation.native-candidate", context, native.result, browser.operationResults?.candidate);
    compareResult(issues, "operation.native-reference", context, native.result, browser.operationResults?.reference);
    compareExact(issues, "frame.native-model", context, native.frame, model.frame);
    const expectedNativeFrame = native.frame;
    compareExact(issues, "frame.candidate-native", context, expectedNativeFrame, managerProjection(browser.candidate));
    compareExact(issues, "frame.reference-native", context, expectedNativeFrame, managerProjection(browser.reference));
    if (!isDeepStrictEqual(browser.candidate?.managerEffects, browser.reference?.managerEffects)) {
      mismatch(issues, "effects.candidate-reference", context, browser.candidate?.managerEffects, browser.reference?.managerEffects);
    }
    const stripSide = (events) => (events ?? []).map(({ side: _side, ...event }) => event);
    compareExact(issues, "effects.transport-order", context,
      stripSide(browser.candidate?.transportCalls), stripSide(browser.reference?.transportCalls));
    const candidateTree = validateTree(browser.candidate?.managerTree, issues, context, "candidate");
    const referenceTree = validateTree(browser.reference?.managerTree, issues, context, "reference");
    for (const [actorName, actor, treeByID] of [
      ["candidate", browser.candidate, candidateTree], ["reference", browser.reference, referenceTree],
    ]) {
      if (!isRecord(actor)) {
        mismatch(issues, `${actorName}.actor`, context, "complete browser actor", actor);
        continue;
      }
      const ids = (actor.managerTree ?? []).map((entry) => entry.SessionID);
      compareExact(issues, `${actorName}.active-ids`, context, ids, actor.managerList);
      compareExact(issues, `${actorName}.snapshot-ids`, context, ids, actor.snapshotAllIDs);
      compareExact(issues, `${actorName}.host-ids`, context, ids, actor.activeIDs);
      if (!Array.isArray(actor.sessions) || actor.sessions.length !== ids.length) {
        mismatch(issues, `${actorName}.sessions.count`, context, ids.length, actor.sessions?.length);
      }
      const allSequences = new Set();
      const historicalParents = historicalParentMap(actor);
      for (const session of actor.sessions ?? []) {
        validateSession(session, treeByID, historicalParents, allSequences, issues,
          { ...context, sessionID: session.sessionID }, actorName);
      }
      if (actor.settledError !== null) mismatch(issues, `${actorName}.host.settled`, context, null, actor.settledError);
    }
    const candidateFocus = browser.candidate?.focusReplacement ?? null;
    const referenceSession = browser.reference?.sessions?.find((session) => session.sessionID === inputAction?.sessionID);
    const referenceFocus = referenceSession?.focusWitness ?? null;
    if (inputAction?.focusRequired && !candidateFocus) {
      mismatch(issues, "focus.replacement.missing", context,
        { sessionID: inputAction.sessionID, expectedKey: inputAction.step.Key }, candidateFocus);
    } else if (!inputAction?.focusRequired && candidateFocus) {
      mismatch(issues, "focus.replacement.unexpected", context, null, candidateFocus);
    }
    if (inputAction?.focusRequired) {
      compareExact(issues, "focus.reference-session", context, inputAction.sessionID,
        referenceSession?.sessionID);
      if (!referenceFocus?.active || referenceFocus.key !== inputAction.step.Key ||
          referenceFocus.selectionStart >= referenceFocus.selectionEnd ||
          referenceFocus.selectionDirection !== "backward") {
        mismatch(issues, "focus.reference-physical", context,
          { active: true, key: inputAction.step.Key, noncollapsed: true, selectionDirection: "backward" }, referenceFocus);
      }
    }
    if (candidateFocus) {
      const witness = candidateFocus;
      if (witness.error) mismatch(issues, "focus.replacement-error", context, "successful replacement", witness.error);
      else {
        const expectedKey = inputAction?.step.Key ?? witness.expectedKey;
        compareExact(issues, "focus.replacement-target-key", context, expectedKey, witness.expectedKey);
        compareExact(issues, "focus.replacement-before-key", context, expectedKey, witness.before?.key);
        if (!witness.before?.active || witness.before.selectionStart >= witness.before.selectionEnd ||
            witness.before.selectionDirection !== "backward") {
          mismatch(issues, "focus.replacement-witness-range", context,
            { active: true, noncollapsed: true, selectionDirection: "backward" }, witness.before);
        }
        if (witness.before?.key !== witness.after?.key || witness.before?.selectionStart !== witness.after?.selectionStart ||
            witness.before?.selectionEnd !== witness.after?.selectionEnd || witness.before?.selectionDirection !== witness.after?.selectionDirection) {
          mismatch(issues, "focus.replacement-selection", context, witness.before, witness.after);
        }
        if (witness.after?.key !== witness.expectedKey || witness.after?.selectionStart !== witness.before?.selectionStart ||
            witness.after?.selectionEnd !== witness.before?.selectionEnd || witness.after?.selectionDirection !== witness.before?.selectionDirection) {
          mismatch(issues, "focus.replacement-immediate", context, witness.before, witness.after);
        }
        if (witness.afterSettled?.key !== witness.expectedKey || witness.afterSettled?.selectionStart !== witness.before?.selectionStart ||
            witness.afterSettled?.selectionEnd !== witness.before?.selectionEnd || witness.afterSettled?.selectionDirection !== witness.before?.selectionDirection) {
          mismatch(issues, "focus.replacement-settled", context, witness.before, witness.afterSettled);
        }
        if (witness.inputValue !== witness.before?.value && witness.before?.value !== undefined) {
          mismatch(issues, "focus.replacement-value", context, witness.before?.value, witness.inputValue);
        }
        if (inputAction && witness.before?.value !== inputAction.step.Value) {
          mismatch(issues, "focus.replacement-action-value", context, inputAction.step.Value, witness.before?.value);
        }
        const focusSnapshot = nativeSessionSnapshot(native, witness.sessionID);
        compareExact(issues, "focus.replacement-session", context, inputAction?.sessionID, witness.sessionID);
        compareExact(issues, "focus.replacement.snapshot-before", context, focusSnapshot, witness.snapshotBefore);
        compareExact(issues, "focus.replacement.snapshot-after", context, focusSnapshot, witness.snapshotAfter);
        compareExact(issues, "focus.replacement.tree-before", context, native.frame?.tree, witness.treeBefore);
        compareExact(issues, "focus.replacement.tree-after", context, native.frame?.tree, witness.treeAfter);
        if (witness.from === witness.to) mismatch(issues, "focus.replacement-backend", context, "different renderer", witness);
      }
    }
    if (native.frame && (!Array.isArray(native.frame.tree) || !Array.isArray(native.frame.sessions) || !Array.isArray(native.frame.changes))) {
      mismatch(issues, "native.frame.channels", context, "tree/sessions/changes", native.frame);
    }
    validateTransitions(priorNative, native.frame, issues, context, "native");
    validateTransitions(priorCandidate, browser.candidate, issues, context, "candidate");
    validateTransitions(priorReference, browser.reference, issues, context, "reference");
    priorNative = native.frame;
    priorCandidate = browser.candidate;
    priorReference = browser.reference;
  }
  validateTransportScenario(scenario, issues);
  return issues;
}

function frameStateProjection(frame) {
  return {
    tree: frame?.tree,
    sessions: frame?.sessions,
  };
}

function findRejectedMutationProof(scenario, method, predicate) {
  const actionIndex = scenario.actions.findIndex((action) => action.method === method && predicate(action));
  if (actionIndex < 0) return { status: "missing" };
  const previous = actionIndex > 0 ? scenario.nativeFrames[actionIndex - 1] : null;
  const current = scenario.nativeFrames[actionIndex];
  const browser = scenario.browserFrames[actionIndex];
  const rejected = isErrorResult(current?.result) && isErrorResult(scenario.modelFrames[actionIndex]?.result) &&
    isErrorResult(browser?.operationResults?.candidate) && isErrorResult(browser?.operationResults?.reference);
  const unchanged = previous !== null &&
    isDeepStrictEqual(frameStateProjection(previous.frame), frameStateProjection(current?.frame)) &&
    isDeepStrictEqual(current?.frame?.changes, []) &&
    isDeepStrictEqual(frameStateProjection(previous.frame), frameStateProjection(managerProjection(browser?.candidate))) &&
    isDeepStrictEqual(frameStateProjection(previous.frame), frameStateProjection(managerProjection(browser?.reference))) &&
    isDeepStrictEqual(browser?.candidate?.changes, []) && isDeepStrictEqual(browser?.reference?.changes, []);
  return { status: rejected && unchanged ? "rejected-without-mutation" : "failed", actionIndex,
    rejected, unchanged, nativeResult: current?.result, browserResults: browser?.operationResults,
    nativeChanges: current?.frame?.changes, browserChanges: { candidate: browser?.candidate?.changes, reference: browser?.reference?.changes } };
}

export function mutateInboxOrder(scenario) {
  const mutated = clone(scenario);
  const target = mutated.browserFrames?.find((frame) => frame.candidate?.sessions?.some((session) =>
    session.managerSnapshot?.state?.Inbox?.length >= 2));
  if (!target) return { scenario: mutated, mutation: { status: "unavailable" } };
  const session = target.candidate.sessions.find((entry) => entry.managerSnapshot?.state?.Inbox?.length >= 2);
  const inbox = session.managerSnapshot.state.Inbox;
  [inbox[0], inbox[1]] = [inbox[1], inbox[0]];
  session.snapshot.state.Inbox = clone(inbox);
  session.hostSnapshot.state.Inbox = clone(inbox);
  return { scenario: mutated, mutation: { status: "reordered", frameIndex: target.index, sessionID: session.sessionID,
    sequenceBefore: scenario.browserFrames[target.index].candidate.sessions.find((entry) => entry.sessionID === session.sessionID)
      .managerSnapshot.state.Inbox.map((item) => item.Sequence),
    sequenceAfter: inbox.map((item) => item.Sequence) } };
}

export function validateActor(actor, context = {}) {
  const issues = [];
  const treeByID = validateTree(actor?.managerTree, issues, context, "actor");
  const historicalParents = historicalParentMap(actor);
  const allSequences = new Set();
  for (const session of actor?.sessions ?? []) validateSession(session, treeByID, historicalParents, allSequences, issues, context, "actor");
  return issues;
}

export function nativeInputFor(script) {
  return { actions: script.actions.map(({ method, args }) => ({ method, args: clone(args) })) };
}

function parseOptions(argv) {
  const options = { seeds: DEFAULT_SEEDS.slice(), cases: DEFAULT_CASES, maxActions: DEFAULT_MAX_ACTIONS,
    output: resolve(BUILD, "check-report.json") };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
    if (arg === "--seeds") options.seeds = value.split(",").filter(Boolean).map(Number);
    else if (arg === "--cases") options.cases = Number(value);
    else if (arg === "--max-actions") options.maxActions = Number(value);
    else if (arg === "--output") options.output = resolve(process.cwd(), value);
    else throw new Error(`unknown option ${arg}`);
    index += 1;
  }
  return options;
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

async function sha256File(path) {
  return sha256(await readFile(path));
}

function safeName(value) {
  return String(value).normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "script";
}

export async function writeRawArtifacts({ scenarios, issues, outputDir, baseName = "composition" }) {
  const scenarioDir = resolve(outputDir, `${baseName}-scenarios`);
  await mkdir(scenarioDir, { recursive: true });
  const files = [];
  for (const [index, scenario] of scenarios.entries()) {
    const name = `${String(index).padStart(4, "0")}-${safeName(scenario.name)}.json`;
    const path = resolve(scenarioDir, name);
    const encoded = `${JSON.stringify(scenario, null, 2)}\n`;
    await writeFile(path, encoded);
    files.push({ path, name, sha256: sha256(encoded), bytes: Buffer.byteLength(encoded) });
  }
  const mismatchPath = resolve(outputDir, `${baseName}-mismatches.json`);
  const mismatchText = `${JSON.stringify(issues, null, 2)}\n`;
  await writeFile(mismatchPath, mismatchText);
  const manifest = { schema: "gondola.typed-composition.raw/v1", files,
    mismatchArtifact: { path: mismatchPath, sha256: sha256(mismatchText), bytes: Buffer.byteLength(mismatchText), count: issues.length } };
  const manifestPath = resolve(outputDir, `${baseName}-manifest.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { scenarioDir, files, mismatchArtifact: manifest.mismatchArtifact, manifestPath };
}

async function buildBrowserBundles() {
  await mkdir(BUILD, { recursive: true });
  for (const [source, output] of [
    [resolve(ROOT, "keyed-editor/react.mjs"), resolve(BUILD, "react.bundle.mjs")],
    [resolve(HERE, "reference.mjs"), resolve(BUILD, "reference.bundle.mjs")],
  ]) {
    const result = await build({ entryPoints: [source], absWorkingDir: ROOT, bundle: true, format: "esm",
      platform: "browser", target: "es2022", write: false, logLevel: "silent" });
    await writeFile(output, result.outputFiles[0].text);
  }
}

async function assertBuildAssets() {
  const required = ["composition.wasm", "godom.wasm", "wasm_exec.js"];
  for (const name of required) {
    try { await access(resolve(BUILD, name), fsConstants.R_OK); }
    catch { throw new Error(`missing typed-composition build asset ${resolve(BUILD, name)}; run run-typed-composition.sh first`); }
  }
}

async function ensureNativeBinary() {
  const configured = process.env.COMPOSITION_REPLAY_BIN;
  const binary = configured ? resolve(process.cwd(), configured) : resolve(BUILD, "composition-replay");
  try {
    await access(binary, fsConstants.X_OK);
    return binary;
  } catch {
    const result = spawnSync("go", ["build", "-o", binary, "./cmd/composition-replay"],
      { cwd: ROOT, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`native composition replay build failed:\n${result.stderr ?? result.stdout}`);
    return binary;
  }
}

function runNative(binary, input) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(binary, ["-"], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", rejectPromise);
    child.once("close", (code, signal) => {
      if (code !== 0) return rejectPromise(new Error(`native replay exited code=${code} signal=${signal}: ${stderr}`));
      try { resolvePromise(JSON.parse(stdout)); }
      catch (error) { rejectPromise(new Error(`native replay returned invalid JSON: ${error.message}\n${stdout.slice(0, 500)}`)); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function serveStatic() {
  const mime = new Map([
    [".html", "text/html; charset=utf-8"], [".mjs", "text/javascript; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"], [".wasm", "application/wasm"],
    [".css", "text/css; charset=utf-8"], [".json", "application/json; charset=utf-8"],
  ]);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const path = resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
      if (path !== ROOT && !path.startsWith(ROOT + sep)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      const content = await readFile(path);
      response.writeHead(200, { "content-type": mime.get(extname(path)) ?? "application/octet-stream",
        "cache-control": "no-store" });
      response.end(content);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => resolvePromise({ server,
      url: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function browserScript(context, baseURL, selectedScript, disabledNegative = false) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.stack ?? error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(`${baseURL}/typed-composition/fixture.html`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => window.__typedCompositionFixture || window.__typedCompositionStartupError,
      null, { timeout: 30_000 });
    const startupError = await page.evaluate(() => window.__typedCompositionStartupError ?? null);
    if (startupError) throw new Error(`browser fixture startup failed: ${startupError}`);
    const result = disabledNegative
      ? await page.evaluate((script) => window.__typedCompositionFixture.runDisabledDOMNegative(script), selectedScript)
      : await page.evaluate((script) => window.__typedCompositionFixture.runScript(script), selectedScript);
    return { ...result, browserErrors: errors };
  } finally {
    await page.close();
  }
}

async function browserRetainedCallbackFence(context, baseURL) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error?.stack ?? error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(`${baseURL}/typed-composition/fixture.html`, { waitUntil: "load", timeout: 30_000 });
    await page.waitForFunction(() => window.__typedCompositionFixture || window.__typedCompositionStartupError,
      null, { timeout: 30_000 });
    const startupError = await page.evaluate(() => window.__typedCompositionStartupError ?? null);
    if (startupError) throw new Error(`browser fixture startup failed: ${startupError}`);
    return { ...(await page.evaluate(() => window.__typedCompositionFixture.runRetainedCallbackFenceProbe())), browserErrors: errors };
  } catch (error) {
    errors.push(error?.stack ?? String(error));
    return { candidate: null, reference: null, browserErrors: errors };
  } finally {
    await page.close();
  }
}

async function sourceHashes(nativeBinary) {
  const files = [
    "typed-composition/DESIGN.md", "typed-composition/fixture.html", "typed-composition/fixture.mjs",
    "typed-composition/check.mjs", "typed-composition/check.test.mjs", "typed-composition/host.mjs",
    "typed-composition/reference.mjs", "typed-composition/scripts.mjs", "keyed-editor/dom.mjs",
    "keyed-editor/react.mjs", "keyed-editor/host.mjs", "multi-root/host.mjs", "session-tree/host.mjs",
    "session-tree/reference.mjs", "renderer-conformance/adapter.mjs",
    "cmd/composition-wasm/bridge_decode.go", "cmd/composition-wasm/main_stub.go", "cmd/composition-wasm/main_wasm.go",
    "cmd/composition-wasm/bridge_decode_test.go", "cmd/composition-replay/main.go", "cmd/composition-replay/decoder.go",
    "cmd/composition-replay/main_test.go", "composition/manager.go", "composition/manager_test.go",
    "asyncsave/session.go", "asyncsave/session_test.go", "collection/session.go", "collection/session_test.go",
    "gobi/build.go", "gobi/compare_interaction.go", "gobi/compare_interaction_test.go", "gobi/html.go",
    "gobi/names.go", "gobi/node.go", "gobi/rules_test.go", "inputbinding/binding.go", "inputbinding/binding_test.go",
    "multisession/manager.go", "multisession/manager_test.go", "multisession/manager_tree_test.go",
    "go.mod", "interaction/package.json", "interaction/package-lock.json",
    "typed-composition/build/composition.wasm", "typed-composition/build/godom.wasm",
    "typed-composition/build/wasm_exec.js", "typed-composition/build/react.bundle.mjs",
    "typed-composition/build/reference.bundle.mjs",
  ];
  const hashes = {};
  for (const relative of files) {
    const path = resolve(ROOT, relative);
    try { hashes[relative] = await sha256File(path); }
    catch (error) { throw new Error(`source pin is missing ${relative}: ${error.message}`); }
  }
  hashes[nativeBinary.slice(ROOT.length + 1)] = await sha256File(nativeBinary);
  return hashes;
}

function runNodeModel(script) {
  const reference = createCompositionReference();
  return script.actions.map((action) => {
    let result;
    try {
      const method = reference[action.method];
      if (typeof method !== "function") throw new TypeError(`unknown composition method ${action.method}`);
      result = method(...action.args);
    } catch (error) {
      result = { error: error instanceof Error ? error.message : String(error) };
    }
    const tree = reference.tree();
    const sessions = reference.list().map((id) => ({ id, snapshot: reference.snapshot(id) }));
    const changes = reference.changes();
    return { action: clone(action), result: clone(result), frame: { tree: clone(tree), sessions: clone(sessions), changes: clone(changes) } };
  });
}

function validateNativeCoverage(scenario, issues) {
  if (!Array.isArray(scenario.nativeFrames) || scenario.nativeFrames.length === 0) {
    mismatch(issues, "native.missing-frames", { name: scenario.name }, "nonempty native frames", scenario.nativeFrames);
    return;
  }
  if (scenario.nativeFrames.length !== scenario.actions.length) {
    mismatch(issues, "native.action-count", { name: scenario.name }, scenario.actions.length, scenario.nativeFrames.length);
  }
  for (const [index, frame] of scenario.nativeFrames.entries()) {
    if (!isRecord(frame?.frame) || !Array.isArray(frame.frame.tree) || !Array.isArray(frame.frame.sessions) ||
        !Array.isArray(frame.frame.changes)) {
      mismatch(issues, "native.incomplete-frame", { name: scenario.name, index }, "tree/sessions/changes", frame);
    }
  }
}

async function writeShard(directory, index, scenario) {
  await mkdir(directory, { recursive: true });
  const name = `${String(index).padStart(4, "0")}-${safeName(scenario.name)}.json`;
  const path = resolve(directory, name);
  const encoded = `${JSON.stringify(scenario, null, 2)}\n`;
  await writeFile(path, encoded);
  return { name, path, bytes: Buffer.byteLength(encoded), sha256: sha256(encoded) };
}

function validateMutationControl(actor, mutation, label) {
  const issues = validateActor(actor, { control: label });
  return { status: issues.some((issue) => issue.field.includes("disabled")) ? "detected" : "failed",
    mutation: clone(mutation), mismatchFields: issues.map((issue) => issue.field), issues };
}

function validateMutationOrder(mutated) {
  const issues = validateScenario(mutated.scenario);
  const detected = issues.some((issue) => issue.field.includes("inbox.sequence-order") || issue.field.includes("inbox-prefix"));
  return { status: detected ? "detected" : "failed", mutation: clone(mutated.mutation),
    mismatchFields: issues.map((issue) => issue.field), issues };
}

export function validateRetainedCallbackFence(probe) {
  const issues = [];
  if (Array.isArray(probe?.browserErrors) && probe.browserErrors.length > 0) {
    mismatch(issues, "callback-fence.browser-errors", {}, [], probe.browserErrors);
  }
  const candidate = probe?.candidate;
  const reference = probe?.reference;
  for (const [sideName, side] of [["candidate", candidate], ["reference", reference]]) {
    const context = { side: sideName };
    if (!isRecord(side)) {
      mismatch(issues, "callback-fence.side-missing", context, "complete callback-fence witness", side);
      continue;
    }
    if (side.old?.pendingSnapshot?.state?.Rows?.[0]?.PendingID !== side.old?.pendingID || side.old?.pendingID <= 0) {
      mismatch(issues, "callback-fence.pending-not-retained", context,
        "old child has a nonzero pending request before disposal", side.old);
    }
    if (side.old?.savedCallbackRetained !== true || side.old?.transportStateBeforeDelivery !== "cancelled") {
      mismatch(issues, "callback-fence.callback-not-retained", context,
        { savedCallbackRetained: true, transportStateBeforeDelivery: "cancelled" }, side.old);
    }
    const oldIDs = new Set([side.old?.rootID, side.old?.childID]);
    if (!Array.isArray(side.freshIDs) || side.freshIDs.length !== 2 || side.freshIDs.some((id) => oldIDs.has(id))) {
      mismatch(issues, "callback-fence.recreation-ids", context,
        "fresh root and child IDs distinct from disposed generation", side.freshIDs);
    }
    if (!isDeepStrictEqual(new Set(side.disposedIDs), oldIDs)) {
      mismatch(issues, "callback-fence.disposal", context, [...oldIDs], side.disposedIDs);
    }
    compareExact(issues, "callback-fence.fresh-manager-unchanged", context,
      side.before?.manager, side.after?.manager);
    compareExact(issues, "callback-fence.fresh-dom-unchanged", context,
      side.before?.dom, side.after?.dom);
    compareExact(issues, "callback-fence.baseline-dirty-empty", context, [], side.before?.changes);
    compareExact(issues, "callback-fence.after-dirty-empty", context, [], side.after?.changes);
    if (side.goCompleteCalls !== 0 || (side.completeCalls?.length ?? 0) !== 0) {
      mismatch(issues, "callback-fence.complete-called", context, 0, side.completeCalls);
    }
    if (side.delivery?.previousState !== "cancelled" ||
        !side.transportEvents?.some((event) => event.kind === "delivery" &&
          (event.ID ?? event.payload?.ID) === side.old?.pendingID)) {
      mismatch(issues, "callback-fence.late-delivery-not-attempted", context,
        "cancelled retained request callback invoked after recreation", { delivery: side.delivery, events: side.transportEvents });
    }
    const freshChild = side.after?.manager?.sessions?.find((entry) => entry.id === side.freshIDs?.[1])?.snapshot;
    if (!freshChild || freshChild.state?.Inbox?.length !== 0 || freshChild.messages?.length !== 0) {
      mismatch(issues, "callback-fence.fresh-child-empty", context,
        { inbox: [], messages: [] }, { inbox: freshChild?.state?.Inbox, messages: freshChild?.messages });
    }
  }
  compareExact(issues, "callback-fence.candidate-reference-manager", {},
    candidate?.after?.manager, reference?.after?.manager);
  if (candidate?.actualGoManager !== true || candidate.goCompleteCalls !== 0) {
    mismatch(issues, "callback-fence.actual-go-not-proved", {},
      { actualGoManager: true, goCompleteCalls: 0 }, candidate);
  }
  return {
    status: issues.length === 0 ? "fenced" : "failed",
    mismatchFields: issues.map((issue) => issue.field),
    issues,
    candidate: clone(candidate),
    reference: clone(reference),
    browserErrors: clone(probe?.browserErrors ?? []),
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parseOptions(argv);
  if (options.help) {
    console.log("Usage: node typed-composition/check.mjs [--seeds a,b] [--cases n] [--max-actions n] [--output path]");
    return;
  }
  if (!Number.isInteger(options.cases) || options.cases < 0 || !Number.isInteger(options.maxActions) || options.maxActions < 9) {
    throw new RangeError("cases must be nonnegative and max-actions must be at least 9");
  }
  await buildBrowserBundles();
  await assertBuildAssets();
  const nativeBinary = await ensureNativeBinary();
  const scripts = makeScripts({ seeds: options.seeds, cases: options.cases, maxActions: options.maxActions });
  const { server, url } = await serveStatic();
  let browser;
  const allIssues = [];
  const shards = [];
  const scriptSummaries = [];
  const fixedEvidence = new Map();
  const started = Date.now();
  try {
    browser = await chromium.launch({ headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ["--no-sandbox"] });
    const context = await browser.newContext();
    for (const [index, script] of scripts.entries()) {
      const nativeInput = nativeInputFor(script);
      const nativeOutput = await runNative(nativeBinary, nativeInput);
      const modelFrames = runNodeModel(script);
      const browserOutput = await browserScript(context, url, script);
      const scenario = {
        name: script.name,
        seed: script.seed ?? null,
        actions: clone(script.actions),
        inputWitnesses: clone(script.inputWitnesses ?? []),
        nativeInput,
        nativeFrames: clone(nativeOutput.frames),
        modelFrames,
        browserFrames: browserOutput.frames,
        versions: browserOutput.versions,
        browserErrors: browserOutput.browserErrors,
      };
      const issues = validateScenario(scenario);
      validateNativeCoverage(scenario, issues);
      allIssues.push(...issues);
      const shard = await writeShard(resolve(dirname(options.output), `${basename(options.output, extname(options.output))}-scenarios`), index, {
        ...scenario, mismatches: issues,
      });
      shards.push(shard);
      if (fixedScripts.some((entry) => entry.name === script.name)) fixedEvidence.set(script.name, scenario);
      scriptSummaries.push({ name: script.name, seed: script.seed ?? null, actions: script.actions.length,
        nativeFrames: nativeOutput.frames?.length ?? 0, mismatchCount: issues.length, rawShard: shard.name, sha256: shard.sha256,
        browserErrors: browserOutput.browserErrors, versions: browserOutput.versions });
      if (issues.length > 0) process.stderr.write(`mismatch: ${script.name} (${issues.length})\n`);
    }

    const publicationScenario = fixedEvidence.get("inputs-publication-races");
    const readonlyScenario = fixedEvidence.get("readonly-pending-reply");
    const parentProof = publicationScenario && findRejectedMutationProof(publicationScenario, "setChildInputs",
      (action) => action.args?.[0] === 3 && action.args?.[1] === 2);
    const revisionProof = publicationScenario && findRejectedMutationProof(publicationScenario, "publish",
      (action) => action.args?.[0] === 2 && action.args?.[1] === 1 && action.args?.[2] === 1);
    const orderMutation = publicationScenario ? mutateInboxOrder(publicationScenario) : null;
    const orderingControl = orderMutation?.mutation.status === "reordered" ? validateMutationOrder(orderMutation) :
      { status: "failed", mutation: orderMutation?.mutation ?? null, mismatchFields: [], issues: [] };
    const disabledScript = fixedScripts.find((entry) => entry.name === "readonly-pending-reply");
    const disabledBrowserOutput = disabledScript ? await browserScript(context, url, disabledScript, true) : null;
    const disabledControl = disabledBrowserOutput?.mutationFrame
      ? validateMutationControl(disabledBrowserOutput.mutationFrame.candidate, disabledBrowserOutput.mutation, "readonly-dom-disabled")
      : { status: "failed", mutation: disabledBrowserOutput?.mutation ?? null, mismatchFields: [], issues: [] };
    const retainedCallbackOutput = await browserRetainedCallbackFence(context, url);
    const retainedCallbackControl = validateRetainedCallbackFence(retainedCallbackOutput);
    const controls = {
      parent: parentProof ?? { status: "failed" },
      revision: revisionProof ?? { status: "failed" },
      inboxOrdering: orderingControl,
      physicalDOMDisabled: disabledControl,
      retainedCallbackAfterRecreation: retainedCallbackControl,
    };
    if (controls.parent.status !== "rejected-without-mutation") {
      mismatch(allIssues, "negative.parent-not-failclosed", { control: "parent" }, "rejected without state/dirty changes", controls.parent);
    }
    if (controls.revision.status !== "rejected-without-mutation") {
      mismatch(allIssues, "negative.revision-not-failclosed", { control: "revision" }, "rejected without state/dirty changes", controls.revision);
    }
    if (controls.inboxOrdering.status !== "detected") {
      mismatch(allIssues, "negative.order-not-detected", { control: "inboxOrdering" }, "mutated publication order detected", controls.inboxOrdering);
    }
    if (controls.physicalDOMDisabled.status !== "detected" || disabledBrowserOutput?.mutation?.disabled !== false ||
        disabledBrowserOutput?.mutation?.wasDisabled !== true || disabledBrowserOutput?.mutation?.expectedReadOnly !== true) {
      mismatch(allIssues, "negative.disabled-not-detected", { control: "physicalDOMDisabled" },
        "actual candidate DOM disabled property mutation detected", controls.physicalDOMDisabled);
    }
    if (controls.retainedCallbackAfterRecreation.status !== "fenced") {
      mismatch(allIssues, "negative.retained-callback-not-fenced", { control: "retainedCallbackAfterRecreation" },
        "retained callback attempted after disposal/recreation with zero Go Complete calls and unchanged fresh tree", controls.retainedCallbackAfterRecreation);
    }
    if (orderMutation) {
      const shard = await writeShard(resolve(dirname(options.output), `${basename(options.output, extname(options.output))}-scenarios`),
        shards.length, { name: "control-inbox-order-mutation", ...orderMutation, control: orderingControl });
      shards.push(shard);
    }
    if (disabledBrowserOutput) {
      const shard = await writeShard(resolve(dirname(options.output), `${basename(options.output, extname(options.output))}-scenarios`),
        shards.length, { name: "control-physical-disabled-mutation", ...disabledBrowserOutput, control: disabledControl });
      shards.push(shard);
    }
    {
      const shard = await writeShard(resolve(dirname(options.output), `${basename(options.output, extname(options.output))}-scenarios`),
        shards.length, { name: "control-retained-callback-after-recreation", ...retainedCallbackOutput, control: retainedCallbackControl });
      shards.push(shard);
    }
    await context.close();

    const goVersion = spawnSync("go", ["version"], { cwd: ROOT, encoding: "utf8" });
    const sourcePins = await sourceHashes(nativeBinary);
    const sourceHash = sha256(JSON.stringify(sourcePins));
    const report = {
      schema: "gondola.typed-composition.report/v1",
      status: allIssues.length === 0 && Object.values(controls).every((control) =>
        control.status === "detected" || control.status === "rejected-without-mutation" || control.status === "fenced") ? "matched" : "mismatched",
      seeds: options.seeds,
      casesPerSeed: options.cases,
      maxActions: options.maxActions,
      fixedScripts: fixedScripts.map((script) => ({ name: script.name, actions: script.actions.length })),
      scripts: scripts.length,
      nativeExecutions: scripts.length,
      actions: scripts.reduce((sum, script) => sum + script.actions.length, 0),
      nativeFrames: scripts.reduce((sum, script) => sum + script.actions.length, 0),
      actorNativeFrameComparisons: scripts.reduce((sum, script) => sum + script.actions.length * 2, 0),
      browserOnlyLifecycleProbes: 1,
      mutationControls: controls,
      rawScenarioDirectory: resolve(dirname(options.output), `${basename(options.output, extname(options.output))}-scenarios`),
      rawScenarioShards: shards,
      mismatchCount: allIssues.length,
      mismatches: allIssues,
      scriptSummaries,
      browser: { chromium: browser.version(), ...browserOutputVersion(scriptSummaries) },
      toolchain: { node: process.version, platform: process.platform,
        go: (goVersion.stdout ?? "").trim() || "unavailable on PATH", nativeReplay: nativeBinary },
      sourcePins,
      sourceSetSHA256: sourceHash,
      commands: [`COMPOSITION_REPLAY_BIN=${nativeBinary} node typed-composition/check.mjs --seeds ${options.seeds.join(",")} --cases ${options.cases} --max-actions ${options.maxActions} --output ${options.output}`],
      elapsedMs: Date.now() - started,
    };
    const outputDir = dirname(options.output);
    await mkdir(outputDir, { recursive: true });
    const rawArtifacts = await writeRawArtifacts({ scenarios: [], issues: allIssues, outputDir,
      baseName: basename(options.output, extname(options.output)) });
    const manifest = { schema: "gondola.typed-composition.raw/v1", files: shards,
      mismatchArtifact: rawArtifacts.mismatchArtifact };
    await writeFile(rawArtifacts.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    report.mismatchArtifact = rawArtifacts.mismatchArtifact;
    report.rawManifest = rawArtifacts.manifestPath;
    const encoded = `${JSON.stringify(report, null, 2)}\n`;
    await writeFile(options.output, encoded);
    const digest = sha256(encoded);
    console.log(JSON.stringify({ status: report.status, scripts: report.scripts, actions: report.actions,
      nativeExecutions: report.nativeExecutions, nativeFrames: report.nativeFrames,
      actorNativeFrameComparisons: report.actorNativeFrameComparisons,
      mutationControls: Object.fromEntries(Object.entries(controls).map(([key, value]) => [key, value.status])),
      mismatches: report.mismatchCount, report: options.output, sha256: digest }, null, 2));
    if (report.status !== "matched") process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    await new Promise((resolvePromise) => server.close(resolvePromise));
  }
}

function browserOutputVersion(summaries) {
  const first = summaries[0];
  return { react: first?.versions?.react ?? null, reactDOM: first?.versions?.reactDOM ?? null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
