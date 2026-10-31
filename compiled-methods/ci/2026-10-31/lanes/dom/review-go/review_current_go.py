#!/usr/bin/env python3
"""Independent XR-CI-GO verification and rerun of retained primary artifacts."""

from __future__ import annotations

import hashlib
import json
import shutil
import struct
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
CI = ROOT / "compiled-methods/ci/2026-10-31"
REVIEW = CI / "lanes/dom/review-go"
ARCHIVE = CI / "original.zip"
ATTEMPT_REL = Path("compiled-methods/artifacts/attempts/attempt-20261031T044100445Z")
EXTRACTED = CI / "extracted"
ATTEMPT = EXTRACTED / ATTEMPT_REL
NODE = Path("/tmp/gondola-node22/node_modules/node/bin/node")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_file(path: Path):
    return json.loads(path.read_text())


def encode(value, type_id, type_map):
    info = type_map[type_id]
    if info["kind"] == "struct":
        return {
            "typeId": type_id,
            "kind": "struct",
            "fields": [
                {"name": field["name"], "value": encode(value[field["name"]], field["type"], type_map)}
                for field in info["fields"]
            ],
        }
    if info["kind"] == "bool":
        return {"typeId": type_id, "kind": "bool", "bool": value}
    if info["kind"] == "float64":
        return {"typeId": type_id, "kind": "float64", "float64Bits": struct.pack(">d", float(value)).hex()}
    raise AssertionError(f"unexpected fixture type {type_id}: {info['kind']}")


publication = json_file(CI / "publication-current.json")
metadata = json_file(CI / "primary-artifact-metadata.json")
retention = json_file(CI / "artifact-retention.json")
author_report_path = CI / "coordination/reports/E-CI-GO.md"
author_receipt_path = CI / "coordination/receipts/E-CI-GO.json"
author_report = author_report_path.read_bytes()
author_receipt = json.loads(author_receipt_path.read_text())
author_audit_path = CI / "lanes/go/current-ci-audit.json"
author_audit = json_file(author_audit_path)
author_script_path = CI / "lanes/go/audit_current_ci.py"
assert sha256(author_report) == author_receipt["report"]["sha256"]
assert sha256(author_audit_path.read_bytes()) == author_receipt["audit_result"]["sha256"]
assert sha256(author_script_path.read_bytes()) == author_receipt["audit_program"]["sha256"]
assert author_receipt["source"]["commit"] == publication["sourceCommit"] == "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
assert author_receipt["source"]["tree"] == publication["sourceTree"] == "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
assert author_receipt["outcome"] == "mixed_change"
assert author_receipt["summary"].strip()

archive_bytes = ARCHIVE.read_bytes()
archive_sha = sha256(archive_bytes)
assert len(archive_bytes) == retention["providerZipBytes"] == metadata["size_in_bytes"] == 11_460_089
assert archive_sha == retention["providerZipSha256"]
assert metadata["digest"] == f"sha256:{archive_sha}"
assert metadata["workflow_run"]["id"] == retention["run"] == publication["primaryPush"] == 41169518187
assert metadata["workflow_run"]["head_sha"] == retention["source"] == publication["sourceCommit"]
assert retention["job"] == 124444234335 and retention["workflowOutcome"] == "success"
manifest = {item["path"]: item for item in retention["members"]}
member_count = 0
with zipfile.ZipFile(ARCHIVE) as archive:
    assert archive.testzip() is None
    names = set(archive.namelist())
    assert len(names) == len(manifest) == 968 and names == set(manifest)
    for name, pin in manifest.items():
        blob = archive.read(name)
        assert len(blob) == pin["bytes"] and sha256(blob) == pin["sha256"]
        extracted = EXTRACTED / name
        assert extracted.is_file() and extracted.read_bytes() == blob
        member_count += 1
assert len([path for path in EXTRACTED.rglob("*") if path.is_file()]) == member_count

execution = json_file(ATTEMPT / "execution.json")
run = json_file(ATTEMPT / "matrix/methods.run.json")
assert execution["mode"] == "full" and execution["status"] == "passed" and not execution["failures"]
assert len(execution["commands"]) == 17
for command in execution["commands"]:
    assert command["exitCode"] == 0 and command["signal"] is None and command["error"] is None
    stdout = (EXTRACTED / command["stdoutPath"]).read_bytes()
    stderr = (EXTRACTED / command["stderrPath"]).read_bytes()
    assert sha256(stdout) == command["stdoutSha256"]
    assert sha256(stderr) == command["stderrSha256"]
assert execution["sourcePinsMatch"] and execution["methodMatrix"]["status"] == "matched"
assert run["status"] == "matched" and run["sourceStable"] and run["sourceStableThroughCheck"] and run["outputsStableThroughCheck"]
assert run["sourcePinsBefore"] == run["sourcePinsAfter"] == run["sourcePinsFinal"]
assert len(run["sourcePinsBefore"]) == 188
source_pin_matches = 0
for pin in run["sourcePinsBefore"]:
    generated = EXTRACTED / pin["path"]
    source = generated if generated.is_file() else ROOT / pin["path"]
    data = source.read_bytes()
    assert len(data) == pin["bytes"] and sha256(data) == pin["sha256"]
    source_pin_matches += 1
output_pin_matches = 0
ci_abs_prefix = "/home/runner/work/gondola/gondola/"
for pin in run["outputPinsAfterCheck"]:
    assert pin["path"].startswith(ci_abs_prefix)
    rel = pin["path"][len(ci_abs_prefix):]
    generated = EXTRACTED / rel
    source = generated if generated.is_file() else ROOT / rel
    data = source.read_bytes()
    assert len(data) == pin["bytes"] and sha256(data) == pin["sha256"]
    output_pin_matches += 1
assert output_pin_matches == 149

fixture_path = ROOT / "compiled-methods/conformance/fixtures/methods.json"
contract_path = ROOT / "compiled-methods/conformance/method-contract.json"
fixture = json_file(fixture_path)
contract = json_file(contract_path)
assert sha256(fixture_path.read_bytes()) == execution["fixture"]["sha256"]
appdir = ATTEMPT / "builds/react/output/apps/methods-0cac42b0a982"
dom_appdir = ATTEMPT / "builds/dom/output/apps/methods-0cac42b0a982"
appir_bytes = (appdir / "app-ir.json").read_bytes()
appir = json.loads(appir_bytes)
dom_appir = json_file(dom_appdir / "app-ir.json")
assert appir == dom_appir
assert sha256(appir_bytes) == author_audit["methods_run"]["appir_sha256"]
symbols = {symbol["id"]: symbol for symbol in appir["symbols"]}
expected_symbols = {symbol["id"]: symbol for symbol in contract["symbols"]}
assert len(symbols) == 15 and set(symbols) == set(expected_symbols)
for symbol_id, expected in expected_symbols.items():
    actual = symbols[symbol_id]
    assert actual["signature"]["params"] == expected["params"]
    assert actual["signature"]["results"] == expected["results"]
    assert actual["calls"] == expected["calls"]
state_type = contract["stateType"]
counter_type = contract["counterStateType"]
type_map = {entry["id"]: entry for entry in appir["types"]}
role = appir["components"][0]
assert role["init"] == contract["roles"]["init"]
assert role["update"] == contract["roles"]["update"]
assert role["view"] == contract["roles"]["view"]
assert "numeric.float64" in role["capabilities"]

native_path = ATTEMPT / "matrix/methods.native.json"
direct_path = ATTEMPT / "matrix/methods.direct.json"
native_bytes = native_path.read_bytes()
direct_bytes = direct_path.read_bytes()
native_trace, direct_trace = json.loads(native_bytes), json.loads(direct_bytes)
assert native_trace == direct_trace
assert native_trace["schema"] == "gobi.trace/v1" and len(native_trace["ticks"]) == 19
assert len(fixture["expectations"]) == len(fixture["actions"]) == 18
initial_state = encode(fixture["initialState"], state_type, type_map)
assert native_trace["ticks"][0]["state"] == initial_state
fixture_checks = 0
for expectation in fixture["expectations"]:
    tick = native_trace["ticks"][expectation["actionIndex"] + 1]
    message = expectation["message"]
    expected_message = None if message is None else {"name": message["name"], "arg": message["arg"]}
    assert tick["message"] == expected_message
    assert tick["dispatchId"] == expectation["dispatchId"]
    assert tick["state"] == encode(expectation["state"], state_type, type_map)
    assert tick["requestedEffects"] == expectation["requestedEffects"] == []
    assert tick["completedEffects"] == expectation["completedEffects"] == []
    fixture_checks += 1
fixture_has_view_expectations = any("view" in expectation for expectation in fixture["expectations"])
native_direct_view_traces_equal = all(
    native_tick.get("view") == direct_tick.get("view")
    for native_tick, direct_tick in zip(native_trace["ticks"], direct_trace["ticks"], strict=True)
)
assert not fixture_has_view_expectations
assert native_direct_view_traces_equal

value = json_file(ATTEMPT / "matrix/methods.value-semantics.json")
invoked = [check for check in value["checks"] if check.get("invoked")]
assert value["passed"] and len(invoked) == 14
assert all(check["passed"] and check["unchanged"] and check["returnedMatches"] for check in invoked)
assert len(value["snapshotActions"]) == 2 and all(check["originalStateUnchanged"] for check in value["snapshotActions"])
readonly = json_file(ATTEMPT / "matrix/methods.read-only-guards.json")
assert readonly["passed"] and len(readonly["guards"]) == 2
assert all(check["passed"] and check["originalUnchanged"] and check["returnedStateUnchanged"] and check["effectCount"] == 0 for check in readonly["guards"])

# Independent replay of the archived native binary and emitted GoScript module.
native_binary = ATTEMPT / "compiled-native"
binary_pin = execution["nativeBinary"]
assert native_binary.stat().st_size == binary_pin["bytes"] and sha256(native_binary.read_bytes()) == binary_pin["sha256"]
native_stdout_path = REVIEW / "native-replay.stdout.json"
native_stderr_path = REVIEW / "native-replay.stderr.log"
direct_stdout_path = REVIEW / "direct-replay.stdout.json"
direct_stderr_path = REVIEW / "direct-replay.stderr.log"
REVIEW.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix="xr-ci-go-n2-") as temp_name:
    temp = Path(temp_name)
    executable = temp / "compiled-native"
    shutil.copyfile(native_binary, executable)
    executable.chmod(0o755)
    appir_path = appdir / "app-ir.json"
    native_cmd = [str(executable), "--app-ir", str(appir_path), "--script", str(fixture_path)]
    native_proc = subprocess.run(native_cmd, cwd=temp, capture_output=True, timeout=60, check=False)
    assert native_proc.returncode == 0, native_proc.stderr.decode(errors="replace")
    native_replayed = json.loads(native_proc.stdout)
    assert native_replayed == native_trace
    native_stdout_path.write_bytes(native_proc.stdout)
    native_stderr_path.write_bytes(native_proc.stderr)

    direct_cmd = [
        str(NODE),
        str(REVIEW / "direct-replay.mjs"),
        (ROOT / "compiled-frontend/conformance/direct-js.mjs").resolve().as_uri(),
        str(appdir / "gobi-compiled.mjs"),
        str(appdir / "encoder.mjs"),
        str(fixture_path),
    ]
    direct_proc = subprocess.run(direct_cmd, cwd=temp, capture_output=True, timeout=120, check=False)
    assert direct_proc.returncode == 0, direct_proc.stderr.decode(errors="replace")
    direct_replayed = json.loads(direct_proc.stdout)
    assert direct_replayed == direct_trace
    direct_stdout_path.write_bytes(direct_proc.stdout)
    direct_stderr_path.write_bytes(direct_proc.stderr)

author_native_replay = author_audit["replay"]["native"]
author_direct_replay = author_audit["replay"]["direct"]
assert sha256(native_proc.stdout) == author_native_replay["stdout_sha256"]
assert sha256(native_proc.stderr) == author_native_replay["stderr_sha256"]
assert sha256(direct_proc.stdout) == author_direct_replay["stdout_sha256"]
# Node may include run-specific environment text on stderr; both executions must emit
# the known EnvHttpProxyAgent warning and remain successful.
direct_stderr = direct_proc.stderr.decode(errors="replace")
assert "EnvHttpProxyAgent" in direct_stderr

result = {
    "schema": "gobi.xr-ci-go-review/v1",
    "job_id": "XR-CI-GO",
    "worker": "N2",
    "decision": "amend",
    "source": {"commit": publication["sourceCommit"], "tree": publication["sourceTree"]},
    "source_provenance": {
        "primary_push_run_id": retention["run"],
        "job_id": retention["job"],
        "artifact_id": metadata["id"],
        "artifact_sha256": archive_sha,
        "artifact_member_count": member_count,
        "zip_crc": "passed",
        "all_archive_and_extracted_members_match_retention": True,
    },
    "author_packets": {
        "report_sha256": sha256(author_report),
        "receipt_sha256": sha256(author_receipt_path.read_bytes()),
        "audit_script_sha256": sha256(author_script_path.read_bytes()),
        "audit_result_sha256": sha256(author_audit_path.read_bytes()),
    },
    "primary_execution": {
        "mode": execution["mode"],
        "status": execution["status"],
        "command_count": len(execution["commands"]),
        "all_command_logs_match_recorded_hashes": True,
        "source_pin_count": len(run["sourcePinsBefore"]),
        "all_source_and_output_pins_match": True,
        "method_appir_symbols": len(symbols),
        "typed_signatures_and_call_edges_match_contract": True,
    },
    "native_direct_trace": {
        "equal": True,
        "ticks": len(native_trace["ticks"]),
        "fixture_action_checks": fixture_checks,
        "trace_sha256": sha256(native_bytes),
        "typed_state_message_dispatch_effect_checks_pass": True,
        "view_traces_equal_between_native_and_direct": native_direct_view_traces_equal,
        "fixture_contains_literal_view_expectations": fixture_has_view_expectations,
    },
    "value_semantics": {
        "enabled_update_input_preservation_checks": len(invoked),
        "publish_saved_original_state_witnesses": len(value["snapshotActions"]),
        "readonly_guard_probes": len(readonly["guards"]),
        "all_passed": True,
    },
    "independent_replay": {
        "native": {
            "exit_code": native_proc.returncode,
            "trace_matches_artifact": native_replayed == native_trace,
            "binary_sha256": sha256(native_binary.read_bytes()),
            "replay_stdout_sha256": sha256(native_proc.stdout),
            "replay_stderr_sha256": sha256(native_proc.stderr),
        },
        "direct": {
            "exit_code": direct_proc.returncode,
            "trace_matches_artifact": direct_replayed == direct_trace,
            "node_version": subprocess.check_output([str(NODE), "--version"], text=True).strip(),
            "replay_stdout_sha256": sha256(direct_proc.stdout),
            "replay_stderr_sha256": sha256(direct_proc.stderr),
            "experimental_proxy_warning": "EnvHttpProxyAgent" in direct_stderr,
        },
    },
    "scope_limits": [
        "Accepts only the primary push artifact Go/native/direct-method lane; PR and overall workflow acceptance remain outside this review.",
        "Replay uses a byte-identical temporary native executable with mode 0755; the archived ZIP and published source were read-only.",
    ],
    "findings": [
        "The E-CI-GO report says the traces match fixture expectations for views, but the frozen fixture contains no expected view field. The native/direct traces are equal, and E-CI-DOM independently verifies the expected view tree; narrow the E-CI-GO sentence to those facts.",
    ],
}
output = REVIEW / "review-audit.json"
output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
