#!/usr/bin/env python3
"""Independent consumer for a clean E-RUN module-effects archive.

This tool is deliberately external to the repository. `accept` is fail-closed:
it verifies the Git-bound run receipt, archive manifest, archive bytes, every
regular member, source-pin closure and archived execution snapshot before it
extracts into a new destination. It then replays the four archived scenarios
with Go offline and invokes consume-browser.mjs on relocated sources/artifacts.
`readback` is a separate, read-only Git-object proof for use after publication.
"""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime
from typing import Any, BinaryIO

MANIFEST_SCHEMA = "gobi.module-effects-archive-manifest/v1"
INDEX_SCHEMA = "gobi.module-effects-segments/v1"
RUN_RECEIPT_SCHEMA = "gobi.module-effects-delivery-receipt/v1"
NATIVE_SCHEMA = "gobi.module-effects-native/v1"
EXECUTION_SNAPSHOT_SCHEMA = "gobi.module-effects-execution-snapshot/v1"
HEX256 = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")
MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
MAX_EXPANDED_BYTES = 8 * 1024 * 1024 * 1024
MAX_METADATA_BYTES = 8 * 1024 * 1024
MAX_MEMBERS = 100_000
CHUNK = 1024 * 1024
PINNED_RESTORE_SHA256 = "9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98"
SOURCE_CLOSURE_FIELDS = {
    "directories", "explicitFiles", "excludedDirectoryNames", "excludedFiles",
    "excludedCompilerLogs", "rootGoSum",
}
DELIVERY_RECEIPT_FIELDS = {
    "schema", "status", "sourceCommit", "verifier", "sourceClosureScope", "attempt",
    "tools", "counts", "buildSummary", "buildIndex", "tests", "conformance", "oracle",
    "demo", "sourcePins", "archive", "commands",
}
DELIVERY_TOOL_FIELDS = {
    "goExecutable", "go", "compilerGo", "nodeExecutable", "node", "pythonExecutable",
    "python", "chromiumPath", "chromium", "playwright", "tar", "platform", "architecture",
}
DELIVERY_ARCHIVE_FIELDS = {
    "path", "bytes", "sha256", "manifestPath", "manifestSHA256", "members",
    "independentConsumer", "commands", "excludedDuplicateLogs", "excludedRegenerableBundles",
}
EXECUTION_SNAPSHOT_FIELDS = {
    "schema", "sourceCommit", "verifierGitHead", "verifierGitDirty", "verifierSourcePinsMatch",
    "sourcePinMismatches", "sourcePins", "testSourceFilesPinned", "sourceClosureScope", "counts", "commands",
}
SNAPSHOT_COUNTS_FIELDS = {
    "builds", "conformance", "nodeTests", "conformanceCaptureMutationControls",
    "buildAdmissionMutationControls", "independentCaptureMutationControls",
    "independentCaptureMutationControlApplications",
}
SNAPSHOT_CONFORMANCE_COUNT_FIELDS = {
    "callOrderEvents", "effectLedgerEvents", "ledgerEvents", "lifecycleLedgerEvents",
    "nativeEffects", "nativeEvents", "nativeLifecycleEvents", "nativeStates",
    "nativeTransportEvents", "orderedLedgerEvents", "profileEvents", "profileRetiredChildren",
    "profileTransportEvents", "rendererSwaps", "retiredChildren", "scenarios", "snapshots",
}
RECEIPT_COUNT_FIELDS = {
    "buildAdmissionMutationControlsDetected", "buildCalls", "buildStageRegressionTestNames",
    "buildStageRegressionTests", "compilerRegressionTestNames", "compilerRegressionTests",
    "conformanceCaptureMutationControlsDetected", "demoSteps", "goTestPackagesExecuted",
    "ledgerEvents", "moduleABIRegressionTestName", "moduleABIRegressionTests",
    "mutationControlApplicationCount", "mutationControlApplicationsDetected",
    "mutationControlDistinctIDs", "mutationControlsDetected", "nativeEffects", "nativeEvents",
    "nativeLifecycleEvents", "nativeStates", "nativeTransportEvents", "nodeTestFilesExecuted",
    "nodeTests", "orderedLedgerEvents", "profileEvents", "profileTransportEvents",
    "retiredChildren", "scenarios", "snapshots", "sourcePins", "testSourceFilesPinned",
}
MANIFEST_FIELDS = {
    "schema", "sourceCommit", "verifierGitHead", "verifierGitDirty",
    "verifierSourcePinsMatch", "sourcePinMismatches", "sourcePins",
    "testSourceFilesPinned", "sourceClosureScope", "members",
    "excludedDuplicateLogs", "excludedRegenerableBundles", "archive",
    "archivedSnapshotVerified",
}
INDEX_FIELDS = {"schema", "sourceCommit", "archive", "manifest", "parts", "memberCount", "sourcePinCount"}
ALLOWED_MEMBER_ROOTS = {
    "source", "builds", "native", "scenarios", "conformance", "demo",
    "oracle", "metadata", "logs",
}
EXPECTED_LABELS = ["literal", "seed-20261104", "seed-20261105", "seed-20261106"]
EXPECTED_PROFILES = ["direct.react", "direct.dom", "browser.react", "browser.dom", "browser.swap"]
REQUIRED_CAPTURE_CONTROL_IDS = {
    "bypass-go-cancellation", "cancel-sibling-pending-request", "accept-duplicate-reply",
    "accept-wrong-correlation-tuple", "accept-old-generation-reply",
    "confuse-renderer-epoch-with-reply-correlation", "start-before-commit-render",
    "call-transport-cancel-before-retiring-correlation", "accept-reply-without-correlation",
    "accept-reply-with-wrong-state-event-index", "accept-reply-with-extra-correlation-field",
    "accept-reply-with-wrong-dispatch-correlation", "accept-reply-with-wrong-effect-correlation",
    "accept-duplicate-reply-with-wrong-state-event-index", "accept-cancelled-reply-without-correlation",
    "accept-cancelled-reply-with-wrong-state-event-index",
}
REQUIRED_BUILD_CONTROL_IDS = {
    "remove-cancel-descriptor", "remove-cancel-capability", "unadmit-react-child",
    "wrong-dom-child-package", "remove-react-keyed-helper", "drop-source-pin",
    "replace-dom-child-uint64-with-number",
}


class ConsumeError(RuntimeError):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_file(path: Path) -> dict[str, Any]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(CHUNK)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
    return {"path": str(path), "bytes": size, "sha256": digest.hexdigest()}


def duplicate_rejecting_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ConsumeError(f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def read_json(path: Path) -> Any:
    if path.is_symlink() or not path.is_file():
        raise ConsumeError(f"expected a regular JSON file: {path}")
    if path.stat().st_size > MAX_METADATA_BYTES:
        raise ConsumeError(f"JSON metadata exceeds {MAX_METADATA_BYTES} bytes: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=duplicate_rejecting_object)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ConsumeError(f"invalid UTF-8 JSON at {path}: {exc}") from exc


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def require_object(value: Any, label: str, keys: set[str] | None = None) -> dict[str, Any]:
    if type(value) is not dict:
        raise ConsumeError(f"{label} must be an object")
    if keys is not None and set(value) != keys:
        raise ConsumeError(f"{label} keys mismatch: expected {sorted(keys)}, got {sorted(value)}")
    return value


def validate_mutation_report(value: Any, label: str, required_ids: set[str], *,
                             require_declared_ids: bool = False,
                             allow_additional: bool | None = None) -> dict[str, Any]:
    report = require_object(value, label)
    if report.get("status") != "detected":
        raise ConsumeError(f"{label} did not report detected mutations")
    rows = report.get("rejected")
    if type(rows) is not list or not rows:
        raise ConsumeError(f"{label}.rejected must be a nonempty array")
    if type(report.get("total")) is not int or report["total"] != len(rows):
        raise ConsumeError(f"{label}.total must equal the derived rejected-array length")
    if require_declared_ids:
        declared = path_list(report.get("requiredControlIds"), f"{label}.requiredControlIds")
        if set(declared) != required_ids:
            raise ConsumeError(f"{label}.requiredControlIds do not match the independently required control IDs")
        if type(report.get("allowAdditionalControls")) is not bool or report["allowAdditionalControls"] is not allow_additional:
            raise ConsumeError(f"{label}.allowAdditionalControls differs from its declared control policy")
    seen: set[str] = set()
    for index, raw in enumerate(rows):
        row = require_object(raw, f"{label}.rejected[{index}]")
        if require_declared_ids and set(row) != {"id", "name", "rejected", "path"}:
            raise ConsumeError(f"{label}.rejected[{index}] has an unexpected field set")
        control_id = row.get("id", row.get("name"))
        if not isinstance(control_id, str) or not control_id or control_id.strip() != control_id:
            raise ConsumeError(f"{label}.rejected[{index}] must have a nonempty stable id/name")
        if "id" in row and "name" in row and row["id"] != row["name"]:
            raise ConsumeError(f"{label}.rejected[{index}] id and name disagree")
        if control_id in seen:
            raise ConsumeError(f"{label} contains duplicate mutation control ID {control_id!r}")
        seen.add(control_id)
        if row.get("rejected") is not True:
            raise ConsumeError(f"{label} mutation control {control_id!r} was not rejected")
        if not isinstance(row.get("path"), str) or not row["path"]:
            raise ConsumeError(f"{label} mutation control {control_id!r} has no diagnostic field path")
    if not required_ids.issubset(seen):
        raise ConsumeError(f"{label} omits required mutation IDs: {sorted(required_ids-seen)}")
    if require_declared_ids and allow_additional is False and seen != required_ids:
        raise ConsumeError(f"{label} contains unapproved extra mutation IDs: {sorted(seen-required_ids)}")
    detected = report.get("mutationControlsDetected", len(rows))
    if type(detected) is not int or detected != len(rows):
        raise ConsumeError(f"{label}.mutationControlsDetected disagrees with the rejected-array length")
    return report


def require_count(value: Any, label: str, *, positive: bool = False) -> int:
    if type(value) is not int or value < (1 if positive else 0):
        requirement = "a positive integer" if positive else "a nonnegative integer"
        raise ConsumeError(f"{label} must be {requirement}")
    return value


def validate_command_record(value: Any, label: str) -> dict[str, Any]:
    row = require_object(value, label)
    required = {
        "name", "command", "args", "cwd", "environment", "startedAt", "completedAt",
        "exitCode", "signal", "spawnError", "stdout", "stderr", "stdoutLog", "stderrLog",
    }
    if set(row) not in (required, required | {"stdin"}):
        raise ConsumeError(f"{label} fields do not match the command-record schema")
    for field in ("name", "command", "cwd"):
        if not isinstance(row[field], str) or not row[field] or any(ord(ch) < 32 or ord(ch) == 127 for ch in row[field]):
            raise ConsumeError(f"{label}.{field} must be nonempty plain text")
    if type(row["args"]) is not list or any(not isinstance(arg, str) for arg in row["args"]):
        raise ConsumeError(f"{label}.args must be an array of strings")
    environment = require_object(row["environment"], f"{label}.environment")
    if any(not isinstance(key, str) or not isinstance(item, str) for key, item in environment.items()):
        raise ConsumeError(f"{label}.environment keys and values must be strings")
    if not isinstance(row["startedAt"], str) or not isinstance(row["completedAt"], str):
        raise ConsumeError(f"{label} timestamps must be ISO-8601 strings")
    try:
        started = datetime.fromisoformat(row["startedAt"].replace("Z", "+00:00"))
        completed = datetime.fromisoformat(row["completedAt"].replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise ConsumeError(f"{label} timestamps must be ISO-8601 strings") from exc
    if started.tzinfo is None or completed.tzinfo is None or completed < started:
        raise ConsumeError(f"{label} command timestamps must be zoned and nondecreasing")
    if type(row["exitCode"]) is not int or row["exitCode"] != 0 or row["signal"] is not None or row["spawnError"] is not None:
        raise ConsumeError(f"{label} did not record a successful command exit")
    for field in ("stdout", "stderr"):
        output = require_object(row[field], f"{label}.{field}", {"bytes", "sha256"})
        require_count(output["bytes"], f"{label}.{field}.bytes")
        require_digest(output["sha256"], f"{label}.{field}.sha256")
    for field in ("stdoutLog", "stderrLog"):
        if row[field] is not None and (not isinstance(row[field], str) or not row[field]):
            raise ConsumeError(f"{label}.{field} must be null or a nonempty path")
    if "stdin" in row:
        input_row = require_object(row["stdin"], f"{label}.stdin", {"bytes", "sha256"})
        require_count(input_row["bytes"], f"{label}.stdin.bytes")
        require_digest(input_row["sha256"], f"{label}.stdin.sha256")
    return row


def validate_mutation_control_applications(value: Any, label: str) -> dict[str, Any]:
    report = require_object(value, label, {
        "status", "total", "rejected", "scenarios", "distinctControlIds", "mutationControlsDetected",
    })
    if report["status"] != "detected":
        raise ConsumeError(f"{label}.status must be detected")
    aggregate = report["rejected"]
    if type(aggregate) is not list or not aggregate:
        raise ConsumeError(f"{label}.rejected must be a nonempty array")
    if require_count(report["total"], f"{label}.total") != len(aggregate):
        raise ConsumeError(f"{label}.total must equal the derived aggregate array length")
    if require_count(report["mutationControlsDetected"], f"{label}.mutationControlsDetected") != len(aggregate):
        raise ConsumeError(f"{label}.mutationControlsDetected must equal the detected aggregate rows")
    scenarios = report["scenarios"]
    if type(scenarios) is not list or len(scenarios) != len(EXPECTED_LABELS):
        raise ConsumeError(f"{label}.scenarios must have one report for every expected scenario")
    by_scenario: dict[str, dict[str, Any]] = {}
    flattened: list[dict[str, Any]] = []
    for index, raw in enumerate(scenarios):
        scenario_report = require_object(raw, f"{label}.scenarios[{index}]",
                                         {"scenario", "status", "total", "rejected"})
        scenario = scenario_report["scenario"]
        if scenario not in EXPECTED_LABELS or scenario in by_scenario:
            raise ConsumeError(f"{label}.scenarios contains an unknown or duplicate scenario")
        if scenario_report["status"] != "detected":
            raise ConsumeError(f"{label}.scenarios[{index}].status must be detected")
        rows = scenario_report["rejected"]
        if type(rows) is not list or not rows or require_count(scenario_report["total"], f"{label}.scenarios[{index}].total") != len(rows):
            raise ConsumeError(f"{label}.scenarios[{index}] total must equal its nonempty rejected-array length")
        ids: set[str] = set()
        normalized: list[dict[str, Any]] = []
        for row_index, item in enumerate(rows):
            row = require_object(item, f"{label}.scenarios[{index}].rejected[{row_index}]",
                                 {"id", "name", "rejected", "path"})
            control_id = row["id"]
            if not isinstance(control_id, str) or not control_id or row["name"] != control_id:
                raise ConsumeError(f"{label} scenario row id/name must be matching nonempty strings")
            if control_id in ids:
                raise ConsumeError(f"{label} scenario {scenario} contains duplicate control ID {control_id!r}")
            if control_id not in REQUIRED_CAPTURE_CONTROL_IDS:
                raise ConsumeError(f"{label} scenario {scenario} contains unapproved control ID {control_id!r}")
            if row["rejected"] is not True or not isinstance(row["path"], str) or not row["path"]:
                raise ConsumeError(f"{label} scenario {scenario} contains an undetected or pathless control")
            ids.add(control_id)
            normalized.append(row)
            flattened.append({"scenario": scenario, **row})
        if ids != REQUIRED_CAPTURE_CONTROL_IDS:
            raise ConsumeError(f"{label} scenario {scenario} does not have exactly the required control ID set")
        by_scenario[scenario] = scenario_report
    if set(by_scenario) != set(EXPECTED_LABELS):
        raise ConsumeError(f"{label} scenario reports do not cover the expected scenario set")
    if canonical_json(aggregate) != canonical_json(flattened):
        raise ConsumeError(f"{label}.rejected does not exactly flatten its per-scenario control arrays")
    distinct = path_list(report["distinctControlIds"], f"{label}.distinctControlIds")
    if distinct != sorted(REQUIRED_CAPTURE_CONTROL_IDS):
        raise ConsumeError(f"{label}.distinctControlIds differs from the required unique control IDs")
    if len(aggregate) != sum(len(row["rejected"]) for row in scenarios):
        raise ConsumeError(f"{label} aggregate application count differs from per-scenario arrays")
    return report


def validate_snapshot_counts(value: Any, receipt: dict[str, Any]) -> dict[str, Any]:
    counts = require_object(value, "execution snapshot counts", SNAPSHOT_COUNTS_FIELDS)
    for key in SNAPSHOT_COUNTS_FIELDS - {"conformance"}:
        require_count(counts[key], f"execution snapshot counts.{key}")
    conformance = require_object(counts["conformance"], "execution snapshot counts.conformance",
                                 SNAPSHOT_CONFORMANCE_COUNT_FIELDS)
    for key in SNAPSHOT_CONFORMANCE_COUNT_FIELDS - {"scenarios"}:
        require_count(conformance[key], f"execution snapshot counts.conformance.{key}")
    scenarios = require_object(conformance["scenarios"], "execution snapshot counts.conformance.scenarios")
    if set(scenarios) != set(EXPECTED_LABELS):
        raise ConsumeError("execution snapshot conformance scenarios do not match the frozen scenario set")
    for label, count in scenarios.items():
        require_count(count, f"execution snapshot counts.conformance.scenarios.{label}", positive=True)

    receipt_counts = require_object(receipt.get("counts"), "E-RUN receipt counts", RECEIPT_COUNT_FIELDS)
    conformance_summary = require_object(receipt.get("conformance"), "E-RUN conformance")
    capture_counts = require_object(conformance_summary.get("captureCounts"), "E-RUN conformance captureCounts",
                                    SNAPSHOT_CONFORMANCE_COUNT_FIELDS)
    if canonical_json(conformance) != canonical_json(capture_counts):
        raise ConsumeError("execution snapshot conformance counts differ from receipt captureCounts")
    checks = {
        "builds": receipt_counts["buildCalls"],
        "nodeTests": receipt_counts["nodeTests"],
        "conformanceCaptureMutationControls": receipt_counts["conformanceCaptureMutationControlsDetected"],
        "buildAdmissionMutationControls": receipt_counts["buildAdmissionMutationControlsDetected"],
        "independentCaptureMutationControls": receipt_counts["mutationControlsDetected"],
        "independentCaptureMutationControlApplications": receipt_counts["mutationControlApplicationsDetected"],
    }
    for field, expected in checks.items():
        require_count(expected, f"E-RUN receipt counts.{field}")
        if counts[field] != expected:
            raise ConsumeError(f"execution snapshot counts.{field} differs from the bound E-RUN receipt count")
    return counts


def validate_receipt_counts(receipt: dict[str, Any], pins: dict[str, Any], test_sources: list[str],
                            capture_mutations: dict[str, Any], build_mutations: dict[str, Any],
                            oracle_mutations: dict[str, Any], oracle_applications: dict[str, Any]) -> dict[str, Any]:
    counts = require_object(receipt.get("counts"), "E-RUN receipt counts", RECEIPT_COUNT_FIELDS)
    integer_fields = RECEIPT_COUNT_FIELDS - {
        "buildStageRegressionTestNames", "compilerRegressionTestNames", "moduleABIRegressionTestName", "scenarios",
    }
    for field in integer_fields:
        require_count(counts[field], f"E-RUN receipt counts.{field}")
    if counts["buildCalls"] != 4 or counts["sourcePins"] != len(pins) or counts["testSourceFilesPinned"] != len(test_sources):
        raise ConsumeError("E-RUN receipt build/source/test counts do not derive from validated inventories")
    scenario_counts = require_object(counts["scenarios"], "E-RUN receipt scenario counts")
    if set(scenario_counts) != set(EXPECTED_LABELS):
        raise ConsumeError("E-RUN receipt scenario counts do not cover the exact four source scenarios")
    for label, value in scenario_counts.items():
        require_count(value, f"E-RUN receipt counts.scenarios.{label}", positive=True)
    if counts["nativeEvents"] != sum(scenario_counts.values()):
        raise ConsumeError("E-RUN nativeEvents does not equal the derived source-scenario event counts")
    if counts["mutationControlsDetected"] != oracle_mutations["total"] or \
            counts["conformanceCaptureMutationControlsDetected"] != capture_mutations["total"] or \
            counts["buildAdmissionMutationControlsDetected"] != build_mutations["total"] or \
            counts["mutationControlApplicationCount"] != oracle_applications["total"] or \
            counts["mutationControlApplicationsDetected"] != oracle_applications["mutationControlsDetected"] or \
            counts["mutationControlDistinctIDs"] != len(oracle_applications["distinctControlIds"]):
        raise ConsumeError("E-RUN receipt mutation-control counters do not derive from validated arrays")

    tests = require_object(receipt.get("tests"), "E-RUN tests")
    go = require_object(tests.get("go"), "E-RUN Go test summary")
    moduleabi = require_object(tests.get("moduleABIRegression"), "E-RUN module ABI regression")
    compiler = require_object(tests.get("compilerRegression"), "E-RUN compiler regression")
    build_stage = require_object(tests.get("buildStageRegressions"), "E-RUN build stage regressions")
    node = require_object(tests.get("node"), "E-RUN Node test summary")
    node_files = path_list(node.get("files"), "E-RUN Node test files")
    if counts["goTestPackagesExecuted"] != go.get("packages") or \
            counts["compilerRegressionTests"] != compiler.get("tests") or \
            counts["buildStageRegressionTests"] != build_stage.get("tests") or \
            counts["moduleABIRegressionTests"] != moduleabi.get("tests") or \
            counts["nodeTests"] != node.get("tests") or counts["nodeTestFilesExecuted"] != len(node_files):
        raise ConsumeError("E-RUN receipt test counts do not derive from the detailed test summaries")
    if counts["compilerRegressionTestNames"] != compiler.get("testNames") or \
            counts["buildStageRegressionTestNames"] != build_stage.get("testNames") or \
            counts["moduleABIRegressionTestName"] != moduleabi.get("testName"):
        raise ConsumeError("E-RUN receipt regression test names differ from detailed test summaries")

    conformance = require_object(receipt.get("conformance"), "E-RUN conformance")
    capture_counts = require_object(conformance.get("captureCounts"), "E-RUN conformance captureCounts",
                                    SNAPSHOT_CONFORMANCE_COUNT_FIELDS)
    scenario_counts = require_object(counts.get("scenarios"), "E-RUN receipt scenario counts")
    if scenario_counts != capture_counts.get("scenarios") or set(scenario_counts) != set(EXPECTED_LABELS):
        raise ConsumeError("E-RUN receipt scenario counts differ from conformance capture arrays")
    count_to_capture = {
        "nativeEvents": "nativeEvents", "profileEvents": "profileEvents", "snapshots": "snapshots",
        "nativeStates": "nativeStates", "nativeEffects": "nativeEffects",
        "nativeTransportEvents": "nativeTransportEvents", "nativeLifecycleEvents": "nativeLifecycleEvents",
        "retiredChildren": "retiredChildren", "profileTransportEvents": "profileTransportEvents",
        "ledgerEvents": "ledgerEvents", "orderedLedgerEvents": "orderedLedgerEvents",
    }
    for receipt_field, capture_field in count_to_capture.items():
        if counts[receipt_field] != capture_counts[capture_field]:
            raise ConsumeError(f"E-RUN receipt count {receipt_field} differs from conformance capture arrays")

    demo = require_object(receipt.get("demo"), "E-RUN demo")
    smoke = require_object(demo.get("httpSmoke"), "E-RUN demo HTTP smoke")
    steps = smoke.get("steps")
    if type(steps) is not list or not steps or any(type(step) is not dict or step.get("passed") is not True for step in steps):
        raise ConsumeError("E-RUN demo HTTP smoke steps must be a nonempty all-passed array")
    if counts["demoSteps"] != len(steps):
        raise ConsumeError("E-RUN demoSteps does not equal the actual passed HTTP smoke steps")
    return counts


def validate_snapshot_command_binding(snapshot_commands: Any, receipt: dict[str, Any],
                                      manifest: dict[str, Any]) -> dict[str, Any]:
    if type(snapshot_commands) is not list or not snapshot_commands:
        raise ConsumeError("execution snapshot commands must be a nonempty array")
    commands = receipt.get("commands")
    if type(commands) is not list or len(commands) != len(snapshot_commands) + 1:
        raise ConsumeError("receipt commands must equal the snapshot command prefix plus one postarchive consumer")
    snapshot_rows = [validate_command_record(row, f"execution snapshot commands[{i}]")
                     for i, row in enumerate(snapshot_commands)]
    receipt_rows = [validate_command_record(row, f"E-RUN receipt commands[{i}]")
                    for i, row in enumerate(commands)]
    snapshot_names = [row["name"] for row in snapshot_rows]
    receipt_names = [row["name"] for row in receipt_rows]
    if len(set(snapshot_names)) != len(snapshot_names) or len(set(receipt_names)) != len(receipt_names):
        raise ConsumeError("snapshot/receipt command inventories contain duplicate command names")
    if canonical_json(snapshot_rows) != canonical_json(receipt_rows[:len(snapshot_rows)]):
        raise ConsumeError("receipt command prefix is not byte-equivalent to execution snapshot commands")
    if snapshot_names[-1] == "independent-python-archive-consumer" or \
            receipt_rows[-1]["name"] != "independent-python-archive-consumer":
        raise ConsumeError("receipt command suffix must contain exactly one postarchive independent Python consumer")

    archive = require_object(receipt.get("archive"), "E-RUN receipt archive")
    archive_path = archive.get("path")
    manifest_path = archive.get("manifestPath")
    if not isinstance(archive_path, str) or not archive_path or not isinstance(manifest_path, str) or not manifest_path:
        raise ConsumeError("receipt archive/manifest paths are required for postarchive command binding")
    tools = require_object(receipt.get("tools"), "E-RUN receipt tools")
    suffix = receipt_rows[-1]
    attempt = require_object(receipt.get("attempt"), "E-RUN attempt")
    attempt_path = Path(attempt.get("path", "")).expanduser().absolute()
    if (attempt_path.name != attempt.get("id") or len(attempt_path.parents) < 4 or
            attempt_path.parents[0].name != "attempts" or attempt_path.parents[1].name != "output" or
            attempt_path.parents[2].name != "compiled-module-effects"):
        raise ConsumeError("E-RUN attempt path does not have the frozen compiled-module-effects output layout")
    repository_root = attempt_path.parents[3]
    if (suffix["command"] != tools.get("pythonExecutable") or suffix["cwd"] != str(repository_root) or
            suffix["environment"] != {} or len(suffix["args"]) != 4 or suffix["args"][0] != "-c" or
            not suffix["args"][1] or suffix["args"][2:] != [archive_path, manifest_path]):
        raise ConsumeError("postarchive Python command identity/arguments differ from the archive receipt")

    independent = require_object(archive.get("independentConsumer"), "E-RUN independent archive consumer",
                                 {"status", "members", "archiveBytes", "archiveSHA256"})
    if (independent.get("status") != "passed" or independent.get("members") != len(manifest["members"]) or
            independent.get("archiveBytes") != manifest["archive"]["bytes"] or
            independent.get("archiveSHA256") != manifest["archive"]["sha256"]):
        raise ConsumeError("independent archive-consumer result is not bound to the verified manifest")

    helper_commands = archive.get("commands")
    if type(helper_commands) is not list or not helper_commands:
        raise ConsumeError("archive-helper commands must be a separate nonempty array")
    helper_rows = [validate_command_record(row, f"E-RUN archive helper commands[{i}]")
                   for i, row in enumerate(helper_commands)]
    if any(not row["name"].startswith("archive-") for row in helper_rows):
        raise ConsumeError("archive helper commands must retain their separate archive-* names")
    if set(snapshot_names) & {row["name"] for row in helper_rows}:
        raise ConsumeError("archive helper commands must not be folded into the prearchive snapshot command prefix")
    return {"snapshotCommandCount": len(snapshot_rows), "receiptCommandCount": len(receipt_rows),
            "postarchiveCommand": suffix["name"], "archiveHelperCommandCount": len(helper_rows),
            "snapshotPrefixMatched": True}


def require_digest(value: Any, label: str) -> str:
    if not isinstance(value, str) or not HEX256.fullmatch(value):
        raise ConsumeError(f"{label} must be a lowercase SHA-256 digest")
    return value


def safe_rel_path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise ConsumeError(f"{label} must be a nonempty normalized POSIX relative path")
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
        raise ConsumeError(f"{label} contains a control character")
    p = PurePosixPath(value)
    if p.is_absolute() or str(p) != value or any(part in ("", ".", "..") for part in value.split("/")):
        raise ConsumeError(f"{label} is unsafe or noncanonical: {value!r}")
    if re.match(r"^[A-Za-z]:", value):
        raise ConsumeError(f"{label} has a drive prefix: {value!r}")
    return value


def path_list(value: Any, label: str, directory_names: bool = False) -> list[str]:
    if type(value) is not list or len(value) > MAX_MEMBERS:
        raise ConsumeError(f"{label} must be an array with at most {MAX_MEMBERS} entries")
    result: list[str] = []
    seen: set[str] = set()
    for index, raw in enumerate(value):
        path = safe_rel_path(raw, f"{label}[{index}]")
        if directory_names and "/" in path:
            raise ConsumeError(f"{label}[{index}] must be one directory component")
        if path in seen:
            raise ConsumeError(f"duplicate path in {label}: {path}")
        seen.add(path)
        result.append(path)
    return result


def validate_source_closure_scope(value: Any, source_pins: dict[str, Any]) -> dict[str, Any]:
    scope = require_object(value, "sourceClosureScope", SOURCE_CLOSURE_FIELDS)
    directories = path_list(scope["directories"], "sourceClosureScope.directories")
    explicit_files = path_list(scope["explicitFiles"], "sourceClosureScope.explicitFiles")
    excluded_names = path_list(scope["excludedDirectoryNames"], "sourceClosureScope.excludedDirectoryNames", directory_names=True)
    excluded_files = path_list(scope["excludedFiles"], "sourceClosureScope.excludedFiles")
    if not directories:
        raise ConsumeError("sourceClosureScope.directories must not be empty")
    if type(scope["excludedCompilerLogs"]) is not bool:
        raise ConsumeError("sourceClosureScope.excludedCompilerLogs must be a boolean")
    root_sum = require_object(scope["rootGoSum"], "sourceClosureScope.rootGoSum",
                              {"path", "present", "evidencePath", "reason"})
    reason = root_sum["reason"]
    if root_sum["path"] != "go.sum" or type(root_sum["present"]) is not bool or root_sum["present"] is not False:
        raise ConsumeError("sourceClosureScope.rootGoSum must record the absent root go.sum")
    if root_sum["evidencePath"] != "go.mod" or "go.mod" not in source_pins:
        raise ConsumeError("sourceClosureScope.rootGoSum must cite the pinned root go.mod")
    if not isinstance(reason, str) or not reason or len(reason) > 512 or any(ord(ch) < 32 or ord(ch) == 127 for ch in reason):
        raise ConsumeError("sourceClosureScope.rootGoSum.reason must be a nonempty bounded plain string")
    if "go.sum" in source_pins or "go.sum" in explicit_files:
        raise ConsumeError("root go.sum is declared absent but appears in the source closure")

    explicit_set = set(explicit_files)
    directory_prefixes = tuple(f"{directory}/" for directory in directories)
    excluded_set = set(excluded_files)
    excluded_name_set = set(excluded_names)
    for source_path in source_pins:
        if source_path not in explicit_set and not source_path.startswith(directory_prefixes):
            raise ConsumeError(f"source pin is outside the declared source closure: {source_path}")
        parent_components = source_path.split("/")[:-1]
        if source_path in excluded_set or any(part in excluded_name_set for part in parent_components):
            raise ConsumeError(f"source pin is declared excluded: {source_path}")
        if scope["excludedCompilerLogs"] and source_path.startswith("compiled-frontend/") and (
                source_path.endswith(".log") or source_path.endswith(".exit-code")):
            raise ConsumeError(f"compiler log is declared excluded but appears in source pins: {source_path}")
    for source_path in explicit_files:
        if source_path not in source_pins:
            raise ConsumeError(f"explicit source file is not pinned: {source_path}")
    return scope


def validate_excluded_pins(manifest: dict[str, Any], members: dict[str, dict[str, Any]]) -> None:
    excluded = {}
    for field, suffix in (("excludedDuplicateLogs", ".native.stdout.log"),
                          ("excludedRegenerableBundles", ".browser.bundle.mjs")):
        rows = member_rows(manifest[field], f"manifest.{field}")
        for path in rows:
            if not path.startswith("conformance/") or not PurePosixPath(path).name.endswith(suffix):
                raise ConsumeError(f"manifest.{field} path is outside its closed conformance profile: {path}")
        excluded[field] = rows
    duplicate_logs = set(excluded["excludedDuplicateLogs"])
    bundles = set(excluded["excludedRegenerableBundles"])
    if duplicate_logs & bundles or (duplicate_logs | bundles) & set(members):
        raise ConsumeError("excluded artifact paths are duplicated or also appear as archive members")


def member_rows(value: Any, label: str, allow_any_root: bool = False) -> dict[str, dict[str, Any]]:
    if type(value) is not list:
        raise ConsumeError(f"{label} must be an array")
    rows: dict[str, dict[str, Any]] = {}
    for i, raw in enumerate(value):
        row = require_object(raw, f"{label}[{i}]", {"path", "bytes", "sha256"})
        path = safe_rel_path(row["path"], f"{label}[{i}].path")
        if type(row["bytes"]) is not int or row["bytes"] < 0:
            raise ConsumeError(f"{label}[{i}].bytes must be a nonnegative integer")
        digest = require_digest(row["sha256"], f"{label}[{i}].sha256")
        if path in rows:
            raise ConsumeError(f"duplicate path in {label}: {path}")
        root = path.split("/", 1)[0]
        if not allow_any_root and root not in ALLOWED_MEMBER_ROOTS and path != "execution-before-archive.json":
            raise ConsumeError(f"unexpected archive member root: {path}")
        rows[path] = {"path": path, "bytes": row["bytes"], "sha256": digest}
    if len(rows) > MAX_MEMBERS:
        raise ConsumeError(f"member count exceeds {MAX_MEMBERS}")
    return rows


def verify_source_git(git_dir: Path, source_commit: str, pins: dict[str, Any]) -> dict[str, Any]:
    git_dir = git_dir.expanduser().absolute()
    if not git_dir.exists():
        raise ConsumeError(f"source Git object directory is missing: {git_dir}")
    commit_type = subprocess.run(["git", f"--git-dir={git_dir}", "cat-file", "-t", source_commit],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    if commit_type.returncode != 0 or commit_type.stdout.strip() != "commit":
        raise ConsumeError(f"source Git commit is unavailable as a commit object: {source_commit}")
    rows = []
    for path, pin in sorted(pins.items()):
        data = read_git_blob(git_dir, f"{source_commit}:{path}")
        if len(data) != pin["bytes"] or sha256(data) != pin["sha256"]:
            raise ConsumeError(f"source pin differs from source Git commit object: {path}")
        rows.append({"path": path, "bytes": len(data), "sha256": sha256(data)})
    return {"status": "matched", "sourceCommit": source_commit, "sourcePinsMatched": len(rows),
            "sourcePinFiles": rows, "gitOperations": ["cat-file -t", "cat-file blob"], "writesOrFetches": False}


def verify_runtime_toolchain(args: argparse.Namespace, receipt: dict[str, Any]) -> dict[str, Any]:
    tools = require_object(receipt.get("tools"), "E-RUN receipt tools")
    python_version = subprocess.run([str(args.python), "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    go_version = subprocess.run([str(args.go), "version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    node_version = subprocess.run([str(args.node), "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    chromium_version = subprocess.run([str(args.chromium), "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    if python_version.returncode or (python_version.stdout + python_version.stderr).strip() != tools.get("python"):
        raise ConsumeError(f"Python version differs from E-RUN pin: {(python_version.stdout + python_version.stderr).strip()!r} vs {tools.get('python')!r}")
    if go_version.returncode or go_version.stdout.strip() != tools.get("go"):
        raise ConsumeError(f"root Go version differs from E-RUN pin: {go_version.stdout.strip()!r} vs {tools.get('go')!r}")
    if node_version.returncode or node_version.stdout.strip() != tools.get("node"):
        raise ConsumeError(f"Node version differs from E-RUN pin: {node_version.stdout.strip()!r} vs {tools.get('node')!r}")
    if chromium_version.returncode or chromium_version.stdout.strip() != tools.get("chromium"):
        raise ConsumeError(f"Chromium version differs from E-RUN pin: {chromium_version.stdout.strip()!r} vs {tools.get('chromium')!r}")
    if args.playwright_version != tools.get("playwright"):
        raise ConsumeError(f"Playwright version differs from E-RUN pin: {args.playwright_version!r} vs {tools.get('playwright')!r}")
    if not re.search(r"\bgo version go1\.24\.", go_version.stdout):
        raise ConsumeError("root Go 1.24 is required for offline native replay")
    if not re.fullmatch(r"v22\.\d+\.\d+", node_version.stdout.strip()):
        raise ConsumeError("Node 22 is required for relocated direct/browser replay")
    return {"python": (python_version.stdout + python_version.stderr).strip(), "go": go_version.stdout.strip(), "node": node_version.stdout.strip(),
            "chromium": chromium_version.stdout.strip(), "playwright": args.playwright_version}

def verify_manifest_and_run(manifest_path: Path, run_receipt_path: Path, expected_commit: str,
                            archive_path: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    if not COMMIT.fullmatch(expected_commit):
        raise ConsumeError("--source-commit must be a 40-character lowercase Git commit ID")
    manifest = read_json(manifest_path)
    manifest_bytes = manifest_path.read_bytes()
    manifest_sha = sha256(manifest_bytes)
    require_object(manifest, "archive manifest", MANIFEST_FIELDS)
    if manifest["schema"] != MANIFEST_SCHEMA:
        raise ConsumeError(f"unsupported archive manifest schema {manifest.get('schema')!r}")
    for field in ("sourceCommit", "verifierGitHead"):
        if manifest[field] != expected_commit:
            raise ConsumeError(f"manifest {field} is not the requested clean Git commit")
    if manifest["verifierGitDirty"] is not False:
        raise ConsumeError("refusing author-only/dirty evidence: verifierGitDirty must be false")
    if manifest["verifierSourcePinsMatch"] is not True or manifest["sourcePinMismatches"] != []:
        raise ConsumeError("source pins are not proven to match the declared Git commit")
    if manifest["archivedSnapshotVerified"] is not True:
        raise ConsumeError("archive round-trip snapshot was not verified")
    archive_pin = require_object(manifest["archive"], "manifest.archive", {"path", "bytes", "sha256"})
    if (not isinstance(archive_pin["path"], str) or not archive_pin["path"] or len(archive_pin["path"]) > 4096 or
            any(ord(ch) < 32 or ord(ch) == 127 for ch in archive_pin["path"])):
        raise ConsumeError("manifest archive path must be nonempty bounded plain text")
    if type(archive_pin["bytes"]) is not int or archive_pin["bytes"] < 1 or archive_pin["bytes"] > MAX_ARCHIVE_BYTES:
        raise ConsumeError("manifest archive byte length is outside limits")
    require_digest(archive_pin["sha256"], "manifest.archive.sha256")
    if archive_path.is_symlink() or not archive_path.is_file():
        raise ConsumeError(f"archive must be a regular non-symlink file: {archive_path}")
    actual_archive = hash_file(archive_path)
    if actual_archive["bytes"] != archive_pin["bytes"] or actual_archive["sha256"] != archive_pin["sha256"]:
        raise ConsumeError("archive bytes do not match the manifest archive pin")

    pins = require_object(manifest["sourcePins"], "manifest.sourcePins")
    if not pins or len(pins) > MAX_MEMBERS:
        raise ConsumeError(f"manifest source pin count must be between 1 and {MAX_MEMBERS}")
    for path, pin in pins.items():
        safe_rel_path(path, "source pin path")
        row = require_object(pin, f"sourcePins[{path}]", {"bytes", "sha256"})
        if type(row["bytes"]) is not int or row["bytes"] < 0:
            raise ConsumeError(f"source pin byte length is invalid: {path}")
        require_digest(row["sha256"], f"sourcePins[{path}].sha256")
    scope = validate_source_closure_scope(manifest["sourceClosureScope"], pins)
    test_sources = path_list(manifest["testSourceFilesPinned"], "testSourceFilesPinned")
    expected_tests = sorted(path for path in pins if path.endswith(".test.mjs") or path.endswith("_test.go"))
    if test_sources != expected_tests:
        raise ConsumeError("test-source inventory does not equal all pinned Node/Go test sources")

    members = member_rows(manifest["members"], "manifest.members")
    if not members:
        raise ConsumeError("manifest has no archive members")
    if sum(row["bytes"] for row in members.values()) > MAX_EXPANDED_BYTES:
        raise ConsumeError(f"archive expansion exceeds {MAX_EXPANDED_BYTES} bytes")
    for path, pin in pins.items():
        archived = members.get(f"source/{path}")
        if archived is None or archived["bytes"] != pin["bytes"] or archived["sha256"] != pin["sha256"]:
            raise ConsumeError(f"archived source closure does not match source pin: {path}")
    archived_source_paths = {path.removeprefix("source/") for path in members if path.startswith("source/")}
    if archived_source_paths != set(pins):
        missing = sorted(set(pins) - archived_source_paths)
        extra = sorted(archived_source_paths - set(pins))
        raise ConsumeError(f"source members are not a closed pin set (missing={missing[:8]}, extra={extra[:8]})")
    validate_excluded_pins(manifest, members)

    receipt = read_json(run_receipt_path)
    require_object(receipt, "E-RUN receipt", DELIVERY_RECEIPT_FIELDS)
    if receipt.get("schema") != RUN_RECEIPT_SCHEMA or receipt.get("status") != "passed":
        raise ConsumeError("E-RUN receipt is absent, unsupported, or not a clean passed run")
    if receipt.get("sourceCommit") != expected_commit:
        raise ConsumeError("E-RUN receipt sourceCommit does not match requested Git commit")
    verifier = require_object(receipt.get("verifier"), "E-RUN receipt verifier",
                              {"gitHead", "dirty", "sourcePinsMatch", "sourcePinMismatches"})
    if (verifier.get("gitHead") != expected_commit or type(verifier.get("dirty")) is not bool or
            verifier.get("dirty") is not False or type(verifier.get("sourcePinsMatch")) is not bool or
            verifier.get("sourcePinsMatch") is not True or verifier.get("sourcePinMismatches") != []):
        raise ConsumeError("E-RUN receipt does not bind clean Git HEAD and complete source pins")
    if receipt.get("sourceClosureScope") != scope:
        raise ConsumeError("E-RUN receipt source closure differs from the archive manifest")
    if receipt.get("sourcePins") != pins:
        raise ConsumeError("E-RUN receipt source pins differ from the archive manifest")
    tools = require_object(receipt.get("tools"), "E-RUN receipt tools", DELIVERY_TOOL_FIELDS)
    for key, value in tools.items():
        if not isinstance(value, str) or not value:
            raise ConsumeError(f"E-RUN receipt tools.{key} must be a nonempty string")
    attempt = require_object(receipt.get("attempt"), "E-RUN receipt attempt", {"id", "path"})
    if not all(isinstance(attempt[key], str) and attempt[key] for key in ("id", "path")):
        raise ConsumeError("E-RUN receipt attempt identity is incomplete")
    counts = require_object(receipt.get("counts"), "E-RUN receipt counts")
    if (counts.get("buildCalls") != 4 or counts.get("sourcePins") != len(pins) or
            counts.get("testSourceFilesPinned") != len(test_sources)):
        raise ConsumeError("E-RUN receipt build/source/test counts differ from the verified archive")
    scenario_counts = counts.get("scenarios")
    if type(scenario_counts) is not dict or set(scenario_counts) != set(EXPECTED_LABELS):
        raise ConsumeError("E-RUN receipt does not record the exact four scenario labels")
    for label, value in scenario_counts.items():
        require_count(value, f"E-RUN receipt counts.scenarios.{label}", positive=True)
    if counts.get("nativeEvents") != sum(scenario_counts.values()):
        raise ConsumeError("E-RUN nativeEvents does not equal the derived four-scenario event sum")

    build_index = require_object(receipt.get("buildIndex"), "E-RUN receipt buildIndex", {"path", "bytes", "sha256"})
    build_index_path = safe_rel_path(build_index["path"], "E-RUN build index path")
    if (not build_index_path.startswith("builds/") or type(build_index["bytes"]) is not int or build_index["bytes"] < 1):
        raise ConsumeError("E-RUN build index identity is incomplete or outside builds/")
    require_digest(build_index["sha256"], "E-RUN build index SHA-256")
    build_index_member = members.get(build_index_path)
    if not build_index_member or build_index_member["bytes"] != build_index["bytes"] or build_index_member["sha256"] != build_index["sha256"]:
        raise ConsumeError("E-RUN build index record does not match the archived member")

    build_summary = require_object(receipt.get("buildSummary"), "E-RUN buildSummary")
    if build_summary.get("schema") != "gobi.module-effects-build-result/v1" or \
            (build_summary.get("actualBuildCount", build_summary.get("buildCalls")) != 4):
        raise ConsumeError("E-RUN build summary does not show four independent builds")
    tests = require_object(receipt.get("tests"), "E-RUN tests")
    if tests.get("schema") != "gobi.module-effects-test-summary/v1" or tests.get("status") != "passed":
        raise ConsumeError("E-RUN test summary did not pass")
    node_tests = require_object(tests.get("node"), "E-RUN Node test summary")
    node_test_files = path_list(node_tests.get("files"), "E-RUN Node test files")
    if "compiled-module-effects/conformance/mutation-controls.test.mjs" not in node_test_files:
        raise ConsumeError("E-RUN did not execute the mutation-control report contract negative tests")
    node_test_count = node_tests.get("tests")
    if (type(node_test_count) is not int or node_test_count < 1 or node_tests.get("passed") != node_test_count or
            node_tests.get("failed") != 0 or node_tests.get("skipped") != 0):
        raise ConsumeError("E-RUN Node tests do not show a nonempty all-passed no-skip run")
    conformance = require_object(receipt.get("conformance"), "E-RUN conformance")
    if conformance.get("schema") != "gobi.module-effects-conformance-summary/v1" or conformance.get("status") != "matched":
        raise ConsumeError("E-RUN native/direct/browser conformance did not match")
    if set(conformance.get("captures", {})) != set(EXPECTED_LABELS):
        raise ConsumeError("E-RUN conformance does not contain all four scenario captures")
    capture_mutations = validate_mutation_report(
        conformance.get("captureMutationControls"), "E-RUN conformance capture mutation controls",
        REQUIRED_CAPTURE_CONTROL_IDS, require_declared_ids=True, allow_additional=True,
    )
    conformance_build = require_object(conformance.get("buildIndex"), "E-RUN conformance build index")
    build_mutations = validate_mutation_report(
        conformance_build.get("mutationControls"), "E-RUN build admission mutation controls",
        REQUIRED_BUILD_CONTROL_IDS, require_declared_ids=True, allow_additional=False,
    )
    if conformance.get("captureMutationControlsDetected") != capture_mutations["total"] or \
            conformance.get("buildAdmissionMutationControlsDetected") != build_mutations["total"]:
        raise ConsumeError("E-RUN conformance mutation-control summary counts are not array-derived")
    oracle = require_object(receipt.get("oracle"), "E-RUN oracle")
    if oracle.get("schema") != "gobi.module-effects-oracle-summary/v1" or oracle.get("status") != "matched":
        raise ConsumeError("E-RUN independent oracle summary did not match")
    native_checks = oracle.get("nativeChecks")
    parity_checks = oracle.get("parityChecks")
    if type(native_checks) is not list or type(parity_checks) is not list or \
            len(native_checks) != len(EXPECTED_LABELS) or len(parity_checks) != len(EXPECTED_LABELS):
        raise ConsumeError("E-RUN oracle did not check all four native/profile scenarios")
    oracle_mutations = validate_mutation_report(
        oracle.get("mutationControls"), "E-RUN independent oracle mutation controls", REQUIRED_CAPTURE_CONTROL_IDS,
        require_declared_ids=True, allow_additional=False,
    )
    oracle_applications = validate_mutation_control_applications(
        oracle.get("mutationControlApplications"), "E-RUN independent oracle mutation-control applications",
    )
    conformance_echo = validate_mutation_report(
        oracle.get("conformanceCaptureMutationControls"), "E-RUN oracle conformance mutation controls",
        REQUIRED_CAPTURE_CONTROL_IDS, require_declared_ids=True, allow_additional=True,
    )
    build_echo = validate_mutation_report(
        oracle.get("buildAdmissionMutationControls"), "E-RUN oracle build mutation controls",
        REQUIRED_BUILD_CONTROL_IDS, require_declared_ids=True, allow_additional=False,
    )
    if canonical_json(conformance_echo) != canonical_json(capture_mutations) or \
            canonical_json(build_echo) != canonical_json(build_mutations):
        raise ConsumeError("E-RUN oracle summary does not preserve the conformance mutation-control reports")
    receipt_counts = require_object(receipt.get("counts"), "E-RUN receipt counts")
    for field, expected in (
        ("mutationControlsDetected", oracle_mutations["total"]),
        ("conformanceCaptureMutationControlsDetected", capture_mutations["total"]),
        ("buildAdmissionMutationControlsDetected", build_mutations["total"]),
        ("mutationControlApplicationCount", oracle_applications["total"]),
        ("mutationControlApplicationsDetected", oracle_applications["mutationControlsDetected"]),
        ("mutationControlDistinctIDs", len(oracle_applications["distinctControlIds"])),
    ):
        if type(receipt_counts.get(field)) is not int or receipt_counts[field] != expected:
            raise ConsumeError(f"E-RUN receipt count {field} does not derive from its validated control array")
    demo = require_object(receipt.get("demo"), "E-RUN demo")
    smoke = require_object(demo.get("httpSmoke"), "E-RUN demo HTTP smoke")
    if demo.get("schema") != "gobi.module-effects-demo-build/v1" or demo.get("status") != "passed" or \
            smoke.get("schema") != "gobi.module-effects-demo-http-smoke/v1" or smoke.get("status") != "passed":
        raise ConsumeError("E-RUN local demo/timer browser smoke did not pass")
    validate_receipt_counts(receipt, pins, test_sources, capture_mutations, build_mutations,
                             oracle_mutations, oracle_applications)

    receipt_archive = require_object(receipt.get("archive"), "E-RUN receipt archive", DELIVERY_ARCHIVE_FIELDS)
    if receipt_archive.get("path") != archive_pin["path"]:
        raise ConsumeError("E-RUN receipt archive path differs from the manifest")
    if receipt_archive.get("bytes") != archive_pin["bytes"] or receipt_archive.get("sha256") != archive_pin["sha256"]:
        raise ConsumeError("E-RUN receipt archive hash/length differs from supplied archive")
    if receipt_archive.get("manifestSHA256") != manifest_sha:
        raise ConsumeError("E-RUN receipt manifest hash differs from supplied manifest")
    if receipt_archive.get("members") != len(members):
        raise ConsumeError("E-RUN receipt member count differs from archive manifest")
    if receipt_archive.get("excludedDuplicateLogs") != manifest["excludedDuplicateLogs"] or \
            receipt_archive.get("excludedRegenerableBundles") != manifest["excludedRegenerableBundles"]:
        raise ConsumeError("E-RUN receipt archive exclusions differ from the manifest")
    independent_consumer = require_object(receipt_archive.get("independentConsumer"), "E-RUN independent archive consumer")
    if independent_consumer.get("status") != "passed":
        raise ConsumeError("E-RUN independent archive round-trip consumer did not pass")
    if type(receipt_archive.get("commands")) is not list or not receipt_archive["commands"]:
        raise ConsumeError("E-RUN archive command inventory is missing")
    snapshot_row = members.get("execution-before-archive.json")
    if snapshot_row is None:
        raise ConsumeError("archive is missing execution-before-archive.json")
    return manifest, receipt, {"manifestSHA256": manifest_sha, "archive": actual_archive, "members": members}


def verify_execution_snapshot(snapshot_bytes: bytes, manifest: dict[str, Any], receipt: dict[str, Any]) -> None:
    if len(snapshot_bytes) > MAX_METADATA_BYTES:
        raise ConsumeError("execution-before-archive.json exceeds the metadata size limit")
    snapshot = json.loads(snapshot_bytes.decode("utf-8"), object_pairs_hook=duplicate_rejecting_object)
    require_object(snapshot, "execution-before-archive.json", EXECUTION_SNAPSHOT_FIELDS)
    if snapshot.get("schema") != EXECUTION_SNAPSHOT_SCHEMA:
        raise ConsumeError("archived execution snapshot schema is not recognized")
    if snapshot.get("sourceCommit") != manifest["sourceCommit"] or snapshot.get("verifierGitHead") != manifest["verifierGitHead"]:
        raise ConsumeError("archived execution snapshot commit binding differs from manifest")
    if snapshot.get("verifierGitDirty") is not False or snapshot.get("verifierSourcePinsMatch") is not True or snapshot.get("sourcePinMismatches") != []:
        raise ConsumeError("archived execution snapshot is dirty or source-unmatched")
    receipt_verifier = require_object(receipt.get("verifier"), "E-RUN receipt verifier",
                                      {"gitHead", "dirty", "sourcePinsMatch", "sourcePinMismatches"})
    if (receipt.get("status") != "passed" or receipt.get("sourceCommit") != manifest["sourceCommit"] or
            receipt_verifier.get("gitHead") != manifest["verifierGitHead"] or receipt_verifier.get("dirty") is not False or
            receipt_verifier.get("sourcePinsMatch") is not True or receipt_verifier.get("sourcePinMismatches") != []):
        raise ConsumeError("E-RUN receipt is not a clean source-bound pass for the archived snapshot")
    if (receipt.get("sourcePins") != manifest["sourcePins"] or
            receipt.get("sourceClosureScope") != manifest["sourceClosureScope"]):
        raise ConsumeError("E-RUN receipt source/test closure differs from the archive manifest")
    expected_tests = sorted(path for path in receipt["sourcePins"] if path.endswith(".test.mjs") or path.endswith("_test.go"))
    if expected_tests != manifest["testSourceFilesPinned"]:
        raise ConsumeError("archive test-source inventory does not derive from the receipt source pins")
    if snapshot.get("sourcePins") != manifest["sourcePins"]:
        raise ConsumeError("archived execution source pin map differs from manifest")
    if snapshot.get("testSourceFilesPinned") != manifest["testSourceFilesPinned"]:
        raise ConsumeError("archived execution test-source inventory differs from manifest")
    validate_source_closure_scope(snapshot.get("sourceClosureScope"), manifest["sourcePins"])
    validate_snapshot_counts(snapshot.get("counts"), receipt)
    validate_snapshot_command_binding(snapshot.get("commands"), receipt, manifest)


def verify_archive(archive_path: Path, manifest: dict[str, Any], members: dict[str, dict[str, Any]],
                   receipt: dict[str, Any]) -> dict[str, Any]:
    actual: dict[str, tarfile.TarInfo] = {}
    expanded = 0
    try:
        with tarfile.open(archive_path, mode="r:gz") as tar:
            for member in tar.getmembers():
                name = safe_rel_path(member.name, "tar member name")
                if name in actual:
                    raise ConsumeError(f"duplicate tar member: {name}")
                if not member.isfile() or member.issym() or member.islnk() or member.isdev() or member.isdir():
                    raise ConsumeError(f"archive member must be a regular file: {name}")
                if name not in members:
                    raise ConsumeError(f"unmanifested archive member: {name}")
                if member.size != members[name]["bytes"]:
                    raise ConsumeError(f"tar member length differs from manifest: {name}")
                expanded += member.size
                if expanded > MAX_EXPANDED_BYTES:
                    raise ConsumeError("archive expanded bytes exceed the configured limit")
                actual[name] = member
            if set(actual) != set(members):
                missing = sorted(set(members) - set(actual))
                raise ConsumeError(f"archive member inventory differs from manifest; missing={missing[:8]}")
            if len(actual) != len(members):
                raise ConsumeError("archive member count differs from manifest")
            for name, member in actual.items():
                pin = members[name]
                stream = tar.extractfile(member)
                if stream is None:
                    raise ConsumeError(f"cannot read archive member: {name}")
                digest = hashlib.sha256()
                size = 0
                with stream:
                    while True:
                        chunk = stream.read(CHUNK)
                        if not chunk:
                            break
                        size += len(chunk)
                        digest.update(chunk)
                if size != pin["bytes"] or digest.hexdigest() != pin["sha256"]:
                    raise ConsumeError(f"archive member bytes differ from manifest: {name}")
                if name == "execution-before-archive.json":
                    with tar.extractfile(member) as snapshot_stream:
                        verify_execution_snapshot(snapshot_stream.read(), manifest, receipt)
    except (tarfile.TarError, OSError) as exc:
        raise ConsumeError(f"cannot verify tar.gz archive: {exc}") from exc
    return {"members": len(actual), "expandedBytes": expanded, "archiveBytes": manifest["archive"]["bytes"],
            "archiveSHA256": manifest["archive"]["sha256"], "regularFilesOnly": True, "sourcePins": len(manifest["sourcePins"])}


def fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def rename_noreplace(source: Path, destination: Path) -> None:
    if not sys.platform.startswith("linux"):
        raise ConsumeError("safe non-overwrite commit requires Linux renameat2(RENAME_NOREPLACE)")
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        raise ConsumeError("libc renameat2 is unavailable; refusing an overwrite-unsafe fallback")
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    rc = renameat2(-100, os.fsencode(source), -100, os.fsencode(destination), 1)
    if rc != 0:
        err = ctypes.get_errno()
        raise OSError(err, os.strerror(err), str(destination))


def independent_safe_extract(archive_path: Path, destination: Path, manifest: dict[str, Any],
                             members: dict[str, dict[str, Any]]) -> dict[str, Any]:
    destination = destination.expanduser().absolute()
    if destination.exists() or destination.is_symlink():
        raise ConsumeError(f"destination already exists; refusing overwrite: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=f".{destination.name}.consume-", dir=destination.parent))
    try:
        with tarfile.open(archive_path, mode="r:gz") as tar:
            actual = {safe_rel_path(m.name, "tar member name"): m for m in tar.getmembers()}
            if set(actual) != set(members) or len(actual) != len(tar.getmembers()):
                raise ConsumeError("archive member set changed between verification and extraction")
            for name, member in actual.items():
                if not member.isfile() or member.issym() or member.islnk() or member.isdev() or member.isdir():
                    raise ConsumeError(f"refusing non-regular member during extraction: {name}")
                target = stage.joinpath(*name.split("/"))
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists() or target.is_symlink():
                    raise ConsumeError(f"duplicate output path during extraction: {name}")
                flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
                fd = os.open(target, flags, 0o644)
                digest = hashlib.sha256()
                size = 0
                try:
                    stream = tar.extractfile(member)
                    if stream is None:
                        raise ConsumeError(f"cannot read archive member during extraction: {name}")
                    with stream, os.fdopen(fd, "wb", closefd=False) as out:
                        while True:
                            chunk = stream.read(CHUNK)
                            if not chunk:
                                break
                            out.write(chunk)
                            digest.update(chunk)
                            size += len(chunk)
                        out.flush()
                        os.fsync(out.fileno())
                finally:
                    os.close(fd)
                pin = members[name]
                if size != pin["bytes"] or digest.hexdigest() != pin["sha256"]:
                    raise ConsumeError(f"extracted member differs from verified manifest: {name}")
        fsync_directory(stage)
        if destination.exists() or destination.is_symlink():
            raise ConsumeError(f"destination appeared before commit; refusing overwrite: {destination}")
        rename_noreplace(stage, destination)
        fsync_directory(destination.parent)
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise
    return {"mechanism": "independent-regular-member-guard", "destination": str(destination), "status": "passed"}


def verify_extracted_tree(root: Path, members: dict[str, dict[str, Any]]) -> dict[str, Any]:
    actual: dict[str, Path] = {}
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        base = Path(dirpath)
        for name in list(dirnames):
            child = base / name
            if child.is_symlink() or not child.is_dir():
                raise ConsumeError(f"extracted tree contains a non-directory/symlink: {child}")
        for name in filenames:
            path = base / name
            rel = path.relative_to(root).as_posix()
            if path.is_symlink() or not path.is_file():
                raise ConsumeError(f"extracted tree contains a non-regular file: {rel}")
            actual[rel] = path
    if set(actual) != set(members):
        raise ConsumeError(f"extracted file set differs from manifest: missing={sorted(set(members)-set(actual))[:8]} extra={sorted(set(actual)-set(members))[:8]}")
    allowed_dirs = set()
    for rel in members:
        parts = rel.split("/")[:-1]
        for i in range(1, len(parts) + 1):
            allowed_dirs.add("/".join(parts[:i]))
    actual_dirs = set()
    for dirpath, dirnames, _ in os.walk(root, followlinks=False):
        for name in dirnames:
            actual_dirs.add((Path(dirpath) / name).relative_to(root).as_posix())
    if actual_dirs != allowed_dirs:
        raise ConsumeError(f"extracted directory set differs from manifest parents: extra={sorted(actual_dirs-allowed_dirs)[:8]} missing={sorted(allowed_dirs-actual_dirs)[:8]}")
    for rel, path in actual.items():
        pin = members[rel]
        row = hash_file(path)
        if row["bytes"] != pin["bytes"] or row["sha256"] != pin["sha256"]:
            raise ConsumeError(f"extracted file pin mismatch: {rel}")
    return {"status": "passed", "members": len(actual), "sourcePins": sum(p.startswith("source/") for p in members)}


def require_restore_package(package_root: Path, manifest_path: Path, archive_path: Path,
                            manifest: dict[str, Any], manifest_sha: str) -> dict[str, Any]:
    index_path = package_root / "bundle-parts.json"
    packaged_manifest = package_root / "bundle.manifest.json"
    if not index_path.is_file() or index_path.is_symlink() or not packaged_manifest.is_file() or packaged_manifest.is_symlink():
        raise ConsumeError("N1 restore package needs regular bundle-parts.json and bundle.manifest.json next to restore.py")
    index_bytes = index_path.read_bytes()
    index = read_json(index_path)
    require_object(index, "bundle parts index", INDEX_FIELDS)
    if index.get("schema") != INDEX_SCHEMA or index.get("sourceCommit") != manifest["sourceCommit"]:
        raise ConsumeError("N1 parts index schema or source commit differs from manifest")
    if type(index.get("memberCount")) is not int or type(index.get("sourcePinCount")) is not int or index.get("memberCount") != len(manifest["members"]) or index.get("sourcePinCount") != len(manifest["sourcePins"]):
        raise ConsumeError("N1 index member/source counts differ from manifest")
    if sha256(packaged_manifest.read_bytes()) != manifest_sha or packaged_manifest.read_bytes() != manifest_path.read_bytes():
        raise ConsumeError("N1 package manifest bytes differ from supplied clean E-RUN manifest")
    pin = require_object(index.get("manifest"), "index.manifest", {"bytes", "sha256"})
    mb = packaged_manifest.read_bytes()
    if pin["bytes"] != len(mb) or pin["sha256"] != sha256(mb):
        raise ConsumeError("N1 index does not pin the supplied manifest bytes")
    archive_pin = require_object(index.get("archive"), "index.archive", {"bytes", "sha256"})
    if archive_pin.get("bytes") != manifest["archive"]["bytes"] or archive_pin.get("sha256") != manifest["archive"]["sha256"]:
        raise ConsumeError("N1 index archive pin differs from supplied E-RUN archive")
    part_rows = index.get("parts")
    if type(part_rows) is not list or not part_rows:
        raise ConsumeError("N1 index parts list is empty")
    names: list[str] = []
    combined_digest = hashlib.sha256()
    combined_bytes = 0
    for i, row in enumerate(part_rows):
        require_object(row, f"index.parts[{i}]", {"name", "bytes", "sha256"})
        name = row["name"]
        if not isinstance(name, str) or not re.fullmatch(r"bundle\.part-[0-9]{3}", name) or name != f"bundle.part-{i:03d}":
            raise ConsumeError("N1 part names must be consecutively numbered bundle.part-NNN")
        if type(row["bytes"]) is not int or row["bytes"] <= 0 or row["bytes"] > 64 * 1024 * 1024:
            raise ConsumeError(f"N1 part length is invalid: {name}")
        require_digest(row["sha256"], f"index.parts[{i}].sha256")
        path = package_root / "bundle" / name
        if path.is_symlink() or not path.is_file():
            raise ConsumeError(f"N1 archive part is missing or non-regular: {path}")
        got = hash_file(path)
        if got["bytes"] != row["bytes"] or got["sha256"] != row["sha256"]:
            raise ConsumeError(f"N1 archive part differs from index: {name}")
        with path.open("rb") as part_stream:
            while True:
                chunk = part_stream.read(CHUNK)
                if not chunk:
                    break
                combined_digest.update(chunk)
                combined_bytes += len(chunk)
        names.append(name)
    directory = package_root / "bundle"
    if directory.is_symlink() or not directory.is_dir():
        raise ConsumeError("N1 bundle path must be a regular directory")
    entries = list(directory.iterdir())
    if any(entry.is_symlink() or not entry.is_file() for entry in entries):
        raise ConsumeError("N1 bundle directory contains a non-regular entry")
    actual = sorted(p.name for p in entries)
    if actual != sorted(names):
        raise ConsumeError("N1 bundle directory has missing/extra/non-regular part entries")
    if combined_bytes != manifest["archive"]["bytes"] or combined_digest.hexdigest() != manifest["archive"]["sha256"]:
        raise ConsumeError("concatenated N1 parts do not reproduce the exact archive bytes")
    return {"indexPath": str(index_path), "indexBytes": len(index_bytes), "indexSHA256": sha256(index_bytes),
            "manifestPath": str(packaged_manifest), "manifestSHA256": manifest_sha, "parts": len(names),
            "concatenatedArchiveBytes": combined_bytes, "concatenatedArchiveSHA256": combined_digest.hexdigest(),
            "archivePath": str(archive_path)}


def invoke_n1_restore(restore_tool: Path, destination: Path, package_root: Path,
                      python: Path, expected: dict[str, Any], source_pins: int) -> dict[str, Any]:
    if restore_tool.is_symlink() or not restore_tool.is_file():
        raise ConsumeError(f"N1 restore tool is missing or non-regular: {restore_tool}")
    if restore_tool.parent.resolve() != package_root.resolve():
        raise ConsumeError("N1 restore tool must read its pinned local metadata/parts from --package-root")
    if expected.get("restoreSHA256") != PINNED_RESTORE_SHA256 or sha256(restore_tool.read_bytes()) != PINNED_RESTORE_SHA256:
        raise ConsumeError("N1 restore tool source hash differs from the supplied frozen pin")
    if destination.exists() or destination.is_symlink():
        raise ConsumeError("N1 restore destination already exists")
    result = subprocess.run([str(python), str(restore_tool), str(destination)], cwd=package_root,
                            env={"PATH": os.environ.get("PATH", ""), "PYTHONUTF8": "1"},
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    (expected["evidenceDir"] / "restore.stdout.log").write_bytes(result.stdout)
    (expected["evidenceDir"] / "restore.stderr.log").write_bytes(result.stderr)
    if result.returncode != 0:
        raise ConsumeError(f"N1 restore failed ({result.returncode}): {result.stderr.decode('utf-8', 'replace')[-4000:]}")
    try:
        record = json.loads(result.stdout.decode("utf-8"), object_pairs_hook=duplicate_rejecting_object)
    except Exception as exc:
        raise ConsumeError(f"N1 restore did not emit one valid JSON receipt: {exc}") from exc
    validate_n1_restore_receipt(record, destination, expected, source_pins)
    return {"mechanism": "frozen-N1-restore", "status": "passed", "receipt": record,
            "restoreTool": str(restore_tool), "restoreToolSHA256": expected["restoreSHA256"]}


def validate_n1_restore_receipt(record: Any, destination: Path, expected: dict[str, Any], source_pins: int) -> dict[str, Any]:
    require_object(record, "N1 restore receipt", {
        "status", "mode", "destination", "archiveBytes", "archiveSHA256", "memberCount", "expandedBytes",
        "sourcePinsVerified", "sourceCommit", "manifestSHA256", "indexSHA256", "remoteDownloads", "integrityScope",
    })
    if (record.get("status") != "passed" or record.get("mode") != "bundle" or
            Path(record.get("destination", "")).resolve() != destination.resolve()):
        raise ConsumeError("N1 restore receipt does not confirm the exact destination")
    for key, value in (("archiveBytes", expected["archiveBytes"]), ("archiveSHA256", expected["archiveSHA256"]),
                       ("memberCount", expected["memberCount"]), ("sourcePinsVerified", source_pins),
                       ("sourceCommit", expected["sourceCommit"]), ("manifestSHA256", expected["manifestSHA256"]),
                       ("indexSHA256", expected["indexSHA256"]), ("expandedBytes", expected["expandedBytes"])):
        if record.get(key) != value:
            raise ConsumeError(f"N1 restore receipt {key} differs from the verified archive")
    if record.get("remoteDownloads") not in ([], None):
        raise ConsumeError("N1 restore attempted remote downloads; offline acceptance requires zero")
    if record.get("remoteDownloads") != []:
        raise ConsumeError("N1 restore receipt must explicitly record zero remote downloads")
    if record.get("integrityScope") != "SHA-256 consistency pins; publisher authenticity is not established":
        raise ConsumeError("N1 restore receipt integrity scope differs from the frozen adapter contract")
    return record


def run_native_replays(attempt_root: Path, source_root: Path, go: Path, evidence: Path,
                       manifest: dict[str, Any], members: dict[str, dict[str, Any]],
                       receipt: dict[str, Any]) -> dict[str, Any]:
    summary_path = attempt_root / "conformance" / "summary.json"
    oracle_summary_path = attempt_root / "oracle" / "summary.json"
    build_integrity_path = attempt_root / "metadata" / "build-integrity.json"
    summary = read_json(summary_path)
    oracle_summary = read_json(oracle_summary_path)
    build_integrity = read_json(build_integrity_path)
    if summary.get("schema") != "gobi.module-effects-conformance-summary/v1" or summary.get("status") != "matched":
        raise ConsumeError("archived conformance summary is not a matched N4 run")
    if canonical_json(summary) != canonical_json(receipt.get("conformance")):
        raise ConsumeError("archived conformance summary differs from the clean E-RUN receipt")
    if canonical_json(oracle_summary) != canonical_json(receipt.get("oracle")):
        raise ConsumeError("archived oracle summary differs from the clean E-RUN receipt")
    captures = require_object(summary.get("captures"), "conformance summary captures")
    if sorted(captures) != sorted(EXPECTED_LABELS):
        raise ConsumeError(f"archived conformance summary scenario labels differ: {sorted(captures)}")
    for label, row in captures.items():
        record = require_object(row, f"conformance captures.{label}")
        profile_records = require_object(record.get("profiles"), f"conformance captures.{label}.profiles")
        if set(profile_records) != set(EXPECTED_PROFILES):
            raise ConsumeError(f"archived conformance capture {label} does not contain the full five-profile matrix")
    if build_integrity.get("schema") != "gobi.module-effects-build-integrity/v1":
        raise ConsumeError("archived build-integrity metadata schema is invalid")
    index_pin = require_object(build_integrity.get("index"), "build-integrity index", {"path", "bytes", "sha256"})
    build_index_rel = safe_rel_path(index_pin["path"], "build index path")
    if not build_index_rel.startswith("builds/"):
        raise ConsumeError("relocated build index must live below builds/")
    build_index_path = attempt_root.joinpath(*build_index_rel.split("/"))
    if not build_index_path.is_file() or build_index_path.is_symlink():
        raise ConsumeError("archived module build index is missing")
    build_index_bytes = build_index_path.read_bytes()
    if len(build_index_bytes) != index_pin["bytes"] or sha256(build_index_bytes) != index_pin["sha256"]:
        raise ConsumeError("archived module build index differs from its integrity pin")

    go_version = subprocess.run([str(go), "version"], cwd=source_root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    if go_version.returncode or not re.search(r"\bgo version go1\.24\.", go_version.stdout):
        raise ConsumeError(f"native replay requires root Go 1.24, got {go_version.stdout.strip()!r}")
    # Go 1.24 refuses to build in this isolated runner when HOME/XDG_CACHE_HOME
    # are intentionally absent unless GOCACHE is explicit. Keep the cache and
    # module path inside the consumer evidence tree; module downloads remain off.
    go_cache = evidence / "go-cache"
    go_path = evidence / "go-path"
    go_cache.mkdir(parents=True, exist_ok=True)
    go_path.mkdir(parents=True, exist_ok=True)
    env = {"PATH": os.environ.get("PATH", ""), "GOTOOLCHAIN": "local", "GOFLAGS": "-buildvcs=false",
           "GOCACHE": str(go_cache), "GOPATH": str(go_path), "GOMODCACHE": str(go_path / "pkg" / "mod"),
           "GOPROXY": "off", "GOSUMDB": "off", "GOWORK": "off", "GONOSUMDB": "*", "GOPRIVATE": "*"}
    binary = evidence / "bin" / "module-effects-native"
    binary.parent.mkdir(parents=True, exist_ok=True)
    build_cmd = [str(go), "build", "-trimpath", "-o", str(binary), "./cmd/module-effects-native"]
    build = subprocess.run(build_cmd, cwd=source_root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    (evidence / "native-build.stdout.log").write_bytes(build.stdout)
    (evidence / "native-build.stderr.log").write_bytes(build.stderr)
    if build.returncode != 0:
        raise ConsumeError(f"offline Go build failed ({build.returncode}): {build.stderr.decode('utf-8', 'replace')[-4000:]}")
    results = []
    source_event_counts: dict[str, int] = {}
    for label in EXPECTED_LABELS:
        row = require_object(captures[label], f"captures.{label}")
        scenario_ref = require_object(row.get("scenario"), f"captures.{label}.scenario")
        native_ref = require_object(row.get("native"), f"captures.{label}.native")
        scenario_file = locate_by_basename(attempt_root, scenario_ref.get("path"), f"{label} scenario")
        native_file = locate_by_basename(attempt_root, native_ref.get("path"), f"{label} native")
        scenario = read_json(scenario_file)
        expected_native_bytes = native_file.read_bytes()
        expected_native = read_json(native_file)
        if scenario.get("schema") != "gobi.module-effects-scenario/v1" or expected_native.get("schema") != NATIVE_SCHEMA:
            raise ConsumeError(f"{label} scenario/native schema is invalid")
        expected_name = "module-effects-literal" if label == "literal" else f"module-effects-{label}"
        if scenario.get("name") != expected_name or expected_native.get("name") != expected_name:
            raise ConsumeError(f"{label} scenario and native identity mismatch")
        if expected_native.get("events") is None or len(expected_native["events"]) != len(scenario.get("events", [])):
            raise ConsumeError(f"{label} native event count differs from source scenario")
        source_event_counts[label] = len(scenario["events"])
        command = [str(binary), "--script", str(scenario_file)]
        replay = subprocess.run(command, cwd=source_root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        actual_file = evidence / "native-replays" / f"{label}.stdout.json"
        actual_file.parent.mkdir(parents=True, exist_ok=True)
        actual_file.write_bytes(replay.stdout)
        (evidence / "native-replays" / f"{label}.stderr.log").write_bytes(replay.stderr)
        if replay.returncode != 0:
            raise ConsumeError(f"{label} native replay failed ({replay.returncode}): {replay.stderr.decode('utf-8', 'replace')[-4000:]}")
        try:
            actual_native = json.loads(replay.stdout.decode("utf-8"), object_pairs_hook=duplicate_rejecting_object)
        except Exception as exc:
            raise ConsumeError(f"{label} native replay stdout is not a single JSON record: {exc}") from exc
        byte_equal = replay.stdout == expected_native_bytes
        canonical_equal = canonical_json(actual_native) == canonical_json(expected_native)
        if actual_native.get("schema") != NATIVE_SCHEMA or actual_native.get("name") != expected_name:
            raise ConsumeError(f"{label} native replay identity/schema changed")
        if not canonical_equal:
            raise ConsumeError(f"{label} full native JSON differs from archived N4 result")
        results.append({"label": label, "events": len(scenario["events"]), "states": len(actual_native.get("states", [])),
                        "effects": len(actual_native.get("effects", [])), "transportRows": len(actual_native.get("transportLedger", [])),
                        "lifecycleRows": len(actual_native.get("lifecycle", actual_native.get("lifecycleLedger", []))),
                        "expectedBytes": len(expected_native_bytes), "actualBytes": len(replay.stdout),
                        "byteEqual": byte_equal, "canonicalJSONEqual": canonical_equal,
                        "expectedSHA256": sha256(expected_native_bytes), "actualSHA256": sha256(replay.stdout),
                        "command": command, "cwd": str(source_root), "env": env})
    receipt_counts = require_object(receipt.get("counts"), "E-RUN receipt counts", RECEIPT_COUNT_FIELDS)
    if source_event_counts != receipt_counts["scenarios"] or sum(source_event_counts.values()) != receipt_counts["nativeEvents"]:
        raise ConsumeError("E-RUN scenario/native event counts differ from the archived scenario arrays")
    return {"status": "matched", "goVersion": go_version.stdout.strip(),
            "buildCommand": build_cmd, "buildStatus": "passed", "buildBinarySHA256": hash_file(binary)["sha256"],
            "networkControls": {k: env[k] for k in ("GOTOOLCHAIN", "GOPROXY", "GOSUMDB", "GOWORK")},
            "scenarioCount": len(results), "derivedScenarioEventCounts": source_event_counts,
            "scenarioResults": results}


def locate_by_basename(root: Path, recorded_path: Any, label: str) -> Path:
    if not isinstance(recorded_path, str) or not recorded_path:
        raise ConsumeError(f"{label} has no artifact path")
    basename = Path(recorded_path).name
    if basename in ("", ".", "..") or "/" in basename or "\\" in basename:
        raise ConsumeError(f"{label} artifact basename is unsafe")
    matches = []
    for dirpath, _, filenames in os.walk(root):
        if basename in filenames:
            candidate = Path(dirpath) / basename
            if candidate.is_file() and not candidate.is_symlink():
                matches.append(candidate)
    if len(matches) != 1:
        raise ConsumeError(f"{label} artifact basename must resolve uniquely in archive: {basename} ({len(matches)} matches)")
    return matches[0]


def validate_node_consumer_summary(value: Any, attempt_root: Path, source_root: Path,
                                   output_root: Path, expected_build_index: str) -> dict[str, Any]:
    summary = require_object(value, "relocated Node consumer summary",
                             {"schema", "status", "directProfilesMatched", "direct", "browser"})
    if summary["schema"] != "gobi.module-effects-relocated-consumer/v1" or summary["status"] != "passed":
        raise ConsumeError("relocated Node consumer did not report its closed result schema as passed")
    direct = require_object(summary["direct"], "relocated Node direct result",
                            {"status", "buildIndex", "loaderSource", "scenarios", "directProfilesMatched", "profileResults"})
    expected_pairs = {(label, profile) for label in EXPECTED_LABELS
                      for profile in EXPECTED_PROFILES if profile.startswith("direct.")}
    expected_rows = len(expected_pairs)
    if (direct["status"] != "matched" or direct["buildIndex"] != expected_build_index or
            summary["directProfilesMatched"] != expected_rows or direct["directProfilesMatched"] != expected_rows or
            direct["scenarios"] != len(EXPECTED_LABELS)):
        raise ConsumeError("relocated Node direct profile counts/schema differ from the derived scenario/profile matrix")

    build_index_path = attempt_root / safe_rel_path(expected_build_index, "relocated Node build index path")
    build_index = read_json(build_index_path)
    loader_relative = "compiled-module-effects/build/module-loader.mjs"
    loader_pin = require_object(build_index.get("sourcePins"), "relocated build-index source pins").get(loader_relative)
    loader = require_object(direct["loaderSource"], "relocated Node loader source",
                            {"path", "sha256", "archivedBytesMatched"})
    expected_loader_path = (source_root / loader_relative).resolve()
    loader_path = Path(loader["path"]).resolve()
    if (loader["archivedBytesMatched"] is not True or loader_path != expected_loader_path or
            not isinstance(loader_pin, dict) or loader_pin.get("path") != loader_relative or
            loader["sha256"] != loader_pin.get("sha256") or not loader_path.is_file() or loader_path.is_symlink()):
        raise ConsumeError("relocated Node loader did not come from the extracted source tree with its pinned bytes")
    loader_bytes = loader_path.read_bytes()
    if len(loader_bytes) != loader_pin.get("bytes") or sha256(loader_bytes) != loader_pin.get("sha256"):
        raise ConsumeError("relocated Node loader file differs from the archived build-index source pin")

    conformance = read_json(attempt_root / "conformance" / "summary.json")
    if conformance.get("schema") != "gobi.module-effects-conformance-summary/v1" or \
            set(conformance.get("captures", {})) != set(EXPECTED_LABELS):
        raise ConsumeError("archived conformance summary does not contain the four direct-profile source scenarios")
    profile_rows = direct["profileResults"]
    if type(profile_rows) is not list or len(profile_rows) != expected_rows:
        raise ConsumeError("relocated Node direct.profileResults must contain the full derived 8-row matrix")
    row_fields = {"label", "profile", "events", "snapshots", "bytesEqual", "canonicalJSONEqual",
                  "expectedBytes", "actualBytes", "expectedSHA256", "actualSHA256", "outputPath"}
    observed_pairs: set[tuple[str, str]] = set()
    validated_rows = []
    for index, raw in enumerate(profile_rows):
        row = require_object(raw, f"relocated Node direct.profileResults[{index}]", row_fields)
        pair = (row["label"], row["profile"])
        if pair not in expected_pairs or pair in observed_pairs:
            raise ConsumeError("relocated Node direct profile rows contain an unknown or duplicate scenario/backend pair")
        observed_pairs.add(pair)
        capture = conformance["captures"][row["label"]]
        scenario_ref = require_object(capture.get("scenario"), f"conformance {row['label']} scenario")
        native_ref = require_object(capture.get("native"), f"conformance {row['label']} native")
        profile_refs = require_object(capture.get("profiles"), f"conformance {row['label']} profiles")
        expected_profile_ref = require_object(profile_refs.get(row["profile"]), f"conformance {row['label']} {row['profile']}")
        scenario_path = locate_by_basename(attempt_root, scenario_ref.get("path"), f"{row['label']} scenario")
        native_path = locate_by_basename(attempt_root, native_ref.get("path"), f"{row['label']} native")
        profile_path = locate_by_basename(attempt_root, expected_profile_ref.get("path"), f"{row['label']} {row['profile']} profile")
        scenario = read_json(scenario_path)
        native = read_json(native_path)
        expected_profile_bytes = profile_path.read_bytes()
        expected_profile = json.loads(expected_profile_bytes.decode("utf-8"), object_pairs_hook=duplicate_rejecting_object)
        actual_path = Path(row["outputPath"]).resolve()
        try:
            actual_path.relative_to(output_root.resolve())
        except ValueError as exc:
            raise ConsumeError("relocated direct profile output path escapes the consumer output directory") from exc
        if actual_path.is_symlink() or not actual_path.is_file():
            raise ConsumeError("relocated direct profile output is missing or non-regular")
        actual_bytes = actual_path.read_bytes()
        actual_profile = json.loads(actual_bytes.decode("utf-8"), object_pairs_hook=duplicate_rejecting_object)
        event_count = len(scenario.get("events", []))
        snapshot_count = len(expected_profile.get("snapshots", []))
        expected_digest = sha256(expected_profile_bytes)
        actual_digest = sha256(actual_bytes)
        canonical_equal = canonical_json(actual_profile) == canonical_json(expected_profile)
        byte_equal = actual_bytes == expected_profile_bytes
        if (scenario.get("schema") != "gobi.module-effects-scenario/v1" or native.get("schema") != NATIVE_SCHEMA or
                len(native.get("events", [])) != event_count or
                type(row["events"]) is not int or row["events"] != event_count or
                type(row["snapshots"]) is not int or row["snapshots"] != snapshot_count or
                type(row["expectedBytes"]) is not int or row["expectedBytes"] != len(expected_profile_bytes) or
                type(row["actualBytes"]) is not int or row["actualBytes"] != len(actual_bytes) or
                row["expectedSHA256"] != expected_digest or row["actualSHA256"] != actual_digest or
                row["bytesEqual"] is not byte_equal or row["canonicalJSONEqual"] is not canonical_equal or
                not canonical_equal):
            raise ConsumeError(f"relocated {row['label']} {row['profile']} row/count/pin/full-JSON comparison differs from its archived capture")
        validated_rows.append({"label": row["label"], "profile": row["profile"], "events": event_count,
                               "snapshots": snapshot_count, "bytesEqual": byte_equal,
                               "canonicalJSONEqual": canonical_equal, "expectedSHA256": expected_digest,
                               "actualSHA256": actual_digest})
    if observed_pairs != expected_pairs:
        raise ConsumeError("relocated Node direct profile rows do not exactly cover all scenario/backend pairs")

    browser = require_object(summary["browser"], "relocated Node browser result")
    if browser.get("status") != "passed" or browser.get("httpStatus") != 200 or browser.get("externalNetworkBlocked") is not True:
        raise ConsumeError("relocated archived-demo browser result did not pass with external networking blocked")
    for field in ("pageErrors", "consoleErrors", "requestFailures", "httpErrors", "externalRequests"):
        if type(browser.get(field)) is not list or browser[field]:
            raise ConsumeError(f"relocated browser {field} must be an empty recorded array")
    steps = browser.get("steps")
    expected_steps = {
        "initial-two-key-mount", "request-pending-disabled-controls", "Go-declared-cancel",
        "React-swap-counter-and-request", "timer-completed-across-renderer-swap",
        "remove-remount-new-generation-and-timer",
    }
    if type(steps) is not list or {step.get("name") for step in steps if type(step) is dict and step.get("passed") is True} != expected_steps or len(steps) != len(expected_steps):
        raise ConsumeError("relocated browser step results do not cover the six passed mount/request/cancel/swap/timer/remount actions")
    clicks = browser.get("actualHTMLElementClicks")
    click_count = require_count(browser.get("actualHTMLElementClickCount"), "relocated browser actualHTMLElementClickCount", positive=True)
    if type(clicks) is not list or len(clicks) != click_count or any(type(row) is not dict or row.get("mechanism") != "HTMLElement.click()" for row in clicks):
        raise ConsumeError("relocated browser actual click inventory does not contain the declared HTMLElement.click actions")
    require_count(browser.get("rendererSwaps"), "relocated browser rendererSwaps", positive=True)
    require_count(browser.get("timerReplies"), "relocated browser timerReplies", positive=True)
    if browser.get("removedAndRemounted") != {"key": "b", "oldGeneration": 1, "newGeneration": 2}:
        raise ConsumeError("relocated browser did not prove the b:g1 to b:g2 remove/remount flow")
    requests = browser.get("requests")
    if type(requests) is not list or not requests:
        raise ConsumeError("relocated browser request trace is missing")
    for index, request in enumerate(requests):
        request = require_object(request, f"relocated browser requests[{index}]")
        if "url" in request:
            parsed = __import__("urllib.parse", fromlist=["urlparse"]).urlparse(request["url"])
            if parsed.scheme != "http" or parsed.hostname != "127.0.0.1":
                raise ConsumeError("relocated browser request trace contains a nonlocal URL")
        elif "path" in request:
            if not isinstance(request["path"], str) or not request["path"].startswith("/") or request.get("status") != 200:
                raise ConsumeError("relocated browser local server request is malformed or did not return HTTP 200")
        else:
            raise ConsumeError("relocated browser request row lacks a browser URL or local server path")
    screenshot = require_object(browser.get("illustrativeScreenshot"), "relocated browser illustrative screenshot",
                                {"path", "bytes", "sha256", "capturedAfter", "pixelEquivalenceAsserted"})
    screenshot_path = Path(screenshot["path"]).resolve()
    try:
        screenshot_path.relative_to(output_root.resolve())
    except ValueError as exc:
        raise ConsumeError("relocated browser screenshot path escapes the consumer output directory") from exc
    if screenshot.get("pixelEquivalenceAsserted") is not False or \
            screenshot.get("capturedAfter") != "verified timer completion, renderer swap, and child remount" or \
            screenshot_path.is_symlink() or not screenshot_path.is_file():
        raise ConsumeError("relocated browser screenshot is missing, mislabeled, or claims pixel equivalence")
    screenshot_pin = hash_file(screenshot_path)
    if screenshot_pin["bytes"] != screenshot.get("bytes") or screenshot_pin["sha256"] != screenshot.get("sha256"):
        raise ConsumeError("relocated browser screenshot bytes differ from the declared illustrative pin")
    return {"status": "passed", "directProfilesMatched": expected_rows,
            "directProfileRows": validated_rows, "browserSteps": len(steps), "actualHTMLElementClickCount": click_count,
            "browserRequests": len(requests), "externalRequests": len(browser["externalRequests"]),
            "illustrativeScreenshot": screenshot_pin}


def run_node_relocated(attempt_root: Path, source_root: Path, node: Path, chromium: Path,
                       playwright_module: Path, playwright_version: str, node_script: Path,
                       evidence: Path) -> dict[str, Any]:
    plan_path = evidence / "node-plan.json"
    integrity = read_json(attempt_root / "metadata" / "build-integrity.json")
    plan = {
        "schema": "gobi.module-effects-consumer-plan/v1",
        "attemptRoot": str(attempt_root), "sourceRoot": str(source_root),
        "buildIndex": "builds/build-index.json",
        "conformanceSummary": "conformance/summary.json",
        "demoRoot": "demo/site",
        "expectedProfiles": EXPECTED_PROFILES,
        "playwrightModule": str(playwright_module), "playwrightVersion": playwright_version,
        "chromium": str(chromium),
        "output": str(evidence / "node-results"),
    }
    # build-integrity is authoritative if its index filename differs from the conventional location.
    plan["buildIndex"] = integrity["index"]["path"]
    plan_path.write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    node_version = subprocess.run([str(node), "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
    if node_version.returncode or not re.fullmatch(r"v22\.\d+\.\d+", node_version.stdout.strip()):
        raise ConsumeError(f"relocated direct/browser replay requires Node 22, got {node_version.stdout.strip()!r}")
    cmd = [str(node), str(node_script), "--plan", str(plan_path)]
    result = subprocess.run(cmd, cwd=source_root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    (evidence / "node-consumer.stdout.log").write_bytes(result.stdout)
    (evidence / "node-consumer.stderr.log").write_bytes(result.stderr)
    if result.returncode != 0:
        raise ConsumeError(f"relocated direct/browser consumer failed ({result.returncode}): {result.stderr.decode('utf-8', 'replace')[-6000:]}")
    try:
        data = json.loads(result.stdout.decode("utf-8"), object_pairs_hook=duplicate_rejecting_object)
    except Exception as exc:
        raise ConsumeError(f"Node consumer did not emit one JSON summary: {exc}") from exc
    consumer_check = validate_node_consumer_summary(data, attempt_root, source_root,
                                                     evidence / "node-results", plan["buildIndex"])
    return {"nodeVersion": node_version.stdout.strip(), "command": cmd,
            "loaderSource": "relocated source/compiled-module-effects/build/module-loader.mjs",
            "consumerCheck": consumer_check, "summary": data}


def write_json_new(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def run_accept(args: argparse.Namespace) -> dict[str, Any]:
    evidence = args.output.expanduser().absolute()
    if evidence.exists() or evidence.is_symlink():
        raise ConsumeError(f"evidence output already exists: {evidence}")
    evidence.mkdir(parents=True, exist_ok=False)
    result: dict[str, Any] = {"schema": "gobi.module-effects-consume/v1", "outcome": "insufficient_evidence",
                              "qualification": {"phase": "clean_archive_acceptance", "status": "running"}}
    try:
        manifest, run_receipt, pins = verify_manifest_and_run(args.manifest, args.run_receipt,
                                                              args.source_commit, args.archive)
        toolchain = verify_runtime_toolchain(args, run_receipt)
        source_git = verify_source_git(args.source_git_dir, manifest["sourceCommit"], manifest["sourcePins"])
        archive_check = verify_archive(args.archive, manifest, pins["members"], run_receipt)
        if args.restore_sha256 != PINNED_RESTORE_SHA256:
            raise ConsumeError("E-CONSUME requires the frozen N1 restore adapter SHA-256")
        package_check = require_restore_package(args.package_root, args.manifest, args.archive,
                                                manifest, pins["manifestSHA256"])
        destination = args.destination.expanduser().absolute()
        if package_check["archivePath"] != str(args.archive):
            raise ConsumeError("package archive path identity changed")
        expanded_bytes = sum(row["bytes"] for row in pins["members"].values())
        restore_meta = {"restoreSHA256": args.restore_sha256, "evidenceDir": evidence,
                        "archiveBytes": manifest["archive"]["bytes"], "archiveSHA256": manifest["archive"]["sha256"],
                        "memberCount": len(pins["members"]), "sourceCommit": manifest["sourceCommit"],
                        "manifestSHA256": pins["manifestSHA256"], "indexSHA256": package_check["indexSHA256"],
                        "expandedBytes": expanded_bytes}
        extraction = invoke_n1_restore(args.restore_tool, destination, args.package_root,
                                       args.python, restore_meta, len(manifest["sourcePins"]))
        tree_check = verify_extracted_tree(destination, pins["members"])
        source_root = destination / "source"
        native = run_native_replays(destination, source_root, args.go, evidence,
                                    manifest, pins["members"], run_receipt)
        node = run_node_relocated(destination, source_root, args.node, args.chromium,
                                  args.playwright_module, args.playwright_version,
                                  args.browser_script, evidence)
        result = {
            "schema": "gobi.module-effects-consume/v1", "outcome": "mixed_change",
            "qualification": {"phase": "clean_archive_acceptance", "status": "passed"},
            "status": "passed",
            "job_id": "E-CONSUME", "sourceCommit": manifest["sourceCommit"],
            "manifestSHA256": pins["manifestSHA256"], "archive": pins["archive"],
            "manifestMemberCount": len(pins["members"]), "sourcePinCount": len(manifest["sourcePins"]),
            "testSourcePinCount": len(manifest["testSourceFilesPinned"]),
            "archiveVerification": archive_check, "sourceGitVerification": source_git, "toolchain": toolchain,
            "restorePackageVerification": package_check,
            "extraction": extraction, "extractedTreeVerification": tree_check,
            "nativeReplay": native, "relocatedProfilesAndBrowser": node,
            "limits": [
                "Checksums establish byte consistency, not publisher authenticity; published Git-object readback is a separate post-publication stage.",
                "Go was forced offline through GOPROXY=off and GOSUMDB=off; this demonstrates cached/toolchain-free root-module replay, not arbitrary dependency vendoring.",
                "Browser input uses HTMLElement.click(), not trusted pointer or OS input.",
                "External browser requests are blocked; the local demo is accepted only if it makes no external request attempts and reports no browser/page errors.",
            ],
        }
        write_json_new(evidence / "consume-summary.json", result)
        return result
    except Exception as exc:
        failure = {"schema": "gobi.module-effects-consume-failure/v1", "outcome": "insufficient_evidence",
                   "qualification": {"phase": "clean_archive_acceptance", "status": "rejected"}, "status": "rejected",
                   "error": {"type": type(exc).__name__, "message": str(exc)},
                   "sourceCommitArgument": args.source_commit,
                   "manifest": str(args.manifest), "archive": str(args.archive)}
        try:
            write_json_new(evidence / "failure.json", failure)
        except Exception:
            pass
        raise


def read_git_blob(git_dir: Path, spec: str) -> bytes:
    proc = subprocess.run(["git", f"--git-dir={git_dir}", "cat-file", "blob", spec],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        raise ConsumeError(f"read-only git cat-file failed for {spec}: {proc.stderr.decode('utf-8', 'replace')[-2000:]}")
    return proc.stdout


def validate_readback_manifest(manifest: Any, source_commit: str) -> dict[str, dict[str, Any]]:
    require_object(manifest, "readback manifest")
    if manifest.get("schema") == MANIFEST_SCHEMA:
        require_object(manifest, "readback E-RUN manifest", MANIFEST_FIELDS)
        if (manifest.get("verifierGitHead") != source_commit or manifest.get("verifierGitDirty") is not False or
                manifest.get("verifierSourcePinsMatch") is not True or manifest.get("sourcePinMismatches") != [] or
                manifest.get("archivedSnapshotVerified") is not True):
            raise ConsumeError("readback E-RUN manifest is not a clean Git-bound archive")
        members = member_rows(manifest["members"], "readback manifest.members")
        pins = require_object(manifest["sourcePins"], "readback manifest.sourcePins")
        if not pins or len(pins) > MAX_MEMBERS:
            raise ConsumeError("readback source pin count is empty or exceeds the bounded profile")
        archive = require_object(manifest["archive"], "readback manifest.archive", {"path", "bytes", "sha256"})
        if not isinstance(archive["path"], str) or not archive["path"] or len(archive["path"]) > 4096:
            raise ConsumeError("readback archive path is missing or exceeds its bound")
        if type(archive["bytes"]) is not int or archive["bytes"] < 1 or archive["bytes"] > MAX_ARCHIVE_BYTES:
            raise ConsumeError("readback archive byte length is outside bounds")
        require_digest(archive["sha256"], "readback archive SHA-256")
        normalized = {}
        for path, raw in pins.items():
            path = safe_rel_path(path, "readback source pin path")
            row = require_object(raw, f"readback source pin {path}", {"bytes", "sha256"})
            if type(row["bytes"]) is not int or row["bytes"] < 0:
                raise ConsumeError(f"readback source pin byte length is invalid: {path}")
            normalized[path] = {"bytes": row["bytes"], "sha256": require_digest(row["sha256"], f"readback source pin {path} SHA-256")}
        validate_source_closure_scope(manifest["sourceClosureScope"], normalized)
        test_paths = path_list(manifest["testSourceFilesPinned"], "readback testSourceFilesPinned")
        expected_tests = sorted(path for path in normalized if path.endswith(".test.mjs") or path.endswith("_test.go"))
        if test_paths != expected_tests:
            raise ConsumeError("readback test-source inventory differs from the pinned source tests")
        for path, pin in normalized.items():
            member = members.get(f"source/{path}")
            if not member or member["bytes"] != pin["bytes"] or member["sha256"] != pin["sha256"]:
                raise ConsumeError(f"readback source pin does not match archived source member: {path}")
        if {path.removeprefix("source/") for path in members if path.startswith("source/")} != set(normalized):
            raise ConsumeError("readback archived source members differ from the complete source pin map")
        validate_excluded_pins(manifest, members)
        return normalized

    legacy_fields = {"schema", "sourceCommit", "verifierGitHead", "verifierGitDirty",
                     "verifierSourcePinsMatch", "sourcePins", "members", "archive", "archivedSnapshotVerified"}
    require_object(manifest, "legacy readback manifest", legacy_fields)
    if manifest["schema"] != "gobi.keyed-modules-archive-manifest/v1":
        raise ConsumeError("readback manifest schema is unsupported")
    if (manifest["verifierGitHead"] != source_commit or manifest["verifierGitDirty"] is not False or
            manifest["verifierSourcePinsMatch"] is not True or manifest["archivedSnapshotVerified"] is not True):
        raise ConsumeError("legacy readback manifest is not clean and source-pinned")
    members = member_rows(manifest["members"], "legacy readback manifest.members")
    pins = require_object(manifest["sourcePins"], "legacy readback manifest.sourcePins")
    if not pins or len(pins) > MAX_MEMBERS:
        raise ConsumeError("legacy readback source pin count is empty or exceeds the bounded profile")
    archive = require_object(manifest["archive"], "legacy readback manifest.archive", {"path", "bytes", "sha256"})
    if not isinstance(archive["path"], str) or not archive["path"] or len(archive["path"]) > 4096:
        raise ConsumeError("legacy readback archive path is missing or exceeds its bound")
    if type(archive["bytes"]) is not int or archive["bytes"] < 1 or archive["bytes"] > MAX_ARCHIVE_BYTES:
        raise ConsumeError("legacy readback archive byte length is outside bounds")
    require_digest(archive["sha256"], "legacy readback archive SHA-256")
    normalized = {}
    for path, raw in pins.items():
        path = safe_rel_path(path, "legacy readback source pin path")
        row = require_object(raw, f"legacy readback source pin {path}", {"bytes", "sha256"})
        if type(row["bytes"]) is not int or row["bytes"] < 0:
            raise ConsumeError(f"legacy readback source pin byte length is invalid: {path}")
        normalized[path] = {"bytes": row["bytes"], "sha256": require_digest(row["sha256"], f"legacy readback source pin {path} SHA-256")}
    for path, pin in normalized.items():
        member = members.get(f"source/{path}")
        if not member or member["bytes"] != pin["bytes"] or member["sha256"] != pin["sha256"]:
            raise ConsumeError(f"legacy readback source pin does not match archived source member: {path}")
    if {path.removeprefix("source/") for path in members if path.startswith("source/")} != set(normalized):
        raise ConsumeError("legacy archived source members differ from the complete source pin map")
    return normalized


def readback_publication_file(root: Path, relative_path: str) -> Path:
    root_real = root.resolve(strict=True)
    current = root_real
    parts = relative_path.split("/")
    for index, part in enumerate(parts):
        current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError as exc:
            raise ConsumeError(f"local published metadata/part is missing: {relative_path}") from exc
        if current.is_symlink():
            raise ConsumeError(f"local published metadata/part path contains a symlink: {relative_path}")
        if index < len(parts) - 1 and not current.is_dir():
            raise ConsumeError(f"local published metadata/part parent is not a directory: {relative_path}")
        if index == len(parts) - 1 and not current.is_file():
            raise ConsumeError(f"local published metadata/part is not a regular file: {relative_path}")
    resolved = current.resolve(strict=True)
    if not resolved.is_relative_to(root_real):
        raise ConsumeError(f"local published metadata/part escaped its provided root: {relative_path}")
    return resolved


def git_readback(args: argparse.Namespace) -> dict[str, Any]:
    git_dir = args.git_dir.expanduser().absolute()
    if not git_dir.is_dir() or (git_dir / "config").is_symlink() or not (git_dir / "config").is_file():
        raise ConsumeError("--git-dir must be a provided bare Git object directory")
    if not COMMIT.fullmatch(args.evidence_commit) or not COMMIT.fullmatch(args.source_commit):
        raise ConsumeError("readback commit IDs must be 40 lowercase hex digits")
    manifest = read_json(args.manifest)
    if manifest.get("sourceCommit") != args.source_commit:
        raise ConsumeError("readback manifest source commit mismatch")
    source_pins = validate_readback_manifest(manifest, args.source_commit)
    prefix = safe_rel_path(args.prefix.rstrip("/"), "published Git prefix")
    publication = read_json(args.publication_files)
    require_object(publication, "publication file map", {"files"})
    entries = member_rows(publication.get("files"), "publication.files", allow_any_root=True)
    publication_root = args.publication_root.expanduser().absolute()
    if not publication_root.is_dir() or publication_root.is_symlink():
        raise ConsumeError("--publication-root must be a provided directory of local published metadata/parts")
    for rel, pin in entries.items():
        local = readback_publication_file(publication_root, rel)
        local_pin = hash_file(local)
        if local_pin["bytes"] != pin["bytes"] or local_pin["sha256"] != pin["sha256"]:
            raise ConsumeError(f"local published metadata/part differs from expected pin: {rel}")
    if not entries:
        raise ConsumeError("publication file map is empty")
    for commit in (args.source_commit, args.evidence_commit):
        commit_type = subprocess.run(["git", f"--git-dir={git_dir}", "cat-file", "-t", commit],
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False)
        if commit_type.returncode != 0 or commit_type.stdout.strip() != "commit":
            raise ConsumeError(f"readback object is not an available Git commit: {commit}")
    if manifest.get("schema") == MANIFEST_SCHEMA:
        ancestor = subprocess.run(["git", f"--git-dir={git_dir}", "merge-base", "--is-ancestor",
                                   args.source_commit, args.evidence_commit],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if ancestor.returncode != 0:
            raise ConsumeError("published E-RUN evidence commit is not descended from its declared source commit")
    names_proc = subprocess.run(["git", f"--git-dir={git_dir}", "ls-tree", "-r", "-z", args.evidence_commit,
                                 "--", prefix], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if names_proc.returncode:
        raise ConsumeError(f"git ls-tree failed: {names_proc.stderr.decode('utf-8', 'replace')[-2000:]}")
    git_entries: dict[str, dict[str, str]] = {}
    for raw in names_proc.stdout.split(b"\0"):
        if not raw:
            continue
        try:
            header, raw_path = raw.split(b"\t", 1)
            mode, object_type, object_id = header.decode("ascii").split(" ")
            path = raw_path.decode("utf-8")
        except Exception as exc:
            raise ConsumeError(f"git ls-tree returned an invalid record: {exc}") from exc
        if object_type != "blob" or mode not in ("100644", "100755"):
            raise ConsumeError(f"published Git path is not a regular blob: {path} ({mode} {object_type})")
        if path in git_entries:
            raise ConsumeError(f"duplicate path in published Git tree: {path}")
        git_entries[path] = {"mode": mode, "oid": object_id}
    names = list(git_entries)
    expected_git_paths = {f"{prefix}/{name}" for name in entries}
    if set(names) != expected_git_paths:
        raise ConsumeError(f"published Git file set differs: missing={sorted(expected_git_paths-set(names))[:8]} extra={sorted(set(names)-expected_git_paths)[:8]}")
    published = []
    for rel, pin in entries.items():
        path = f"{prefix}/{rel}"
        data = read_git_blob(git_dir, f"{args.evidence_commit}:{path}")
        if len(data) != pin["bytes"] or sha256(data) != pin["sha256"]:
            raise ConsumeError(f"published Git metadata/part mismatch: {path}")
        published.append({"path": path, "bytes": len(data), "sha256": sha256(data)})
    source_results = []
    for path, pin in source_pins.items():
        data = read_git_blob(git_dir, f"{args.source_commit}:{path}")
        if len(data) != pin["bytes"] or sha256(data) != pin["sha256"]:
            raise ConsumeError(f"archived source pin differs from source Git commit: {path}")
        source_results.append({"path": path, "bytes": len(data), "sha256": sha256(data)})
    changed = subprocess.run(["git", f"--git-dir={git_dir}", "diff-tree", "--no-commit-id", "--name-only", "-r", "-z",
                             args.source_commit, args.evidence_commit], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if changed.returncode:
        raise ConsumeError(f"read-only git diff-tree failed: {changed.stderr.decode('utf-8', 'replace')[-2000:]}")
    changed_paths = [path.decode("utf-8") for path in changed.stdout.split(b"\0") if path]
    if any(not path.startswith(prefix + "/") for path in changed_paths):
        raise ConsumeError(f"evidence commit changes files outside publication prefix: {[p for p in changed_paths if not p.startswith(prefix + '/')][:8]}")
    return {"schema": "gobi.module-effects-git-readback/v1", "outcome": "confirmed_reuse",
            "qualification": {"phase": "published_git_readback", "status": "passed"}, "status": "passed",
            "sourceCommit": args.source_commit, "evidenceCommit": args.evidence_commit,
            "publishedPrefix": prefix, "publishedMetadataAndParts": published,
            "publishedFileCount": len(published), "sourcePinsMatched": len(source_results),
            "sourcePinFiles": source_results, "sourceChangesOutsidePublishedPrefix": False,
            "gitOperations": ["ls-tree", "cat-file blob", "diff-tree"], "writesOrFetches": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    accept = sub.add_parser("accept", help="verify/restore/replay a clean E-RUN archive")
    accept.add_argument("--archive", type=Path, required=True)
    accept.add_argument("--manifest", type=Path, required=True)
    accept.add_argument("--run-receipt", type=Path, required=True)
    accept.add_argument("--source-commit", required=True)
    accept.add_argument("--source-git-dir", type=Path, required=True)
    accept.add_argument("--destination", type=Path, required=True)
    accept.add_argument("--output", type=Path, required=True)
    accept.add_argument("--go", type=Path, required=True)
    accept.add_argument("--node", type=Path, required=True)
    accept.add_argument("--chromium", type=Path, required=True)
    accept.add_argument("--playwright-module", type=Path, required=True)
    accept.add_argument("--playwright-version", required=True)
    accept.add_argument("--browser-script", type=Path, default=Path(__file__).with_name("consume-browser.mjs"))
    accept.add_argument("--restore-tool", type=Path, required=True)
    accept.add_argument("--restore-sha256", required=True)
    accept.add_argument("--package-root", type=Path, required=True)
    accept.add_argument("--python", type=Path, default=Path(sys.executable))
    readback = sub.add_parser("readback", help="read-only published Git-object verification")
    readback.add_argument("--git-dir", type=Path, required=True)
    readback.add_argument("--evidence-commit", required=True)
    readback.add_argument("--source-commit", required=True)
    readback.add_argument("--prefix", required=True)
    readback.add_argument("--manifest", type=Path, required=True)
    readback.add_argument("--publication-files", type=Path, required=True)
    readback.add_argument("--publication-root", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "accept":
            if not HEX256.fullmatch(args.restore_sha256):
                raise ConsumeError("--restore-sha256 must be lowercase SHA-256")
            if args.restore_sha256 != PINNED_RESTORE_SHA256:
                raise ConsumeError("--restore-sha256 must equal the frozen N1 restore adapter pin")
            result = run_accept(args)
        else:
            result = git_readback(args)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except Exception as exc:
        print(f"consume failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
