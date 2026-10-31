#!/usr/bin/env python3
"""Independent read-only cross-check of the final DOM/React CI evidence."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[6]
CI = ROOT / "compiled-backends/ci/2026-10-31"
EXTRACTED = CI / "extracted"
REVIEW = Path(__file__).resolve().parent
FIXTURES = ("counter", "effect", "form", "list", "list-growth")
BASE = "832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb"
HEAD = "195c9433179218348d4b9f2477ae1e0725337d15"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def git_blob(commit: str, path: str) -> bytes:
    return subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=ROOT)


def file_pin(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    return {"bytes": len(data), "sha256": sha(data)}


def main() -> dict[str, Any]:
    report_path = CI / "coordination/reports/R-CI-DOM-FINAL.md"
    receipt_path = CI / "coordination/receipts/R-CI-DOM-FINAL.json"
    source_audit_path = CI / "lanes/dom/final/source-audit.md"
    verifier_path = CI / "lanes/dom/final/verify-final-evidence.py"
    audit_summary_path = CI / "lanes/dom/final/audit-summary.json"
    report, receipt = report_path.read_text(), read_json(receipt_path)
    source_audit = source_audit_path.read_text()
    provenance = read_json(CI / "primary-provenance.json")
    run = read_json(CI / "primary-run.json")
    jobs = read_json(CI / "primary-jobs.json")["jobs"]
    provider = read_json(CI / "artifact.json")["artifacts"][0]
    index = read_json(CI / "retained-index.json")
    index_by_path = {row["path"]: row for row in index}
    assert len(index_by_path) == len(index) == 817
    assert provenance["sourceHead"] == HEAD and provenance["sourceTree"] == "c0e4a66eee3fdd8b789e1b565167856fdab62433"
    assert run["head_sha"] == HEAD and run["event"] == "push" and run["conclusion"] == "success"
    assert receipt["outcome"] == "confirmed_reuse"
    assert receipt["evidence"]["primary_ci"]["source_head"] == HEAD

    # Verify actual provider archive bytes and each indexed member/extraction.
    zip_path = CI / "original.zip"
    zip_data = zip_path.read_bytes()
    zip_sha = sha(zip_data)
    zip_members: list[str]
    with zipfile.ZipFile(zip_path) as archive:
        assert archive.testzip() is None
        zip_members = sorted(member.filename for member in archive.infolist() if not member.is_dir())
        archive_mismatches = []
        for rel, row in index_by_path.items():
            data = archive.read(rel)
            if len(data) != row["bytes"] or sha(data) != row["sha256"]:
                archive_mismatches.append(rel)
    extraction_mismatches = []
    for rel, row in index_by_path.items():
        path = EXTRACTED / rel
        if not path.is_file() or path.stat().st_size != row["bytes"] or sha(path.read_bytes()) != row["sha256"]:
            extraction_mismatches.append(rel)
    assert zip_sha == provenance["artifactZipSha256"] == provider["digest"].removeprefix("sha256:")
    assert len(zip_data) == provenance["artifactZipBytes"] == provider["size_in_bytes"]
    assert len(zip_members) == 817 and zip_members == sorted(index_by_path)
    assert not archive_mismatches and not extraction_mismatches

    # Recompute source pins against exact Git blobs, not merely the mutable checkout.
    execution_path = EXTRACTED / "compiled-frontend/artifacts/execution.json"
    backend_execution_path = EXTRACTED / "compiled-backends/artifacts/execution.json"
    frontend_execution, backend_execution = read_json(execution_path), read_json(backend_execution_path)
    pin_sets: dict[str, Any] = {}
    for name, execution, expected_count in (
        ("compiledFrontend", frontend_execution, 122),
        ("compiledBackends", backend_execution, 126),
    ):
        before, after = execution["sourceBefore"], execution["sourceAfter"]
        mismatches = [
            row["path"] for row in before
            if sha(git_blob(HEAD, row["path"])) != row["sha256"]
        ]
        assert execution["status"] == "passed" and before == after
        assert execution.get("sourcePinsMatch", True) and len(before) == len(after) == expected_count
        assert not mismatches
        pin_sets[name] = {
            "beforeCount": len(before),
            "afterCount": len(after),
            "beforeAfterIdentical": before == after,
            "allBeforePinsMatchExactHead": True,
            "executionSha256": sha((EXTRACTED / ("compiled-frontend/artifacts/execution.json" if name == "compiledFrontend" else "compiled-backends/artifacts/execution.json")).read_bytes()),
        }

    # Check managed Chromium setup and the recorded Node/TAP execution/log hashes.
    assert frontend_execution["environment"]["CHROMIUM_PATH"] is None
    assert frontend_execution["environment"]["CHROMIUM_EXECUTABLE_PATH"] is None
    node_command = next(row for row in frontend_execution["commands"] if row["name"] == "node-tests")
    assert node_command["exitCode"] == 0 and node_command["environmentOverrides"] == {}
    node_stdout_path = EXTRACTED / "compiled-frontend/artifacts/logs/node-tests.stdout.log"
    node_stderr_path = EXTRACTED / "compiled-frontend/artifacts/logs/node-tests.stderr.log"
    tap = node_stdout_path.read_text()
    tap_passed = len(re.findall(r"^ok \d+ ", tap, re.M))
    tap_failed = len(re.findall(r"^not ok \d+ ", tap, re.M))
    assert (tap_passed, tap_failed) == (97, 0)
    assert sha(node_stdout_path.read_bytes()) == node_command["stdoutSha256"]
    assert sha(node_stderr_path.read_bytes()) == node_command["stderrSha256"]
    assert all(re.search(rf"^ok {n}\b", tap, re.M) for n in (41, 42, 43, 44, 48))
    job = next(row for row in jobs if row["id"] == provenance["job"])
    managed_step = next(row for row in job["steps"] if row["name"] == "Install Playwright managed Chromium")
    assert job["conclusion"] == managed_step["conclusion"] == "success"
    versions = frontend_execution["versions"]
    assert versions["node"] == "v22.23.4" and versions["playwright"] == "1.64.1"
    assert versions["react"] == versions["react-dom"] == "19.3.1"

    # Recompute every matrix status, snapshot/control equality, swap, and focus witness.
    fixture_rows: list[dict[str, Any]] = []
    for name in FIXTURES:
        base = EXTRACTED / "compiled-backends/artifacts/conformance"
        check_path = base / f"{name}.json.check.json"
        browser_path = base / f"{name}.json.browser.json"
        check, browser = read_json(check_path), read_json(browser_path)
        assert check["status"] == "matched"
        assert all(value == "matched" for value in check["backends"].values())
        assert not browser["pageErrors"]
        profiles = browser["profiles"]
        profile_names = ("react", "dom", "swap")
        ticks = {profile: profiles[profile]["trace"]["ticks"] for profile in profile_names}
        assert len({len(ticks[profile]) for profile in profile_names}) == 1
        equal = all(ticks["react"][i]["dom"] == ticks["dom"][i]["dom"] == ticks["swap"][i]["dom"] for i in range(len(ticks["react"])))
        assert equal
        swap_observations = profiles["swap"]["swapObservations"]
        focus = swap_observations["focusAcrossSwap"]
        assert all(row["before"] == row["after"] for row in focus)
        fixture_row = {
            "fixture": name,
            "appId": check["appId"],
            "status": check["status"],
            "backendResults": check["backends"],
            "tickCount": len(ticks["react"]),
            "swapCount": len(swap_observations["events"]),
            "focusWitnessCount": len(focus),
            "snapshotsAndLiveControlsEqualEveryTick": equal,
            "focusAndSelectionPreserved": True,
            "pageErrors": len(browser["pageErrors"]),
            "checkSha256": sha(check_path.read_bytes()),
            "browserSha256": sha(browser_path.read_bytes()),
        }
        if name == "form":
            samples = []
            for profile in profile_names:
                for tick in ticks[profile]:
                    checked = next(field["value"]["bool"] for field in tick["state"]["fields"] if field["name"] == "Checked")
                    control = next(row for row in tick["dom"]["controls"] if row["key"] == "form-checked")
                    samples.append((checked, control["checked"], " checked" in tick["dom"]["html"]))
            assert all(model == live and not serialized for model, live, serialized in samples)
            assert any(model for model, _, _ in samples) and any(not model for model, _, _ in samples)
            fixture_row["checkedControl"] = {
                "sampleCount": len(samples),
                "livePropertyMatchesGoModel": True,
                "serializedCheckedAttributeAbsent": True,
                "trueAndFalseObserved": True,
            }
        fixture_rows.append(fixture_row)
    totals = {
        "distinctApplications": len({row["appId"] for row in fixture_rows}),
        "fixtures": len(fixture_rows),
        "ticks": sum(row["tickCount"] for row in fixture_rows),
        "swaps": sum(row["swapCount"] for row in fixture_rows),
        "focusWitnesses": sum(row["focusWitnessCount"] for row in fixture_rows),
    }
    assert totals == {"distinctApplications": 4, "fixtures": 5, "ticks": 43, "swaps": 37, "focusWitnesses": 9}

    # Confirm renderer implementation/view-contract pins stayed at the consumed packet values.
    old_receipt = read_json(CI / "coordination/receipts/E-CI-DOM.json")
    old_pins = old_receipt["evidence"]["source_sha256"]
    renderer_stable_paths = (
        "compiled-frontend/frontend/dom/renderer.mjs",
        "compiled-frontend/frontend/shared/view.mjs",
        "compiled-frontend/frontend/react/renderer.mjs",
        "compiled-frontend/frontend/react/renderer.test.mjs",
        "compiled-frontend/frontend/react/bindings.test.mjs",
    )
    renderer_pins = {path: {"previous": old_pins[path], "current": sha(git_blob(HEAD, path)), "same": old_pins[path] == sha(git_blob(HEAD, path))} for path in renderer_stable_paths}
    assert all(row["same"] for row in renderer_pins.values())
    helper = "compiled-frontend/conformance/browser.mjs"
    assert sha(git_blob(BASE, helper)) == sha(git_blob(HEAD, helper))
    test_paths = (
        "compiled-frontend/frontend/dom/renderer.test.mjs",
        "compiled-frontend/frontend/react/renderer.browser.test.mjs",
    )
    launch_replacement = (
        '  browser = await chromium.launch(chromiumLaunchOptions(process.env.CHROMIUM_PATH));\n'
    )
    old_launch = (
        '  browser = await chromium.launch({\n'
        '    headless: true,\n'
        '    executablePath: process.env.CHROMIUM_PATH || "/tmp/chromium",\n'
        '    args: ["--no-sandbox", "--disable-dev-shm-usage"],\n'
        '  });\n'
    )
    test_changes = {}
    for path in test_paths:
        current = git_blob(HEAD, path).decode()
        old = git_blob(BASE, path).decode()
        assert current.count(launch_replacement) == 1
        assert current.count('import { chromiumLaunchOptions } from "../../conformance/browser.mjs";\n') == 1
        restored = current.replace('import { chromiumLaunchOptions } from "../../conformance/browser.mjs";\n', "", 1).replace(launch_replacement, old_launch, 1)
        assert restored == old
        test_changes[path] = {"changeScope": "shared-launch-helper import and launch call only", "allOtherBytesMatchBase": True}
    changed_paths = subprocess.check_output(["git", "diff", "--name-only", BASE, HEAD], cwd=ROOT, text=True).splitlines()
    expected_changed = {
        "compiled-backends/PORTABLE-BROWSER-REPAIR.json",
        "compiled-backends/PORTABLE-BROWSER-REPAIR.md",
        "compiled-backends/RESULTS.md",
        *test_paths,
    }
    assert set(changed_paths) == expected_changed

    # Verify old E-CI-DOM packet path mapping and keep the 832 failure distinct.
    canonical_report = CI / "coordination/reports/E-CI-DOM.md"
    canonical_receipt = CI / "coordination/receipts/E-CI-DOM.json"
    location_correction = CI / "lanes/dom/location-correction.md"
    mapping = {
        "reportSha256": sha(canonical_report.read_bytes()),
        "receiptSha256": sha(canonical_receipt.read_bytes()),
        "locationCorrectionSha256": sha(location_correction.read_bytes()),
        "sourceScopeRetainsHistoricalPaths": any("compiled-backends/coordination/reports/E-CI-DOM.md" == value for value in old_receipt["source_scope"]),
        "canonicalReportReferenced": "compiled-backends/ci/2026-10-31/coordination/reports/E-CI-DOM.md" in source_audit,
        "canonicalReceiptReferenced": "compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-DOM.json" in source_audit,
    }
    assert mapping["reportSha256"] == "a141f71c0b289d7b16c027ae331a1c89de39e8c0a5d8e3a3cd20875794848e59"
    assert mapping["receiptSha256"] == "ff9b86058e17a425196d26c21593801d737549029fa954a9477080c066429af8"
    assert mapping["sourceScopeRetainsHistoricalPaths"] and mapping["canonicalReportReferenced"] and mapping["canonicalReceiptReferenced"]
    old_dir = CI / "initial-source832"
    old_artifact = read_json(old_dir / "artifact.json")["artifacts"][0]
    old_zip = old_dir / "source.zip"
    old_zip_sha = sha(old_zip.read_bytes())
    assert old_zip_sha == old_artifact["digest"].removeprefix("sha256:")
    old_index = read_json(old_dir / "index.json")
    assert old_index["zipSha256"] == old_zip_sha and len(old_index["members"]) == 38
    old_log = old_dir / "extracted/compiled-frontend/artifacts/logs/node-tests.stdout.log"
    old_tap = old_log.read_text()
    old_failed = [int(value) for value in re.findall(r"^not ok (\d+) ", old_tap, re.M)]
    old_passed = len(re.findall(r"^ok \d+ ", old_tap, re.M))
    old_failure_separate = (
        old_artifact["workflow_run"]["id"] == 41153480221
        and old_artifact["id"] == 13025052808
        and old_artifact["workflow_run"]["head_sha"] == BASE
        and old_passed == 92
        and old_failed == [41, 42, 43, 44, 48]
        and old_tap.count("executable doesn't exist at /tmp/chromium") == 5
    )
    assert old_failure_separate and old_artifact["id"] != provenance["artifact"]

    result = {
        "schema": "gobi.dom-final-review-crosscheck/v1",
        "job_id": "XR-R-CI-DOM-FINAL",
        "worker": "N5",
        "primary": {
            "head": HEAD,
            "tree": "c0e4a66eee3fdd8b789e1b565167856fdab62433",
            "run": provenance["run"],
            "job": provenance["job"],
            "artifact": provenance["artifact"],
            "event": provenance["event"],
            "conclusion": provenance["conclusion"],
            "zipBytes": len(zip_data),
            "zipSha256": zip_sha,
            "zipCrcValid": True,
            "zipMembers": len(zip_members),
            "indexedExtractionCount": len(index),
            "allZipAndExtractionPinsMatch": True,
        },
        "sourcePins": pin_sets,
        "managedBrowserTests": {
            "chromiumPath": frontend_execution["environment"]["CHROMIUM_PATH"],
            "chromiumExecutablePath": frontend_execution["environment"]["CHROMIUM_EXECUTABLE_PATH"],
            "nodeCommandOverrides": node_command["environmentOverrides"],
            "managedChromiumInstallStep": {"status": managed_step["status"], "conclusion": managed_step["conclusion"]},
            "nodeVersion": versions["node"],
            "playwrightVersion": versions["playwright"],
            "react": versions["react"],
            "reactDom": versions["react-dom"],
            "testsPassed": tap_passed,
            "testsFailed": tap_failed,
            "stdoutSha256": sha(node_stdout_path.read_bytes()),
            "stderrSha256": sha(node_stderr_path.read_bytes()),
        },
        "matrix": {"fixtures": fixture_rows, "totals": totals},
        "rendererAndSharedContract": {
            "unchangedCorePins": renderer_pins,
            "sharedBrowserHelperUnchanged": True,
            "browserTestFilesOnlyChangeLauncher": test_changes,
            "baseToHeadChangedPaths": changed_paths,
        },
        "canonicalOldPacketMapping": mapping,
        "historical832Failure": {
            "run": old_artifact["workflow_run"]["id"],
            "artifact": old_artifact["id"],
            "head": old_artifact["workflow_run"]["head_sha"],
            "sourceZipSha256": old_zip_sha,
            "nodeTestsPassed": old_passed,
            "failedTestNumbers": old_failed,
            "failureMessageCount": old_tap.count("executable doesn't exist at /tmp/chromium"),
            "keptSeparateFromCurrentSuccess": old_failure_separate,
        },
        "packetPins": {
            "inputReport": file_pin(CI / "coordination/reports/R-CI-DOM-FINAL.md"),
            "inputReceipt": file_pin(CI / "coordination/receipts/R-CI-DOM-FINAL.json"),
            "sourceAudit": file_pin(source_audit_path),
            "n2Verifier": file_pin(verifier_path),
            "n2AuditSummary": file_pin(audit_summary_path),
        },
        "recommendation": "accepted",
        "reason": "The exact-head source pins, managed-browser execution proof, five-fixture traces/snapshots, canonical E-CI-DOM mapping, and separate 832d212 failure all independently verify. No scope or evidence inconsistency was found.",
    }
    out = REVIEW / "artifact-crosscheck.json"
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "result": str(out.relative_to(ROOT)),
        "resultSha256": sha(out.read_bytes()),
        "sourcePinCounts": {k: (v["beforeCount"], v["afterCount"]) for k, v in pin_sets.items()},
        "managedBrowserTests": (tap_passed, tap_failed),
        "matrixTotals": totals,
        "historical832Failure": {"passed": old_passed, "failed": old_failed, "separate": old_failure_separate},
        "recommendation": result["recommendation"],
    }, indent=2))
    return result


if __name__ == "__main__":
    main()
