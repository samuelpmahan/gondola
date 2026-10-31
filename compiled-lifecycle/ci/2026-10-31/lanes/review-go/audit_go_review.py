#!/usr/bin/env python3
"""Independent read-only audit of the primary hosted E-CI-GO evidence."""

from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess
import tarfile
import tempfile
import zipfile

ROOT = pathlib.Path.cwd()
CI = pathlib.Path("compiled-lifecycle/ci/2026-10-31")
EXTRACTED = CI / "extracted"
PROVIDER = CI / "provider/failed-41178420647"
ATTEMPT_REL = pathlib.Path("compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z")
ATTEMPT = EXTRACTED / ATTEMPT_REL


def read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_digest(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def check_record(path: pathlib.Path, row: dict, label: str) -> None:
    data = path.read_bytes()
    assert len(data) == row["bytes"], f"{label}: byte count mismatch at {path}"
    assert digest(data) == row["sha256"], f"{label}: SHA-256 mismatch at {path}"


# The canonical N1 files were copied to the dated coordination directory byte-for-byte.
n1_report = CI / "coordination/reports/E-CI-GO.md"
n1_receipt_path = CI / "coordination/receipts/E-CI-GO.json"
assert n1_report.read_bytes() == pathlib.Path("compiled-lifecycle/coordination/reports/E-CI-GO.md").read_bytes()
assert n1_receipt_path.read_bytes() == pathlib.Path("compiled-lifecycle/coordination/receipts/E-CI-GO.json").read_bytes()
n1_receipt = read_json(n1_receipt_path)
assert digest(n1_report.read_bytes()) == "9fc1129f38c92b4716983b1f593d43ce07eb8d17a22191ced18be00a84ff8eda"
assert digest(n1_receipt_path.read_bytes()) == "58d63e4a69c31c3dd02764c09134a5633117adc1bfb9fdf445e9af5e294a3d3d"
assert n1_receipt["job_id"] == "E-CI-GO" and n1_receipt["worker"] == "N1"
assert n1_receipt["decision"] == "mixed_change" and n1_receipt["outcome"] == "mixed_change"
assert n1_receipt["artifact"]["id"] == "13034915662"
assert n1_receipt["artifact"]["workflow_run_id"] == "41178420647"
assert n1_receipt["artifact"]["head_sha"] == "49cc2b96c8817a47319d5b7bd484184a22fa984b"
assert n1_receipt["artifact"]["tree_sha"] == "d49ca35b7eda23837c392bbe0d2363551e4c7bec"
assert n1_receipt["artifact"]["sha256"] == "6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4"

audit_path = CI / "lanes/go/audit.json"
audit = read_json(audit_path)
assert digest(audit_path.read_bytes()) == "aaaa74b18e8df8b0beb2dc2b216f0b875538cee9687166ba8373732f8c52d1fc"
assert audit["primaryArtifact"]["artifactId"] == "13034915662"
assert audit["primaryArtifact"]["workflowRunId"] == "41178420647"
assert audit["primaryArtifact"]["headSha"] == "49cc2b96c8817a47319d5b7bd484184a22fa984b"
assert audit["primaryArtifact"]["sourceTree"] == "d49ca35b7eda23837c392bbe0d2363551e4c7bec"

# Reassemble the primary provider ZIP from the retained chunks, verify every chunk,
# every ZIP member against the member map and extracted copy, and read each member
# fully so zipfile also enforces its CRC while streaming.
retention_path = PROVIDER / "retention.json"
members_path = PROVIDER / "members.json"
retention = read_json(retention_path)
member_index = read_json(members_path)
assert retention["artifactId"] == 13034915662 and retention["runId"] == 41178420647
assert retention["providerConclusion"] == "failure"
assert retention["bytes"] == 47035803
assert retention["sha256"] == "6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4"
parts = sorted(PROVIDER.glob("artifact.zip.part-*"))
assert len(parts) == len(retention["chunks"]) == 12
zip_hasher = hashlib.sha256()
zip_bytes = 0
for part, declared in zip(parts, retention["chunks"], strict=True):
    payload = part.read_bytes()
    assert part.as_posix() == declared["path"]
    assert len(payload) == declared["bytes"]
    assert digest(payload) == declared["sha256"]
    zip_hasher.update(payload)
    zip_bytes += len(payload)
assert zip_bytes == retention["bytes"]
assert zip_hasher.hexdigest() == retention["sha256"]
provider_rows = {row["path"]: row for row in member_index["members"]}
assert member_index["artifactId"] == 13034915662 and len(provider_rows) == 1272
with tempfile.TemporaryDirectory(prefix="xr-ci-go-") as temp:
    zip_path = pathlib.Path(temp) / "primary-artifact.zip"
    with zip_path.open("wb") as out:
        for part in parts:
            out.write(part.read_bytes())
    with zipfile.ZipFile(zip_path, "r") as archive:
        infos = {info.filename: info for info in archive.infolist() if not info.is_dir()}
        assert infos.keys() == provider_rows.keys()
        assert len(infos) == 1272
        for path, info in infos.items():
            row = provider_rows[path]
            with archive.open(info, "r") as stream:
                h = hashlib.sha256()
                n = 0
                while block := stream.read(1024 * 1024):
                    h.update(block)
                    n += len(block)
            assert n == row["bytes"], f"provider member byte mismatch: {path}"
            assert h.hexdigest() == row["sha256"], f"provider member digest mismatch: {path}"
            check_record(EXTRACTED / path, row, "extracted provider member")

execution_path = ATTEMPT / "execution.json"
execution_bytes = execution_path.read_bytes()
execution = json.loads(execution_bytes)
assert digest(execution_bytes) == "8cacd69eb2b432237492fde7c3a66185356f7faa311fee0ced0b3042097432fc"
assert execution["status"] == "failed" and execution["outcome"] == "mixed_change"
assert execution["sourcePinsMatch"] is True

# Validate both source-pin snapshots against the current 49cc checkout.
source_before = execution["sourceBefore"]
source_after = execution["sourceAfter"]
assert len(source_before) == len(source_after) == 122
assert source_before == source_after
source_commit = "49cc2b96c8817a47319d5b7bd484184a22fa984b"
assert subprocess.run(["git", "rev-parse", f"{source_commit}^{{tree}}"], check=True,
                      capture_output=True, text=True).stdout.strip() == "d49ca35b7eda23837c392bbe0d2363551e4c7bec"
for row in source_before:
    git_blob = subprocess.run(["git", "show", f"{source_commit}:{row['path']}"],
                              check=True, capture_output=True).stdout
    assert len(git_blob) == row["bytes"], f"source pin byte mismatch in immutable source: {row['path']}"
    assert digest(git_blob) == row["sha256"], f"source pin digest mismatch in immutable source: {row['path']}"
source_rows_verified = len(source_before)

# Validate each of the 67 React and 67 DOM outputs at both recorded checkpoints.
output_counts = {}
for backend in ("react", "dom"):
    before = execution["outputPinsBefore"][backend]
    after = execution["outputPinsAfter"][backend]
    assert len(before) == len(after) == 67
    assert before == after
    for row in before:
        check_record(EXTRACTED / row["path"], row, f"{backend} compiled output")
    output_counts[backend] = len(before)
assert execution["buildComparison"]["appIRByteIdentical"] is True
assert execution["buildComparison"]["encoderByteIdentical"] is True
assert execution["buildComparison"]["rawBundleEqualityClaimed"] is False

# Rehash all 241 internal archive members against both archive payload and extracted files.
archive_path = ATTEMPT / "lifecycle-artifacts.tar.gz"
archive_manifest_path = ATTEMPT / "archive-manifest.json"
archive_manifest = read_json(archive_manifest_path)
archive_rows = {row["path"]: row for row in archive_manifest["members"]}
assert len(archive_rows) == 241
assert archive_path.stat().st_size == 12062689
assert file_digest(archive_path) == "eb9c9678f224be7cedb2e95be845343320bf8fdf319481c6a6d568a8136a944d"
archive_member_bytes = 0
with tarfile.open(archive_path, "r:gz") as tar:
    tar_files = {member.name: member for member in tar.getmembers() if member.isfile()}
    assert tar_files.keys() == archive_rows.keys()
    assert len(tar_files) == 241
    for path, member in tar_files.items():
        with tar.extractfile(member) as stream:
            h = hashlib.sha256()
            n = 0
            while block := stream.read(1024 * 1024):
                h.update(block)
                n += len(block)
        row = archive_rows[path]
        assert n == row["bytes"] and h.hexdigest() == row["sha256"], f"archive member mismatch: {path}"
        check_record(ATTEMPT / path, row, "extracted internal archive member")
        archive_member_bytes += n
assert archive_member_bytes == 158843470

# Verify hosted test commands/logs, native standalone trace, typed AppIR, direct replay,
# and the explicit full-matrix failure boundary from the raw attempt.
commands = {row["name"]: row for row in execution["commands"]}
for command_name in ("lifecycle-go-tests", "lifecycle-compiler-go-tests", "native-cli-probe"):
    command = commands[command_name]
    assert command["exitCode"] == 0 and command["error"] is None
    for stream in ("stdout", "stderr"):
        path = EXTRACTED / command[f"{stream}Path"]
        assert file_digest(path) == command[f"{stream}Sha256"], f"{command_name} {stream} log hash"
assert commands["native-cli-probe"]["command"].endswith("/native/compiled-lifecycle-native")
assert commands["native-cli-probe"]["args"] == ["--script", "/home/runner/work/gondola/gondola/fixtures/compiled/lifecycle/scenario.json"]

node_tests = next(row for row in execution["commands"] if row["name"] == "lifecycle-node-tests-before-build")
assert node_tests["exitCode"] == 0
runtime_command = next(row for row in execution["commands"] if row["name"] == "lifecycle-compiled-runtime-tests")
assert runtime_command["exitCode"] == 0
for stream in ("stdout", "stderr"):
    assert file_digest(EXTRACTED / runtime_command[f"{stream}Path"]) == runtime_command[f"{stream}Sha256"]
runtime_log = (EXTRACTED / runtime_command["stdoutPath"]).read_text(encoding="utf-8")
assert "# tests 10" in runtime_log and "# pass 10" in runtime_log and "# fail 0" in runtime_log
for expected_name in (
    "real compiled append effects pass through the signature-typed encoder",
    "generated encoder accepts a nonzero-offset effect GoSlice",
    "generated encoder rejects malformed GoSlice wrappers and malformed Go Effect fields",
    "runtime rejects unexpected fields in the typed Value returned for effects",
):
    assert expected_name in runtime_log

native_binary = ATTEMPT / "native/compiled-lifecycle-native"
assert native_binary.stat().st_size == 3423743
assert file_digest(native_binary) == "897f021e17529503724c1535178255546308e98d365fe31ebd5ff57444837655"
native_path = ATTEMPT / "matrix/native-cli.json"
native_bytes = native_path.read_bytes()
native = json.loads(native_bytes)
assert digest(native_bytes) == "2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5"
assert native["schema"] == "gobi.compiled-lifecycle-native/v1"
assert native["packagePath"] == "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
assert native["componentID"] == native["packagePath"]
scenario = read_json(ROOT / "fixtures/compiled/lifecycle/scenario.json")
assert len(scenario["events"]) == len(native["steps"]) == 26
assert native["name"] == scenario["name"]

# Check every emitted native message/effect and the contract's 13 state checkpoints.
steps = native["steps"]
for index, (event, step) in enumerate(zip(scenario["events"], steps, strict=True)):
    assert step["index"] == index
    assert step["kind"] == event["kind"]
    assert step["message"] == event.get("message")
expected_effects = {row["afterEvent"]: row["effects"] for row in scenario["expectedEffects"]}
for index, step in enumerate(steps):
    assert step["effects"] == expected_effects.get(index, []), f"native event {index} effects"
state_checkpoints = {row["afterEvent"]: row for row in scenario["expectedStates"]}
for after_event, checkpoint in state_checkpoints.items():
    actual = native["initialState"] if after_event == -1 else steps[after_event]["state"]
    nodes = [actual[name] for name in ("Parent", "Child", "Grandchild", "Sibling")]
    for key, field in (("generations", "Generation"), ("requestIDs", "RequestID"), ("alive", "Alive"),
                       ("requested", "Requested"), ("pending", "Pending"), ("tokens", "Token"),
                       ("replies", "Reply")):
        assert [node[field] for node in nodes] == checkpoint[key], f"native checkpoint {after_event} {key}"
    assert [node["Counter"]["Count"] for node in nodes] == checkpoint["counts"]
    assert actual["NextRequestID"] == checkpoint["nextRequestID"]

all_effects = [effect for step in steps for effect in step["effects"]]
requests = [effect for effect in all_effects if effect["kind"] == "fixture.request"]
cancels = [effect for effect in all_effects if effect["kind"] == "lifecycle.cancel"]
assert [row["arg"] for row in requests] == [
    "parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
    "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7",
]
assert [row["arg"] for row in cancels] == ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"]
assert all((row["name"], row["reply"]) == ("lookup", "complete") for row in requests)
assert all((row["name"], row["reply"]) == ("cancel", "") for row in cancels)
assert steps[11]["state"] == steps[10]["state"]
assert steps[12]["state"] == steps[10]["state"]
assert steps[13]["state"] == steps[10]["state"]
assert steps[15]["state"] == steps[14]["state"]
assert steps[25]["state"] == steps[24]["state"]
assert [steps[i]["outcome"] for i in (11, 12, 13, 15, 25)] == [
    "stale-no-op", "stale-no-op", "stale-no-op", "duplicate-no-op", "duplicate-no-op"
]
assert [steps[i]["outcome"] for i in (14, 22, 23, 24)] == ["go-accepted"] * 4
for step_index, node_id, token in (
    (14, "sibling", "sibling:g1:r4"),
    (22, "grandchild", "grandchild:g2:r7"),
    (23, "child", "child:g2:r6"),
    (24, "parent", "parent:g2:r5"),
):
    accepted_node = next(node for node in steps[step_index]["state"].values()
                         if isinstance(node, dict) and node.get("ID") == node_id)
    assert accepted_node["Reply"] == token and accepted_node["Pending"] is False
assert native["steps"][-1]["state"]["NextRequestID"] == 7

# AppIR/result and generated exports establish package/symbol/type bindings.
react_result = read_json(ATTEMPT / "react/result.json")
dom_result = read_json(ATTEMPT / "dom/result.json")
assert react_result["ok"] is True and dom_result["ok"] is True
assert react_result["diagnostics"] == [] and dom_result["diagnostics"] == []
assert len(react_result["outputs"]) == len(dom_result["outputs"]) == 67
react_app = react_result["apps"][0]
dom_app = dom_result["apps"][0]
assert react_app == dom_app
assert execution["builds"]["react"]["app"]["paths"]["roleBindings"] == [
    {"role": "init", "appIRSymbol": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Init", "forwarderExport": "GobiCompiledInit"},
    {"role": "update", "appIRSymbol": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.Update", "forwarderExport": "GobiCompiledUpdate"},
    {"role": "view", "appIRSymbol": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.View", "forwarderExport": "GobiCompiledView"},
]
react_out = ATTEMPT / "react/output/apps/lifecycle-7e6575d90707"
dom_out = ATTEMPT / "dom/output/apps/lifecycle-7e6575d90707"
for name in ("app-ir.json", "encoder.mjs"):
    assert (react_out / name).read_bytes() == (dom_out / name).read_bytes(), f"React/DOM {name} bytes differ"
assert (react_out / "gobi-compiled.mjs").read_bytes() != (dom_out / "gobi-compiled.mjs").read_bytes()
package = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
component = next(row for row in react_app["components"] if row["id"] == package)
assert component["stateType"] == f"{package}.State"
update_symbol = next(row for row in react_app["symbols"] if row["id"] == f"{package}.Update")
assert update_symbol["signature"]["results"] == [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]
effect_slice = next(row for row in react_app["types"] if row["id"] == "[]github.com/samuelpmahan/gondola/gobi.Effect")
assert effect_slice["kind"] == "slice" and effect_slice["elemType"] == "github.com/samuelpmahan/gondola/gobi.Effect"
gobi_effect = next(row for row in react_app["types"] if row["id"] == "github.com/samuelpmahan/gondola/gobi.Effect")
assert [(field["name"], field["type"]) for field in gobi_effect["fields"]] == [
    ("Kind", "string"), ("Name", "string"), ("Arg", "string"), ("Reply", "string")
]
uint64_type = next(row for row in react_app["types"] if row["id"] == "uint64")
assert uint64_type["jsRepresentation"] == "bigint"
assert execution["builds"]["react"]["outputCount"] == execution["builds"]["dom"]["outputCount"] == 67

direct_path = ATTEMPT / "matrix/lifecycle.direct.json"
direct = read_json(direct_path)
assert direct["schema"] == "gobi.compiled-lifecycle-direct/v1"
assert direct["componentID"] == package
assert len(direct["trace"]["ticks"]) == 26
assert direct["pending"] == []
assert audit["directModuleReplay"]["status"] == "passed"
assert audit["directModuleReplay"]["pendingAtEnd"] == 0

run_path = ATTEMPT / "matrix/lifecycle.run.json"
run = read_json(run_path)
failed = read_json(ATTEMPT / "matrix/lifecycle.failed.json")
assert run["status"] == "rejected"
assert run["sourceStableThroughCheck"] and run["buildOutputsStableThroughCheck"]
assert run["nativeCommand"][0] == "/home/runner/work/gondola/gondola/go"
assert any(stage["name"] == "native-go-script-cli-replay" and stage["status"] == "failed" for stage in run["stages"])
assert "spawnSync /home/runner/work/gondola/gondola/go ENOENT" in failed["errors"][0]["message"]
assert any("full conformance check withheld" in error["message"] for error in failed["errors"])
assert execution["conformance"]["status"] == "rejected"
assert execution["conformance"]["checks"] is None

current_head = subprocess.run(["git", "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
assert current_head == "49cc2b96c8817a47319d5b7bd484184a22fa984b"

result = {
    "schema": "gobi.compiled-lifecycle-xr-ci-go-review/v1",
    "decision": "accepted",
    "outcome": "mixed_change",
    "provider": {
        "artifactId": retention["artifactId"],
        "runId": retention["runId"],
        "conclusion": retention["providerConclusion"],
        "bytes": zip_bytes,
        "sha256": zip_hasher.hexdigest(),
        "providerChunksVerified": len(parts),
        "providerMembersVerified": len(provider_rows),
        "sourceSHA": n1_receipt["artifact"]["head_sha"],
        "sourceTree": n1_receipt["artifact"]["tree_sha"],
    },
    "n1Packet": {
        "reportSha256": digest(n1_report.read_bytes()),
        "receiptSha256": digest(n1_receipt_path.read_bytes()),
        "auditSha256": digest(audit_path.read_bytes()),
    },
    "sourcePins": {"before": len(source_before), "after": len(source_after), "immutableSourceMismatches": 0},
    "buildOutputs": {
        "reactBeforeAndAfter": output_counts["react"],
        "domBeforeAndAfter": output_counts["dom"],
        "artifactOutputMismatches": 0,
        "resultOutputs": {"react": len(react_result["outputs"]), "dom": len(dom_result["outputs"])},
        "appIRAndEncoderIdentical": True,
        "rawBackendModulesIdentical": False,
        "roleBindings": execution["builds"]["react"]["app"]["paths"]["roleBindings"],
    },
    "internalArchive": {
        "bytes": archive_path.stat().st_size,
        "sha256": file_digest(archive_path),
        "manifestMembers": len(archive_rows),
        "membersRehashed": len(tar_files),
        "memberBytes": archive_member_bytes,
        "mismatches": 0,
    },
    "nativeStandalone": {
        "binarySha256": file_digest(native_binary),
        "traceSha256": digest(native_bytes),
        "steps": len(steps),
        "requests": len(requests),
        "cancellations": len(cancels),
        "cancellationOrder": [row["arg"] for row in cancels],
        "stateCheckpointsComparedToFixture": len(state_checkpoints),
        "staleAndDuplicateNoOps": 5,
        "finalRequestId": steps[-1]["state"]["NextRequestID"],
    },
    "runtimeEffectBridge": {
        "command": runtime_command["name"],
        "passed": 10,
        "failed": 0,
        "logSha256": file_digest(EXTRACTED / runtime_command["stdoutPath"]),
        "appIRUpdateResult": update_symbol["signature"]["results"],
        "effectSlice": effect_slice,
        "uint64Representation": uint64_type["jsRepresentation"],
    },
    "hostedTests": {
        name: {
            "command": commands[name]["command"],
            "args": commands[name]["args"],
            "exitCode": commands[name]["exitCode"],
            "stdoutSha256": commands[name]["stdoutSha256"],
            "stderrSha256": commands[name]["stderrSha256"],
        }
        for name in ("lifecycle-go-tests", "lifecycle-compiler-go-tests", "lifecycle-compiled-runtime-tests")
    },
    "toolVersions": audit["toolVersions"],
    "conformanceBoundary": {
        "runStatus": run["status"],
        "failedStage": "native-go-script-cli-replay",
        "error": failed["errors"][0]["message"],
        "finalCheckerProduced": execution["conformance"]["checks"] is not None,
        "nativeGoEquivalenceClaimed": False,
        "fullCIOrOverallPassClaimed": False,
    },
}
print(json.dumps(result, indent=2))
