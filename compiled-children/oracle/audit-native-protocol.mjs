import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJSON = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const require = (condition, message) => {
  if (!condition) throw new Error(message);
};
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sorted = (items) => [...items].sort();

const spec = readJSON("compiled-children/coordination/spec.json");
const capacity = readJSON("compiled-children/coordination/capacity.json");
const dispatch = readJSON("compiled-children/coordination/dispatch.json");
const epoch = readJSON("compiled-children/coordination/native/epoch-00.json");
const nativeLog = readFileSync(resolve(root, "compiled-children/coordination/native/epoch-00.log"), "utf8");
const runnerLog = readFileSync(resolve(root, "compiled-children/coordination/epoch-0.log"), "utf8");
const bundle = readFileSync(resolve(root, "compiled-children/coordination/native/epoch-00.bundle"));

const expectedWorkers = ["N1", "N2", "N3", "N4", "N5", "N6"];
const jobs = spec.jobs;
require(spec.schema === "chainspot.rebalancer-spec/v1", "native allocation spec schema differs");
require(JSON.stringify(sorted(spec.workers)) === JSON.stringify(expectedWorkers), "spec worker set differs from six accepted worker lanes");
require(jobs.length === 6 && new Set(jobs.map((job) => job.id)).size === 6, "spec job ids are not six unique lanes");
require(capacity.advertised_slots_including_root === 7 && capacity.available_workers === 6, "advertised native capacity differs");
require(capacity.actually_accepted_spawns === 6, "capacity accepted-spawn count differs");
require(capacity.native_version === "1.0.4" && capacity.reasoning_effort === "xhigh", "native toolchain metadata differs");
require(capacity.probe_sha256 === "5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c", "Rebalancer probe hash differs");
require(capacity.toolkit_pr_head === "989c295717511c812b69beda5d125817ffc054c9", "toolkit PR head differs");
require(dispatch.dispatch_is_native_recommendation_then_separate_actual_agent_call === true,
  "dispatch does not separate native recommendation from accepted agent spawns");
require(dispatch.actual_accepted_spawns.length === capacity.actually_accepted_spawns, "dispatch accepted-spawn list length differs");
require(epoch.epoch === 0 && epoch.native_constraints.solved === true, "native epoch did not solve successfully");
require(epoch.native_constraints.brokenCount === 0 && epoch.native_constraints.brokenVal === 0, "native solver reports broken constraints");
require(epoch.exact_score === epoch.native_score, "independent and native scores differ");
require(epoch.independent_capacity_check && epoch.independent_eligibility_check, "independent native allocation checks failed");
require(JSON.stringify(epoch.ready_jobs) === JSON.stringify(jobs.map((job) => job.id)), "ready job order differs from spec");
require(JSON.stringify(sorted(Object.keys(epoch.assignments))) === JSON.stringify(expectedWorkers), "native assignment worker set differs");
require(JSON.stringify(epoch.dispatch) === JSON.stringify(epoch.assignments), "native dispatch map differs from assignment map");
require(epoch.pinned_workers.length === 0, "epoch unexpectedly has pinned workers");

const jobById = new Map(jobs.map((job) => [job.id, job]));
const assignedWorkers = new Set();
const assignedJobs = new Set();
for (const [worker, jobId] of Object.entries(epoch.assignments)) {
  const job = jobById.get(jobId);
  require(job, `${worker} was assigned an unknown job ${jobId}`);
  require(job.allow_workers.includes(worker), `${worker} is outside ${jobId} eligibility`);
  require(epoch.caps[jobId] === 1, `${jobId} has no one-worker capacity`);
  require(!assignedWorkers.has(worker) && !assignedJobs.has(jobId), "worker or job was assigned more than once");
  assignedWorkers.add(worker);
  assignedJobs.add(jobId);
}
require(assignedJobs.size === jobs.length, "not all ready jobs were assigned");

const spawnWorkers = new Set();
const spawnJobs = new Set();
const spawnAgents = new Set();
for (const spawn of dispatch.actual_accepted_spawns) {
  require(epoch.assignments[spawn.worker] === spawn.job, `${spawn.worker} accepted a job different from its native assignment`);
  require(jobById.get(spawn.job)?.allow_workers.includes(spawn.worker), `${spawn.worker} accepted an ineligible job`);
  require(!spawnWorkers.has(spawn.worker) && !spawnJobs.has(spawn.job) && !spawnAgents.has(spawn.agent),
    "accepted worker, job, or agent is duplicated");
  require(spawn.model === capacity.model && spawn.reasoning_effort === capacity.reasoning_effort && spawn.fork_turns === "none",
    `${spawn.worker} spawn metadata differs from capacity record`);
  spawnWorkers.add(spawn.worker);
  spawnJobs.add(spawn.job);
  spawnAgents.add(spawn.agent);
}
require(JSON.stringify(sorted([...spawnWorkers])) === JSON.stringify(expectedWorkers), "accepted actual spawn worker set differs");
require(JSON.stringify(sorted([...spawnJobs])) === JSON.stringify(sorted(jobs.map((job) => job.id))), "accepted actual spawn job set differs");
require(dispatch.actual_accepted_spawns.find((spawn) => spawn.worker === "N5")?.agent === "/root/children_oracle",
  "N5 E-ORACLE accepted spawn is not recorded");
require(Object.values(epoch.agent_by_worker).every((value) => value === null),
  "native recommendation unexpectedly claims actual agent identity; that is recorded separately");
for (const constraint of epoch.native_constraints.constraints) require(constraint.value === 0, `${constraint.name} is nonzero`);

const runUUID = nativeLog.match(/Problem run_uuid: ([0-9a-f-]+)/)?.[1] ?? null;
const objective = nativeLog.match(/Final objective: \((-?\d+), (-?\d+)\)/);
require(runUUID !== null && objective, "native solver log omits run UUID or final objective");
require(Number(objective[1]) === -epoch.native_score && Number(objective[2]) === jobs.length,
  "native solver log objective differs from epoch JSON score/job count");
require(nativeLog.includes("end reason: UNABLE_TO_FIND_MORE_MOVES"), "native solver log omits completed solve reason");
require(runnerLog.includes("\"epoch\":0") && runnerLog.includes("\"assignments\""), "runner epoch log omits native recommendation");

const result = {
  schema: "gobi.compiled-children-native-protocol-audit/v1",
  readOnly: true,
  epoch: 0,
  jobCount: jobs.length,
  workers: expectedWorkers,
  assignmentCount: Object.keys(epoch.assignments).length,
  acceptedSpawnCount: dispatch.actual_accepted_spawns.length,
  nativeVersion: capacity.native_version,
  probeSHA256: capacity.probe_sha256,
  toolkitPRHead: capacity.toolkit_pr_head,
  runUUID,
  objective: [Number(objective[1]), Number(objective[2])],
  exactScore: epoch.exact_score,
  nativeScore: epoch.native_score,
  constraintsSolved: epoch.native_constraints.constraints.map(({ name, value }) => ({ name, value })),
  epochBundle: { bytes: bundle.byteLength, sha256: digest(bundle) },
  allocationSeed: "not recorded in available epoch/capacity/dispatch artifacts; deterministic task event seed is not applicable",
  reviewAcknowledgement: "not present in epoch-0 allocation; root remains responsible for read-only review/acknowledgement closure",
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
