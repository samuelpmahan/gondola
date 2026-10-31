#!/usr/bin/env python3
"""Read-only review of N4's citation-only custody receipt correction."""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[4]
REVIEW = pathlib.Path(__file__).resolve().parent
BASE = ROOT / "compiled-capabilities"
CORRECTION = BASE / "ci/2026-10-31/source-60b5aef/custody/citation-correction"
MANIFEST_PATH = CORRECTION / "citation-correction-manifest.json"
CORRECTED_PATH = CORRECTION / "E-ACCEPT-CUSTODY-corrected.json"
ORIGINAL_PATH = BASE / "coordination/receipts/E-ACCEPT-CUSTODY.json"
ORIGINAL_REPORT_PATH = BASE / "coordination/reports/E-ACCEPT-CUSTODY.md"
FIX_RECEIPT_PATH = BASE / "coordination/receipts/E-FIX-ACCEPT-CUSTODY.json"
FIX_REPORT_PATH = BASE / "coordination/reports/E-FIX-ACCEPT-CUSTODY.md"
NATIVE_AUDIT_PATH = REVIEW / "native-protocol-audit.stdout.json"
ZERO_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def diff_paths(left, right, prefix=""):
    if type(left) is not type(right):
        return [prefix or "/"]
    if isinstance(left, dict):
        changes = []
        for key in sorted(set(left) | set(right)):
            pointer = f"{prefix}/{key}"
            if key not in left or key not in right:
                changes.append(pointer)
            else:
                changes.extend(diff_paths(left[key], right[key], pointer))
        return changes
    if isinstance(left, list):
        if len(left) != len(right):
            return [prefix or "/"]
        changes = []
        for index, (a, b) in enumerate(zip(left, right)):
            changes.extend(diff_paths(a, b, f"{prefix}/{index}"))
        return changes
    return [] if left == right else [prefix or "/"]


def main() -> int:
    manifest = load(MANIFEST_PATH)
    original = load(ORIGINAL_PATH)
    corrected = load(CORRECTED_PATH)
    fix_receipt = load(FIX_RECEIPT_PATH)
    fix_report_bytes = FIX_REPORT_PATH.read_bytes()
    original_report_bytes = ORIGINAL_REPORT_PATH.read_bytes()

    expected_pointer = "/catalogWriterAndSnapshotNotes/firstWriterFailurePreserved/path"
    old_path = manifest["soleFieldDiff"]["oldValue"]
    new_path = manifest["soleFieldDiff"]["newValue"]
    actual_changes = diff_paths(original, corrected)
    require(actual_changes == [expected_pointer], f"corrected copy has unexpected JSON differences: {actual_changes}")
    require(manifest["soleFieldDiff"]["jsonPointer"] == expected_pointer and
            manifest["diffPaths"] == ["catalogWriterAndSnapshotNotes.firstWriterFailurePreserved.path"],
            "manifest does not name the single corrected field")
    require(original["catalogWriterAndSnapshotNotes"]["firstWriterFailurePreserved"]["path"] == old_path and
            corrected["catalogWriterAndSnapshotNotes"]["firstWriterFailurePreserved"]["path"] == new_path,
            "source receipt values differ from the correction manifest")
    require(not (ROOT / old_path).exists(), "incorrect extra-f path unexpectedly exists")
    zero_file = ROOT / new_path
    require(zero_file.is_file() and zero_file.stat().st_size == 0 and digest(zero_file) == ZERO_SHA256,
            "corrected citation does not point to the actual empty writer-failure file")
    require(manifest["actualZeroByteFile"]["path"] == new_path and
            manifest["actualZeroByteFile"]["bytes"] == 0 and
            manifest["actualZeroByteFile"]["sha256"] == ZERO_SHA256 and
            manifest["oldIncorrectPathExists"] is False,
            "manifest's file facts are inconsistent with current bytes")

    require(ORIGINAL_PATH.stat().st_size == manifest["canonicalReceiptBytes"] and
            digest(ORIGINAL_PATH) == manifest["canonicalReceiptSha256"] ==
            "d5368b4c74079a9af76117d60b209bda34a6ccd6d8084c288629a5949616b49a",
            "canonical closed E-ACCEPT-CUSTODY receipt changed or does not match its pin")
    require(CORRECTED_PATH.stat().st_size == manifest["correctedCopyBytes"] and
            digest(CORRECTED_PATH) == manifest["correctedCopySha256"] ==
            "019af101381f99e1d953ccd2056d2dde3e946f4094950ab880e2e5443d7e72fa",
            "corrected copy does not match its immutable manifest")
    require(digest(MANIFEST_PATH) == "397e4cac9ff6263fb48503adf5ddce2529dc3fc207bee1616503582a484755d1",
            "citation correction manifest changed")

    require(original["report"]["path"] == str(ORIGINAL_REPORT_PATH.relative_to(ROOT)) and
            original["report"]["sha256"] == digest(ORIGINAL_REPORT_PATH) ==
            "bf99ed68b1aa0c4657388ed8ba19046ff2820eb8b4e0cbb48b4ffbb9c5b1643a",
            "original author report is not unchanged at its pinned bytes")
    terminal = original["hostedCI"]["terminalCatalog"]
    terminal_path = ROOT / terminal["path"]
    require(terminal_path.stat().st_size == terminal["bytes"] == 135588 and
            digest(terminal_path) == terminal["sha256"] ==
            "b69f432f53e8d4ff85ae0d855bbfabec35f76febb4830853d313cb0a8b2d9bfc",
            "accepted v2 terminal catalog changed")
    require(terminal["runCount"] == terminal["jobCount"] == 30 and
            terminal["runStatusCounts"] == {"completed:success": 30} and
            terminal["jobStatusCounts"] == {"completed:success": 30},
            "preserved terminal catalog counts do not match the accepted source cohort")

    native_validation = fix_receipt["nativeValidation"]
    validation_log_path = ROOT / native_validation["logPath"]
    validation_log = load(validation_log_path)
    require(fix_receipt["job_id"] == "E-FIX-ACCEPT-CUSTODY" and
            fix_receipt["worker"] == "N4" and fix_receipt["outcome"] == "mixed_change" and
            isinstance(fix_receipt.get("summary"), str) and fix_receipt["summary"].strip(),
            "N4 repair receipt is missing native extraction contract fields")
    require(fix_receipt["citationCorrection"]["correctedCopySha256"] == digest(CORRECTED_PATH) and
            fix_receipt["citationCorrection"]["manifestSha256"] == digest(MANIFEST_PATH) and
            fix_receipt["report"]["sha256"] == digest(FIX_REPORT_PATH),
            "N4 repair receipt pins do not match corrected copy, manifest, or report")
    require(fix_report_bytes and fix_receipt["report"]["path"] ==
            str(FIX_REPORT_PATH.relative_to(ROOT)) and
            fix_receipt["nativeValidation"]["status"] == "passed" and
            native_validation["mode"] == "read_only; no finish/state write" and
            validation_log["result"] == "passed" and
            validation_log["receiptSha256"] == digest(FIX_RECEIPT_PATH) and
            validation_log["job_id"] == fix_receipt["job_id"] and
            validation_log["worker"] == fix_receipt["worker"],
            "N4's final read-only native receipt validation does not bind the current receipt")

    native = load(NATIVE_AUDIT_PATH)
    epoch_path = BASE / "coordination/native/epoch-35.json"
    epoch = load(epoch_path)
    require(native["read_only"] is True and native["errors"] == [] and
            native["status"] in {"PASS", "INCOMPLETE"},
            "global scheduler audit reports a native protocol error")
    require(epoch["epoch"] == 35 and epoch["dispatch"].get("N6") == "XR-FIX-ACCEPT-CUSTODY" and
            epoch["assignments"].get("N6") == "XR-FIX-ACCEPT-CUSTODY" and
            "N6" in epoch["eligible"]["XR-FIX-ACCEPT-CUSTODY"] and
            epoch["native_constraints"]["solved"] is True and
            epoch["native_constraints"]["brokenVal"] == 0 and
            epoch["native_constraints"]["brokenCount"] == 0 and
            all(row["value"] == 0 for row in epoch["native_constraints"]["constraints"]) and
            epoch["independent_capacity_check"] is True and epoch["independent_eligibility_check"] is True,
            "native epoch 35 does not authorize the assigned N6 review")

    result = {
        "schema": "gobi.citation-correction-independent-review/v1",
        "status": "passed",
        "authorPacket": {
            "fixReportPath": str(FIX_REPORT_PATH.relative_to(ROOT)),
            "fixReportBytes": len(fix_report_bytes),
            "fixReportSha256": digest(FIX_REPORT_PATH),
            "fixReceiptPath": str(FIX_RECEIPT_PATH.relative_to(ROOT)),
            "fixReceiptBytes": FIX_RECEIPT_PATH.stat().st_size,
            "fixReceiptSha256": digest(FIX_RECEIPT_PATH),
        },
        "originalAcceptance": {
            "receiptBytes": ORIGINAL_PATH.stat().st_size,
            "receiptSha256": digest(ORIGINAL_PATH),
            "reportBytes": len(original_report_bytes),
            "reportSha256": digest(ORIGINAL_REPORT_PATH),
            "unchanged": True,
        },
        "correction": {
            "manifestPath": str(MANIFEST_PATH.relative_to(ROOT)),
            "manifestSha256": digest(MANIFEST_PATH),
            "correctedCopyPath": str(CORRECTED_PATH.relative_to(ROOT)),
            "correctedCopyBytes": CORRECTED_PATH.stat().st_size,
            "correctedCopySha256": digest(CORRECTED_PATH),
            "onlyJsonPointerChanged": expected_pointer,
            "incorrectPathExists": old_path if (ROOT / old_path).exists() else False,
            "correctPathBytes": zero_file.stat().st_size,
            "correctPathSha256": digest(zero_file),
        },
        "preservedCatalog": {"path": str(terminal_path.relative_to(ROOT)), "bytes": terminal_path.stat().st_size,
                             "sha256": digest(terminal_path), "runs": terminal["runCount"],
                             "jobs": terminal["jobCount"]},
        "nativeProtocol": {
            "auditPath": str(NATIVE_AUDIT_PATH.relative_to(ROOT)),
            "auditSha256": digest(NATIVE_AUDIT_PATH),
            "status": native["status"],
            "errors": native["errors"],
            "incomplete": native["incomplete"],
            "acceptedEpochCount": native["accepted_epoch_count"],
            "assignedReview": epoch["dispatch"]["N6"],
            "epoch": epoch["epoch"],
            "allNativeConstraintValuesZero": True,
        },
        "decision": "accepted",
        "scope": "citation-only correction in a new copy; original canonical custody receipt and report unchanged",
    }
    (REVIEW / "verification.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise SystemExit(1)
