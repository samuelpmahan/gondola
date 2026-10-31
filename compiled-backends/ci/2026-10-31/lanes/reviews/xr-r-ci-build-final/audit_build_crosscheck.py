#!/usr/bin/env python3
"""Independent read-only cross-check of N4's repaired-head build packet."""

from __future__ import annotations

import copy
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[6]
CI = ROOT / "compiled-backends/ci/2026-10-31"
EXTRACTED = CI / "extracted"
REVIEW = Path(__file__).resolve().parent
APP_PACKAGES = {
    "counter": "github.com/samuelpmahan/gondola/counter",
    "form": "github.com/samuelpmahan/gondola/fixtures/compiled/form",
    "list": "github.com/samuelpmahan/gondola/fixtures/compiled/list",
    "effect": "github.com/samuelpmahan/gondola/fixtures/compiled/effect",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path, label: str) -> dict[str, Any]:
    data = path.read_bytes()
    return {"path": label, "bytes": len(data), "sha256": sha(data)}


def git_blob(path: str, commit: str) -> bytes:
    return subprocess.check_output(["git", "show", f"{commit}:{path}"], cwd=ROOT)


def main() -> None:
    audit_path = CI / "lanes/build/final/artifact-audit.json"
    report_path = CI / "coordination/reports/R-CI-BUILD-FINAL.md"
    receipt_path = CI / "coordination/receipts/R-CI-BUILD-FINAL.json"
    audit = json.loads(audit_path.read_text())
    report = report_path.read_text()
    receipt = json.loads(receipt_path.read_text())
    provenance = json.loads((CI / "primary-provenance.json").read_text())
    provider = json.loads((CI / "artifact.json").read_text())["artifacts"][0]
    index = json.loads((CI / "retained-index.json").read_text())
    index_by_path = {row["path"]: row for row in index}
    source_head = provenance["sourceHead"]

    # Rehash the provider ZIP, ZIP member bytes, index, and extracted copies.
    zip_path = CI / "original.zip"
    zip_sha = sha(zip_path.read_bytes())
    with zipfile.ZipFile(zip_path) as archive:
        zip_members = sorted(member.filename for member in archive.infolist() if not member.is_dir())
        zip_mismatches = []
        for rel, expected in index_by_path.items():
            try:
                data = archive.read(rel)
            except KeyError:
                zip_mismatches.append({"path": rel, "error": "missing_zip_member"})
                continue
            if len(data) != expected["bytes"] or sha(data) != expected["sha256"]:
                zip_mismatches.append({"path": rel, "error": "zip_member_pin_mismatch"})
    extraction_mismatches = []
    for rel, expected in index_by_path.items():
        path = EXTRACTED / rel
        if not path.is_file():
            extraction_mismatches.append({"path": rel, "error": "missing_extracted_file"})
            continue
        data = path.read_bytes()
        if len(data) != expected["bytes"] or sha(data) != expected["sha256"]:
            extraction_mismatches.append({"path": rel, "error": "extracted_pin_mismatch"})

    # Verify primary-head/run and independently recompute all output inventories.
    current_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    assert current_head == source_head == provenance["actualCheckout"]
    assert zip_sha == provider["digest"].removeprefix("sha256:") == provenance["artifactZipSha256"]
    assert zip_path.stat().st_size == provider["size_in_bytes"] == provenance["artifactZipBytes"]
    assert zip_members == sorted(index_by_path)
    assert not zip_mismatches and not extraction_mismatches

    builds = {}
    physical = {}
    for backend in ("react", "dom"):
        base = EXTRACTED / "compiled-backends/artifacts/compiled" / backend
        result_path = EXTRACTED / f"compiled-backends/artifacts/{backend}-build-result.json"
        result = json.loads(result_path.read_text())
        manifest_path = base / "buildmanifest.json"
        manifest = json.loads(manifest_path.read_text())
        files = sorted(path.relative_to(base).as_posix() for path in base.rglob("*") if path.is_file())
        result_by_path = {row["path"]: row for row in result["outputs"]}
        actual_by_path = {}
        mismatches = []
        for rel in files:
            data = (base / rel).read_bytes()
            actual = {"path": rel, "bytes": len(data), "sha256": sha(data)}
            actual_by_path[rel] = actual
            recorded = result_by_path.get(rel)
            if recorded is None or recorded["bytes"] != len(data) or recorded["sha256"] != actual["sha256"]:
                mismatches.append(rel)
        apps = {row["packagePath"]: row for row in manifest["apps"]}
        assert result["ok"] is True and result["diagnostics"] == []
        assert len(result["apps"]) == 4 and len(result["outputs"]) == len(files) == 209
        assert set(result_by_path) == set(files) and not mismatches
        assert len(manifest["apps"]) == 4 and len(apps) == 4
        assert set(apps) == set(APP_PACKAGES.values())
        assert all(row["backend"] == backend for row in manifest["apps"])
        assert len(manifest["forwarderSources"]) == 5 and len(manifest["emittedTypeScript"]) == 186
        assert sum(path.endswith(".ts") for path in files) == 186
        assert sum(path.endswith(".go") for path in files) == 4
        raw_bundles = []
        for app in manifest["apps"]:
            rel = app["module"]
            raw_bundles.append(actual_by_path[rel])
        physical[backend] = actual_by_path
        builds[backend] = {
            "appCount": len(result["apps"]),
            "outputCount": len(files),
            "buildResultSha256": sha(result_path.read_bytes()),
            "manifest": file_record(manifest_path, f"compiled-backends/artifacts/compiled/{backend}/buildmanifest.json"),
            "backendTags": [row["backend"] for row in manifest["apps"]],
            "packagePaths": sorted(apps),
            "forwarderSourceCount": len(manifest["forwarderSources"]),
            "emittedTypeScriptCount": len(manifest["emittedTypeScript"]),
            "allOutputHashesMatchBuildResult": not mismatches,
            "rawBundles": sorted(raw_bundles, key=lambda row: row["path"]),
        }

    react_result = json.loads((EXTRACTED / "compiled-backends/artifacts/react-build-result.json").read_text())
    dom_result = json.loads((EXTRACTED / "compiled-backends/artifacts/dom-build-result.json").read_text())
    react_manifest = json.loads((EXTRACTED / "compiled-backends/artifacts/compiled/react/buildmanifest.json").read_text())
    dom_manifest = json.loads((EXTRACTED / "compiled-backends/artifacts/compiled/dom/buildmanifest.json").read_text())
    react_without_tags, dom_without_tags = copy.deepcopy(react_manifest), copy.deepcopy(dom_manifest)
    for manifest in (react_without_tags, dom_without_tags):
        for row in manifest["apps"]:
            row.pop("backend", None)
    assert react_result["apps"] == dom_result["apps"]
    assert react_without_tags == dom_without_tags
    assert builds["react"]["packagePaths"] == builds["dom"]["packagePaths"]

    all_paths = set(physical["react"])
    excluded = {"buildmanifest.json"} | {row["module"] for row in react_manifest["apps"]}
    companions = sorted(all_paths - excluded)
    assert len(excluded) == 5 and len(companions) == 204
    companion_mismatches = []
    companion_rows = []
    for rel in companions:
        react_bytes = (EXTRACTED / "compiled-backends/artifacts/compiled/react" / rel).read_bytes()
        dom_bytes = (EXTRACTED / "compiled-backends/artifacts/compiled/dom" / rel).read_bytes()
        row = physical["react"][rel]
        if react_bytes != dom_bytes:
            companion_mismatches.append(rel)
        companion_rows.append(row)
    assert not companion_mismatches
    companion_inventory_digest = sha(json.dumps(companion_rows, sort_keys=True, separators=(",", ":")).encode())
    actual_companion_paths = set(companions)
    assert set(audit["comparison"]["exactCompanionPaths"]) == actual_companion_paths
    assert audit["comparison"]["exactCompanionOutputCount"] == len(companions)

    # Cross-check N4's six Go test/race/vet command records against raw execution logs.
    go_execution_path = EXTRACTED / "compiled-frontend/artifacts/execution.json"
    go_execution = json.loads(go_execution_path.read_text())
    command_by_name = {row["name"]: row for row in go_execution["commands"]}
    go_names = ["root-go-tests", "root-go-race", "root-go-vet", "go-tests", "go-race", "go-vet"]
    go_checks = {}
    go_log_mismatches = []
    for name in go_names:
        command = command_by_name[name]
        files = {}
        for stream in ("stdout", "stderr"):
            rel = f"compiled-frontend/artifacts/logs/{name}.{stream}.log"
            data = (EXTRACTED / rel).read_bytes()
            actual = {"path": rel, "bytes": len(data), "sha256": sha(data)}
            expected = command[f"{stream}Sha256"]
            if actual["sha256"] != expected:
                go_log_mismatches.append({"command": name, "stream": stream})
            files[stream] = {**actual, "matchesExecutionReceipt": actual["sha256"] == expected}
        assert command["exitCode"] == 0 and command["signal"] is None and command["error"] is None
        go_checks[name] = {"args": command["args"], "exitCode": command["exitCode"], **files}
    assert not go_log_mismatches
    assert go_execution["status"] == "passed" and len(go_execution["commands"]) == 33

    # Verify current compiled-frontend source pin sets, GoScript module pin, and all nine build-source hashes.
    source_audit = {}
    for section, before_key, after_key in (
        ("compiledFrontend", "sourceBefore", "sourceAfter"),
        ("backendRunner", "sourceBefore", "sourceAfter"),
    ):
        section_data = audit["goChecks"] if section == "compiledFrontend" else audit["backendRunner"]
        before = section_data[before_key]
        after = section_data[after_key]
        before_pins = before["pins"] if isinstance(before, dict) else before
        after_pins = after["pins"] if isinstance(after, dict) else after
        mismatches = []
        for row in before_pins:
            current = git_blob(row["path"], source_head)
            if sha(current) != row["sha256"]:
                mismatches.append(row["path"])
        source_audit[section] = {
            "beforeCount": len(before_pins),
            "afterCount": len(after_pins),
            "beforeAfterEqual": before_pins == after_pins,
            "allBeforePinsMatchExactHead": not mismatches,
            "mismatches": mismatches,
        }
    assert source_audit["compiledFrontend"]["beforeCount"] == 122
    assert source_audit["backendRunner"]["beforeCount"] == 126
    assert all(row["beforeAfterEqual"] and row["allBeforePinsMatchExactHead"] for row in source_audit.values())
    build_sources = {}
    for path, expected in audit["buildSources"].items():
        actual = sha(git_blob(path, source_head))
        build_sources[path] = {"expectedSha256": expected["sha256"], "actualHeadSha256": actual, "matches": actual == expected["sha256"]}
    assert all(row["matches"] for row in build_sources.values())

    go_mod = (ROOT / "compiled-frontend/go.mod").read_text()
    go_sum = (ROOT / "compiled-frontend/go.sum").read_text()
    goscript_line = next(row for row in go_sum.splitlines() if row.startswith("github.com/s4wave/goscript v0.6.2 h1:"))
    assert "github.com/s4wave/goscript v0.6.2" in go_mod
    assert goscript_line == audit["goscript"]["goSumLine"]
    assert sha((ROOT / "compiled-frontend/go.mod").read_bytes()) == audit["goscript"]["goModSha256"]
    assert sha((ROOT / "compiled-frontend/go.sum").read_bytes()) == audit["goscript"]["goSumSha256"]

    # Verify byte-preserved interim correction and canonical dated final packet paths.
    correction = audit["previousPacketCorrection"]
    old_report = CI / "coordination/reports/E-CI-BUILD.md"
    old_receipt = CI / "coordination/receipts/E-CI-BUILD.json"
    history_report = CI / "coordination/history/E-CI-BUILD-consumed-insufficient.md"
    history_receipt = CI / "coordination/history/E-CI-BUILD-consumed-insufficient.json"
    old_report_bytes, old_receipt_bytes = old_report.read_bytes(), old_receipt.read_bytes()
    old_receipt_json = json.loads(old_receipt_bytes)
    backend_source_bytes = git_blob("compiled-frontend/emit/backend.go", source_head)
    correct_backend_sha = sha(backend_source_bytes)
    wrong_backend_sha = old_receipt_json["evidence"]["reviewed_source_sha256"]["compiled-frontend/emit/backend.go"]
    markdown = (CI / "lanes/build/source-review.md").read_text()
    final_report_record = receipt["report"]
    canonical_report = CI / "coordination/reports/R-CI-BUILD-FINAL.md"
    canonical_receipt = CI / "coordination/receipts/R-CI-BUILD-FINAL.json"
    packet = {
        "correctBackendSha256": correct_backend_sha,
        "wrongConsumedReceiptValue": wrong_backend_sha,
        "receiptContainsKnownMistypedValue": wrong_backend_sha != correct_backend_sha,
        "oldReportShaMatchesAudit": sha(old_report_bytes) == correction["oldReport"]["sha256"],
        "oldReceiptShaMatchesAudit": sha(old_receipt_bytes) == correction["oldReceipt"]["sha256"],
        "historyReportByteIdentical": history_report.read_bytes() == old_report_bytes,
        "historyReceiptByteIdentical": history_receipt.read_bytes() == old_receipt_bytes,
        "historicalMarkdownPinCorrect": correct_backend_sha in markdown,
        "finalReportCanonicalPath": receipt["report"]["path"],
        "finalReceiptCanonicalPath": "compiled-backends/ci/2026-10-31/coordination/receipts/R-CI-BUILD-FINAL.json",
        "finalReportDigestMatchesReceipt": sha(canonical_report.read_bytes()) == final_report_record["sha256"],
    }
    assert packet["receiptContainsKnownMistypedValue"]
    assert packet["oldReportShaMatchesAudit"] and packet["oldReceiptShaMatchesAudit"]
    assert packet["historyReportByteIdentical"] and packet["historyReceiptByteIdentical"]
    assert packet["historicalMarkdownPinCorrect"]
    assert packet["finalReportDigestMatchesReceipt"]
    assert Path(final_report_record["path"]).parts[:4] == ("compiled-backends", "ci", "2026-10-31", "coordination")
    assert canonical_receipt.is_file() and canonical_report.is_file()

    # Record stale statement separately: current worktree now retains the provider ZIP.
    zip_statement_stale = "raw ZIP is not separately retained" in audit["primaryCi"]["providerArchiveMetadata"]["note"]
    report_statement_stale = "archive is not available locally for independent rehash" in report
    result = {
        "schema": "gobi.build-review-crosscheck/v1",
        "job_id": "XR-R-CI-BUILD-FINAL",
        "worker": "N5",
        "primary": {
            "sourceHead": source_head,
            "runId": provenance["run"],
            "jobId": provenance["job"],
            "artifactId": provider["id"],
            "artifactZip": {
                "path": "compiled-backends/ci/2026-10-31/original.zip",
                "bytes": zip_path.stat().st_size,
                "sha256": zip_sha,
                "providerDigestMatches": zip_sha == provider["digest"].removeprefix("sha256:"),
                "providerSizeMatches": zip_path.stat().st_size == provider["size_in_bytes"],
                "memberCount": len(zip_members),
                "memberPinsMatchRetainedIndex": not zip_mismatches,
            },
            "retainedExtraction": {"indexCount": len(index), "extractedMatchesIndex": not extraction_mismatches},
        },
        "builds": builds,
        "comparison": {
            "appResultObjectsIdentical": react_result["apps"] == dom_result["apps"],
            "manifestsEqualAfterRemovingOnlyBackendTags": react_without_tags == dom_without_tags,
            "companionCount": len(companions),
            "companionByteMismatches": companion_mismatches,
            "companionInventorySha256": companion_inventory_digest,
            "reportedCompanionPathSetMatches": set(audit["comparison"]["exactCompanionPaths"]) == actual_companion_paths,
            "rawBundleEqualityClaim": audit["comparison"]["rawBundlesComparedForEquality"],
        },
        "goChecks": {
            "executionStatus": go_execution["status"],
            "commandCount": len(go_execution["commands"]),
            "sixCommands": go_checks,
            "allCommandLogsMatch": not go_log_mismatches,
        },
        "sourcePins": source_audit,
        "buildSourcePins": build_sources,
        "goScript": {
            "module": "github.com/s4wave/goscript",
            "version": "v0.6.2",
            "sumLine": goscript_line,
            "goModSha256": sha((ROOT / "compiled-frontend/go.mod").read_bytes()),
            "goSumSha256": sha((ROOT / "compiled-frontend/go.sum").read_bytes()),
        },
        "previousInterimCorrection": packet,
        "staleZipRetentionStatement": {
            "auditNoteSaysNotRetained": zip_statement_stale,
            "reportSaysUnavailableLocally": report_statement_stale,
            "currentZipExistsAndWasRehashed": zip_path.is_file() and zip_sha == provider["digest"].removeprefix("sha256:"),
        },
        "packetFiles": {
            "report": file_record(canonical_report, "compiled-backends/ci/2026-10-31/coordination/reports/R-CI-BUILD-FINAL.md"),
            "receipt": file_record(canonical_receipt, "compiled-backends/ci/2026-10-31/coordination/receipts/R-CI-BUILD-FINAL.json"),
            "artifactAudit": file_record(audit_path, "compiled-backends/ci/2026-10-31/lanes/build/final/artifact-audit.json"),
        },
        "recommendation": "amend" if zip_statement_stale and report_statement_stale else "accepted",
        "reason": "All substantive build, GoScript pin, source, command-log, prior-packet preservation, and canonical dated-path claims verified. The final report/audit still say the provider ZIP is unavailable locally, but this shared evidence set contains original.zip and its SHA-256/size exactly match provider metadata; update that limitation before marking accepted." if zip_statement_stale and report_statement_stale else "All independently recomputed claims verified.",
    }
    out = REVIEW / "artifact-crosscheck.json"
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "result": out.relative_to(ROOT).as_posix(),
        "sha256": sha(out.read_bytes()),
        "buildCounts": {backend: builds[backend]["outputCount"] for backend in builds},
        "companionCount": len(companions),
        "sourceSets": source_audit,
        "goCommandCount": len(go_checks),
        "zipDigestMatches": zip_sha == provider["digest"].removeprefix("sha256:"),
        "previousPacketPreserved": packet["historyReceiptByteIdentical"] and packet["historyReportByteIdentical"],
        "recommendation": result["recommendation"],
        "reason": result["reason"],
    }, indent=2))


if __name__ == "__main__":
    main()
