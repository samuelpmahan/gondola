import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Read-only re-audit of the current, explicitly recorded allocation history.
// It does not invoke the scheduler/solver and never writes to its inputs.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const coordination = resolve(root, "compiled-children/coordination");
const readText = (path) => readFileSync(resolve(root, path), "utf8");
const readJSON = (path) => JSON.parse(readText(path));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const digestPath = (path) => sha256(readFileSync(resolve(root, path)));
const errors = [];
const warnings = [];
const check = (ok, message) => { if (!ok) errors.push(message); };
const sorted = (items) => [...items].sort();

const stateBytes = readFileSync(resolve(root, "compiled-children/coordination/state.json"));
const state = JSON.parse(stateBytes.toString("utf8"));
const capacity = readJSON("compiled-children/coordination/capacity.json");
const dispatch = readJSON("compiled-children/coordination/dispatch.json");
const eReceipt = readJSON("compiled-children/coordination/receipts/E-ORACLE.json");
const xrReceipt = readJSON("compiled-children/coordination/receipts/XR-ORACLE.json");
const facts = readJSON("compiled-children/oracle/custody/mismatch-facts.json");

check(state.schema === "chainspot.rebalancer-state/v1", "coordination state schema");
check(capacity.available_workers === Object.keys(state.workers).length, "worker capacity metadata");
check(capacity.actually_accepted_spawns === dispatch.actual_accepted_spawns.length, "accepted spawn count");
check(dispatch.dispatch_is_native_recommendation_then_separate_actual_agent_call === true,
  "actual dispatch provenance flag");
check(eReceipt.job_id === "E-ORACLE" && eReceipt.worker === "N5" && eReceipt.outcome === "mixed_change",
  "closed E-ORACLE receipt identity");
check(facts.closed_E_ORACLE_expected_sha256 === eReceipt.sourceSha256?.["compiled-children/oracle/audit-native-protocol.mjs"],
  "custody facts do not preserve the closed expected hash");
check(facts.original_pinned_bytes_available === false, "custody facts must preserve unavailable-original status");

const currentAuditPath = "compiled-children/oracle/audit-native-protocol.mjs";
const currentAuditSHA = digestPath(currentAuditPath);
check(currentAuditSHA === facts.current_reconstruction_sha256, "current audit reconstruction hash changed since custody copy");
check(digestPath(facts.current_reconstruction_copy) === facts.current_copy_sha256,
  "preserved audit copy hash changed");
check(facts.current_copy_sha256 === currentAuditSHA, "preserved copy is not the current reconstruction");
check(facts.closed_E_ORACLE_expected_sha256 !== currentAuditSHA, "expected custody mismatch disappeared unexpectedly");

const eOraclePinResults = {};
for (const [path, expected] of Object.entries(eReceipt.sourceSha256 ?? {})) {
  const actual = digestPath(path);
  eOraclePinResults[path] = { expected, actual, matches: actual === expected };
  if (path === currentAuditPath) {
    check(expected === facts.closed_E_ORACLE_expected_sha256 && actual === facts.current_reconstruction_sha256,
      "closed audit source pin mismatch facts changed");
  } else {
    check(actual === expected, `E-ORACLE source pin mismatch: ${path}`);
  }
}
const eReportPath = eReceipt.report?.path;
check(Boolean(eReportPath) && digestPath(eReportPath) === eReceipt.report?.sha256,
  "E-ORACLE report hash/size pin");
check(readFileSync(resolve(root, eReportPath)).byteLength === eReceipt.report?.bytes,
  "E-ORACLE report byte count");
for (const item of eReceipt.checks ?? []) {
  if (item.rawlog && item.rawlog_sha256) check(digestPath(item.rawlog) === item.rawlog_sha256, `E-ORACLE rawlog pin mismatch: ${item.rawlog}`);
  if (item.stdout && item.stdout_sha256) check(digestPath(item.stdout) === item.stdout_sha256, `E-ORACLE stdout pin mismatch: ${item.stdout}`);
  if (item.stderr && item.stderr_sha256) check(digestPath(item.stderr) === item.stderr_sha256, `E-ORACLE stderr pin mismatch: ${item.stderr}`);
}

const xrSourcePinResults = {};
for (const [path, expected] of Object.entries(xrReceipt.reviewed_source_sha256 ?? {})) {
  const actual = digestPath(path);
  xrSourcePinResults[path] = { expected, actual, matches: actual === expected };
  check(actual === expected, `XR-ORACLE reviewed-source pin mismatch: ${path}`);
}
check(digestPath(xrReceipt.report?.path) === xrReceipt.report?.sha256, "XR-ORACLE report pin");
check(readFileSync(resolve(root, xrReceipt.report.path)).byteLength === xrReceipt.report.bytes, "XR-ORACLE report byte count");
for (const item of xrReceipt.reviewer_rawlogs ?? []) {
  check(digestPath(item.path) === item.sha256, `XR-ORACLE reviewer rawlog pin mismatch: ${item.path}`);
  const actualBytes = readFileSync(resolve(root, item.path)).byteLength;
  if (actualBytes !== item.bytes) warnings.push(`XR-ORACLE reviewer rawlog byte-count metadata differs (SHA-256 matches): ${item.path}; receipt=${item.bytes}, actual=${actualBytes}`);
}

const workerIds = Object.keys(state.workers);
const active = Object.fromEntries(workerIds.map((worker) => [worker, null]));
const activeAgents = Object.fromEntries(workerIds.map((worker) => [worker, null]));
const status = Object.fromEntries(Object.keys(state.jobs).map((job) => [job, "pending"]));
const assignedBy = {};
const completedBy = {};
const solveEvents = [];
let latestSolve = null;
const solveFiles = readdirSync(resolve(coordination, "native"))
  .filter((name) => /^epoch-\d{2}\.json$/.test(name)).sort();
const introducedJobs = new Set(state.events.filter((event) => event.type.startsWith("extend"))
  .flatMap((event) => event.new_jobs ?? []));
const knownJobs = new Set(Object.keys(state.jobs).filter((job) => !introducedJobs.has(job)));

function maxScore(free, ready, eligible, weights) {
  let scores = new Map([[0, 0]]);
  ready.forEach((job) => {
    const next = new Map(scores);
    for (const [mask, score] of scores) {
      free.forEach((worker, index) => {
        const bit = 1 << index;
        if (!(mask & bit) && eligible[job]?.includes(worker)) {
          const nextMask = mask | bit;
          next.set(nextMask, Math.max(next.get(nextMask) ?? -Infinity, score + weights[job]));
        }
      });
    }
    scores = next;
  });
  return Math.max(0, ...scores.values());
}

for (const event of state.events) {
  if (event.type === "solve") {
    const index = solveEvents.length;
    const path = `compiled-children/coordination/native/epoch-${String(event.epoch).padStart(2, "0")}.json`;
    const epoch = readJSON(path);
    check(event.epoch === index && epoch.epoch === event.epoch, `epoch sequence mismatch at ${event.epoch}`);
    check(JSON.stringify(Object.fromEntries(Object.entries(event).filter(([key]) => key !== "type"))) === JSON.stringify(epoch),
      `state event and saved native epoch differ: ${event.epoch}`);
    const pinned = workerIds.filter((worker) => active[worker] !== null);
    check(JSON.stringify(sorted(epoch.pinned_workers)) === JSON.stringify(sorted(pinned)), `pinned worker set mismatch: epoch ${event.epoch}`);
    for (const worker of pinned) check(epoch.assignments[worker] === active[worker], `in-flight assignment moved: ${worker} epoch ${event.epoch}`);
    check(JSON.stringify(sorted(Object.keys(epoch.assignments))) === JSON.stringify(sorted(workerIds)), `assignment worker set: epoch ${event.epoch}`);
    check(epoch.independent_capacity_check === true && epoch.independent_eligibility_check === true,
      `independent allocation flags: epoch ${event.epoch}`);
    check(epoch.native_constraints?.solved === true && epoch.native_constraints?.brokenCount === 0 && epoch.native_constraints?.brokenVal === 0,
      `native constraint summary: epoch ${event.epoch}`);
    for (const constraint of epoch.native_constraints?.constraints ?? []) check(constraint.value === 0, `native constraint ${constraint.name}: epoch ${event.epoch}`);
    check(epoch.exact_score === epoch.native_score, `native score differs: epoch ${event.epoch}`);
    check(epoch.ready_jobs.every((job) => Array.isArray(epoch.eligible[job])), `eligible metadata missing: epoch ${event.epoch}`);
    for (const job of epoch.ready_jobs) {
      const definition = state.jobs[job];
      check(Boolean(definition), `unknown ready job ${job}`);
      check(knownJobs.has(job), `job was not recorded as introduced before it became ready: ${job}`);
      if (!definition) continue;
      if (definition.kind === "review") {
        const dep = definition.depends_on;
        check(status[dep] === "done", `review before dependency completed: ${job} epoch ${event.epoch}`);
        check(assignedBy[dep] !== undefined && assignedBy[dep] !== null, `review dependency author missing: ${job}`);
      }
      const expectedEligible = workerIds.filter((worker) => active[worker] === null
        && (!definition.allow_workers || definition.allow_workers.includes(worker))
        && (definition.kind !== "review" || assignedBy[definition.depends_on] !== worker));
      check(JSON.stringify(epoch.eligible[job]) === JSON.stringify(expectedEligible), `eligible worker list differs: ${job} epoch ${event.epoch}`);
      const policy = state.policy ?? {};
      const expectedWeight = definition.repair_of ? policy.repair_priority : definition.kind === "review" ? policy.review_priority : policy.extract_priority;
      check(epoch.weights[job] === expectedWeight, `ready-job priority differs: ${job} epoch ${event.epoch}`);
      check(epoch.caps[job] === 1, `ready-job capacity differs: ${job} epoch ${event.epoch}`);
    }
    const free = workerIds.filter((worker) => active[worker] === null);
    check(epoch.exact_score === maxScore(free, epoch.ready_jobs, epoch.eligible, epoch.weights), `independent optimum mismatch: epoch ${event.epoch}`);
    for (const [worker, job] of Object.entries(epoch.dispatch)) {
      check(!active[worker], `dispatch overwrites an in-flight worker: ${worker}`);
      check(epoch.eligible[job]?.includes(worker) && epoch.ready_jobs.includes(job), `dispatch is not eligible/ready: ${worker} ${job}`);
      check(epoch.assignments[worker] === job, `dispatch does not match assignment: ${worker}`);
    }
    check(Object.values(epoch.assignments).filter((job) => job !== "BENCH").every((job) => (epoch.caps[job] ?? 0) >= 1),
      `assignment exceeds recorded capacity: epoch ${event.epoch}`);
    check(Object.values(epoch.dispatch).reduce((sum, job) => sum + (epoch.weights[job] ?? 0), 0) === epoch.exact_score,
      `dispatch score differs from exact score: epoch ${event.epoch}`);
    const bundlePath = `compiled-children/coordination/native/epoch-${String(event.epoch).padStart(2, "0")}.bundle`;
    const bundle = readFileSync(resolve(root, bundlePath));
    const solverLogPath = `compiled-children/coordination/epoch-${event.epoch}.log`;
    const solverLog = readText(solverLogPath);
    const runUUID = solverLog.match(/Problem run_uuid: ([0-9a-f-]+)/)?.[1] ?? null;
    const objective = solverLog.match(/Final objective: \((-?\d+), (-?\d+)\)/);
    check(Boolean(runUUID && objective), `solver log lacks run uuid/objective: epoch ${event.epoch}`);
    if (objective) check(Number(objective[1]) === -epoch.native_score && Number(objective[2]) === epoch.ready_jobs.length,
      `solver log objective mismatch: epoch ${event.epoch}`);
    const bundleAudit = { path: bundlePath, bytes: bundle.byteLength, sha256: sha256(bundle) };
    solveEvents.push({ epoch: event.epoch, ready: epoch.ready_jobs, dispatch: epoch.dispatch, score: epoch.exact_score,
      epochJsonSha256: digestPath(path),
      runUUID, solverLog: solverLogPath, solverLogSha256: digestPath(solverLogPath), bundle: bundleAudit });
    latestSolve = epoch;
  } else if (event.type === "dispatch") {
    const { worker, job, agent } = event;
    check(Boolean(latestSolve && latestSolve.dispatch[worker] === job), `actual dispatch lacks latest native recommendation: ${worker} ${job}`);
    check(active[worker] === null, `worker already assigned at dispatch: ${worker}`);
    const definition = state.jobs[job];
    check(Boolean(definition), `dispatch references unknown job: ${job}`);
    if (definition) {
      check(!definition.allow_workers || definition.allow_workers.includes(worker), `worker outside job ownership: ${worker} ${job}`);
      if (definition.kind === "review") {
        check(status[definition.depends_on] === "done", `review started before completion: ${job}`);
        check(assignedBy[definition.depends_on] !== worker, `self review: ${worker} ${job}`);
      }
    }
    active[worker] = job;
    activeAgents[worker] = agent;
    status[job] = "running";
    assignedBy[job] = worker;
  } else if (event.type === "complete") {
    const { worker, job } = event;
    check(active[worker] === job, `completion does not match active assignment: ${worker} ${job}`);
    active[worker] = null;
    activeAgents[worker] = null;
    status[job] = "done";
    completedBy[job] = worker;
  } else if (event.type.startsWith("extend")) {
    for (const job of event.new_jobs ?? []) {
      check(Boolean(state.jobs[job]), `extension references unknown job: ${job}`);
      check(!knownJobs.has(job), `extension repeats known job: ${job}`);
      knownJobs.add(job);
      status[job] = "pending";
    }
  } else {
    check(false, `unknown state event type: ${event.type}`);
  }
}

check(solveEvents.length === solveFiles.length, "saved native epoch files do not match state solve events");
check(state.epoch === solveEvents.length, "state epoch counter differs from recorded solve count");
for (const worker of workerIds) {
  check(state.workers[worker].job === active[worker], `current worker job differs from event history: ${worker}`);
  check(state.workers[worker].agent === activeAgents[worker], `current worker agent differs from event history: ${worker}`);
}
for (const [job, current] of Object.entries(state.jobs)) check(current.status === status[job], `current job status differs from event history: ${job}`);
for (const spawn of dispatch.actual_accepted_spawns) {
  check(latestSolve !== null, "accepted spawns exist without native epoch");
  const firstEpoch = readJSON("compiled-children/coordination/native/epoch-00.json");
  check(firstEpoch.dispatch[spawn.worker] === spawn.job, `accepted spawn differs from native epoch 0 recommendation: ${spawn.worker}`);
  check(spawn.model === capacity.model && spawn.reasoning_effort === capacity.reasoning_effort && spawn.fork_turns === "none",
    `accepted spawn metadata differs: ${spawn.worker}`);
}

const inFlight = Object.entries(state.jobs).filter(([, job]) => job.status === "running").map(([id]) => id).sort();
const pending = Object.entries(state.jobs).filter(([, job]) => job.status === "pending").map(([id]) => id).sort();
const closed = Object.entries(state.jobs).filter(([, job]) => job.status === "done").map(([id]) => id).sort();
const output = {
  schema: "gobi.compiled-children-native-protocol-audit-current/v1",
  readOnly: true,
  solverInvoked: false,
  schedulerStateWritten: false,
  sourceCustody: {
    closedExpectedAuditSha256: facts.closed_E_ORACLE_expected_sha256,
    currentReconstructionSha256: currentAuditSHA,
    preservedCopySha256: digestPath(facts.current_reconstruction_copy),
    originalPinnedBytesAvailable: false,
    mismatchPreserved: true,
    eOraclePins: eOraclePinResults,
    xrOraclePins: xrSourcePinResults,
  },
  nativeHistory: {
    epochCount: solveEvents.length,
    epochs: solveEvents,
    stateSnapshotSha256: sha256(stateBytes),
    capacitySha256: digestPath("compiled-children/coordination/capacity.json"),
    dispatchSha256: digestPath("compiled-children/coordination/dispatch.json"),
    acceptedInitialSpawns: dispatch.actual_accepted_spawns.length,
    acceptedInitialDispatchAgentNames: dispatch.actual_accepted_spawns.map(({ worker, job, agent }) => ({ worker, job, agent })),
    stateHistoryReconciled: errors.length === 0,
  },
  packetStateAtAudit: { closed, inFlight, pending },
  warnings,
  errors,
  status: errors.length ? "failed" : "passed_with_preserved_source_mismatch",
};
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = errors.length ? 1 : 0;
