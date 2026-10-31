import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const readBytes = (path) => readFileSync(resolve(root, path));
const readJSON = (path) => JSON.parse(readBytes(path));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const require = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = (items) => [...items].sort();

const stateBytesBefore = readBytes("compiled-publications/coordination/state.json");
const state = JSON.parse(stateBytesBefore);
const spec = readJSON("compiled-publications/coordination/spec.json");
const capacity = readJSON("compiled-publications/coordination/actual-capacity.json");
const epoch0 = readJSON("compiled-publications/coordination/native/epoch-00.json");
const epoch1 = readJSON("compiled-publications/coordination/native/epoch-01.json");
const events = state.events;
const workers = ["N1", "N2", "N3", "N4", "N5", "N6"];

require(state.schema === "chainspot.rebalancer-state/v1" && spec.schema === "chainspot.rebalancer-spec/v1", "protocol schema differs");
require(state.epoch === 2 && events.filter((item) => item.type === "solve").length === 2, "captured state does not match epochs 0–1");
require(JSON.stringify(sorted(Object.keys(state.workers))) === JSON.stringify(workers), "worker set differs from six accepted slots");
require(capacity.declaredSessionSlots === 7 && capacity.leadSlots === 1 && capacity.actualConcurrentWorkerAssignments === 6,
  "capacity ledger does not record the seven-slot / six-worker topology");
require(capacity.probeOnlyRecommends === true && capacity.actualDispatchSeparatelyAcknowledged === true,
  "capacity ledger conflates recommendations and acknowledged dispatch");

const nativeSolves = [epoch0, epoch1];
for (let index = 0; index < nativeSolves.length; index += 1) {
  const report = nativeSolves[index];
  const event = events.find((item) => item.type === "solve" && item.epoch === index);
  const file = readJSON(`compiled-publications/coordination/native/epoch-${String(index).padStart(2, "0")}.json`);
  const { type: _eventType, ...eventReport } = event ?? {};
  require(event && isDeepStrictEqual(report, eventReport) && isDeepStrictEqual(file, eventReport),
    `native epoch ${index} files do not match the state event ledger`);
  require(report.native_constraints?.solved === true && report.native_constraints.brokenVal === 0 && report.native_constraints.brokenCount === 0,
    `native epoch ${index} reports failed constraints`);
  require(report.independent_capacity_check === true && report.independent_eligibility_check === true &&
    report.exact_score === report.native_score, `native epoch ${index} independent checks or score differ`);
  require(report.native_constraints.constraints.every((item) => item.value === 0), `native epoch ${index} has a nonzero constraint`);
  require(JSON.stringify(sorted(Object.keys(report.assignments))) === JSON.stringify(workers), `native epoch ${index} assignment worker set differs`);
}

const extractionJobs = spec.jobs.filter((job) => job.kind === "extract");
const epoch0ByJob = new Map(extractionJobs.map((job) => [job.id, job]));
require(epoch0.ready_jobs.length === 6 && Object.keys(epoch0.dispatch).length === 6 && epoch0.native_score === 600,
  "epoch 0 does not recommend all six extraction lanes at score 600");
const initialAccepted = events.filter((item) => item.type === "dispatch" && item.job !== "E-NATIVECLI").slice(0, 6);
require(initialAccepted.length === 6 && new Set(initialAccepted.map((item) => item.worker)).size === 6 &&
  new Set(initialAccepted.map((item) => item.job)).size === 6, "epoch 0 lacks six distinct accepted spawn acknowledgements");
for (const acknowledgement of initialAccepted) {
  const job = epoch0ByJob.get(acknowledgement.job);
  require(job && epoch0.dispatch[acknowledgement.worker] === acknowledgement.job &&
    job.allow_workers.includes(acknowledgement.worker), `accepted epoch-0 spawn differs from native eligibility: ${acknowledgement.job}`);
  require(typeof acknowledgement.agent === "string" && acknowledgement.agent.length > 0,
    `accepted epoch-0 spawn ${acknowledgement.job} lacks an actual agent identity`);
}
require(capacity.at && capacity.nativeAssignmentEpoch === 0, "capacity receipt lacks its epoch-0 binding");

const activeJobs = Object.entries(state.workers).filter(([, worker]) => worker.job).map(([worker, record]) => [worker, record.job]);
require(activeJobs.length === 6, "all six workers are not presently represented in live assignments");
for (const [worker, jobID] of activeJobs) {
  const job = state.jobs[jobID];
  require(job?.status === "running" && job.worker === worker, `worker/job running-state mismatch for ${worker}/${jobID}`);
}
const authorByJob = new Map(extractionJobs.map((job) => [job.id, job.allow_workers[0]]));
for (const [worker, jobID] of activeJobs) {
  require(authorByJob.get(jobID) !== undefined || jobID === "E-NATIVECLI", `unknown active extraction ${jobID}`);
  if (jobID === "E-NATIVECLI") require(worker === "N3", "native CLI handoff landed on the wrong worker");
}
const epoch1Pinned = new Set(epoch1.pinned_workers);
for (const [worker, jobID] of activeJobs.filter(([worker]) => worker !== "N3")) {
  require(epoch1Pinned.has(worker) && epoch1.assignments[worker] === jobID, `epoch 1 moved pinned worker ${worker}`);
}
require(epoch1.dispatch.N3 === "E-NATIVECLI" && epoch1.native_score === 100,
  "epoch 1 native CLI recommendation differs from the accepted handoff");
const handoff = events.find((item) => item.type === "acknowledged-cli-ownership-transfer");
require(handoff?.from === "N1 E-GO" && handoff?.to === "N3 E-NATIVECLI" && handoff.scope === "cmd/compiled-publications-native/**",
  "native CLI ownership handoff is not explicitly acknowledged");
require(state.jobs["E-HOST"]?.status === "done" && state.jobs["E-NATIVECLI"]?.status === "running",
  "completed host job / active native CLI handoff state differs");
const completedHostReceipt = readJSON("compiled-publications/coordination/receipts/E-HOST.json");
require(completedHostReceipt.job_id === "E-HOST" && completedHostReceipt.worker === "N3" && completedHostReceipt.outcome,
  "completed E-HOST receipt identity is not valid");

const stateBytesAfter = readBytes("compiled-publications/coordination/state.json");
require(digest(stateBytesBefore) === digest(stateBytesAfter), "read-only native protocol audit changed scheduler state");
const result = {
  schema: "gobi.compiled-publications-native-protocol-audit/v1",
  readOnly: true,
  nativeEpochs: [0, 1],
  nativeReports: nativeSolves.map((item) => ({ epoch: item.epoch, score: item.native_score, constraintsSolved: item.native_constraints.constraints.length })),
  declaredSlots: capacity.declaredSessionSlots,
  acknowledgedInitialSpawns: initialAccepted.length,
  activeAssignmentsAtAudit: activeJobs,
  cliOwnershipHandoff: { from: handoff.from, to: handoff.to, scope: handoff.scope },
  independentReviewStatus: "XR-HOST and other review tasks are not yet closed; no review acceptance is claimed",
  schedulerStateSHA256: digest(stateBytesBefore),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
