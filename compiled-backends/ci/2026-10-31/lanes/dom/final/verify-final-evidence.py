#!/usr/bin/env python3
"""Read-only verifier for the immutable R-CI-DOM-FINAL CI evidence bundle."""

from __future__ import annotations

import hashlib
import json
import re
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
CI = ROOT / "compiled-backends/ci/2026-10-31"
EXTRACTED = CI / "extracted"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text())


def verify_source_pins(execution_path: Path) -> dict:
    execution = read_json(execution_path)
    before = execution["sourceBefore"]
    after = execution["sourceAfter"]
    missing, mismatched = [], []
    for record in before:
        source = ROOT / record["path"]
        if not source.is_file():
            missing.append(record["path"])
        elif sha256(source) != record["sha256"]:
            mismatched.append(record["path"])
    if before != after:
        mismatched.append("sourceBefore differs from sourceAfter")
    pins_match = execution.get("sourcePinsMatch", len(before) == len(after))
    assert execution["status"] == "passed"
    assert len(before) == len(after)
    assert pins_match and not missing and not mismatched
    return {
        "execution": str(execution_path.relative_to(CI)),
        "executionSha256": sha256(execution_path),
        "sourceBefore": len(before),
        "sourceAfter": len(after),
        "sourcePinsMatch": pins_match,
        "missing": missing,
        "mismatched": mismatched,
        "status": execution["status"],
    }


def verify_fixture(name: str) -> dict:
    base = EXTRACTED / "compiled-backends/artifacts/conformance"
    check_path = base / f"{name}.json.check.json"
    browser_path = base / f"{name}.json.browser.json"
    check, browser = read_json(check_path), read_json(browser_path)
    profiles = browser["profiles"]
    ticks = {key: profiles[key]["trace"]["ticks"] for key in ("react", "dom", "swap")}
    tick_counts = {len(value) for value in ticks.values()}
    assert len(tick_counts) == 1
    dom_equal = all(
        ticks["react"][i]["dom"] == ticks["dom"][i]["dom"] == ticks["swap"][i]["dom"]
        for i in range(len(ticks["react"]))
    )
    focus_witnesses = profiles["swap"]["swapObservations"]["focusAcrossSwap"]
    swaps = profiles["swap"]["swapObservations"]["events"]
    assert check["status"] == "matched"
    assert all(value == "matched" for value in check["backends"].values())
    assert not browser["pageErrors"] and dom_equal
    assert all(witness["before"] == witness["after"] for witness in focus_witnesses)

    record = {
        "check": str(check_path.relative_to(CI)),
        "checkSha256": sha256(check_path),
        "browser": str(browser_path.relative_to(CI)),
        "browserSha256": sha256(browser_path),
        "fixture": check["fixture"],
        "appId": check["appId"],
        "status": check["status"],
        "ticks": check["ticks"],
        "backendResults": check["backends"],
        "swaps": len(swaps),
        "focusAcrossSwap": len(focus_witnesses),
        "allOuterHTMLAndControlsEqualAcrossProfiles": dom_equal,
        "pageErrors": len(browser["pageErrors"]),
        "mutationControlsDetected": check["mutationControlsDetected"],
    }
    if name == "form":
        states = []
        for profile, profile_ticks in ticks.items():
            for tick in profile_ticks:
                checked = next(
                    field["value"]["bool"]
                    for field in tick["state"]["fields"]
                    if field["name"] == "Checked"
                )
                control = next(
                    control for control in tick["dom"]["controls"]
                    if control["key"] == "form-checked"
                )
                states.append((profile, checked, control["checked"], " checked" in tick["dom"]["html"]))
        assert all(model == live and not serialized for _, model, live, serialized in states)
        assert any(model for _, model, _, _ in states)
        assert any(not model for _, model, _, _ in states)
        record["controlledChecked"] = {
            "ticksAcrossProfiles": len(states),
            "livePropertyMatchesModel": True,
            "serializedCheckedAttributePresent": False,
            "observedTrueAndFalse": True,
        }
    return record


def main() -> dict:
    provenance_path = CI / "primary-provenance.json"
    run_path = CI / "primary-run.json"
    job_path = CI / "primary-jobs.json"
    artifact_path = CI / "artifact.json"
    zip_path = CI / "original.zip"
    index_path = CI / "retained-index.json"
    provenance, run = read_json(provenance_path), read_json(run_path)
    jobs, artifact, index = read_json(job_path)["jobs"], read_json(artifact_path)["artifacts"][0], read_json(index_path)
    assert provenance["sourceHead"] == run["head_sha"] == "195c9433179218348d4b9f2477ae1e0725337d15"
    assert provenance["event"] == run["event"] == "push"
    assert provenance["conclusion"] == run["conclusion"] == "success"
    assert provenance["job"] == 124401386239 and provenance["artifact"] == 13025112465
    assert any(job.get("id") == provenance["job"] and job.get("conclusion") == "success" for job in jobs)
    assert artifact["id"] == provenance["artifact"]
    assert zip_path.stat().st_size == provenance["artifactZipBytes"] == 14931201
    assert sha256(zip_path) == provenance["artifactZipSha256"]
    with zipfile.ZipFile(zip_path) as archive:
        assert archive.testzip() is None
    extracted_count = sum(path.is_file() for path in EXTRACTED.rglob("*"))
    assert extracted_count == provenance["readOnlyExtractedFiles"] == 817
    inventory_missing, inventory_mismatch = [], []
    for item in index:
        member = EXTRACTED / item["path"]
        if not member.is_file():
            inventory_missing.append(item["path"])
        elif member.stat().st_size != item["bytes"] or sha256(member) != item["sha256"]:
            inventory_mismatch.append(item["path"])
    assert len(index) == 817 and not inventory_missing and not inventory_mismatch

    frontend_execution = EXTRACTED / "compiled-frontend/artifacts/execution.json"
    backend_execution = EXTRACTED / "compiled-backends/artifacts/execution.json"
    frontend = read_json(frontend_execution)
    assert frontend["environment"]["CHROMIUM_PATH"] is None
    assert frontend["environment"]["CHROMIUM_EXECUTABLE_PATH"] is None
    assert frontend["versions"]["node"] == "v22.23.4"
    assert frontend["versions"]["playwright"] == "1.64.1"
    assert frontend["versions"]["react"] == "19.3.1"
    node_command = next(command for command in frontend["commands"] if command["name"] == "node-tests")
    assert node_command["exitCode"] == 0 and node_command["environmentOverrides"] == {}
    node_log = EXTRACTED / "compiled-frontend/artifacts/logs/node-tests.stdout.log"
    node_stderr = EXTRACTED / "compiled-frontend/artifacts/logs/node-tests.stderr.log"
    tap = node_log.read_text()
    passed = len(re.findall(r"^ok \d+ ", tap, re.M))
    failed = len(re.findall(r"^not ok \d+ ", tap, re.M))
    assert (passed, failed) == (97, 0)
    assert all(re.search(rf"^ok {case}\b", tap, re.M) for case in (41, 42, 43, 44, 48))

    fixtures = [verify_fixture(name) for name in ("counter", "effect", "form", "list", "list-growth")]
    totals = {
        "applications": len({fixture["appId"] for fixture in fixtures}),
        "ticks": sum(fixture["ticks"] for fixture in fixtures),
        "swaps": sum(fixture["swaps"] for fixture in fixtures),
        "focusAcrossSwap": sum(fixture["focusAcrossSwap"] for fixture in fixtures),
    }
    assert totals == {"applications": 4, "ticks": 43, "swaps": 37, "focusAcrossSwap": 9}

    return {
        "schema": "gobi.dom-final-ci-audit/v1",
        "reviewedSource": {
            "head": provenance["sourceHead"],
            "tree": provenance["sourceTree"],
            "parent": provenance["directParent"],
        },
        "primaryCi": {
            "run": provenance["run"],
            "job": provenance["job"],
            "artifact": provenance["artifact"],
            "event": provenance["event"],
            "conclusion": provenance["conclusion"],
            "zipBytes": zip_path.stat().st_size,
            "zipSha256": sha256(zip_path),
            "zipCrcValid": True,
            "extractedFiles": extracted_count,
            "indexedFilesVerified": len(index),
            "indexSha256": sha256(index_path),
            "provenanceSha256": sha256(provenance_path),
            "runSha256": sha256(run_path),
            "jobRecordSha256": sha256(job_path),
            "artifactRecordSha256": sha256(artifact_path),
        },
        "sourcePinAudits": [
            verify_source_pins(frontend_execution),
            verify_source_pins(backend_execution),
        ],
        "nodeTests": {
            "commandName": node_command["name"],
            "commandExecutable": node_command["command"],
            "arguments": node_command["args"],
            "exitCode": node_command["exitCode"],
            "tests": passed + failed,
            "passed": passed,
            "failed": failed,
            "domBrowserCases": [41, 42, 43, 44],
            "reactCheckedBrowserCase": 48,
            "nodeVersion": frontend["versions"]["node"],
            "playwrightVersion": frontend["versions"]["playwright"],
            "chromiumPath": frontend["environment"]["CHROMIUM_PATH"],
            "chromiumExecutablePath": frontend["environment"]["CHROMIUM_EXECUTABLE_PATH"],
            "managedChromiumInstallStep": "completed successfully in the primary CI job",
            "stdoutSha256": sha256(node_log),
            "stderrSha256": sha256(node_stderr),
        },
        "fixtures": fixtures,
        "totals": totals,
        "historical": {
            "previousHead": "832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb",
            "ciFailure": "97 tests: 92 passed, 5 failed because /tmp/chromium was absent",
            "usedAsCurrentSuccessEvidence": False,
        },
        "otherWorkflow": {
            "trackedPrRun": provenance["prRunStillTracked"],
            "claim": "not evaluated by this packet; overall 24-workflow PR-ready gate remains separate",
        },
    }


if __name__ == "__main__":
    print(json.dumps(main(), indent=2, sort_keys=True))
