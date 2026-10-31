#!/usr/bin/env python3
"""Check native packet identities and independence; this does not accept code."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
state = json.loads((root / "state.json").read_text())
errors = []
receipts = []
assert set(state["workers"]) == {f"N{i}" for i in range(1, 6)}
active = {}
for worker, record in state["workers"].items():
    if record["job"] is None:
        continue
    job = state["jobs"][record["job"]]
    if job["status"] != "running" or job["worker"] != worker or record["job"] in active:
        errors.append(f"invalid active assignment: {worker}")
    active[record["job"]] = worker
for job_id, job in state["jobs"].items():
    if job["status"] != "done":
        continue
    path = root / "receipts" / f"{job_id}.json"
    try:
        data = path.read_bytes()
        receipt = json.loads(data)
        if receipt.get("job_id") != job_id or receipt.get("worker") != job["worker"]:
            errors.append(f"receipt identity differs: {job_id}")
        if not isinstance(receipt.get("summary"), str) or not receipt["summary"].strip():
            errors.append(f"missing receipt summary: {job_id}")
        if job["kind"] == "review":
            if receipt.get("decision") not in {"accepted", "amend", "rejected"}:
                errors.append(f"invalid review decision: {job_id}")
            if state["jobs"][job["depends_on"]]["worker"] == job["worker"]:
                errors.append(f"self-review: {job_id}")
        elif receipt.get("outcome") not in {"confirmed_reuse", "mixed_change", "not_reuse", "insufficient_evidence"}:
            errors.append(f"invalid extraction outcome: {job_id}")
        receipts.append({"job": job_id, "worker": job["worker"], "kind": job["kind"], "sha256": hashlib.sha256(data).hexdigest(), "outcome": receipt.get("decision", receipt.get("outcome"))})
    except (OSError, ValueError) as error:
        errors.append(f"unreadable receipt {job_id}: {error}")
result = {"schema": "gobi.coordination-check/v1", "status": "passed" if not errors else "failed", "workers": len(state["workers"]), "active": active, "completed": len(receipts), "totalJobs": len(state["jobs"]), "errors": errors, "receipts": receipts, "limits": "Identity/schema/independence only; amended reviews and insufficient evidence remain such. This is not code acceptance or platform dispatch."}
print(json.dumps(result, indent=2))
raise SystemExit(bool(errors))
