#!/usr/bin/env python3
"""Receipt-gated native scheduling adapter for the renderer replacement run.

This adapter keeps the pinned Rebalancer probe as the only solver. It prepares
new review specs from accepted author receipts, invokes probe.init/solve in a
fresh directory, and records decisions in its own ledger. It intentionally does
not call the probe's extraction-only finish command for implementation or
review results.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
from typing import Any


LEDGER_SCHEMA = "chainspot.renderer-replacement-ledger/v1"
PACKET_RECEIPT_SCHEMA = "chainspot.renderer-replacement-packet-receipt/v1"
REVIEW_RECEIPT_SCHEMA = "chainspot.renderer-replacement-review-receipt/v1"
WORKERS = ["W1", "W2", "W3", "W4", "W5", "W6"]


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def read_json(path: pathlib.Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def relative_or_absolute(path: pathlib.Path, root: pathlib.Path) -> str:
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return str(path.resolve())


def repository_root(ledger_path: pathlib.Path, ledger: dict[str, Any]) -> pathlib.Path:
    value = pathlib.Path(ledger["repo_root"])
    if value.is_absolute():
        return value.resolve()
    return (ledger_path.resolve().parent / value).resolve()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def require_timestamp(value: Any, field: str) -> None:
    require(isinstance(value, str) and value, f"{field} must be a non-empty ISO-8601 timestamp")
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{field} must be a non-empty ISO-8601 timestamp") from exc
    require(parsed.tzinfo is not None, f"{field} must include a UTC offset")


def load_ledger(path: pathlib.Path) -> dict[str, Any]:
    ledger = read_json(path)
    require(ledger.get("schema") == LEDGER_SCHEMA, "unsupported coordination ledger schema")
    return ledger


def init_ledger(args: argparse.Namespace) -> dict[str, Any]:
    root = args.repo_root.resolve()
    spec_path = args.initial_spec.resolve()
    solve_path = args.initial_solve.resolve()
    state_path = args.initial_state.resolve()
    require(not args.output.exists(), f"ledger already exists; refusing to overwrite receipts: {args.output}")
    spec, solve, state = read_json(spec_path), read_json(solve_path), read_json(state_path)

    require(spec.get("schema") == "chainspot.rebalancer-spec/v1", "initial spec is not a native Rebalancer spec")
    require(spec.get("workers") == WORKERS, "initial spec must contain W1..W6 in order")
    jobs = {job["id"]: job for job in spec.get("jobs", [])}
    require(len(jobs) == 6, "initial spec must define six unique author packets")
    require(set(solve.get("ready_jobs", [])) == set(jobs), "initial solve did not allocate all six initial packets")
    require(solve.get("native_constraints", {}).get("brokenVal") == 0, "initial native solve has broken constraints")
    require(solve.get("native_constraints", {}).get("brokenCount") == 0, "initial native solve has broken constraints")
    require(solve.get("exact_score") == solve.get("native_score") == 600, "initial native/exact scores are not both 600")

    assignment = solve.get("assignments", {})
    require(len(assignment) == 6 and set(assignment) == set(WORKERS), "initial assignment must use each worker once")
    require(len(set(assignment.values())) == 6 and set(assignment.values()) == set(jobs), "initial assignment must cover each packet once")

    starts: dict[str, dict[str, Any]] = {}
    for event in state.get("events", []):
        if event.get("type") == "dispatch":
            require(event.get("worker") not in starts, f"duplicate dispatch for {event.get('worker')}")
            starts[event["worker"]] = event
    require(set(starts) == set(WORKERS), "all six actual probe.start acknowledgments are required")

    worker_for_packet = {job: worker for worker, job in assignment.items()}
    packet_ledger: dict[str, Any] = {}
    worker_agents: dict[str, str] = {}
    events: list[dict[str, Any]] = []
    for packet_id, packet in jobs.items():
        worker = worker_for_packet[packet_id]
        start = starts[worker]
        require(start.get("job") == packet_id, f"probe.start does not match native allocation for {packet_id}")
        actual_job = state.get("jobs", {}).get(packet_id, {})
        require(actual_job.get("worker") == worker and actual_job.get("status") == "running",
                f"external state does not show {packet_id} running on {worker}")
        require(start.get("agent") == state.get("workers", {}).get(worker, {}).get("agent"),
                f"agent label mismatch for {worker}")
        worker_agents[worker] = start["agent"]
        packet_ledger[packet_id] = {
            "packet_fields": packet,
            "worker": worker,
            "agent": start["agent"],
            "status": "running",
            "started_at": start["at"],
            "author_results": [],
            "coordination_observations": [],
        }
        events.append({
            "type": "probe_start_acknowledgment",
            "at": start["at"],
            "worker": worker,
            "agent": start["agent"],
            "packet_id": packet_id,
        })

    ledger = {
        "schema": LEDGER_SCHEMA,
        "run_id": "gondola-renderer-replacement-20261030",
        "created_at": now(),
        "repo_root": os.path.relpath(root, args.output.resolve().parent),
        "native_allocation": {
            "solver": "nativeRebalancer",
            "version": "1.0.4",
            "spec_path": relative_or_absolute(spec_path, root),
            "solve_receipt_path": relative_or_absolute(solve_path, root),
            "bundle_path": relative_or_absolute(solve_path.with_suffix(".bundle"), root),
            "external_state_path": str(state_path),
            "epoch": solve.get("epoch"),
            "solved_at": solve.get("at"),
            "assignments": assignment,
            "native_constraints": solve.get("native_constraints"),
            "exact_score": solve.get("exact_score"),
            "native_score": solve.get("native_score"),
            "eligibility_check": solve.get("independent_eligibility_check"),
            "capacity_check": solve.get("independent_capacity_check"),
        },
        "worker_agents": worker_agents,
        "packets": packet_ledger,
        "cross_review": {
            "status": "blocked_waiting_for_six_accepted_author_receipts",
            "spec_path": None,
            "external_state_path": None,
            "solve_receipt_path": None,
            "assignments": None,
            "review_results": {},
        },
        "events": events,
    }
    write_json(args.output, ledger)
    return {"ledger": str(args.output.resolve()), "packets": len(packet_ledger), "starts": len(events)}


def record_observation(args: argparse.Namespace) -> dict[str, Any]:
    ledger = load_ledger(args.ledger)
    packet = ledger["packets"].get(args.packet)
    require(packet is not None, f"unknown packet: {args.packet}")
    event = {
        "type": "coordinator_observation",
        "observed_at": args.observed_at or now(),
        "reported_by": args.reported_by,
        "source_ref": args.source_ref,
        "decision": args.decision,
        "summary": args.summary,
    }
    packet["coordination_observations"].append(event)
    if event["decision"] == "amend":
        packet["status"] = "amendment_requested"
    elif event["decision"] in {"blocked", "rejected"}:
        packet["status"] = event["decision"]
    ledger["events"].append({"packet_id": args.packet, **event})
    write_json(args.ledger, ledger)
    return {"packet": args.packet, "decision": args.decision, "receipt_created": False}


def receipt_record(path: pathlib.Path, expected_schema: str) -> tuple[dict[str, Any], str]:
    raw = path.read_bytes()
    data = json.loads(raw.decode("utf-8"))
    require(data.get("schema") == expected_schema, f"receipt must use schema {expected_schema}")
    return data, hashlib.sha256(raw).hexdigest()


def record_author_result(args: argparse.Namespace) -> dict[str, Any]:
    ledger = load_ledger(args.ledger)
    require(ledger["cross_review"].get("status") == "blocked_waiting_for_six_accepted_author_receipts",
            "author results are frozen after a cross-review spec is prepared; create a new run for later work")
    packet = ledger["packets"].get(args.packet)
    require(packet is not None, f"unknown packet: {args.packet}")
    receipt_path = args.receipt.resolve()
    receipt, digest = receipt_record(receipt_path, PACKET_RECEIPT_SCHEMA)
    require(receipt.get("packet_id") == args.packet, "receipt packet_id does not match requested packet")
    require(receipt.get("worker") == packet["worker"], "receipt worker does not match the native allocation")
    require(receipt.get("agent") == packet["agent"], "receipt agent does not match the recorded probe start")
    require(receipt.get("decision") in {"accepted", "amend", "blocked", "rejected"}, "invalid author decision")
    require(isinstance(receipt.get("summary"), str) and receipt["summary"].strip(), "receipt summary is required")
    require(isinstance(receipt.get("decision_by"), str) and receipt["decision_by"], "receipt decision_by is required")
    require_timestamp(receipt.get("recorded_at"), "receipt recorded_at")
    require(isinstance(receipt.get("source_report"), str) and receipt["source_report"].strip(),
            "receipt source_report must preserve the actual author report")
    evidence = receipt.get("deliverables")
    require(isinstance(evidence, list), "receipt deliverables must be a list of repository-relative paths")
    root = repository_root(args.ledger, ledger)
    require(receipt_path.is_relative_to(root.resolve()), "author receipt must be stored within this repository")
    for item in evidence:
        require(isinstance(item, str) and item, "deliverable paths must be non-empty strings")
        candidate = (root / item).resolve()
        require(candidate.is_relative_to(root.resolve()), f"deliverable escapes repository: {item}")
        require(candidate.is_file(), f"deliverable does not exist: {item}")

    result = {
        "decision": receipt["decision"],
        "decision_by": receipt["decision_by"],
        "summary": receipt["summary"],
        "recorded_at": receipt["recorded_at"],
        "source_report": receipt["source_report"],
        "receipt_path": relative_or_absolute(receipt_path, root),
        "receipt_sha256": digest,
        "deliverables": evidence,
    }
    if any(existing.get("receipt_sha256") == digest for existing in packet["author_results"]):
        return {"packet": args.packet, "decision": result["decision"], "status": packet["status"], "receipt_sha256": digest, "duplicate": True}
    packet["author_results"].append(result)
    packet["status"] = "accepted" if result["decision"] == "accepted" else "amendment_requested" if result["decision"] == "amend" else result["decision"]
    ledger["events"].append({"type": "author_result_recorded", "packet_id": args.packet, **result})
    write_json(args.ledger, ledger)
    return {"packet": args.packet, "decision": result["decision"], "status": packet["status"], "receipt_sha256": digest}


def ready_author_result(packet_id: str, packet: dict[str, Any], root: pathlib.Path) -> dict[str, Any]:
    results = packet.get("author_results", [])
    require(bool(results), f"{packet_id} has no actual author receipt")
    latest = results[-1]
    require(packet.get("status") == "accepted", f"{packet_id} is not currently accepted (status={packet.get('status')})")
    require(latest.get("decision") == "accepted" and latest.get("receipt_sha256"),
            f"{packet_id} is not accepted; latest decision is {latest.get('decision')}")
    receipt_path = pathlib.Path(latest["receipt_path"])
    if not receipt_path.is_absolute():
        receipt_path = root / receipt_path
    require(receipt_path.resolve().is_relative_to(root.resolve()), f"{packet_id} receipt escapes the repository")
    require(receipt_path.is_file(), f"{packet_id} acceptance receipt is missing: {receipt_path}")
    require(hashlib.sha256(receipt_path.read_bytes()).hexdigest() == latest["receipt_sha256"],
            f"{packet_id} acceptance receipt was tampered with after recording")
    for item in latest.get("deliverables", []):
        path = (root / item).resolve()
        require(path.is_relative_to(root.resolve()) and path.is_file(), f"{packet_id} deliverable is missing or outside the repository: {item}")
    return latest


def build_review_spec(ledger: dict[str, Any], ledger_path: pathlib.Path) -> dict[str, Any]:
    workers = [worker for worker in WORKERS if worker in ledger["worker_agents"]]
    require(workers == WORKERS, "ledger does not contain all workers in W1..W6 order")
    root = repository_root(ledger_path, ledger)
    initial_spec_path = root / ledger["native_allocation"]["spec_path"]
    initial_spec = read_json(initial_spec_path)
    initial_jobs = {job["id"]: job for job in initial_spec["jobs"]}
    review_jobs = []
    for packet_id in sorted(ledger["packets"]):
        packet = ledger["packets"][packet_id]
        latest = ready_author_result(packet_id, packet, root)
        original = initial_jobs[packet_id]
        review_id = f"XR-{packet_id}"
        allow_workers = [worker for worker in workers if worker != packet["worker"]]
        review_jobs.append({
            "id": review_id,
            "kind": "extract",
            "task_kind": "independent_review",
            "stage": "cross_review",
            "packet_type": "independent_author_review",
            "lane": original.get("scope", packet_id),
            "author_packet": packet_id,
            "author_worker": packet["worker"],
            "author_agent": packet["agent"],
            "author_task_kind": original.get("task_kind"),
            "author_scope": original.get("scope"),
            "author_packet_fields": original,
            "author_decision": latest["decision"],
            "author_receipt_path": latest["receipt_path"],
            "author_receipt_sha256": latest["receipt_sha256"],
            "source_paths": latest["deliverables"],
            "allow_workers": allow_workers,
            "review_scope": "Independently inspect the accepted packet's listed deliverables and direct call sites. Report concrete correctness, API, boundary, and proof gaps without editing the lane owner's files.",
        })
    return {
        "schema": "chainspot.rebalancer-spec/v1",
        "service": {"name": "gondola-renderer-replacement-cross-review", "scope": "independent-author-review"},
        "workers": workers,
        "jobs": review_jobs,
        "review_policy": {"enabled": False},
        "policy": {"extract_priority": 100, "review_priority": 100, "repair_priority": 100},
    }


def prepare_reviews(args: argparse.Namespace) -> dict[str, Any]:
    ledger = load_ledger(args.ledger)
    require(ledger["cross_review"].get("status") == "blocked_waiting_for_six_accepted_author_receipts",
            "a cross-review spec has already been prepared; use a fresh run for a new review epoch")
    spec = build_review_spec(ledger, args.ledger)
    root = repository_root(args.ledger, ledger)
    write_json(args.spec_output, spec)
    ledger["cross_review"].update({
        "status": "spec_prepared_waiting_for_native_solve",
        "spec_path": relative_or_absolute(args.spec_output, root),
        "external_state_path": None,
        "solve_receipt_path": None,
        "assignments": None,
    })
    ledger["events"].append({
        "type": "cross_review_spec_prepared",
        "at": now(),
        "spec_path": ledger["cross_review"]["spec_path"],
        "packet_count": len(spec["jobs"]),
    })
    write_json(args.ledger, ledger)
    return {"spec": str(args.spec_output.resolve()), "reviews": len(spec["jobs"]), "fresh_state_required": True}


def exact_max_score(workers: list[str], jobs: list[dict[str, Any]]) -> int:
    dp = {0: 0}
    for job_index, job in enumerate(jobs):
        allowed = job["allow_workers"]
        next_dp = dict(dp)
        for mask, score in dp.items():
            for worker_index, worker in enumerate(workers):
                bit = 1 << worker_index
                if mask & bit or worker not in allowed:
                    continue
                next_mask = mask | bit
                next_dp[next_mask] = max(next_dp.get(next_mask, -1), score + 100)
        dp = next_dp
    return max(dp.values(), default=0)


def verify_review_solution(spec: dict[str, Any], report: dict[str, Any]) -> None:
    workers, jobs = spec["workers"], spec["jobs"]
    assignments = report.get("assignments", {})
    dispatch = report.get("dispatch", {})
    require(set(assignments) == set(workers), "native review solution does not contain every worker")
    require(set(dispatch) == set(workers), "native review solution did not dispatch all six workers")
    require(len(set(dispatch.values())) == len(jobs) == 6, "native review solution did not assign six unique packets")
    require(set(dispatch.values()) == {job["id"] for job in jobs}, "native review solution did not cover all review packets")
    by_id = {job["id"]: job for job in jobs}
    for worker, job_id in dispatch.items():
        job = by_id[job_id]
        require(worker in job["allow_workers"], f"ineligible review assignment: {worker} -> {job_id}")
        require(worker != job["author_worker"], f"reviewer assigned to own packet: {worker} -> {job_id}")
    constraints = report.get("native_constraints", {})
    require(constraints.get("brokenVal") == 0 and constraints.get("brokenCount") == 0,
            "native review solve reports broken constraints")
    require(report.get("independent_capacity_check") is True, "native review capacity check did not pass")
    require(report.get("independent_eligibility_check") is True, "native review eligibility check did not pass")
    exact_score = exact_max_score(workers, jobs)
    native_score = sum(100 for _worker, _job in dispatch.items())
    require(exact_score == native_score == report.get("exact_score") == report.get("native_score"),
            f"native review score mismatch: exact={exact_score}, native={native_score}, receipt={report.get('native_score')}")


def solve_reviews(args: argparse.Namespace) -> dict[str, Any]:
    ledger = load_ledger(args.ledger)
    require(ledger["cross_review"].get("status") == "spec_prepared_waiting_for_native_solve",
            "cross-review spec is not awaiting its first native solve")
    root = repository_root(args.ledger, ledger)
    spec_path = args.spec.resolve()
    spec = read_json(spec_path)
    expected_spec = build_review_spec(ledger, args.ledger)
    require(spec == expected_spec, "review spec no longer matches the accepted author receipts")
    run_dir = args.run_dir.resolve()
    require(not run_dir.exists(), f"review run directory already exists; use a fresh run dir: {run_dir}")
    probe = args.probe.resolve()
    require(probe.is_file(), f"native Rebalancer probe not found: {probe}")
    run_dir.mkdir(parents=True)
    state_path = run_dir / "state.json"
    solve_dir = run_dir / "solve"
    subprocess.run([sys.executable, str(probe), "init", "--spec", str(spec_path), "--state", str(state_path)], check=True)
    subprocess.run([sys.executable, str(probe), "solve", "--state", str(state_path), "--output-dir", str(solve_dir)], check=True)
    solve_path = solve_dir / "epoch-00.json"
    report = read_json(solve_path)
    verify_review_solution(spec, report)
    receipt_dir = args.receipt_dir.resolve()
    require(receipt_dir.is_relative_to(root), "native receipt directory must be within the repository")
    archived_report = receipt_dir / "epoch-00.json"
    archived_bundle = receipt_dir / "epoch-00.bundle"
    require(not archived_report.exists() and not archived_bundle.exists(), "native receipt archive already exists; use a fresh review epoch")
    require((solve_dir / "epoch-00.bundle").is_file(), "native probe did not produce its solver bundle")
    receipt_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(solve_path, archived_report)
    shutil.copyfile(solve_dir / "epoch-00.bundle", archived_bundle)
    ledger["cross_review"].update({
        "status": "native_assigned_waiting_for_actual_dispatch",
        "spec_path": relative_or_absolute(spec_path, root),
        "external_state_path": str(state_path),
        "solve_receipt_path": relative_or_absolute(archived_report, root),
        "bundle_path": relative_or_absolute(archived_bundle, root),
        "external_solve_receipt_path": str(solve_path),
        "assignments": report["dispatch"],
        "native_constraints": report["native_constraints"],
        "exact_score": report["exact_score"],
        "native_score": report["native_score"],
        "review_run_id": run_dir.name,
    })
    ledger["events"].append({
        "type": "cross_review_native_solve",
        "at": report["at"],
        "solve_receipt_path": ledger["cross_review"]["solve_receipt_path"],
        "bundle_path": ledger["cross_review"]["bundle_path"],
        "assignments": report["dispatch"],
        "native_score": report["native_score"],
        "exact_score": report["exact_score"],
    })
    write_json(args.ledger, ledger)
    return {
        "state": str(state_path),
        "solve_receipt": str(archived_report),
        "assignments": report["dispatch"],
        "native_score": report["native_score"],
        "exact_score": report["exact_score"],
    }


def ack_review_start(args: argparse.Namespace) -> dict[str, Any]:
    ledger = load_ledger(args.ledger)
    review = ledger.get("cross_review", {})
    require(review.get("status") in {"native_assigned_waiting_for_actual_dispatch", "reviews_in_progress"},
            "cross-review allocation is not ready for dispatch")
    require(ledger["worker_agents"].get(args.worker) == args.agent, "agent does not match the actual worker identity")
    state_path = pathlib.Path(review["external_state_path"])
    probe = args.probe.resolve()
    subprocess.run([sys.executable, str(probe), "start", "--state", str(state_path), args.worker, args.packet, args.agent], check=True)
    started_state = read_json(state_path)
    start = next((
        event for event in reversed(started_state.get("events", []))
        if event.get("type") == "dispatch" and event.get("worker") == args.worker and event.get("job") == args.packet
    ), None)
    require(start is not None and start.get("agent") == args.agent, "native probe did not record the requested actual start")
    ledger["events"].append({
        "type": "cross_review_start_acknowledgment",
        "at": start["at"],
        "worker": args.worker,
        "agent": args.agent,
        "packet_id": args.packet,
    })
    ledger["cross_review"]["status"] = "reviews_in_progress"
    write_json(args.ledger, ledger)
    return {"worker": args.worker, "agent": args.agent, "packet": args.packet, "status": "running"}


def record_review_result(args: argparse.Namespace) -> dict[str, Any]:
    ledger = load_ledger(args.ledger)
    review = ledger.get("cross_review", {})
    require(review.get("status") in {"native_assigned_waiting_for_actual_dispatch", "reviews_in_progress", "review_results_recorded"},
            "cross-review allocation is not ready for receipts")
    packet_id = args.packet
    packet = next((job for job in build_review_spec(ledger, args.ledger)["jobs"] if job["id"] == packet_id), None)
    require(packet is not None, f"unknown review packet: {packet_id}")
    require(review.get("assignments", {}).get(args.worker) == packet_id, "review receipt worker differs from native assignment")
    require(args.worker != packet["author_worker"], "author cannot review its own packet")
    run_state_path = pathlib.Path(review["external_state_path"])
    run_state = read_json(run_state_path)
    started = any(
        event.get("type") == "dispatch" and event.get("worker") == args.worker and event.get("job") == packet_id
        for event in run_state.get("events", [])
    )
    require(started, "no actual native probe.start acknowledgment exists for this reviewer")
    receipt, digest = receipt_record(args.receipt.resolve(), REVIEW_RECEIPT_SCHEMA)
    require(receipt.get("packet_id") == packet_id, "review receipt packet_id does not match")
    require(receipt.get("worker") == args.worker, "review receipt worker does not match native assignment")
    require(receipt.get("agent") == ledger["worker_agents"].get(args.worker), "review receipt agent does not match worker identity")
    require(receipt.get("decision") in {"accepted", "amend", "blocked"}, "invalid independent-review decision")
    require(isinstance(receipt.get("summary"), str) and receipt["summary"].strip(), "review receipt summary is required")
    require(isinstance(receipt.get("decision_by"), str) and receipt["decision_by"] == receipt["agent"],
            "review decision_by must match the reporting reviewer")
    require_timestamp(receipt.get("recorded_at"), "review receipt recorded_at")
    ledger["cross_review"].setdefault("review_results", {})[packet_id] = {
        "worker": args.worker,
        "agent": receipt["agent"],
        "decision": receipt["decision"],
        "decision_by": receipt["decision_by"],
        "summary": receipt["summary"],
        "recorded_at": receipt["recorded_at"],
        "receipt_path": relative_or_absolute(args.receipt.resolve(), repository_root(args.ledger, ledger)),
        "receipt_sha256": digest,
    }
    ledger["cross_review"]["status"] = "review_results_recorded"
    ledger["events"].append({
        "type": "cross_review_result_recorded",
        "at": now(),
        "packet_id": packet_id,
        **ledger["cross_review"]["review_results"][packet_id],
    })
    write_json(args.ledger, ledger)
    return {"packet": packet_id, "decision": receipt["decision"], "receipt_sha256": digest}


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)

    init = sub.add_parser("init-ledger", help="snapshot actual initial solve and probe.start events")
    init.add_argument("--repo-root", required=True, type=pathlib.Path)
    init.add_argument("--initial-spec", required=True, type=pathlib.Path)
    init.add_argument("--initial-solve", required=True, type=pathlib.Path)
    init.add_argument("--initial-state", required=True, type=pathlib.Path)
    init.add_argument("--output", required=True, type=pathlib.Path)
    init.set_defaults(func=init_ledger)

    obs = sub.add_parser("record-observation", help="record a real coordination observation without creating a receipt")
    obs.add_argument("--ledger", required=True, type=pathlib.Path)
    obs.add_argument("--packet", required=True)
    obs.add_argument("--reported-by", required=True)
    obs.add_argument("--source-ref", required=True)
    obs.add_argument("--decision", required=True, choices=["amend", "blocked", "accepted", "rejected"])
    obs.add_argument("--summary", required=True)
    obs.add_argument("--observed-at")
    obs.set_defaults(func=record_observation)

    result = sub.add_parser("record-author-result", help="append an actual author receipt; never calls native finish")
    result.add_argument("--ledger", required=True, type=pathlib.Path)
    result.add_argument("--packet", required=True)
    result.add_argument("--receipt", required=True, type=pathlib.Path)
    result.set_defaults(func=record_author_result)

    prepare = sub.add_parser("prepare-reviews", help="create a fresh independent-review spec from six accepted receipts")
    prepare.add_argument("--ledger", required=True, type=pathlib.Path)
    prepare.add_argument("--spec-output", required=True, type=pathlib.Path)
    prepare.set_defaults(func=prepare_reviews)

    solve = sub.add_parser("solve-reviews", help="run native probe.init/solve and independently verify all six assignments")
    solve.add_argument("--ledger", required=True, type=pathlib.Path)
    solve.add_argument("--spec", required=True, type=pathlib.Path)
    solve.add_argument("--probe", required=True, type=pathlib.Path)
    solve.add_argument("--run-dir", required=True, type=pathlib.Path)
    solve.add_argument("--receipt-dir", required=True, type=pathlib.Path)
    solve.set_defaults(func=solve_reviews)

    start = sub.add_parser("ack-review-start", help="record a real reviewer start through the native probe")
    start.add_argument("--ledger", required=True, type=pathlib.Path)
    start.add_argument("--probe", required=True, type=pathlib.Path)
    start.add_argument("--worker", required=True)
    start.add_argument("--packet", required=True)
    start.add_argument("--agent", required=True)
    start.set_defaults(func=ack_review_start)

    review = sub.add_parser("record-review-result", help="record a real independent-review receipt outside native finish")
    review.add_argument("--ledger", required=True, type=pathlib.Path)
    review.add_argument("--worker", required=True)
    review.add_argument("--packet", required=True)
    review.add_argument("--receipt", required=True, type=pathlib.Path)
    review.set_defaults(func=record_review_result)
    return p


def main() -> int:
    args = parser().parse_args()
    try:
        result = args.func(args)
    except (OSError, ValueError, KeyError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f"coordination adapter: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
