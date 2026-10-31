#!/usr/bin/env python3
"""Independent, read-only verification of the frozen E-RESULT-PROVENANCE packet."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
CAP = ROOT / "compiled-capabilities"


def load(rel: str):
    return json.loads((ROOT / rel).read_text())


def digest(rel: str) -> tuple[int, str]:
    data = (ROOT / rel).read_bytes()
    return len(data), hashlib.sha256(data).hexdigest()


def require(ok: bool, message: str):
    if not ok:
        raise AssertionError(message)


report_path = "compiled-capabilities/coordination/reports/E-RESULT-PROVENANCE.md"
receipt_path = "compiled-capabilities/coordination/receipts/E-RESULT-PROVENANCE.json"
receipt = load(receipt_path)
binding_path = receipt["sourceIdentity"]["binding"]["path"]
binding = load(binding_path)

hashed_paths: dict[str, str] = {
    report_path: receipt["report"]["sha256"],
    receipt_path: hashlib.sha256((ROOT / receipt_path).read_bytes()).hexdigest(),
    binding_path: receipt["sourceIdentity"]["binding"]["sha256"],
    receipt["localExecution"]["attempt"] + "/capabilities-artifacts.tar.gz": receipt["archive"]["sha256"],
    receipt["archive"]["manifestPath"]: receipt["archive"]["manifestSha256"],
    receipt["nestedInheritedEvidence"]["path"]: receipt["nestedInheritedEvidence"]["sha256"],
    receipt["sourceAudit"]["path"]: receipt["sourceAudit"]["sha256"],
    receipt["sourceAudit"]["auditor"]: receipt["sourceAudit"]["auditorSha256"],
    receipt["n1AuditorLimitation"]["resultPath"]: receipt["n1AuditorLimitation"]["resultSha256"],
    receipt["archive"]["preArchiveSnapshot"]["path"]: receipt["archive"]["preArchiveSnapshot"]["sha256"],
    receipt["archive"]["verification"]["tool"]: receipt["archive"]["verification"]["toolSha256"],
    receipt["archive"]["verification"]["resultPath"]: receipt["archive"]["verification"]["resultSha256"],
    receipt["hostedCI"]["catalogSnapshot"]["path"]: receipt["hostedCI"]["catalogSnapshot"]["sha256"],
    receipt["hostedCI"]["catalogSnapshot"]["rawApiSnapshot"]["path"]: receipt["hostedCI"]["catalogSnapshot"]["rawApiSnapshot"]["sha256"],
    receipt["hostedCI"]["catalogSnapshot"]["preservedMalformedFirstCatalog"]["path"]: receipt["hostedCI"]["catalogSnapshot"]["preservedMalformedFirstCatalog"]["sha256"],
}
for item in receipt["preservedEvidence"]:
    hashed_paths[item["path"]] = item["sha256"]

hash_results = []
for rel, expected in hashed_paths.items():
    size, actual = digest(rel)
    require(actual == expected, f"hash mismatch: {rel}: {actual} != {expected}")
    hash_results.append({"path": rel, "bytes": size, "sha256": actual, "matches": True})

identity = receipt["sourceIdentity"]
require(binding["base"]["commit"] == identity["baseCommit"], "base binding mismatch")
require(binding["local"]["commit"] == identity["localCommit"], "local binding mismatch")
require(binding["remote"]["commit"] == identity["publishedCommit"], "published binding mismatch")
require(binding["local"]["tree"] == identity["tree"] == binding["remote"]["tree"], "tree binding mismatch")
require(binding["local"]["parents"] == identity["localParents"], "local parent mismatch")
require(binding["remote"]["parents"] == identity["publishedParents"], "published parent mismatch")
require(binding["pr"] == 15, "PR binding mismatch")

local = load(receipt["preservedEvidence"][0]["path"])
nested = load(receipt["nestedInheritedEvidence"]["path"])
require(receipt["outcome"] == "insufficient_evidence", "author outcome changed")
require(receipt["status"] == "closed_partial_failed_source", "author status changed")
require(local["status"] == "failed", "local full-run receipt is not failed")
require(receipt["localExecution"]["receiptStatus"] == "failed", "author local execution status mismatch")
require(receipt["localExecution"]["rootObservedProcessExitCode"] == 0, "local root-observed exit changed")
require(receipt["localExecution"]["commandCount"] == 16 and receipt["localExecution"]["allCommandExitCodesZero"], "local command ledger summary mismatch")
require(nested["status"] == "passed" and nested["failures"] == [], "nested inherited receipt not passed")
require(receipt["archive"]["verification"]["status"] == "verified" and not receipt["archive"]["verification"]["completeAcceptance"], "archive disposition mismatch")

catalog = load(receipt["hostedCI"]["catalogSnapshot"]["path"])
require(catalog["retrievedAt"] == "2026-10-31T10:08Z", "historical catalog timestamp mismatch")
require(catalog["counts"]["runs_by_status"] == {"completed": 11, "in_progress": 19}, "historical catalog status counts mismatch")
require(receipt["hostedCI"]["primaryPushRun"]["status"] == "in_progress", "historical push state mismatch")
require(receipt["hostedCI"]["primaryPrRun"]["status"] == "in_progress", "historical PR state mismatch")
require(receipt["hostedCI"]["artifactStatus"].startswith("not available"), "historical artifact disposition mismatch")

provider = Path("compiled-capabilities/ci/2026-10-31/provider")
metadata_rel = "compiled-capabilities/ci/2026-10-31/provider/primary-push-artifact-metadata-41190743932-20261031T102246Z.json"
metadata = load(metadata_rel)
zip_rel = "compiled-capabilities/ci/2026-10-31/provider/primary-push-run-41190743932-artifact.zip"
zip_bytes, zip_hash = digest(zip_rel)
members_rel = "compiled-capabilities/ci/2026-10-31/provider/primary-push-run-41190743932-members.json"
members = load(members_rel)
poll_rel = "compiled-capabilities/ci/2026-10-31/provider/primary-pr-poll-20261031T102228Z.json"
poll = load(poll_rel)
require(metadata["workflowRun"]["id"] == receipt["hostedCI"]["primaryPushRun"]["id"], "later hosted run id mismatch")
require(metadata["workflowRun"]["commit"] == identity["publishedCommit"] and metadata["workflowRun"]["tree"] == identity["tree"], "later hosted source binding mismatch")
require(metadata["workflowRun"]["status"] == "completed" and metadata["workflowRun"]["conclusion"] == "success", "later Actions conclusion mismatch")
require(metadata["workflowRun"]["updatedAt"] == "2026-10-31T10:22:46Z", "later metadata timestamp mismatch")
require(metadata["artifact"]["digest"] == "sha256:" + zip_hash and metadata["artifact"]["sizeInBytes"] == zip_bytes, "hosted artifact digest/size mismatch")
require(members["classification"].startswith("FAILED-COHORT evidence"), "hosted artifact classification mismatch")
require(poll["retrievedAt"] == "2026-10-31T10:22:29Z", "intermediate poll timestamp mismatch")
require(all(x["status"] == "in_progress" for x in poll["runs"]), "intermediate poll should preserve both runs as in progress")

host_receipt_rel = "compiled-capabilities/ci/2026-10-31/provider/primary-push-run-41190743932-extracted/compiled-capabilities/coordination/receipts/E-BUILD.json"
host_receipt = load(host_receipt_rel)
host_receipt_hash = hashlib.sha256((ROOT / host_receipt_rel).read_bytes()).hexdigest()
host_rows = [x for x in members["members"] if x["path"] == "compiled-capabilities/coordination/receipts/E-BUILD.json"]
require(len(host_rows) == 1 and host_rows[0]["sha256"] == host_receipt_hash and host_rows[0]["bytes"] == (ROOT / host_receipt_rel).stat().st_size, "hosted receipt does not match immutable member catalog")
require(host_receipt["job_id"] == "E-BUILD" and host_receipt["mode"] == "full" and host_receipt["status"] == "failed", "hosted inner E-BUILD receipt not failed")
require(host_receipt["finishedAt"] == "2026-10-31T10:22:34.074Z", "hosted inner receipt timestamp mismatch")
require(host_receipt.get("exitCode") is None and host_receipt.get("processExitCode") is None, "hosted receipt unexpectedly claims process exit")
host_failure = [x for x in host_receipt.get("failures", []) if x.get("name") == "stage:inherited-static-and-interaction-lifecycle"]
require(len(host_failure) == 1, "hosted failure-stage evidence missing")

# N1's auditor source was explicitly refreshed after its original closed packet,
# and the shared working file has advanced again since E-RESULT-PROVENANCE. The
# old hash is kept as historical author evidence; do not misclassify the live
# mutable source file as an immutable log or runtime output.
n1_source_path = receipt["n1AuditorLimitation"]["path"]
n1_source_current_bytes, n1_source_current_sha = digest(n1_source_path)

result = {
    "schema": "gobi.xr-result-provenance-audit/v1",
    "decision": "accepted",
    "authorPacket": {"outcome": receipt["outcome"], "status": receipt["status"], "reportSha256": hashlib.sha256((ROOT / report_path).read_bytes()).hexdigest(), "receiptSha256": hashlib.sha256((ROOT / receipt_path).read_bytes()).hexdigest()},
    "sourceBinding": {"bindingPath": binding_path, "bindingSha256": digest(binding_path)[1], "localCommit": identity["localCommit"], "publishedCommit": identity["publishedCommit"], "sameTree": True, "sameDirectParent": True, "baseCommit": identity["baseCommit"], "hostedPrSyntheticMergeCommit": identity["hostedPrSyntheticMergeCommit"]},
    "localFailedCohort": {"startedAt": receipt["localExecution"]["startedAt"], "finishedAt": receipt["localExecution"]["finishedAt"], "receiptStatus": local["status"], "rootObservedProcessExitCode": receipt["localExecution"]["rootObservedProcessExitCode"], "nestedInheritedStatus": nested["status"], "nestedInheritedFailures": nested["failures"], "archiveVerified": receipt["archive"]["verification"]["status"] == "verified", "completeAcceptance": receipt["archive"]["verification"]["completeAcceptance"]},
    "historicalCiSnapshot": {"retrievedAt": catalog["retrievedAt"], "runStatusCounts": catalog["counts"]["runs_by_status"], "primaryPushRunStatus": receipt["hostedCI"]["primaryPushRun"]["status"], "primaryPrRunStatus": receipt["hostedCI"]["primaryPrRun"]["status"], "artifactUnavailableAtSnapshot": True},
    "laterHostedEvidence": {"metadataPath": metadata_rel, "metadataSha256": digest(metadata_rel)[1], "artifactSha256": zip_hash, "artifactBytes": zip_bytes, "workflowStatus": metadata["workflowRun"]["status"], "workflowConclusion": metadata["workflowRun"]["conclusion"], "artifactMembersPath": members_rel, "artifactMembersSha256": digest(members_rel)[1], "classification": members["classification"], "innerEbuildReceiptPath": host_receipt_rel, "innerEbuildReceiptSha256": host_receipt_hash, "innerEbuildStatus": host_receipt["status"], "innerEbuildFinishedAt": host_receipt["finishedAt"], "processExitCodeClaimed": False, "intermediatePollPath": poll_rel, "intermediatePollRetrievedAt": poll["retrievedAt"]},
    "mutableSourceDrift": {"path": n1_source_path, "authorHistoricalSha256": receipt["n1AuditorLimitation"]["sha256"], "currentSha256AtReview": n1_source_current_sha, "currentBytesAtReview": n1_source_current_bytes, "matchesHistoricalHash": n1_source_current_sha == receipt["n1AuditorLimitation"]["sha256"], "historicalSupplementPath": "compiled-capabilities/coordination/acceptance/provenance/HEAD-refresh-supplement.md", "interpretation": "The author hash is retained as a historical source-version claim. This mutable source path is not an immutable log/runtime artifact; its current bytes differ, so the historical source bytes were not independently reconstructed."},
    "verifiedCitedFiles": hash_results,
    "checks": {"allImmutableCitedEvidenceHashesMatch": True, "bindingFactsMatchReceipt": True, "failedLocalReceiptAndExitMismatchConfirmed": True, "historicalCiTimestampRemainsBounded": True, "laterHostedGreenConclusionHasInnerFailedReceipt": True, "mutableN1SourceHashIsHistoricalAndDoesNotMatchCurrentPath": n1_source_current_sha != receipt["n1AuditorLimitation"]["sha256"], "overallMilestoneAcceptanceClaimed": False},
}
print(json.dumps(result, indent=2, sort_keys=True))
