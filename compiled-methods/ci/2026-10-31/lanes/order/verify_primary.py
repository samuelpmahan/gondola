#!/usr/bin/env python3
"""Verify current primary CI artifact provenance and retained member hashes."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any


SOURCE = "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
TREE = "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
PUSH_RUN = 41169518187
JOB_ID = 124444234335
ARTIFACT_ID = 13030848292
ARTIFACT_SIZE = 11460089
ARTIFACT_SHA = "95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a"
MEMBER_COUNT = 968
UNCOMPRESSED_MEMBER_BYTES = 79084644
ATTEMPT = "attempt-20261031T044100445Z"


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def require(ok: bool, detail: str) -> None:
    if not ok:
        raise ValueError(detail)


def safe_path(name: str) -> PurePosixPath:
    p = PurePosixPath(name)
    require(not p.is_absolute() and all(part not in ("", ".", "..") for part in p.parts),
            f"unsafe retained path: {name}")
    return p


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repo_root", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    repo = args.repo_root.resolve()
    ci = repo / "compiled-methods" / "ci" / "2026-10-31"
    attempt = ci / "extracted" / "compiled-methods" / "artifacts" / "attempts" / ATTEMPT
    metadata_path = ci / "primary-artifact-metadata.json"
    retention_path = ci / "artifact-retention.json"
    publication_path = ci / "publication-current.json"
    identity_path = ci / "lanes" / "evidence" / "head-identity-6b49cc0.json"
    zip_path = ci / "original.zip"
    snapshot_path = ci / "lanes" / "evidence" / "snapshots" / "jobs-2026-10-31T050732-682Z-6b49cc0-terminal.json"
    job_log_path = ci / "lanes" / "evidence" / "push" / "6b49cc0" / f"run-{PUSH_RUN}" / f"job-{JOB_ID}" / "job.log"

    publication = load(publication_path)
    metadata = load(metadata_path)
    retention = load(retention_path)
    identity = load(identity_path)
    execution_path = attempt / "execution.json"
    execution = load(execution_path)
    method_run_path = attempt / "matrix" / "methods.run.json"
    method_run = load(method_run_path)

    git_head = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    git_tree = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD^{tree}"], text=True).strip()
    require(publication.get("sourceCommit") == SOURCE and publication.get("sourceTree") == TREE,
            "publication source identity mismatch")
    require(publication.get("primaryPush") == PUSH_RUN, "publication primary push run mismatch")
    require(publication.get("criticalInputCount") == 137, "publication critical source pin count mismatch")
    require(git_head == SOURCE and git_tree == TREE, "worktree HEAD/tree differs from current publication")
    require(identity.get("publication", {}).get("source_commit") == SOURCE
            and identity.get("publication", {}).get("source_tree") == TREE,
            "head identity publication mismatch")
    require(identity.get("primary_runs", {}).get("push") == PUSH_RUN,
            "head identity current primary push run mismatch")
    require(metadata.get("id") == ARTIFACT_ID and metadata.get("size_in_bytes") == ARTIFACT_SIZE,
            "provider artifact metadata ID/size mismatch")
    require(metadata.get("digest") == f"sha256:{ARTIFACT_SHA}", "provider artifact digest mismatch")
    workflow = metadata.get("workflow_run") or {}
    require(workflow.get("id") == PUSH_RUN and workflow.get("head_sha") == SOURCE,
            "provider artifact workflow run/head mismatch")
    require(retention.get("source") == SOURCE and retention.get("sourceTree") == TREE,
            "retention source identity mismatch")
    require(retention.get("run") == PUSH_RUN and retention.get("job") == JOB_ID
            and retention.get("artifactId") == ARTIFACT_ID and retention.get("workflowOutcome") == "success",
            "retention workflow/job/artifact outcome mismatch")
    require(retention.get("providerZipBytes") == ARTIFACT_SIZE
            and retention.get("providerZipSha256") == ARTIFACT_SHA
            and retention.get("completeProviderZipRetainedInGitChunks") is True,
            "retention provider ZIP identity mismatch")

    require(zip_path.stat().st_size == ARTIFACT_SIZE and sha_file(zip_path) == ARTIFACT_SHA,
            "retained ZIP size or digest mismatch")
    chunks = retention.get("chunks") or []
    require(len(chunks) == 3, f"expected three retained ZIP chunks, got {len(chunks)}")
    joined = bytearray()
    chunk_results = []
    for chunk in chunks:
        p = ci / chunk["path"]
        data = p.read_bytes()
        digest = sha_bytes(data)
        require(len(data) == chunk.get("bytes") and digest == chunk.get("sha256"),
                f"retained chunk mismatch: {chunk['path']}")
        joined.extend(data)
        chunk_results.append({"path": chunk["path"], "bytes": len(data), "sha256": digest})
    require(len(joined) == ARTIFACT_SIZE and sha_bytes(joined) == ARTIFACT_SHA,
            "concatenated retained chunks do not reconstruct provider ZIP")
    require(bytes(joined) == zip_path.read_bytes(), "retained chunks differ from reconstructed ZIP")

    members = retention.get("members") or []
    member_by_path = {m["path"]: m for m in members}
    require(len(members) == MEMBER_COUNT and len(member_by_path) == len(members),
            f"retention member count/uniqueness mismatch: {len(members)}")
    uncompressed_bytes = sum(int(member.get("bytes", -1)) for member in members)
    require(uncompressed_bytes == UNCOMPRESSED_MEMBER_BYTES,
            f"retention uncompressed byte total mismatch: {uncompressed_bytes}")
    member_hash_errors = []
    extracted_matches = 0
    with zipfile.ZipFile(zip_path) as zf:
        zip_names = [info.filename for info in zf.infolist()]
        require(len(zip_names) == MEMBER_COUNT and len(set(zip_names)) == MEMBER_COUNT,
                "ZIP member count/uniqueness mismatch")
        require(set(zip_names) == set(member_by_path), "ZIP member names differ from retention manifest")
        require(zf.testzip() is None, "ZIP CRC check failed")
        for info in zf.infolist():
            rel = safe_path(info.filename)
            expected = member_by_path[info.filename]
            payload = zf.read(info)
            actual_size = len(payload)
            actual_sha = sha_bytes(payload)
            extracted_path = ci / "extracted" / Path(*rel.parts)
            extracted_ok = extracted_path.is_file() and extracted_path.stat().st_size == actual_size
            if extracted_ok:
                extracted_ok = sha_file(extracted_path) == actual_sha
            if (actual_size != expected.get("bytes") or actual_sha != expected.get("sha256") or not extracted_ok):
                member_hash_errors.append(info.filename)
            else:
                extracted_matches += 1
    require(not member_hash_errors, f"ZIP/extraction member checks failed: {member_hash_errors[:5]}")

    run_snapshot = load(snapshot_path)
    matching_run = next((r for r in run_snapshot.get("runs", []) if r.get("run_id") == PUSH_RUN), None)
    require(matching_run is not None, "terminal workflow snapshot lacks primary push run")
    job = next((j for j in matching_run.get("structuredContent", {}).get("jobs", [])
                if j.get("id") == JOB_ID), None)
    require(job is not None and job.get("name") == "compiled-methods"
            and job.get("status") == "completed" and job.get("conclusion") == "success",
            "terminal workflow job is not successful")
    steps = job.get("steps") or []
    require(all(s.get("status") == "completed" and s.get("conclusion") == "success"
                for s in steps), "one or more primary job steps did not succeed")
    job_log = job_log_path.read_text(encoding="utf-8")
    require("compiled-methods: passed (full)" in job_log, "full compiled-methods success marker missing from job log")
    require(ARTIFACT_SHA in job_log and str(ARTIFACT_ID) in job_log, "uploaded artifact digest/ID missing from job log")

    require(execution.get("status") == "passed" and execution.get("mode") == "full"
            and execution.get("sourcePinsMatch") is True, "attempt execution is not full/passed/source-stable")
    require(execution.get("methodMatrix", {}).get("status") == "matched"
            and execution.get("methodMatrix", {}).get("checks", {}).get("status") == "matched",
            "attempt method matrix is not matched")
    source_before = execution.get("sourceBefore") or []
    source_after = execution.get("sourceAfter") or []
    require(len(source_before) == 137 and source_before == source_after,
            "attempt source pin count/stability mismatch")
    source_pin_errors = []
    for pin in source_before:
        p = repo / pin["path"]
        if not p.is_file() or sha_file(p) != pin.get("sha256"):
            source_pin_errors.append(pin["path"])
    require(not source_pin_errors, f"source pin hashes differ from current worktree: {source_pin_errors[:5]}")

    result = {
        "schema": "gobi.ci-primary-provenance-audit/v1",
        "status": "passed",
        "source": {"commit": SOURCE, "tree": TREE, "gitHead": git_head, "gitTree": git_tree},
        "workflow": {"runId": PUSH_RUN, "jobId": JOB_ID, "jobName": job["name"],
                     "status": job["status"], "conclusion": job["conclusion"],
                     "successfulStepCount": len(steps)},
        "artifact": {"id": ARTIFACT_ID, "bytes": ARTIFACT_SIZE, "sha256": ARTIFACT_SHA,
                     "memberCount": len(members), "uncompressedMemberBytes": uncompressed_bytes,
                     "zipCRC": "passed",
                     "chunkCount": len(chunks), "chunkHashesVerified": len(chunk_results),
                     "retentionMemberHashesVerified": len(members),
                     "extractedMemberHashesVerified": extracted_matches,
                     "chunkDetails": chunk_results},
        "attempt": {"id": ATTEMPT, "executionStatus": execution.get("status"),
                    "mode": execution.get("mode"), "sourcePinCount": len(source_before),
                    "sourcePinsStable": execution.get("sourcePinsMatch"),
                    "sourcePinHashesMatchCurrentWorktree": True,
                    "methodMatrixStatus": execution.get("methodMatrix", {}).get("status"),
                    "versions": {"execution": execution.get("versions"), "matrix": method_run.get("versions")}},
        "inputs": {
            "publication": {"path": str(publication_path.relative_to(repo)), "sha256": sha_file(publication_path)},
            "providerMetadata": {"path": str(metadata_path.relative_to(repo)), "sha256": sha_file(metadata_path)},
            "artifactRetention": {"path": str(retention_path.relative_to(repo)), "sha256": sha_file(retention_path)},
            "workflowSnapshot": {"path": str(snapshot_path.relative_to(repo)), "sha256": sha_file(snapshot_path)},
            "jobLog": {"path": str(job_log_path.relative_to(repo)), "sha256": sha_file(job_log_path)},
            "execution": {"path": str(execution_path.relative_to(repo)), "sha256": sha_file(execution_path)},
            "methodsRun": {"path": str(method_run_path.relative_to(repo)), "sha256": sha_file(method_run_path)},
            "providerZip": {"path": str(zip_path.relative_to(repo)), "sha256": sha_file(zip_path)},
        },
    }
    encoded = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"schema": "gobi.ci-primary-provenance-audit/v1", "status": "failed",
                          "error": f"{type(exc).__name__}: {exc}"}, indent=2), file=sys.stderr)
        raise SystemExit(1)
