#!/usr/bin/env python3
"""Independent cross-check of E-CI-ORDER claims against raw current CI records."""
from __future__ import annotations

import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
CI = ROOT / "compiled-methods/ci/2026-10-31"
ATTEMPT = CI / "extracted/compiled-methods/artifacts/attempts/attempt-20261031T044100445Z"
NODE = "/tmp/gondola-node22/node_modules/node/bin/node"
checks: list[dict] = []


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha(path: Path) -> str:
    return digest(path.read_bytes())


def read_json(path: Path):
    return json.loads(path.read_text())


def check(name: str, ok: bool, detail=None):
    checks.append({"name": name, "passed": bool(ok), **({"detail": detail} if detail is not None else {})})


def normalized(value: dict) -> dict:
    if "Parent" in value:
        return {"parent": value["Parent"]["Count"], "child": value["Child"]["Count"], "readOnly": value["ReadOnly"], "savedChild": value["SavedChild"]}
    return {"parent": value["parent"], "child": value["child"], "readOnly": value["readOnly"], "savedChild": value["savedChild"]}


def decode_wire_state(value: dict) -> dict:
    fields = {field["name"]: field["value"] for field in value["fields"]}
    parent = {field["name"]: field["value"] for field in fields["Parent"]["fields"]}
    child = {field["name"]: field["value"] for field in fields["Child"]["fields"]}
    import struct
    def f64(node):
        return struct.unpack(">d", bytes.fromhex(node["float64Bits"]))[0]
    return {"parent": f64(parent["Count"]), "child": f64(child["Count"]), "readOnly": fields["ReadOnly"]["bool"], "savedChild": f64(fields["SavedChild"])}


def expected_state(expectation: dict) -> dict:
    return normalized(expectation["state"])


def decode_tick_state(tick: dict) -> dict:
    return decode_wire_state(tick["state"])


def expected_control_disables(state: dict) -> dict:
    return {
        "parent-add": False,
        "parent-reset": state["parent"] == 0,
        "child-add": bool(state["readOnly"]),
        "child-reset": bool(state["readOnly"] or state["child"] == 0),
        "readonly-toggle": False,
        "capture-child": False,
        "publish-saved": False,
    }


receipt = read_json(CI / "coordination/receipts/E-CI-ORDER.json")
report = CI / "coordination/reports/E-CI-ORDER.md"
report_bytes = report.read_bytes()
check("receipt_schema_and_decision", receipt.get("job_id") == "E-CI-ORDER" and receipt.get("worker") == "N6" and receipt.get("outcome") == "confirmed_reuse" and receipt.get("status") == "passed_current_push_primary")
check("author_report_hash", digest(report_bytes) == receipt["report"]["sha256"], digest(report_bytes))

source = receipt["source"]
primary = receipt["primary_ci"]
workflow = primary["workflow"]
metadata = read_json(CI / "primary-artifact-metadata.json")
publication = read_json(CI / "publication-current.json")
check("primary_metadata_publication_identity", metadata["workflow_run"]["id"] == workflow["runId"] == 41169518187 and metadata["workflow_run"]["head_sha"] == source["commit"] == publication["sourceCommit"] == "6b49cc0bd4c9512a041f723c86b632ec506afd9d" and publication["sourceTree"] == source["tree"] == "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81")
check("primary_artifact_metadata_hash", file_sha(CI / "primary-artifact-metadata.json") == primary["artifact"]["metadataSha256"])
check("terminal_snapshot_hash", file_sha(CI / workflow["snapshotPath"].removeprefix("compiled-methods/ci/2026-10-31/")) == workflow["snapshotSha256"])
snapshot = read_json(CI / workflow["snapshotPath"].removeprefix("compiled-methods/ci/2026-10-31/"))
run = next((x for x in snapshot["runs"] if x["run_id"] == workflow["runId"]), None)
job = next((x for x in (run or {}).get("structuredContent", {}).get("jobs", []) if x["id"] == workflow["jobId"]), None)
check("terminal_job_success", snapshot["sourceSha"] == source["commit"] and snapshot["sourceTree"] == source["tree"] and job is not None and job["name"] == "compiled-methods" and job["status"] == "completed" and job["conclusion"] == "success" and len(job["steps"]) == workflow["successfulSteps"] and all(x["status"] == "completed" and x["conclusion"] == "success" for x in job["steps"]))
job_log = CI / workflow["jobLogPath"].removeprefix("compiled-methods/ci/2026-10-31/")
job_log_bytes = job_log.read_bytes()
job_log_text = job_log_bytes.decode("utf-8-sig", errors="replace")
check("terminal_job_log_identity_and_upload", digest(job_log_bytes) == workflow["jobLogSha256"] and "compiled-methods: passed (full)" in job_log_text and str(primary["artifact"]["id"]) in job_log_text and primary["artifact"]["sha256"] in job_log_text)

archive = CI / "original.zip"
retention = read_json(CI / "artifact-retention.json")
archive_bytes = archive.read_bytes()
chunks = sorted(CI.glob("primary-artifact.zip.part-*"))
joined = b"".join(path.read_bytes() for path in chunks)
check("artifact_provider_zip_and_chunks", len(archive_bytes) == primary["artifact"]["bytes"] and digest(archive_bytes) == primary["artifact"]["sha256"] and digest(archive_bytes) == metadata["digest"].removeprefix("sha256:") and len(chunks) == 3 and joined == archive_bytes and digest(joined) == digest(archive_bytes))
member_map = {item["path"]: item for item in retention["members"]}
zip_ok = []
with zipfile.ZipFile(archive) as zf:
    names = set(zf.namelist())
    crc = zf.testzip()
    for name, item in member_map.items():
        data = zf.read(name)
        target = CI / "extracted" / name
        zip_ok.append(len(data) == item["bytes"] and digest(data) == item["sha256"] and target.is_file() and target.stat().st_size == item["bytes"] and file_sha(target) == item["sha256"])
check("all_artifact_members_crc_and_extraction", crc is None and len(member_map) == 968 and names == set(member_map) and len(zip_ok) == 968 and all(zip_ok) and sum(x["bytes"] for x in member_map.values()) == primary["artifact"]["uncompressedBytes"])

execution_path = ATTEMPT / "execution.json"
execution = read_json(execution_path)
check("attempt_run_and_method_matrix", file_sha(execution_path) == primary["attempt"]["executionSha256"] and execution["status"] == "passed" and execution["mode"] == "full" and execution["methodMatrix"]["status"] == "matched" and execution["sourcePinsMatch"] is True)
source_before, source_after = execution["sourceBefore"], execution["sourceAfter"]
source_results = []
for item in source_before:
    path = ROOT / item["path"]
    source_results.append(path.is_file() and path.stat().st_size == item.get("bytes", path.stat().st_size) and file_sha(path) == item["sha256"])
check("all_137_workflow_source_pins", len(source_before) == len(source_after) == 137 and source_before == source_after and all(source_results), {"checked": len(source_results), "passed": sum(source_results)})

capture_path = ATTEMPT / "matrix/methods.browser.capture.json"
browser_copy_path = ATTEMPT / "matrix/methods.browser.json"
capture_bytes = capture_path.read_bytes()
capture = json.loads(capture_bytes)
check("capture_artifact_hash_and_duplicate", digest(capture_bytes) == primary["browser"]["captureSha256"] and browser_copy_path.read_bytes() == capture_bytes)
fixture = read_json(ROOT / "compiled-methods/conformance/fixtures/methods.json")
expectations = fixture["expectations"]
expected_states = [{"parent": 0, "child": 0, "readOnly": False, "savedChild": 0}] + [expected_state(x) for x in expectations]
disabled_indexes = [i for i, item in enumerate(expectations) if item["message"] is None]
check("fixture_and_suppressed_index_set", len(fixture["actions"]) == len(expectations) == 18 and disabled_indexes == [6, 9, 10, 17])
profiles = capture["profiles"]
profile_check_summary = {}
expected_keys = {"parent-add", "parent-reset", "child-add", "child-reset", "readonly-toggle", "capture-child", "publish-saved"}
for name in ("react", "dom", "swap"):
    profile = profiles[name]
    pchecks = []
    def pc(tag, ok): pchecks.append((tag, bool(ok)))
    trace_ticks = profile["trace"]["ticks"]
    pc("18 actions +19 ticks", len(profile["actions"]) == 18 and len(trace_ticks) == 19)
    pc("renderer label", profile["backend"] == name)
    pc("dispatch/stale totals", profile["callbackCounts"] == {"dispatch": 14, "stale": (18 if name == "swap" else 0)})
    pc("19 oracle and physical snapshots", len(profile["domOracle"]) == len(profile["physicalDOMSnapshots"]) == 19)
    for tick_index, state in enumerate(expected_states):
        try:
            pc(f"tick {tick_index} typed state", decode_tick_state(trace_ticks[tick_index]) == state)
            oracle = profile["domOracle"][tick_index]
            physical = profile["physicalDOMSnapshots"][tick_index]
            pc(f"tick {tick_index} oracle/physical equal", oracle["snapshot"] == physical["snapshot"])
            pc(f"tick {tick_index} oracle state", normalized(oracle["state"]) == state)
            pc(f"tick {tick_index} physical state", normalized(physical["state"]) == state)
            controls = physical["snapshot"]["controls"]
            controls_by_key = {c["key"]: c for c in controls}
            disables = expected_control_disables(state)
            pc(f"tick {tick_index} keyed control shape", set(controls_by_key) == expected_keys and len(controls) == 7)
            pc(f"tick {tick_index} disabled states", all(controls_by_key[k]["disabled"] is v for k, v in disables.items()))
        except Exception:
            pc(f"tick {tick_index} state/snapshot records", False)
    for i, (action, expected_action, expectation) in enumerate(zip(profile["actions"], fixture["actions"], expectations)):
        message = expectation["message"]
        suppressed = message is None
        expected_id = expectation["dispatchId"]
        expected_wire_message = None if suppressed else {"name": message["name"], "arg": message["arg"]}
        expected_path_action = {"path": expected_action["path"], "event": expected_action["event"], "value": expected_action["value"]}
        tick = action["tick"]
        wire_tick = trace_ticks[i+1]
        pc(f"action {i} fixture intent", action["action"] == expected_action and action["expectedMessage"] == expected_wire_message)
        pc(f"action {i} tick order", action["beforeTickCount"] == i+1 and action["tickIndex"] == i+1 and action["afterTickCount"] == i+2)
        pc(f"action {i} observed target", action["target"]["connected"] is True and action["target"]["disabled"] is suppressed and action["target"]["value"] == "" and action["physicalClick"]["method"] == "HTMLElement.click" and action["physicalClick"]["attempted"] is True)
        pc(f"action {i} record/trace tick", tick.get("message") == expected_wire_message and tick.get("dispatchId") == expected_id and tick.get("state") == action["physicalDOMSnapshot"]["state"] and tick.get("message") == wire_tick.get("message") and tick.get("dispatchId") == wire_tick.get("dispatchId"))
        if suppressed:
            pc(f"action {i} disabled physical suppression", action["physicalClick"].get("disabled") is True and action["physicalClick"].get("traceTicksUnchanged") is True and action["observed"] is None and action["suppressedDispatch"] == {"accepted": True, "dispatchId": None, "error": None} and tick.get("message") is None and tick.get("dispatchId") is None)
        else:
            dispatch_number = int(expected_id.split("-")[-1])
            observed = action["observed"] or {}
            expected_backend = profile["rendererSequence"][i] if name == "swap" else name
            pc(f"action {i} enabled callback", observed.get("action") == expected_path_action and observed.get("message") == {"Name": message["name"], "Arg": message["arg"]} and observed.get("backend") == expected_backend and action["suppressedDispatch"] is None and action["beforeCallbacks"].get("dispatch") == dispatch_number-1 and action["afterCallbacks"].get("dispatch") == dispatch_number and tick.get("dispatchId") == expected_id)
        pc(f"action {i} state and view snapshots", normalized(action["tick"]["state"]) == expected_states[i+1] and action["domOracle"]["state"] == expected_states[i+1] and action["physicalDOMSnapshot"]["state"] == expected_states[i+1] and action["domOracle"]["snapshot"] == action["physicalDOMSnapshot"]["snapshot"])
    pc("capture top page errors/wasm clear", profile["pageErrors"] == [] and profile["noWasm"]["wasmRequests"] == [] and profile["noWasm"]["wasmAPIAttempts"] == [] and profile["noWasm"]["apiAttempts"] == [])
    unmount = profile["unmount"]
    pc("unmount physical/renderer cleanup", unmount["before"]["controlCount"] == 7 and bool(unmount["before"]["html"]) and unmount["physicalDOM"]["html"] == "" and unmount["physicalDOM"]["controls"] == 0 and unmount["rendererSnapshot"]["html"] == "" and unmount["rendererSnapshot"]["controls"] == [])
    if name == "swap":
        transitions = capture["swapTransitions"]
        swaps, retired = profile["swaps"], profile["retiredCallbacks"]
        pc("swap schedule/transitions/count", capture["swapSchedule"]["initialBackend"] == "react" and transitions == [{"afterActionIndex": i, "to": "dom" if i % 2 == 0 else "react"} for i in range(18)] and len(swaps) == len(retired) == 18)
        for i, (swap, stale) in enumerate(zip(swaps, retired)):
            old_backend = "react" if i % 2 == 0 else "dom"
            next_backend = "dom" if i % 2 == 0 else "react"
            action = profile["actions"][i]
            new_snapshot = swap["newSnapshot"]
            expected = expected_states[i+1]
            pc(f"swap {i} boundary and empty old root", swap["actionIndex"] == i and swap["afterActionIndex"] == i and swap["from"] == old_backend and swap["to"] == next_backend and swap["beforeTickCount"] == swap["afterTickCount"] == i+2 and swap["stateUnchanged"] is True and swap["viewUnchanged"] is True and swap["oldRootEmptyAfterUnmount"] is True and swap["oldRootDetached"] is True and swap["newRootDistinct"] is True and swap["oldRootHTMLBefore"] == action["physicalDOMSnapshot"]["snapshot"]["html"] and new_snapshot["oracle"]["snapshot"]["html"] == new_snapshot["physical"]["snapshot"]["html"] == swap["oldRootHTMLBefore"] and normalized(new_snapshot["oracle"]["state"]) == normalized(new_snapshot["physical"]["state"]) == expected)
            focus = swap.get("focus") or {}
            pc(f"swap {i} focus claim bounded", focus.get("captured") is False and focus.get("restored") is False and focus.get("fixtureHasInputControls") is False)
            fence = stale.get("runtimeFence") or {}
            observation = stale.get("rendererObservation") or {}
            pc(f"swap {i} retired callback after detach", stale.get("id") == f"retired-{i+1}" and stale.get("captured") is True and stale.get("originallyConnected") is True and stale.get("detachedAtInvocation") is True and stale.get("invoked") is True and stale.get("rendererStaleCallbackObserved") is True and stale.get("traceTicksBefore") == stale.get("traceTicksAfter") == i+2 and stale.get("traceTicksUnchanged") is True and observation.get("backend") == old_backend and isinstance(observation.get("renderEpoch"), int) and observation.get("renderEpoch") > 0 and fence.get("kind") == "stale" and fence.get("generation") == i+1 and fence.get("renderEpoch") == observation.get("renderEpoch") and stale.get("runtimeFenceCountBefore") == i and stale.get("runtimeFenceCountAfter") == i+1 and swap["retiredCallback"] == stale)
        pc("renderer alternation sequence", profile["rendererSequence"] == ["react", "dom"] * 9 + ["react"])
    profile_check_summary[name] = {"passed": sum(ok for _, ok in pchecks), "checks": len(pchecks), "failed": [tag for tag, ok in pchecks if not ok]}
    check(f"raw_profile_{name}", all(ok for _, ok in pchecks), profile_check_summary[name])

# Recompute the capture's Node JSON-stringify trace hashes independently.
node_source = 'import {readFile} from "node:fs/promises"; import {createHash} from "node:crypto"; const c=JSON.parse(await readFile(process.argv[1],"utf8")); process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(c.profiles).map(([k,p])=>[k,createHash("sha256").update(JSON.stringify(p.trace)).digest("hex")]))));'
node_cmd = [NODE, "--input-type=module", "-e", node_source, str(capture_path)]
node_result = subprocess.run(node_cmd, capture_output=True, check=False, timeout=30)
node_hashes = json.loads(node_result.stdout) if node_result.returncode == 0 else {}
check("recomputed_browser_trace_hashes", node_result.returncode == 0 and node_hashes == capture["traceSha256"] and len(set(node_hashes.values())) == 1, {"command": node_cmd, "exit_code": node_result.returncode, "stderr_sha256": digest(node_result.stderr), "hashes": node_hashes})

native_path = ATTEMPT / "matrix/methods.native.json"
direct_path = ATTEMPT / "matrix/methods.direct.json"
native_bytes, direct_bytes = native_path.read_bytes(), direct_path.read_bytes()
check("native_and_direct_trace_files_equal", native_bytes == direct_bytes and digest(native_bytes) == receipt["primary_ci"]["traceFiles"]["nativeSha256"] == receipt["primary_ci"]["traceFiles"]["directSha256"])

replica = read_json(CI / "lanes/go/review-order/replica-order-audit.json")
check("author_checker_reproduction", replica["auditStatus"] == "passed" and replica["outcome"] == "confirmed_reuse" and replica["checkCount"] == replica["passedCheckCount"] == 677 and replica["failedCheckCount"] == 0 and replica["profileCounts"] == {"react":{"intents":18,"dispatches":14,"suppressed":4},"dom":{"intents":18,"dispatches":14,"suppressed":4},"swap":{"intents":18,"dispatches":14,"suppressed":4}})

primary_repro = read_json(CI / "lanes/go/review-order/replica-primary-provenance.json")
check("primary_provenance_checker_reproduction", primary_repro["status"] == "passed" and primary_repro["source"]["gitHead"] == source["commit"] and primary_repro["source"]["gitTree"] == source["tree"] and primary_repro["workflow"]["conclusion"] == "success" and primary_repro["artifact"]["memberCount"] == 968 and primary_repro["attempt"]["sourcePinCount"] == 137)

report_text = report_bytes.decode("utf-8")
check("report_claim_boundaries", "no focus or selection claim" in report_text and "no effect-completion claim" in report_text and "does not claim manager/session ownership or cancellation" in report_text and "does not claim that all current workflows are complete" in report_text)

result = {
    "schema": "gobi.xr-ci-order-independent-review/v1",
    "job_id": "XR-CI-ORDER",
    "worker": "N1",
    "decision": "accepted" if all(x["passed"] for x in checks) else "amend",
    "check_count": len(checks),
    "passed_count": sum(1 for x in checks if x["passed"]),
    "failed_count": sum(1 for x in checks if not x["passed"]),
    "profile_checks": profile_check_summary,
    "browser_trace_hashes": node_hashes,
    "inputs": {
        "author_report_sha256": digest(report_bytes),
        "author_receipt_sha256": file_sha(CI / "coordination/receipts/E-CI-ORDER.json"),
        "author_order_audit_sha256": file_sha(CI / "lanes/order/primary-order-audit.json"),
        "capture_sha256": file_sha(capture_path),
        "artifact_zip_sha256": file_sha(archive),
        "replica_order_audit_sha256": file_sha(CI / "lanes/go/review-order/replica-order-audit.json"),
        "replica_provenance_sha256": file_sha(CI / "lanes/go/review-order/replica-primary-provenance.json"),
    },
    "checks": checks,
}
out = CI / "lanes/go/review-order/independent-raw-review.json"
out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
print(json.dumps({"path": str(out.relative_to(ROOT)), "decision": result["decision"], "checks": result["check_count"], "passed": result["passed_count"], "failed": result["failed_count"], "profiles": profile_check_summary, "trace_hashes_match": checks[-3]["passed"]}, indent=2))
