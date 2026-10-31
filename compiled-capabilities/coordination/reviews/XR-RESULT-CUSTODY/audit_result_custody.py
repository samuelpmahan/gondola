#!/usr/bin/env python3
"""Read-only, bounded audit of the closed E-RESULT-CUSTODY evidence."""
from __future__ import annotations

import hashlib
import json
import gzip
import tarfile
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[4]
CAP = ROOT / "compiled-capabilities"
PROVIDER = CAP / "ci/2026-10-31/provider"
EXTRACTED = PROVIDER / "primary-push-run-41190743932-extracted"
ATTEMPT_REL = "compiled-capabilities/builds/attempts/attempt-20261031T095741037Z"
ATTEMPT = ROOT / ATTEMPT_REL


def require(ok: bool, message: str):
    if not ok:
        raise AssertionError(message)


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> tuple[int, str]:
    data = path.read_bytes()
    return len(data), sha_bytes(data)


def load(path: Path):
    return json.loads(path.read_text())


author_report_rel = "compiled-capabilities/coordination/reports/E-RESULT-CUSTODY.md"
author_receipt_rel = "compiled-capabilities/coordination/receipts/E-RESULT-CUSTODY.json"
author_report = ROOT / author_report_rel
author_receipt = load(ROOT / author_receipt_rel)
artifact_metadata_rel = author_receipt["hostedCI"]["providerArtifact"]["metadataPath"]
artifact_metadata = load(ROOT / artifact_metadata_rel)
zip_rel = author_receipt["hostedCI"]["providerArtifact"]["savedZipPath"]
zip_path = ROOT / zip_rel
member_catalog_rel = author_receipt["hostedCI"]["providerArtifact"]["zipVerification"]["inventoryPath"]
member_catalog = load(ROOT / member_catalog_rel)

# Recompute every immutable path/hash pair asserted in the E-RESULT receipt,
# omitting only the receipt/report self-reference that cannot be self-hashed.
refs: dict[str, str] = {
    author_report_rel: author_receipt["report"]["sha256"],
    author_receipt["hostedCI"]["runCatalog"]["catalogPath"]: author_receipt["hostedCI"]["runCatalog"]["catalogSha256"],
    author_receipt["hostedCI"]["runCatalog"]["rawApiPath"]: author_receipt["hostedCI"]["runCatalog"]["rawApiSha256"],
    author_receipt["hostedCI"]["runCatalog"]["firstMalformedCatalog"]["path"]: author_receipt["hostedCI"]["runCatalog"]["firstMalformedCatalog"]["sha256"],
    author_receipt["hostedCI"]["primaryPushRun"]["jobLogPath"]: author_receipt["hostedCI"]["primaryPushRun"]["jobLogSha256"],
    artifact_metadata_rel: author_receipt["hostedCI"]["providerArtifact"]["metadataSha256"],
    zip_rel: author_receipt["hostedCI"]["providerArtifact"]["savedZipSha256"],
    member_catalog_rel: author_receipt["hostedCI"]["providerArtifact"]["zipVerification"]["inventorySha256"],
    author_receipt["hostedCI"]["providerArtifact"]["zipVerification"]["verificationLogPath"]: author_receipt["hostedCI"]["providerArtifact"]["zipVerification"]["verificationLogSha256"],
    author_receipt["hostedCI"]["providerArtifact"]["zipVerification"]["verifierPath"]: author_receipt["hostedCI"]["providerArtifact"]["zipVerification"]["verifierSha256"],
    author_receipt["embeddedBuild"]["canonicalReceiptPath"]: author_receipt["embeddedBuild"]["receiptSha256"],
    author_receipt["embeddedBuild"]["preArchiveSnapshot"]["path"]: author_receipt["embeddedBuild"]["preArchiveSnapshot"]["sha256"],
    author_receipt["embeddedBuild"]["archiveManifest"]["path"]: author_receipt["embeddedBuild"]["archiveManifest"]["sha256"],
    author_receipt["embeddedBuild"]["innerArchive"]["path"]: author_receipt["embeddedBuild"]["innerArchive"]["sha256"],
    author_receipt["embeddedBuild"]["verificationSummaryPath"]: author_receipt["embeddedBuild"]["verificationSummarySha256"],
    author_receipt["embeddedBuild"]["finalInnerVerifier"]["path"]: author_receipt["embeddedBuild"]["finalInnerVerifier"]["sha256"],
    author_receipt["embeddedBuild"]["finalInnerVerifier"]["stdoutPath"]: author_receipt["embeddedBuild"]["finalInnerVerifier"]["stdoutSha256"],
    author_receipt["embeddedBuild"]["finalInnerVerifier"]["stderrPath"]: author_receipt["embeddedBuild"]["finalInnerVerifier"]["stderrSha256"],
}
for item in author_receipt["embeddedBuild"]["preservedVerifierFailures"]:
    refs[item["path"]] = item["sha256"]
for item in [
    author_receipt["hostedCI"]["primaryPrRun"]["runSnapshotPath"],
    author_receipt["hostedCI"]["primaryPrRun"]["jobsSnapshotPath"],
]:
    # The matching SHA is stored on the containing row.
    pass
refs[author_receipt["hostedCI"]["primaryPrRun"]["runSnapshotPath"]] = author_receipt["hostedCI"]["primaryPrRun"]["runSnapshotSha256"]
refs[author_receipt["hostedCI"]["primaryPrRun"]["jobsSnapshotPath"]] = author_receipt["hostedCI"]["primaryPrRun"]["jobsSnapshotSha256"]

hash_rows = []
for rel, expected in refs.items():
    size, actual = sha_file(ROOT / rel)
    require(actual == expected, f"cited hash mismatch: {rel}: {actual} != {expected}")
    hash_rows.append({"path": rel, "bytes": size, "sha256": actual, "matches": True})

require(author_receipt["outcome"] == "insufficient_evidence", "author packet outcome changed")
require(author_receipt["status"] == "failed_cohort_preserved", "author packet status changed")
require(author_receipt["sourceIdentity"]["commit"] == "a2e1164d68abaaa7d028bdaf6a20bea842a131ae", "wrong source cohort")
require(author_receipt["sourceIdentity"]["tree"] == artifact_metadata["workflowRun"]["tree"], "artifact tree mismatch")
catalog = load(ROOT / author_receipt["hostedCI"]["runCatalog"]["catalogPath"])
require(len(catalog["runs"]) == 30 and catalog["counts"]["jobs"] == 30, "catalog run/job count mismatch")
require(catalog["counts"]["push"] == 15 and catalog["counts"]["pull_request"] == 15, "catalog event counts mismatch")
require(catalog["counts"]["runs_by_status"] == {"completed": 11, "in_progress": 19}, "catalog status counts mismatch")
require(all(row["head_sha"] == author_receipt["sourceIdentity"]["commit"] for row in catalog["runs"]), "catalog contains a mismatched source head")

# The provider metadata digest and length are independently recomputed from the
# one retained ZIP. Read its canonical receipt member and compare the catalog,
# extraction, and exact bytes, without redownloading the provider artifact.
zip_size, zip_hash = sha_file(zip_path)
meta_artifact = artifact_metadata["artifact"]
workflow = artifact_metadata["workflowRun"]
require(zip_size == meta_artifact["sizeInBytes"] == author_receipt["hostedCI"]["providerArtifact"]["savedZipBytes"], "ZIP size differs from provider metadata")
require(zip_hash == meta_artifact["digest"].removeprefix("sha256:") == author_receipt["hostedCI"]["providerArtifact"]["providerSha256"], "ZIP digest differs from provider metadata")
require(workflow["status"] == "completed" and workflow["conclusion"] == "success", "hosted run conclusion mismatch")
require(workflow["job"]["status"] == "completed" and workflow["job"]["conclusion"] == "success", "hosted job conclusion mismatch")
require(workflow["commit"] == author_receipt["sourceIdentity"]["commit"], "hosted commit mismatch")
require(workflow["id"] == author_receipt["hostedCI"]["primaryPushRun"]["id"], "hosted push run id mismatch")
require(meta_artifact["id"] == author_receipt["hostedCI"]["providerArtifact"]["id"], "hosted artifact id mismatch")
require(len(member_catalog["members"]) == 1474 and member_catalog["extraction"]["memberCount"] == 1474, "outer member catalog count mismatch")
require(len({x["path"] for x in member_catalog["members"]}) == 1474, "duplicate outer member catalog paths")

canonical_rel = author_receipt["embeddedBuild"]["canonicalReceiptPath"]
canonical_inside = canonical_rel.split("primary-push-run-41190743932-extracted/", 1)[1]
canonical_file = ROOT / canonical_rel
canonical_data = canonical_file.read_bytes()
canonical_hash = sha_bytes(canonical_data)
rows = [m for m in member_catalog["members"] if m["path"] == canonical_inside]
require(len(rows) == 1, "canonical E-BUILD receipt row missing/duplicate in member catalog")
require(rows[0]["bytes"] == len(canonical_data) and rows[0]["sha256"] == canonical_hash, "member catalog canonical receipt mismatch")
with zipfile.ZipFile(zip_path) as zf:
    info = zf.getinfo(canonical_inside)
    require(info.file_size == len(canonical_data), "outer ZIP canonical receipt size mismatch")
    zip_canonical = zf.read(canonical_inside)
require(zip_canonical == canonical_data, "outer ZIP canonical receipt differs from read-only extracted file")

embedded = json.loads(canonical_data)
require(embedded["status"] == "failed" and embedded["outcome"] == "mixed_change", "canonical E-BUILD is not failed/mixed_change")
require(embedded["job_id"] == "E-BUILD" and len(embedded["failures"]) == 1, "unexpected canonical E-BUILD receipt shape")
failure = embedded["failures"][0]
require(failure["name"] == "stage:inherited-static-and-interaction-lifecycle", "unexpected canonical failure stage")
require(failure["error"] == author_receipt["embeddedBuild"]["failure"]["error"], "failure text differs from closed receipt")
require(embedded["inheritedLifecycle"]["status"] == "passed", "nested inherited lifecycle result mismatch")
canonical_lifecycle_rel = "compiled-lifecycle/coordination/receipts/E-BUILD.json"
canonical_lifecycle = load(EXTRACTED / canonical_lifecycle_rel)
require(canonical_lifecycle["status"] == "passed" and canonical_lifecycle["failures"] == [], "canonical compiled-lifecycle receipt mismatch")
canonical_lifecycle_bytes, canonical_lifecycle_sha = sha_file(EXTRACTED / canonical_lifecycle_rel)

pre_rel = author_receipt["embeddedBuild"]["preArchiveSnapshot"]["path"]
manifest_rel = author_receipt["embeddedBuild"]["archiveManifest"]["path"]
tar_rel = author_receipt["embeddedBuild"]["innerArchive"]["path"]
pre = load(ROOT / pre_rel)
manifest = load(ROOT / manifest_rel)
require(pre["archiveStatus"] == "PENDING" and pre["acceptanceStatus"] == "NOT_FINAL" and pre["finalAcceptance"] is False, "pre-archive snapshot is not explicitly non-final")
execution_copy = EXTRACTED / ATTEMPT_REL / "execution.json"
require(execution_copy.read_bytes() == canonical_data, "execution copy differs from canonical receipt")

tar_path = ROOT / tar_rel
manifest_rows = manifest["members"]
require(len(manifest_rows) == 187, "inner manifest member count mismatch")
expected_files = {row["path"]: row for row in manifest_rows}
require(len(expected_files) == len(manifest_rows), "duplicate inner manifest paths")
file_rows = []
directory_rows = []
seen = set()
with tarfile.open(tar_path, "r:gz") as tf:
    for member in tf.getmembers():
        name = member.name
        pp = PurePosixPath(name)
        require(name not in seen, f"duplicate inner tar path: {name}")
        seen.add(name)
        require(not pp.is_absolute() and ".." not in pp.parts and "\\" not in name and "\x00" not in name, f"unsafe inner path: {name}")
        if member.isdir():
            require(member.size == 0, f"nonempty directory entry: {name}")
            directory_rows.append(name)
            continue
        require(member.isfile(), f"non-regular inner tar entry: {name}")
        require(name in expected_files, f"unmanifested inner file: {name}")
        stream = tf.extractfile(member)
        require(stream is not None, f"unreadable inner file: {name}")
        data = stream.read()
        row = expected_files[name]
        actual = sha_bytes(data)
        require(len(data) == row["bytes"] and actual == row["sha256"], f"inner member mismatch: {name}")
        file_rows.append({"path": name, "bytes": len(data), "sha256": actual})
require(set(x["path"] for x in file_rows) == set(expected_files), "inner tar files differ from manifest path set")
require(len(file_rows) == 187 and len(directory_rows) == 61, "inner tar member/directory counts mismatch")
with gzip.open(tar_path, "rb") as gz:
    while gz.read(1024 * 1024):
        pass

snapshot_poll = load(ROOT / author_receipt["hostedCI"]["primaryPrRun"]["runSnapshotPath"])
require(snapshot_poll["status"] == "in_progress" and snapshot_poll["conclusion"] is None, "PR snapshot status mismatch")
jobs_snapshot = load(ROOT / author_receipt["hostedCI"]["primaryPrRun"]["jobsSnapshotPath"])
require(len(jobs_snapshot["jobs"]) == 1 and jobs_snapshot["jobs"][0]["status"] == "in_progress", "PR job snapshot status mismatch")

result = {
    "schema": "gobi.xr-result-custody-audit/v1",
    "decision": "accepted",
    "authorPacket": {
        "outcome": author_receipt["outcome"],
        "status": author_receipt["status"],
        "reportSha256": sha_file(author_report)[1],
        "receiptSha256": sha_file(ROOT / author_receipt_rel)[1],
        "sourceCommit": author_receipt["sourceIdentity"]["commit"],
        "sourceTree": author_receipt["sourceIdentity"]["tree"],
    },
    "providerArtifact": {
        "runId": workflow["id"],
        "workflowStatus": workflow["status"],
        "workflowConclusion": workflow["conclusion"],
        "jobStatus": workflow["job"]["status"],
        "jobConclusion": workflow["job"]["conclusion"],
        "artifactBytes": zip_size,
        "artifactSha256": zip_hash,
        "providerDigestMatches": True,
        "outerMemberCountInAuthorCatalog": member_catalog["extraction"]["memberCount"],
        "canonicalReceiptPathInZip": canonical_inside,
        "canonicalReceiptBytes": len(canonical_data),
        "canonicalReceiptSha256": canonical_hash,
        "canonicalReceiptMemberMatchesCatalogAndZip": True,
        "outerMemberCatalogCount": len(member_catalog["members"]),
    },
    "embeddedBuild": {
        "status": embedded["status"],
        "outcome": embedded["outcome"],
        "failureStage": failure["name"],
        "failureText": failure["error"],
        "nestedLifecycleStatus": embedded["inheritedLifecycle"]["status"],
        "canonicalCompiledLifecycleStatus": canonical_lifecycle["status"],
        "canonicalCompiledLifecycleReceiptPath": canonical_lifecycle_rel,
        "canonicalCompiledLifecycleReceiptBytes": canonical_lifecycle_bytes,
        "canonicalCompiledLifecycleReceiptSha256": canonical_lifecycle_sha,
        "preArchiveSnapshotStatus": pre["archiveStatus"],
        "preArchiveAcceptanceStatus": pre["acceptanceStatus"],
        "preArchiveFinalAcceptance": pre["finalAcceptance"],
        "executionCopyByteIdentical": True,
        "manifestMemberCount": len(manifest_rows),
        "innerArchiveBytes": sha_file(tar_path)[0],
        "innerArchiveSha256": sha_file(tar_path)[1],
        "innerRegularFilesIndependentlyCompared": len(file_rows),
        "innerDirectoryEntries": len(directory_rows),
        "innerManifestHashMatchesEveryFile": True,
    },
    "temporalStatus": {
        "catalogRetrievedAt": author_receipt["hostedCI"]["runCatalog"]["snapshotAt"],
        "catalogRuns": author_receipt["hostedCI"]["runCatalog"]["runCount"],
        "catalogJobs": author_receipt["hostedCI"]["runCatalog"]["jobCount"],
        "catalogStatuses": author_receipt["hostedCI"]["runCatalog"]["statusCountsAtSnapshot"],
        "prLatestPollAt": author_receipt["hostedCI"]["primaryPrRun"]["latestPollAt"],
        "prStatusAtLatestPoll": snapshot_poll["status"],
        "prJobStatusAtLatestPoll": jobs_snapshot["jobs"][0]["status"],
    },
    "citedHashChecks": hash_rows,
    "checks": {
        "allCitedImmutableHashesMatch": True,
        "providerArtifactSizeAndDigestMatch": True,
        "canonicalFailedReceiptMatchesZipCatalogAndExtraction": True,
        "innerManifestArchiveAndPreArchiveSnapshotVerified": True,
        "successfulActionsAndFailedReceiptDiscrepancyConfirmed": True,
        "milestoneAcceptanceClaimed": False,
    },
}
print(json.dumps(result, indent=2, sort_keys=True))
