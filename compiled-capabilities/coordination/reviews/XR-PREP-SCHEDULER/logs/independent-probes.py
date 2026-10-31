#!/usr/bin/env python3
"""Independent read-only probes for XR-PREP-SCHEDULER review."""
from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path("compiled-capabilities/coordination")
sys.path.insert(0, "compiled-capabilities/coordination/acceptance/scheduler")
import audit as scheduler_audit  # noqa: E402


def exhaustive_score(workers: list[str], ready: list[str], eligible: dict[str, list[str]], weights: dict[str, int]) -> int:
    """Enumerate all injective worker/job maps, independently of audit._dp_score."""
    best = 0

    def assign(index: int, assigned_jobs: set[str], score: int) -> None:
        nonlocal best
        if index == len(workers):
            best = max(best, score)
            return
        worker = workers[index]
        assign(index + 1, assigned_jobs, score)  # worker goes to BENCH
        for job in ready:
            if job not in assigned_jobs and worker in eligible.get(job, []):
                assign(index + 1, assigned_jobs | {job}, score + weights[job])

    assign(0, set(), 0)
    return best


def main() -> None:
    snapshot = scheduler_audit.load_snapshot(ROOT)
    state = snapshot.state
    workers = list(snapshot.spec.get("workers", []))
    solve_events = [event for event in state.get("events", []) if event.get("type") == "solve"]
    score_rows = []
    for event in solve_events:
        free_workers = [worker for worker in workers if worker not in event["pinned_workers"]]
        independent = exhaustive_score(free_workers, event["ready_jobs"], event["eligible"], event["weights"])
        dispatch_score = sum(event["weights"][job] for job in event["dispatch"].values())
        score_rows.append({
            "epoch": event["epoch"],
            "native_score": event["native_score"],
            "exact_score": event["exact_score"],
            "exhaustive_score": independent,
            "dispatch_score": dispatch_score,
            "all_equal": independent == event["native_score"] == event["exact_score"] == dispatch_score,
        })

    status_counts = {}
    for job in state["jobs"].values():
        status_counts[job.get("status")] = status_counts.get(job.get("status"), 0) + 1
    original_amends = []
    for review_id, review in state["jobs"].items():
        receipt = snapshot.receipts.get(review_id, {})
        if review.get("kind") != "review" or receipt.get("decision") != "amend":
            continue
        repair_ids = [jid for jid, job in state["jobs"].items() if job.get("repair_of") == review_id]
        repair_rows = []
        for repair_id in repair_ids:
            extension_index = next((i for i, event in enumerate(state["events"])
                                    if event.get("type") == "extend-after-review-amend"
                                    and repair_id in event.get("new_jobs", [])), None)
            completion_index = next((i for i, event in enumerate(state["events"])
                                     if event.get("type") == "complete" and event.get("job") == review_id), None)
            dispatch_index = next((i for i, event in enumerate(state["events"])
                                   if event.get("type") == "dispatch" and event.get("job") == repair_id), None)
            fix_review_id = "XR-FIX-" + repair_id.removeprefix("E-FIX-")
            fix_review = state["jobs"].get(fix_review_id, {})
            fix_receipt = snapshot.receipts.get(fix_review_id, {})
            repair_rows.append({
                "repair": repair_id,
                "repair_status": state["jobs"][repair_id].get("status"),
                "completion_event_index": completion_index,
                "extension_event_index": extension_index,
                "repair_dispatch_event_index": dispatch_index,
                "fix_review": fix_review_id,
                "fix_review_status": fix_review.get("status"),
                "fix_review_decision": fix_receipt.get("decision"),
            })
        original_amends.append({
            "review": review_id,
            "review_status": review.get("status"),
            "decision": receipt.get("decision"),
            "completion_event_index": next((i for i, event in enumerate(state["events"])
                                             if event.get("type") == "complete" and event.get("job") == review_id), None),
            "repairs": repair_rows,
        })

    rejected = []
    events = state["events"]
    for i, event in enumerate(events):
        if event.get("type") != "native-recommendation-rejected":
            continue
        next_solve = next((n for n in range(i + 1, len(events)) if events[n].get("type") == "solve"), len(events))
        rejected.append({
            "event_index": i,
            "reason": event.get("reason"),
            "dispatch_performed": event.get("dispatch_performed"),
            "log": event.get("log"),
            "next_accepted_epoch": events[next_solve].get("epoch") if next_solve < len(events) else None,
            "intervening_dispatches": [e for e in events[i + 1:next_solve] if e.get("type") == "dispatch"],
        })

    # Move the BUILD repair extension before its recorded review completion in
    # an in-memory snapshot. No solver or scheduler files are changed.
    mutated = scheduler_audit.clone_snapshot(snapshot)
    mutated_events = mutated.state["events"]
    extension = next(e for e in mutated_events if e.get("type") == "extend-after-review-amend"
                     and "E-FIX-BUILD" in e.get("new_jobs", []))
    completion_index = next(i for i, e in enumerate(mutated_events)
                            if e.get("type") == "complete" and e.get("job") == "XR-BUILD")
    mutated_events.remove(extension)
    mutated_events.insert(completion_index, extension)
    early_extension_result = scheduler_audit.audit(mutated)

    print(json.dumps({
        "snapshot": {
            "epoch": state.get("epoch"),
            "event_count": len(events),
            "packet_count": len(state["jobs"]),
            "status_counts": status_counts,
            "accepted_solve_count": len(solve_events),
            "native_json_count": len(snapshot.native),
            "saved_bundle_count": len(snapshot.bundles),
        },
        "capacity": snapshot.capacity,
        "actualInitialSpawns": snapshot.dispatch.get("actual_accepted_spawns"),
        "scoreCrossCheck": {"epochs": score_rows, "all_match": all(row["all_equal"] for row in score_rows)},
        "originalAmends": original_amends,
        "rejectedRecommendations": rejected,
        "earlyExtensionMutation": {
            "mutation": "move E-FIX-BUILD/XR-FIX-BUILD extension immediately before XR-BUILD completion and remove its original later event",
            "status": early_extension_result["status"],
            "errors": early_extension_result["errors"],
            "incomplete": early_extension_result["incomplete"],
        },
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
