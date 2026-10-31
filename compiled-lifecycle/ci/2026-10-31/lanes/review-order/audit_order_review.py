#!/usr/bin/env python3
"""Independent verification of the hosted lifecycle order packet and raw traces."""

from __future__ import annotations

import hashlib
import json
import pathlib
import re
import struct
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
SOURCE_SHA = "49cc2b96c8817a47319d5b7bd484184a22fa984b"
SOURCE_TREE = "d49ca35b7eda23837c392bbe0d2363551e4c7bec"
PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"


def read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def verify_record(path: pathlib.Path, record: dict, label: str) -> None:
    data = path.read_bytes()
    assert len(data) == record["bytes"], f"{label} byte count mismatch: {path}"
    assert sha_bytes(data) == record["sha256"], f"{label} SHA mismatch: {path}"


def decode_gobi_value(value):
    kind = value["kind"]
    if kind == "struct":
        assert value.get("typeId")
        fields = value["fields"]
        assert len({field["name"] for field in fields}) == len(fields)
        return {field["name"]: decode_gobi_value(field["value"]) for field in fields}
    if kind == "slice":
        return [decode_gobi_value(item) for item in value["items"]]
    if kind == "string":
        assert value["typeId"] == "string"
        return value["string"]
    if kind == "bool":
        assert value["typeId"] == "bool"
        return value["bool"]
    if kind in ("uint", "int"):
        return int(value["integer"])
    if kind == "float64":
        return struct.unpack(">d", bytes.fromhex(value["float64Bits"]))[0]
    raise AssertionError(f"unexpected GoScript value kind {kind}")


def typed_lifecycle_state(value):
    assert value["kind"] == "struct" and value["typeId"] == f"{PACKAGE}.State"
    state = decode_gobi_value(value)
    assert list(state) == ["Parent", "Child", "Grandchild", "Sibling", "NextRequestID"]
    for name in ("Parent", "Child", "Grandchild", "Sibling"):
        assert value["fields"][[row["name"] for row in value["fields"]].index(name)]["value"]["typeId"] == f"{PACKAGE}.NodeState"
        node = state[name]
        assert list(node) == ["ID", "ParentID", "Generation", "RequestID", "Alive", "Requested", "Pending", "Token", "Reply", "Counter"]
        assert list(node["Counter"]) == ["Count"]
    return state


# Confirm the independently authored N2 packet hashes and dated/canonical copies.
n2_report = CI / "coordination/reports/E-CI-ORDER.md"
n2_receipt_path = CI / "coordination/receipts/E-CI-ORDER.json"
n2_audit_path = CI / "lanes/order/audit-result.json"
n2_audit_script = CI / "lanes/order/audit-ci-order.mjs"
n2_receipt = read_json(n2_receipt_path)
assert sha_file(n2_report) == "01453ee944a32cf3afdc4ee47fd96ed858f39fbe32879cf8969028500b8e326c"
assert sha_file(n2_receipt_path) == "f0f2c65134f03752dfe635d7d4c58fd4cc47b652b3d6692dec854ba9888e0ab7"
assert sha_file(n2_audit_path) == "af35ddd2d08127221462e079bae86cb97895f90ff556a9a5541ecd9d794ebb21"
assert sha_file(n2_audit_script) == "daa5329bd09bdf3bedb7a49b283f9749a29a2ba330176c45c392922989a70327"
assert n2_receipt["job_id"] == "E-CI-ORDER" and n2_receipt["worker"] == "N2"
assert n2_receipt["status"] == "audited" and n2_receipt["outcome"] == "mixed_change"
n2_audit = read_json(n2_audit_path)

# Bind the provider artifact, all chunks, all ZIP members, and their extracted copies.
retention = read_json(PROVIDER / "retention.json")
member_manifest = read_json(PROVIDER / "members.json")
assert retention["artifactId"] == 13034915662 and retention["runId"] == 41178420647
assert retention["providerConclusion"] == "failure"
assert retention["bytes"] == 47035803
assert retention["sha256"] == "6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4"
parts = sorted(PROVIDER.glob("artifact.zip.part-*"))
assert len(parts) == len(retention["chunks"]) == 12
zip_hasher = hashlib.sha256()
zip_bytes = 0
for part, row in zip(parts, retention["chunks"], strict=True):
    data = part.read_bytes()
    assert part.as_posix() == row["path"]
    assert len(data) == row["bytes"] and sha_bytes(data) == row["sha256"]
    zip_hasher.update(data)
    zip_bytes += len(data)
assert zip_bytes == retention["bytes"] and zip_hasher.hexdigest() == retention["sha256"]
provider_rows = {row["path"]: row for row in member_manifest["members"]}
assert member_manifest["artifactId"] == 13034915662 and len(provider_rows) == 1272
with tempfile.TemporaryDirectory(prefix="xr-ci-order-") as temp:
    zip_path = pathlib.Path(temp) / "primary-artifact.zip"
    with zip_path.open("wb") as out:
        for part in parts:
            out.write(part.read_bytes())
    with zipfile.ZipFile(zip_path, "r") as archive:
        zip_members = {item.filename: item for item in archive.infolist() if not item.is_dir()}
        assert zip_members.keys() == provider_rows.keys()
        for name, member in zip_members.items():
            row = provider_rows[name]
            extracted_path = EXTRACTED / name
            verify_record(extracted_path, row, "extracted provider member")
            h = hashlib.sha256()
            count = 0
            with archive.open(member, "r") as stream:
                while block := stream.read(1024 * 1024):
                    count += len(block)
                    h.update(block)
            assert count == row["bytes"] and h.hexdigest() == row["sha256"], f"ZIP member mismatch: {name}"

# Source pins are compared to immutable 49cc Git objects, never to the shared worktree.
run_path = ATTEMPT / "matrix/lifecycle.run.json"
run = read_json(run_path)
assert subprocess.run(["git", "rev-parse", f"{SOURCE_SHA}^{{tree}}"], check=True,
                      capture_output=True, text=True).stdout.strip() == SOURCE_TREE
assert run["status"] == "rejected"
assert run["sourceStableThroughCheck"] is True and run["buildOutputsStableThroughCheck"] is True
assert len(run["sourcePinsBefore"]) == 178
assert run["sourcePinsBefore"] == run["sourcePinsAfter"] == run["sourcePinsFinal"]
git_source_pins = []
attempt_output_pins = []
for pin in run["sourcePinsFinal"]:
    if pin["path"].startswith("compiled-lifecycle/builds/attempts/"):
        verify_record(EXTRACTED / pin["path"], pin, "source-stability generated-output pin")
        attempt_output_pins.append(pin)
    else:
        blob = subprocess.run(["git", "show", f"{SOURCE_SHA}:{pin['path']}"], check=True, capture_output=True).stdout
        assert len(blob) == pin["bytes"] and sha_bytes(blob) == pin["sha256"], f"49cc source pin mismatch: {pin['path']}"
        git_source_pins.append(pin)
assert len(run["buildOutputPinsBeforeCheck"]) == 8
assert run["buildOutputPinsBeforeCheck"] == run["buildOutputPinsAfterCheck"]
for pin in run["buildOutputPinsAfterCheck"]:
    verify_record(EXTRACTED / pin["path"], pin, "conformance build-output pin")

evidence = read_json(CI / "lanes/evidence/artifacts-push-41178420647.json")
provider_artifact = next(row for row in evidence["artifacts"] if row["id"] == 13034915662)
provider_run = read_json(CI / "lanes/evidence/run-push-41178420647-final.json")
provider_jobs = read_json(CI / "lanes/evidence/jobs-push-41178420647-final.json")
assert provider_artifact["workflow_run"]["head_sha"] == SOURCE_SHA
assert provider_artifact["digest"] == f"sha256:{retention['sha256']}"
assert provider_run["id"] == 41178420647 and provider_run["head_sha"] == SOURCE_SHA
assert provider_run["status"] == "completed" and provider_run["conclusion"] == "failure"
assert len(provider_jobs["jobs"]) == 1 and provider_jobs["jobs"][0]["conclusion"] == "failure"

matrix = ATTEMPT / "matrix"
native_path = matrix / "native-cli.json"
direct_path = matrix / "lifecycle.direct.json"
browser_path = matrix / "lifecycle.browser.capture.json"
native_bytes, direct_bytes, browser_bytes = native_path.read_bytes(), direct_path.read_bytes(), browser_path.read_bytes()
native = json.loads(native_bytes)
direct = json.loads(direct_bytes)
browser = json.loads(browser_bytes)
scenario_blob = subprocess.run(["git", "show", f"{SOURCE_SHA}:fixtures/compiled/lifecycle/scenario.json"],
                               check=True, capture_output=True).stdout
scenario = json.loads(scenario_blob)
assert sha_bytes(native_bytes) == "2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5"
assert sha_bytes(direct_bytes) == "4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71"
assert sha_bytes(browser_bytes) == "a663d77ba16c43adfb3f4b12666845b82047b3e1b9c7ed68ffea8c98ac304ad6"
assert native["schema"] == "gobi.compiled-lifecycle-native/v1"
assert direct["schema"] == "gobi.compiled-lifecycle-direct/v1"
assert native["componentID"] == direct["componentID"] == PACKAGE
assert native["packagePath"] == direct["packagePath"] == PACKAGE
assert scenario["componentID"] == scenario["packagePath"] == PACKAGE
assert len(native["steps"]) == len(direct["steps"]) == len(scenario["events"]) == 26
assert len(direct["trace"]["ticks"]) == 26 and direct["pending"] == []
assert typed_lifecycle_state(direct["trace"]["ticks"][0]["state"]) == native["initialState"]

# Compare complete decoded State, View tree, messages and requested effects for each script event.
native_direct_event_comparisons = 0
for index, (compiled_step, native_step, fixture_event) in enumerate(
    zip(direct["steps"], native["steps"], scenario["events"], strict=True)
):
    assert compiled_step["eventIndex"] == native_step["index"] == index
    assert compiled_step["event"]["kind"] == native_step["kind"] == fixture_event["kind"]
    assert compiled_step["message"] == native_step["message"] == fixture_event.get("message")
    assert typed_lifecycle_state(compiled_step["state"]) == native_step["state"], f"typed State at event {index}"
    assert compiled_step["view"]["tree"] == native_step["view"], f"View tree at event {index}"
    compiled_effects = [row["effect"] for row in compiled_step["requestedEffects"]]
    assert compiled_effects == native_step["effects"], f"requested effects at event {index}"
    typed_effects = compiled_step["typedEffects"]
    if fixture_event["kind"] == "renderer-swap":
        assert typed_effects is None
    else:
        assert typed_effects["typeId"] == "[]github.com/samuelpmahan/gondola/gobi.Effect"
        assert typed_effects["kind"] == "slice"
        decoded_typed_effects = [
            {"kind": row["Kind"], "name": row["Name"], "arg": row["Arg"], "reply": row["Reply"]}
            for row in decode_gobi_value(typed_effects)
        ]
        assert compiled_effects == decoded_typed_effects, f"typed effect values at event {index}"
    native_direct_event_comparisons += 1

stale_tokens = ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"]
for offset, token in enumerate(stale_tokens):
    index = 11 + offset
    native_step, previous_native = native["steps"][index], native["steps"][index - 1]
    direct_step, previous_direct = direct["steps"][index], direct["steps"][index - 1]
    assert native_step["outcome"] == direct_step["outcome"] == "stale-no-op"
    assert native_step["message"] == direct_step["message"] == {"name": "complete", "arg": token}
    assert native_step["state"] == previous_native["state"]
    assert native_step["view"] == previous_native["view"]
    assert direct_step["state"] == previous_direct["state"]
    assert direct_step["view"] == previous_direct["view"]
    assert native_step["effects"] == direct_step["requestedEffects"] == []
    assert direct_step["tickAfter"] == direct_step["tickBefore"] + 1
    assert direct_step["pending"] == [{"token": "sibling:g1:r4", "dispatchId": "dispatch-0008", "effectIndex": 0}]
    sibling = native_step["state"]["Sibling"]
    assert sibling["Pending"] is True and sibling["Token"] == "sibling:g1:r4"
for index in (15, 25):
    assert native["steps"][index]["outcome"] == direct["steps"][index]["outcome"] == "duplicate-no-op"
    assert native["steps"][index]["state"] == native["steps"][index - 1]["state"]
    assert native["steps"][index]["view"] == native["steps"][index - 1]["view"]
    assert direct["steps"][index]["state"] == direct["steps"][index - 1]["state"]
    assert direct["steps"][index]["view"] == direct["steps"][index - 1]["view"]
    assert direct["steps"][index]["requestedEffects"] == []

direct_records = direct["effectRecords"]
request_records = [row for row in direct_records if row["kind"] == "request"]
cancel_records = [row for row in direct_records if row["kind"] == "cancel"]
assert [row["token"] for row in request_records] == [
    "parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
    "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7",
]
assert [row["token"] for row in cancel_records] == stale_tokens
correlations = {row["token"]: {"dispatchId": row["dispatchId"], "effectIndex": row["effectIndex"]}
                for row in request_records}
for row in cancel_records:
    assert row["target"] == correlations[row["token"]]
assert [row["token"] for row in direct_records if row["kind"] == "deliver"] == [
    "sibling:g1:r4", "grandchild:g2:r7", "child:g2:r6", "parent:g2:r5"
]
assert [row["arg"] for row in native["steps"][9]["effects"]] == stale_tokens
assert native["steps"][9]["state"]["Sibling"]["Pending"] is True

# Check the 49cc checker projection itself: its compared direct/browser fields omit action.
check_source = subprocess.run(["git", "show", f"{SOURCE_SHA}:compiled-lifecycle/conformance/check.mjs"],
                              check=True, capture_output=True).stdout
assert sha_bytes(check_source) == "0a714448607d40f08719925bf3822b35bd41b58fc66a124d8b7f5f491859c8e5"
check_text = check_source.decode("utf-8")
projection_start = check_text.index("const directCore = direct.trace.ticks.map(")
projection_end = check_text.index("assertExactTraceValue(directCore, browserCore", projection_start)
projection_source = check_text[projection_start:projection_end]
assert all(field in projection_source for field in ("index", "message", "dispatchId", "state", "requestedEffects", "completedEffects", "view"))
assert "action" not in projection_source

browser_summaries = {}
detached_click_total = 0
for name in ("react", "dom", "swap"):
    profile = browser["profiles"][name]
    assert profile["backend"] == name and profile["componentId"] == PACKAGE and profile["appId"] == PACKAGE
    assert profile["pageErrors"] == []
    assert len(profile["events"]) == 26 and len(profile["trace"]["ticks"]) == 26 and len(profile["snapshots"]) == 27
    assert len(profile["actions"]) == 16 and len(profile["effectRecords"]) == 17
    assert profile["pendingAtEnd"] == []
    click_events = [(index, event) for index, event in enumerate(scenario["events"]) if event["kind"] == "click"]
    assert len(click_events) == len(profile["actions"]) == 16
    for action, (event_index, event) in zip(profile["actions"], click_events, strict=True):
        assert action["eventIndex"] == event_index
        assert action["method"] == "HTMLElement.click" and action["attempted"] is True
        assert action["target"]["connected"] is True and action["target"]["disabled"] is False
        assert action["action"] == {"path": event["path"], "event": event["event"], "value": event["value"]}
        assert action["expectedMessage"] == event["message"]
        assert action["observed"]["message"] == {"Name": event["message"]["name"], "Arg": event["message"]["arg"]}
        assert action["afterTicks"] == action["beforeTicks"] + 1

    # This is precisely the checker's core trace projection. Deliberately exclude action;
    # record and bound the known action metadata asymmetry below instead of hiding it.
    core_fields = ("index", "message", "dispatchId", "state", "requestedEffects", "completedEffects", "view")
    direct_core = [{key: tick[key] for key in core_fields} for tick in direct["trace"]["ticks"]]
    browser_core = [{key: tick[key] for key in core_fields} for tick in profile["trace"]["ticks"]]
    assert direct_core == browser_core, f"{name} direct/browser core trace projection differs"
    action_mismatches = [
        {"index": index, "direct": direct_tick["action"], "browser": browser_tick["action"]}
        for index, (direct_tick, browser_tick) in enumerate(zip(direct["trace"]["ticks"], profile["trace"]["ticks"], strict=True))
        if direct_tick["action"] != browser_tick["action"]
    ]
    assert [row["index"] for row in action_mismatches] == [11, 12, 13, 15, 25]
    assert all(row["direct"] is None and row["browser"] == {"path": "", "event": "click", "value": ""}
               for row in action_mismatches)

    records = profile["effectRecords"]
    assert [row["kind"] for row in records] == [
        "request", "request", "request", "request",
        "cancel", "cancel", "cancel",
        "force-deliver-retired", "force-deliver-retired", "force-deliver-retired",
        "deliver", "request", "request", "request", "deliver", "deliver", "deliver",
    ]
    assert [row["token"] for row in records if row["kind"] == "cancel"] == stale_tokens
    retired = [row for row in records if row["kind"] == "force-deliver-retired"]
    assert [row["token"] for row in retired] == stale_tokens
    for row in retired:
        assert row["outcome"] == "rejected"
        assert row["runtimeResult"] == {"accepted": False, "error": "unknown or extra effect completion"}
    stale_probes = [row for row in profile["probes"] if row.get("expectRuntimeCompletion") == "rejected-cancelled"]
    assert [row["token"] for row in stale_probes] == stale_tokens
    assert all(row["result"]["accepted"] is False and
               row["result"]["error"] == "unknown or extra effect completion" and
               row["result"]["runtimeResult"] == {"accepted": False, "error": "unknown or extra effect completion"} and
               row["tickCount"] == 10 for row in stale_probes)
    duplicates = [row for row in profile["probes"] if row.get("expectRuntimeCompletion") == "rejected-duplicate"]
    assert [row["token"] for row in duplicates] == ["sibling:g1:r4", "child:g2:r6"]
    assert all(row["result"] == {"accepted": False, "error": "effect completion already delivered"}
               for row in duplicates)
    assert [row["token"] for row in records if row["kind"] == "deliver"] == [
        "sibling:g1:r4", "grandchild:g2:r7", "child:g2:r6", "parent:g2:r5"
    ]

    detached = profile["stalePhysicalClicks"]
    assert len(detached) == 1 and detached[0]["eventIndex"] == 10
    attempts = detached[0]["attempts"]
    assert len(attempts) == 6
    detached_click_total += len(attempts)
    assert all(row["attempted"] and row["method"] == "retained-detached-HTMLElement.click" and
               row["targetBefore"]["connected"] is False and row["targetConnectedAfter"] is False for row in attempts)
    for field in ("trace", "snapshot", "callbacks", "pending", "effectRecords", "physicalHTML"):
        assert detached[0]["before"][field] == detached[0]["after"][field], f"{name} detached clicks changed {field}"

    unmount = profile["unmount"]
    assert unmount["result"] is True and unmount["pendingBefore"] == []
    assert unmount["physicalDOM"] == {"html": "", "controls": 0}
    assert unmount["rendererSnapshot"] == {"normalization": "outerHTML-v1", "html": "", "controls": []}
    browser_summaries[name] = {
        "events": len(profile["events"]),
        "ticks": len(profile["trace"]["ticks"]),
        "physicalClicks": len(profile["actions"]),
        "effectRecords": len(records),
        "detachedClickAttempts": len(attempts),
        "unmountPending": len(unmount["pendingBefore"]),
        "unmountPhysicalControls": unmount["physicalDOM"]["controls"],
        "actionMismatchIndexes": [row["index"] for row in action_mismatches],
    }
assert detached_click_total == 18

swap_profile = browser["profiles"]["swap"]
swaps = swap_profile["swaps"]
assert len(swaps) == 17
fixed_swap = next(row for row in swaps if row["reason"] == "fixture-renderer-swap-8")
initial_tokens = ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4"]
assert [row["token"] for row in fixed_swap["before"]["pending"]] == initial_tokens
assert fixed_swap["before"]["pending"] == fixed_swap["after"]["pending"]
eligible = [row for row in swaps if row["after"]["retiredCallbacks"]["eligible"]]
ineligible = [row for row in swaps if not row["after"]["retiredCallbacks"]["eligible"]]
assert len(eligible) == 16 and len(ineligible) == 1
assert ineligible[0]["after"]["retiredCallbacks"]["reason"] == "retired renderer had no user action callback to retain"
fence_count = 0
for row in swaps:
    assert row["before"]["trace"] == row["after"]["trace"]
    assert row["before"]["snapshot"] == row["after"]["snapshot"]
    assert row["before"]["pending"] == row["after"]["pending"]
    assert row["before"]["effectRecords"] == row["after"]["effectRecords"]
    assert row["after"]["oldRootDetached"] and row["after"]["oldRootEmptyDuringSwap"]
    retired_callbacks = row["after"]["retiredCallbacks"]
    if retired_callbacks["eligible"]:
        for key in ("dispatch", "stale"):
            assert retired_callbacks[key] == {
                "accepted": False,
                "dispatchId": None,
                "stale": True,
                "error": "renderer callback fenced after replacement",
            }
        fence_count += len(retired_callbacks["after"]["diagnostics"]["fencedCallbacks"]) - len(
            retired_callbacks["before"]["diagnostics"]["fencedCallbacks"])
assert fence_count == 32
assert swap_profile["callbackCounts"] == {"dispatch": 32, "stale": 16}

# The orchestration failure and missing final checker are explicit and confirmed from raw run files.
failure = read_json(matrix / "lifecycle.failed.json")
assert run["nativeCommand"][0] == "/home/runner/work/gondola/gondola/go"
assert run["failures"] and "spawnSync /home/runner/work/gondola/gondola/go ENOENT" in run["failures"][0]["message"]
assert run["stages"][[row["name"] for row in run["stages"]].index("native-go-script-cli-replay")]["status"] == "failed"
assert not (matrix / "lifecycle.native.json").exists()
assert not (matrix / "lifecycle.check.json").exists()
assert failure["errors"][1]["message"] == "full conformance check withheld because a required evidence stage failed"

result = {
    "schema": "gobi.compiled-lifecycle-xr-ci-order-review/v1",
    "decision": "accepted",
    "outcome": "mixed_change",
    "provider": {
        "artifactId": retention["artifactId"],
        "runId": retention["runId"],
        "conclusion": retention["providerConclusion"],
        "bytes": zip_bytes,
        "sha256": zip_hasher.hexdigest(),
        "chunksVerified": len(parts),
        "membersVerified": len(provider_rows),
        "sourceSHA": SOURCE_SHA,
        "sourceTree": SOURCE_TREE,
    },
    "n2Packet": {
        "reportSha256": sha_file(n2_report),
        "receiptSha256": sha_file(n2_receipt_path),
        "auditSha256": sha_file(n2_audit_path),
    },
    "sourcePins": {
        "totalStablePins": len(run["sourcePinsFinal"]),
        "immutableGitSourcePins": len(git_source_pins),
        "generatedAttemptOutputPins": len(attempt_output_pins),
        "immutable49ccMismatches": 0,
        "generatedOutputMismatches": 0,
    },
    "buildOutputPins": {"count": len(run["buildOutputPinsAfterCheck"]), "mismatches": 0},
    "nativeDirect": {
        "nativeSteps": len(native["steps"]),
        "directSteps": len(direct["steps"]),
        "initialTypedStateMatches": True,
        "eventStateViewMessageRequestedEffectComparisons": native_direct_event_comparisons,
        "cancellationOrder": [row["arg"] for row in native["steps"][9]["effects"]],
        "staleGoMessageNoOps": stale_tokens,
        "siblingRemainsPendingDuringStaleMessages": True,
        "duplicateGoMessageNoOps": ["sibling:g1:r4", "child:g2:r6"],
        "successfulReplies": [row["token"] for row in direct_records if row["kind"] == "deliver"],
    },
    "browser": {
        "profiles": browser_summaries,
        "profilesWithAllProjectionFieldsMatching": ["react", "dom", "swap"],
        "actionMetadataMismatchIndexesNotCompared": [11, 12, 13, 15, 25],
        "fullByteIdenticalTraceClaimed": False,
        "totalDetachedButtonClicks": detached_click_total,
        "swapCount": len(swaps),
        "eligibleSwaps": len(eligible),
        "callbackFenceRecords": fence_count,
        "pendingPreservedAcrossFixedSwap": initial_tokens,
        "allUnmountsAfterDrainWithEmptyDOM": True,
    },
    "conformanceBoundary": {
        "runStatus": run["status"],
        "failedStage": "native-go-script-cli-replay",
        "error": run["failures"][0]["message"],
        "fullCheckProduced": False,
        "nativeDirectBrowserFullMatrixClaimed": False,
    },
    "rawEvidence": {
        "nativeCliSha256": sha_bytes(native_bytes),
        "directSha256": sha_bytes(direct_bytes),
        "browserCaptureSha256": sha_bytes(browser_bytes),
        "checkSourceSha256": sha_bytes(check_source),
        "actionProjectionSourceExcludesAction": True,
    },
}
print(json.dumps(result, indent=2))
