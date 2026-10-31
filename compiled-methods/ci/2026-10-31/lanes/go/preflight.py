#!/usr/bin/env python3
"""Read-only preflight audit for E-CI-GO. Does not claim current-head CI acceptance."""
from __future__ import annotations
import hashlib
import json
import math
import os
import struct
import subprocess
import tarfile
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
CI = ROOT / "compiled-methods/ci/2026-10-31"
LANE = CI / "lanes/go"
ARCHIVE_MANIFEST = ROOT / "compiled-methods/evidence/builds/final-local-methods-only.json"
ARCHIVE = ROOT / "compiled-methods/evidence/builds/final-local-methods-only.tar.gz"
LOCAL_ATTEMPT = "compiled-methods/artifacts/attempts/attempt-20261031T042646625Z/"
REACT_BASE = LOCAL_ATTEMPT + "builds/react/output/"
DOM_BASE = LOCAL_ATTEMPT + "builds/dom/output/"
APP_DIR = "apps/methods-0cac42b0a982/"
NATIVE_NODE = os.environ.get("GOBI_NODE", "/tmp/gondola-node22/node_modules/node/bin/node")
METHODS_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/methods"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_digest(path: Path) -> str:
    return digest(path.read_bytes())


def load_json(path: Path):
    return json.loads(path.read_text())


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


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


# Publication pins and source acceptance status.
publication_path = CI / "publication-current.json"
publication = load_json(publication_path)
head_identity_path = CI / "lanes/evidence/head-identity-6b49cc0.json"
head_identity = load_json(head_identity_path)
require(head_identity["publication"]["sha256"] == file_digest(publication_path), "published source identity digest mismatch")
require(publication["sourceCommit"] == "6b49cc0bd4c9512a041f723c86b632ec506afd9d", "wrong preflight source commit")
require(publication["sourceTree"] == "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81", "wrong preflight source tree")

acceptance_path = ROOT / "compiled-methods/coordination/acceptance.json"
acceptance = load_json(acceptance_path)
receipt_checks = []
for item in acceptance["receipts"]:
    receipt_path = ROOT / f"compiled-methods/coordination/receipts/{item['job']}.json"
    actual = file_digest(receipt_path)
    receipt_checks.append({"job": item["job"], "path": str(receipt_path.relative_to(ROOT)), "expected": item["sha256"], "actual": actual, "matches": actual == item["sha256"]})
require(acceptance["status"] == "scoped_local_acceptance_passed_full_ci_pending", "source acceptance must remain explicitly local/pending-CI")
require(acceptance["packets"] == 20 and acceptance["allJobsDone"] and all(item["matches"] for item in receipt_checks), "source20 receipts are incomplete or changed")

# M0 receipt and source pins.
m0_path = ROOT / "compiled-methods/evidence/demo/m0-gate/attempt-01/receipt.json"
m0 = load_json(m0_path)
m0_pins = []
for item in m0["sourceBefore"]:
    path = ROOT / item["path"]
    actual = file_digest(path)
    m0_pins.append({"path": item["path"], "expected": item["sha256"], "actual": actual, "matches": actual == item["sha256"]})
require(m0["status"] == "passed" and m0["sourcePinsMatch"] and len(m0["sourceBefore"]) == 27, "M0 local receipt is not a complete pass")
require(all(item["matches"] for item in m0_pins), "M0 source pin changed")

# Historical source8ed primary artifact: validate, but preserve its failed result as history only.
old_dir = CI / "initial-source8ed"
old_retention = load_json(old_dir / "artifact-retention.json")
old_zip = old_dir / "original.zip"
old_zip_data = old_zip.read_bytes()
chunk_sha = hashlib.sha256()
chunk_bytes = 0
for part in sorted(old_dir.glob("artifact.zip.part-*")):
    data = part.read_bytes()
    chunk_sha.update(data)
    chunk_bytes += len(data)
old_zip_checks = []
with zipfile.ZipFile(old_zip) as zf:
    zip_test = zf.testzip()
    zipped_names = set(zf.namelist())
    for item in old_retention["members"]:
        try:
            data = zf.read(item["path"])
            ok = len(data) == item["bytes"] and digest(data) == item["sha256"]
        except (KeyError, zipfile.BadZipFile):
            ok = False
        old_zip_checks.append(ok)
require(len(old_retention["members"]) == 957, "old artifact member count differs")
require(len(zipped_names) == 957 and zip_test is None, "old artifact ZIP CRC/member check failed")
require(len(old_zip_data) == old_retention["providerZipBytes"] and digest(old_zip_data) == old_retention["providerZipSha256"], "old provider ZIP pin mismatch")
require(chunk_bytes == len(old_zip_data) and chunk_sha.hexdigest() == digest(old_zip_data), "retained source8ed chunks do not reconstruct the provider ZIP")
require(all(old_zip_checks), "a historical source8ed member does not match its retained hash")

# Verify the complete local methods-only archive against its 189-member inventory.
archive_manifest = load_json(ARCHIVE_MANIFEST)
archive_bytes = ARCHIVE.read_bytes()
require(len(archive_bytes) == archive_manifest["bytes"] and digest(archive_bytes) == archive_manifest["sha256"], "local methods archive pin mismatch")
expected_members = {item["path"]: item for item in archive_manifest["members"]}
with tarfile.open(ARCHIVE, "r:gz") as tf:
    files = {member.name: member for member in tf.getmembers() if member.isfile()}
    require(len(files) == len(expected_members) == 189, "local methods archive member count mismatch")
    require(set(files) == set(expected_members), "local methods archive paths differ from inventory")
    member_bytes = {}
    member_checks = []
    for path, item in expected_members.items():
        data = tf.extractfile(files[path]).read()
        member_bytes[path] = data
        ok = len(data) == item["bytes"] and digest(data) == item["sha256"]
        member_checks.append(ok)
require(all(member_checks), "local methods archive member hash mismatch")

# The actual local runner record, source pins, binary/module inputs, state traces, and typed AppIR.
run_path = LOCAL_ATTEMPT + "matrix/methods.run.json"
run = json.loads(member_bytes[run_path])
fixture_path = ROOT / "compiled-methods/conformance/fixtures/methods.json"
contract_path = ROOT / "compiled-methods/conformance/method-contract.json"
fixture = load_json(fixture_path)
method_contract = load_json(contract_path)
archive_path_map = {item["path"]: item for item in archive_manifest["members"]}
source_pin_sets = {}
for key in ("sourcePinsBefore", "sourcePinsAfter", "sourcePinsFinal"):
    pins = run[key]
    rows = []
    for item in pins:
        archived = archive_path_map.get(item["path"])
        if archived is not None:
            actual, actual_bytes = archived["sha256"], archived["bytes"]
            source = "final-local-archive"
        else:
            path = ROOT / item["path"]
            actual, actual_bytes = file_digest(path), path.stat().st_size
            source = "current-published-worktree"
        rows.append({"path": item["path"], "expected": item["sha256"], "actual": actual, "expected_bytes": item["bytes"], "actual_bytes": actual_bytes, "source": source, "matches": actual == item["sha256"] and actual_bytes == item["bytes"]})
    source_pin_sets[key] = {"count": len(pins), "all_match_source_or_archive": all(row["matches"] for row in rows), "current_worktree_pin_count": sum(1 for row in rows if row["source"] == "current-published-worktree"), "archived_output_pin_count": sum(1 for row in rows if row["source"] == "final-local-archive"), "mismatch_paths": [row["path"] for row in rows if not row["matches"]]}
require(all(source_pin_sets[key]["all_match_source_or_archive"] for key in source_pin_sets), "local runner pins differ from published source or archived outputs")
require(source_pin_sets["sourcePinsBefore"]["count"] == 188, "unexpected local runner source-pin count")

react_appir_path = REACT_BASE + APP_DIR + "app-ir.json"
react_module_path = REACT_BASE + APP_DIR + "gobi-compiled.mjs"
react_helpers_path = REACT_BASE + APP_DIR + "encoder.mjs"
dom_appir_path = DOM_BASE + APP_DIR + "app-ir.json"
dom_module_path = DOM_BASE + APP_DIR + "gobi-compiled.mjs"
native_path = LOCAL_ATTEMPT + "compiled-native"
app_ir = json.loads(member_bytes[react_appir_path])
dom_app_ir = json.loads(member_bytes[dom_appir_path])
expected_symbols = {item["id"]: item for item in method_contract["symbols"]}
actual_symbols = {item["id"]: item for item in app_ir["symbols"]}
role_check = app_ir["components"][0]
require(app_ir["schema"] == "gobi.app-ir/v1" and role_check["packagePath"] == METHODS_PACKAGE, "wrong methods AppIR schema/package")
require(role_check["init"] == method_contract["roles"]["init"] and role_check["update"] == method_contract["roles"]["update"] and role_check["view"] == method_contract["roles"]["view"], "AppIR role IDs differ from method contract")
require(set(actual_symbols) == set(expected_symbols), "AppIR method symbol set differs from typed method contract")
symbol_diffs = []
for symbol_id, expected in expected_symbols.items():
    actual = actual_symbols[symbol_id]
    got = {"params": actual["signature"]["params"], "results": actual["signature"]["results"], "calls": actual["calls"]}
    want = {"params": expected["params"], "results": expected["results"], "calls": expected["calls"]}
    if got != want:
        symbol_diffs.append(symbol_id)
require(not symbol_diffs, "AppIR typed method signatures/call graph differ from method contract")
require(app_ir == dom_app_ir, "React and DOM AppIR values differ")

# Assert the scalar/nested Go state type contract is float64/bool only.
type_map = {item["id"]: item for item in app_ir["types"]}
state_id = method_contract["stateType"]
counter_state_id = method_contract["counterStateType"]
state_info = type_map[state_id]
counter_info = type_map[counter_state_id]
require(state_info["kind"] == "struct" and state_info["fields"] == [
    {"name": "Parent", "type": counter_state_id}, {"name": "Child", "type": counter_state_id},
    {"name": "ReadOnly", "type": "bool"}, {"name": "SavedChild", "type": "float64"}], "State fields differ from frozen typed contract")
require(counter_info["kind"] == "struct" and counter_info["fields"] == [{"name": "Count", "type": "float64"}], "counter.State field differs from contract")
require(type_map["float64"]["kind"] == "float64" and type_map["bool"]["kind"] == "bool", "state scalar types differ from contract")
require("numeric.float64" in role_check["capabilities"], "AppIR omits numeric.float64 capability")

# Replay stored typed traces against the frozen fixture expectations.
native_trace_path = LOCAL_ATTEMPT + "matrix/methods.native.json"
direct_trace_path = LOCAL_ATTEMPT + "matrix/methods.direct.json"
native_data = member_bytes[native_trace_path]
direct_data = member_bytes[direct_trace_path]
native_trace = json.loads(native_data)
direct_trace = json.loads(direct_data)
require(native_trace == direct_trace, "local native and direct trace JSON differ")
require(native_trace["schema"] == "gobi.trace/v1" and len(native_trace["ticks"]) == 19, "wrong trace schema or tick count")
require(len(fixture["actions"]) == len(fixture["expectations"]) == 18, "fixture action count is not 18")
state_tick_matches = []
for expectation in fixture["expectations"]:
    index = expectation["actionIndex"]
    tick = native_trace["ticks"][index + 1]
    expected_state = encode_fixture(expectation["state"], state_id, type_map)
    message = expectation["message"]
    expected_message = None if message is None else {"name": message["name"], "arg": message["arg"]}
    state_tick_matches.append({
        "action_index": index,
        "message_match": tick["message"] == expected_message,
        "dispatch_id_match": tick["dispatchId"] == expectation["dispatchId"],
        "state_match": tick["state"] == expected_state,
        "requested_effects_match": tick["requestedEffects"] == expectation["requestedEffects"],
        "completed_effects_match": tick["completedEffects"] == expectation["completedEffects"],
        "native_direct_view_match": tick["view"] == direct_trace["ticks"][index + 1]["view"],
    })
require(all(all(row[key] for key in ("message_match", "dispatch_id_match", "state_match", "requested_effects_match", "completed_effects_match", "native_direct_view_match")) for row in state_tick_matches), "a native/direct tick differs from fixture state/message/effect expectations")

# View tree shape is the exact Gobi Node tree shared by Go native and direct module.
def collect_keys(node):
    result = [node["key"]] if node.get("key") else []
    for child in node.get("kids") or []:
        result.extend(collect_keys(child))
    return result
node_root = native_trace["ticks"][0]["view"]["tree"]
node_keys = collect_keys(node_root)
require(node_root["kind"] == 1 and node_root["tag"] == "div" and node_root["key"] == "methods", "unexpected native Gobi Node root")
require(set(["parent", "child", "readonly-toggle", "capture-child", "publish-saved"]).issubset(set(node_keys)), "Gobi Node tree lacks expected keyed controls")

# Module-side retained-input and direct Go readonly-guard evidence.
value_path = LOCAL_ATTEMPT + "matrix/methods.value-semantics.json"
readonly_path = LOCAL_ATTEMPT + "matrix/methods.read-only-guards.json"
value = json.loads(member_bytes[value_path])
readonly = json.loads(member_bytes[readonly_path])
invoked = [check for check in value["checks"] if check.get("invoked")]
require(value["passed"] and len(invoked) == 14 and all(x["passed"] and x["unchanged"] and x["returnedMatches"] for x in invoked), "module retained-input/value checks are incomplete or failed")
require(len(value["snapshotActions"]) == 2 and all(x["originalStateUnchanged"] for x in value["snapshotActions"]), "PublishSaved original-input witness failed")
require(readonly["passed"] and len(readonly["guards"]) == 2 and all(x["passed"] and x["originalUnchanged"] and x["returnedStateUnchanged"] and x["noEffects"] and x["effectCount"] == 0 for x in readonly["guards"]), "direct readonly guards failed")

# Verify output pins are represented by the 189-member local archive.
archive_path_map = {item["path"]: item for item in archive_manifest["members"]}
output_pin_checks = []
for item in run["outputPinsAfterCheck"]:
    absolute = item["path"]
    marker = "/gondola-methods/"
    require(marker in absolute, f"unexpected output pin root {absolute}")
    relative_path = absolute.split(marker, 1)[1]
    archived = archive_path_map.get(relative_path)
    if archived is not None:
        actual, actual_bytes = archived["sha256"], archived["bytes"]
        source = "final-local-archive"
    else:
        path = ROOT / relative_path
        actual, actual_bytes = file_digest(path), path.stat().st_size
        source = "current-published-worktree"
    output_pin_checks.append({"path": relative_path, "source": source, "matches": actual == item["sha256"] and actual_bytes == item["bytes"]})
require(len(output_pin_checks) == 149 and all(item["matches"] for item in output_pin_checks), "local output/source pins differ from archive or current worktree")

# Run the exact archived local Go binary and actual React emitted module in a temp directory.
local_exec = {}
with tempfile.TemporaryDirectory(prefix="gobi-e-ci-go-preflight-") as temp_name:
    temp = Path(temp_name)
    react_out = temp / "react-output"
    for path, data in member_bytes.items():
        if path.startswith(REACT_BASE):
            rel = path[len(REACT_BASE):]
            target = react_out / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    app_ir_file = react_out / (APP_DIR + "app-ir.json")
    native_bin = temp / "compiled-native"
    native_bin.write_bytes(member_bytes[native_path])
    native_bin.chmod(0o755)
    local_native_command = [str(native_bin), "--app-ir", str(app_ir_file), "--script", str(fixture_path)]
    native_run = subprocess.run(local_native_command, cwd=temp, capture_output=True, check=False, timeout=60)
    require(native_run.returncode == 0, f"archived local native binary exited {native_run.returncode}: {native_run.stderr.decode(errors='replace')}")
    executed_native = json.loads(native_run.stdout)
    require(executed_native == native_trace, "archived native binary replay differs from retained native trace")

    node_script = temp / "direct-replay.mjs"
    direct_js = (ROOT / "compiled-frontend/conformance/direct-js.mjs").as_uri()
    node_script.write_text(
        f'''import {{ readFile }} from "node:fs/promises";\n'''
        f'''import {{ pathToFileURL }} from "node:url";\n'''
        f'''import {{ replayDirectJavaScript }} from {json.dumps(direct_js)};\n'''
        f'''const [modulePath, helpersPath, fixturePath] = process.argv.slice(2);\n'''
        f'''const compiled = await import(pathToFileURL(modulePath).href);\n'''
        f'''const helpers = await import(pathToFileURL(helpersPath).href);\n'''
        f'''const fixtureScript = JSON.parse(await readFile(fixturePath, "utf8"));\n'''
        f'''const trace = replayDirectJavaScript({{ compiled: compiled.gobiCompiled, helpers, fixtureScript }});\n'''
        f'''process.stdout.write(JSON.stringify(trace));\n''', encoding="utf-8")
    module_file = react_out / (APP_DIR + "gobi-compiled.mjs")
    helpers_file = react_out / (APP_DIR + "encoder.mjs")
    node_command = [NATIVE_NODE, str(node_script), str(module_file), str(helpers_file), str(fixture_path)]
    direct_run = subprocess.run(node_command, cwd=temp, capture_output=True, check=False, timeout=60)
    require(direct_run.returncode == 0, f"archived local direct-module replay exited {direct_run.returncode}: {direct_run.stderr.decode(errors='replace')}")
    executed_direct = json.loads(direct_run.stdout)
    require(executed_direct == direct_trace, "archived emitted module replay differs from retained direct trace")
    local_exec = {
        "native_command": local_native_command,
        "native_exit_code": native_run.returncode,
        "native_stdout_sha256": digest(native_run.stdout),
        "native_stderr_sha256": digest(native_run.stderr),
        "native_trace_equal_archived": True,
        "direct_module_command": node_command,
        "direct_exit_code": direct_run.returncode,
        "direct_stdout_sha256": digest(direct_run.stdout),
        "direct_stderr_sha256": digest(direct_run.stderr),
        "direct_trace_equal_archived": True,
    }

# Local toolchains and explicit full-CI gate status.
runner_receipt = load_json(ROOT / "compiled-methods/evidence/demo/attempt-05-methods-only-final/execution/runner-receipt.json")
require(runner_receipt["status"] == "passed" and runner_receipt["mode"] == "methods-only", "local runner receipt does not describe the completed methods-only attempt")
require(runner_receipt["versions"]["node"] == "v22.23.4", "unexpected local Node identity")
require(runner_receipt["versions"]["rootGo"] == "go version go1.24.0 linux/amd64", "unexpected local native Go identity")

summary = {
    "schema": "gobi.e-ci-go-preflight/v1",
    "job_id": "E-CI-GO",
    "worker": "N1",
    "preflight_only": True,
    "final_current_head_ci_acceptance": "pending_fresh_6b49_primary_artifact",
    "publication": {
        "source_commit": publication["sourceCommit"],
        "source_tree": publication["sourceTree"],
        "parent": publication["parent"],
        "primary_push": publication["primaryPush"],
        "primary_pr": publication["primaryPR"],
        "head_identity_matches_publication": True,
    },
    "source_acceptance": {
        "status": acceptance["status"],
        "packets": acceptance["packets"],
        "all_jobs_done": acceptance["allJobsDone"],
        "receipt_checks": receipt_checks,
    },
    "m0_local_gate": {
        "status": m0["status"],
        "checks": m0["checks"],
        "versions": m0["versions"],
        "source_pin_count": len(m0["sourceBefore"]),
        "all_source_pins_match_current": all(item["matches"] for item in m0_pins),
    },
    "historical_8ed_ci_failure": {
        "source_commit": old_retention["source"],
        "run_id": old_retention["run"],
        "job_id": old_retention["job"],
        "artifact_id": old_retention["artifactId"],
        "provider_zip_bytes": len(old_zip_data),
        "provider_zip_sha256": digest(old_zip_data),
        "zip_test": zip_test,
        "verified_member_count": len(old_zip_checks),
        "all_members_match_retained_hashes": all(old_zip_checks),
        "failure_classification": old_retention["outcome"],
        "counts_as_current_acceptance": False,
    },
    "local_methods_only_archive": {
        "archive_path": str(ARCHIVE.relative_to(ROOT)),
        "archive_bytes": len(archive_bytes),
        "archive_sha256": digest(archive_bytes),
        "member_count": len(files),
        "all_member_paths_bytes_hashes_match": all(member_checks),
        "source_pin_count": len(run["sourcePinsBefore"]),
        "all_runner_source_and_output_pins_match_worktree_or_archive": all(source_pin_sets[key]["all_match_source_or_archive"] for key in source_pin_sets),
        "output_pin_count": len(output_pin_checks),
        "all_output_pins_match_archive_or_current_sources": all(item["matches"] for item in output_pin_checks), "output_pins_in_archive": sum(1 for item in output_pin_checks if item["source"] == "final-local-archive"), "output_pins_in_source_tree": sum(1 for item in output_pin_checks if item["source"] == "current-published-worktree"),
        "source_pin_sets": source_pin_sets,
    },
    "typed_native_direct": {
        "trace_schema": native_trace["schema"],
        "ticks": len(native_trace["ticks"]),
        "native_direct_trace_json_equal": native_trace == direct_trace,
        "native_trace_sha256": digest(native_data),
        "direct_trace_sha256": digest(direct_data),
        "fixture_expectations": len(state_tick_matches),
        "all_fixture_state_message_dispatch_effect_checks_match": True,
        "gobi_node_root": {"kind": node_root["kind"], "tag": node_root["tag"], "key": node_root["key"]},
        "gobi_node_nonempty_keys": node_keys,
        "typed_method_contract": {
            "appir_sha256": digest(member_bytes[react_appir_path]),
            "dom_appir_equal": app_ir == dom_app_ir,
            "symbols": len(actual_symbols),
            "callgraph_and_signatures_match_method_contract": True,
            "state_fields": state_info["fields"],
            "nested_counter_state_fields": counter_info["fields"],
            "capabilities": role_check["capabilities"],
            "numeric_type_profile": "fixture state uses float64 and bool only; AppIR advertises numeric.float64",
        },
        "module_value_semantics": {
            "passed": value["passed"],
            "enabled_update_checks": len(invoked),
            "unchanged_inputs": sum(1 for item in invoked if item["unchanged"]),
            "returned_states_match": sum(1 for item in invoked if item["returnedMatches"]),
            "publish_saved_witnesses": value["snapshotActions"],
        },
        "direct_readonly_guards": {
            "passed": readonly["passed"],
            "guards": [{"message": x["message"]["Name"], "passed": x["passed"], "effect_count": x["effectCount"], "original_unchanged": x["originalUnchanged"], "returned_unchanged": x["returnedStateUnchanged"]} for x in readonly["guards"]],
        },
        "actual_local_artifact_replays": local_exec,
    },
    "local_toolchains": {
        "root_native_go": runner_receipt["versions"]["rootGo"],
        "compiler_go": runner_receipt["versions"]["compiledGo"],
        "node": runner_receipt["versions"]["node"],
        "chromium": runner_receipt.get("versions", {}).get("chromium"),
        "goscript": "v0.6.2 (local method build record)",
    },
    "limits": [
        "Local M0 and methods-only evidence is preflight context only and is not current-head CI acceptance.",
        "The source8ed CI artifact is retained and verified as a failure because final provenance paths did not match; it does not count as a pass.",
        "Final outcome requires the root-provided fresh primary artifact for source 6b49cc0 / tree b28b10 and its workflow proof.",
    ],
}

out = LANE / "preflight.json"
out.write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps({
    "preflight_path": str(out.relative_to(ROOT)),
    "source_commit": publication["sourceCommit"],
    "local_archive_members": len(files),
    "old_ci_failure_members": len(old_zip_checks),
    "native_direct_equal": native_trace == direct_trace,
    "local_binary_replay_matches": local_exec["native_trace_equal_archived"],
    "local_module_replay_matches": local_exec["direct_trace_equal_archived"],
    "source_acceptance_packets": acceptance["packets"],
    "final_ci_gate": "pending_fresh_6b49_primary_artifact",
}, indent=2))
