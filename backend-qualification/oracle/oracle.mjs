import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(here, "../..");
export const defaultPlanPath = path.join(here, "plan.json");

const CHANNELS = new Set(["dom", "disabled", "dispatch-count", "trace-count", "state"]);
const BACKENDS = new Set(["react", "dom"]);
const HEALTHY = new Set(["healthy-react", "healthy-dom", "healthy-swap"]);
const FAULTS = ["text-corruption", "key-order", "enabled-control", "drop-click", "duplicate-click"];

function fail(message) {
  throw new Error(`invalid backend-qualification oracle plan: ${message}`);
}

async function readJSON(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
}

function validateCase(row) {
  if (!row || typeof row !== "object") fail("case row must be an object");
  if (typeof row.id !== "string" || !row.id) fail("case id is required");
  if (!row.activation || !row.checkpoint) fail(`${row.id} needs activation/checkpoint records`);
  if (!Array.isArray(row.expectedChannels) || !Array.isArray(row.allowedChannels)) fail(`${row.id} needs channel arrays`);
  for (const name of [...row.expectedChannels, ...row.allowedChannels]) {
    if (!CHANNELS.has(name)) fail(`${row.id} names unknown channel ${name}`);
  }
  if (row.allowedChannels.some((name) => !row.expectedChannels.includes(name)) && row.channelRule === "exact") {
    fail(`${row.id} exact channel rule has unrequired allowed channels`);
  }
  if (!new Set(["exact", "all", "any"]).has(row.channelRule)) fail(`${row.id} has unknown channelRule`);
  if (row.channelRule === "any" && row.expectedChannels.length === 0) fail(`${row.id} any-rule needs at least one required channel`);
  if (row.allowedChannels.some((name) => !CHANNELS.has(name))) fail(`${row.id} has unknown allowed channel`);
}

export async function loadQualificationPlan(planPath = defaultPlanPath) {
  const absolutePlanPath = path.resolve(planPath);
  const plan = await readJSON(absolutePlanPath);
  if (plan.schema !== "gobi.backend-qualification-oracle-plan/v1") fail(`schema ${plan.schema}`);
  if (plan.caseCount !== 13 || !Array.isArray(plan.cases) || plan.cases.length !== 13) fail("expected exactly 13 cases");
  assertUnique(plan.cases.map((row) => row.id), "case ids");
  if (JSON.stringify(plan.caseIds) !== JSON.stringify(plan.cases.map((row) => row.id))) fail("caseIds order differs from cases");
  plan.cases.forEach(validateCase);

  const healthy = plan.cases.filter((row) => row.fault === "none");
  if (healthy.length !== 3 || !HEALTHY.has(healthy[0].id)) fail("healthy baseline matrix is incomplete");
  for (const id of HEALTHY) {
    const row = plan.cases.find((item) => item.id === id);
    if (!row || row.fault !== "none" || row.expectedChannels.length !== 0 || row.allowedChannels.length !== 0) {
      fail(`invalid healthy case ${id}`);
    }
  }
  for (const fault of FAULTS) {
    for (const backend of BACKENDS) {
      const row = plan.cases.find((item) => item.id === `fault-${backend}-${fault}`);
      if (!row || row.backend !== backend || row.fault !== fault) fail(`missing exact case for ${backend}/${fault}`);
      if (row.activation.expectedCount !== 1) fail(`${row.id} must activate exactly once`);
      if (["text-corruption", "key-order", "enabled-control"].includes(fault)) {
        if (row.activation.eventIndex !== null || row.checkpoint.kind !== "initial" || row.checkpoint.stateIndex !== 0) {
          fail(`${row.id} must use the initial checkpoint`);
        }
      } else if (row.activation.eventIndex !== 0 || row.checkpoint.kind !== "after-event" || row.checkpoint.stateIndex !== 1) {
        fail(`${row.id} must use the first action checkpoint`);
      }
    }
  }

  const root = path.resolve(path.dirname(absolutePlanPath), "../..");
  const fixturePath = path.resolve(root, plan.scenario.path);
  const oraclePath = path.resolve(root, plan.baselineOracle.path);
  const fixtureHash = await sha256File(fixturePath);
  const oracleHash = await sha256File(oraclePath);
  if (fixtureHash !== plan.scenario.sha256) fail("scenario SHA-256 differs from frozen plan");
  if (oracleHash !== plan.baselineOracle.sha256) fail("baseline oracle SHA-256 differs from frozen plan");

  const fixture = await readJSON(fixturePath);
  const baselineOracle = await readJSON(oraclePath);
  if (fixture.schema !== plan.scenario.schema || fixture.name !== plan.scenario.name) fail("scenario identity differs");
  if (fixture.events.length !== plan.scenario.eventCount || fixture.events.length !== 50) fail("scenario event count differs");
  if (baselineOracle.schema !== plan.baselineOracle.schema || baselineOracle.stateProjections.length !== 46) {
    fail("baseline literal oracle identity/checkpoint count differs");
  }
  const firstAction = fixture.events[0];
  const expectedAction = plan.scenario.firstAction;
  for (const key of ["path", "event", "value"]) {
    if (firstAction[key] !== expectedAction[key]) fail(`first action ${key} differs`);
  }
  if (JSON.stringify(firstAction.message) !== JSON.stringify(expectedAction.message)) fail("first action message differs");

  const initial = baselineOracle.stateProjections[0];
  const first = baselineOracle.stateProjections[1];
  const literal = plan.baseline.initialLiteral;
  if (!initial.dom.html.includes(literal.parentStatusText)) fail("initial status text literal differs from baseline oracle");
  const childKeys = initial.state.Children.map((child) => child.Key);
  if (JSON.stringify(childKeys) !== JSON.stringify(literal.childOrder)) fail("initial child order literal differs from baseline oracle");
  for (const control of literal.controls) {
    const actual = initial.dom.controls.find((item) => item.path === control.path);
    if (!actual || actual.disabled !== control.disabled) fail(`initial disabled literal differs at ${control.path}`);
  }
  const firstActionChild = first.state.Children.find((child) => child.Key === "oak");
  if (firstActionChild?.Counter?.Count !== plan.baseline.firstAction.oakCountAfterDispatch) fail("first action counter literal differs");
  if (JSON.stringify(first.state.Input) !== JSON.stringify(plan.baseline.firstAction.input)) fail("first action input literal differs");
  if (first.stateIndex !== 1 || baselineOracle.events[0].stateIndex !== 1) fail("first action projection is not state index 1");

  return { plan, fixture, baselineOracle, fixturePath, oraclePath, planPath: absolutePlanPath };
}

export function caseFor(plan, id) {
  const row = plan.cases.find((item) => item.id === id);
  if (!row) throw new Error(`unknown qualification case ${id}`);
  return row;
}

export function channelsSatisfyCase(row, observedChannels) {
  if (!Array.isArray(observedChannels)) return false;
  if (new Set(observedChannels).size !== observedChannels.length) return false;
  if (observedChannels.some((name) => !row.allowedChannels.includes(name))) return false;
  if (row.channelRule === "any") return row.expectedChannels.some((name) => observedChannels.includes(name));
  return row.expectedChannels.every((name) => observedChannels.includes(name));
}
