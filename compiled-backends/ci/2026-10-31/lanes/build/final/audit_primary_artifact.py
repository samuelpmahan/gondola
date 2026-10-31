#!/usr/bin/env python3
"""Verify the immutable primary CI extraction and compiled backend outputs."""

from __future__ import annotations

import copy
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path.cwd()
CI = ROOT / "compiled-backends/ci/2026-10-31"
EXTRACTED = CI / "extracted"
INDEX_PATH = CI / "retained-index.json"
APP_NAMES = {"counter", "form", "list", "effect"}
BUILD_SOURCES = [
    "compiled-frontend/build/request.go",
    "compiled-frontend/build/request_test.go",
    "compiled-frontend/build/pipeline.go",
    "compiled-frontend/build/pipeline_test.go",
    "compiled-frontend/build/publish.go",
    "compiled-frontend/emit/backend.go",
    "compiled-frontend/emit/backend_test.go",
    "compilercontract/contract.go",
    "gobi/build.go",
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path, display_path: str | None = None) -> dict[str, Any]:
    data = path.read_bytes()
    return {
        "path": display_path or path.as_posix(),
        "bytes": len(data),
        "sha256": sha256_bytes(data),
    }


def verify_pin_array(entries: list[dict[str, str]], *, label: str) -> dict[str, Any]:
    actual_records = []
    missing = []
    mismatches = []
    for entry in entries:
        rel = entry["path"]
        path = ROOT / rel
        if not path.is_file():
            missing.append(rel)
            continue
        actual = file_record(path, rel)
        actual_records.append(actual)
        if actual["sha256"] != entry["sha256"]:
            mismatches.append({
                "path": rel,
                "recordedSha256": entry["sha256"],
                "actualSha256": actual["sha256"],
            })
    assert not missing, f"{label} has missing source paths: {missing}"
    assert not mismatches, f"{label} source pin mismatches: {mismatches}"
    return {"count": len(entries), "allMatchCurrentFiles": True, "pins": actual_records}


def load_build(backend: str) -> dict[str, Any]:
    artifacts = EXTRACTED / "compiled-backends/artifacts"
    result_path = artifacts / f"{backend}-build-result.json"
    tree = artifacts / "compiled" / backend
    result = read_json(result_path)
    manifest_path = tree / "buildmanifest.json"
    manifest = read_json(manifest_path)
    physical_paths = sorted(
        p.relative_to(tree).as_posix() for p in tree.rglob("*") if p.is_file()
    )
    outputs = result["outputs"]
    output_by_path = {item["path"]: item for item in outputs}
    assert result["ok"] is True, f"{backend}: CLI result ok=false"
    assert result["diagnostics"] == [], f"{backend}: unexpected diagnostics"
    assert len(result["apps"]) == 4, f"{backend}: expected 4 apps"
    assert len(outputs) == 209, f"{backend}: expected 209 CLI outputs, got {len(outputs)}"
    assert len(physical_paths) == 209, f"{backend}: expected 209 actual files, got {len(physical_paths)}"
    assert set(output_by_path) == set(physical_paths), f"{backend}: CLI inventory differs from actual tree"
    assert manifest["schema"] == "gobi.build-manifest/v1"
    assert len(manifest["apps"]) == 4
    assert all(app["backend"] == backend for app in manifest["apps"]), f"{backend}: wrong manifest backend tag"

    actual_outputs = []
    output_mismatches = []
    for rel in physical_paths:
        rec = file_record(tree / rel, rel)
        actual_outputs.append(rec)
        expected = output_by_path[rel]
        if expected["sha256"] != rec["sha256"] or expected["bytes"] != rec["bytes"]:
            output_mismatches.append({"path": rel, "result": expected, "actual": rec})
    assert not output_mismatches, f"{backend}: CLI result output pins differ from actual files"

    app_names = {Path(app["appIR"]).parent.name.split("-")[0] for app in manifest["apps"]}
    assert app_names == APP_NAMES, f"{backend}: unexpected app set {app_names}"
    assert len(manifest["emittedTypeScript"]) == 186
    assert len(manifest["forwarderSources"]) == 5
    assert len([p for p in physical_paths if p.endswith(".ts")]) == 186
    assert len([p for p in physical_paths if p.endswith(".go")]) == 4

    bundle_paths = sorted(app["module"] for app in manifest["apps"])
    assert len(bundle_paths) == 4
    bundle_records = [file_record(tree / rel, rel) for rel in bundle_paths]
    return {
        "backend": backend,
        "resultPath": result_path.relative_to(EXTRACTED).as_posix(),
        "resultFile": file_record(result_path, result_path.relative_to(EXTRACTED).as_posix()),
        "ok": result["ok"],
        "diagnostics": result["diagnostics"],
        "preservedPreviousOutput": result["preservedPreviousOutput"],
        "appCount": len(result["apps"]),
        "packagePaths": [app["packagePath"] for app in result["apps"]],
        "apps": result["apps"],
        "manifest": {
            "path": manifest_path.relative_to(EXTRACTED).as_posix(),
            "file": file_record(manifest_path, "buildmanifest.json"),
            "appTags": [
                {"packagePath": app["packagePath"], "backend": app["backend"],
                 "appIR": app["appIR"], "module": app["module"], "encoder": app["encoder"]}
                for app in manifest["apps"]
            ],
            "forwarderSourceCount": len(manifest["forwarderSources"]),
            "emittedTypeScriptCount": len(manifest["emittedTypeScript"]),
        },
        "outputCount": len(outputs),
        "physicalFileCount": len(physical_paths),
        "outputs": actual_outputs,
        "rawBundles": bundle_records,
        "manifestObject": manifest,
    }


def verify_go_command_logs() -> dict[str, Any]:
    execution_path = EXTRACTED / "compiled-frontend/artifacts/execution.json"
    execution = read_json(execution_path)
    logs_dir = EXTRACTED / "compiled-frontend/artifacts/logs"
    by_name = {command["name"]: command for command in execution["commands"]}
    wanted = [
        "go-tests", "go-race", "go-vet",
        "root-go-tests", "root-go-race", "root-go-vet",
    ]
    checks: dict[str, Any] = {}
    for name in wanted:
        command = by_name[name]
        assert command["exitCode"] == 0 and command["error"] is None and command["signal"] is None
        stdout_path = logs_dir / f"{name}.stdout.log"
        stderr_path = logs_dir / f"{name}.stderr.log"
        stdout = file_record(stdout_path, stdout_path.relative_to(EXTRACTED).as_posix())
        stderr = file_record(stderr_path, stderr_path.relative_to(EXTRACTED).as_posix())
        assert stdout["sha256"] == command["stdoutSha256"], f"{name}: stdout hash mismatch"
        assert stderr["sha256"] == command["stderrSha256"], f"{name}: stderr hash mismatch"
        stdout_text = stdout_path.read_text()
        if name.endswith("-tests") or name.endswith("-race"):
            assert "FAIL" not in stdout_text, f"{name}: failure text in test output"
            assert "ok  \t" in stdout_text, f"{name}: no successful package output"
        checks[name] = {
            "command": command["command"],
            "args": command["args"],
            "cwd": command["cwd"],
            "environmentOverrides": command["environmentOverrides"],
            "startedAt": command["startedAt"],
            "finishedAt": command["finishedAt"],
            "exitCode": command["exitCode"],
            "stdout": stdout,
            "stderr": stderr,
            "stdoutText": stdout_text,
        }
    versions = execution["versions"]
    root_version_log = (logs_dir / "version-root-go.stdout.log").read_text().strip()
    compiler_version_log = (logs_dir / "version-go.stdout.log").read_text().strip()
    assert versions["rootGo"] == root_version_log
    assert versions["go"] == compiler_version_log
    assert versions["go"].startswith("go version go1.27.3 ")
    assert versions["rootGo"].startswith("go version go1.24.13 ")
    assert execution["environment"]["GOTOOLCHAIN"] == "go1.27.3"
    assert execution["status"] == "passed"
    assert len(execution["commands"]) == 33
    assert len(execution["sourceBefore"]) == 122
    assert len(execution["sourceAfter"]) == 122
    assert execution["sourceBefore"] == execution["sourceAfter"]
    assert len(execution["outputPinsBefore"]) == 209
    assert execution["outputPinsBefore"] == execution["outputPinsAfter"]
    assert execution["mismatches"] == 0
    return {
        "executionFile": file_record(execution_path, execution_path.relative_to(EXTRACTED).as_posix()),
        "status": execution["status"],
        "versions": versions,
        "environment": execution["environment"],
        "sourceBefore": verify_pin_array(execution["sourceBefore"], label="compiled-frontend sourceBefore"),
        "sourceAfter": verify_pin_array(execution["sourceAfter"], label="compiled-frontend sourceAfter"),
        "outputPinsBeforeCount": len(execution["outputPinsBefore"]),
        "outputPinsAfterCount": len(execution["outputPinsAfter"]),
        "mismatches": execution["mismatches"],
        "commands": checks,
    }


def verify_backend_runner() -> dict[str, Any]:
    receipt_path = EXTRACTED / "compiled-backends/coordination/receipts/E-DEMO.json"
    receipt = read_json(receipt_path)
    assert receipt["status"] == "passed" and receipt["failures"] == []
    assert receipt["sourcePinsMatch"] is True
    assert len(receipt["sourceBefore"]) == 126
    assert len(receipt["sourceAfter"]) == 126
    assert receipt["sourceBefore"] == receipt["sourceAfter"]
    source_before = verify_pin_array(receipt["sourceBefore"], label="E-DEMO sourceBefore")
    source_after = verify_pin_array(receipt["sourceAfter"], label="E-DEMO sourceAfter")
    commands = {c["name"]: c for c in receipt["commands"]}
    build_logs_dir = EXTRACTED / "compiled-backends/artifacts/logs"
    cli_commands = {}
    for backend in ("react", "dom"):
        name = f"compile-{backend}"
        command = commands[name]
        assert command["command"] == "go" and command["args"] == ["run", "./cmd/gobi-build"]
        assert command["exitCode"] == 0 and command["error"] is None and command["signal"] is None
        request_path = EXTRACTED / "compiled-backends/artifacts" / f"{backend}-request.json"
        request = read_json(request_path)
        assert request["backend"] == backend
        backend_build = receipt["backendBuilds"][backend]
        assert backend_build["outputDir"] == f"compiled-backends/artifacts/compiled/{backend}"
        assert backend_build["resultPath"] == f"compiled-backends/artifacts/{backend}-build-result.json"
        assert backend_build["ok"] is True and backend_build["appCount"] == 4
        assert backend_build["diagnostics"] == [] and len(backend_build["outputPins"]) == 209
        cli_result = read_json(EXTRACTED / backend_build["resultPath"])
        assert cli_result["ok"] is True and len(cli_result["outputs"]) == 209
        assert backend_build["outputPins"] == cli_result["outputs"], f"{backend}: runner output pins differ from CLI result"
        request_record = file_record(request_path, request_path.relative_to(EXTRACTED).as_posix())
        compact_request_bytes = json.dumps(request, separators=(",", ":"), ensure_ascii=False).encode()
        compact_request_sha256 = sha256_bytes(compact_request_bytes)
        assert command["inputSha256"] == compact_request_sha256
        stdout_path = build_logs_dir / f"{name}.stdout.log"
        stderr_path = build_logs_dir / f"{name}.stderr.log"
        stdout = file_record(stdout_path, stdout_path.relative_to(EXTRACTED).as_posix())
        stderr = file_record(stderr_path, stderr_path.relative_to(EXTRACTED).as_posix())
        assert stdout["sha256"] == command["stdoutSha256"]
        assert stderr["sha256"] == command["stderrSha256"]
        cli_commands[backend] = {
            "command": command["command"],
            "args": command["args"],
            "cwd": command["cwd"],
            "environmentOverrides": command["environmentOverrides"],
            "exitCode": command["exitCode"],
            "inputRequest": request_record,
            "canonicalInputSha256": compact_request_sha256,
            "stdout": stdout,
            "stderr": stderr,
        }

    versions = receipt["versions"]
    go_mod = ROOT / "compiled-frontend/go.mod"
    go_sum = ROOT / "compiled-frontend/go.sum"
    go_mod_text = go_mod.read_text()
    go_sum_text = go_sum.read_text()
    assert "go 1.27.0" in go_mod_text
    assert "github.com/s4wave/goscript v0.6.2" in go_mod_text
    assert "github.com/s4wave/goscript v0.6.2 h1:" in go_sum_text
    assert versions["compiledGo"].startswith("go version go1.27.3 ")
    assert versions["rootGo"].startswith("go version go1.24.13 ")

    return {
        "receiptFile": file_record(receipt_path, receipt_path.relative_to(EXTRACTED).as_posix()),
        "status": receipt["status"],
        "outcome": receipt["outcome"],
        "versions": versions,
        "sourceBefore": source_before,
        "sourceAfter": source_after,
        "sourcePinsMatch": receipt["sourcePinsMatch"],
        "cliCommands": cli_commands,
        "goscript": {
            "module": "github.com/s4wave/goscript",
            "version": "v0.6.2",
            "goMod": file_record(go_mod, "compiled-frontend/go.mod"),
            "goSum": file_record(go_sum, "compiled-frontend/go.sum"),
        },
        "actualBuildResults": {
            "react": file_record(EXTRACTED / "compiled-backends/artifacts/react-build-result.json",
                                  "compiled-backends/artifacts/react-build-result.json"),
            "dom": file_record(EXTRACTED / "compiled-backends/artifacts/dom-build-result.json",
                                "compiled-backends/artifacts/dom-build-result.json"),
        },
    }


def verify_primary_and_extraction() -> dict[str, Any]:
    provenance_path = CI / "primary-provenance.json"
    run_path = CI / "primary-run.json"
    jobs_path = CI / "primary-jobs.json"
    artifact_path = CI / "artifact.json"
    index_path = INDEX_PATH
    provenance = read_json(provenance_path)
    run = read_json(run_path)
    jobs = read_json(jobs_path)
    artifact_doc = read_json(artifact_path)
    artifact = artifact_doc["artifacts"][0]
    current_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    assert current_head == provenance["sourceHead"] == provenance["actualCheckout"] == run["head_sha"]
    assert provenance["status"] == run["status"] == "completed"
    assert provenance["conclusion"] == run["conclusion"] == "success"
    assert run["event"] == provenance["event"] == "push"
    assert jobs["jobs"][0]["id"] == provenance["job"]
    assert jobs["jobs"][0]["status"] == "completed" and jobs["jobs"][0]["conclusion"] == "success"
    assert artifact["id"] == provenance["artifact"]
    assert artifact["size_in_bytes"] == provenance["artifactZipBytes"]
    artifact_digest = artifact["digest"].removeprefix("sha256:")
    assert artifact_digest == provenance["artifactZipSha256"]
    assert artifact["workflow_run"]["head_sha"] == current_head

    index = read_json(index_path)
    actual_files = sorted(p for p in EXTRACTED.rglob("*") if p.is_file())
    actual_records = {}
    for path in actual_files:
        rel = path.relative_to(EXTRACTED).as_posix()
        actual_records[rel] = file_record(path, rel)
    index_records = {entry["path"]: entry for entry in index}
    assert len(index) == len(index_records) == provenance["readOnlyExtractedFiles"]
    assert set(actual_records) == set(index_records), "extracted filesystem differs from retained index path set"
    index_mismatches = []
    for rel, actual in actual_records.items():
        expected = index_records[rel]
        if expected["sha256"] != actual["sha256"] or expected["bytes"] != actual["bytes"]:
            index_mismatches.append({"path": rel, "indexed": expected, "actual": actual})
    assert not index_mismatches, f"retained artifact index mismatch: {index_mismatches[:10]}"

    metadata_files = [provenance_path, run_path, jobs_path, artifact_path, index_path,
                      CI / "logs/124401386239.log"]
    return {
        "currentHead": current_head,
        "sourceTree": provenance["sourceTree"],
        "directParent": provenance["directParent"],
        "run": {
            "id": run["id"],
            "event": run["event"],
            "status": run["status"],
            "conclusion": run["conclusion"],
            "headSha": run["head_sha"],
            "jobId": provenance["job"],
            "artifactId": artifact["id"],
        },
        "providerArchiveMetadata": {
            "bytes": artifact["size_in_bytes"],
            "sha256": artifact_digest,
            "note": "digest and size are the provider artifact metadata cross-checked against primary-provenance.json; the raw ZIP is not separately retained for local rehashing",
        },
        "retainedExtraction": {
            "indexedFileCount": len(index),
            "actualFileCount": len(actual_records),
            "allPathsBytesAndHashesMatch": True,
            "indexFile": file_record(index_path, index_path.relative_to(ROOT).as_posix()),
        },
        "metadataFiles": [file_record(p, p.relative_to(ROOT).as_posix()) for p in metadata_files],
    }


def main() -> None:
    primary = verify_primary_and_extraction()
    builds = {backend: load_build(backend) for backend in ("react", "dom")}
    react, dom = builds["react"], builds["dom"]
    assert react["packagePaths"] == dom["packagePaths"]
    assert react["apps"] == dom["apps"], "AppIR objects differ across build profiles"
    assert {x["backend"] for x in react["manifest"]["appTags"]} == {"react"}
    assert {x["backend"] for x in dom["manifest"]["appTags"]} == {"dom"}
    react_manifest = copy.deepcopy(react["manifestObject"])
    dom_manifest = copy.deepcopy(dom["manifestObject"])
    for app in react_manifest["apps"]:
        app["backend"] = "<backend>"
    for app in dom_manifest["apps"]:
        app["backend"] = "<backend>"
    assert react_manifest == dom_manifest, "manifest differs beyond backend app tags"
    react_files = {item["path"]: item for item in react["outputs"]}
    dom_files = {item["path"]: item for item in dom["outputs"]}
    assert set(react_files) == set(dom_files)
    bundle_paths = {app["module"] for app in react["manifest"]["appTags"]}
    excluded = bundle_paths | {"buildmanifest.json"}
    companion_paths = sorted(set(react_files) - excluded)
    assert len(bundle_paths) == 4
    assert len(excluded) == 5
    assert len(companion_paths) == 204
    companion_mismatches = []
    for rel in companion_paths:
        if react_files[rel]["sha256"] != dom_files[rel]["sha256"] or react_files[rel]["bytes"] != dom_files[rel]["bytes"]:
            companion_mismatches.append({"path": rel, "react": react_files[rel], "dom": dom_files[rel]})
    assert not companion_mismatches, f"companion output mismatch: {companion_mismatches[:10]}"

    current_source = {path: file_record(ROOT / path, path) for path in BUILD_SOURCES}
    prior_receipt_path = CI / "coordination/receipts/E-CI-BUILD.json"
    prior_report_path = CI / "coordination/reports/E-CI-BUILD.md"
    history_receipt_path = CI / "coordination/history/E-CI-BUILD-consumed-insufficient.json"
    history_report_path = CI / "coordination/history/E-CI-BUILD-consumed-insufficient.md"
    prior_receipt = read_json(prior_receipt_path)
    markdown_match = __import__("re").search(
        r"\| `compiled-frontend/emit/backend\.go` \| `([0-9a-f]{64})` \|",
        (CI / "lanes/build/source-review.md").read_text(),
    )
    assert markdown_match
    bad_old_pin = prior_receipt["evidence"]["reviewed_source_sha256"]["compiled-frontend/emit/backend.go"]
    current_backend_pin = current_source["compiled-frontend/emit/backend.go"]["sha256"]
    markdown_backend_pin = markdown_match.group(1)
    assert markdown_backend_pin == current_backend_pin
    assert bad_old_pin != current_backend_pin
    prior_report_bytes = prior_report_path.read_bytes()
    prior_receipt_bytes = prior_receipt_path.read_bytes()
    assert history_report_path.read_bytes() == prior_report_bytes
    assert history_receipt_path.read_bytes() == prior_receipt_bytes

    source_docs = [
        "compiled-frontend/go.mod", "compiled-frontend/go.sum", "go.mod",
        "compiled-backends/run.mjs", "run-compiled-backends.sh",
    ]
    source_doc_records = {p: file_record(ROOT / p, p) for p in source_docs}
    goscript_sum = next(line for line in (ROOT / "compiled-frontend/go.sum").read_text().splitlines()
                        if line.startswith("github.com/s4wave/goscript v0.6.2 h1:"))

    result = {
        "schema": "gobi.final-build-artifact-audit/v1",
        "job_id": "R-CI-BUILD-FINAL",
        "worker": "N4",
        "status": "verified",
        "verifierScript": file_record(Path(__file__).resolve(), Path(__file__).resolve().relative_to(ROOT).as_posix()),
        "sourcePreflight": file_record(CI / "lanes/build/final/source-preflight.md",
                                        "compiled-backends/ci/2026-10-31/lanes/build/final/source-preflight.md"),
        "primaryCi": primary,
        "buildSources": current_source,
        "previousPacketCorrection": {
            "oldReport": file_record(prior_report_path, prior_report_path.relative_to(ROOT).as_posix()),
            "oldReceipt": file_record(prior_receipt_path, prior_receipt_path.relative_to(ROOT).as_posix()),
            "preservedHistoryCopies": {
                "report": file_record(history_report_path, history_report_path.relative_to(ROOT).as_posix()),
                "receipt": file_record(history_receipt_path, history_receipt_path.relative_to(ROOT).as_posix()),
                "byteIdenticalToOriginals": True,
            },
            "historicalReceiptPin": bad_old_pin,
            "historicalMarkdownPin": markdown_backend_pin,
            "actualCurrentBackendSource": current_source["compiled-frontend/emit/backend.go"],
            "correction": "the consumed interim receipt contained a mistyped backend.go SHA-256; the old bytes are retained unchanged, while the final packet records the correct actual-source SHA-256",
        },
        "sourceDocuments": source_doc_records,
        "goscript": {
            "module": "github.com/s4wave/goscript",
            "version": "v0.6.2",
            "goModSha256": source_doc_records["compiled-frontend/go.mod"]["sha256"],
            "goSumSha256": source_doc_records["compiled-frontend/go.sum"]["sha256"],
            "goSumLine": goscript_sum,
        },
        "backendBuilds": builds,
        "comparison": {
            "packagePathsIdentical": True,
            "appIRObjectsIdentical": True,
            "normalizedManifestObjectsIdenticalAfterReplacingBackendTag": True,
            "outputPathCountEach": 209,
            "exactCompanionOutputCount": len(companion_paths),
            "exactCompanionPaths": companion_paths,
            "exactCompanionOutputs": [react_files[p] for p in companion_paths],
            "rawBundlesComparedForEquality": False,
            "rawBundleHashes": {
                "react": react["rawBundles"],
                "dom": dom["rawBundles"],
            },
        },
        "goChecks": verify_go_command_logs(),
        "backendRunner": verify_backend_runner(),
        "claims": {
            "sameBackendNeutralGoScriptAppIRAndEncoderOutputs": True,
            "noNormalizedBundleEqualityClaim": True,
            "prePublishPreservedPreviousOutputFlagNotUsedAsPhysicalPreservationProof": True,
            "prRun41155534356StatusNotInferredFromPrimaryPushRun": True,
        },
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
