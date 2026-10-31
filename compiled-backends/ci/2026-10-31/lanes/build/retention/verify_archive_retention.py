#!/usr/bin/env python3
"""Verify provider ZIP and retained-copy availability/hashes without rerunning CI."""
from __future__ import annotations

import hashlib
import json
import subprocess
import tarfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
REPO = ROOT.parents[2]
OUT = Path(__file__).resolve().parent / "archive-retention-audit.json"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"bytes": len(data), "sha256": digest(data)}


def main() -> None:
    provenance = json.loads((ROOT / "primary-provenance.json").read_text())
    provider = json.loads((ROOT / "artifact.json").read_text())["artifacts"][0]
    retained = json.loads((ROOT / "retained-index.json").read_text())
    retention = json.loads((ROOT / "retention.json").read_text())
    final_report = ROOT / "coordination/reports/R-CI-BUILD-FINAL.md"
    final_receipt = ROOT / "coordination/receipts/R-CI-BUILD-FINAL.json"
    final_audit = ROOT / "lanes/build/final/artifact-audit.json"
    xr_report = ROOT / "coordination/reports/XR-R-CI-BUILD-FINAL.md"
    xr_receipt = ROOT / "coordination/receipts/XR-R-CI-BUILD-FINAL.json"

    index = {entry["path"]: entry for entry in retained}
    issues = []
    zip_path = ROOT / "original.zip"
    tar_path = ROOT / "ci-artifacts.tar.xz"
    zip_pin = pin(zip_path)
    tar_pin = pin(tar_path)

    with zipfile.ZipFile(zip_path) as archive:
        zip_names = [name for name in archive.namelist() if not name.endswith("/")]
        zip_member_hash_mismatches = []
        for name in zip_names:
            data = archive.read(name)
            expected = index.get(name)
            if expected is None or len(data) != expected["bytes"] or digest(data) != expected["sha256"]:
                zip_member_hash_mismatches.append(name)
            extracted = ROOT / "extracted" / name
            if not extracted.is_file() or extracted.read_bytes() != data:
                issues.append(f"ZIP/extracted bytes differ or absent: {name}")

    tar_names = []
    tar_member_bytes = 0
    tar_member_mismatches = []
    with tarfile.open(tar_path, "r:xz") as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            tar_names.append(member.name)
            stream = archive.extractfile(member)
            data = stream.read() if stream else b""
            tar_member_bytes += len(data)
            expected = index.get(member.name)
            if expected is None or len(data) != expected["bytes"] or digest(data) != expected["sha256"]:
                tar_member_mismatches.append(member.name)

    zip_paths_equal = len(zip_names) == len(index) == 817 and set(zip_names) == set(index)
    tar_paths_equal = len(tar_names) == len(index) == 817 and set(tar_names) == set(index)
    if not zip_paths_equal:
        issues.append("provider ZIP paths do not exactly match the 817-entry retained index")
    if not tar_paths_equal:
        issues.append("readable tar paths do not exactly match the 817-entry retained index")
    if zip_member_hash_mismatches:
        issues.append("provider ZIP member content differs from retained index")
    if tar_member_mismatches:
        issues.append("readable tar member content differs from retained index")

    ignored = subprocess.run(
        ["git", "check-ignore", "-v", "--", "compiled-backends/ci/2026-10-31/original.zip"],
        cwd=REPO, text=True, capture_output=True, check=False,
    )
    tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", "--",
         "compiled-backends/ci/2026-10-31/original.zip",
         "compiled-backends/ci/2026-10-31/ci-artifacts.tar.xz"],
        cwd=REPO, text=True, capture_output=True, check=False,
    )
    original_is_ignored = ignored.returncode == 0
    tracked_paths = [line for line in tracked.stdout.splitlines() if line]
    # The tar is deliberately described as a readable worktree copy; current
    # Git status is recorded separately and is not conflated with existence.
    tar_status = subprocess.run(
        ["git", "status", "--short", "--untracked-files=all", "--",
         "compiled-backends/ci/2026-10-31/ci-artifacts.tar.xz"],
        cwd=REPO, text=True, capture_output=True, check=False,
    )

    provider_sha = "sha256:" + zip_pin["sha256"]
    archive_metadata_matches = (
        zip_pin["bytes"] == provenance["artifactZipBytes"] == provider["size_in_bytes"]
        and zip_pin["sha256"] == provenance["artifactZipSha256"]
        and provider.get("digest") == provider_sha
        and provider["id"] == provenance["artifact"]
        and provenance["run"] == provider["workflow_run"]["id"]
        and provenance["sourceHead"] == provider["workflow_run"]["head_sha"]
    )
    tar_metadata_matches = (
        tar_pin["bytes"] == retention["archiveBytes"]
        and tar_pin["sha256"] == retention["archiveSha256"]
        and retention["providerZipBytes"] == zip_pin["bytes"]
        and retention["providerZipSha256"] == zip_pin["sha256"]
        and retention["providerMembers"] == retention["retainedMembers"] == 817
    )
    index_byte_total = sum(entry["bytes"] for entry in retained)
    okay = (
        not issues and not zip_member_hash_mismatches and not tar_member_mismatches
        and archive_metadata_matches and tar_metadata_matches
        and len(retained) == 817 and len(index) == 817
        and index_byte_total == tar_member_bytes == retention["retainedBytes"] == 87153279
        and original_is_ignored and not tracked_paths
        and "ci-artifacts.tar.xz" in tar_status.stdout
    )

    result = {
        "schema": "gobi.archive-retention-audit/v1",
        "status": "passed" if okay else "failed",
        "primary": {
            "run": provenance["run"], "job": provenance["job"], "artifact": provenance["artifact"],
            "sourceHead": provenance["sourceHead"], "event": provenance["event"],
        },
        "providerZip": {
            "path": "compiled-backends/ci/2026-10-31/original.zip", **zip_pin,
            "matchesPrimaryProvenanceAndProviderMetadata": archive_metadata_matches,
            "availableAtReviewTime": True, "gitIgnored": original_is_ignored,
            "gitCheckIgnoreRecord": ignored.stdout.strip(), "trackedByGit": False,
            "members": len(zip_names), "memberPathsMatchRetainedIndex": zip_paths_equal,
            "memberMismatches": zip_member_hash_mismatches,
        },
        "readableTarCopy": {
            "path": "compiled-backends/ci/2026-10-31/ci-artifacts.tar.xz", **tar_pin,
            "matchesRetentionManifest": tar_metadata_matches,
            "availableAtReviewTime": True,
            "gitIgnored": False, "gitTracked": bool(tracked_paths),
            "gitStatus": tar_status.stdout.strip(),
            "members": len(tar_names), "memberPathsMatchRetainedIndex": tar_paths_equal,
            "verifiedMemberBytes": tar_member_bytes, "memberMismatches": tar_member_mismatches,
        },
        "retainedIndex": {
            "path": "compiled-backends/ci/2026-10-31/retained-index.json",
            "entries": len(retained), "uniquePaths": len(index),
            "totalMemberBytes": index_byte_total,
            "sha256": digest((ROOT / "retained-index.json").read_bytes()),
        },
        "extractedFiles": {
            "allFilesMatchZipBytes": not issues,
            "mismatches": issues,
        },
        "preservedConsumedPacketPins": {
            "R-CI-BUILD-FINAL-report": {"path": "compiled-backends/ci/2026-10-31/coordination/reports/R-CI-BUILD-FINAL.md", **pin(final_report)},
            "R-CI-BUILD-FINAL-receipt": {"path": "compiled-backends/ci/2026-10-31/coordination/receipts/R-CI-BUILD-FINAL.json", **pin(final_receipt)},
            "R-CI-BUILD-FINAL-artifact-audit": {"path": "compiled-backends/ci/2026-10-31/lanes/build/final/artifact-audit.json", **pin(final_audit)},
            "XR-R-CI-BUILD-FINAL-report": {"path": "compiled-backends/ci/2026-10-31/coordination/reports/XR-R-CI-BUILD-FINAL.md", **pin(xr_report)},
            "XR-R-CI-BUILD-FINAL-receipt": {"path": "compiled-backends/ci/2026-10-31/coordination/receipts/XR-R-CI-BUILD-FINAL.json", **pin(xr_receipt)},
        },
        "oldContraryStatement": {
            "reportLines": [8, 69],
            "statement": "The provider ZIP was not separately retained/available locally for rehashing.",
            "artifactAuditField": "primaryCi.providerArchiveMetadata.note",
            "correction": "The ZIP is present and hash-verified in this evidence worktree, but is Git-ignored; current availability is distinct from Git retention.",
        },
        "limits": [
            "This is a metadata/retention clarification only; no source, CI, build output, or test result was changed or rerun.",
            "The ZIP is a current local audit input and is Git-ignored; it is not a tracked Git-retained artifact.",
            "The readable tar copy is available and all 817 member bytes verify against the index; current Git status is recorded explicitly rather than described as tracked persistence.",
            "This audit does not reconstruct or claim byte identity between the provider ZIP container and the tar container; it verifies ZIP metadata/member contents and tar member contents independently against the retained index.",
            "No CI status beyond the already reviewed primary successful full push run is inferred."
        ],
        "failures": [] if okay else issues + zip_member_hash_mismatches + tar_member_mismatches + ["metadata or retention invariants failed"],
    }
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"status": result["status"], "zip": zip_pin, "tar": tar_pin,
                      "zipMembers": len(zip_names), "tarMembers": len(tar_names),
                      "memberBytes": tar_member_bytes, "gitIgnoredZip": original_is_ignored,
                      "trackedPaths": tracked_paths, "tarGitStatus": tar_status.stdout.strip(),
                      "failures": result["failures"], "output": str(OUT)}, indent=2))
    if not okay:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
