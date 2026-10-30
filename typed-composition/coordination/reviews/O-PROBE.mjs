// Independent, bounded offline mutation probe for ORACLE-REPAIR.
// Usage: node typed-composition/coordination/reviews/O-PROBE.mjs <positive-scenario.json>
// The input scenario is read-only; every control mutates a structured clone.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateScenario } from "../../check.mjs";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("usage: node O-PROBE.mjs <positive-scenario.json>");
const resolvedInput = resolve(process.cwd(), inputPath);
const encoded = await readFile(resolvedInput);
const positive = JSON.parse(encoded);
const hashFile = async (path) => createHash("sha256").update(await readFile(path)).digest("hex");
const clone = (value) => structuredClone(value);
const isError = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && Object.keys(value).length === 1 && typeof value.error === "string";
const baselineIssues = validateScenario(positive);
if (baselineIssues.length) {
  throw new Error("positive baseline failed with " + baselineIssues.length + " issues: " + JSON.stringify(baselineIssues));
}

function firstEnabledInputIndex(scenario) {
  for (let index = 0; index < scenario.actions.length; index += 1) {
    const action = scenario.actions[index];
    if (action?.method !== "dispatch" || action.args?.[1]?.Event !== "input") continue;
    const prior = scenario.nativeFrames?.[index - 1]?.frame;
    const target = prior?.sessions?.find((session) => session.id === action.args?.[0]);
    if (target?.snapshot?.state?.Inputs?.ReadOnly === false) return index;
  }
  throw new Error("positive baseline has no input dispatched to an enabled session");
}

function firstTransportCommand(scenario) {
  for (let index = 0; index < scenario.browserFrames.length; index += 1) {
    const frame = scenario.browserFrames[index];
    for (const actorName of ["candidate", "reference"]) {
      const actor = frame[actorName];
      for (const effect of actor?.managerEffects ?? []) {
        for (const command of effect.commands ?? []) {
          if (command?.Kind !== "start" && command?.Kind !== "cancel") continue;
          const eventKind = command.Kind.toLowerCase();
          const eventIndex = (actor.transportCalls ?? []).findIndex((event) =>
            event.kind === eventKind && event.sessionID === effect.sessionID &&
            (event.payload?.ID ?? event.ID) === command.ID);
          if (eventIndex >= 0) return { index, actorName, sessionID: effect.sessionID, command, eventIndex };
        }
      }
    }
  }
  throw new Error("positive baseline has no matched manager effect and actual transport invocation");
}

function firstFrameWithMultipleEvents(scenario) {
  for (let index = 0; index < scenario.browserFrames.length; index += 1) {
    const frame = scenario.browserFrames[index];
    if ((frame.candidate?.transportCalls?.length ?? 0) >= 2 &&
        (frame.reference?.transportCalls?.length ?? 0) >= 2) return index;
  }
  throw new Error("positive baseline has no action with two transport invocations for a bilateral order mutation");
}

function firstRejectedAction(scenario) {
  for (let index = 0; index < scenario.nativeFrames.length; index += 1) {
    if (isError(scenario.nativeFrames[index]?.result) &&
        isError(scenario.browserFrames[index]?.operationResults?.candidate)) return index;
  }
  throw new Error("positive baseline has no shared rejected action");
}

function firstBlockedObservation(scenario) {
  for (let index = 0; index < scenario.browserFrames.length; index += 1) {
    const frame = scenario.browserFrames[index];
    for (const actorName of ["candidate", "reference"]) {
      const actor = frame[actorName];
      const field = Object.hasOwn(actor ?? {}, "inputObservation") ? "inputObservation" : "inputWitnessObservation";
      if (actor?.[field]?.mode === "blocked-disabled") return { index, actorName, field };
    }
  }
  throw new Error("positive baseline has no blocked-disabled input observation");
}

function checkMutation(name, scenario, mutate, expectClean = false) {
  const altered = clone(scenario);
  mutate(altered);
  const issues = validateScenario(altered);
  const passed = expectClean ? issues.length === 0 : issues.length > 0;
  return {
    name,
    expected: expectClean ? "accepted-by-scope" : "rejected",
    status: passed ? "passed" : "failed",
    issueCount: issues.length,
    mismatchFields: [...new Set(issues.map((issue) => issue.field))].slice(0, 24),
  };
}

const focusIndex = firstEnabledInputIndex(positive);
if (!positive.browserFrames[focusIndex]?.candidate?.focusReplacement) {
  throw new Error("positive baseline lacks the required focus witness at its first enabled input");
}
const effectsIndex = firstTransportCommand(positive).index;
const reversalIndex = firstFrameWithMultipleEvents(positive);
const omitted = firstTransportCommand(positive);
const rejectedIndex = firstRejectedAction(positive);
const blocked = firstBlockedObservation(positive);

const controls = [];
controls.push(checkMutation("missing-focus-at-first-enabled-input", positive, (scenario) => {
  scenario.browserFrames[focusIndex].candidate.focusReplacement = null;
}));
controls.push(checkMutation("missing-effects-and-transport-arrays-on-both-actors", positive, (scenario) => {
  for (const actorName of ["candidate", "reference"]) {
    delete scenario.browserFrames[effectsIndex][actorName].managerEffects;
    delete scenario.browserFrames[effectsIndex][actorName].transportCalls;
  }
}));
controls.push(checkMutation("bilateral-transport-reversal", positive, (scenario) => {
  scenario.browserFrames[reversalIndex].candidate.transportCalls.reverse();
  scenario.browserFrames[reversalIndex].reference.transportCalls.reverse();
}));
controls.push(checkMutation("omitted-command-execution-on-both-actors", positive, (scenario) => {
  for (const actorName of ["candidate", "reference"]) {
    const calls = scenario.browserFrames[omitted.index][actorName].transportCalls;
    const eventIndex = calls.findIndex((event) => event.kind === omitted.command.Kind.toLowerCase() &&
      event.sessionID === omitted.sessionID && (event.payload?.ID ?? event.ID) === omitted.command.ID);
    if (eventIndex < 0) throw new Error("expected " + actorName + " transport event disappeared before mutation");
    calls.splice(eventIndex, 1);
  }
}));
controls.push(checkMutation("rejection-changed-to-success", positive, (scenario) => {
  scenario.browserFrames[rejectedIndex].operationResults.candidate = { probeAccepted: true };
}));
controls.push(checkMutation("inconsistent-blocked-input-witness", positive, (scenario) => {
  const observation = scenario.browserFrames[blocked.index][blocked.actorName][blocked.field];
  observation.afterValue = String(observation.afterValue) + " [mutated]";
  observation.nativeDispatches = 1;
}));
controls.push(checkMutation("error-text-only-change-is-outside-equivalence-scope", positive, (scenario) => {
  scenario.nativeFrames[rejectedIndex].result.error = "O-PROBE changed only display text";
}, true));

const output = {
  schema: "gondola.typed-composition.o-probe/v1",
  job: "O-PROBE",
  positiveBaseline: {
    path: resolvedInput,
    sha256: createHash("sha256").update(encoded).digest("hex"),
    issues: baselineIssues.length,
    actions: positive.actions.length,
  },
  sourcePins: Object.fromEntries(await Promise.all([
    "typed-composition/fixture.mjs",
    "typed-composition/check.mjs",
    "typed-composition/check.test.mjs",
    "typed-composition/testdata/check-positive-scenario.mjs",
  ].map(async (path) => [path, await hashFile(resolve(process.cwd(), path))]))),
  selectedActions: { focusIndex, effectsIndex, reversalIndex, omittedCommand: omitted, rejectedIndex,
    blockedObservation: blocked },
  controls,
  status: controls.every((control) => control.status === "passed") ? "passed" : "failed",
};
console.log(JSON.stringify(output, null, 2));
if (output.status !== "passed") process.exitCode = 1;
