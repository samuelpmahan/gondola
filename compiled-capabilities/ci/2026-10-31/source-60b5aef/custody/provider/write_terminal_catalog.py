#!/usr/bin/env python3
"""Build an exclusive, fsynced source-run/job catalog from preserved API bodies."""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import os


REPO = Path(__file__).resolve().parents[6]
BASE = Path(__file__).resolve().parent
JOBS = BASE / "jobs"
SOURCE = {
    "commit": "60b5aeff3172837ad7831c2b78b210454a3d81a2",
    "tree": "cc3a129b4372d00d5168135aa2e5687dfbf6788f",
    "parent": "a2e1164d68abaaa7d028bdaf6a20bea842a131ae",
    "pullRequest": 15,
    "syntheticMerge": "07fc827212889af17524eadfe8c5c9da75d26850",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--run-list", required=True, help="repository-relative or absolute path to the preserved raw workflow-runs JSON")
    parser.add_argument("--retrieved-at", required=True, help="UTC timestamp for the run-list response")
    parser.add_argument("--output", required=True, help="new exclusive repository-relative output path")
    args = parser.parse_args()

    run_path = Path(args.run_list)
    if not run_path.is_absolute():
        run_path = REPO / run_path
    raw = run_path.read_bytes()
    response = json.loads(raw)
    if response.get("total_count") != 30 or len(response.get("workflow_runs", [])) != 30:
        raise ValueError("expected exactly 30 source-bound runs")
    run_records = []
    event_counts = Counter()
    run_status_counts = Counter()
    job_status_counts = Counter()
    job_total = 0
    all_heads_match = True
    all_jobs_success = True

    for run in response["workflow_runs"]:
        run_id = run["id"]
        head_sha = run.get("head_sha")
        all_heads_match &= head_sha == SOURCE["commit"]
        event_counts[run.get("event")] += 1
        run_status_counts[f"{run.get('status')}:{run.get('conclusion')}"] += 1
        candidates = sorted(JOBS.glob(f"run-{run_id}-jobs-*.raw.json"))
        if not candidates:
            raise ValueError(f"no preserved raw jobs response for run {run_id}")
        job_path = candidates[-1]
        job_bytes = job_path.read_bytes()
        job_response = json.loads(job_bytes)
        jobs = job_response.get("jobs", [])
        if not jobs:
            raise ValueError(f"empty jobs response for run {run_id}")
        job_total += len(jobs)
        job_summaries = []
        for job in jobs:
            job_status_counts[f"{job.get('status')}:{job.get('conclusion')}"] += 1
            all_jobs_success &= job.get("status") == "completed" and job.get("conclusion") == "success"
            job_summaries.append({
                "id": job.get("id"),
                "runId": job.get("run_id"),
                "name": job.get("name"),
                "status": job.get("status"),
                "conclusion": job.get("conclusion"),
                "startedAt": job.get("started_at"),
                "completedAt": job.get("completed_at"),
                "steps": [{"name": step.get("name"), "number": step.get("number"), "status": step.get("status"), "conclusion": step.get("conclusion")} for step in job.get("steps", [])],
            })
        run_records.append({
            "id": run_id,
            "name": run.get("name"),
            "event": run.get("event"),
            "status": run.get("status"),
            "conclusion": run.get("conclusion"),
            "headSha": head_sha,
            "headBranch": run.get("head_branch"),
            "createdAt": run.get("created_at"),
            "runStartedAt": run.get("run_started_at"),
            "updatedAt": run.get("updated_at"),
            "runNumber": run.get("run_number"),
            "runAttempt": run.get("run_attempt"),
            "workflowId": run.get("workflow_id"),
            "pullRequests": run.get("pull_requests", []),
            "jobSnapshot": {
                "retrievedAtFromFilename": job_path.name.split("-jobs-")[-1].removesuffix(".raw.json"),
                "path": job_path.relative_to(REPO).as_posix(),
                "bytes": len(job_bytes),
                "sha256": sha256(job_bytes),
                "jobCount": len(jobs),
                "jobs": job_summaries,
            },
        })

    all_terminal = all(run["status"] == "completed" for run in run_records)
    success = all_terminal and all(run["conclusion"] == "success" for run in run_records) and all_jobs_success and all_heads_match
    run_rel = run_path.relative_to(REPO).as_posix()
    catalog = {
        "schema": "gobi.compiled-capabilities-terminal-provider-catalog/v1",
        "repository": "samuelpmahan/gondola",
        "retrievedAt": args.retrieved_at,
        "source": SOURCE,
        "runListResponse": {"path": run_rel, "bytes": len(raw), "sha256": sha256(raw)},
        "runCount": len(run_records),
        "jobCount": job_total,
        "eventCounts": dict(sorted(event_counts.items())),
        "runStatusCounts": dict(sorted(run_status_counts.items())),
        "jobStatusCounts": dict(sorted(job_status_counts.items())),
        "allRunHeadShasMatchSource": all_heads_match,
        "allRunsTerminal": all_terminal,
        "allRunsConcludedSuccess": all(run["status"] == "completed" and run["conclusion"] == "success" for run in run_records),
        "allJobsConcludedSuccess": all_jobs_success,
        "sourceCohortGreen": success,
        "runs": run_records,
    }
    output = Path(args.output)
    if not output.is_absolute():
        output = REPO / output
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(catalog, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())

    written = output.read_bytes()
    reparsed = json.loads(written)
    if reparsed != catalog:
        raise ValueError("same-process parseback differs from serialized catalog")
    print(json.dumps({"path": output.relative_to(REPO).as_posix(), "bytes": len(written), "sha256": sha256(written), "runCount": len(run_records), "jobCount": job_total, "eventCounts": dict(event_counts), "runStatusCounts": dict(run_status_counts), "jobStatusCounts": dict(job_status_counts), "allRunHeadShasMatchSource": all_heads_match, "allRunsTerminal": all_terminal, "sourceCohortGreen": success}, sort_keys=True))


if __name__ == "__main__":
    main()
