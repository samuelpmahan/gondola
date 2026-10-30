#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { DEFAULT_CASES, DEFAULT_MAX_ACTIONS, DEFAULT_SEEDS, MAX_GENERATED_SESSIONS, fixedScripts, makeScripts, parseSeedList } from "./scripts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUILD = resolve(HERE, "build");
const requireFromInteraction = createRequire(resolve(ROOT, "interaction/package.json"));
const { chromium } = requireFromInteraction("playwright");
const ACTORS = ["candidate", "reference"];
const REQ_SESSION = [
  "name", "sessionID", "parentID", "parentName", "depth", "generation", "hostGeneration", "backend",
  "managerSnapshot", "snapshot", "hostSnapshot", "audit", "managerAudit", "domSnapshot", "focus", "lifecycle", "errors",
  "actualDOM", "shellHTML", "controls", "inputs", "inputOrder", "expectedInputOrder", "focusWitness",
  "shellToken", "viewRootToken", "childrenRootToken", "shellChildTokens", "shellOrderValid", "physicalParentToken",
  "physicalParentValid", "transportLog",
];
const REQ_ACTOR = ["managerTree", "hostTree", "managerList", "sessions", "snapshotAllIDs", "activeIDs", "transports", "transportCalls", "rootSlots"];
const MAX_CONTROL_ROWS = 4;
const EMPTY_STEP = { Path: "", Event: "", Value: "" };
const own = (value) => value === undefined ? null : value;

function mismatch(out, field, tick, action, expected, actual, actor = null) {
  out.push({ field, tick, action: action ?? null, actor, expected: compact(expected), actual: compact(actual) });
}

function compact(value) {
  const text = JSON.stringify(own(value));
  return text === undefined ? "<undefined>" : text.length > 1200 ? `${text.slice(0, 1197)}...` : value;
}

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function derivePostorder(records, rootID) {
  if (!Array.isArray(records)) throw new TypeError("tree records must be an array");
  const byID = new Map(records.map((record) => [record?.SessionID, record]));
  if (!byID.has(rootID)) throw new Error(`postorder root ${rootID} is absent`);
  const children = new Map();
  for (const record of records) {
    if (!Number.isSafeInteger(record.SessionID) || !Number.isSafeInteger(record.ParentID)) throw new Error("tree record has an invalid ID");
    if (record.ParentID !== 0) {
      if (!children.has(record.ParentID)) children.set(record.ParentID, []);
      children.get(record.ParentID).push(record.SessionID);
    }
  }
  for (const list of children.values()) list.sort((a, b) => a - b);
  const visiting = new Set();
  const visited = new Set();
  const result = [];
  function visit(id) {
    if (visiting.has(id)) throw new Error(`tree cycle at ${id}`);
    if (visited.has(id)) throw new Error(`tree has duplicate reachability at ${id}`);
    visiting.add(id);
    for (const child of children.get(id) ?? []) visit(child);
    visiting.delete(id);
    visited.add(id);
    result.push(id);
  }
  visit(rootID);
  return result;
}

function sortedIDs(records) { return records.map((record) => record.SessionID).sort((a, b) => a - b); }

function validateTree(records, out, field, tick, action, actor) {
  if (!Array.isArray(records)) {
    mismatch(out, `${field}.type`, tick, action, "array", records, actor);
    return;
  }
  const byID = new Map();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!isRecord(record) || !Number.isSafeInteger(record.SessionID) || record.SessionID <= 0 ||
        !Number.isSafeInteger(record.ParentID) || record.ParentID < 0 ||
        !Number.isSafeInteger(record.Depth) || record.Depth < 1 || record.Depth > 32) {
      mismatch(out, `${field}[${index}]`, tick, action, "positive session, nonnegative parent and depth 1..32", record, actor);
      continue;
    }
    if (byID.has(record.SessionID)) mismatch(out, `${field}.duplicate`, tick, action, "unique session IDs", record.SessionID, actor);
    if (index > 0 && records[index - 1]?.SessionID >= record.SessionID) {
      mismatch(out, `${field}.order`, tick, action, "ascending session IDs", records.map((item) => item?.SessionID), actor);
    }
    byID.set(record.SessionID, record);
  }
  for (const record of records) {
    if (!isRecord(record)) continue;
    if (record.ParentID === 0) {
      if (record.Depth !== 1) mismatch(out, `${field}.root-depth`, tick, action, 1, record.Depth, actor);
    } else {
      const parent = byID.get(record.ParentID);
      if (!parent || record.Depth !== parent.Depth + 1) {
        mismatch(out, `${field}.parent-depth`, tick, action, "existing parent at depth-1", record, actor);
      }
    }
  }
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function expectedNativeStep(action, previousSnapshot) {
  if (!action || !previousSnapshot) return EMPTY_STEP;
  if (action.kind === "add") return { Path: "0", Event: "click", Value: "" };
  if (action.kind === "fill") {
    const binding = previousSnapshot.bindings?.find((entry) => entry.Message === `edit/${action.rowID}`);
    return { Path: binding?.Path ?? "", Event: "input", Value: String(action.value).replace(/[\r\n]/g, "") };
  }
  if (action.kind === "save") {
    const rowIndex = previousSnapshot.state?.Rows?.findIndex((row) => row.ID === action.rowID) ?? -1;
    return { Path: rowIndex < 0 ? "" : `2/${rowIndex}/5`, Event: "click", Value: "" };
  }
  if (action.kind === "release") return {
    Path: "", Event: `release:${action.error ? "error" : "success"}`, Value: String(action.requestID),
  };
  return EMPTY_STEP;
}

function validateSession(session, tickIndex, action, side, out) {
  if (!isRecord(session)) {
    mismatch(out, "session.type", tickIndex, action, "object", session, side);
    return;
  }
  for (const field of REQ_SESSION) {
    if (!Object.hasOwn(session, field)) mismatch(out, `session.missing.${field}`, tickIndex, action, "present channel", undefined, side);
  }
  if (typeof session.name !== "string" || session.name.length === 0) mismatch(out, "session.name", tickIndex, action, "nonempty string", session.name, side);
  for (const field of ["sessionID", "generation", "depth", "shellToken", "viewRootToken", "childrenRootToken"]) {
    if (!Number.isSafeInteger(session[field]) || session[field] < 0) mismatch(out, `session.${field}`, tickIndex, action, "nonnegative safe integer", session[field], side);
  }
  if (!Number.isSafeInteger(session.parentID) || session.parentID < 0) mismatch(out, "session.parentID", tickIndex, action, "nonnegative safe integer", session.parentID, side);
  if (typeof session.backend !== "string" || !session.backend) mismatch(out, "session.backend", tickIndex, action, "nonempty string", session.backend, side);
  if (!isRecord(session.snapshot) || !isRecord(session.snapshot.state) || !isRecord(session.snapshot.tree) ||
      !Array.isArray(session.snapshot.bindings) || !Array.isArray(session.snapshot.messages)) {
    mismatch(out, "session.snapshot", tickIndex, action, "state/tree objects and bindings/messages arrays", session.snapshot, side);
  }
  for (const field of ["managerSnapshot", "snapshot", "hostSnapshot"]) {
    if (!isRecord(session[field]) || !isRecord(session[field].state) || !isRecord(session[field].tree) ||
        !Array.isArray(session[field].bindings) || !Array.isArray(session[field].messages)) {
      mismatch(out, `session.${field}`, tickIndex, action, "complete collection snapshot", session[field], side);
    }
  }
  if (!Array.isArray(session.audit)) mismatch(out, "session.audit", tickIndex, action, "array", session.audit, side);
  if (!isRecord(session.domSnapshot) || typeof session.domSnapshot.html !== "string" || !Array.isArray(session.domSnapshot.disabled)) {
    mismatch(out, "session.domSnapshot", tickIndex, action, "html string and disabled array", session.domSnapshot, side);
  }
  if (typeof session.actualDOM !== "string") mismatch(out, "session.actualDOM", tickIndex, action, "string", session.actualDOM, side);
  else if (session.domSnapshot?.html !== session.actualDOM) mismatch(out, "session.domSnapshot.html", tickIndex, action, session.actualDOM, session.domSnapshot?.html, side);
  if (typeof session.shellHTML !== "string") mismatch(out, "session.shellHTML", tickIndex, action, "string", session.shellHTML, side);
  if (session.shellOrderValid !== true || !Array.isArray(session.shellChildTokens) || session.shellChildTokens.length !== 2) {
    mismatch(out, "session.shell-ownership", tickIndex, action, "viewRoot and childrenRoot are ordered shell children", session.shellChildTokens, side);
  }
  if (session.physicalParentValid !== true || !Number.isSafeInteger(session.physicalParentToken)) {
    mismatch(out, "session.physical-parent", tickIndex, action, "root slot or parent childrenRoot owns shell", session.physicalParentToken, side);
  }
  if (session.focus !== null && (!isRecord(session.focus) ||
      typeof (session.focus.key ?? session.focus.Key) !== "string" ||
      !Number.isSafeInteger(session.focus.selectionStart ?? session.focus.SelectionStart) ||
      !Number.isSafeInteger(session.focus.selectionEnd ?? session.focus.SelectionEnd))) {
    mismatch(out, "session.focus-shape", tickIndex, action, "null or keyed logical focus with integer selection", session.focus, side);
  }
  if (session.focusWitness !== null && (!isRecord(session.focusWitness) || session.focusWitness.active !== true ||
      typeof session.focusWitness.key !== "string" || !Number.isSafeInteger(session.focusWitness.selectionStart) ||
      !Number.isSafeInteger(session.focusWitness.selectionEnd))) {
    mismatch(out, "session.focus-witness-shape", tickIndex, action, "null or active logical DOM focus witness", session.focusWitness, side);
  }
  if (session.lifecycle !== "active") mismatch(out, "session.lifecycle", tickIndex, action, "active", session.lifecycle, side);
  if (!Array.isArray(session.errors) || session.errors.length !== 0) mismatch(out, "session.errors", tickIndex, action, [], session.errors, side);
  if (!Array.isArray(session.controls) || !Array.isArray(session.inputs) || !Array.isArray(session.inputOrder) ||
      !Array.isArray(session.expectedInputOrder) || !Array.isArray(session.transportLog)) {
    mismatch(out, "session.live-channels", tickIndex, action, "controls/inputs/orders/transport arrays", session, side);
  }
  if (session.snapshot && isRecord(session.managerSnapshot) && isRecord(session.hostSnapshot)) {
    if (!isDeepStrictEqual(session.snapshot, session.managerSnapshot)) mismatch(out, "session.manager-snapshot", tickIndex, action, session.snapshot, session.managerSnapshot, side);
    if (!isDeepStrictEqual(session.snapshot, session.hostSnapshot)) mismatch(out, "session.host-snapshot", tickIndex, action, session.snapshot, session.hostSnapshot, side);
  }
  if (!Array.isArray(session.managerAudit)) mismatch(out, "session.manager-audit", tickIndex, action, "array", session.managerAudit, side);
  else if (!isDeepStrictEqual(session.audit, session.managerAudit)) mismatch(out, "session.audit-parity", tickIndex, action, session.managerAudit, session.audit, side);

  const rows = session.snapshot?.state?.Rows;
  if (Array.isArray(rows)) {
    const wantedOrder = rows.map((row) => `Row ${row.ID}`);
    if (!isDeepStrictEqual(session.inputOrder, wantedOrder)) mismatch(out, "session.input-order", tickIndex, action, wantedOrder, session.inputOrder, side);
    if (!isDeepStrictEqual(session.expectedInputOrder, wantedOrder)) mismatch(out, "session.expected-input-order", tickIndex, action, wantedOrder, session.expectedInputOrder, side);
    const inputs = Array.isArray(session.inputs) ? session.inputs : [];
    if (inputs.length !== rows.length) mismatch(out, "session.input-count", tickIndex, action, rows.length, inputs.length, side);
    const inputByLabel = new Map(inputs.map((input) => [input.key, input]));
    for (const row of rows) {
      const label = `Row ${row.ID}`;
      const input = inputByLabel.get(label);
      if (!input) {
        mismatch(out, "session.input-missing", tickIndex, action, label, null, side);
        continue;
      }
      if (input.value !== row.Draft) mismatch(out, "session.input-live-value", tickIndex, action, row.Draft, input.value, side);
      if (input.disabled !== false) mismatch(out, "session.input-disabled", tickIndex, action, false, input.disabled, side);
      if (typeof input.path !== "string") mismatch(out, "session.input-path", tickIndex, action, "DOM child-index path", input.path, side);
    }

    const controls = Array.isArray(session.controls) ? session.controls : [];
    const addControl = controls.find((entry) => entry.tag === "button" && entry.className === "add");
    if (!addControl) mismatch(out, "session.button-missing", tickIndex, action, "Add button", null, side);
    else if (addControl.disabled !== (rows.length >= MAX_CONTROL_ROWS)) {
      mismatch(out, "session.control-disabled.add", tickIndex, action, rows.length >= MAX_CONTROL_ROWS, addControl.disabled, side);
    }
    const resetControl = controls.find((entry) => entry.tag === "button" && entry.className === "reset");
    if (!resetControl) mismatch(out, "session.button-missing", tickIndex, action, "Reset button", null, side);
    else if (resetControl.disabled !== (rows.length === 0)) {
      mismatch(out, "session.control-disabled.reset", tickIndex, action, rows.length === 0, resetControl.disabled, side);
    }
    for (const row of rows) {
      const label = `Row ${row.ID}`;
      for (const [className, disabled] of [["save", row.Draft === ""], ["cancel", row.PendingID === 0]]) {
        const control = controls.find((entry) => entry.tag === "button" && entry.className === className && entry.rowLabel === label);
        if (!control) mismatch(out, "session.button-missing", tickIndex, action, `${label}/${className}`, null, side);
        else if (control.disabled !== disabled) mismatch(out, "session.button-disabled", tickIndex, action, disabled, control.disabled, side);
      }
    }
    for (const [index, row] of rows.entries()) {
      const label = `Row ${row.ID}`;
      const control = controls.find((entry) => entry.tag === "button" && entry.className === "up" && entry.rowLabel === label);
      if (!control) mismatch(out, "session.button-missing", tickIndex, action, `${label}/up`, null, side);
      else if (control.disabled !== (index === 0)) {
        mismatch(out, "session.control-disabled.up", tickIndex, action, index === 0, control.disabled, side);
      }
    }

    const disabledPaths = controls.filter((entry) => entry.disabled).map((entry) => entry.path).sort();
    const reportedDisabled = Array.isArray(session.domSnapshot?.disabled) ? [...session.domSnapshot.disabled].sort() : [];
    if (!isDeepStrictEqual(disabledPaths, reportedDisabled)) mismatch(out, "session.disabled-paths", tickIndex, action, disabledPaths, reportedDisabled, side);
  }
  if (!Array.isArray(session.transportLog)) return;
  let previousSequence = 0;
  const started = new Set();
  const cancelled = new Set();
  for (const event of session.transportLog) {
    if (!isRecord(event) || !Number.isSafeInteger(event.sequence) || event.sequence <= previousSequence) {
      mismatch(out, "session.transport-order", tickIndex, action, `sequence > ${previousSequence}`, event, side);
      continue;
    }
    previousSequence = event.sequence;
    if (event.kind === "start") {
      if (!Number.isSafeInteger(event.ID) || event.ID <= 0 || started.has(event.ID)) mismatch(out, "session.transport-start", tickIndex, action, "unique positive start ID", event, side);
      started.add(event.ID);
    } else if (event.kind === "cancel") {
      if (!started.has(event.ID)) mismatch(out, "session.transport-cancel-before-start", tickIndex, action, "previous start for request", event, side);
      cancelled.add(event.ID);
    } else if (event.kind === "release" || event.kind === "stale-release") {
      if (!started.has(event.ID)) mismatch(out, "session.transport-release-before-start", tickIndex, action, "previous start for request", event, side);
      if (event.kind === "release" && cancelled.has(event.ID)) mismatch(out, "session.transport-release-after-cancel", tickIndex, action, "release before cancellation or stale-release", event, side);
    } else mismatch(out, "session.transport-kind", tickIndex, action, "start/cancel/release/stale-release", event.kind, side);
  }
}

function validateActor(actor, tickIndex, action, side, out) {
  if (!isRecord(actor)) {
    mismatch(out, "actor.type", tickIndex, action, "object", actor, side);
    return;
  }
  for (const field of REQ_ACTOR) if (!Object.hasOwn(actor, field)) mismatch(out, `actor.missing.${field}`, tickIndex, action, "present channel", undefined, side);
  validateTree(actor.managerTree, out, "managerTree", tickIndex, action, side);
  validateTree(actor.hostTree, out, "hostTree", tickIndex, action, side);
  if (!isDeepStrictEqual(actor.managerTree, actor.hostTree)) mismatch(out, "actor.manager-host-tree", tickIndex, action, actor.managerTree, actor.hostTree, side);
  if (!Array.isArray(actor.managerList)) mismatch(out, "actor.manager-list", tickIndex, action, "array", actor.managerList, side);
  else if (!isDeepStrictEqual(actor.managerList, sortedIDs(actor.managerTree ?? []))) mismatch(out, "actor.list-tree", tickIndex, action, sortedIDs(actor.managerTree ?? []), actor.managerList, side);
  const ids = sortedIDs(actor.managerTree ?? []);
  for (const field of ["snapshotAllIDs", "activeIDs"]) {
    if (!Array.isArray(actor[field]) || !isDeepStrictEqual(actor[field], ids)) mismatch(out, `actor.${field}`, tickIndex, action, ids, actor[field], side);
  }
  if (!Array.isArray(actor.sessions)) {
    mismatch(out, "actor.sessions", tickIndex, action, "array", actor.sessions, side);
    return;
  }
  if (actor.sessions.length > MAX_GENERATED_SESSIONS) mismatch(out, "actor.live-session-cap", tickIndex, action, MAX_GENERATED_SESSIONS, actor.sessions.length, side);
  if (!isDeepStrictEqual(actor.sessions.map((session) => session.sessionID), ids)) {
    mismatch(out, "actor.session-ids", tickIndex, action, ids, actor.sessions.map((session) => session?.sessionID), side);
  }
  for (const session of actor.sessions) validateSession(session, tickIndex, action, side, out);
  const sessionByID = new Map(actor.sessions.map((session) => [session.sessionID, session]));
  const treeByID = new Map((actor.managerTree ?? []).map((node) => [node.SessionID, node]));
  for (const session of actor.sessions) {
    const metadata = treeByID.get(session.sessionID);
    if (!metadata) continue;
    const expectedParentID = session.parentName === null ? 0 : sessionByName(actor, session.parentName)?.sessionID;
    if (metadata.ParentID !== expectedParentID || metadata.Depth !== session.depth || session.parentID !== metadata.ParentID) {
      mismatch(out, "actor.symbolic-tree", tickIndex, action,
        { ParentID: expectedParentID, Depth: session.depth, sessionParentID: metadata.ParentID },
        { ParentID: metadata.ParentID, Depth: metadata.Depth, sessionParentID: session.parentID }, side);
    }
  }
  if (!Array.isArray(actor.transports)) mismatch(out, "actor.transports", tickIndex, action, "array", actor.transports, side);
  if (!Array.isArray(actor.transportCalls)) {
    mismatch(out, "actor.transport-calls", tickIndex, action, "per-script global invocation array", actor.transportCalls, side);
  } else {
    let previousSequence = 0;
    const starts = new Set();
    const cancelled = new Set();
    for (const call of actor.transportCalls) {
      if (!isRecord(call) || !Number.isSafeInteger(call.sequence) || call.sequence !== previousSequence + 1 ||
          call.side !== side || !Number.isSafeInteger(call.sessionID) || call.sessionID <= 0 ||
          !Number.isSafeInteger(call.generation) || call.generation <= 0 ||
          !Number.isSafeInteger(call.hostGeneration) || call.hostGeneration <= 0 ||
          !Number.isSafeInteger(call.requestID) || call.requestID <= 0 ||
          !["start", "cancel", "delivery", "stale-delivery"].includes(call.kind) ||
          typeof call.value !== "string" || typeof call.error !== "string") {
        mismatch(out, "actor.transport-call-shape-order", tickIndex, action,
          { sequence: previousSequence + 1, side, sessionID: "positive", generation: "positive", requestID: "positive" }, call, side);
        continue;
      }
      previousSequence = call.sequence;
      const key = `${call.sessionID}:${call.generation}:${call.requestID}`;
      if (call.kind === "start") {
        if (starts.has(key)) mismatch(out, "actor.transport-call-duplicate-start", tickIndex, action, "one start per session/generation/request", call, side);
        starts.add(key);
      } else if (call.kind === "cancel") {
        cancelled.add(key);
      } else if (call.kind === "delivery" || call.kind === "stale-delivery") {
        if (!starts.has(key)) mismatch(out, "actor.transport-call-delivery-before-start", tickIndex, action, "prior start for scoped request", call, side);
        if (call.kind === "delivery" && cancelled.has(key)) mismatch(out, "actor.transport-call-delivery-after-cancel", tickIndex, action, "delivery before cancel or stale delivery", call, side);
      }
    }
  }
}

function sessionByName(actor, name) { return actor.sessions.find((entry) => entry.name === name); }

function normalizedFocus(record) {
  if (!record) return null;
  const start = record.selectionStart ?? record.SelectionStart;
  const end = record.selectionEnd ?? record.SelectionEnd;
  return { key: record.key ?? record.Key, selectionStart: start, selectionEnd: end,
    selectionDirection: start === end ? "none" : record.selectionDirection ?? record.SelectionDirection };
}

function compareActors(candidate, reference, index, action, out) {
  for (const field of ["managerTree", "hostTree", "managerList", "snapshotAllIDs", "activeIDs", "rootSlots"]) {
    if (!isDeepStrictEqual(candidate[field], reference[field])) mismatch(out, `parity.${field}`, index, action, reference[field], candidate[field]);
  }
  const leftByName = new Map((candidate.sessions ?? []).map((session) => [session.name, session]));
  const rightByName = new Map((reference.sessions ?? []).map((session) => [session.name, session]));
  if (!isDeepStrictEqual([...leftByName.keys()].sort(), [...rightByName.keys()].sort())) {
    mismatch(out, "parity.active-names", index, action, [...rightByName.keys()].sort(), [...leftByName.keys()].sort());
  }
  for (const [name, left] of leftByName) {
    const right = rightByName.get(name);
    if (!right) continue;
    for (const field of ["sessionID", "parentID", "parentName", "depth", "generation"]) {
      if (!isDeepStrictEqual(left[field], right[field])) mismatch(out, `parity.${name}.${field}`, index, action, right[field], left[field]);
    }
    for (const field of ["state", "tree", "bindings", "messages"]) {
      if (!isDeepStrictEqual(left.snapshot?.[field] ?? (field === "state" || field === "tree" ? left.snapshot?.[field] : null),
        right.snapshot?.[field] ?? (field === "state" || field === "tree" ? right.snapshot?.[field] : null))) {
        mismatch(out, `parity.${name}.snapshot.${field}`, index, action, right.snapshot?.[field], left.snapshot?.[field]);
      }
    }
    for (const field of ["audit", "actualDOM", "shellHTML", "controls", "inputOrder", "expectedInputOrder"]) {
      if (!isDeepStrictEqual(left[field], right[field])) mismatch(out, `parity.${name}.${field}`, index, action, right[field], left[field]);
    }
    const inputProjection = (session) => session.inputs?.map(({ token, ...input }) => {
      const focused = session.focusWitness?.active === true &&
        session.focusWitness.key === `row-${input.key.replace(/^Row /, "")}-input`;
      if (focused) return input;
      const { selectionStart, selectionEnd, selectionDirection, ...withoutSelection } = input;
      return withoutSelection;
    });
    if (!isDeepStrictEqual(inputProjection(left), inputProjection(right))) {
      mismatch(out, `parity.${name}.inputs`, index, action, inputProjection(right), inputProjection(left));
    }
    // The fixture activates each side from its recorded prior focus before
    // executing that side's action, captures immediately afterward, and logs
    // that activation separately. The pair below therefore compares the two
    // per-action observations, not a later sample contaminated by switching
    // browser documents.
    if (!isDeepStrictEqual(normalizedFocus(left.focus), normalizedFocus(right.focus)) ||
        !isDeepStrictEqual(normalizedFocus(left.focusWitness), normalizedFocus(right.focusWitness))) {
      mismatch(out, `parity.${name}.focus`, index, action, normalizedFocus(right.focus), normalizedFocus(left.focus));
    }
    if (!isDeepStrictEqual(left.transportLog, right.transportLog)) mismatch(out, `parity.${name}.transport`, index, action, right.transportLog, left.transportLog);
  }
  // `side` proves that each observation came from its expected actor and is
  // validated above. It is provenance metadata, so exclude it only from the
  // cross-actor semantic parity comparison.
  const transportCallProjection = (calls) => (calls ?? []).map(({ side, ...call }) => call);
  if (!isDeepStrictEqual(transportCallProjection(candidate.transportCalls), transportCallProjection(reference.transportCalls))) {
    mismatch(out, "parity.transport-invocation-order", index, action,
      transportCallProjection(reference.transportCalls), transportCallProjection(candidate.transportCalls));
  }
  const transportProjection = (entries) => (entries ?? []).map((entry) => ({
    name: entry.name, generation: entry.generation, sessionID: entry.sessionID, parentName: entry.parentName, events: entry.events,
  }));
  if (!isDeepStrictEqual(transportProjection(candidate.transports), transportProjection(reference.transports))) {
    mismatch(out, "parity.ordered-transports", index, action,
      transportProjection(reference.transports), transportProjection(candidate.transports));
  }
}

function findBilateralControlWitness(scenarios, kind) {
  for (const scenario of scenarios) {
    for (const tick of scenario.ticks ?? []) {
      for (const candidate of tick.candidate?.sessions ?? []) {
        const reference = tick.reference?.sessions?.find((entry) => entry.name === candidate.name);
        if (!reference) continue;
        const rows = candidate.snapshot?.state?.Rows;
        if (!Array.isArray(rows) || !isDeepStrictEqual(rows, reference.snapshot?.state?.Rows)) continue;
        const className = kind === "add-at-cap" ? "add" : kind === "reset-empty" ? "reset" : "up";
        if (kind === "add-at-cap" && rows.length !== MAX_CONTROL_ROWS) continue;
        if (kind === "reset-empty" && rows.length !== 0) continue;
        if (kind === "up-first-row" && rows.length === 0) continue;
        const rowLabel = kind === "up-first-row" ? `Row ${rows[0].ID}` : null;
        const controlFor = (session) => session.controls?.find((control) => control.tag === "button" &&
          control.className === className && (rowLabel === null || control.rowLabel === rowLabel));
        const candidateControl = controlFor(candidate);
        const referenceControl = controlFor(reference);
        if (!candidateControl || !referenceControl || candidateControl.disabled !== true || referenceControl.disabled !== true) continue;
        return { scenario, tickIndex: tick.index, sessionName: candidate.name, className, rowLabel,
          expectedField: `session.control-disabled.${className}` };
      }
    }
  }
  return null;
}

export function makeBilateralDisabledControlNegatives(scenarios) {
  const negatives = [];
  for (const kind of ["add-at-cap", "reset-empty", "up-first-row"]) {
    const witness = findBilateralControlWitness(scenarios, kind);
    if (!witness) {
      negatives.push({ kind, status: "missing" });
      continue;
    }
    const scenario = JSON.parse(JSON.stringify(witness.scenario));
    const tick = scenario.ticks[witness.tickIndex];
    for (const side of ACTORS) {
      const session = sessionByName(tick[side], witness.sessionName);
      const control = session.controls.find((entry) => entry.tag === "button" && entry.className === witness.className &&
        (witness.rowLabel === null || entry.rowLabel === witness.rowLabel));
      control.disabled = false;
      session.domSnapshot.disabled = session.controls.filter((entry) => entry.disabled).map((entry) => entry.path).sort();
    }
    negatives.push({ kind, status: "mutated", expectedField: witness.expectedField,
      tickIndex: witness.tickIndex, sessionName: witness.sessionName, scenario });
  }
  return negatives;
}

export function makeCancelOrderNegative(scenario) {
  const mutated = JSON.parse(JSON.stringify(scenario));
  const tick = mutated.ticks?.find((entry) => entry.action?.kind === "dispose");
  const result = tick?.operationResults?.find((entry) => entry.side === "candidate");
  const calls = result?.actualCancelInvocations ?? [];
  let pair = null;
  for (let index = 0; index < calls.length && !pair; index += 1) {
    const other = calls.slice(index + 1).find((entry) => entry.sessionID !== calls[index].sessionID);
    if (other) pair = [calls[index], other];
  }
  if (!pair) return { scenario: mutated, mutation: { status: "missing-cross-session-cancels" } };
  const [first, second] = pair;
  const sequenceSlots = [first.sequence, second.sequence];
  const sessionIDs = [first.sessionID, second.sessionID];
  const localLogsBefore = JSON.stringify(tick.candidate.transports);
  const bundlesBefore = JSON.stringify(result.returned);
  const fields = ["sessionID", "generation", "hostGeneration", "requestID", "value", "error"];
  const swapBySequence = (entries) => {
    const left = entries.find((entry) => entry.sequence === first.sequence);
    const right = entries.find((entry) => entry.sequence === second.sequence);
    if (!left || !right) return false;
    for (const field of fields) [left[field], right[field]] = [right[field], left[field]];
    return true;
  };
  const reordered = swapBySequence(tick.candidate.transportCalls) &&
    swapBySequence(result.actualInvocationDelta) && swapBySequence(result.actualCancelInvocations);
  return {
    scenario: mutated,
    mutation: {
      status: reordered ? "reordered" : "failed-to-reorder",
      sequenceSlots,
      sessionIDs,
      localTransportLogsUnchanged: localLogsBefore === JSON.stringify(tick.candidate.transports),
      goBundlesUnchanged: bundlesBefore === JSON.stringify(result.returned),
    },
  };
}

function expectedMessage(action) {
  if (action.kind === "add") return { Name: "add", Arg: "" };
  if (action.kind === "fill") return { Name: `edit/${action.rowID}`, Arg: String(action.value).replace(/[\r\n]/g, "") };
  if (action.kind === "save") return { Name: "save", Arg: String(action.rowID) };
  if (action.kind === "release") return { Name: "reply", Arg: String(action.requestID) };
  return null;
}

function actionResultFor(tick, side) { return tick.operationResults?.find((result) => result?.side === side) ?? null; }

function normalizedFocusEntry(session) {
  return {
    name: session.name,
    focus: normalizedFocus(session.focus),
    focusWitness: session.focusWitness === null ? null : {
      ...normalizedFocus(session.focusWitness),
      active: session.focusWitness.active === true,
    },
  };
}

function validateActionFocusChannels(action, after, out, tick) {
  const requiredSides = ACTORS;
  const results = after.operationResults ?? [];
  const resultBySide = new Map(results.map((result) => [result?.side, result]));
  for (const side of requiredSides) {
    const result = resultBySide.get(side);
    if (!result) {
      mismatch(out, "focus.action-result-missing", tick, action, side, results, side);
      continue;
    }
    const activation = result.focusActivation;
    if (!isRecord(activation) || typeof activation.attempted !== "boolean") {
      mismatch(out, "focus.activation-missing", tick, action, "explicit attempted/reason record", activation, side);
    } else if (!activation.attempted) {
      if (activation.reason !== "no-prior-active-focus") {
        mismatch(out, "focus.activation-failed", tick, action, "no prior focus or successful activation", activation, side);
      }
    } else {
      const requested = activation.requested;
      const observed = activation.after;
      if (!isRecord(requested) || !isRecord(observed) || observed.targetActive !== true ||
          requested.start !== observed.start || requested.end !== observed.end ||
          (requested.start === requested.end ? "none" : requested.direction) !==
            (observed.start === observed.end ? "none" : observed.direction)) {
        mismatch(out, "focus.activation-witness", tick, action,
          { targetActive: true, requested }, observed, side);
      }
    }
    if (!Array.isArray(result.postActionFocus)) {
      mismatch(out, "focus.post-action-missing", tick, action, "explicit per-session post-action focus array", result.postActionFocus, side);
      continue;
    }
    const expected = (after[side]?.sessions ?? []).map(normalizedFocusEntry)
      .sort((left, right) => left.name.localeCompare(right.name));
    const actual = result.postActionFocus.map((entry) => ({
      name: entry?.name,
      focus: normalizedFocus(entry?.focus),
      focusWitness: entry?.focusWitness == null ? null : {
        ...normalizedFocus(entry.focusWitness),
        active: entry.focusWitness.active === true,
      },
    }));
    if (!isDeepStrictEqual(actual, expected)) {
      mismatch(out, "focus.post-action-mismatch", tick, action, expected, actual, side);
    }
  }
  const candidate = resultBySide.get("candidate")?.focusActivation;
  const reference = resultBySide.get("reference")?.focusActivation;
  if (isRecord(candidate) && isRecord(reference)) {
    const project = (value) => value.attempted === true
      ? { attempted: true, name: value.name, key: value.key, requested: value.requested }
      : { attempted: false, reason: value.reason };
    if (!isDeepStrictEqual(project(candidate), project(reference))) {
      mismatch(out, "focus.activation-parity", tick, action, project(reference), project(candidate));
    }
  }
}

function validateAction(scenario, index, out) {
  const action = scenario.actions[index];
  const before = scenario.ticks[index];
  const after = scenario.ticks[index + 1];
  const tick = index + 1;
  if (!action || !before || !after) return;
  validateActionFocusChannels(action, after, out, tick);
  if (["root", "child"].includes(action.kind)) {
    for (const side of ACTORS) {
      const result = actionResultFor(after, side);
      if (!result) {
        mismatch(out, "mount.result-missing", tick, action, side, after.operationResults, side);
        continue;
      }
      if (action.expectError) {
        if (result.threw !== true || result.expectedError !== true) mismatch(out, "mount.expected-rejection", tick, action, "threw expected error", result, side);
        if (!isDeepStrictEqual(result.beforeTree, result.afterTree)) mismatch(out, "mount.rejection-mutated-tree", tick, action, result.beforeTree, result.afterTree, side);
        if (result.beforeCount !== result.afterCount || (result.newTransportIDs ?? []).some((id) => result.afterTree?.some((record) => record.SessionID === id))) {
          mismatch(out, "mount.rejection-leaked-session", tick, action,
            { count: result.beforeCount, noLiveAllocatedID: true }, { count: result.afterCount, allocatedIDs: result.newTransportIDs, afterTree: result.afterTree }, side);
        }
      } else {
        if (result.threw !== false || result.expectedError !== false || !Number.isSafeInteger(result.sessionID)) {
          mismatch(out, "mount.success", tick, action, "mounted session without throw", result, side);
        }
        const session = sessionByName(after[side], action.name);
        const previous = sessionByName(before[side], action.name);
        if (!session) mismatch(out, "mount.missing-node", tick, action, action.name, null, side);
        else {
          if (session.backend !== (side === "reference" ? "react" : action.backend)) mismatch(out, "mount.backend", tick, action,
            side === "reference" ? "react" : action.backend, session.backend, side);
          if (previous && session.sessionID <= previous.sessionID) mismatch(out, "mount.ID-reuse", tick, action, `ID > ${previous.sessionID}`, session.sessionID, side);
          if (action.kind === "child" && session.parentName !== action.parent) mismatch(out, "mount.parent-name", tick, action, action.parent, session.parentName, side);
          if (action.kind === "root" && session.parentName !== null) mismatch(out, "mount.root-parent", tick, action, null, session.parentName, side);
          const history = scenario.ticks.slice(0, index + 1).flatMap((entry) => entry[side]?.sessions ?? [])
            .filter((entry) => entry.name === action.name);
          const lastID = Math.max(0, ...history.map((entry) => entry.sessionID));
          const lastGeneration = Math.max(0, ...history.map((entry) => entry.generation));
          if (session.sessionID <= lastID || session.generation <= lastGeneration) {
            mismatch(out, "mount.remount-freshness", tick, action,
              { sessionIDGreaterThan: lastID, generationGreaterThan: lastGeneration },
              { sessionID: session.sessionID, generation: session.generation }, side);
          }
          if (history.length > 0 && !previous && session.snapshot?.state?.Rows?.length !== 0) {
            mismatch(out, "mount.remount-state", tick, action, "fresh empty collection state", session.snapshot?.state?.Rows, side);
          }
        }
      }
    }
    if (!action.expectError) {
      const candidate = actionResultFor(after, "candidate");
      const reference = actionResultFor(after, "reference");
      if (candidate && reference) {
        for (const field of ["sessionID", "parentID", "depth"]) if (candidate[field] !== reference[field]) {
          mismatch(out, `mount.parity.${field}`, tick, action, reference[field], candidate[field]);
        }
      }
    }
    return;
  }

  if (["add", "fill", "save", "release"].includes(action.kind)) {
    const want = expectedMessage(action);
    for (const side of ACTORS) {
      const oldSession = sessionByName(before[side], action.name);
      const session = sessionByName(after[side], action.name);
      if (!oldSession || !session) {
        mismatch(out, "action.target-missing", tick, action, action.name, null, side);
        continue;
      }
      const oldMessages = oldSession.snapshot.messages;
      const newMessages = session.snapshot.messages;
      const prefix = Array.isArray(newMessages) && Array.isArray(oldMessages) &&
        isDeepStrictEqual(newMessages.slice(0, oldMessages.length), oldMessages);
      const actual = prefix ? newMessages[oldMessages.length] : null;
      if (!prefix || !isDeepStrictEqual(actual, want) || newMessages.length !== oldMessages.length + 1) {
        mismatch(out, "action.no-op-witness", tick, action,
          { prefixPreserved: true, nextMessage: want, length: oldMessages.length + 1 },
          { prefixPreserved: prefix, nextMessage: actual, length: newMessages?.length }, side);
      }
      const result = actionResultFor(after, side);
      if (action.kind !== "release" && (!result || result.prefixPreserved !== true ||
          !isDeepStrictEqual(result.expectedMessage, want) || !isDeepStrictEqual(result.actualMessage, want) ||
          result.afterCount !== result.beforeCount + 1)) {
        mismatch(out, "action.browser-witness", tick, action, want, result, side);
      }
      if (action.kind === "release" && (!result || !isDeepStrictEqual(result.expectedMessage, want) ||
          !isDeepStrictEqual(result.actualMessage, want) || result.callbackError !== null || result.previousState !== "held")) {
        mismatch(out, "action.release-callback", tick, action,
          { expectedMessage: want, actualMessage: want, callbackError: null, previousState: "held" }, result, side);
      }
    }
    return;
  }

  if (action.kind === "focus") {
    for (const side of ACTORS) {
      const session = sessionByName(after[side], action.name);
      const input = session?.inputs?.find((entry) => entry.key === `Row ${action.rowID}`);
      const witness = session?.focusWitness;
      const direction = witness?.selectionStart === witness?.selectionEnd ? "none" : witness?.selectionDirection;
      if (!input || !witness || witness.active !== true || witness.selectionStart !== action.start ||
          witness.selectionEnd !== action.end || direction !== (action.start === action.end ? "none" : action.direction ?? "none")) {
        mismatch(out, "focus.witness", tick, action,
          { active: true, selectionStart: action.start, selectionEnd: action.end, selectionDirection: action.start === action.end ? "none" : action.direction ?? "none" },
          witness, side);
      }
    }
    return;
  }

  if (action.kind === "replace") {
    const result = actionResultFor(after, "candidate");
    if (!result || result.afterBackend !== action.backend) mismatch(out, "replace.no-op-witness", tick, action, action.backend, result?.afterBackend, "candidate");
    const previous = sessionByName(before.candidate, action.name);
    const current = sessionByName(after.candidate, action.name);
    if (!previous || !current) {
      mismatch(out, "replace.target-missing", tick, action, action.name, null, "candidate");
      return;
    }
    for (const field of ["shellToken", "viewRootToken", "childrenRootToken", "physicalParentToken"]) {
      if (previous[field] !== current[field]) mismatch(out, `replace.stable-shell.${field}`, tick, action, previous[field], current[field], "candidate");
    }
    const descendants = descendantsByName(before.candidate.sessions, action.name);
    for (const name of descendants) {
      if (name === action.name) continue;
      const old = sessionByName(before.candidate, name);
      const now = sessionByName(after.candidate, name);
      if (!old || !now || old.shellToken !== now.shellToken || old.viewRootToken !== now.viewRootToken ||
          old.childrenRootToken !== now.childrenRootToken || !isDeepStrictEqual(old.inputs.map((item) => item.token), now.inputs.map((item) => item.token))) {
        mismatch(out, "replace.descendant-physical-identity", tick, action,
          old && { shell: old.shellToken, view: old.viewRootToken, children: old.childrenRootToken, inputs: old.inputs.map((item) => item.token) },
          now && { shell: now.shellToken, view: now.viewRootToken, children: now.childrenRootToken, inputs: now.inputs.map((item) => item.token) }, "candidate");
      }
    }
    for (const name of before.candidate.sessions.map((entry) => entry.name)) {
      if (descendants.includes(name)) continue;
      const old = sessionByName(before.candidate, name);
      const now = sessionByName(after.candidate, name);
      if (old && now && !isDeepStrictEqual(old.inputs.map((item) => item.token), now.inputs.map((item) => item.token))) {
        mismatch(out, "replace.sibling-physical-identity", tick, action, old.inputs.map((item) => item.token), now.inputs.map((item) => item.token), "candidate");
      }
    }
    const previousFocused = before.candidate.sessions.find((entry) => entry.focusWitness?.active === true);
    if (previousFocused && previousFocused.name !== action.name) {
      const nowFocused = sessionByName(after.candidate, previousFocused.name)?.focusWitness;
      const oldWitness = previousFocused.focusWitness;
      const nowDirection = nowFocused?.selectionStart === nowFocused?.selectionEnd ? "none" : nowFocused?.selectionDirection;
      const oldDirection = oldWitness.selectionStart === oldWitness.selectionEnd ? "none" : oldWitness.selectionDirection;
      if (!nowFocused?.active || nowFocused.selectionStart !== oldWitness.selectionStart ||
          nowFocused.selectionEnd !== oldWitness.selectionEnd || nowDirection !== oldDirection) {
        mismatch(out, "replace.descendant-focus-selection", tick, action, oldWitness, nowFocused, "candidate");
      }
    }
    const expected = previous.focusWitness;
    if (expected) {
      const witness = current.focusWitness;
      if (!witness) {
        mismatch(out, "replace.focus-selection", tick, action, expected, null, "candidate");
        return;
      }
      const direction = witness.selectionStart === witness.selectionEnd ? "none" : witness.selectionDirection;
      if (!witness.active || witness.selectionStart !== expected.selectionStart ||
          witness.selectionEnd !== expected.selectionEnd ||
          direction !== (witness.selectionStart === witness.selectionEnd ? "none" : expected.selectionDirection)) {
        mismatch(out, "replace.focus-selection", tick, action, expected, witness, "candidate");
      }
    }
    return;
  }

  if (action.kind === "dispose") {
    for (const side of ACTORS) {
      const result = actionResultFor(after, side);
      const target = sessionByName(before[side], action.name);
      if (!result || !target) {
        mismatch(out, "dispose.result-missing", tick, action, "target and result", result, side);
        continue;
      }
      let expectedIDs;
      try { expectedIDs = derivePostorder(before[side].managerTree, target.sessionID); }
      catch (error) {
        mismatch(out, "dispose.derive-postorder", tick, action, "acyclic authoritative pre-disposal tree", error.message, side);
        continue;
      }
      const expectedNames = expectedIDs.map((id) => before[side].sessions.find((session) => session.sessionID === id)?.name ?? null);
      if (!isDeepStrictEqual(result.expectedIDs, expectedIDs)) mismatch(out, "dispose.browser-postorder", tick, action, expectedIDs, result.expectedIDs, side);
      if (!isDeepStrictEqual(result.expectedNames, expectedNames)) mismatch(out, "dispose.browser-names", tick, action, expectedNames, result.expectedNames, side);
      const returnedIDs = result.returned?.map((bundle) => bundle.SessionID);
      if (!isDeepStrictEqual(returnedIDs, expectedIDs)) mismatch(out, "dispose.bundle-postorder", tick, action, expectedIDs, returnedIDs, side);
      const expectedBundles = expectedIDs.map((id) => {
        const session = before[side].sessions.find((entry) => entry.sessionID === id);
        const requests = session?.snapshot?.state?.Rows?.map((row) => row.PendingID).filter((idValue) => idValue > 0) ?? [];
        return { SessionID: id, Commands: [...new Set(requests)].map((ID) => ({ Kind: "cancel", ID, Value: "" })) };
      });
      if (!isDeepStrictEqual(result.returned, expectedBundles)) mismatch(out, "dispose.bundle-commands", tick, action, expectedBundles, result.returned, side);
      if (!Number.isSafeInteger(result.invocationSequenceStart) || !Number.isSafeInteger(result.invocationSequenceEnd) ||
          !Array.isArray(result.actualInvocationDelta) || !Array.isArray(result.actualCancelInvocations)) {
        mismatch(out, "dispose.cancel-invocation-channel", tick, action,
          "sequence interval and actual global invocation/cancel arrays", result, side);
      } else {
        const observedDelta = (after[side].transportCalls ?? []).filter((call) =>
          call.sequence >= result.invocationSequenceStart && call.sequence <= result.invocationSequenceEnd);
        if (!isDeepStrictEqual(result.actualInvocationDelta, observedDelta)) {
          mismatch(out, "dispose.cancel-invocation-delta", tick, action, observedDelta, result.actualInvocationDelta, side);
        }
        const observedCancels = result.actualInvocationDelta.filter((call) => call.kind === "cancel");
        if (!isDeepStrictEqual(result.actualCancelInvocations, observedCancels) ||
            result.actualInvocationDelta.some((call) => call.kind !== "cancel")) {
          mismatch(out, "dispose.cancel-invocation-channel", tick, action, observedCancels, result.actualCancelInvocations, side);
        }
        const expectedInvocations = expectedBundles.flatMap((bundle) =>
          (bundle.Commands ?? []).map((command) => {
            const session = before[side].sessions.find((entry) => entry.sessionID === bundle.SessionID);
            return { side, kind: "cancel", sessionID: bundle.SessionID,
              generation: session?.generation ?? null, hostGeneration: session?.hostGeneration ?? null,
              requestID: command.ID, value: command.Value };
          }));
        const actualInvocations = result.actualCancelInvocations.map((call) => ({
          side: call.side, kind: call.kind, sessionID: call.sessionID, generation: call.generation,
          hostGeneration: call.hostGeneration, requestID: call.requestID, value: call.value,
        }));
        if (!isDeepStrictEqual(actualInvocations, expectedInvocations)) {
          mismatch(out, "dispose.cancel-invocation-order", tick, action, expectedInvocations, actualInvocations, side);
        }
      }
      const afterIDs = sortedIDs(result.afterTree ?? []);
      const expectedRemaining = sortedIDs(before[side].managerTree).filter((id) => !expectedIDs.includes(id));
      if (!isDeepStrictEqual(afterIDs, expectedRemaining)) mismatch(out, "dispose.remaining-tree", tick, action, expectedRemaining, afterIDs, side);
      if (!isDeepStrictEqual(result.afterTree, after[side].managerTree)) mismatch(out, "dispose.tree-observation", tick, action, after[side].managerTree, result.afterTree, side);
      for (const beforeSibling of result.beforeSiblings ?? []) {
        const sibling = result.afterSiblings?.find((entry) => entry?.name === beforeSibling.name);
        if (!sibling || sibling.sessionID !== beforeSibling.sessionID || !isDeepStrictEqual(sibling.snapshot, beforeSibling.snapshot) ||
            !isDeepStrictEqual(sibling.tokens, beforeSibling.tokens)) {
          mismatch(out, "dispose.sibling-isolation", tick, action, beforeSibling, sibling, side);
        }
      }
    }
    return;
  }

  if (action.kind === "stale-release") {
    for (const side of ACTORS) {
      const result = actionResultFor(after, side);
      if (!result || result.callbackError !== null || !isDeepStrictEqual(result.beforeTree, result.afterTree) ||
          !isDeepStrictEqual(result.beforeActive, result.afterActive)) {
        mismatch(out, "stale-release.fence", tick, action,
          { callbackError: null, treeUnchanged: true, activeUnchanged: true }, result, side);
      }
      const liveAlias = sessionByName(before[side], action.name);
      if (liveAlias) {
        if (result?.retiredSessionID === liveAlias.sessionID || result?.retiredGeneration >= liveAlias.generation ||
            result?.currentSessionID !== liveAlias.sessionID || result?.currentGeneration !== liveAlias.generation ||
            result?.currentAliasHadRequestID !== false) {
          mismatch(out, "stale-release.recreated-generation", tick, action,
            { retiredSessionIDDifferent: true, retiredGenerationLessThan: liveAlias.generation,
              currentSessionID: liveAlias.sessionID, currentGeneration: liveAlias.generation, currentAliasHadRequestID: false },
            result, side);
        }
        const activeBefore = result?.beforeActive?.find((entry) => entry.name === action.name);
        if (!activeBefore || activeBefore.sessionID !== liveAlias.sessionID ||
            !isDeepStrictEqual(activeBefore.snapshot, liveAlias.snapshot) ||
            !isDeepStrictEqual(activeBefore.audit, liveAlias.audit)) {
          mismatch(out, "stale-release.recreated-state-witness", tick, action,
            { sessionID: liveAlias.sessionID, snapshot: liveAlias.snapshot, audit: liveAlias.audit }, activeBefore, side);
        }
      }
    }
  }
}

function descendantsByName(sessions, rootName) {
  const result = [rootName];
  for (let index = 0; index < result.length; index += 1) {
    const name = result[index];
    for (const session of sessions) if (session.parentName === name && !result.includes(session.name)) result.push(session.name);
  }
  return result;
}

export function validateScenario(scenario) {
  const issues = [];
  if (!isRecord(scenario)) return [{ field: "scenario.type", expected: "object", actual: compact(scenario) }];
  if (scenario.executionError) mismatch(issues, "scenario.execution", null, null, false, scenario.executionError);
  if (!Array.isArray(scenario.actions) || !Array.isArray(scenario.ticks) || scenario.ticks.length !== scenario.actions.length + 1) {
    mismatch(issues, "scenario.tick-count", null, null, Array.isArray(scenario.actions) ? scenario.actions.length + 1 : "actions array", scenario.ticks?.length);
    return issues;
  }
  for (let index = 0; index < scenario.ticks.length; index += 1) {
    const tick = scenario.ticks[index];
    const action = index === 0 ? null : scenario.actions[index - 1];
    if (!isRecord(tick) || tick.index !== index || !isDeepStrictEqual(tick.action ?? null, action)) {
      mismatch(issues, "scenario.tick-index-action", index, action, { index, action }, tick && { index: tick.index, action: tick.action });
    }
    for (const side of ACTORS) validateActor(tick?.[side], index, action, side, issues);
    if (isRecord(tick?.candidate) && isRecord(tick?.reference)) compareActors(tick.candidate, tick.reference, index, action, issues);
  }
  if (scenario.name === "nested-renderer-changes-preserve-child-dom-and-focus") {
    for (let index = 0; index < scenario.actions.length; index += 1) {
      const action = scenario.actions[index];
      const requiredSwap = action.kind === "replace" && (
        (action.name === "oak" && action.backend === "react") ||
        (action.name === "branch" && action.backend === "godom") ||
        (action.name === "bud" && action.backend === "react"));
      if (!requiredSwap) continue;
      const previous = scenario.actions[index - 1];
      if (previous?.kind !== "focus" || previous.name !== action.name) {
        mismatch(issues, "fixed.focus-swap-witness-gap", index + 1, action,
          `immediately preceding focus action for ${action.name}`, previous ?? null);
      }
    }
  }
  if (scenario.name === "dispose-fences-late-replies-and-allows-parent-recreation") {
    const actions = scenario.actions;
    const oldDispose = actions.findIndex((action) => action.kind === "dispose" && action.name === "orchard");
    const newRoot = actions.findIndex((action, index) => index > oldDispose && action.kind === "root" && action.name === "orchard");
    const newFruit = actions.findIndex((action, index) => index > newRoot && action.kind === "child" && action.name === "fruit" && action.parent === "orchard");
    const newSeed = actions.findIndex((action, index) => index > newFruit && action.kind === "child" && action.name === "seed" && action.parent === "fruit");
    const stale = actions.findIndex((action, index) => index > newSeed && action.kind === "stale-release" && action.name === "seed" && action.requestID === 1);
    const newSeedSave = actions.findIndex((action, index) => index > newSeed && index < stale && action.kind === "save" && action.name === "seed");
    if ([oldDispose, newRoot, newFruit, newSeed, stale].some((index) => index < 0) || newSeedSave >= 0) {
      mismatch(issues, "stale-release.fixed-recreation-witness-gap", null, null,
        "dispose old orchard; recreate orchard/fruit/seed; deliver old seed request 1 before new seed request 1", actions);
    } else {
      const before = scenario.ticks[stale];
      for (const side of ACTORS) {
        const orchard = sessionByName(before[side], "orchard");
        const fruit = sessionByName(before[side], "fruit");
        const seed = sessionByName(before[side], "seed");
        if (!orchard || !fruit || !seed || orchard.generation < 2 || fruit.generation < 2 || seed.generation < 2 ||
            fruit.parentName !== "orchard" || seed.parentName !== "fruit" ||
            orchard.snapshot.state.Rows.length !== 0 || fruit.snapshot.state.Rows.length !== 0 || seed.snapshot.state.Rows.length !== 0) {
          mismatch(issues, "stale-release.fixed-live-family-missing", stale + 1, actions[stale],
            "fresh empty orchard → fruit → seed family live before old callback", { orchard, fruit, seed }, side);
        }
      }
    }
  }
  for (let index = 0; index < scenario.actions.length; index += 1) validateAction(scenario, index, issues);
  validateNativeCoverage(scenario, issues);
  return issues;
}

function validateNativeCoverage(scenario, issues) {
  if (!Array.isArray(scenario.nativeSegments) || scenario.nativeSegments.length === 0) {
    mismatch(issues, "native.missing-segments", null, null, "nonempty per-session trace segments", scenario.nativeSegments);
    return;
  }
  const expected = new Map();
  for (const tick of scenario.ticks) {
    const names = new Set([
      ...(tick.candidate?.sessions ?? []).map((session) => `${session.name}:${session.generation}`),
      ...(tick.reference?.sessions ?? []).map((session) => `${session.name}:${session.generation}`),
    ]);
    for (const key of names) expected.set(key, (expected.get(key) ?? 0) + 1);
  }
  const seen = new Set();
  for (const segment of scenario.nativeSegments) {
    const key = `${segment?.name}:${segment?.generation}`;
    if (seen.has(key)) mismatch(issues, "native.duplicate-segment", null, null, "unique session generation", key);
    seen.add(key);
    if (!Array.isArray(segment?.frames) || segment.frames.length === 0) {
      mismatch(issues, "native.empty-segment", null, null, "at least one native tick", segment);
      continue;
    }
    if (segment.generation !== segment.referenceGeneration) mismatch(issues, "native.generation-pair", null, null, segment.generation, segment.referenceGeneration);
    if (expected.get(key) !== segment.frames.length) mismatch(issues, "native.frame-coverage", null, null, expected.get(key), segment.frames.length);
    let lastTick = -1;
    for (let index = 0; index < segment.frames.length; index += 1) {
      const pair = segment.frames[index];
      if (!isRecord(pair) || !Number.isSafeInteger(pair.tickIndex) || pair.tickIndex <= lastTick ||
          !isRecord(pair.reference) || !isRecord(pair.candidate)) {
        mismatch(issues, "native.frame-shape", pair?.tickIndex ?? null, null, "increasing tick index and candidate/reference frames", pair);
        continue;
      }
      lastTick = pair.tickIndex;
      for (const side of ACTORS) {
        const frame = pair[side];
        for (const field of ["Index", "Step", "State", "Tree", "DOM", "Pixels", "Mutations"]) {
          if (!Object.hasOwn(frame, field)) mismatch(issues, `native.${side}.missing.${field}`, pair.tickIndex, scenario.ticks[pair.tickIndex]?.action, "present native channel", undefined, side);
        }
        if (frame.Index !== index || !isRecord(frame.Step) || ["Path", "Event", "Value"].some((field) => typeof frame.Step?.[field] !== "string") ||
            typeof frame.State !== "string" || frame.State.length === 0 || typeof frame.Tree !== "string" || frame.Tree.length === 0 ||
            typeof frame.DOM !== "string" || frame.DOM.length === 0 || frame.Pixels !== "" || !Number.isSafeInteger(frame.Mutations)) {
          mismatch(issues, `native.${side}.invalid-frame`, pair.tickIndex, scenario.ticks[pair.tickIndex]?.action, "complete nonempty SameDOM frame", frame, side);
        }
        const tick = scenario.ticks[pair.tickIndex];
        const observation = tick?.[side]?.sessions?.find((session) => session.name === segment.name && session.generation === segment.generation);
        if (!observation) mismatch(issues, `native.${side}.orphan-frame`, pair.tickIndex, tick?.action, "live session observation", segment.name, side);
        else {
          if (frame.State !== canonical(observation.snapshot.state) || frame.Tree !== canonical(observation.snapshot.tree) || frame.DOM !== observation.actualDOM) {
            mismatch(issues, `native.${side}.observation-source`, pair.tickIndex, tick.action,
              { State: canonical(observation.snapshot.state), Tree: canonical(observation.snapshot.tree), DOM: observation.actualDOM },
              { State: frame.State, Tree: frame.Tree, DOM: frame.DOM }, side);
          }
          const prior = pair.tickIndex === 0 ? null : scenario.ticks[pair.tickIndex - 1]?.[side]?.sessions?.find(
            (session) => session.name === segment.name && session.generation === segment.generation);
          const actionForSession = tick.action?.name === segment.name ? tick.action : null;
          const wantStep = pair.tickIndex === 0 || index === 0 ? EMPTY_STEP : expectedNativeStep(actionForSession, prior?.snapshot);
          if (!isDeepStrictEqual(frame.Step, wantStep)) mismatch(issues, `native.${side}.step-source`, pair.tickIndex, tick.action, wantStep, frame.Step, side);
        }
      }
      if (pair.reference.Index !== pair.candidate.Index || !isDeepStrictEqual(pair.reference.Step, pair.candidate.Step)) {
        mismatch(issues, "native.pair-action", pair.tickIndex, scenario.ticks[pair.tickIndex]?.action, pair.reference.Step, pair.candidate.Step);
      }
    }
  }
  for (const [key, count] of expected) if (!seen.has(key)) mismatch(issues, "native.session-segment-missing", null, null, { key, count }, null);
  for (const key of seen) if (!expected.has(key)) mismatch(issues, "native.unexpected-segment", null, null, "observed session generation", key);
}

function parseArgs(args) {
  const result = { seeds: [...DEFAULT_SEEDS], cases: DEFAULT_CASES, maxActions: DEFAULT_MAX_ACTIONS,
    output: resolve(BUILD, "replay-default.json") };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (["--seeds", "--cases", "--max-actions", "--output"].includes(argument) && value === undefined) {
      throw new Error(`${argument} requires a value`);
    }
    if (argument === "--seeds") { result.seeds = parseSeedList(value); index += 1; }
    else if (argument === "--cases") { result.cases = Number(value); index += 1; }
    else if (argument === "--max-actions") { result.maxActions = Number(value); index += 1; }
    else if (argument === "--output") { result.output = resolve(value); index += 1; }
    else throw new Error(`unknown argument ${argument}`);
  }
  if (!Number.isInteger(result.cases) || result.cases < 0) throw new RangeError("--cases must be a nonnegative integer");
  if (!Number.isInteger(result.maxActions) || result.maxActions < 0 || result.maxActions > DEFAULT_MAX_ACTIONS) {
    throw new RangeError(`--max-actions must be from 0 through ${DEFAULT_MAX_ACTIONS}`);
  }
  return result;
}

function startLab() {
  const binary = resolve(ROOT, "http-effects/build/http-lab");
  const child = spawn(binary, ["-addr", "127.0.0.1:0", "-root", ROOT], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const lines = createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const ready = new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error("HTTP lab readiness timed out")), 10_000);
    lines.once("line", (line) => {
      clearTimeout(timer);
      try {
        const value = JSON.parse(line);
        if (typeof value.url !== "string") throw new Error("readiness JSON has no url");
        resolveReady(value.url);
      } catch (error) { reject(new Error(`invalid HTTP lab readiness record ${JSON.stringify(line)}: ${error.message}`)); }
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`HTTP lab exited before readiness (code=${code}, signal=${signal}): ${stderr}`));
    });
  });
  return { child, lines, ready, getStderr: () => stderr };
}

async function sha256File(path) {
  const bytes = await readFile(path);
  return createHash("sha256").update(bytes).digest("hex");
}

function safeSlug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "scenario";
}

export async function writeRawArtifacts({ scenarios, issues, outputDir, baseName }) {
  const scenarioDir = resolve(outputDir, `${baseName}-scenarios`);
  await mkdir(scenarioDir, { recursive: true });
  const scenarioFiles = [];
  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    const file = resolve(scenarioDir, `${String(index).padStart(3, "0")}-${safeSlug(scenario.name)}.json`);
    const encoded = `${JSON.stringify(scenario)}\n`;
    await writeFile(file, encoded);
    scenarioFiles.push({
      index,
      name: scenario.name,
      seed: scenario.seed ?? null,
      actions: scenario.actions?.length ?? 0,
      globalTicks: scenario.ticks?.length ?? 0,
      candidateSessionObservations: (scenario.ticks ?? []).reduce((sum, tick) => sum + (tick.candidate?.sessions?.length ?? 0), 0),
      referenceSessionObservations: (scenario.ticks ?? []).reduce((sum, tick) => sum + (tick.reference?.sessions?.length ?? 0), 0),
      nativeSegments: scenario.nativeSegments?.length ?? 0,
      nativeFramePairs: (scenario.nativeSegments ?? []).reduce((sum, segment) => sum + (segment.frames?.length ?? 0), 0),
      executionError: scenario.executionError ?? false,
      path: file,
      sha256: createHash("sha256").update(encoded).digest("hex"),
    });
  }
  const mismatchPath = resolve(outputDir, `${baseName}-mismatches.json`);
  const mismatchJSON = `${JSON.stringify(issues, null, 2)}\n`;
  await writeFile(mismatchPath, mismatchJSON);
  const mismatchArtifact = {
    count: issues.length,
    path: mismatchPath,
    sha256: createHash("sha256").update(mismatchJSON).digest("hex"),
  };
  return { scenarioDir, scenarioFiles, mismatchArtifact };
}

async function runNativeComparison(scenario, scenarioIndex, outputDir, comparator, issues) {
  const results = [];
  if (!Array.isArray(scenario.nativeSegments) || scenario.nativeSegments.length === 0) return results;
  for (let segmentIndex = 0; segmentIndex < scenario.nativeSegments.length; segmentIndex += 1) {
    const segment = scenario.nativeSegments[segmentIndex];
    const frames = segment.frames ?? [];
    if (frames.length === 0) {
      mismatch(issues, "native.compare-empty-segment", null, null, "nonempty input", segment.name);
      results.push({ scenario: scenario.name, name: segment.name, status: "missing" });
      continue;
    }
    const input = {
      golden: { Implementation: "Independent pinned React session-tree reference", Ticks: frames.map(({ reference }) => reference) },
      candidate: { Implementation: `Go session-tree manager with ${segment.name}`, Ticks: frames.map(({ candidate }) => candidate) },
    };
    const path = resolve(outputDir, `native-${String(scenarioIndex).padStart(3, "0")}-${String(segmentIndex).padStart(3, "0")}.json`);
    await writeFile(path, `${JSON.stringify(input)}\n`);
    const result = spawnSync(comparator, [path], { cwd: ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
    let diff = null;
    try { diff = JSON.parse(result.stdout); } catch { /* recorded below */ }
    const matched = result.status === 0 && diff && diff.Found === false;
    if (!matched) mismatch(issues, "native.CompareInteraction", null, null,
      { status: 0, Found: false }, { status: result.status, stderr: result.stderr, stdout: result.stdout, diff }, null);
    results.push({ scenario: scenario.name, name: segment.name, generation: segment.generation,
      ticks: frames.length, status: matched ? "matched" : "mismatched", input: path, diff });
  }
  return results;
}

async function browserReplay(scripts) {
  const lab = startLab();
  let browser;
  try {
    const baseURL = await lab.ready;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    await page.goto(`${baseURL}/session-tree/fixture.html`, { waitUntil: "load" });
    await page.waitForFunction(() => Boolean(window.__sessionTreeFixture) || Boolean(window.__sessionTreeStartupError), null, { timeout: 30_000 });
    const startup = await page.evaluate(() => ({
      error: window.__sessionTreeStartupError ?? null,
      status: document.querySelector("#status")?.textContent ?? "",
      environment: window.__sessionTreeFixture?.environment ?? null,
    }));
    if (startup.error) throw new Error(`fixture startup failed: ${startup.error}`);
    if (!startup.environment?.separateDocuments || startup.environment.react !== "19.3.1" || startup.environment.reactDOM !== "19.3.1") {
      throw new Error(`fixture context/reference versions are invalid: ${JSON.stringify(startup.environment)}`);
    }
    const scenarios = [];
    for (const script of scripts) {
      const scenario = await page.evaluate(async (value) => window.__sessionTreeFixture.runScenario(value), script);
      scenarios.push(scenario);
    }
    const focusNegative = await page.evaluate(async () => window.__sessionTreeFixture.runFocusLossNegative());
    return {
      scenarios,
      focusNegative,
      browserErrors,
      versions: {
        chromium: await browser.version(),
        react: startup.environment.react,
        reactDOM: startup.environment.reactDOM,
        fixtureStatus: startup.status,
      },
    };
  } finally {
    if (browser) await browser.close();
    lab.lines.close();
    lab.child.kill("SIGTERM");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.output = await uniqueOutputPath(options.output);
  const scripts = makeScripts(options);
  const outputDir = dirname(options.output);
  const nativeDir = resolve(outputDir, `${basename(options.output, extname(options.output))}-native`);
  await mkdir(outputDir, { recursive: true });
  await mkdir(nativeDir, { recursive: true });
  const comparator = resolve(process.env.GO_COMPARE_BIN ?? resolve(BUILD, "compare-interaction"));
  await access(comparator, fsConstants.X_OK);
  const started = Date.now();
  const issues = [];
  let browserResult;
  try {
    browserResult = await browserReplay(scripts);
  } catch (error) {
    mismatch(issues, "browser.replay", null, null, "browser fixture execution", String(error?.stack ?? error));
    browserResult = { scenarios: [], focusNegative: null, browserErrors: [], versions: null };
  }
  if (browserResult.browserErrors.length) mismatch(issues, "browser.console-errors", null, null, [], browserResult.browserErrors);
  if (browserResult.scenarios.length !== scripts.length) mismatch(issues, "browser.scenario-count", null, null, scripts.length, browserResult.scenarios.length);

  const nativeResults = [];
  const negativeNativeResults = [];
  const scriptByName = new Map(scripts.map((script) => [script.name, script]));
  let actions = 0;
  let globalTicks = 0;
  let candidateSessionObservations = 0;
  let referenceSessionObservations = 0;
  let nativeFrames = 0;
  const generatedActionCounts = new Map(options.seeds.map((seed) => [seed, []]));
  const scenarioCount = browserResult.scenarios.length;
  for (let scenarioIndex = 0; scenarioIndex < browserResult.scenarios.length; scenarioIndex += 1) {
    const scenario = browserResult.scenarios[scenarioIndex];
    const script = scriptByName.get(scenario.name);
    if (!script) mismatch(issues, "browser.unknown-scenario", null, null, "known script", scenario.name);
    else if (!isDeepStrictEqual(scenario.actions, script.actions)) mismatch(issues, "browser.script-actions", null, null, script.actions, scenario.actions);
    if (scenario.seed !== null && scenario.seed !== undefined && (scenario.actions?.length ?? 0) > options.maxActions) {
      mismatch(issues, "generator.max-actions", null, null, options.maxActions, scenario.actions?.length);
    }
    const scenarioIssues = validateScenario(scenario);
    for (const issue of scenarioIssues) issues.push({ scenario: scenario.name, ...issue });
    actions += scenario.actions?.length ?? 0;
    globalTicks += scenario.ticks?.length ?? 0;
    candidateSessionObservations += (scenario.ticks ?? []).reduce((sum, tick) => sum + (tick.candidate?.sessions?.length ?? 0), 0);
    referenceSessionObservations += (scenario.ticks ?? []).reduce((sum, tick) => sum + (tick.reference?.sessions?.length ?? 0), 0);
    nativeFrames += (scenario.nativeSegments ?? []).reduce((sum, segment) => sum + (segment.frames?.length ?? 0), 0);
    if (scenario.seed !== null && scenario.seed !== undefined) generatedActionCounts.get(scenario.seed)?.push(scenario.actions?.length ?? 0);
    nativeResults.push(...await runNativeComparison(scenario, scenarioIndex, nativeDir, comparator, issues));
  }

  const negativeScenario = browserResult.focusNegative;
  let negativeControl = { status: "missing", actions: 0, globalTicks: 0, mismatchFields: [], nativeResults: [] };
  if (!negativeScenario) {
    mismatch(issues, "negative-control.missing", null, null, "actual-browser focus-loss scenario", null);
  } else {
    const negativeIssues = validateScenario(negativeScenario);
    const focusLossDetected = negativeIssues.some((issue) => issue.field === "replace.focus-selection");
    const allowedFindings = new Set(["replace.focus-selection", "parity.negative.focus", "parity.negative.inputs"]);
    const unexpectedFindings = negativeIssues.filter((issue) => !allowedFindings.has(issue.field));
    if (!focusLossDetected) mismatch(issues, "negative-control.focus-loss-not-detected", null,
      { kind: "replace", name: "negative", backend: "react" }, "checker rejects post-swap blur", negativeIssues);
    if (unexpectedFindings.length) mismatch(issues, "negative-control.unexpected-findings", null, null, [], unexpectedFindings);
    const negativeNativeIssues = [];
    negativeNativeResults.push(...await runNativeComparison(negativeScenario, scripts.length, nativeDir, comparator, negativeNativeIssues));
    if (negativeNativeIssues.length) issues.push(...negativeNativeIssues.map((issue) => ({ scenario: negativeScenario.name, ...issue })));
    negativeControl = {
      status: focusLossDetected && unexpectedFindings.length === 0 && negativeNativeResults.length > 0 &&
        negativeNativeResults.every((entry) => entry.status === "matched") ? "detected" : "failed",
      actions: negativeScenario.actions?.length ?? 0,
      globalTicks: negativeScenario.ticks?.length ?? 0,
      candidateSessionObservations: (negativeScenario.ticks ?? []).reduce((sum, tick) => sum + (tick.candidate?.sessions?.length ?? 0), 0),
      referenceSessionObservations: (negativeScenario.ticks ?? []).reduce((sum, tick) => sum + (tick.reference?.sessions?.length ?? 0), 0),
      mismatchFields: negativeIssues.map((issue) => issue.field),
      nativeResults: negativeNativeResults,
    };
  }

  const disabledNegativeControls = makeBilateralDisabledControlNegatives(browserResult.scenarios);
  const disabledNegativeResults = [];
  for (const negative of disabledNegativeControls) {
    if (negative.status !== "mutated") {
      mismatch(issues, "negative-control.disabled-channel-missing", null, null, negative.kind, negative.status);
      disabledNegativeResults.push({ kind: negative.kind, status: "missing", findings: [] });
      continue;
    }
    const findings = validateScenario(negative.scenario);
    const expected = findings.filter((issue) => issue.field === negative.expectedField);
    const expectedSides = new Set(expected.map((issue) => issue.actor));
    const unexpected = findings.filter((issue) => issue.field !== negative.expectedField);
    const detected = expected.length === 2 && expectedSides.has("candidate") && expectedSides.has("reference") && unexpected.length === 0;
    if (!detected) mismatch(issues, "negative-control.bilateral-disabled-not-detected", null, null,
      { kind: negative.kind, field: negative.expectedField, candidateAndReference: true, noOtherFindings: true }, findings);
    disabledNegativeResults.push({ kind: negative.kind, status: detected ? "rejected-bilaterally" : "failed",
      tickIndex: negative.tickIndex, sessionName: negative.sessionName, expectedField: negative.expectedField,
      issueActors: expected.map((issue) => issue.actor), unexpectedFields: unexpected.map((issue) => issue.field) });
  }

  const cancelNegativeSource = browserResult.scenarios.find((scenario) =>
    scenario.name === "nested-postorder-cancel-and-sibling-isolation");
  let cancelOrderNegative = { status: "missing", mutation: null, mismatchFields: [] };
  if (!cancelNegativeSource) {
    mismatch(issues, "negative-control.cancel-order-source-missing", null, null,
      "fixed nested postorder trace with multiple session cancels", null);
  } else {
    const mutated = makeCancelOrderNegative(cancelNegativeSource);
    const findings = validateScenario(mutated.scenario);
    const orderDetected = findings.some((issue) => issue.field === "dispose.cancel-invocation-order");
    const allowed = new Set(["dispose.cancel-invocation-order", "parity.transport-invocation-order"]);
    const unexpected = findings.filter((issue) => !allowed.has(issue.field));
    const proof = mutated.mutation;
    if (!orderDetected || unexpected.length || proof.status !== "reordered" ||
        proof.localTransportLogsUnchanged !== true || proof.goBundlesUnchanged !== true) {
      mismatch(issues, "negative-control.cancel-order-not-detected", null, null,
        { orderDetected: true, noUnexpectedFindings: true, localTransportLogsUnchanged: true, goBundlesUnchanged: true },
        { findings, mutation: proof });
    }
    cancelOrderNegative = { status: orderDetected && unexpected.length === 0 && proof.status === "reordered" &&
      proof.localTransportLogsUnchanged === true && proof.goBundlesUnchanged === true ? "detected" : "failed",
      mutation: proof, mismatchFields: findings.map((issue) => issue.field),
      baselineScenario: cancelNegativeSource.name,
      nativeFramesUnchanged: isDeepStrictEqual(mutated.scenario.nativeSegments, cancelNegativeSource.nativeSegments) };
  }

  const baseName = basename(options.output, extname(options.output));
  const rawArtifacts = await writeRawArtifacts({
    scenarios: browserResult.scenarios,
    issues,
    outputDir,
    baseName,
  });
  const negativeArtifacts = negativeScenario
    ? await writeRawArtifacts({ scenarios: [negativeScenario], issues: validateScenario(negativeScenario),
      outputDir, baseName: `${baseName}-focus-negative` })
    : null;

  const goVersion = spawnSync("go", ["version"], { cwd: ROOT, encoding: "utf8" });
  const hashes = {};
  for (const path of [
    resolve(HERE, "check.mjs"), resolve(HERE, "check.test.mjs"), resolve(HERE, "fixture.mjs"),
    resolve(HERE, "fixture.html"), resolve(HERE, "host.mjs"), resolve(HERE, "reference.mjs"),
    resolve(HERE, "scripts.mjs"),
    resolve(ROOT, "multi-root/host.mjs"), resolve(ROOT, "keyed-editor/host.mjs"),
    resolve(BUILD, "multi-root.wasm"), resolve(BUILD, "godom.wasm"), resolve(BUILD, "react.bundle.mjs"),
    resolve(BUILD, "reference.bundle.mjs"), comparator,
  ]) {
    hashes[path.slice(ROOT.length + 1)] = await sha256File(path);
  }
  const allNativeResults = [...nativeResults, ...negativeNativeResults];

  const report = {
    status: issues.length === 0 && negativeControl.status === "detected" && cancelOrderNegative.status === "detected" &&
      disabledNegativeResults.length === 3 && disabledNegativeResults.every((entry) => entry.status === "rejected-bilaterally") &&
      allNativeResults.length > 0 &&
      allNativeResults.every((entry) => entry.status === "matched") ? "matched" : "mismatched",
    seeds: options.seeds,
    casesPerSeed: options.cases,
    maxActions: options.maxActions,
    fixedScripts: fixedScripts.map(({ name, actions: scriptActions }) => ({ name, actions: scriptActions.length })),
    scripts: scenarioCount,
    actions,
    globalTicks,
    candidateSessionObservations,
    referenceSessionObservations,
    sessionObservations: candidateSessionObservations + referenceSessionObservations,
    generatedCasesPerSeed: options.cases,
    generatedActionCounts: Object.fromEntries(generatedActionCounts),
    maxGeneratedActionsObserved: Math.max(0, ...[...generatedActionCounts.values()].flat()),
    nativeFramePairs: nativeFrames,
    nativeActorFrames: nativeFrames * 2,
    nativeComparisons: nativeResults.length,
    nativeMatched: nativeResults.filter((entry) => entry.status === "matched").length,
    negativeControl,
    negativeControlNativeComparisons: negativeNativeResults.length,
    cancelOrderNegative,
    disabledNegativeControls: disabledNegativeResults,
    mismatchArtifact: rawArtifacts.mismatchArtifact,
    compactMismatches: issues.slice(0, 250),
    mismatchCount: issues.length,
    rawScenarioDirectory: rawArtifacts.scenarioDir,
    scenarioFiles: rawArtifacts.scenarioFiles,
    negativeScenarioFiles: negativeArtifacts?.scenarioFiles ?? [],
    negativeMismatchArtifact: negativeArtifacts?.mismatchArtifact ?? null,
    requiredChannels: [...REQ_ACTOR, ...REQ_SESSION, "per-action message witness", "per-script global transport invocation order", "native CompareInteraction"],
    browser: { ...browserResult.versions, errors: browserResult.browserErrors },
    toolchain: { node: process.version, platform: process.platform,
      go: (goVersion.stdout ?? "").trim() || "unavailable on PATH", goComparator: comparator },
    sha256: hashes,
    commands: [`node session-tree/check.mjs --seeds ${options.seeds.join(",")} --cases ${options.cases} --max-actions ${options.maxActions} --output ${options.output}`],
    limits: ["Manual deterministic transports; HTTP lifecycle behavior is covered by the separate nested demo smoke."],
    nativeResults,
    negativeNativeResults,
    elapsedMs: Date.now() - started,
  };
  const encoded = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(options.output, encoded);
  const digest = createHash("sha256").update(encoded).digest("hex");
  console.log(JSON.stringify({ status: report.status, scripts: report.scripts, actions, globalTicks,
    candidateSessionObservations, referenceSessionObservations,
    nativeFramePairs: nativeFrames, nativeActorFrames: nativeFrames * 2,
    nativeComparisons: report.nativeComparisons, nativeMatched: report.nativeMatched,
    negativeControl: negativeControl.status, negativeControlNativeComparisons: negativeNativeResults.length,
    mismatches: report.mismatchCount, report: options.output, sha256: digest }, null, 2));
  if (report.status !== "matched") process.exitCode = 1;
}

async function uniqueOutputPath(requested) {
  const extension = extname(requested);
  const stem = requested.slice(0, requested.length - extension.length);
  for (let suffix = 0; ; suffix += 1) {
    const candidate = suffix === 0 ? requested : `${stem}-${suffix}${extension}`;
    let occupied = false;
    for (const path of [candidate, `${candidate.slice(0, candidate.length - extension.length)}-native`,
      `${candidate.slice(0, candidate.length - extension.length)}-scenarios`,
      `${candidate.slice(0, candidate.length - extension.length)}-mismatches.json`,
      `${candidate.slice(0, candidate.length - extension.length)}-focus-negative-scenarios`,
      `${candidate.slice(0, candidate.length - extension.length)}-focus-negative-mismatches.json`]) {
      try { await access(path); occupied = true; break; }
      catch { /* keep looking */ }
    }
    if (!occupied) return candidate;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}

export { canonical, expectedNativeStep, normalizedFocus as normalizeFocus, derivePostorder, validateNativeCoverage };
