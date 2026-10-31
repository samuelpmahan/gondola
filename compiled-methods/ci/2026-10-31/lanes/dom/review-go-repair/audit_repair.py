#!/usr/bin/env python3
"""Check the bounded E-CI-GO view-claim repair without rerunning artifacts."""

import difflib
import hashlib
import json
import zipfile
from pathlib import Path

BASE = Path("compiled-methods/ci/2026-10-31")
REVIEW_DIR = BASE / "lanes/dom/review-go-repair"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path):
    return json.loads(path.read_text())


publication = load(BASE / "publication-current.json")
before_dir = BASE / "lanes/go/repair-view-claim/before"
before_report = before_dir / "E-CI-GO.md"
before_receipt_path = before_dir / "E-CI-GO.json"
before_receipt = load(before_receipt_path)
canonical_report = BASE / "coordination/reports/E-CI-GO.md"
canonical_receipt_path = BASE / "coordination/receipts/E-CI-GO.json"
canonical_receipt = load(canonical_receipt_path)
prior_review_report = BASE / "coordination/reports/XR-CI-GO.md"
prior_review_receipt_path = BASE / "coordination/receipts/XR-CI-GO.json"
prior_review_receipt = load(prior_review_receipt_path)
author_script = BASE / "lanes/go/audit_current_ci.py"
author_audit_path = BASE / "lanes/go/current-ci-audit.json"
author_audit = load(author_audit_path)
artifact_metadata = load(BASE / "primary-artifact-metadata.json")
retention = load(BASE / "artifact-retention.json")
archive_path = BASE / "original.zip"
execution_path = BASE / "extracted/compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/execution.json"
execution = load(execution_path)
methods_run_path = BASE / "extracted/compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/matrix/methods.run.json"
methods_run = load(methods_run_path)
native_replay = BASE / "lanes/go/current-ci/native.replay.stdout.json"
direct_replay = BASE / "lanes/go/current-ci/direct.replay.stdout.json"
dom_receipt = load(BASE / "coordination/receipts/E-CI-DOM.json")
dom_report = BASE / "coordination/reports/E-CI-DOM.md"
dom_audit_path = BASE / "lanes/dom/final/primary-dom-audit.json"

new_report = canonical_report.read_text()
old_report = before_report.read_text()
old_receipt = before_receipt
new_receipt = canonical_receipt

checks = []

def passed(name, detail):
    checks.append({"name": name, "status": "passed", "detail": detail})


# 1: Source and tree are still the published target.
assert publication["sourceCommit"] == new_receipt["source"]["commit"] == "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
assert publication["sourceTree"] == new_receipt["source"]["tree"] == "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
passed("published_source_identity", "Current report and receipt still target source 6b49/tree b28b.")

# 2: The preserved before report is the exact report reviewed in XR-CI-GO.
assert sha(before_report) == prior_review_receipt["reviewed_author_packet"]["report_sha256"]
assert sha(before_report) == old_receipt["report"]["sha256"]
passed("before_report_preserved", sha(before_report))

# 3: The preserved before receipt is the exact receipt reviewed in XR-CI-GO.
assert sha(before_receipt_path) == prior_review_receipt["reviewed_author_packet"]["receipt_sha256"]
assert sha(before_receipt_path) == old_receipt["report"].get("receipt_sha256", sha(before_receipt_path))
passed("before_receipt_preserved", sha(before_receipt_path))

# 4: The canonical report pin is refreshed to the corrected bytes.
assert sha(canonical_report) == new_receipt["report"]["sha256"]
passed("canonical_report_hash", sha(canonical_report))

# 5: Canonical receipt is valid and summarizes bounded scope accurately.
assert new_receipt["summary"].strip()
assert new_receipt["outcome"] == "mixed_change"
assert new_receipt["audit_result"]["fixture_state_message_dispatch_effect_expectations_matched"] is True
assert new_receipt["audit_result"]["native_direct_view_records_equal"] is True
assert "not a field in the Go fixture expectation records" in new_receipt["audit_result"]["expected_view_oracle"]["scope_note"]
passed("receipt_schema_and_summary", "Corrected receipt parses, has summary, and separates fixture expectations from View equality/oracle.")

# 6: Audit code and 7: audit result remain byte-identical to the reviewed originals.
assert sha(author_script) == old_receipt["audit_program"]["sha256"] == new_receipt["audit_program"]["sha256"]
passed("audit_script_unchanged", sha(author_script))
assert sha(author_audit_path) == old_receipt["audit_result"]["sha256"] == new_receipt["audit_result"]["sha256"]
passed("audit_result_unchanged", sha(author_audit_path))

# 8: Fresh artifact workflow identity matches the published primary push.
assert artifact_metadata["workflow_run"]["id"] == retention["run"] == 41169518187
assert artifact_metadata["workflow_run"]["head_sha"] == retention["source"] == publication["sourceCommit"]
assert artifact_metadata["id"] == retention["artifactId"] == 13030848292
assert retention["job"] == 124444234335 and retention["workflowOutcome"] == "success"
passed("primary_artifact_identity", "Run, job, artifact, source commit, and workflow success match.")

# 9: Provider ZIP size and digest match metadata and retention manifest.
archive_data = archive_path.read_bytes()
archive_hash = hashlib.sha256(archive_data).hexdigest()
assert len(archive_data) == retention["providerZipBytes"] == artifact_metadata["size_in_bytes"]
assert archive_hash == retention["providerZipSha256"]
assert artifact_metadata["digest"] == f"sha256:{archive_hash}"
passed("provider_zip_digest", archive_hash)

# 10: All ZIP files and extracted files match the retained 968-member index.
member_manifest = {member["path"]: member for member in retention["members"]}
with zipfile.ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    assert len(names) == len(member_manifest) == 968 and names == set(member_manifest)
    for member_name, pin in member_manifest.items():
        data = archive.read(member_name)
        extracted = BASE / "extracted" / member_name
        assert len(data) == pin["bytes"] and hashlib.sha256(data).hexdigest() == pin["sha256"]
        assert extracted.read_bytes() == data
        assert hashlib.sha256(extracted.read_bytes()).hexdigest() == pin["sha256"]
passed("zip_and_extracted_member_integrity", "968 ZIP members and extracted files match retained byte/hash pins.")

# 11: Previously reviewed replays and execution pins are preserved; no rerun required.
assert old_receipt["audit_result"]["replay"] == new_receipt["audit_result"]["replay"]
assert methods_run["status"] == "matched"
assert len(execution["commands"]) == 17 and all(command["exitCode"] == 0 for command in execution["commands"])
assert hashlib.sha256(native_replay.read_bytes()).hexdigest() == new_receipt["audit_result"]["replay"]["native"]["stdout_sha256"]
assert hashlib.sha256(direct_replay.read_bytes()).hexdigest() == new_receipt["audit_result"]["replay"]["direct"]["stdout_sha256"]
passed("replay_and_execution_evidence_preserved", "Artifact replay hashes and 17-command successful execution record are unchanged.")

# 12: View evidence points to the current DOM review artifacts and is correctly scoped.
view = new_receipt["audit_result"]["expected_view_oracle"]
assert view["report_sha256"] == sha(dom_report) == dom_receipt["report"]["sha256"]
assert view["result_sha256"] == sha(dom_audit_path) == dom_receipt["primary_audit"]["result_sha256"]
assert view["expected_states_and_view_trees_matched"] is True
passed("view_oracle_cross_reference", "E-CI-GO references current independent E-CI-DOM report and result pins.")

# 13: Stale global-status language was narrowed and no global/PR pass is claimed.
assert "latest root snapshot" not in new_report
assert "cross-workflow status packet owns those conclusions" in new_report
assert new_receipt["current_primary_ci"]["primary_pr_run_status"] == "not_audited_in_E-CI-GO"
assert new_receipt["claim_boundaries"]["global_pr_acceptance_claim"] is False
passed("global_status_claim_boundary", "Canonical wording delegates global status and makes no PR/global acceptance claim.")

# Preserve the prior cross-review packet, not merely its input copies.
review_report_hash = sha(prior_review_report)
review_receipt_hash = sha(prior_review_receipt_path)
assert review_report_hash == "55e3a085e4b323ef4e154668190aa9e1892b8a43166a894ae740580c08396a5e"
assert review_receipt_hash == "c1405e5ed18cdc4a8b6bb41cfd99e6c4266561168fd0fb68de6fee58a6448934"

diff_lines = list(difflib.unified_diff(old_report.splitlines(), new_report.splitlines(), lineterm=""))
result = {
    "schema": "gobi.xr-r-ci-go-repair-review/v1",
    "job_id": "XR-R-CI-GO",
    "worker": "N2",
    "decision": "accepted",
    "source": {"commit": publication["sourceCommit"], "tree": publication["sourceTree"]},
    "canonical_author_packet": {
        "report_sha256": sha(canonical_report),
        "receipt_sha256": sha(canonical_receipt_path),
        "audit_script_sha256": sha(author_script),
        "audit_result_sha256": sha(author_audit_path),
    },
    "preserved_before_packet": {
        "report_sha256": sha(before_report),
        "receipt_sha256": sha(before_receipt_path),
    },
    "prior_review_unchanged": {
        "report_sha256": review_report_hash,
        "receipt_sha256": review_receipt_hash,
    },
    "primary_artifact": {
        "run_id": retention["run"],
        "job_id": retention["job"],
        "artifact_id": retention["artifactId"],
        "provider_zip_sha256": archive_hash,
        "member_count": len(member_manifest),
        "integrity": "passed",
    },
    "repair_scope": {
        "report_changes": [
            "Corrected description of 18 fixture expectations to exclude View fields.",
            "Separated equality of native/direct View records from expected-view-tree verification, cross-referencing E-CI-DOM.",
            "Delegated global PR/workflow status to the cross-workflow packet instead of repeating a stale 24/26 snapshot.",
        ],
        "receipt_changes": [
            "Replaced undifferentiated fixture expectation claim with state/message/dispatch/effects assertion.",
            "Added native/direct View equality and independent E-CI-DOM expected-view oracle pins.",
            "Removed stale global count and clarified PR/global acceptance boundaries.",
            "Refreshed report hash and bounded summary.",
        ],
        "audit_script_and_result_unchanged": True,
        "diff_line_count": len(diff_lines),
    },
    "checks": checks,
    "check_count": len(checks),
    "all_checks_passed": all(item["status"] == "passed" for item in checks),
    "scope_limit": "Metadata/report correction only; primary native/direct evidence and replay acceptance were reviewed previously and not rerun.",
}
out = REVIEW_DIR / "repair-audit.json"
out.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
