"""Independent, read-only audit of recorded allocation and acceptance custody."""
import argparse
import hashlib
import json
from pathlib import Path


def audit(root):
    state = json.loads((root / "state.json").read_text())
    capacity = json.loads((root / "capacity.json").read_text())
    dispatch = json.loads((root / "dispatch.json").read_text())
    errors = []
    def check(condition, message):
        if not condition:
            errors.append(message)
    check(hashlib.sha256((root / "probe.py").read_bytes()).hexdigest() == capacity["probe_sha256"], "probe hash")
    check(len(state["workers"]) == capacity["available_workers"] == 6, "worker capacity")
    actual = dispatch["actual_accepted_spawns"]
    check(len(actual) == capacity["actually_accepted_spawns"] == 6, "actual accepted spawn count")
    check(len({x["agent"] for x in actual}) == 6, "distinct actual agents")
    check(all(x["model"] == "gpt-6-luna" and x["reasoning_effort"] == "xhigh" for x in actual), "requested model/effort")
    active = {w: None for w in state["workers"]}
    completed = {}
    last = None
    epochs = 0
    for event in state["events"]:
        kind = event["type"]
        if kind == "solve":
            last = event
            epochs += 1
            check(event["native_constraints"]["brokenCount"] == 0 and event["native_constraints"]["brokenVal"] == 0, "broken native constraints")
            check(event["native_score"] == event["exact_score"], "native score differs from independent optimum")
            free = [w for w, packet in active.items() if packet is None]
            scores = {0: 0}
            for packet in event["ready_jobs"]:
                next_scores = dict(scores)
                for mask, score in scores.items():
                    for index, worker in enumerate(free):
                        bit = 1 << index
                        if mask & bit == 0 and worker in event["eligible"].get(packet, []):
                            next_scores[mask | bit] = max(next_scores.get(mask | bit, 0), score + event["weights"][packet])
                scores = next_scores
            independently_optimal = max(scores.values())
            check(event["native_score"] == independently_optimal, "recomputed matching optimum differs")
            check(sum(event["weights"][p] for p in event["dispatch"].values()) == independently_optimal, "dispatch score differs from optimum")
            counts = {}
            for worker, job in event["assignments"].items():
                counts[job] = counts.get(job, 0) + 1
                if active.get(worker):
                    check(job == active[worker], "in-flight packet moved")
            check(all(n <= event["caps"].get(j, -1) for j, n in counts.items()), "epoch capacity")
            for worker, job in event["dispatch"].items():
                check(worker in event["eligible"].get(job, []), "ineligible recommendation")
            saved = json.loads((root / "native" / f"epoch-{event['epoch']:02}.json").read_text())
            check({k:v for k,v in event.items() if k != "type"} == saved, "persisted epoch mismatch")
        elif kind == "dispatch":
            worker, job = event["worker"], event["job"]
            check(last is not None and last["dispatch"].get(worker) == job, "dispatch lacks matching native recommendation")
            check(active.get(worker) is None, "worker double assignment")
            definition = state["jobs"][job]
            check(worker in definition.get("allow_workers", state["workers"]), "outside explicit ownership")
            if definition["kind"] == "review":
                dep = definition["depends_on"]
                check(dep in completed, "review before author completion")
                check(completed.get(dep) != worker, "self review")
            active[worker] = job
        elif kind == "complete":
            worker, job = event["worker"], event["job"]
            check(active.get(worker) == job, "completion mismatches assignment")
            completed[job] = worker
            active[worker] = None
    check(all(v is None for v in active.values()), "active assignments remain")
    check(set(completed) == set(state["jobs"]), "unclosed packets remain")
    receipts = {}
    for job, definition in state["jobs"].items():
        check(definition["status"] == "done", f"packet unfinished: {job}")
        path = root / "receipts" / f"{job}.json"
        if not path.exists():
            errors.append(f"missing receipt: {job}")
            continue
        data = json.loads(path.read_text())
        check(data.get("job_id") == job and data.get("worker") == completed.get(job), f"receipt identity: {job}")
        check(bool(data.get("summary", "").strip()), f"receipt summary: {job}")
        if definition["kind"] == "extract":
            check(data.get("outcome") in {"confirmed_reuse", "mixed_change", "not_reuse", "insufficient_evidence"}, f"receipt extraction outcome: {job}")
        else:
            check(data.get("decision") in {"accepted", "amend", "rejected"}, f"receipt review decision: {job}")
        receipts[job] = {"sha256":hashlib.sha256(path.read_bytes()).hexdigest(), "worker":data.get("worker"), "decision":data.get("decision"), "outcome":data.get("outcome")}
    def resolved_review(job, ancestors):
        if job in ancestors:
            return False
        if receipts.get(job, {}).get("decision") == "accepted":
            return True
        repairs = [j for j, d in state["jobs"].items() if d.get("repair_of") == job]
        if not repairs:
            return False
        for fix in repairs:
            reviews = [j for j, d in state["jobs"].items()
                       if d.get("kind") == "review" and d.get("depends_on") == fix]
            if not any(resolved_review(review, ancestors | {job}) for review in reviews):
                return False
        return True

    resolution = {}
    for job, definition in state["jobs"].items():
        if definition["kind"] == "review":
            resolved = resolved_review(job, set())
            resolution[job] = {"decision": receipts.get(job, {}).get("decision"), "resolved": resolved,
                               "repair_jobs": [j for j, d in state["jobs"].items() if d.get("repair_of") == job]}
            check(resolved, f"unrepaired review or repair cycle: {job}")
    return {"schema":"gobi.compiled-children-allocation-audit/v1", "status":"passed" if not errors else "failed", "workers":len(actual), "packets":len(completed), "epochs":epochs, "receipts":receipts, "review_resolution":resolution, "errors":errors}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).parent)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = audit(args.root)
    serialized = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(serialized)
    print(serialized)
    raise SystemExit(0 if result["status"] == "passed" else 1)
