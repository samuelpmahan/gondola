import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
COORD = ROOT / "compiled-children" / "coordination"
RAW = COORD / "rawlogs"


def read_json(path):
    return json.loads((ROOT / path).read_text())


def read_bytes(path):
    return (ROOT / path).read_bytes()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def path_sha(path):
    return sha(read_bytes(path))


def projection(path, expected_hash=None, expected_bytes=None):
    data = read_bytes(path)
    actual_hash = sha(data)
    return {
        "path": path,
        "bytes": len(data),
        "sha256": actual_hash,
        "hashMatches": expected_hash is None or actual_hash == expected_hash,
        "byteCountMatches": expected_bytes is None or len(data) == expected_bytes,
    }


fix_path = "compiled-children/coordination/receipts/E-FIX-ORACLE-CUSTODY.json"
fix = read_json(fix_path)
e_oracle = read_json("compiled-children/coordination/receipts/E-ORACLE.json")
xr_oracle = read_json("compiled-children/coordination/receipts/XR-ORACLE.json")
fix_report_path = "compiled-children/coordination/reports/E-FIX-ORACLE-CUSTODY.md"
fix_report = projection(fix_report_path, fix["report"]["sha256"], fix["report"]["bytes"])

source_pins = []
for path, expected in sorted(fix["sourceSha256"].items()):
    actual = projection(path, expected)
    source_pins.append(actual)

rawlog_pins = []
for item in sorted(fix["rawlogs"], key=lambda value: value["path"]):
    rawlog_pins.append(projection(item["path"], item["sha256"], item["bytes"]))

audit_path = "compiled-children/coordination/rawlogs/E-FIX-ORACLE-CUSTODY-audit.json"
audit = read_json(audit_path)
facts_path = "compiled-children/oracle/custody/mismatch-facts.json"
facts = read_json(facts_path)
audit_source_path = "compiled-children/oracle/audit-native-protocol.mjs"
preserved_path = facts["current_reconstruction_copy"]
audit_source_hash = path_sha(audit_source_path)
preserved_hash = path_sha(preserved_path)

snapshot_path = fix["native_protocol_audit"]["state_snapshot_copy"]
snapshot_bytes = read_bytes(snapshot_path)
snapshot_hash = sha(snapshot_bytes)
snapshot = json.loads(snapshot_bytes)
live_state_path = "compiled-children/coordination/state.json"
live_state_bytes = read_bytes(live_state_path)
live_state = json.loads(live_state_bytes)

fresh_path = "compiled-children/coordination/rawlogs/XR-FIX-ORACLE-CUSTODY-native-fresh.json"
fix_fresh_path = fix["fresh_trace"]["path"]
xr_fresh_path = "compiled-children/coordination/rawlogs/N2-XR-ORACLE-native-fresh.json"
oracle_saved_path = "compiled-children/oracle/evidence/native.json"
fresh_bytes = read_bytes(fresh_path)
fresh = json.loads(fresh_bytes)
fresh_hash = sha(fresh_bytes)
trace_sources = [fix_fresh_path, xr_fresh_path, oracle_saved_path]
trace_comparisons = []
for path in trace_sources:
    other = read_bytes(path)
    trace_comparisons.append({
        "path": path,
        "bytes": len(other),
        "sha256": sha(other),
        "byteIdenticalToReviewReplay": other == fresh_bytes,
    })

verify_path = "compiled-children/coordination/rawlogs/XR-FIX-ORACLE-CUSTODY-native-verify.json"
native_verify = read_json(verify_path)
test_stdout_path = "compiled-children/coordination/rawlogs/XR-FIX-ORACLE-CUSTODY-node-tests.stdout.log"
test_stdout = read_bytes(test_stdout_path).decode("utf-8")
tap = {
    key: int(value)
    for key, value in __import__("re").findall(r"^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$", test_stdout, __import__("re").M)
}

reviewer_rawlogs = []
fix_rawlog_by_path = {item["path"]: item for item in fix["rawlogs"]}
for item in xr_oracle.get("reviewer_rawlogs", []):
    actual = projection(item["path"], item["sha256"])
    superseding = fix_rawlog_by_path.get(item["path"])
    reviewer_rawlogs.append({
        "path": item["path"],
        "historicalReceiptBytes": item["bytes"],
        "actualBytes": actual["bytes"],
        "historicalReceiptSha256": item["sha256"],
        "actualSha256": actual["sha256"],
        "historicalHashMatches": actual["hashMatches"],
        "supersedingLedgerBytes": superseding["bytes"] if superseding else None,
        "supersedingLedgerSha256": superseding["sha256"] if superseding else None,
        "supersedingLedgerMatchesActual": bool(superseding and superseding["bytes"] == actual["bytes"]
                                               and superseding["sha256"] == actual["sha256"]),
    })

old_audit_expected = e_oracle["sourceSha256"][audit_source_path]
report_pins = []
for receipt_path, receipt in [
    ("compiled-children/coordination/receipts/E-ORACLE.json", e_oracle),
    ("compiled-children/coordination/receipts/XR-ORACLE.json", xr_oracle),
]:
    report_pins.append({
        "receipt": projection(receipt_path),
        "report": projection(receipt["report"]["path"], receipt["report"]["sha256"], receipt["report"]["bytes"]),
        "receiptPinnedBySupersedingPacket": fix["sourceSha256"].get(receipt_path) == path_sha(receipt_path),
        "reportPinnedBySupersedingPacket": fix["sourceSha256"].get(receipt["report"]["path"]) == path_sha(receipt["report"]["path"]),
    })

result = {
    "schema": "gobi.xr-fix-oracle-custody-independent-review/v1",
    "reviewedJob": {"job_id": fix["job_id"], "worker": fix["worker"], "outcome": fix["outcome"]},
    "custody": {
        "closedExpectedSha256": old_audit_expected,
        "currentReconstructionSha256": audit_source_hash,
        "preservedCopy": preserved_path,
        "preservedCopySha256": preserved_hash,
        "copyByteIdenticalToCurrentReconstruction": audit_source_hash == preserved_hash,
        "originalPinnedBytesAvailable": facts["original_pinned_bytes_available"],
        "recoveryClaim": facts["recovery_status"],
        "historicalMismatchPreserved": old_audit_expected != audit_source_hash
            and fix["author_pin_audit"]["original_pinned_bytes_available"] is False,
    },
    "snapshotBoundary": {
        "snapshotPath": snapshot_path,
        "snapshotSha256": snapshot_hash,
        "receiptSha256": fix["native_protocol_audit"]["state_snapshot_sha256"],
        "auditOutputSha256": audit["nativeHistory"]["stateSnapshotSha256"],
        "snapshotEpoch": snapshot["epoch"],
        "capturedPacketState": fix["native_protocol_audit"]["snapshot_packet_state"],
        "liveStateIsPinnedByEfix": live_state_path in fix["sourceSha256"],
        "liveStateObservedAtReview": {
            "sha256": sha(live_state_bytes),
            "epoch": live_state["epoch"],
            "E-HARNESS": live_state["jobs"].get("E-HARNESS", {}).get("status"),
            "E-FIX-ORACLE-CUSTODY": live_state["jobs"].get("E-FIX-ORACLE-CUSTODY", {}).get("status"),
            "XR-FIX-ORACLE-CUSTODY": live_state["jobs"].get("XR-FIX-ORACLE-CUSTODY", {}).get("status"),
        },
        "snapshotDiffersFromLiveObservation": snapshot_bytes != live_state_bytes,
        "boundary": "Historical audit claims apply to the SHA-pinned epoch-7 snapshot only; no claim is made that the mutable state file still has that state after root closure.",
    },
    "nativeAudit": {
        "status": audit["status"],
        "epochCount": audit["nativeHistory"]["epochCount"],
        "epochs": [item["epoch"] for item in audit["nativeHistory"]["epochs"]],
        "errors": audit["errors"],
        "warnings": audit["warnings"],
        "solverInvoked": fix["native_protocol_audit"]["solver_invoked"],
        "schedulerStateWritten": fix["native_protocol_audit"]["scheduler_state_written"],
        "eOracleHistoricalPins": audit["sourceCustody"]["eOraclePins"],
        "xrOracleReviewedPins": audit["sourceCustody"]["xrOraclePins"],
    },
    "freshOracleReplay": {
        "path": fresh_path,
        "bytes": len(fresh_bytes),
        "sha256": fresh_hash,
        "events": len(fresh["events"]),
        "steps": len(fresh["steps"]),
        "verifier": native_verify,
        "byteComparisons": trace_comparisons,
    },
    "oracleTests": {
        "command": "/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/oracle/oracle.test.mjs",
        "tap": tap,
        "status": "passed" if tap.get("pass") == 9 and tap.get("fail") == 0 else "failed",
        "stdout": projection(test_stdout_path),
        "stderr": projection("compiled-children/coordination/rawlogs/XR-FIX-ORACLE-CUSTODY-node-tests.stderr.log"),
    },
    "pinAudit": {
        "sourcePins": {"count": len(source_pins), "matched": sum(item["hashMatches"] for item in source_pins),
                       "mismatches": [item for item in source_pins if not item["hashMatches"]], "items": source_pins},
        "rawlogPins": {"count": len(rawlog_pins), "matched": sum(item["hashMatches"] and item["byteCountMatches"] for item in rawlog_pins),
                       "mismatches": [item for item in rawlog_pins if not item["hashMatches"] or not item["byteCountMatches"]], "items": rawlog_pins},
        "report": fix_report,
        "historicalEOracleAndXrOracle": report_pins,
    },
    "historicalXrReviewerRawlogByteWarnings": reviewer_rawlogs,
    "sourceHashes": {
        "E-FIX-audit-helper": path_sha("compiled-children/oracle/custody/audit-native-protocol-current.mjs"),
        "E-FIX-native-verifier": path_sha("compiled-children/oracle/custody/verify-native-current.mjs"),
        "E-FIX-audit-output": path_sha(audit_path),
        "E-FIX-mismatch-facts": path_sha(facts_path),
    },
    "reviewedAt": datetime.now(timezone.utc).isoformat(),
}

print(json.dumps(result, indent=2))
