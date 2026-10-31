#!/usr/bin/env python3
"""Read-only independent audit of N3's scoped browser acceptance packet."""

from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parents[4]
REVIEW = pathlib.Path(__file__).resolve().parent
BROWSER = ROOT / "compiled-capabilities/ci/2026-10-31/source-60b5aef/browser"
LOCAL = ROOT / "compiled-capabilities/builds/attempts/attempt-20261031T103735751Z"
PROVIDER = ROOT / "compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider"
HOSTED_EXTRACT = PROVIDER / "primary-push-run-41193504188-extracted"
HOSTED = HOSTED_EXTRACT / "compiled-capabilities/builds/attempts/attempt-20261031T103752934Z"
RECEIPT_PATH = ROOT / "compiled-capabilities/coordination/receipts/E-ACCEPT-BROWSER.json"
REPORT_PATH = ROOT / "compiled-capabilities/coordination/reports/E-ACCEPT-BROWSER.md"
CATALOG_PATH = PROVIDER / "source-60b5aeff-terminal-runs-jobs-20261031T111444Z-v2.json"
EPOCH_PATH = ROOT / "compiled-capabilities/coordination/native/epoch-32.json"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path: pathlib.Path) -> str:
    return sha(path.read_bytes())


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def only_difference(before: dict, after: dict, key: str, expected_before, expected_after) -> bool:
    left, right = dict(before), dict(after)
    left.pop(key, None)
    right.pop(key, None)
    return left == right and before.get(key, None) == expected_before and after.get(key, None) == expected_after


def raw_preserved(capture: dict, label: str) -> bool:
    swap = capture["swap"][label]
    before, after = swap["before"], swap["after"]
    return (all(before["snapshot"][field] == after["snapshot"][field]
                for field in ("state", "view", "dom")) and before["pending"] == after["pending"])


def native_inputs() -> list[pathlib.Path]:
    coordination = ROOT / "compiled-capabilities/coordination"
    paths = [coordination / name for name in ("state.json", "spec.json", "capacity.json", "dispatch.json")]
    paths.extend(sorted((coordination / "native").glob("epoch-*.json")))
    paths.extend(sorted((coordination / "native").glob("epoch-*.bundle")))
    paths.extend(sorted((coordination / "receipts").glob("*.json")))
    paths.extend(sorted(coordination.glob("epoch-*.log")))
    return [path for path in paths if path.is_file()]


def native_input_pins() -> list[dict]:
    return [{"path": str(path.relative_to(ROOT)), "bytes": path.stat().st_size, "sha256": digest(path)}
            for path in native_inputs()]


def run_json_command(name: str, command: list[str], out_name: str) -> tuple[dict, dict]:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    (REVIEW / f"{name}.stdout.json").write_text(result.stdout, encoding="utf-8")
    (REVIEW / f"{name}.stderr.log").write_text(result.stderr, encoding="utf-8")
    (REVIEW / f"{name}.exit-code").write_text(f"{result.returncode}\n", encoding="utf-8")
    require(result.returncode == 0, f"{name} exited {result.returncode}: {result.stderr[:500]}")
    parsed = json.loads(result.stdout)
    return parsed, {
        "command": command,
        "exitCode": result.returncode,
        "stdoutPath": f"compiled-capabilities/coordination/reviews/XR-ACCEPT-BROWSER/{name}.stdout.json",
        "stdoutBytes": len(result.stdout.encode()),
        "stdoutSha256": sha(result.stdout.encode()),
        "stderrPath": f"compiled-capabilities/coordination/reviews/XR-ACCEPT-BROWSER/{name}.stderr.log",
        "stderrBytes": len(result.stderr.encode()),
        "stderrSha256": sha(result.stderr.encode()),
    }


def main() -> int:
    current = load(RECEIPT_PATH)
    report_bytes = REPORT_PATH.read_bytes()
    before_outcome_path = BROWSER / "E-ACCEPT-BROWSER-receipt-before-outcome-correction.json"
    before_summary_path = BROWSER / "E-ACCEPT-BROWSER-receipt-before-summary-correction.json"
    before_outcome = load(before_outcome_path)
    before_summary = load(before_summary_path)
    outcome_correction = load(BROWSER / "E-ACCEPT-BROWSER-outcome-correction.json")
    summary_correction = load(BROWSER / "E-ACCEPT-BROWSER-summary-correction.json")
    require(only_difference(before_outcome, before_summary, "outcome",
                            "accepted_current_source_browser_evidence", "mixed_change"),
            "outcome correction changed fields other than outcome")
    require(only_difference(before_summary, current, "summary", None, current.get("summary")),
            "summary correction changed fields other than summary")
    require(outcome_correction["onlyOutcomeChanged"] is True and
            outcome_correction["preservedReceipt"]["sha256"] == digest(before_outcome_path) and
            outcome_correction["correctedReceipt"]["sha256"] == digest(before_summary_path),
            "outcome correction manifest does not bind the preserved snapshots")
    require(summary_correction["onlySummaryAdded"] is True and
            summary_correction["previousReceipt"]["sha256"] == digest(before_summary_path) and
            summary_correction["correctedReceipt"]["sha256"] == digest(RECEIPT_PATH),
            "summary correction manifest does not bind the preserved snapshots")
    require(current["job_id"] == "E-ACCEPT-BROWSER" and current["worker"] == "N3" and
            current["status"] == "accepted" and current["outcome"] == "mixed_change" and
            isinstance(current.get("summary"), str) and current["summary"].strip(),
            "author receipt protocol fields are invalid")
    require(current["decision"]["globalMilestoneAcceptance"] is False and
            current["decision"]["localArchiveIntegrityAccepted"] is False,
            "author packet overclaims global or local archive acceptance")
    require(current["sourceIdentity"] == {
        "commit": "60b5aeff3172837ad7831c2b78b210454a3d81a2",
        "tree": "cc3a129b4372d00d5168135aa2e5687dfbf6788f",
        "directParent": "a2e1164d68abaaa7d028bdaf6a20bea842a131ae",
        "publicationBinding": current["sourceIdentity"]["publicationBinding"],
    }, "author packet source identity mismatch")
    require(current["localExecution"]["archiveIntegrity"]["status"] == "rejected" and
            current["localExecution"]["archiveIntegrity"]["cause"] == "unknown",
            "local archive failure is not preserved as rejected/unknown")
    require(current["hostedCI"]["receiptStatus"] == "passed" and
            current["hostedCI"]["receiptMode"] == "full" and
            current["hostedCI"]["independentFullArchiveVerification"] == "passed" and
            current["hostedCI"]["innerManifestFiles"] == current["hostedCI"]["innerTarFiles"] == 189,
            "hosted full archive evidence does not meet the complete gate")
    require(digest(RECEIPT_PATH) == "39d94e3c999ce9902e33af41947191d830bb49e18b2318eccb1e627c70ad3046",
            "final author receipt digest differs from its correction manifest")
    require(digest(REPORT_PATH) == "8b35fd477ba075b27d4b070d25cc321453492c8a28868e855cccbc21d752d94a",
            "author report bytes changed after review began")

    local_cap = load(LOCAL / "matrix/capabilities.capability.browser.capture.json")
    hosted_cap = load(HOSTED / "matrix/capabilities.capability.browser.capture.json")
    local_check = load(LOCAL / "matrix/capabilities.capability-check.json")
    hosted_check = load(HOSTED / "matrix/capabilities.capability-check.json")
    expected_ids = [
        "rejected-state", "rejected-view", "rejected-dom", "rejected-pending",
        "compatible-state", "compatible-view", "compatible-dom", "compatible-pending",
        "host-option-accessor-construction",
    ]
    check_summaries = {}
    for label, capture, check, attempt in (("local", local_cap, local_check, LOCAL),
                                            ("hosted", hosted_cap, hosted_check, HOSTED)):
        groups = capture["admissions"]
        rows = groups["admissions"] + groups["hostDescriptorCases"] + groups["rendererDescriptorCases"]
        require(len(rows) == 19 and all(row.get("rejected") is True and row.get("errorName") == "TypeError"
                and row.get("initCalls") == row.get("updateCalls") == row.get("viewCalls") == row.get("rendererCalls") == 0
                and row.get("containerEmpty") is True for row in rows), f"{label}: 19 admissions are not pre-init/render")
        host_option = next(row for row in groups["hostDescriptorCases"]
                           if row["id"] == "accessor-host-capabilities-property")
        require(host_option["optionAccessorConstructed"] is True and host_option["optionGetterCalls"] == 0,
                f"{label}: host option getter construction/call evidence differs")
        require(all(raw_preserved(capture, key) for key in ("rejected", "compatible")),
                f"{label}: raw state/view/DOM/pending differs across a swap")
        require(check["status"] == "matched" and
                check["swap"]["rejected"]["rawPreservationVerified"] is True and
                check["swap"]["compatible"]["rawPreservationVerified"] is True,
                f"{label}: check does not independently report both raw-preservation assertions")
        controls = check["capabilityMutationControls"]
        require(check["capabilityMutationControlsDetected"] == 9 and
                [row["id"] for row in controls] == expected_ids and
                all(row.get("detected") is True and isinstance(row.get("error"), str) and row["error"]
                    for row in controls), f"{label}: 9 capture mutations missing or undetected")
        lifecycle = load(attempt / "matrix/capabilities.lifecycle.check.json")
        require(lifecycle["status"] == "matched" and lifecycle["mutationControlsDetected"] == 8 and
                len(lifecycle["mutationControls"]) == 8 and
                all(row.get("detected") is True for row in lifecycle["mutationControls"]),
                f"{label}: 8 inherited mutation controls missing or undetected")
        require(len(capture["swap"]["finalTrace"]["ticks"]) == 5 and
                capture["swap"]["rejected"]["missingCapability"] == "view.node" and
                capture["swap"]["rejected"]["diagnostic"]["phase"] == "admission" and
                capture["swap"]["rejected"]["diagnostic"]["oldUnmounted"] is False and
                capture["swap"]["rejected"]["diagnostic"]["toGeneration"] is None,
                f"{label}: rejected swap / five-tick evidence mismatch")
        require(capture["swap"]["oldActiveClickAccepted"] is True and
                capture["swap"]["oldCallbackFencedAfterCommit"] is True and
                capture["swap"]["replyAccepted"] is True and
                capture["swap"]["disabledClick"]["targetDisabled"] is True and
                capture["swap"]["disabledClick"]["beforeTicks"] == capture["swap"]["disabledClick"]["afterTicks"],
                f"{label}: post-rejection/swap interaction evidence mismatch")
        event_replacements = [capture["swap"]["rejected"]["diagnostic"],
                              capture["swap"]["compatible"]["after"]["diagnostics"]["replacements"][-1]]
        require(all(row.get("focusCaptured") is False and row.get("focusRestored") is False
                    for row in event_replacements), f"{label}: focus facts differ from false/false")
        check_summaries[label] = {
            "admissions": len(rows),
            "rawRejectedPreserved": True,
            "rawCompatiblePreserved": True,
            "fiveTicks": len(capture["swap"]["finalTrace"]["ticks"]),
            "captureMutationsDetected": len(controls),
            "inheritedMutationsDetected": len(lifecycle["mutationControls"]),
            "focusCapturedRestored": [[row["focusCaptured"], row["focusRestored"]]
                                        for row in event_replacements],
        }

    catalog = load(CATALOG_PATH)
    require(digest(CATALOG_PATH) == current["terminalCatalog"]["sha256"] and
            catalog["runCount"] == catalog["jobCount"] == 30 and
            catalog["eventCounts"] == {"push": 15, "pull_request": 15} and
            catalog["runStatusCounts"] == {"completed:success": 30} and
            catalog["jobStatusCounts"] == {"completed:success": 30} and
            catalog["allRunHeadShasMatchSource"] is True and
            catalog["sourceCohortGreen"] is True,
            "terminal source run/job catalog is not 30/30 successful and source-bound")
    epoch = load(EPOCH_PATH)
    require(epoch["epoch"] == 32 and epoch["assignments"]["N6"] == "XR-ACCEPT-BROWSER" and
            epoch["dispatch"]["N6"] == "XR-ACCEPT-BROWSER" and
            epoch["eligible"]["XR-ACCEPT-BROWSER"] == ["N6"] and
            epoch["native_constraints"]["solved"] is True and epoch["native_constraints"]["brokenVal"] == 0 and
            epoch["native_constraints"]["brokenCount"] == 0 and
            all(constraint["value"] == 0 for constraint in epoch["native_constraints"]["constraints"]) and
            epoch["independent_capacity_check"] is True and epoch["independent_eligibility_check"] is True and
            epoch["exact_score"] == epoch["native_score"] == 400,
            "native epoch 32 assignment/eligibility/constraints mismatch")

    archive_path = PROVIDER / "primary-push-run-41193504188-inner-verification.json"
    archive_result = json.loads((REVIEW / "hosted-complete-archive.stdout.json").read_text())
    require(archive_result["completeAcceptance"] is True and archive_result["status"] == "verified" and
            archive_result["memberCount"] == 189 and archive_result["sourcePinCount"] == 163,
            "independent complete archive verifier output does not pass")

    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True, check=True).stdout.strip()
    tree = subprocess.run(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True, capture_output=True, check=True).stdout.strip()
    parent = subprocess.run(["git", "rev-parse", "HEAD^"], cwd=ROOT, text=True, capture_output=True, check=True).stdout.strip()
    require((head, tree, parent) == (current["sourceIdentity"]["commit"], current["sourceIdentity"]["tree"],
                                     current["sourceIdentity"]["directParent"]),
            "checked-out source identity differs from the author packet")

    audit_index_path = REVIEW / "audit-index.json"
    review_index = load(audit_index_path)
    command_records = review_index["commands"]
    for name in ("local-audit", "hosted-audit", "local-hosted-compare", "hosted-zip-audit"):
        require(command_records[name]["exitCode"] == 0 and command_records[name]["stderrBytes"] == 0,
                f"independent browser verification command failed: {name}")
        stdout_path = REVIEW / f"{name}.stdout.log"
        stderr_path = REVIEW / f"{name}.stderr.log"
        exit_path = REVIEW / f"{name}.exit-code"
        require(digest(stdout_path) == command_records[name]["stdoutSha256"] and
                digest(stderr_path) == command_records[name]["stderrSha256"] and
                exit_path.read_text().strip() == "0",
                f"saved command result differs from audit index: {name}")
    require(command_records["local-hosted-compare"]["verifiedFacts"]["rejectedAndCompatibleRawStateViewDomPendingMatchAcrossRuns"] is True and
            command_records["local-hosted-compare"]["verifiedFacts"]["captureMutationsDetectedPerRun"] == 9 and
            command_records["local-hosted-compare"]["verifiedFacts"]["inheritedMutationsDetectedPerRun"] == 8 and
            command_records["local-hosted-compare"]["verifiedFacts"]["fiveTickTraceMatches"] is True and
            command_records["local-hosted-compare"]["verifiedFacts"]["focusDiagnostics"]["interpretation"].endswith("no focus identity claim."),
            "local-hosted comparison facts are incomplete or overclaim focus")

    # Re-run the full read-only native scheduler audit between two exact input
    # inventories so this packet binds the protocol result to a stable snapshot.
    native_before = native_input_pins()
    native_command = ["python3", "compiled-capabilities/coordination/acceptance/scheduler/audit.py", "--json"]
    native_run = subprocess.run(native_command, cwd=ROOT, text=True, capture_output=True)
    native_after = native_input_pins()
    (REVIEW / "native-protocol-audit.stdout.json").write_text(native_run.stdout, encoding="utf-8")
    (REVIEW / "native-protocol-audit.stderr.log").write_text(native_run.stderr, encoding="utf-8")
    (REVIEW / "native-protocol-audit.exit-code").write_text(f"{native_run.returncode}\n", encoding="utf-8")
    native_result = json.loads(native_run.stdout)
    require(native_run.returncode == 0 and native_before == native_after and
            native_result["read_only"] is True and not native_result["errors"] and
            native_result["status"] in {"PASS", "INCOMPLETE"},
            "global native protocol audit failed or its inputs changed during the read")
    native_inventory_sha = sha(json.dumps(native_before, sort_keys=True, separators=(",", ":")).encode())
    native_record = {
        "command": native_command,
        "exitCode": native_run.returncode,
        "stdoutBytes": len(native_run.stdout.encode()),
        "stderrBytes": len(native_run.stderr.encode()),
        "stdoutSha256": sha(native_run.stdout.encode()),
        "stderrSha256": sha(native_run.stderr.encode()),
        "status": native_result["status"],
        "accepted_epoch_count": native_result["accepted_epoch_count"],
        "accepted_epochs": native_result["accepted_epochs"],
        "initial_spawn_count": native_result["initial_spawn_count"],
        "worker_count": native_result["worker_count"],
        "packet_count": native_result["packet_count"],
        "errors": native_result["errors"],
        "incomplete": native_result["incomplete"],
        "read_only": native_result["read_only"],
        "inputPinsStableDuringAudit": native_before == native_after,
        "inputFileCount": len(native_before),
        "inputInventorySha256": native_inventory_sha,
    }
    command_records["native-protocol-audit"] = native_record
    audit_index_path.write_text(json.dumps(review_index, indent=2) + "\n", encoding="utf-8")

    result = {
        "schema": "gobi.compiled-capabilities-browser-independent-review/v1",
        "status": "passed",
        "source": {"commit": head, "tree": tree, "parent": parent},
        "authorPacket": {
            "reportPath": str(REPORT_PATH.relative_to(ROOT)), "reportBytes": len(report_bytes), "reportSha256": sha(report_bytes),
            "receiptPath": str(RECEIPT_PATH.relative_to(ROOT)), "receiptBytes": RECEIPT_PATH.stat().st_size,
            "receiptSha256": digest(RECEIPT_PATH), "correctedOnly": ["outcome", "summary"],
            "priorSnapshots": [{"path": str(before_outcome_path.relative_to(ROOT)), "sha256": digest(before_outcome_path)},
                               {"path": str(before_summary_path.relative_to(ROOT)), "sha256": digest(before_summary_path)}],
        },
        "browserRuns": check_summaries,
        "terminalCatalog": {"path": str(CATALOG_PATH.relative_to(ROOT)), "sha256": digest(CATALOG_PATH),
                            "runCount": catalog["runCount"], "jobCount": catalog["jobCount"],
                            "push": catalog["eventCounts"]["push"], "pullRequest": catalog["eventCounts"]["pull_request"],
                            "allRunsAndJobsSuccessful": True},
        "hostedArchive": {"verification": "completeAcceptance=true", "innerArchiveSha256": archive_result["archive"]["sha256"],
                           "manifestSha256": archive_result["manifest"]["sha256"], "members": archive_result["memberCount"],
                           "sourcePins": archive_result["sourcePinCount"]},
        "localArchive": {"status": current["localExecution"]["archiveIntegrity"]["status"],
                          "actualSha256": current["localExecution"]["archiveIntegrity"]["actualSha256"],
                          "cause": current["localExecution"]["archiveIntegrity"]["cause"],
                          "claim": "rejected; cause unknown"},
        "nativeProtocol": {"epoch": epoch["epoch"], "n6Assignment": epoch["assignments"]["N6"],
                           "eligibleWorkers": epoch["eligible"]["XR-ACCEPT-BROWSER"],
                           "nativeSolve": epoch["native_constraints"]["solved"],
                           "allConstraintValuesZero": True, "exactAndNativeScore": epoch["native_score"],
                           "globalAuditStatus": native_result["status"],
                           "globalAuditErrors": native_result["errors"],
                           "openPackets": native_result["incomplete"],
                           "acceptedEpochCount": native_result["accepted_epoch_count"],
                           "nativeInputsStableDuringAudit": native_before == native_after,
                           "nativeInputFileCount": len(native_before),
                           "nativeInputInventorySha256": native_inventory_sha},
        "reviewDecision": "accepted",
        "scope": "current-source browser evidence only; no global milestone acceptance",
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
