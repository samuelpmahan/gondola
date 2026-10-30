#!/usr/bin/env python3
"""Portable native-Rebalancer scheduling probe; all state/output paths are explicit."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
from typing import Any

try:
    from rebalancer import ProblemSolver
except ImportError as exc:  # pragma: no cover - exercised by CLI users without dependency
    raise SystemExit("Install the pinned dependency with: python -m pip install -r experiments/rebalancer/requirements.txt") from exc


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def read_json(path: pathlib.Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tmp.replace(path)


def review_id(extract_id: str, prefix: str) -> str:
    suffix = extract_id[1:] if extract_id[:1].upper() == "E" else extract_id
    return f"{prefix}{suffix}"


def validate_token(value: Any, label: str) -> None:
    if not isinstance(value, str) or re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,63}", value) is None:
        raise ValueError(f"{label} must be a safe filename token (letters, digits, dot, underscore, hyphen)")


def make_state(spec: dict[str, Any]) -> dict[str, Any]:
    if spec.get("schema") != "chainspot.rebalancer-spec/v1":
        raise ValueError("unsupported spec schema")
    workers = spec.get("workers")
    jobs = spec.get("jobs")
    if not isinstance(workers, list) or not workers or len(set(workers)) != len(workers):
        raise ValueError("spec workers must be a non-empty list of unique names")
    for worker in workers:
        validate_token(worker, "worker id")
    if not isinstance(jobs, list) or not jobs:
        raise ValueError("spec jobs must be a non-empty list")
    prefix = spec.get("review_policy", {}).get("review_prefix", "R")
    validate_token(prefix, "review prefix")
    job_map: dict[str, dict[str, Any]] = {}
    for entry in jobs:
        if not isinstance(entry, dict) or not entry.get("id") or entry.get("kind") != "extract":
            raise ValueError("spec jobs must be extraction packets with an id")
        jid = entry["id"]
        validate_token(jid, "job id")
        if jid in job_map:
            raise ValueError(f"duplicate job id: {jid}")
        allow_workers = entry.get("allow_workers")
        if allow_workers is not None and (not isinstance(allow_workers, list) or any(w not in workers for w in allow_workers)):
            raise ValueError(f"{jid}.allow_workers must contain only declared worker ids")
        job_map[jid] = {**entry, "status": "pending", "worker": None, "started_at": None, "finished_at": None}
    if spec.get("review_policy", {}).get("enabled", True):
        for entry in jobs:
            rid = review_id(entry["id"], prefix)
            validate_token(rid, "review id")
            if rid in job_map:
                raise ValueError(f"review id collides with job: {rid}")
            job_map[rid] = {"id": rid, "kind": "review", "depends_on": entry["id"], "status": "pending", "worker": None, "started_at": None, "finished_at": None}
    policy = {"extract_priority": 100, "review_priority": 200, "repair_priority": 300, **spec.get("policy", {})}
    return {
        "schema": "chainspot.rebalancer-state/v1",
        "service": spec.get("service", {}),
        "workers": {name: {"job": None, "agent": None} for name in workers},
        "jobs": job_map,
        "events": [],
        "epoch": 0,
        "policy": policy,
    }


def load_state(path: pathlib.Path) -> dict[str, Any]:
    state = read_json(path)
    if state.get("schema") != "chainspot.rebalancer-state/v1":
        raise ValueError("unsupported state schema")
    return state


def init(spec_path: pathlib.Path, state_path: pathlib.Path, overwrite: bool = False) -> dict[str, Any]:
    if state_path.exists() and not overwrite:
        raise FileExistsError(f"state file already exists; use --force to replace it: {state_path}")
    state = make_state(read_json(spec_path))
    write_json(state_path, state)
    return {"state": str(state_path.resolve()), "workers": len(state["workers"]), "packets": len(state["jobs"])}


def exact_max_score(workers: list[str], ready: list[str], eligible: dict[str, list[str]], weights: dict[str, int]) -> int:
    free = list(workers)
    dp = {0: 0}
    for job in ready:
        nxt = dict(dp)
        for mask, score in dp.items():
            for n, worker in enumerate(free):
                if not mask & (1 << n) and worker in eligible[job]:
                    nm = mask | (1 << n)
                    nxt[nm] = max(nxt.get(nm, -1), score + weights[job])
        dp = nxt
    return max(dp.values(), default=0)


def solve(state_path: pathlib.Path, output_dir: pathlib.Path) -> dict[str, Any]:
    state = load_state(state_path)
    workers = list(state["workers"])
    jobs = state["jobs"]
    lanes = list(jobs) + ["BENCH"]
    caps = {job: 0 for job in jobs}
    caps["BENCH"] = len(workers)
    initial: dict[str, list[str]] = {lane: [] for lane in lanes}
    pins: list[str] = []
    ready: list[str] = []
    eligible: dict[str, list[str]] = {}
    weights: dict[str, int] = {}
    for worker, record in state["workers"].items():
        initial[record["job"] or "BENCH"].append(worker)
        if record["job"]:
            pins.append(worker)
            caps[record["job"]] = 1
    for jid, job in jobs.items():
        if job["status"] != "pending":
            continue
        if job["kind"] == "review":
            dependency = jobs[job["depends_on"]]
            if dependency["status"] != "done":
                continue
        ready.append(jid)
        weights[jid] = state["policy"]["repair_priority"] if job.get("repair_of") else state["policy"]["review_priority"] if job["kind"] == "review" else state["policy"]["extract_priority"]
        eligible[jid] = [
            w for w in workers
            if not state["workers"][w]["job"]
            and (job.get("allow_workers") is None or w in job["allow_workers"])
            and (job["kind"] != "review" or jobs[job["depends_on"]]["worker"] != w)
        ]
        caps[jid] = 1

    solver = ProblemSolver(service_name=state.get("service", {}).get("name", "rebalancer"), service_scope=f"epoch-{state['epoch']}")
    solver.set_object_name("worker").set_container_name("packet").set_assignment(initial)
    solver.add_scope("packets", {lane: lane for lane in lanes})
    solver.add_object_dimension("headcount", {worker: 1 for worker in workers})
    solver.add_scope_dimension("headcount", "packets", caps)
    solver.add_constraint({"capacitySpec": {"name": "ready_packet_capacity", "scope": "packets", "dimension": "headcount"}})
    solver.add_constraint({"avoidMovingSpec": {"name": "pin_in_flight", "objects": pins}})
    forbidden = [{"object": w, "scopeItems": [job for job in ready if w not in eligible[job]]} for w in workers]
    solver.add_constraint({"avoidAssignmentsSpec": {"name": "independent_review", "scope": "packets", "assignments": forbidden}})
    affinities = [{"objectName": w, "scopeItemName": j, "affinity": weights[j]} for j in ready for w in eligible[j]]
    if affinities:
        solver.add_goal({"assignmentAffinitiesSpec": {"name": "ready_work_priority", "scope": "packets", "affinities": affinities}}, 1.0, 0)
    solver.add_goal({"minimizeMovementSpec": {"name": "movement_tiebreak", "scope": "packets", "dimension": "headcount", "doNotNormalize": True}}, 1.0, 1)
    solver.add_solver({"localSearchSolverSpec": {"solveTime": 1, "stopAfterMoves": 500, "randomSeed": 7, "moveTypeList": [{"singleMoveTypeSpec": {}}, {"swapMoveTypeSpec": {}}]}})
    started = time.monotonic()
    result = solver.solve()
    elapsed = time.monotonic() - started
    assignment = result["assignment"]
    violations: list[str] = []
    if set(assignment) != set(workers):
        violations.append("assignment_worker_set_mismatch")
    if any(destination not in lanes for destination in assignment.values()):
        violations.append("assignment_unknown_destination")
    counts = {lane: sum(dest == lane for dest in assignment.values()) for lane in lanes}
    if any(counts[lane] > caps[lane] for lane in lanes):
        violations.append("capacity_exceeded")
    if any(assignment.get(worker) != state["workers"][worker]["job"] for worker in pins):
        violations.append("pin_moved")
    dispatch = {w: job for w, job in assignment.items() if w not in pins and job != "BENCH"}
    if any(job not in ready or w not in eligible.get(job, []) for w, job in dispatch.items()):
        violations.append("ineligible_assignment")
    constraint = result.get("finalConstraint", {})
    if constraint.get("brokenVal") != 0 or constraint.get("brokenCount") != 0:
        violations.append("native_constraints_broken")
    score = sum(weights[job] for job in dispatch.values())
    optimum = exact_max_score([w for w in workers if w not in pins], ready, eligible, weights)
    if score != optimum:
        violations.append("nonoptimal_native_score")
    if violations:
        raise RuntimeError(f"native assignment rejected before dispatch: {violations}")

    output_dir.mkdir(parents=True, exist_ok=True)
    name = f"epoch-{state['epoch']:02}"
    solver.save_bundle(str(output_dir / f"{name}.bundle"))
    report = {
        "epoch": state["epoch"], "at": now(), "ready_jobs": ready, "pinned_workers": pins,
        "assignments": assignment, "dispatch": dispatch, "native_seconds": elapsed,
        "native_constraints": constraint, "independent_capacity_check": True,
        "independent_eligibility_check": True, "exact_score": optimum, "native_score": score,
        "caps": caps, "eligible": eligible, "weights": weights,
        "agent_by_worker": {w: record.get("agent") for w, record in state["workers"].items()},
    }
    write_json(output_dir / f"{name}.json", report)
    state["events"].append({"type": "solve", **report})
    state["epoch"] += 1
    write_json(state_path, state)
    return report


def start(state_path: pathlib.Path, worker: str, job_id: str, agent: str) -> dict[str, Any]:
    state = load_state(state_path)
    worker_data = state["workers"].get(worker)
    job = state["jobs"].get(job_id)
    if worker_data is None or job is None:
        raise ValueError("unknown worker or job")
    if worker_data["job"] or job["status"] != "pending":
        raise ValueError("worker must be free and job must be pending")
    latest = next((event for event in reversed(state["events"]) if event.get("type") == "solve"), None)
    if latest is None or latest.get("dispatch", {}).get(worker) != job_id:
        raise ValueError("dispatch must match the latest native assignment")
    if job.get("allow_workers") is not None and worker not in job["allow_workers"]:
        raise ValueError("worker is outside the packet's allow_workers eligibility")
    if job["kind"] == "review":
        dependency = state["jobs"][job["depends_on"]]
        if dependency["status"] != "done" or dependency["worker"] == worker:
            raise ValueError("review must follow extraction completion and use a different worker")
    at = now()
    worker_data.update(job=job_id, agent=agent)
    job.update(status="running", worker=worker, started_at=at)
    state["events"].append({"type": "dispatch", "at": at, "worker": worker, "job": job_id, "agent": agent})
    write_json(state_path, state)
    return {"worker": worker, "job": job_id, "agent": agent, "status": "running"}


def validate_receipt(data: dict[str, Any], job: dict[str, Any], worker: str) -> None:
    if data.get("job_id") != job["id"] or data.get("worker") != worker:
        raise ValueError("receipt job_id/worker do not match the active packet")
    if not isinstance(data.get("summary"), str) or not data["summary"].strip():
        raise ValueError("receipt must include a non-empty summary")
    if job["kind"] == "review" and data.get("decision") not in {"accepted", "amend", "rejected"}:
        raise ValueError("review receipt decision must be accepted, amend, or rejected")
    if job["kind"] == "extract" and data.get("outcome") not in {"confirmed_reuse", "mixed_change", "not_reuse", "insufficient_evidence"}:
        raise ValueError("extraction receipt has an unknown outcome")


def finish(state_path: pathlib.Path, receipts_dir: pathlib.Path, worker: str) -> dict[str, Any]:
    state = load_state(state_path)
    worker_data = state["workers"].get(worker)
    if worker_data is None or not worker_data["job"]:
        raise ValueError("worker has no active packet")
    job_id = worker_data["job"]
    job = state["jobs"][job_id]
    path = receipts_dir / f"{job_id}.json"
    if not path.is_file():
        raise FileNotFoundError(f"receipt is not present: {path}")
    data = read_json(path)
    validate_receipt(data, job, worker)
    at = now()
    job.update(status="done", finished_at=at, receipt=str(path.resolve()))
    worker_data.update(job=None, agent=None)
    state["events"].append({"type": "complete", "at": at, "worker": worker, "job": job_id})
    write_json(state_path, state)
    return {"worker": worker, "job": job_id, "receipt": str(path.resolve()), "status": "done"}


def packet(state_path: pathlib.Path, receipts_dir: pathlib.Path, job_id: str) -> dict[str, Any]:
    state = load_state(state_path)
    job = state["jobs"].get(job_id)
    if job is None:
        raise ValueError(f"unknown job: {job_id}")
    result = {"job": job}
    if job["kind"] == "review":
        extraction = state["jobs"][job["depends_on"]]
        receipt_path = receipts_dir / f"{job['depends_on']}.json"
        result["extraction"] = extraction
        result["extraction_receipt_path"] = str(receipt_path.resolve())
        if receipt_path.is_file():
            result["extraction_receipt"] = read_json(receipt_path)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("init", help="create an external run state from a spec")
    p.add_argument("--spec", required=True, type=pathlib.Path)
    p.add_argument("--state", required=True, type=pathlib.Path)
    p.add_argument("--force", action="store_true", help="replace an existing state file")
    p = commands.add_parser("solve", help="solve one dispatch epoch and write bundle/receipt")
    p.add_argument("--state", required=True, type=pathlib.Path)
    p.add_argument("--output-dir", required=True, type=pathlib.Path)
    p = commands.add_parser("start", help="manually acknowledge one recommended assignment")
    p.add_argument("--state", required=True, type=pathlib.Path)
    p.add_argument("worker")
    p.add_argument("job")
    p.add_argument("agent", help="operator-supplied label; no agent API is called")
    p = commands.add_parser("finish", help="release a worker after checking its receipt")
    p.add_argument("--state", required=True, type=pathlib.Path)
    p.add_argument("--receipts-dir", required=True, type=pathlib.Path)
    p.add_argument("worker")
    p = commands.add_parser("packet", help="print an extraction or review packet")
    p.add_argument("--state", required=True, type=pathlib.Path)
    p.add_argument("--receipts-dir", required=True, type=pathlib.Path)
    p.add_argument("job")
    args = parser.parse_args(argv)
    if args.command == "init":
        result = init(args.spec, args.state, args.force)
    elif args.command == "solve":
        result = solve(args.state, args.output_dir)
    elif args.command == "start":
        result = start(args.state, args.worker, args.job, args.agent)
    elif args.command == "finish":
        result = finish(args.state, args.receipts_dir, args.worker)
    else:
        result = packet(args.state, args.receipts_dir, args.job)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError, FileExistsError, RuntimeError) as exc:
        print(f"rebalancer: {exc}", file=sys.stderr)
        raise SystemExit(2)

