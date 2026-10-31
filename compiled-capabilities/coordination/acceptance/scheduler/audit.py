#!/usr/bin/env python3
"""Read-only independent auditor for ChainSpot native scheduling evidence.

The checker replays state events, validates each accepted native epoch against
its persisted JSON, and recomputes the weighted one-to-one assignment optimum
with a small dynamic program. It never writes to the evidence tree.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import pathlib
import sys
from dataclasses import dataclass
from typing import Any


STARTUP_FAILURE_EVIDENCE = {
    "source": "232406843678f46c569e1c54b34b268c84e7764e",
    "failed_command": "GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 CHROMIUM_PATH=/tmp/chromium CHROMIUM_EXECUTABLE_PATH=/tmp/chromium bash run-compiled-capabilities.sh",
    "failure": "ENOENT creating attemptRoot before its parent; no test stage executed",
    "log": "compiled-capabilities/coordination/root-checks/startup-failed-2324068/command.log",
    "log_sha256": "8d37cd1446f90513077746c8ebb309851421ae1d30ee8b7483d02170f8e285db",
    "new_jobs": ["E-FIX-STARTUP", "XR-FIX-STARTUP"],
    "pairs": [("E-FIX-STARTUP", "XR-FIX-STARTUP", "E-BUILD")],
    "log_markers": [b"ENOENT: no such file or directory, mkdir", b"compiled-capabilities/run.mjs:160:1"],
}

RUNNER_ACCEPTANCE_FAILURE_EVIDENCE = {
    "source": "031c462bcd72c0ae0bee2dc05a0972b3902ca40c",
    "source_remote": "a2e1164d68abaaa7d028bdaf6a20bea842a131ae",
    "failed_command": "GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 CHROMIUM_PATH=/tmp/chromium CHROMIUM_EXECUTABLE_PATH=/tmp/chromium bash run-compiled-capabilities.sh",
    "failure": "failed inherited prose gate despite passed full nested receipt; failed final receipt returned CLI exit 0",
    "log": "compiled-capabilities/ci/2026-10-31/failed-local-031c/command.log",
    "log_sha256": "bf66825486126f9ee1bfa6438a4c0f939efcec5356eec9e136c51e3f2ef0468d",
    "observed_cli_exit_code": 0,
    "new_jobs": [
        "E-FIX-RUNNER-ACCEPTANCE",
        "XR-FIX-RUNNER-ACCEPTANCE",
        "E-FIX-SOURCE-AUDIT",
        "XR-FIX-SOURCE-AUDIT",
    ],
    "pairs": [
        ("E-FIX-RUNNER-ACCEPTANCE", "XR-FIX-RUNNER-ACCEPTANCE", "E-BUILD"),
        ("E-FIX-SOURCE-AUDIT", "XR-FIX-SOURCE-AUDIT", "E-PREP-PROVENANCE"),
    ],
    "log_markers": [b"compiled-capabilities: failed (full)"],
}


@dataclass
class Snapshot:
    root: pathlib.Path
    state: dict[str, Any]
    spec: dict[str, Any]
    capacity: dict[str, Any]
    dispatch: dict[str, Any]
    native: dict[int, dict[str, Any]]
    receipts: dict[str, dict[str, Any]]
    logs: dict[str, str]
    bundles: set[int]


def load_snapshot(root: pathlib.Path) -> Snapshot:
    root = root.resolve()
    def read_json(path: pathlib.Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8"))

    native: dict[int, dict[str, Any]] = {}
    bundles: set[int] = set()
    for path in sorted((root / "native").glob("epoch-*.json")):
        item = read_json(path)
        epoch = item.get("epoch")
        if isinstance(epoch, int):
            native[epoch] = item
    for path in (root / "native").glob("epoch-*.bundle"):
        try:
            bundles.add(int(path.stem.removeprefix("epoch-")))
        except ValueError:
            continue
    receipts = {p.stem: read_json(p) for p in sorted((root / "receipts").glob("*.json"))}
    logs = {p.name: p.read_text(encoding="utf-8", errors="replace")
            for p in root.glob("epoch-*.log")}
    return Snapshot(
        root=root,
        state=read_json(root / "state.json"),
        spec=read_json(root / "spec.json"),
        capacity=read_json(root / "capacity.json"),
        dispatch=read_json(root / "dispatch.json"),
        native=native,
        receipts=receipts,
        logs=logs,
        bundles=bundles,
    )


def clone_snapshot(snapshot: Snapshot) -> Snapshot:
    """Deep-copy evidence for in-memory mutation tests."""
    return Snapshot(
        root=snapshot.root,
        state=copy.deepcopy(snapshot.state),
        spec=copy.deepcopy(snapshot.spec),
        capacity=copy.deepcopy(snapshot.capacity),
        dispatch=copy.deepcopy(snapshot.dispatch),
        native=copy.deepcopy(snapshot.native),
        receipts=copy.deepcopy(snapshot.receipts),
        logs=copy.deepcopy(snapshot.logs),
        bundles=set(snapshot.bundles),
    )


def _dp_score(workers: list[str], jobs: list[str], eligible: dict[str, list[str]],
              weights: dict[str, int]) -> int:
    """Maximum weight one-to-one worker/job assignment, independent of solver."""
    dp: dict[int, int] = {0: 0}
    for job in jobs:
        next_dp = dict(dp)
        for mask, score in dp.items():
            for n, worker in enumerate(workers):
                bit = 1 << n
                if not mask & bit and worker in eligible.get(job, []):
                    next_mask = mask | bit
                    next_dp[next_mask] = max(next_dp.get(next_mask, -1), score + weights[job])
        dp = next_dp
    return max(dp.values(), default=0)


def audit(snapshot: Snapshot, require_complete: bool = False) -> dict[str, Any]:
    errors: list[str] = []
    incomplete: list[str] = []

    def fail(code: str, detail: str) -> None:
        errors.append(f"{code}: {detail}")

    def pending(code: str, detail: str) -> None:
        incomplete.append(f"{code}: {detail}")

    def add_visible_jobs(job_ids: list[str], event_index: int, extension_kind: str) -> None:
        for jid in job_ids:
            if not isinstance(jid, str):
                fail("extension_job_id", f"{extension_kind} event {event_index} contains a non-string job id")
                continue
            if jid not in state_jobs:
                fail("extension_job_missing", f"{extension_kind} event {event_index} references missing state job {jid}")
                continue
            if jid in visible:
                fail("extension_job_duplicate", f"{extension_kind} event {event_index} exposes already-visible job {jid}")
                continue
            visible.add(jid)
            definitions[jid] = state_jobs[jid]
            runtime_status.setdefault(jid, "pending")
            runtime_job_worker.setdefault(jid, None)

    def verify_executed_failure(event: dict[str, Any], event_index: int,
                                evidence: dict[str, Any], label: str) -> None:
        for field in ("source", "source_remote", "failed_command", "failure", "log",
                      "log_sha256", "observed_cli_exit_code"):
            if field not in evidence:
                continue
            expected = evidence[field]
            if event.get(field) != expected:
                fail("executed_failure_evidence", f"event {event_index} field {field} differs from the recorded {label} failure")
        rel = event.get("log")
        if not isinstance(rel, str) or "\\" in rel:
            fail("executed_failure_log", f"event {event_index} log path is not a safe repo-relative path")
            return
        path_parts = pathlib.PurePosixPath(rel)
        if path_parts.is_absolute() or any(part in ("", ".", "..") for part in path_parts.parts):
            fail("executed_failure_log", f"event {event_index} log path is not a safe repo-relative path")
            return
        repo_root = snapshot.root.resolve().parents[1]
        try:
            log_path = (repo_root / pathlib.Path(*path_parts.parts)).resolve(strict=True)
            log_path.relative_to(repo_root)
            raw = log_path.read_bytes()
        except (OSError, ValueError):
            fail("executed_failure_log", f"event {event_index} log is missing or resolves outside the repository")
            return
        digest = hashlib.sha256(raw).hexdigest()
        if digest != event.get("log_sha256") or digest != evidence["log_sha256"]:
            fail("executed_failure_log_hash", f"event {event_index} {label} failure log does not match its pinned SHA-256")
        if any(marker not in raw for marker in evidence["log_markers"]):
            fail("executed_failure_log_content", f"event {event_index} log does not show the recorded {label} failure")

    def verify_failure_extension_jobs(event: dict[str, Any], event_index: int,
                                      evidence: dict[str, Any]) -> None:
        new_jobs = event.get("new_jobs", [])
        if new_jobs != evidence["new_jobs"]:
            fail("executed_failure_jobs", f"event {event_index} does not add the recorded {len(evidence['pairs'])} repair/review pair(s)")
        for repair_id, review_id, repair_of in evidence["pairs"]:
            repair = state_jobs.get(repair_id, {})
            review = state_jobs.get(review_id, {})
            if repair.get("kind") != "extract" or repair.get("repair_of") != repair_of:
                fail("executed_failure_repair_link", f"event {event_index} repair {repair_id} must be an extract repairing {repair_of}")
            if review.get("kind") != "review" or review.get("depends_on") != repair_id:
                fail("executed_failure_review_link", f"event {event_index} review {review_id} must depend on {repair_id}")

    state, spec = snapshot.state, snapshot.spec
    workers = list(spec.get("workers", []))
    state_workers = state.get("workers", {})
    state_jobs = state.get("jobs", {})
    events = state.get("events", [])
    policy = state.get("policy", {})
    if not isinstance(workers, list) or len(workers) != len(set(workers)) or not workers:
        fail("worker_roster", "spec workers must be a non-empty unique list")
        workers = []
    if set(state_workers) != set(workers):
        fail("worker_roster", "state worker keys differ from spec worker roster")

    # Capacity is sourced from the recorded real spawn list, never inferred from jobs.
    slots = snapshot.capacity.get("advertised_concurrent_slots_including_root")
    count = snapshot.capacity.get("available_workers")
    if slots != 7 or count != 6 or slots - 1 != count:
        fail("capacity_declaration", f"expected seven slots including root and six worker slots; got slots={slots!r}, workers={count!r}")
    spawn_rows = snapshot.dispatch.get("actual_accepted_spawns", [])
    if len(spawn_rows) != 6:
        fail("initial_spawn_count", f"dispatch.json records {len(spawn_rows)} accepted initial spawns, expected six")
    spawn_workers = [row.get("worker") for row in spawn_rows]
    spawn_jobs = [row.get("job") for row in spawn_rows]
    spawn_agents = [row.get("agent") for row in spawn_rows]
    if len(set(spawn_workers)) != len(spawn_workers) or set(spawn_workers) != set(workers):
        fail("initial_spawn_workers", "dispatch.json must show one accepted spawn for every worker")
    if len(set(spawn_jobs)) != len(spawn_jobs) or len(set(spawn_agents)) != len(spawn_agents):
        fail("initial_spawn_uniqueness", "initial accepted spawn worker/job/agent identities must be unique")
    if snapshot.dispatch.get("capacity") != {"slots_including_root": 7, "workers": 6}:
        fail("dispatch_capacity", "dispatch.json capacity does not match seven slots including root and six workers")
    if snapshot.capacity.get("model") != "gpt-6-luna" or snapshot.capacity.get("reasoning_effort") != "xhigh":
        fail("capacity_model", "capacity declaration does not record gpt-6-luna at xhigh")
    if any(row.get("model") != "gpt-6-luna" or row.get("reasoning_effort") != "xhigh" for row in spawn_rows):
        fail("spawn_model", "one or more actual initial spawn receipts differ from gpt-6-luna xhigh")
    if snapshot.dispatch.get("dispatch_is_native_solver_recommendation_then_separate_collaboration_spawn") is not True:
        fail("spawn_provenance", "dispatch receipt does not assert native recommendation followed by actual spawn")

    # Seed event replay only from the frozen spec. Dynamic repair/prep packets become
    # visible at their extension event, so a future packet cannot appear ready early.
    visible: set[str] = set()
    runtime_status: dict[str, str] = {}
    runtime_worker: dict[str, str | None] = {}
    runtime_job_worker: dict[str, str | None] = {}
    definitions: dict[str, dict[str, Any]] = {}
    prefix = spec.get("review_policy", {}).get("review_prefix", "R")
    # spec.json is amended alongside state.json as the process runs. The actual
    # initial launch list is the immutable dispatch.json record; later jobs enter
    # only at their corresponding extension event.
    initial_jobs = [row.get("job") for row in spawn_rows]
    spec_job_map = {job["id"]: job for job in spec.get("jobs", [])}
    for jid in initial_jobs:
        job = spec_job_map.get(jid, {})
        visible.add(jid)
        definitions[jid] = state_jobs.get(jid, job)
        runtime_status[jid] = "pending"
        runtime_job_worker[jid] = None
        if spec.get("review_policy", {}).get("enabled", True):
            rid = f"{prefix}{jid[1:] if jid[:1].upper() == 'E' else jid}"
            visible.add(rid)
            definitions[rid] = state_jobs.get(rid, {})
            runtime_status[rid] = "pending"
            runtime_job_worker[rid] = None
    for worker in workers:
        runtime_worker[worker] = None

    solve_events = [event for event in events if event.get("type") == "solve"]
    if not solve_events:
        fail("no_native_epochs", "state has no accepted solve events")
    if len(snapshot.native) != len(solve_events):
        fail("native_epoch_count", f"{len(solve_events)} accepted solve events but {len(snapshot.native)} native epoch JSON files")

    pending_dispatch: dict[str, str] = {}
    latest_solve_epoch: int | None = None
    accepted_epochs: list[int] = []
    seen_dispatches: list[dict[str, Any]] = []
    rejected_positions: list[int] = []

    for index, event in enumerate(events):
        typ = event.get("type")
        if typ == "solve":
            if pending_dispatch:
                fail("dispatch_incomplete", f"epoch {latest_solve_epoch} recommendations were not fully dispatched before the next solve")
            epoch = event.get("epoch")
            if not isinstance(epoch, int):
                fail("epoch_id", f"event {index} has a non-integer epoch")
                continue
            accepted_epochs.append(epoch)
            latest_solve_epoch = epoch
            if epoch != len(accepted_epochs) - 1:
                fail("epoch_sequence", f"accepted epoch sequence is not contiguous at {epoch}")
            native = snapshot.native.get(epoch)
            if native is None:
                fail("native_epoch_missing", f"accepted epoch {epoch} has no native JSON")
            else:
                if epoch not in snapshot.bundles:
                    fail("native_bundle_missing", f"accepted epoch {epoch} has no saved native bundle")
                for field in ("epoch", "ready_jobs", "pinned_workers", "assignments", "dispatch",
                              "native_constraints", "independent_capacity_check",
                              "independent_eligibility_check", "exact_score", "native_score",
                              "caps", "eligible", "weights", "agent_by_worker"):
                    if event.get(field) != native.get(field):
                        fail("native_event_mismatch", f"epoch {epoch} state event differs from native JSON field {field}")

            pins = [worker for worker in workers if runtime_worker.get(worker) is not None]
            ready = []
            for jid in state_jobs:
                if jid not in visible or runtime_status.get(jid) != "pending":
                    continue
                job = definitions.get(jid, {})
                if job.get("kind") == "review":
                    dependency = job.get("depends_on")
                    if dependency not in visible or runtime_status.get(dependency) != "done":
                        continue
                ready.append(jid)
            eligible: dict[str, list[str]] = {}
            weights: dict[str, int] = {}
            for jid in ready:
                job = definitions.get(jid, {})
                elig = []
                for worker in workers:
                    if runtime_worker.get(worker) is not None:
                        continue
                    allow_workers = job.get("allow_workers")
                    if allow_workers is not None and worker not in allow_workers:
                        continue
                    if job.get("kind") == "review":
                        dependency_worker = runtime_job_worker.get(job.get("depends_on"))
                        if dependency_worker == worker:
                            continue
                    elig.append(worker)
                eligible[jid] = elig
                if job.get("repair_of"):
                    weights[jid] = policy.get("repair_priority")
                elif job.get("kind") == "review":
                    weights[jid] = policy.get("review_priority")
                else:
                    weights[jid] = policy.get("extract_priority")

            # Recalculate the native assignment checks from the independently replayed state.
            assignments = event.get("assignments", {})
            dispatch = event.get("dispatch", {})
            if set(assignments) != set(workers):
                fail("assignment_worker_set", f"epoch {epoch} assignment does not name every worker exactly once")
            if set(event.get("ready_jobs", [])) != set(ready):
                fail("ready_at_start", f"epoch {epoch} ready packet set differs from replayed pending/dependency state")
            if set(event.get("pinned_workers", [])) != set(pins):
                fail("pinned_at_start", f"epoch {epoch} pinned worker set differs from active work at solve start")
            if event.get("eligible") != eligible:
                fail("eligibility_at_start", f"epoch {epoch} eligibility differs from allow-worker, free-worker, or independent-review rules")
            if event.get("weights") != weights:
                fail("weights_at_start", f"epoch {epoch} priorities differ from recorded policy and repair metadata")
            expected_caps = {jid: 0 for jid in visible}
            expected_caps["BENCH"] = len(workers)
            for worker in pins:
                expected_caps[runtime_worker[worker]] = 1
            for jid in ready:
                expected_caps[jid] = 1
            if event.get("caps") != expected_caps:
                fail("native_caps", f"epoch {epoch} capacity declarations differ from replayed pins, ready packets, or worker count")
            if event.get("independent_capacity_check") is not True or event.get("independent_eligibility_check") is not True:
                fail("independent_checks", f"epoch {epoch} did not record both independent checks as true")

            # Check each mapped assignment against the reproduced capacity, pins, and eligibility.
            destinations: list[str] = []
            actual_dispatch: dict[str, str] = {}
            for worker in workers:
                dest = assignments.get(worker)
                if dest is None:
                    continue
                destinations.append(dest)
                if worker in pins and dest != runtime_worker[worker]:
                    fail("pin_moved", f"epoch {epoch} moved pinned worker {worker} from {runtime_worker[worker]} to {dest}")
                if worker not in pins and dest != "BENCH":
                    if dest not in ready:
                        fail("not_ready_assignment", f"epoch {epoch} assigned {worker} to non-ready packet {dest}")
                    elif worker not in eligible.get(dest, []):
                        job = definitions.get(dest, {})
                        if job.get("kind") == "review" and runtime_job_worker.get(job.get("depends_on")) == worker:
                            fail("self_review", f"epoch {epoch} assigned reviewer {worker} to its own dependency {job.get('depends_on')}")
                        else:
                            fail("ineligible_assignment", f"epoch {epoch} assigned {worker} to ineligible packet {dest}")
                    actual_dispatch[worker] = dest
            counts: dict[str, int] = {}
            for dest in destinations:
                counts[dest] = counts.get(dest, 0) + 1
            if any(dest != "BENCH" and count > 1 for dest, count in counts.items()):
                fail("packet_capacity", f"epoch {epoch} assigned multiple workers to one logical packet")
            if dispatch != actual_dispatch:
                fail("dispatch_projection", f"epoch {epoch} dispatch does not equal its unpinned non-BENCH assignments")
            if event.get("native_constraints", {}).get("solved") is not True:
                fail("native_unsolved", f"epoch {epoch} native solver did not report solved=true")
            constraints = event.get("native_constraints", {})
            if constraints.get("brokenCount") != 0 or constraints.get("brokenVal") != 0:
                fail("native_broken", f"epoch {epoch} native constraint result has brokenCount={constraints.get('brokenCount')!r}, brokenVal={constraints.get('brokenVal')!r}")
            computed_dispatch_score = sum(weights.get(jid, 0) for jid in dispatch.values())
            dp_score = _dp_score([w for w in workers if w not in pins], ready, eligible, weights)
            if event.get("native_score") != dp_score or computed_dispatch_score != dp_score:
                fail("native_score_not_optimal", f"epoch {epoch} native score={event.get('native_score')!r}, dispatch score={computed_dispatch_score}, independent DP score={dp_score}")
            if event.get("exact_score") != dp_score:
                fail("exact_score_mismatch", f"epoch {epoch} exact score={event.get('exact_score')!r}, independent DP score={dp_score}")

            pending_dispatch = dict(dispatch)
            # Epoch 0 has separately recorded actual initial spawn receipts; these must match exactly.
            if epoch == 0:
                spawn_map = {row.get("worker"): row.get("job") for row in spawn_rows}
                if spawn_map != dispatch:
                    fail("initial_spawn_recommendation", "dispatch.json actual initial spawns differ from native epoch 0 recommendation")

        elif typ == "dispatch":
            worker, job_id = event.get("worker"), event.get("job")
            if worker not in runtime_worker or job_id not in visible:
                fail("dispatch_unknown", f"event {index} dispatch references unknown worker/job {worker!r}/{job_id!r}")
                continue
            if runtime_worker[worker] is not None:
                fail("worker_over_capacity", f"event {index} dispatches busy worker {worker}")
            if runtime_status.get(job_id) != "pending":
                fail("job_over_capacity", f"event {index} dispatches non-pending job {job_id}")
            if pending_dispatch.get(worker) != job_id:
                fail("dispatch_recommendation", f"event {index} actual dispatch {worker}->{job_id} does not match latest native recommendation")
            job = definitions.get(job_id, {})
            if job.get("kind") == "review":
                dependency = job.get("depends_on")
                if dependency not in visible or runtime_status.get(dependency) != "done":
                    fail("review_dependency", f"review {job_id} started before dependency {dependency} was done")
                if runtime_job_worker.get(dependency) == worker:
                    fail("self_review", f"worker {worker} reviewed their own dependency {dependency} in {job_id}")
            allow_workers = job.get("allow_workers")
            if allow_workers is not None and worker not in allow_workers:
                fail("worker_allowlist", f"worker {worker} is outside {job_id} allow_workers")
            if pending_dispatch.get(worker) == job_id:
                del pending_dispatch[worker]
            runtime_worker[worker] = job_id
            runtime_status[job_id] = "running"
            runtime_job_worker[job_id] = worker
            seen_dispatches.append(event)

        elif typ == "complete":
            worker, job_id = event.get("worker"), event.get("job")
            if worker not in runtime_worker or runtime_worker.get(worker) != job_id:
                fail("completion_owner", f"event {index} completion does not match an active worker/job assignment")
                continue
            runtime_worker[worker] = None
            runtime_status[job_id] = "done"

        elif typ == "extend-after-review-amend":
            review_id = event.get("review")
            review = definitions.get(review_id, {}) if isinstance(review_id, str) else {}
            review_receipt = snapshot.receipts.get(review_id, {}) if isinstance(review_id, str) else {}
            if (not isinstance(review_id, str) or review_id not in visible or runtime_status.get(review_id) != "done"
                    or review.get("kind") != "review" or review_receipt.get("decision") != "amend"):
                fail("amend_extension_before_review", f"event {index} exposes repair jobs before matching review {review_id!r} completed with decision=amend")
            if event.get("decision") != "amend":
                fail("amend_extension_decision", f"event {index} is not marked with decision=amend")
            new_jobs = event.get("new_jobs", [])
            if (not isinstance(new_jobs, list) or len(new_jobs) != 2
                    or any(not isinstance(jid, str) for jid in new_jobs)
                    or len(set(new_jobs)) != len(new_jobs)):
                fail("amend_extension_jobs", f"event {index} must add one unique extraction repair and its review")
                new_jobs = new_jobs if isinstance(new_jobs, list) else []
                new_jobs = [jid for jid in new_jobs if isinstance(jid, str)]
            repair_ids = [jid for jid in new_jobs if jid in state_jobs
                          and state_jobs[jid].get("kind") == "extract"
                          and state_jobs[jid].get("repair_of") == review_id]
            if len(repair_ids) != 1:
                fail("amend_extension_repair_link", f"event {index} must link one extract repair_of {review_id!r}")
            else:
                repair_id = repair_ids[0]
                fix_reviews = [jid for jid in new_jobs if jid in state_jobs
                               and state_jobs[jid].get("kind") == "review"
                               and state_jobs[jid].get("depends_on") == repair_id
                               and jid.startswith("XR-FIX-")]
                if len(fix_reviews) != 1:
                    fail("amend_extension_review_link", f"event {index} must add one XR-FIX review depending on {repair_id}")
            add_visible_jobs(new_jobs if isinstance(new_jobs, list) else [], index, "AMEND extension")

        elif typ == "extend-independent-evidence-preparation":
            for jid in event.get("jobs", []):
                if jid not in state_jobs:
                    fail("extension_job_missing", f"preparation extension references missing state job {jid}")
                    continue
                visible.add(jid)
                definitions[jid] = state_jobs[jid]
                runtime_status.setdefault(jid, "pending")
                runtime_job_worker.setdefault(jid, None)
                if spec.get("review_policy", {}).get("enabled", True):
                    review_id = f"{prefix}{jid[1:] if jid[:1].upper() == 'E' else jid}"
                    if review_id not in state_jobs:
                        fail("extension_review_missing", f"preparation job {jid} has no generated review job {review_id}")
                    else:
                        visible.add(review_id)
                        definitions[review_id] = state_jobs[review_id]
                        runtime_status.setdefault(review_id, "pending")
                        runtime_job_worker.setdefault(review_id, None)

        elif typ == "extend-after-executed-failure":
            source = event.get("source")
            if source == STARTUP_FAILURE_EVIDENCE["source"]:
                evidence, label = STARTUP_FAILURE_EVIDENCE, "startup"
            elif source == RUNNER_ACCEPTANCE_FAILURE_EVIDENCE["source"]:
                evidence, label = RUNNER_ACCEPTANCE_FAILURE_EVIDENCE, "runner-acceptance"
            else:
                fail("executed_failure_source", f"event {index} source does not identify a recorded executed failure")
                continue
            verify_executed_failure(event, index, evidence, label)
            verify_failure_extension_jobs(event, index, evidence)
            new_jobs = event.get("new_jobs", [])
            add_visible_jobs(new_jobs if isinstance(new_jobs, list) else [], index, "executed-failure extension")

        elif typ == "native-recommendation-rejected":
            rejected_positions.append(index)
            if event.get("dispatch_performed") is not False:
                fail("rejected_dispatched", "rejected native recommendation is not explicitly marked undispatched")
            if event.get("reason") != "nonoptimal_native_score":
                fail("rejection_reason", "preserved epoch-03 rejection does not identify nonoptimal native score")
            log_name = event.get("log")
            log = snapshot.logs.get(log_name, "")
            if not log or "nonoptimal_native_score" not in log:
                fail("rejected_log_missing", f"rejected native recommendation log {log_name!r} is missing or lacks diagnostic")
            next_solve = next((n for n in range(index + 1, len(events)) if events[n].get("type") == "solve"), len(events))
            if any(e.get("type") == "dispatch" for e in events[index + 1:next_solve]):
                fail("rejected_recommendation_dispatch", "a dispatch occurred after rejected recommendation and before the next accepted solve")

    if pending_dispatch:
        fail("dispatch_incomplete", f"final native recommendation still has undispatched workers {sorted(pending_dispatch)}")
    if not rejected_positions:
        fail("rejected_epoch_unrecorded", "preserved nonoptimal epoch-03 rejection event is missing")

    # The replayed terminal worker/job state must agree with the live scheduler snapshot.
    for worker in workers:
        record = state_workers.get(worker, {})
        if record.get("job") != runtime_worker.get(worker):
            fail("terminal_worker_state", f"worker {worker} terminal job differs between replay and state.json")
    for jid, final_job in state_jobs.items():
        if jid not in runtime_status:
            continue
        if final_job.get("status") != runtime_status.get(jid):
            fail("terminal_job_state", f"job {jid} terminal status differs between replay and state.json")
        if runtime_status.get(jid) in {"running", "done"} and final_job.get("worker") != runtime_job_worker.get(jid):
            fail("terminal_job_worker", f"job {jid} terminal worker differs between replay and state.json")

    # Every completed packet needs an on-disk receipt matching its scheduler identity.
    for jid, job in state_jobs.items():
        if job.get("status") != "done":
            continue
        receipt = snapshot.receipts.get(jid)
        if receipt is None:
            fail("receipt_missing", f"completed job {jid} has no receipt JSON")
            continue
        if receipt.get("job_id") != jid or receipt.get("worker") != job.get("worker"):
            fail("receipt_identity", f"receipt {jid} does not match job id and assigned worker")
        if not isinstance(receipt.get("summary"), str) or not receipt["summary"].strip():
            fail("receipt_summary", f"receipt {jid} has no non-empty summary")
        if job.get("kind") == "review" and receipt.get("decision") not in {"accepted", "amend", "rejected"}:
            fail("receipt_review_decision", f"review receipt {jid} has invalid decision")
        if job.get("kind") == "extract" and receipt.get("outcome") not in {"confirmed_reuse", "mixed_change", "not_reuse", "insufficient_evidence"}:
            fail("receipt_extract_outcome", f"extract receipt {jid} has invalid outcome")

    # Original AMEND decisions remain immutable. Each must eventually be closed by
    # an accepted XR-FIX-* review for an extraction packet whose repair_of names it.
    for jid, job in state_jobs.items():
        if job.get("kind") != "review":
            continue
        original_receipt = snapshot.receipts.get(jid)
        if not original_receipt or original_receipt.get("decision") != "amend":
            continue
        repair_jobs = [
            (rid, rjob) for rid, rjob in state_jobs.items()
            if rjob.get("kind") == "extract" and rjob.get("repair_of") == jid
        ]
        closed = False
        for repair_id, repair in repair_jobs:
            repair_reviews = [
                (rrid, rrjob) for rrid, rrjob in state_jobs.items()
                if rrjob.get("kind") == "review" and rrjob.get("depends_on") == repair_id
                and rrid.startswith("XR-FIX-")
            ]
            for review_id, review in repair_reviews:
                review_receipt = snapshot.receipts.get(review_id)
                basis = (review_receipt or {}).get("review_basis", {})
                if (review.get("status") == "done" and review_receipt
                        and review_receipt.get("decision") == "accepted"
                        and basis.get("original_amendment") in {None, jid}
                        and basis.get("repair") in {None, repair_id}):
                    closed = True
        if not closed:
            pending("amendment_closure", f"AMEND {jid} has no completed accepted XR-FIX-* review for a repair_of packet")

    # Complete means there is no pending/running work and every amendment is closed.
    open_jobs = [jid for jid, job in state_jobs.items() if job.get("status") != "done"]
    if open_jobs:
        pending("open_jobs", f"{len(open_jobs)} of {len(state_jobs)} packets remain pending or running: {', '.join(open_jobs)}")
    if errors:
        status = "FAIL"
    elif incomplete:
        status = "INCOMPLETE"
    else:
        status = "PASS"
    if require_complete and incomplete:
        errors.extend(f"required_complete: {item}" for item in incomplete)
        status = "FAIL"
    return {
        "status": status,
        "accepted_epochs": accepted_epochs,
        "accepted_epoch_count": len(accepted_epochs),
        "initial_spawn_count": len(spawn_rows),
        "worker_count": len(workers),
        "packet_count": len(state_jobs),
        "errors": errors,
        "incomplete": incomplete,
        "read_only": True,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=pathlib.Path,
                        default=pathlib.Path(__file__).resolve().parents[2],
                        help="coordination evidence directory (default: this milestone's coordination directory)")
    parser.add_argument("--require-complete", action="store_true",
                        help="fail while packets or accepted amendment closures are still incomplete")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args(argv)
    try:
        result = audit(load_snapshot(args.root), require_complete=args.require_complete)
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        print(f"FAIL: unable to audit evidence: {exc}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"{result['status']}: {result['accepted_epoch_count']} accepted native epochs; "
              f"{result['initial_spawn_count']} initial spawns; "
              f"{result['worker_count']} workers; {result['packet_count']} packets")
        for item in result["errors"]:
            print(f"ERROR {item}")
        for item in result["incomplete"]:
            print(f"INCOMPLETE {item}")
    return 0 if result["status"] in {"PASS", "INCOMPLETE"} and not args.require_complete else (0 if result["status"] == "PASS" else 2)


if __name__ == "__main__":
    raise SystemExit(main())
