#!/usr/bin/env python3
"""Audit the retained primary CI artifact for E-CI-GO (no source modifications)."""
from __future__ import annotations

import hashlib
import json
import os
import struct
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
CI = ROOT / "compiled-methods/ci/2026-10-31"
EXTRACTED = CI / "extracted"
ATTEMPT = "compiled-methods/artifacts/attempts/attempt-20261031T044100445Z"
ATTEMPT_DIR = EXTRACTED / ATTEMPT
NODE = os.environ.get("GOBI_NODE", "/tmp/gondola-node22/node_modules/node/bin/node")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_digest(path: Path) -> str:
    return digest(path.read_bytes())


def load_json(path: Path):
    return json.loads(path.read_text())


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def encode_fixture(value, type_id: str, type_map: dict):
    info = type_map[type_id]
    kind = info["kind"]
    if kind == "struct":
        return {
            "typeId": type_id,
            "kind": "struct",
            "fields": [
                {"name": field["name"], "value": encode_fixture(value[field["name"]], field["type"], type_map)}
                for field in info["fields"]
            ],
        }
    if kind == "bool":
        return {"typeId": type_id, "kind": "bool", "bool": value}
    if kind == "float64":
        return {"typeId": type_id, "kind": "float64", "float64Bits": struct.pack(">d", float(value)).hex()}
    raise ValueError(f"fixture state unexpectedly uses unsupported type {type_id}: {kind}")


publication = load_json(CI / "publication-current.json")
metadata = load_json(CI / "primary-artifact-metadata.json")
retention = load_json(CI / "artifact-retention.json")
require(publication["sourceCommit"] == "6b49cc0bd4c9512a041f723c86b632ec506afd9d", "wrong published source commit")
require(publication["sourceTree"] == "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81", "wrong published source tree")
require(publication["primaryPush"] == 41169518187, "wrong primary push run")
require(metadata["workflow_run"]["id"] == 41169518187, "artifact metadata run differs from primary push")
require(metadata["workflow_run"]["head_sha"] == publication["sourceCommit"], "artifact metadata head differs from published source")
require(metadata["id"] == retention["artifactId"], "artifact metadata id differs from retention manifest")
require(metadata["size_in_bytes"] == retention["providerZipBytes"], "provider artifact size differs from retention manifest")
require(metadata["digest"] == f"sha256:{retention['providerZipSha256']}", "metadata digest differs from retention manifest")
require(retention["source"] == publication["sourceCommit"] and retention["run"] == publication["primaryPush"], "retention manifest source/run mismatch")

archive_path = CI / "original.zip"
archive_data = archive_path.read_bytes()
parts = sorted(CI.glob("primary-artifact.zip.part-*"))
parts_hash = hashlib.sha256()
parts_bytes = 0
for part in parts:
    data = part.read_bytes()
    parts_hash.update(data)
    parts_bytes += len(data)
require(len(parts) == 3, "expected exactly three retained artifact chunks")
require(len(archive_data) == 11460089 == len(archive_data), "provider artifact ZIP byte count mismatch")
require(digest(archive_data) == "95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a", "provider ZIP hash mismatch")
require(parts_bytes == len(archive_data) and parts_hash.hexdigest() == digest(archive_data), "retained chunks do not reconstruct provider ZIP")

manifest = {item["path"]: item for item in retention["members"]}
require(len(manifest) == 968, "retained member inventory count mismatch")
zip_member_checks = []
with zipfile.ZipFile(archive_path) as zf:
    bad = zf.testzip()
    names = set(zf.namelist())
    require(bad is None, f"provider ZIP CRC failure at {bad}")
    require(len(names) == 968 and names == set(manifest), "provider ZIP names differ from retained member inventory")
    for name, expected in manifest.items():
        data = zf.read(name)
        zip_member_checks.append(len(data) == expected["bytes"] and digest(data) == expected["sha256"])
require(all(zip_member_checks), "one or more provider ZIP members differ from retained hashes")

extracted_checks = []
for name, expected in manifest.items():
    path = EXTRACTED / name
    data = path.read_bytes()
    extracted_checks.append(len(data) == expected["bytes"] and digest(data) == expected["sha256"])
extracted_names = {str(path.relative_to(EXTRACTED)) for path in EXTRACTED.rglob("*") if path.is_file()}
require(all(extracted_checks), "one or more extracted artifact members differ from retained hashes")
require(extracted_names == set(manifest), "extracted file set differs from provider ZIP inventory")

execution_path = ATTEMPT_DIR / "execution.json"
execution = load_json(execution_path)
require(execution["schema"] == "gobi.compiled-methods-execution/v1", "unexpected workflow execution schema")
require(execution["mode"] == "full" and execution["status"] == "passed" and execution["failures"] == [], "actual CI methods attempt did not pass full mode")
commands = execution["commands"]
require(len(commands) == 17 and all(command["exitCode"] == 0 and command["signal"] is None and command["error"] is None for command in commands), "full methods execution command set contains a failure")
require(execution["sourcePinsMatch"] and execution["methodMatrix"]["status"] == "matched", "execution reports changed source pins or mismatched method matrix")
require(execution["nativeBinary"]["path"] == f"{ATTEMPT}/compiled-native", "execution native binary path differs from expected attempt")

run_path = ATTEMPT_DIR / "matrix/methods.run.json"
run = load_json(run_path)
require(run["status"] == "matched" and run["sourceStable"] and run["sourceStableThroughCheck"] and run["outputsStableThroughCheck"], "methods run did not report matched/stable")
require(len(run["sourcePinsBefore"]) == len(run["sourcePinsAfter"]) == len(run["sourcePinsFinal"]) == 188, "methods source pin counts differ from expected 188")
source_checks = []
source_check_locations = {"published_worktree": 0, "artifact_generated_output": 0}
for key in ("sourcePinsBefore", "sourcePinsAfter", "sourcePinsFinal"):
    for pin in run[key]:
        archived_path = EXTRACTED / pin["path"]
        if archived_path.is_file():
            path = archived_path
            source_check_locations["artifact_generated_output"] += 1
        else:
            path = ROOT / pin["path"]
            source_check_locations["published_worktree"] += 1
        data = path.read_bytes()
        source_checks.append(len(data) == pin["bytes"] and digest(data) == pin["sha256"])
require(all(source_checks), "a workflow source pin does not match the published worktree source")
require(run["sourcePinsBefore"] == run["sourcePinsAfter"] == run["sourcePinsFinal"], "workflow source pins changed during method run")

output_checks = []
output_pin_locations = {"artifact_output": 0, "published_source": 0}
ci_root = "/home/runner/work/gondola/gondola/"
for pin in run["outputPinsAfterCheck"]:
    require(pin["path"].startswith(ci_root), f"unexpected workflow output pin root: {pin['path']}")
    relative = pin["path"][len(ci_root):]
    archived = EXTRACTED / relative
    if archived.is_file():
        data = archived.read_bytes()
        output_pin_locations["artifact_output"] += 1
    else:
        data = (ROOT / relative).read_bytes()
        output_pin_locations["published_source"] += 1
    output_checks.append(len(data) == pin["bytes"] and digest(data) == pin["sha256"])
require(len(output_checks) == 149 and all(output_checks), "workflow outputs do not match all 149 after-check pins")

fixture_path = ROOT / "compiled-methods/conformance/fixtures/methods.json"
contract_path = ROOT / "compiled-methods/conformance/method-contract.json"
fixture = load_json(fixture_path)
contract = load_json(contract_path)
fixture_hash = file_digest(fixture_path)
require(execution["fixture"]["sha256"] == fixture_hash and run["inputs"]["fixture"].endswith("/compiled-methods/conformance/fixtures/methods.json"), "workflow fixture does not match published fixture source")

react_app_dir = ATTEMPT_DIR / "builds/react/output/apps/methods-0cac42b0a982"
dom_app_dir = ATTEMPT_DIR / "builds/dom/output/apps/methods-0cac42b0a982"
react_appir_bytes = (react_app_dir / "app-ir.json").read_bytes()
react_appir = json.loads(react_appir_bytes)
dom_appir = load_json(dom_app_dir / "app-ir.json")
require(digest(react_appir_bytes) == "07d0d25ede9993e1f58e108f4cc153717ff62061ff519b50619615cd4faccd3b", "workflow React AppIR pin mismatch")
require(react_appir == dom_appir, "workflow React and DOM AppIR differ")
method_symbols = {item["id"]: item for item in react_appir["symbols"]}
expected_symbols = {item["id"]: item for item in contract["symbols"]}
require(set(method_symbols) == set(expected_symbols) and len(method_symbols) == 15, "workflow typed method symbol set differs from contract")
for symbol_id, expected in expected_symbols.items():
    actual = method_symbols[symbol_id]
    require(actual["signature"]["params"] == expected["params"] and actual["signature"]["results"] == expected["results"] and actual["calls"] == expected["calls"], f"typed signature or call graph differs at {symbol_id}")
role = react_appir["components"][0]
require(role["packagePath"] == "github.com/samuelpmahan/gondola/fixtures/compiled/methods", "workflow AppIR package path mismatch")
require(role["init"] == contract["roles"]["init"] and role["update"] == contract["roles"]["update"] and role["view"] == contract["roles"]["view"], "workflow package roles differ from method contract")
type_map = {item["id"]: item for item in react_appir["types"]}
state_type = contract["stateType"]
counter_type = contract["counterStateType"]
require(type_map[state_type]["fields"] == [
    {"name": "Parent", "type": counter_type}, {"name": "Child", "type": counter_type},
    {"name": "ReadOnly", "type": "bool"}, {"name": "SavedChild", "type": "float64"}], "workflow State fields differ from typed contract")
require(type_map[counter_type]["fields"] == [{"name": "Count", "type": "float64"}], "workflow counter.State field differs from typed contract")
require("numeric.float64" in role["capabilities"], "workflow AppIR omits float64 capability")

native_bytes = (ATTEMPT_DIR / "matrix/methods.native.json").read_bytes()
direct_bytes = (ATTEMPT_DIR / "matrix/methods.direct.json").read_bytes()
native_trace = json.loads(native_bytes)
direct_trace = json.loads(direct_bytes)
require(native_trace == direct_trace, "workflow native/direct trace JSON differs")
require(native_trace["schema"] == "gobi.trace/v1" and len(native_trace["ticks"]) == 19, "workflow trace schema/count mismatch")
require(len(fixture["actions"]) == len(fixture["expectations"]) == 18, "published fixture action count mismatch")
fixture_checks = []
for expectation in fixture["expectations"]:
    action_index = expectation["actionIndex"]
    tick = native_trace["ticks"][action_index + 1]
    message = expectation["message"]
    expected_message = None if message is None else {"name": message["name"], "arg": message["arg"]}
    expected_state = encode_fixture(expectation["state"], state_type, type_map)
    fixture_checks.append(
        tick["message"] == expected_message
        and tick["dispatchId"] == expectation["dispatchId"]
        and tick["state"] == expected_state
        and tick["requestedEffects"] == expectation["requestedEffects"]
        and tick["completedEffects"] == expectation["completedEffects"]
        and tick["view"] == direct_trace["ticks"][action_index + 1]["view"]
    )
require(all(fixture_checks), "workflow trace differs from typed fixture action/state/effect expectations")

value = load_json(ATTEMPT_DIR / "matrix/methods.value-semantics.json")
invoked = [item for item in value["checks"] if item.get("invoked")]
require(value["passed"] and len(invoked) == 14 and all(item["passed"] and item["unchanged"] and item["returnedMatches"] for item in invoked), "workflow emitted-module retained-input checks failed")
require(len(value["snapshotActions"]) == 2 and all(item["originalStateUnchanged"] for item in value["snapshotActions"]), "workflow PublishSaved original-state witnesses failed")
readonly = load_json(ATTEMPT_DIR / "matrix/methods.read-only-guards.json")
require(readonly["passed"] and len(readonly["guards"]) == 2 and all(item["passed"] and item["originalUnchanged"] and item["returnedStateUnchanged"] and item["noEffects"] and item["effectCount"] == 0 for item in readonly["guards"]), "workflow direct readonly guard probes failed")

# Rerun the exact artifact binary and module. The retained ZIP marks the Go binary 0644;
# run an identical temporary copy with its execute bit set and record its content hash.
replay_dir = CI / "lanes/go/current-ci"
replay_dir.mkdir(parents=True, exist_ok=True)
binary_source = ATTEMPT_DIR / "compiled-native"
require(len(binary_source.read_bytes()) == execution["nativeBinary"]["bytes"] and file_digest(binary_source) == execution["nativeBinary"]["sha256"], "artifact native binary differs from execution manifest")
with tempfile.TemporaryDirectory(prefix="gobi-e-ci-go-current-") as temp_name:
    temp = Path(temp_name)
    binary = temp / "compiled-native"
    binary.write_bytes(binary_source.read_bytes())
    binary.chmod(0o755)
    appir = react_app_dir / "app-ir.json"
    local_fixture = fixture_path
    native_cmd = [str(binary), "--app-ir", str(appir), "--script", str(local_fixture)]
    native_proc = subprocess.run(native_cmd, cwd=temp, capture_output=True, timeout=60, check=False)
    require(native_proc.returncode == 0, f"current CI native replay failed: {native_proc.stderr.decode(errors='replace')}")
    require(json.loads(native_proc.stdout) == native_trace, "current CI native replay differs from stored trace")
    (replay_dir / "native.replay.stdout.json").write_bytes(native_proc.stdout)
    (replay_dir / "native.replay.stderr.log").write_bytes(native_proc.stderr)

    driver = temp / "direct-replay.mjs"
    direct_js = (ROOT / "compiled-frontend/conformance/direct-js.mjs").as_uri()
    driver.write_text(
        'import { readFile } from "node:fs/promises";\n'
        'import { pathToFileURL } from "node:url";\n'
        f'import {{ replayDirectJavaScript }} from {json.dumps(direct_js)};\n'
        'const [modulePath, helpersPath, fixturePath] = process.argv.slice(2);\n'
        'const compiled = await import(pathToFileURL(modulePath).href);\n'
        'const helpers = await import(pathToFileURL(helpersPath).href);\n'
        'const fixtureScript = JSON.parse(await readFile(fixturePath, "utf8"));\n'
        'const trace = replayDirectJavaScript({ compiled: compiled.gobiCompiled, helpers, fixtureScript });\n'
        'process.stdout.write(JSON.stringify(trace));\n',
        encoding="utf-8",
    )
    compiled_module = react_app_dir / "gobi-compiled.mjs"
    helpers_module = react_app_dir / "encoder.mjs"
    direct_cmd = [NODE, str(driver), str(compiled_module), str(helpers_module), str(local_fixture)]
    direct_proc = subprocess.run(direct_cmd, cwd=temp, capture_output=True, timeout=120, check=False)
    require(direct_proc.returncode == 0, f"current CI direct-module replay failed: {direct_proc.stderr.decode(errors='replace')}")
    require(json.loads(direct_proc.stdout) == direct_trace, "current CI direct-module replay differs from stored trace")
    (replay_dir / "direct.replay.stdout.json").write_bytes(direct_proc.stdout)
    (replay_dir / "direct.replay.stderr.log").write_bytes(direct_proc.stderr)
    replay = {
        "native": {"command": native_cmd, "exit_code": native_proc.returncode, "stdout_sha256": digest(native_proc.stdout), "stderr_sha256": digest(native_proc.stderr), "trace_matches_artifact": True, "executed_binary_sha256": file_digest(binary), "artifact_binary_sha256": file_digest(binary_source), "chmod_on_temporary_copy": "0755"},
        "direct": {"command": direct_cmd, "exit_code": direct_proc.returncode, "stdout_sha256": digest(direct_proc.stdout), "stderr_sha256": digest(direct_proc.stderr), "trace_matches_artifact": True},
    }

command_evidence = []
for command in commands:
    stdout_path = EXTRACTED / command["stdoutPath"]
    stderr_path = EXTRACTED / command["stderrPath"]
    stdout = stdout_path.read_bytes()
    stderr = stderr_path.read_bytes()
    require(digest(stdout) == command["stdoutSha256"] and digest(stderr) == command["stderrSha256"], f"workflow command log hash mismatch: {command['name']}")
    command_evidence.append({"name": command["name"], "exit_code": command["exitCode"], "stdout_path": command["stdoutPath"], "stdout_sha256": digest(stdout), "stderr_path": command["stderrPath"], "stderr_sha256": digest(stderr)})

go_tests_cmd = next(item for item in commands if item["name"] == "method-go-tests")
go_test_stdout = (EXTRACTED / go_tests_cmd["stdoutPath"]).read_text()
node_tests_cmd = next(item for item in commands if item["name"] == "method-owned-node-tests")
node_test_stdout = (EXTRACTED / node_tests_cmd["stdoutPath"]).read_text()
version_logs = {}
for name in ("version-root-go", "version-compiled-go"):
    cmd = next(item for item in commands if item["name"] == name)
    version_logs[name] = (EXTRACTED / cmd["stdoutPath"]).read_text().strip()

summary = {
    "schema": "gobi.e-ci-go-current-audit/v1",
    "job_id": "E-CI-GO",
    "worker": "N1",
    "source": {"commit": publication["sourceCommit"], "tree": publication["sourceTree"], "push_run": publication["primaryPush"], "workflow_run": metadata["workflow_run"]["id"], "job_id": retention["job"], "artifact_id": metadata["id"], "artifact_head_sha": metadata["workflow_run"]["head_sha"]},
    "artifact_integrity": {"zip_bytes": len(archive_data), "zip_sha256": digest(archive_data), "provider_digest_matches": True, "retained_parts": len(parts), "parts_reconstruct_zip": True, "zip_crc": "passed", "member_count": len(manifest), "members_match_retained_hashes": all(zip_member_checks), "extracted_member_count": len(extracted_names), "extracted_members_match_retained_hashes": all(extracted_checks)},
    "full_methods_execution": {"mode": execution["mode"], "status": execution["status"], "outcome": execution["outcome"], "attempt": execution["attempt"], "commands": len(commands), "all_commands_exit_zero": True, "failures": execution["failures"], "method_matrix_status": execution["methodMatrix"]["status"], "source_pins_match": execution["sourcePinsMatch"], "reported_versions": execution["versions"], "command_logs_verified": len(command_evidence)},
    "methods_run": {"status": run["status"], "actions": run["summary"]["actions"], "profiles": run["summary"]["browserProfiles"], "source_pin_sets": [len(run[key]) for key in ("sourcePinsBefore", "sourcePinsAfter", "sourcePinsFinal")], "source_pin_resolution_counts_across_sets": source_check_locations, "all_source_pins_match_published_tree_or_artifact_outputs": all(source_checks), "source_pin_records_equal": True, "output_pins": len(output_checks), "output_pin_resolution_counts": output_pin_locations, "all_output_pins_match_artifact_or_source": all(output_checks), "trace_schema": native_trace["schema"], "ticks": len(native_trace["ticks"]), "native_direct_equal": native_trace == direct_trace, "trace_sha256": digest(native_bytes), "fixture_expectations": len(fixture_checks), "fixture_state_message_dispatch_effect_checks_match": all(fixture_checks), "appir_sha256": digest(react_appir_bytes), "dom_appir_equal": react_appir == dom_appir, "method_symbols": len(method_symbols), "typed_signatures_and_callgraph_match": True, "state_fields": type_map[state_type]["fields"], "counter_state_fields": type_map[counter_type]["fields"], "capabilities": role["capabilities"]},
    "value_semantics": {"passed": value["passed"], "enabled_update_checks": len(invoked), "unchanged_inputs": sum(1 for item in invoked if item["unchanged"]), "returned_states_match": sum(1 for item in invoked if item["returnedMatches"]), "publish_saved_witnesses": value["snapshotActions"], "read_only_guards_passed": readonly["passed"], "read_only_guard_count": len(readonly["guards"]), "read_only_guard_effects": [item["effectCount"] for item in readonly["guards"]]},
    "replay": replay,
    "test_and_version_logs": {"go_test_command": go_tests_cmd["command"], "go_test_args": go_tests_cmd["args"], "go_test_stdout_sha256": digest(go_test_stdout.encode()), "go_test_summary": go_test_stdout.strip(), "node_test_command": node_tests_cmd["command"], "node_test_args": node_tests_cmd["args"], "node_test_stdout_sha256": digest(node_test_stdout.encode()), "node_test_summary_tail": node_test_stdout.strip().splitlines()[-8:], "versions": version_logs},
    "command_records": command_evidence,
    "limits": ["This audit establishes the successful primary push artifact's Go/native and direct-module scope. PR run and unrelated workflow jobs are not adjudicated here.", "Replays were run from copies/extracted outputs; the provider archive and published source were not modified."],
}
output = CI / "lanes/go/current-ci-audit.json"
output.write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps({"audit_path": str(output.relative_to(ROOT)), "source": summary["source"], "members": len(manifest), "commands": len(commands), "trace_equal": summary["methods_run"]["native_direct_equal"], "native_replay": replay["native"]["trace_matches_artifact"], "direct_replay": replay["direct"]["trace_matches_artifact"], "go_tests": go_test_stdout.strip(), "go_versions": version_logs}, indent=2))
