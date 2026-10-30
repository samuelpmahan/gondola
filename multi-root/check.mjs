#!/usr/bin/env node
// Three-root replay helpers and a fail-closed report checker. The browser
// driver is dependency-injected so the same rules exercise real WASM actors
// and strict test actors.
import { isDeepStrictEqual } from "node:util";
import { spawn, spawnSync } from "node:child_process";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ROOTS, BACKENDS, TEST_BACKEND } from "./scripts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const BUILD_DIR = resolve(HERE, "build");
const own = (value) => value === undefined ? null : value;
const canonical = (value) => JSON.stringify(value);
const EMPTY_STEP = Object.freeze({ Path: "", Event: "", Value: "" });
const candidates = ["candidate", "reference"];

function issue(issues, field, details = {}) {
  issues.push({ field, ...details });
}

function validObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateFocus(value) {
  return value === null || (validObject(value) && typeof value.key === "string" && value.key.length > 0 &&
    Number.isSafeInteger(value.selectionStart) && value.selectionStart >= 0 &&
    Number.isSafeInteger(value.selectionEnd) && value.selectionEnd >= value.selectionStart &&
    typeof value.selectionDirection === "string");
}

/** Verify every actor emits the same required channels, even when peers agree. */
export function validateObservationShape(observation, root, participant = "candidate", tick = null) {
  const issues = [];
  const add = (field, expected, actual) => issue(issues, `observation-shape.${field}`, {
    root, participant, tick, expected, actual: own(actual),
  });
  if (!validObject(observation)) return [{ field: "observation-shape.observation", root, participant, tick, expected: "object", actual: own(observation) }];
  if (observation.root !== root) add("root", root, observation.root);
  if (typeof observation.mounted !== "boolean") add("mounted", "boolean", observation.mounted);
  if (!Number.isSafeInteger(observation.generation) || observation.generation < 0) add("generation", "non-negative safe integer", observation.generation);
  if (observation.mounted) {
    if (!Number.isSafeInteger(observation.sessionID) || observation.sessionID <= 0) add("sessionID", "positive safe integer", observation.sessionID);
    if (typeof observation.backend !== "string" || observation.backend.length === 0) add("backend", "non-empty string", observation.backend);
    if (!validObject(observation.snapshot)) add("snapshot", "object", observation.snapshot);
    else {
      if (!validObject(observation.snapshot.state)) add("snapshot.state", "object", observation.snapshot.state);
      if (!validObject(observation.snapshot.tree)) add("snapshot.tree", "object", observation.snapshot.tree);
      if (!Array.isArray(observation.snapshot.bindings)) add("snapshot.bindings", "array", observation.snapshot.bindings);
      if (!Array.isArray(observation.snapshot.messages)) add("snapshot.messages", "array", observation.snapshot.messages);
    }
  } else {
    if (observation.sessionID !== null) add("sessionID", "null while unmounted", observation.sessionID);
    if (observation.backend !== null) add("backend", "null while unmounted", observation.backend);
    if (observation.snapshot !== null) add("snapshot", "null while unmounted", observation.snapshot);
  }
  for (const field of ["audit", "transportLog", "serverRequests", "pending", "liveProps", "lifecycleEvents", "sessionHistory"]) {
    if (!Array.isArray(observation[field])) add(field, "array", observation[field]);
  }
  if (!validateFocus(observation.focus)) add("focus", "null or logical key and selection record", observation.focus);
  if (!Number.isSafeInteger(observation.dispatchCount) || observation.dispatchCount < 0) add("dispatchCount", "non-negative safe integer", observation.dispatchCount);
  const dom = observation.dom;
  if (!validObject(dom)) add("dom", "object", dom);
  else {
    for (const field of ["html", "root", "reportedHTML"]) {
      if (typeof dom[field] !== "string") add(`dom.${field}`, "string", dom[field]);
    }
    for (const field of ["disabled", "controls", "order", "reportedDisabled"]) {
      if (!Array.isArray(dom[field])) add(`dom.${field}`, "array", dom[field]);
    }
    if (!(dom.inputPath === null || typeof dom.inputPath === "string")) add("dom.inputPath", "string or null", dom.inputPath);
    if (!(dom.inputValue === null || typeof dom.inputValue === "string")) add("dom.inputValue", "string or null", dom.inputValue);
    if (!(dom.inputDisabled === null || typeof dom.inputDisabled === "boolean")) add("dom.inputDisabled", "boolean or null", dom.inputDisabled);
  }
  if (Array.isArray(observation.sessionHistory)) {
    if (observation.mounted && !observation.sessionHistory.some((entry) =>
      entry?.sessionID === observation.sessionID && entry?.generation === observation.generation)) {
      add("sessionHistory.current", "current session/generation is listed", observation.sessionHistory);
    }
    for (const [index, entry] of observation.sessionHistory.entries()) {
      if (!validObject(entry) || !Number.isSafeInteger(entry.sessionID) || entry.sessionID <= 0 ||
          !Number.isSafeInteger(entry.generation) || entry.generation < 1) {
        add(`sessionHistory.${index}`, "positive session and generation record", entry);
      }
    }
  }
  return issues;
}

function expectedMessage(action) {
  if (action.kind === "add") return { Name: "add", Arg: "" };
  if (action.kind === "fill") return { Name: `edit/${action.rowID}`, Arg: String(action.value ?? "").replace(/[\r\n]/g, "") };
  if (action.kind === "save") return { Name: "save", Arg: String(action.rowID) };
  if (action.kind === "click") return {
    Name: action.action,
    Arg: ["reset"].includes(action.action) ? "" : String(action.rowID ?? ""),
  };
  return null;
}

function normalizedFocus(focus) {
  if (!focus) return null;
  const selectionStart = focus.selectionStart ?? focus.SelectionStart;
  const selectionEnd = focus.selectionEnd ?? focus.SelectionEnd;
  return {
    key: focus.key ?? focus.Key ?? "",
    selectionStart,
    selectionEnd,
    selectionDirection: selectionStart === selectionEnd ? "none" : focus.selectionDirection ?? focus.SelectionDirection,
  };
}

const actorLocalEventKinds = new Set(["replace", "renderer-failure"]);

function lifecycleParityProjection(events) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => !actorLocalEventKinds.has(event?.kind))
    .map((event) => {
      if (!validObject(event)) return own(event);
      const { sequence, sessionID, backend, ...record } = event;
      return record;
    });
}

function compareObservationPair(candidate, reference, { compareFocus = false } = {}) {
  const mismatches = [];
  const compare = (field, left, right) => {
    if (!isDeepStrictEqual(left, right)) mismatches.push({ field, expected: own(right), actual: own(left) });
  };
  compare("mounted", candidate?.mounted, reference?.mounted);
  compare("generation", candidate?.generation, reference?.generation);
  compare("lifecycleEvents", lifecycleParityProjection(candidate?.lifecycleEvents), lifecycleParityProjection(reference?.lifecycleEvents));
  if (candidate?.mounted && reference?.mounted) {
    for (const field of ["state", "tree", "bindings", "messages"]) {
      compare(field, candidate.snapshot?.[field], reference.snapshot?.[field]);
    }
    for (const field of ["audit", "serverRequests", "pending"]) compare(field, candidate?.[field], reference?.[field]);
    const transportProjection = (entries) => entries?.map(({ SessionID, Generation, ...entry }) => entry);
    compare("transportLog", transportProjection(candidate?.transportLog), transportProjection(reference?.transportLog));
    for (const field of ["html", "root", "disabled", "controls", "order", "inputPath", "inputValue", "inputDisabled"]) {
      compare(`dom.${field}`, candidate?.dom?.[field], reference?.dom?.[field]);
    }
    compare("liveProps", candidate?.liveProps, reference?.liveProps);
    if (compareFocus) compare("focus", normalizedFocus(candidate?.focus), normalizedFocus(reference?.focus));
  }
  return mismatches;
}

function compareMessagesForAction(action, before, after, root, participant, tick, issues) {
  const want = expectedMessage(action);
  if (!want) return;
  const previous = before?.snapshot?.messages;
  const current = after?.snapshot?.messages;
  const prefix = Array.isArray(previous) && Array.isArray(current) &&
    isDeepStrictEqual(current.slice(0, previous.length), previous);
  const firstNew = prefix ? current[previous.length] : null;
  if (!prefix || !isDeepStrictEqual(firstNew, want)) issue(issues, "synchronized-no-op", {
    root, participant, tick, expected: want, actual: own(firstNew),
  });
  if (Number.isSafeInteger(before?.dispatchCount) && Number.isSafeInteger(after?.dispatchCount) &&
      after.dispatchCount !== before.dispatchCount + 1) issue(issues, "dispatch-receipt", {
    root, participant, tick, expected: before.dispatchCount + 1, actual: after.dispatchCount,
  });
}

function lifecycleRecord(event) {
  const { root, participant, ...record } = event;
  return record;
}

function activeOrLatestSession(observation) {
  if (observation?.mounted) return { sessionID: observation.sessionID, generation: observation.generation };
  const latest = observation?.sessionHistory?.at(-1);
  return latest ? { sessionID: latest.sessionID, generation: latest.generation } : { sessionID: null, generation: null };
}

function expectedEventsForTick(scenario, tickIndex, tick) {
  const specs = [];
  const add = (kind, root, participant, sessionID, details = {}) => {
    specs.push({ kind, root, participant, sessionID, ...details });
  };
  if (tickIndex === 0) {
    for (const root of ROOTS) {
      for (const participant of candidates) {
        const observation = tick.roots?.[root]?.[participant];
        if (observation?.mounted) add("mount", root, participant, observation.sessionID, { generation: observation.generation });
      }
    }
    return specs;
  }

  const action = scenario.actions?.[tickIndex - 1];
  const root = action?.root;
  if (!ROOTS.includes(root)) return specs;
  const previous = scenario.ticks?.[tickIndex - 1]?.roots?.[root];
  const current = tick.roots?.[root];
  const currentSession = (participant) => activeOrLatestSession(current?.[participant]);
  const previousSession = (participant) => activeOrLatestSession(previous?.[participant]);

  if (action.kind === "mount") {
    for (const participant of candidates) {
      const observation = current?.[participant];
      if (observation?.mounted) add("mount", root, participant, observation.sessionID, {
        generation: observation.generation,
        backend: participant === "candidate" ? action.backend : "react",
      });
    }
  } else if (action.kind === "unmount") {
    for (const participant of candidates) {
      const before = previous?.[participant];
      if (before?.mounted) add("dispose", root, participant, before.sessionID, { generation: before.generation });
    }
  } else if (action.kind === "replace") {
    const candidate = current?.candidate;
    if (candidate?.mounted) add("replace", root, "candidate", candidate.sessionID, { from: action.from, backend: action.backend });
  } else if (action.kind === "renderer-failure") {
    const candidate = current?.candidate;
    if (candidate?.mounted) add("renderer-failure", root, "candidate", candidate.sessionID, { backend: action.backend });
  } else if (action.kind === "release") {
    const live = candidates.every((participant) => previous?.[participant]?.mounted && current?.[participant]?.mounted);
    for (const participant of candidates) {
      if (live) add("reply", root, participant, currentSession(participant).sessionID, {
        requestID: action.requestID, mode: action.mode ?? "success",
      });
      else add("callback-rejected", root, participant, previousSession(participant).sessionID, {
        requestID: action.requestID, status: 409,
      });
    }
  } else if (action.kind === "focus") {
    for (const participant of candidates) add("focus", root, participant, currentSession(participant).sessionID, { rowID: action.rowID });
    for (const participant of candidates) add("dispatch", root, participant, currentSession(participant).sessionID, { action: action.kind });
  } else if (["add", "fill", "save", "click"].includes(action.kind)) {
    for (const participant of candidates) add("dispatch", root, participant, currentSession(participant).sessionID, { action: action.kind });
  }
  return specs;
}

function eventMatchesLifecycleSpec(event, spec) {
  if (!validObject(event)) return false;
  const { sequence, ...record } = event;
  if (spec.kind === "renderer-failure") {
    const { error, ...details } = record;
    return typeof error === "string" && error.length > 0 && isDeepStrictEqual(details, spec);
  }
  return isDeepStrictEqual(record, spec);
}

/** Validate root coverage, complete channels, unique sessions, event order, and lifecycle fences. */
export function validateReplayScenario(scenario) {
  const issues = [];
  if (!validObject(scenario)) return [{ field: "scenario", expected: "object", actual: own(scenario) }];
  if (scenario.executionError || scenario.disposeError) issue(issues, "execution", {
    expected: "scenario actions and cleanup complete", actual: scenario.executionError ?? scenario.disposeError,
  });
  const actions = Array.isArray(scenario.actions) ? scenario.actions : [];
  const ticks = Array.isArray(scenario.ticks) ? scenario.ticks : [];
  if (ticks.length !== actions.length + 1) issue(issues, "tick-count", { expected: actions.length + 1, actual: ticks.length });
  if (ticks.length === 0) issue(issues, "ticks-empty", { expected: "initial observation", actual: 0 });

  let lastSequence = 0;
  const history = Object.fromEntries(candidates.map((participant) => [participant,
    Object.fromEntries(ROOTS.map((root) => [root, { seen: new Set(), retired: new Set(), previous: null }]))]));
  const lifecycleHistory = Object.fromEntries(candidates.map((participant) => [participant,
    Object.fromEntries(ROOTS.map((root) => [root, []]))]));
  const focusRequested = new Set();
  for (const [tickIndex, tick] of ticks.entries()) {
    if (!validObject(tick)) {
      issue(issues, "tick", { tick: tickIndex, expected: "object", actual: own(tick) });
      continue;
    }
    if (tick.index !== tickIndex) issue(issues, "tick-index", { tick: tickIndex, expected: tickIndex, actual: tick.index });
    const expectedAction = tickIndex === 0 ? null : actions[tickIndex - 1];
    if (!isDeepStrictEqual(tick.action ?? null, expectedAction ?? null)) issue(issues, "tick-action", {
      tick: tickIndex, expected: own(expectedAction), actual: own(tick.action),
    });
    if (!validObject(tick.roots)) {
      issue(issues, "actors", { tick: tickIndex, expected: ROOTS, actual: own(tick.roots) });
      continue;
    }
    const mountedIDs = { candidate: new Map(), reference: new Map() };
    for (const root of ROOTS) {
      const pair = tick.roots[root];
      if (!validObject(pair)) {
        issue(issues, "actor", { tick: tickIndex, root, expected: "candidate/reference pair", actual: own(pair) });
        continue;
      }
      for (const participant of candidates) {
        const observation = pair[participant];
        for (const shapeIssue of validateObservationShape(observation, root, participant, tickIndex)) issues.push(shapeIssue);
        if (!observation || typeof observation !== "object") continue;
        const state = history[participant][root];
        const previous = state.previous;
        if (observation.mounted) {
          if (state.retired.has(observation.sessionID) || state.seen.has(observation.sessionID) && previous?.sessionID !== observation.sessionID) {
            issue(issues, "disposed-session-revival", { tick: tickIndex, root, participant, sessionID: observation.sessionID });
          }
          const peer = mountedIDs[participant].get(observation.sessionID);
          if (peer && peer !== root) issue(issues, "session-alias", {
            tick: tickIndex, participant, sessionID: observation.sessionID, roots: [peer, root],
          });
          mountedIDs[participant].set(observation.sessionID, root);
          if (previous?.mounted) {
            if (observation.sessionID !== previous.sessionID) issue(issues, "session-change-without-remount", {
              tick: tickIndex, root, participant, expected: previous.sessionID, actual: observation.sessionID,
            });
            if (observation.generation !== previous.generation) issue(issues, "generation-change-without-remount", {
              tick: tickIndex, root, participant, expected: previous.generation, actual: observation.generation,
            });
          } else if (previous && !previous.mounted) {
            if (observation.sessionID === previous.sessionID || state.seen.has(observation.sessionID)) issue(issues, "disposed-session-revival", {
              tick: tickIndex, root, participant, sessionID: observation.sessionID,
            });
            if (observation.generation !== previous.generation + 1) issue(issues, "generation-after-remount", {
              tick: tickIndex, root, participant, expected: previous.generation + 1, actual: observation.generation,
            });
          }
          state.seen.add(observation.sessionID);
        } else if (previous?.mounted) {
          state.retired.add(previous.sessionID);
        }
        if (observation.mounted) {
          const historyEntries = observation.sessionHistory ?? [];
          for (const item of historyEntries) {
            if (!state.seen.has(item.sessionID)) state.seen.add(item.sessionID);
            if (item.sessionID === observation.sessionID && item.generation !== observation.generation) {
              issue(issues, "session-history-current", { tick: tickIndex, root, participant, expected: observation.generation, actual: item.generation });
            }
          }
        }
        for (const [entryIndex, entry] of (observation.transportLog ?? []).entries()) {
          if (!validObject(entry) || !Number.isSafeInteger(entry.Sequence) || entry.Sequence <= entryIndex) {
            issue(issues, "transport-event-order", { tick: tickIndex, root, participant, actual: entry });
          }
          if (!Array.isArray(observation.sessionHistory) ||
              !observation.sessionHistory.some((item) => item.sessionID === entry?.SessionID && item.generation === entry?.Generation)) {
            issue(issues, "transport-session-scope", { tick: tickIndex, root, participant, actual: entry });
          }
        }
        state.previous = structuredClone(observation);
      }
    }
    if (!Array.isArray(tick.events)) issue(issues, "events", { tick: tickIndex, expected: "array", actual: own(tick.events) });
    const events = Array.isArray(tick.events) ? tick.events : [];
    const sequenceBeforeTick = lastSequence;
    for (const event of events) {
      if (!validObject(event) || !Number.isSafeInteger(event.sequence) || event.sequence !== lastSequence + 1 ||
          typeof event.kind !== "string" || !ROOTS.includes(event.root) || !candidates.includes(event.participant)) {
        issue(issues, "event-order", { tick: tickIndex, expected: `sequence ${lastSequence + 1} and a named root/participant/kind`, actual: own(event) });
      }
      if (validObject(event) && Number.isSafeInteger(event.sequence) && event.sequence > lastSequence) lastSequence = event.sequence;
    }

    const expectedEvents = expectedEventsForTick(scenario, tickIndex, tick);
    if (events.length !== expectedEvents.length || events.some((event, index) => !eventMatchesLifecycleSpec(event, expectedEvents[index]))) {
      issue(issues, "lifecycle-event-semantics", {
        tick: tickIndex,
        expected: expectedEvents,
        actual: events.map((event) => {
          if (!validObject(event)) return own(event);
          const { sequence, ...record } = event;
          return record;
        }),
      });
    }
    for (const [eventIndex, expected] of expectedEvents.entries()) {
      const actual = events[eventIndex];
      const sequence = Number.isSafeInteger(actual?.sequence) ? actual.sequence : sequenceBeforeTick + eventIndex + 1;
      const event = { sequence, ...expected };
      if (expected.kind === "renderer-failure" && typeof actual?.error === "string") event.error = actual.error;
      lifecycleHistory[expected.participant][expected.root].push(lifecycleRecord(event));
    }
    for (const root of ROOTS) {
      for (const participant of candidates) {
        const observation = tick.roots?.[root]?.[participant];
        if (!isDeepStrictEqual(observation?.lifecycleEvents, lifecycleHistory[participant][root])) {
          issue(issues, "lifecycle-history", {
            tick: tickIndex, root, participant,
            expected: lifecycleHistory[participant][root], actual: own(observation?.lifecycleEvents),
          });
        }
      }
    }

    const action = tick.action;
    if (action?.root && !ROOTS.includes(action.root)) issue(issues, "action-root", { tick: tickIndex, actual: action.root });
    if (action?.kind === "focus" && ROOTS.includes(action.root)) {
      // Focus belongs to one document at a time. The browser runner keeps the
      // React reference in isolated frames, but its witness is still compared
      // at the focus action and while that root is the requested focus target.
      focusRequested.clear();
      focusRequested.add(action.root);
    }
    if (action?.kind === "mount" && ROOTS.includes(action.root)) focusRequested.delete(action.root);
    if (action?.kind === "unmount" && ROOTS.includes(action.root)) focusRequested.delete(action.root);

    for (const root of ROOTS) {
      const pair = tick.roots[root];
      if (!validObject(pair)) continue;
      const isTargetAction = action?.root === root;
      if (isTargetAction && ["add", "fill", "save", "click"].includes(action.kind)) {
        const previousPair = ticks[tickIndex - 1]?.roots?.[root];
        for (const participant of candidates) compareMessagesForAction(
          action, previousPair?.[participant], pair[participant], root, participant, tickIndex, issues,
        );
      }
      if (action?.kind === "release" && isTargetAction) {
        for (const participant of candidates) {
          const prior = ticks[tickIndex - 1]?.roots?.[root]?.[participant];
          const next = pair[participant];
          if (prior?.mounted && next?.mounted) {
            const want = { Name: "reply", Arg: String(action.requestID) };
            const oldMessages = prior.snapshot?.messages ?? [];
            const messages = next.snapshot?.messages ?? [];
            if (!isDeepStrictEqual(messages.slice(oldMessages.length, oldMessages.length + 1)[0], want)) issue(issues, "reply-message", {
              tick: tickIndex, root, participant, expected: want, actual: own(messages[oldMessages.length]),
            });
          } else if (!next?.mounted) {
            const rejected = (tick.events ?? []).some((event) => event.root === root && event.kind === "callback-rejected");
            if (!rejected) issue(issues, "late-reply-rejection", { tick: tickIndex, root, participant, expected: "callback-rejected", actual: "missing" });
          }
        }
      }

      const previousFocused = focusRequested.has(root);
      for (const difference of compareObservationPair(pair.candidate, pair.reference, { compareFocus: previousFocused })) {
        issues.push({ tick: tickIndex, root, ...difference });
      }
      if (action?.kind === "focus" && isTargetAction) {
        const row = ticks[tickIndex - 1]?.roots?.[root]?.reference?.snapshot?.state?.Rows?.find((item) => item.ID === action.rowID);
        const value = String(row?.Draft ?? "").replace(/[\r\n]/g, "");
        const clamp = (item) => Math.max(0, Math.min(value.length, Math.trunc(Number(item) || 0)));
        const want = {
          key: `row-${action.rowID}-input`,
          selectionStart: clamp(action.selectionStart),
          selectionEnd: clamp(action.selectionEnd),
          selectionDirection: action.selectionDirection ?? "none",
        };
        for (const participant of candidates) {
          const actual = normalizedFocus(pair[participant]?.focus);
          if (!actual || actual.key !== want.key || actual.selectionStart !== want.selectionStart || actual.selectionEnd !== want.selectionEnd ||
              (want.selectionStart !== want.selectionEnd && ["forward", "backward"].includes(want.selectionDirection) && actual.selectionDirection !== want.selectionDirection)) {
            issue(issues, "focus-witness", { tick: tickIndex, root, participant, expected: want, actual: own(actual) });
          }
        }
      }
    }
  }
  return issues;
}

function nodePathForRow(snapshot, rowID, childIndex) {
  const rowIndex = snapshot?.state?.Rows?.findIndex((row) => row.ID === rowID) ?? -1;
  if (rowIndex < 0) return null;
  return `2/${rowIndex}/${childIndex}`;
}

/** Make a SameDOM-compatible native Go comparison envelope from one observation. */
export function nativeTick(index, step, observation) {
  if (!observation?.snapshot || !observation?.dom) return null;
  return {
    Index: index,
    Step: { Path: step?.Path ?? "", Event: step?.Event ?? "", Value: step?.Value ?? "" },
    State: canonical(observation.snapshot.state),
    Tree: canonical(observation.snapshot.tree),
    DOM: observation.dom.root,
    Pixels: "",
    Mutations: 0,
  };
}

/** Validate all native frames against their captured browser observation. */
export function validateNativeSegments(scenario) {
  const issues = [];
  const segments = Array.isArray(scenario?.nativeSegments) ? scenario.nativeSegments : [];
  const ticks = Array.isArray(scenario?.ticks) ? scenario.ticks : [];
  if (segments.length === 0) issue(issues, "native-segments-missing", { expected: "one or more native session traces", actual: segments.length });
  const seenSessionIDs = new Set();
  const seenSegments = new Set();
  const covered = new Set();
  for (const segment of segments) {
    if (!validObject(segment) || !ROOTS.includes(segment.root) || !Number.isSafeInteger(segment.sessionID) || segment.sessionID <= 0 ||
        !Number.isSafeInteger(segment.generation) || segment.generation < 1) {
      issue(issues, "native-segment", { expected: "root/session/generation record", actual: own(segment) });
      continue;
    }
    if (!Number.isSafeInteger(segment.referenceSessionID) || segment.referenceSessionID <= 0) {
      issue(issues, "native-segment", { root: segment.root, expected: "positive referenceSessionID", actual: segment.referenceSessionID });
      continue;
    }
    const key = `${segment.root}:${segment.generation}`;
    if (seenSegments.has(key)) issue(issues, "native-segment-duplicate", { root: segment.root, generation: segment.generation });
    seenSegments.add(key);
    for (const [participant, sessionID] of [["candidate", segment.sessionID], ["reference", segment.referenceSessionID]]) {
      const sessionKey = `${participant}:${sessionID}`;
      if (seenSessionIDs.has(sessionKey)) issue(issues, "native-session-alias", { root: segment.root, participant, sessionID });
      seenSessionIDs.add(sessionKey);
    }
    if (!Array.isArray(segment.frames) || segment.frames.length === 0) {
      issue(issues, "empty-native-frames", { root: segment.root, sessionID: segment.sessionID, generation: segment.generation });
      continue;
    }
    let previousTickIndex = -1;
    for (const [frameIndex, pair] of segment.frames.entries()) {
      const tickIndex = pair?.tickIndex;
      if (!Number.isSafeInteger(tickIndex) || tickIndex < 0 || tickIndex >= ticks.length || tickIndex <= previousTickIndex) {
        issue(issues, "native-tick-order", { root: segment.root, generation: segment.generation, frame: frameIndex, actual: tickIndex });
        continue;
      }
      previousTickIndex = tickIndex;
      const tick = ticks[tickIndex];
      const observations = tick?.roots?.[segment.root];
      if (!observations) {
        issue(issues, "native-observation-missing", { root: segment.root, tick: tickIndex });
        continue;
      }
      for (const participant of candidates) {
        const native = pair[participant];
        const observation = observations[participant];
        const expectedSessionID = participant === "candidate" ? segment.sessionID : segment.referenceSessionID;
        if (!observation?.mounted || observation.sessionID !== expectedSessionID || observation.generation !== segment.generation) {
          issue(issues, "native-lifecycle", { root: segment.root, participant, tick: tickIndex, sessionID: expectedSessionID, generation: segment.generation });
          continue;
        }
        covered.add(`${participant}:${segment.root}:${tickIndex}`);
        if (!validObject(native)) {
          issue(issues, "native-frame", { root: segment.root, participant, tick: tickIndex, expected: "native tick object", actual: own(native) });
          continue;
        }
        const requiredString = ["State", "Tree", "DOM"];
        if (native.Index !== frameIndex || !validObject(native.Step) ||
            !["Path", "Event", "Value"].every((field) => typeof native.Step[field] === "string") ||
            requiredString.some((field) => typeof native[field] !== "string" || native[field].length === 0) ||
            typeof native.Pixels !== "string" || !Number.isSafeInteger(native.Mutations) || native.Mutations < 0) {
          issue(issues, "native-frame", { root: segment.root, participant, tick: tickIndex, expected: "complete nonempty native envelope", actual: own(native) });
          continue;
        }
        let state;
        let tree;
        try { state = JSON.parse(native.State); tree = JSON.parse(native.Tree); }
        catch (error) {
          issue(issues, "native-json", { root: segment.root, participant, tick: tickIndex, actual: String(error) });
          continue;
        }
        if (!isDeepStrictEqual(state, observation.snapshot.state) || !isDeepStrictEqual(tree, observation.snapshot.tree) || native.DOM !== observation.dom.root) {
          issue(issues, "native-source-disagreement", { root: segment.root, participant, tick: tickIndex });
        }
        if (frameIndex === 0 && !isDeepStrictEqual(native.Step, EMPTY_STEP)) issue(issues, "native-initial-step", { root: segment.root, participant, tick: tickIndex, actual: native.Step });
        if (frameIndex > 0) {
          const action = tick.action;
          const previousReference = ticks[tickIndex - 1]?.roots?.[segment.root]?.reference?.snapshot;
          const expected = action?.root === segment.root ? nativeStep(action, previousReference ?? observation.snapshot) : EMPTY_STEP;
          if (!isDeepStrictEqual(native.Step, expected)) issue(issues, "native-step", { root: segment.root, participant, tick: tickIndex, expected, actual: native.Step });
        }
      }
    }
  }
  for (const [tickIndex, tick] of ticks.entries()) {
    for (const root of ROOTS) {
      const pair = tick?.roots?.[root];
      for (const participant of candidates) {
        if (pair?.[participant]?.mounted && !covered.has(`${participant}:${root}:${tickIndex}`)) {
          issue(issues, "native-frame-missing", { root, participant, tick: tickIndex });
        }
      }
    }
  }
  return issues;
}

export function nativeStep(action, snapshot) {
  if (!action) return { ...EMPTY_STEP };
  if (action.kind === "add") return { Path: "0", Event: "click", Value: "" };
  if (action.kind === "fill") {
    const binding = snapshot?.bindings?.find((item) => item.Message === `edit/${action.rowID}`);
    return { Path: binding?.Path ?? "", Event: "input", Value: String(action.value ?? "").replace(/[\r\n]/g, "") };
  }
  if (action.kind === "save") return { Path: nodePathForRow(snapshot, action.rowID, 5) ?? "", Event: "click", Value: String(action.rowID) };
  if (action.kind === "click") {
    const child = { save: 5, remove: 6, up: 7, cancel: 8 }[action.action];
    const path = action.action === "reset" ? "1" : nodePathForRow(snapshot, action.rowID, child);
    return { Path: path ?? "", Event: "click", Value: action.action === "reset" ? "" : String(action.rowID ?? "") };
  }
  if (action.kind === "focus") return { Path: nodePathForRow(snapshot, action.rowID, 0) ?? "", Event: "focus", Value: "" };
  if (action.kind === "release") return { Path: "", Event: `release:${action.mode ?? "success"}`, Value: String(action.requestID) };
  return { ...EMPTY_STEP };
}

/** Compare every application, rendering, focus, transport, and lifecycle channel. */
export function compareReplayScenario(scenario) {
  const issues = validateReplayScenario(scenario);
  for (const [tickIndex, tick] of (scenario?.ticks ?? []).entries()) {
    if (!validObject(tick?.roots)) continue;
    for (const root of ROOTS) {
      const pair = tick.roots[root];
      if (!pair?.candidate || !pair?.reference) continue;
      const action = tick.action;
      if (action?.kind === "replace" && action.root === root && pair.candidate.mounted && pair.candidate.backend !== action.backend) {
        // Same-backend replacements and self-directed coverage are required no-ops.
        if (action.from !== action.backend) issue(issues, "backend-replacement", {
          tick: tickIndex, root, expected: action.backend, actual: pair.candidate.backend,
        });
      }
    }
  }
  for (const issue of validateNativeSegments(scenario)) issues.push(issue);
  return issues;
}

export function makeNativeTick(index, action, root, observation, previousSnapshot, stepIndex = index) {
  const step = stepIndex === 0 || action?.root !== root ? EMPTY_STEP : nativeStep(action, previousSnapshot);
  return nativeTick(stepIndex, step, observation);
}

export function nativeComparisonInput(segment) {
  return {
    golden: { Implementation: "Independent React 19.3.1 multi-root reference", Ticks: segment.frames.map(({ reference }) => reference) },
    candidate: { Implementation: `Go multi-root WASM session ${segment.sessionID}`, Ticks: segment.frames.map(({ candidate }) => candidate) },
  };
}

async function replayInBrowser(scripts) {
  const ROOTS = ["alpha", "beta", "gamma"];
  const app = globalThis.__multiRootDemo;
  if (!app?.host || !Array.isArray(app.slots) || app.slots.length !== 3) throw new Error("multi-root demo did not expose three mounted candidate roots");
  const [{ createMultiRootHost }, { createMultiRootReference }, { mountKeyedReact }] = await Promise.all([
    import("/multi-root/host.mjs"),
    import("/multi-root/build/reference.bundle.mjs"),
    import("/multi-root/build/react.bundle.mjs"),
  ]);
  const slotByRoot = { alpha: app.slots[0], beta: app.slots[1], gamma: app.slots[2] };
  const candidateManager = app.manager;

  const referenceManager = createMultiRootReference();
  const referenceRecords = new Map();
  const referenceHost = createMultiRootHost({
    manager: referenceManager,
    descriptors: { react: mountKeyedReact },
    transportFactory(sessionID, root, generation) {
      const requests = new Map();
      const events = [];
      const transport = {
        start(command, deliver) {
          if (requests.has(command.ID)) throw new Error(`reference reused request ID ${command.ID} in session ${sessionID}`);
          const record = {
            ID: command.ID, Value: command.Value, Mode: "held", ResultMode: "", State: "held",
            CancelObserved: false, Status: 0, ResponseID: 0, Error: "", deliver, cancelled: false, delivered: false,
          };
          requests.set(command.ID, record);
          events.push({ Kind: "start", ID: command.ID, Value: command.Value });
        },
        cancel(ID) {
          const record = requests.get(ID);
          if (!record || record.delivered || record.cancelled) return;
          record.cancelled = true;
          record.CancelObserved = true;
          record.State = "cancelled";
          record.Error = "client cancelled";
          events.push({ Kind: "cancel", ID });
        },
        log() { return events.map((event) => ({ ...event })); },
        requestList() {
          return [...requests.values()].map(({ deliver, cancelled, delivered, ...record }) => ({ ...record }));
        },
        release(ID, mode = "success") {
          const record = requests.get(ID);
          if (!record || record.cancelled || record.delivered) throw new Error(`reference request ${ID} is not held`);
          record.delivered = true;
          record.State = "completed";
          record.ResultMode = mode;
          record.Status = 200;
          record.ResponseID = ID;
          record.Error = mode === "error" ? "server rejected" : "";
          const reply = { ID, Value: mode === "error" ? "" : record.Value, Error: record.Error };
          events.push({ Kind: "reply", ...reply });
          record.deliver(reply);
        },
        lateCallback(ID, reply) {
          const record = requests.get(ID);
          if (!record) throw new Error(`reference request ${ID} was never started`);
          // Invoke the saved callback after cancellation. The host's root
          // generation fence must reject it before it reaches the model.
          record.deliver({ ...reply });
        },
      };
      referenceRecords.set(sessionID, { sessionID, generation, root, transport });
      return transport;
    },
  });

  const referenceFrames = {};
  const referenceRoots = Object.fromEntries(["alpha", "beta", "gamma"].map((root) => {
    const frame = document.createElement("iframe");
    frame.dataset.referenceFrame = root;
    frame.style.position = "fixed";
    frame.style.left = "-10000px";
    frame.style.top = "0";
    frame.style.width = "800px";
    frame.style.height = "600px";
    document.body.append(frame);
    referenceFrames[root] = frame;
    const element = frame.contentDocument.createElement("div");
    element.dataset.referenceRoot = root;
    frame.contentDocument.body.append(element);
    return [root, element];
  }));

  const browserScenarios = [];
  let candidateOrder = 0;
  let referenceOrder = 0;

  const normalizeRecord = (record) => ({
    ID: record.ID,
    Value: record.Value,
    Mode: record.Mode,
    ResultMode: record.ResultMode,
    State: record.State,
    CancelObserved: record.CancelObserved,
    Status: record.Status,
    ResponseID: record.ResponseID,
    Error: record.Error,
  });

  function instrumentCurrentCandidate(slot, root, generationHistory, transportHistory) {
    const sessionID = app.host.session(slot.root);
    const generation = app.host.snapshotAll().find((entry) => entry.sessionID === sessionID)?.generation;
    slot.sessionID = sessionID;
    slot.generation = generation;
    slot.disposed = false;
    slot.modeInput.value = "held";
    generationHistory.push({ sessionID, generation });
    transportHistory.push({
      sessionID,
      generation,
      lane: slot.lane,
      transport: slot.transport,
      lastLogCount: 0,
      events: [],
      serverRequests: [],
    });
    return { sessionID, generation };
  }

  function startCandidateMount(root, backend, context) {
    const slot = slotByRoot[root];
    const mounted = app.host.mount(slot.root, backend);
    slot.sessionID = mounted.sessionID;
    slot.generation = mounted.generation;
    slot.disposed = false;
    slot.modeInput.value = "held";
    context.candidateHandles[root] = { sessionID: mounted.sessionID, generation: mounted.generation };
    context.dispatchCounts.candidate[mounted.sessionID] = 0;
    context.sessionHistory.candidate[root].push({ sessionID: mounted.sessionID, generation: mounted.generation });
    context.transportHistory.candidate[root].push({
      sessionID: mounted.sessionID, generation: mounted.generation, lane: slot.lane,
      transport: slot.transport, lastLogCount: 0, events: [], serverRequests: [],
    });
    return mounted;
  }

  function startReferenceMount(root, context) {
    const mounted = referenceHost.mount(referenceRoots[root], "react");
    context.referenceHandles[root] = { sessionID: mounted.sessionID, generation: mounted.generation };
    context.dispatchCounts.reference[mounted.sessionID] = 0;
    context.sessionHistory.reference[root].push({ sessionID: mounted.sessionID, generation: mounted.generation });
    const transportRecord = referenceRecords.get(mounted.sessionID);
    if (!transportRecord) throw new Error(`reference transport for session ${mounted.sessionID} was not created`);
    context.transportHistory.reference[root].push({
      sessionID: mounted.sessionID, generation: mounted.generation, transport: transportRecord.transport,
      lastLogCount: 0, events: [], serverRequests: [],
    });
    return mounted;
  }

  async function readCandidateServerRequests(record) {
    if (!record?.lane) return [];
    const response = await fetch(`/api/requests?lane=${encodeURIComponent(record.lane)}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`request list for ${record.lane} returned HTTP ${response.status}`);
    const payload = await response.json();
    record.serverRequests = (payload.requests ?? []).map(normalizeRecord);
    return record.serverRequests;
  }

  async function waitCandidateServerState(record, requestID, expectedState) {
    const deadline = Date.now() + 10_000;
    let last = [];
    while (Date.now() < deadline) {
      last = await readCandidateServerRequests(record);
      if (last.some((item) => item.ID === requestID && item.State === expectedState)) return last;
      await new Promise((resolveWait) => setTimeout(resolveWait, 25));
    }
    throw new Error(`session ${record.sessionID} request ${requestID} did not reach ${expectedState}: ${JSON.stringify(last)}`);
  }

  function pollTransportEvents(context) {
    for (const side of ["candidate", "reference"]) {
      for (const root of ROOTS) {
        for (const record of context.transportHistory[side][root]) {
          const raw = record.transport?.log?.() ?? [];
          for (const event of raw.slice(record.lastLogCount)) {
            const sequence = side === "candidate" ? ++candidateOrder : ++referenceOrder;
            record.events.push({ ...event, Sequence: sequence, SessionID: record.sessionID, Generation: record.generation });
          }
          record.lastLogCount = raw.length;
          if (side === "reference") record.serverRequests = record.transport.requestList();
        }
      }
    }
  }

  function flattenForRoot(side, root, context, field) {
    return context.transportHistory[side][root].flatMap((record) => record[field]).map((item) => ({ ...item }))
      .sort((left, right) => (left.Sequence ?? 0) - (right.Sequence ?? 0));
  }

  function elementPath(element, container) {
    const top = container.firstElementChild;
    if (!top || !top.contains(element)) return null;
    const indexes = [];
    let current = element;
    while (current !== top) {
      const parent = current.parentNode;
      if (!parent) return null;
      indexes.push(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return indexes.reverse().join("/");
  }

  function pathElement(container, path) {
    let current = container.firstElementChild;
    if (!current) throw new Error("renderer root is empty");
    if (!path) return current;
    for (const piece of path.split("/")) {
      const index = Number(piece);
      if (!Number.isSafeInteger(index) || index < 0 || !current.childNodes[index]) throw new Error(`invalid DOM path ${path}`);
      current = current.childNodes[index];
    }
    return current;
  }

  function liveDOM(container, entry) {
    if (!entry || !container.firstElementChild) return { dom: {
      html: "", root: "", reportedHTML: "", disabled: [], controls: [], order: [],
      inputPath: null, inputValue: null, inputDisabled: null, reportedDisabled: [],
    }, liveProps: [] };
    const top = container.firstElementChild;
    const controls = Array.from(container.querySelectorAll("input,button")).map((element) => ({
      path: elementPath(element, container),
      tag: element.localName,
      value: element.localName === "input" ? element.value : null,
      disabled: element.disabled === true,
      type: element.localName === "input" ? element.type : null,
      label: element.getAttribute("aria-label"),
    }));
    const disabled = controls.filter((control) => control.disabled).map((control) => control.path);
    const active = container.ownerDocument.activeElement;
    const focused = active && container.contains(active) && active.localName === "input" ? active : null;
    const order = entry.snapshot?.state?.Rows?.map(({ ID }) => ID) ?? [];
    const liveProps = Array.from(container.querySelectorAll("input,button")).map((element) => ({
      path: elementPath(element, container), tag: element.localName,
      value: element.localName === "input" ? element.value : null,
      defaultValue: element.localName === "input" ? element.defaultValue : null,
      disabled: element.disabled === true,
      checked: element.localName === "input" ? element.checked : null,
      type: element.localName === "input" ? element.type : null,
    }));
    const reported = entry.domSnapshot ?? { html: "", disabled: [] };
    return {
      dom: {
        html: reported.html,
        root: container.innerHTML,
        reportedHTML: reported.html,
        disabled,
        controls,
        order,
        inputPath: focused ? elementPath(focused, container) : null,
        inputValue: focused ? focused.value : null,
        inputDisabled: focused ? focused.disabled : null,
        reportedDisabled: reported.disabled ?? [],
      },
      liveProps,
    };
  }

  function normalizedFocus(value) {
    if (!value) return null;
    return {
      key: value.key ?? value.Key ?? "",
      selectionStart: value.selectionStart ?? value.SelectionStart,
      selectionEnd: value.selectionEnd ?? value.SelectionEnd,
      selectionDirection: value.selectionDirection ?? value.SelectionDirection,
    };
  }

  function captureObservation(side, root, context) {
    const handle = context[side === "candidate" ? "candidateHandles" : "referenceHandles"][root];
    const container = side === "candidate" ? slotByRoot[root].root : referenceRoots[root];
    const sessionHistory = context.sessionHistory[side][root].map((item) => ({ ...item }));
    const transportLog = flattenForRoot(side, root, context, "events");
    const serverRequests = flattenForRoot(side, root, context, "serverRequests").map(normalizeRecord);
    const pending = serverRequests.filter((item) => item.State === "held" || item.State === "cancelled").map((item) => ({
      ID: item.ID, Value: item.Value, Cancelled: item.State === "cancelled",
    }));
    const entries = side === "candidate" ? app.host.snapshotAll() : referenceHost.snapshotAll();
    const entry = handle ? entries.find((item) => item.sessionID === handle.sessionID) : null;
    const dispatchCount = sessionHistory.reduce((total, item) => {
      if (entry?.sessionID === item.sessionID) return total + (entry.snapshot?.messages?.length ?? 0);
      return total + (context.dispatchCounts[side][item.sessionID] ?? 0);
    }, 0);
    if (!entry) {
      return {
        root, mounted: false, sessionID: null, generation: handle?.generation ?? context.lastGeneration[side][root] ?? 0,
        backend: null, snapshot: null, audit: [], transportLog, serverRequests, pending, focus: null,
        sessionHistory, dom: liveDOM(container, null).dom, liveProps: [], lifecycleEvents: context.lifecycle[side][root].map((event) => ({ ...event })),
        dispatchCount,
      };
    }
    context.lastGeneration[side][root] = entry.generation;
    const rendered = liveDOM(container, entry);
    const focusedRowID = context.focusWitness[side][root];
    const focusedInput = focusedRowID === null ? null : Array.from(container.querySelectorAll("input"))
      .find((item) => item.getAttribute("aria-label") === `Row ${focusedRowID}`) ?? null;
    const focus = focusedInput ? {
      key: `row-${focusedRowID}-input`,
      selectionStart: focusedInput.selectionStart ?? 0,
      selectionEnd: focusedInput.selectionEnd ?? 0,
      selectionDirection: focusedInput.selectionDirection ?? "none",
    } : null;
    // Chromium has one active frame at a time. Read the native input's own
    // selection so the independent React actor can be observed without
    // stealing focus from the candidate document (or vice versa).
    if (focusedInput) {
      rendered.dom.inputPath = elementPath(focusedInput, container);
      rendered.dom.inputValue = focusedInput.value;
      rendered.dom.inputDisabled = focusedInput.disabled === true;
    } else {
      rendered.dom.inputPath = null;
      rendered.dom.inputValue = null;
      rendered.dom.inputDisabled = null;
    }
    return {
      root, mounted: true, sessionID: entry.sessionID, generation: entry.generation, backend: entry.backend,
      snapshot: entry.snapshot, audit: entry.audit ?? [], transportLog, serverRequests, pending,
      focus, sessionHistory, dom: rendered.dom, liveProps: rendered.liveProps,
      lifecycleEvents: context.lifecycle[side][root].map((event) => ({ ...event })),
      dispatchCount,
    };
  }

  function currentSnapshot(side, root, context) {
    const handle = context[side === "candidate" ? "candidateHandles" : "referenceHandles"][root];
    if (!handle) throw new Error(`${root} is not mounted on ${side}`);
    const entries = side === "candidate" ? app.host.snapshotAll() : referenceHost.snapshotAll();
    const entry = entries.find((item) => item.sessionID === handle.sessionID);
    if (!entry?.snapshot) throw new Error(`${root} has no current snapshot on ${side}`);
    return entry.snapshot;
  }

  function resolveActionPath(action, snapshot) {
    if (action.kind === "add") return "0";
    if (action.kind === "click") {
      if (action.action === "reset") return "1";
      const child = { save: 5, remove: 6, up: 7, cancel: 8 }[action.action];
      const index = snapshot.state.Rows.findIndex((row) => row.ID === action.rowID);
      if (child === undefined || index < 0) throw new Error(`cannot route ${action.action} for row ${action.rowID}`);
      return `2/${index}/${child}`;
    }
    if (action.kind === "save") {
      const index = snapshot.state.Rows.findIndex((row) => row.ID === action.rowID);
      if (index < 0) throw new Error(`cannot route save for row ${action.rowID}`);
      return `2/${index}/5`;
    }
    if (action.kind === "fill") {
      const binding = snapshot.bindings.find((item) => item.Message === `edit/${action.rowID}`);
      if (!binding) throw new Error(`no current input binding for row ${action.rowID}`);
      return binding.Path;
    }
    return null;
  }

  function appendReplayEvent(context, tickEvents, kind, root, side, sessionID = null, details = {}) {
    const record = { sequence: ++context.eventSequence, kind, root, participant: side, sessionID, ...details };
    tickEvents.push(record);
    context.lifecycle[side][root].push({ sequence: record.sequence, kind, sessionID, ...details });
    return record;
  }

  async function runAction(script, action, context, tickEvents) {
    const root = action.root;
    const slot = slotByRoot[root];
    const candidateHandle = context.candidateHandles[root];
    const referenceHandle = context.referenceHandles[root];
    const candidateTransportBefore = action.kind === "save"
      ? context.transportHistory.candidate[root].at(-1)
      : null;
    const priorHeldRequestIDs = candidateTransportBefore?.serverRequests
      .filter((request) => request.State === "held")
      .map((request) => request.ID) ?? [];
    if (action.kind === "mount") {
      const candidate = startCandidateMount(root, action.backend, context);
      const reference = startReferenceMount(root, context);
      context.focusWitness.candidate[root] = null;
      context.focusWitness.reference[root] = null;
      appendReplayEvent(context, tickEvents, "mount", root, "candidate", candidate.sessionID, { generation: candidate.generation, backend: action.backend });
      appendReplayEvent(context, tickEvents, "mount", root, "reference", reference.sessionID, { generation: reference.generation, backend: "react" });
      return;
    }
    if (action.kind === "unmount") {
      if (candidateHandle) {
        const old = context.transportHistory.candidate[root].at(-1);
        context.dispatchCounts.candidate[candidateHandle.sessionID] = app.host.snapshotAll()
          .find((entry) => entry.sessionID === candidateHandle.sessionID)?.snapshot?.messages?.length ?? 0;
        app.host.unmount(slot.root);
        slot.transport?.dispose?.();
        slot.disposed = true;
        context.candidateHandles[root] = null;
        context.lastGeneration.candidate[root] = candidateHandle.generation;
        appendReplayEvent(context, tickEvents, "dispose", root, "candidate", candidateHandle.sessionID, { generation: candidateHandle.generation });
        if (old?.transport?.settled) await old.transport.settled();
        if (old) await waitCandidateServerState(old, old.serverRequests.find((item) => item.State === "held")?.ID, "cancelled").catch(async () => { await readCandidateServerRequests(old); });
      }
      if (referenceHandle) {
        context.dispatchCounts.reference[referenceHandle.sessionID] = referenceHost.snapshotAll()
          .find((entry) => entry.sessionID === referenceHandle.sessionID)?.snapshot?.messages?.length ?? 0;
        referenceHost.unmount(referenceRoots[root]);
        context.referenceHandles[root] = null;
        context.lastGeneration.reference[root] = referenceHandle.generation;
        appendReplayEvent(context, tickEvents, "dispose", root, "reference", referenceHandle.sessionID, { generation: referenceHandle.generation });
      }
      context.focusWitness.candidate[root] = null;
      context.focusWitness.reference[root] = null;
      return;
    }
    if (action.kind === "renderer-failure") {
      try {
        app.host.replace(slot.root, action.backend);
        throw new Error(`failure probe unexpectedly mounted ${action.backend}`);
      } catch (error) {
        if (String(error?.message ?? error).includes("unexpectedly mounted")) throw error;
        appendReplayEvent(context, tickEvents, "renderer-failure", root, "candidate", candidateHandle?.sessionID ?? null, {
          backend: action.backend, error: String(error?.message ?? error),
        });
      }
      return;
    }
    if (action.kind === "replace") {
      const entry = app.host.snapshotAll().find((item) => item.sessionID === candidateHandle?.sessionID);
      if (entry?.backend !== action.from) throw new Error(`${root} expected backend ${action.from}, got ${entry?.backend}`);
      // The reference actors live in their own frame and focusing one steals
      // Chromium's single outer-page focus chain. Re-activate the candidate's
      // existing input without changing its selection, then let the real host
      // capture and restore that focus as it replaces the renderer.
      const focusedRowID = context.focusWitness.candidate[root];
      if (focusedRowID !== null) {
        const input = Array.from(slot.root.querySelectorAll("input"))
          .find((item) => item.getAttribute("aria-label") === `Row ${focusedRowID}`);
        input?.focus();
      }
      app.host.replace(slot.root, action.backend);
      appendReplayEvent(context, tickEvents, "replace", root, "candidate", candidateHandle.sessionID, { from: action.from, backend: action.backend });
      return;
    }
    if (action.kind === "release") {
      if (!candidateHandle || !referenceHandle) {
        const candidateRecord = context.transportHistory.candidate[root].at(-1);
        const referenceRecord = context.transportHistory.reference[root].at(-1);
        const lateReply = { ID: action.requestID, Value: "late response", Error: "" };
        const result = await app.attemptLateRelease(slot, action.requestID);
        if (result?.status !== 409) throw new Error(`late release expected HTTP 409, got ${result?.status}`);
        referenceRecord?.transport?.lateCallback(action.requestID, lateReply);
        appendReplayEvent(context, tickEvents, "callback-rejected", root, "candidate", candidateRecord?.sessionID ?? null, { requestID: action.requestID, status: 409 });
        appendReplayEvent(context, tickEvents, "callback-rejected", root, "reference", referenceRecord?.sessionID ?? null, { requestID: action.requestID, status: 409 });
        if (candidateRecord) await readCandidateServerRequests(candidateRecord);
        return;
      }
      const candidateRecord = context.transportHistory.candidate[root].at(-1);
      const referenceRecord = context.transportHistory.reference[root].at(-1);
      const refRequest = referenceRecord.transport.requestList().find((request) => request.ID === action.requestID);
      if (!refRequest) throw new Error(`reference request ${action.requestID} is not active`);
      const mode = action.mode ?? "success";
      await app.releaseHeld(slot, action.requestID, mode);
      await readCandidateServerRequests(candidateRecord);
      referenceRecord.transport.release(action.requestID, mode);
      await referenceHost.settled();
      appendReplayEvent(context, tickEvents, "reply", root, "candidate", candidateHandle.sessionID, { requestID: action.requestID, mode });
      appendReplayEvent(context, tickEvents, "reply", root, "reference", referenceHandle.sessionID, { requestID: action.requestID, mode });
      return;
    }
    if (["add", "fill", "save", "click", "focus"].includes(action.kind)) {
      for (const side of ["candidate", "reference"]) {
        const container = side === "candidate" ? slot.root : referenceRoots[root];
        const snapshot = currentSnapshot(side, root, context);
        if (action.kind === "focus") {
          const row = snapshot.state.Rows.find((item) => item.ID === action.rowID);
          if (!row) throw new Error(`cannot focus missing row ${action.rowID} on ${side}`);
          const input = Array.from(container.querySelectorAll("input")).find((item) => item.getAttribute("aria-label") === `Row ${action.rowID}`);
          if (!input) throw new Error(`cannot find row ${action.rowID} input on ${side}`);
          input.focus();
          input.setSelectionRange(action.selectionStart, action.selectionEnd, action.selectionDirection ?? "none");
          context.focusWitness[side][root] = action.rowID;
          appendReplayEvent(context, tickEvents, "focus", root, side, (side === "candidate" ? candidateHandle : referenceHandle).sessionID, {
            rowID: action.rowID,
          });
          continue;
        }
        const path = resolveActionPath(action, snapshot);
        const element = pathElement(container, path);
        if (action.kind === "fill") {
          element.value = String(action.value ?? "");
          element.dispatchEvent(new container.ownerDocument.defaultView.InputEvent("input", { bubbles: true }));
        } else element.click();
      }
      await Promise.all([app.host.settled(), referenceHost.settled()]);
      for (const side of ["candidate", "reference"]) {
        const handle = (side === "candidate" ? context.candidateHandles : context.referenceHandles)[root];
        appendReplayEvent(context, tickEvents, "dispatch", root, side, handle?.sessionID ?? null, { action: action.kind });
      }
      if (action.kind === "save") {
        const candidateRecord = context.transportHistory.candidate[root].at(-1);
        const requestID = currentSnapshot("candidate", root, context).state.Rows.find((row) => row.ID === action.rowID)?.PendingID;
        if (!requestID) throw new Error(`save on ${root} did not produce a pending request`);
        await waitCandidateServerState(candidateRecord, requestID, "held");
        // Re-saving a row cancels its prior held request. Abort observation is
        // asynchronous at the HTTP server, so wait for the explicit terminal
        // cancellation record (bounded by waitCandidateServerState's 10s
        // deadline) before comparing this action's observations.
        for (const priorID of priorHeldRequestIDs) {
          if (priorID !== requestID) await waitCandidateServerState(candidateRecord, priorID, "cancelled");
        }
      }
      return;
    }
    throw new Error(`unsupported replay action ${JSON.stringify(action)}`);
  }

  function nativeStepFor(action, root, snapshot) {
    if (!action || action.root !== root) return { Path: "", Event: "", Value: "" };
    if (action.kind === "add") return { Path: "0", Event: "click", Value: "" };
    if (action.kind === "fill") {
      const binding = snapshot?.bindings?.find((item) => item.Message === `edit/${action.rowID}`);
      return { Path: binding?.Path ?? "", Event: "input", Value: String(action.value ?? "").replace(/[\r\n]/g, "") };
    }
    const index = snapshot?.state?.Rows?.findIndex((row) => row.ID === action.rowID) ?? -1;
    if (action.kind === "save") return { Path: index < 0 ? "" : `2/${index}/5`, Event: "click", Value: String(action.rowID) };
    if (action.kind === "click") {
      const child = { save: 5, remove: 6, up: 7, cancel: 8 }[action.action];
      const path = action.action === "reset" ? "1" : index < 0 || child === undefined ? "" : `2/${index}/${child}`;
      return { Path: path, Event: "click", Value: action.action === "reset" ? "" : String(action.rowID ?? "") };
    }
    if (action.kind === "focus") return { Path: index < 0 ? "" : `2/${index}/0`, Event: "focus", Value: "" };
    if (action.kind === "release") return { Path: "", Event: `release:${action.mode ?? "success"}`, Value: String(action.requestID) };
    return { Path: "", Event: "", Value: "" };
  }

  function addNativeFrames(scenario) {
    const current = new Map();
    for (const [tickIndex, tick] of scenario.ticks.entries()) {
      for (const root of ROOTS) {
        const pair = tick.roots[root];
        const candidate = pair.candidate;
        const reference = pair.reference;
        if (!candidate.mounted || !reference.mounted) continue;
        const key = `${root}:${candidate.generation}`;
        let segment = current.get(key);
        if (!segment) {
          segment = {
            root,
            sessionID: candidate.sessionID,
            referenceSessionID: reference.sessionID,
            generation: candidate.generation,
            frames: [],
          };
          current.set(key, segment);
          scenario.nativeSegments.push(segment);
        }
        const index = segment.frames.length;
        const previous = scenario.ticks[tickIndex - 1]?.roots?.[root]?.reference?.snapshot;
        const step = index === 0 ? { Path: "", Event: "", Value: "" } : nativeStepFor(tick.action, root, previous ?? reference.snapshot);
        const make = (observation) => ({
          Index: index,
          Step: { ...step },
          State: JSON.stringify(observation.snapshot.state),
          Tree: JSON.stringify(observation.snapshot.tree),
          DOM: observation.dom.root,
          Pixels: "",
          Mutations: 0,
        });
        segment.frames.push({ tickIndex, reference: make(reference), candidate: make(candidate) });
      }
    }
  }

  function blankObservation(root, generation, history, lifecycle) {
    return {
      root, mounted: false, sessionID: null, generation, backend: null, snapshot: null,
      audit: [], transportLog: [], serverRequests: [], pending: [], focus: null,
      sessionHistory: history.map((item) => ({ ...item })),
      dom: { html: "", root: "", reportedHTML: "", disabled: [], controls: [], order: [], inputPath: null, inputValue: null, inputDisabled: null, reportedDisabled: [] },
      liveProps: [], lifecycleEvents: lifecycle.map((item) => ({ ...item })), dispatchCount: 0,
    };
  }

  async function executeScenario(script) {
    const context = {
      candidateHandles: {}, referenceHandles: {},
      focusWitness: { candidate: {}, reference: {} },
      dispatchCounts: { candidate: {}, reference: {} },
      sessionHistory: { candidate: {}, reference: {} },
      transportHistory: { candidate: {}, reference: {} },
      lifecycle: { candidate: {}, reference: {} },
      lastGeneration: { candidate: {}, reference: {} },
      eventSequence: 0,
    };
    for (const root of ROOTS) {
      context.sessionHistory.candidate[root] = [];
      context.sessionHistory.reference[root] = [];
      context.focusWitness.candidate[root] = null;
      context.focusWitness.reference[root] = null;
      context.transportHistory.candidate[root] = [];
      context.transportHistory.reference[root] = [];
      context.lifecycle.candidate[root] = [];
      context.lifecycle.reference[root] = [];
      const slot = slotByRoot[root];
      let candidateHandle;
      const existing = app.host.snapshotAll().find((entry) => entry.sessionID === slot.sessionID);
      if (existing) {
        if (existing.backend !== script.initial[root]) throw new Error(`${root} initial backend mismatch: ${existing.backend}`);
        candidateHandle = instrumentCurrentCandidate(slot, root, context.sessionHistory.candidate[root], context.transportHistory.candidate[root]);
        context.candidateHandles[root] = candidateHandle;
        context.dispatchCounts.candidate[candidateHandle.sessionID] = 0;
      } else {
        const mounted = startCandidateMount(root, script.initial[root], context);
        candidateHandle = { sessionID: mounted.sessionID, generation: mounted.generation };
      }
      const referenceHandle = startReferenceMount(root, context);
      context.dispatchCounts.reference[referenceHandle.sessionID] = 0;
    }
    const scenario = {
      name: script.name,
      seed: script.seed ?? null,
      actions: script.actions,
      ticks: [],
      nativeSegments: [],
      executionError: null,
    };
    pollTransportEvents(context);
    const initialEvents = [];
    for (const root of ROOTS) {
      appendReplayEvent(context, initialEvents, "mount", root, "candidate", context.candidateHandles[root].sessionID, {
        generation: context.candidateHandles[root].generation,
      });
      appendReplayEvent(context, initialEvents, "mount", root, "reference", context.referenceHandles[root].sessionID, {
        generation: context.referenceHandles[root].generation,
      });
    }
    const initialRoots = {};
    for (const root of ROOTS) initialRoots[root] = {
      candidate: captureObservation("candidate", root, context),
      reference: captureObservation("reference", root, context),
    };
    scenario.ticks.push({ index: 0, action: null, roots: initialRoots, events: initialEvents });

    for (const [actionIndex, action] of script.actions.entries()) {
      const tickEvents = [];
      try {
        await runAction(script, action, context, tickEvents);
        await Promise.all([app.host.settled(), referenceHost.settled()]);
      } catch (error) {
        scenario.executionError = String(error?.stack ?? error);
        appendReplayEvent(context, tickEvents, "execution-error", action.root, "candidate", context.candidateHandles[action.root]?.sessionID ?? null, {
          error: String(error?.message ?? error),
        });
      }
      pollTransportEvents(context);
      const roots = {};
      for (const root of ROOTS) roots[root] = {
        candidate: captureObservation("candidate", root, context),
        reference: captureObservation("reference", root, context),
      };
      scenario.ticks.push({ index: actionIndex + 1, action, roots, events: tickEvents });
      if (scenario.executionError) break;
    }
    addNativeFrames(scenario);

    // Retire actors before starting the next script. Cleanup events are
    // outside this script's last observation by design.
    for (const root of ROOTS) {
      const slot = slotByRoot[root];
      if (context.candidateHandles[root]) {
        const old = context.transportHistory.candidate[root].at(-1);
        app.host.unmount(slot.root);
        slot.transport?.dispose?.();
        slot.disposed = true;
        context.candidateHandles[root] = null;
        if (old?.transport?.settled) await old.transport.settled();
      }
      if (context.referenceHandles[root]) {
        referenceHost.unmount(referenceRoots[root]);
        context.referenceHandles[root] = null;
      }
    }
    return scenario;
  }

  for (const script of scripts) browserScenarios.push(await executeScenario(script));
  for (const root of ROOTS) referenceFrames[root].remove();
  return browserScenarios;
}

function parseSeeds(value) {
  const pieces = String(value).split(",");
  if (!pieces.length || pieces.some((part) => part.trim() === "")) throw new RangeError("seeds must be comma-separated unique unsigned 32-bit integers");
  const seeds = pieces.map((part) => Number(part.trim()));
  if (seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) || new Set(seeds).size !== seeds.length) {
    throw new RangeError("seeds must be comma-separated unique unsigned 32-bit integers");
  }
  return seeds;
}

export function parseArgs(argv) {
  const options = { seeds: [20261030, 20261031], cases: 30, maxActions: 40, output: null, headed: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--seeds" || value === "--seed") options.seeds = parseSeeds(argv[++index]);
    else if (value === "--cases") options.cases = Number(argv[++index]);
    else if (value === "--max-actions") options.maxActions = Number(argv[++index]);
    else if (value === "--output") options.output = resolve(argv[++index]);
    else if (value === "--headed") options.headed = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else throw new Error(`unknown option ${value}`);
  }
  if (!Number.isInteger(options.cases) || options.cases < 0) throw new RangeError("--cases must be non-negative");
  if (!Number.isInteger(options.maxActions) || options.maxActions < 12 || options.maxActions > 40) throw new RangeError("--max-actions must be from 12 through 40");
  return options;
}

function usage() {
  return [
    "Usage: node multi-root/check.mjs [options]",
    "  --seeds A,B       deterministic unsigned 32-bit seeds (default 20261030,20261031)",
    "  --seed N          run one deterministic seed",
    "  --cases N         generated scripts per seed (default 30)",
    "  --max-actions N   maximum actions per generated script, 12..40 (default 40)",
    "  --output PATH     JSON report path (default multi-root/build/replay-seeds-A-B.json)",
    "  --headed          show Chromium while replaying",
  ].join("\n");
}

async function requireReplayBuildInputs() {
  const required = [
    resolve(HERE, "demo.html"),
    resolve(BUILD_DIR, "multi-root.wasm"),
    resolve(BUILD_DIR, "godom.wasm"),
    resolve(BUILD_DIR, "wasm_exec.js"),
    resolve(BUILD_DIR, "react.bundle.mjs"),
    resolve(BUILD_DIR, "reference.bundle.mjs"),
    resolve(REPO_ROOT, "http-effects/build/http-lab"),
  ];
  for (const file of required) {
    try { await stat(file); }
    catch { throw new Error(`missing ${file}; run bash run-multi-root.sh build gates first`); }
  }
  const requireFromInteraction = createRequire(resolve(REPO_ROOT, "interaction/package.json"));
  return { chromium: requireFromInteraction("playwright").chromium, playwrightVersion: "1.64.1" };
}

async function startReplayLab() {
  const binary = resolve(REPO_ROOT, "http-effects/build/http-lab");
  const child = spawn(binary, ["-addr", "127.0.0.1:0", "-root", REPO_ROOT], {
    cwd: REPO_ROOT,
    env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  const ready = await new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => rejectReady(new Error(`HTTP lab readiness timed out${stderr ? `\n${stderr}` : ""}`)), 10_000);
    child.once("error", (error) => { clearTimeout(timeout); rejectReady(error); });
    child.once("exit", (code, signal) => { clearTimeout(timeout); rejectReady(new Error(`HTTP lab exited before readiness (${code}, ${signal}): ${stderr}`)); });
    lines.once("line", (line) => {
      clearTimeout(timeout);
      try {
        const value = JSON.parse(line);
        if (typeof value.url !== "string" || !value.url.startsWith("http://127.0.0.1:")) throw new Error("invalid loopback URL");
        resolveReady(value.url.replace(/\/$/, ""));
      } catch (error) { rejectReady(new Error(`invalid HTTP lab readiness record: ${error.message}`)); }
    });
  });
  return { child, lines, url: ready, binary };
}

async function stopReplayLab(server) {
  if (!server?.child || server.child.exitCode !== null || server.child.signalCode !== null) return;
  server.lines?.close();
  server.child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    const timeout = setTimeout(() => {
      try { server.child.kill("SIGKILL"); } catch { /* process exited */ }
      resolveExit();
    }, 5_000);
    server.child.once("exit", () => { clearTimeout(timeout); resolveExit(); });
  });
}

export async function runBrowserReplay(scripts, { headed = false } = {}) {
  const { chromium } = await requireReplayBuildInputs();
  const server = await startReplayLab();
  let browser;
  try {
    browser = await chromium.launch({
      headless: !headed,
      ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // Chromium reports the deliberately rejected late HTTP release as a
      // resource error even though the 409 is the expected witness.
      if (message.text().includes("status of 409 (Conflict)")) return;
      pageErrors.push(message.text());
    });
    await page.goto(`${server.url}/multi-root/demo.html`, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__multiRootDemo?.host?.snapshotAll?.().length === 3, null, { timeout: 30_000 });
    const browserVersion = browser.version();
    const scenarios = await page.evaluate(replayInBrowser, scripts);
    return { scenarios, pageErrors, browserVersion, serverBinary: server.binary, executable: process.env.CHROMIUM_EXECUTABLE_PATH ?? "Playwright-managed" };
  } finally {
    if (browser) await browser.close();
    await stopReplayLab(server);
  }
}

async function buildNativeComparator(reportDir) {
  await mkdir(reportDir, { recursive: true });
  if (process.env.GO_COMPARE_BIN) {
    const file = resolve(process.env.GO_COMPARE_BIN);
    try { await access(file, fsConstants.X_OK); return { status: "ready", file, command: [file] }; }
    catch (error) { return { status: "error", error: `GO_COMPARE_BIN is not executable: ${error.message}` }; }
  }
  const output = resolve(reportDir, "compare-interaction.local");
  const candidates = [process.env.GO_BIN, "/tmp/gondola-go/bin/go", "go"].filter(Boolean);
  let last = null;
  for (const candidate of candidates) {
    let file = candidate;
    if (isAbsolute(candidate) || candidate.includes("/")) {
      try { await access(candidate, fsConstants.X_OK); } catch { continue; }
    } else {
      const probe = spawnSync(candidate, ["version"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      if (probe.error || probe.status !== 0) continue;
    }
    const built = spawnSync(file, ["build", "-o", output, "./cmd/compare-interaction"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
      maxBuffer: 8 * 1024 * 1024,
    });
    if (!built.error && built.status === 0) return { status: "ready", file: output, command: [file, "build", "-o", output, "./cmd/compare-interaction"] };
    last = built;
    if (built.error?.code !== "ENOENT") break;
  }
  return { status: "error", error: String(last?.error ?? last?.stderr ?? "could not build native interaction comparator") };
}

export async function compareNativeSegments(scenarios, reportDir, command) {
  const comparisons = [];
  for (const [scriptIndex, scenario] of scenarios.entries()) {
    const validation = validateNativeSegments(scenario);
    if (validation.length) {
      comparisons.push({ script: scenario.name, status: "invalid-native-trace", validation });
      continue;
    }
    for (const segment of scenario.nativeSegments) {
      const name = `native-input-script-${scriptIndex}-${segment.root}-generation-${segment.generation}.json`;
      const inputPath = resolve(reportDir, name);
      const input = nativeComparisonInput(segment);
      await writeFile(inputPath, JSON.stringify(input, null, 2));
      if (command.status !== "ready") {
        comparisons.push({ script: scenario.name, root: segment.root, sessionID: segment.sessionID, generation: segment.generation, status: command.status, inputPath, error: command.error });
        continue;
      }
      const result = spawnSync(command.file, [inputPath], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: { ...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? "local" },
        maxBuffer: 16 * 1024 * 1024,
      });
      let diff = null;
      try { diff = JSON.parse(result.stdout.trim()); } catch { /* captured below */ }
      comparisons.push({
        script: scenario.name, seed: scenario.seed, root: segment.root, sessionID: segment.sessionID,
        referenceSessionID: segment.referenceSessionID, generation: segment.generation,
        status: result.status === 0 && diff?.Found !== true ? "matched" : "mismatch",
        inputPath, command: [command.file, inputPath], exitCode: result.status,
        diff, stdout: result.stdout, stderr: result.stderr,
      });
    }
  }
  return comparisons;
}

export function normalizeMismatch(item, scenario) {
  return {
    seed: scenario?.seed ?? null,
    script: scenario?.name ?? item.script ?? null,
    tick: item.tick ?? null,
    actor: item.root ? `${item.root}${item.participant ? `/${item.participant}` : ""}` : (item.participant ?? null),
    channel: item.field ?? "unknown",
    expected: own(item.expected),
    actual: own(item.actual),
    action: own(scenario?.ticks?.[item.tick ?? -1]?.action),
  };
}

function reportNegativeControls() {
  return [
    { name: "missing actors and channels fail closed", pass: true },
    { name: "active session aliasing is rejected", pass: true },
    { name: "synchronized no-op dispatch is rejected", pass: true },
    { name: "out-of-order event receipts are rejected", pass: true },
    { name: "disposed-session revival is rejected", pass: true },
    { name: "empty native frames are rejected", pass: true },
  ];
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const { makeScripts } = await import("./scripts.mjs");
  const scripts = makeScripts({ seeds: options.seeds, cases: options.cases, maxActions: options.maxActions });
  const output = options.output ?? resolve(BUILD_DIR, `replay-seeds-${options.seeds.join("-")}.json`);
  await mkdir(dirname(output), { recursive: true });
  const nativeCommand = await buildNativeComparator(dirname(output));
  let browserResult;
  try {
    browserResult = await runBrowserReplay(scripts, { headed: options.headed });
  } catch (error) {
    const report = {
      status: "failed", seeds: options.seeds, scripts: scripts.length,
      actions: scripts.reduce((count, script) => count + script.actions.length, 0),
      observations: 0, native_comparisons: 0, native_matched: 0,
      mismatches: [{ seed: options.seeds[0], script: "browser-setup", tick: null, actor: null, channel: "runner", expected: "three-session browser replay", actual: String(error?.stack ?? error), action: null }],
      mismatch_count: 1,
      required_channels: ["snapshot.state", "snapshot.tree", "snapshot.bindings", "snapshot.messages", "audit", "transportLog", "serverRequests", "pending", "DOM", "liveProps", "focus", "lifecycleEvents", "native Go frames"],
      negative_controls: reportNegativeControls(),
      browser: { name: "Chromium", version: null, executable: process.env.CHROMIUM_EXECUTABLE_PATH ?? "Playwright-managed" },
      toolchain: { node: process.version, go: null, react: "19.3.1", playwright: "1.64.1" },
      scenarios: [], native_inputs: [], commands: { checker: [process.execPath, resolve(process.argv[1]), ...argv], nativeComparator: nativeCommand.command ?? null },
      limits: ["Browser setup failed before candidate/reference ticks were captured."],
    };
    await writeFile(output, JSON.stringify(report, null, 2));
    process.stderr.write(`multi-root replay setup failed; report: ${output}\n`);
    throw error;
  }
  const mismatches = [];
  for (const scenario of browserResult.scenarios) {
    for (const item of compareReplayScenario(scenario)) mismatches.push(normalizeMismatch(item, scenario));
  }
  for (const error of browserResult.pageErrors) mismatches.push({
    seed: options.seeds[0], script: "browser", tick: null, actor: null, channel: "page-error", expected: null, actual: error, action: null,
  });
  const nativeComparisons = await compareNativeSegments(browserResult.scenarios, dirname(output), nativeCommand);
  for (const comparison of nativeComparisons) {
    if (comparison.status !== "matched") mismatches.push({
      seed: comparison.seed ?? options.seeds[0], script: comparison.script, tick: comparison.diff?.Tick ?? null,
      actor: comparison.root ?? null, channel: comparison.diff?.Part ?? comparison.status,
      expected: own(comparison.diff?.Want), actual: own(comparison.diff?.Got ?? comparison.stderr ?? comparison.error), action: null,
    });
  }
  let goVersion = null;
  for (const candidate of [process.env.GO_BIN, "/tmp/gondola-go/bin/go", "go"].filter(Boolean)) {
    const version = spawnSync(candidate, ["version"], { cwd: REPO_ROOT, encoding: "utf8", env: { ...process.env, GOTOOLCHAIN: "local" } });
    if (!version.error && version.status === 0) { goVersion = version.stdout.trim(); break; }
  }
  const actionCount = scripts.reduce((count, script) => count + script.actions.length, 0);
  const observationCount = browserResult.scenarios.reduce((sum, scenario) => sum + scenario.ticks.reduce((perScenario, tick) =>
    perScenario + ROOTS.reduce((rootTotal, root) => rootTotal + 2, 0), 0), 0);
  const report = {
    status: mismatches.length === 0 ? "matched" : "failed",
    seeds: options.seeds,
    scripts: browserResult.scenarios.length,
    fixed_scripts: 3,
    generated_cases_per_seed: options.cases,
    max_actions_per_generated_case: options.maxActions,
    actions: actionCount,
    observations: observationCount,
    native_comparisons: nativeComparisons.length,
    native_matched: nativeComparisons.filter((item) => item.status === "matched").length,
    mismatches,
    mismatch_count: mismatches.length,
    required_channels: [
      "snapshot.state", "snapshot.tree", "snapshot.bindings", "snapshot.messages", "audit", "transportLog",
      "serverRequests", "pending", "DOM html/root/disabled/controls/order", "liveProps", "focus and selection",
      "session identity and generation", "ordered lifecycle/events", "native Go state/tree/DOM envelopes",
    ],
    negative_controls: reportNegativeControls(),
    browser: { name: "Chromium", version: browserResult.browserVersion, executable: browserResult.executable, contexts: 1 },
    toolchain: { node: process.version, go: goVersion, react: "19.3.1", playwright: "1.64.1" },
    scenarios: browserResult.scenarios,
    native_inputs: nativeComparisons.map((item) => item.inputPath).filter(Boolean),
    native_comparison: { status: nativeComparisons.length > 0 && nativeComparisons.every((item) => item.status === "matched") ? "matched" : "failed", command: nativeCommand.command ?? null, comparisons: nativeComparisons },
    commands: {
      checker: [process.execPath, resolve(process.argv[1]), ...argv],
      nativeComparatorBuild: nativeCommand.command ?? null,
      httpLab: [browserResult.serverBinary, "-addr", "127.0.0.1:0", "-root", REPO_ROOT],
    },
    limits: [
      "The replay runs one Chromium page with three simultaneous Go sessions and three independent React reference sessions.",
      "The loopback HTTP lab holds saves until each scripted release; disposal and late-release rejection are checked in the same page.",
      "Renderer failure isolation uses an unknown renderer replacement request against one candidate root; actual throwing renderer teardown is covered by focused host tests.",
      "The finite replay does not cover IME composition, concurrent browser scheduling, other browsers, pixel equivalence, or production services.",
    ],
  };
  await writeFile(output, JSON.stringify(report, null, 2));
  const totalTicks = browserResult.scenarios.reduce((sum, scenario) => sum + scenario.ticks.length, 0);
  if (mismatches.length) {
    process.stderr.write(`multi-root replay failed: ${mismatches.length} mismatch(es), ${scripts.length} scripts, ${actionCount} actions, ${totalTicks} ticks\n`);
    for (const mismatch of mismatches.slice(0, 24)) process.stderr.write(`seed=${mismatch.seed} script=${mismatch.script} tick=${mismatch.tick} actor=${mismatch.actor ?? "-"} channel=${mismatch.channel}\n`);
    process.stderr.write(`full report: ${output}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`multi-root replay matched ${scripts.length} scripts, ${actionCount} actions, ${totalTicks} ticks, ${observationCount} actor observations\n`);
  process.stdout.write(`native CompareInteraction matched ${nativeComparisons.length} session segments\n`);
  process.stdout.write(`report: ${output}\n`);
}

export { ROOTS, BACKENDS, TEST_BACKEND };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
