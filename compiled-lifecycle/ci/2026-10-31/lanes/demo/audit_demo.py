#!/usr/bin/env python3
"""Verify the managed CI lifecycle HTTP demo evidence without altering source."""

from __future__ import annotations

import hashlib
import io
import json
import math
import struct
import zipfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[5]
CI = ROOT / "compiled-lifecycle/ci/2026-10-31"
EXTRACTED = CI / "extracted"
ATTEMPT_ID = "attempt-20261031T065420569Z"
ATTEMPT = EXTRACTED / "compiled-lifecycle/builds/attempts" / ATTEMPT_ID
PROVIDER = CI / "provider/failed-41178420647"
RUN_FILE = CI / "lanes/evidence/run-push-41178420647-final.json"
ARTIFACTS_FILE = CI / "lanes/evidence/artifacts-push-41178420647.json"
ZIP_PARTS_DIR = PROVIDER


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_hash(path: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            h.update(chunk)
    return size, h.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(ok: bool, message: str) -> None:
    if not ok:
        raise AssertionError(message)


def decode_value(value):
    kind = value["kind"]
    if kind == "struct":
        return {field["name"]: decode_value(field["value"]) for field in value["fields"]}
    if kind == "array" or kind == "slice":
        return [decode_value(item) for item in value.get("elements", [])]
    if kind == "string":
        return value["string"]
    if kind == "bool":
        return value["bool"]
    if kind in ("uint", "int"):
        return int(value["integer"])
    if kind == "float64":
        return struct.unpack(">d", bytes.fromhex(value["float64Bits"]))[0]
    if kind == "nil":
        return None
    raise AssertionError(f"unsupported compiled trace Value kind {kind}")


def effect_signature(effects):
    return [{key: item.get(key, "") for key in ("kind", "name", "arg", "reply")} for item in effects]


def safe_zip_name(name: str) -> bool:
    if not name or name.startswith("/") or "\\" in name:
        return False
    path = PurePosixPath(name.rstrip("/"))
    return all(part not in ("", ".", "..") for part in path.parts) and str(path) == name.rstrip("/")


def main() -> None:
    provider = read_json(CI / "provider-download.json")
    retention = read_json(PROVIDER / "retention.json")
    run = read_json(RUN_FILE)
    artifacts_response = read_json(ARTIFACTS_FILE)
    build_receipt = read_json(EXTRACTED / "compiled-lifecycle/coordination/receipts/E-BUILD.json")
    build_report = EXTRACTED / "compiled-lifecycle/coordination/reports/E-BUILD.md"
    build_report_hash = file_hash(build_report)[1]
    execution = read_json(ATTEMPT / "execution.json")
    smoke = read_json(ATTEMPT / "demo/demo-smoke.json")
    demo_build = read_json(ATTEMPT / "demo/site/demo-build.json")
    react_manifest = read_json(ATTEMPT / "react/output/buildmanifest.json")
    dom_manifest = read_json(ATTEMPT / "dom/output/buildmanifest.json")
    react_app_ir = read_json(ATTEMPT / "react/output/apps/lifecycle-7e6575d90707/app-ir.json")
    dom_app_ir = read_json(ATTEMPT / "dom/output/apps/lifecycle-7e6575d90707/app-ir.json")
    native = read_json(ATTEMPT / "matrix/native-cli.json")
    fixture = read_json(ROOT / "fixtures/compiled/lifecycle/scenario.json")

    require(run["id"] == 41178420647 and run["head_sha"] == "49cc2b96c8817a47319d5b7bd484184a22fa984b",
            "provider run identity/source")
    require(run["status"] == "completed" and run["conclusion"] == "failure", "managed run conclusion")
    artifact = next(item for item in artifacts_response["artifacts"] if item["id"] == 13034915662)
    require(artifact["workflow_run"]["id"] == 41178420647, "artifact/run binding")
    require(artifact["workflow_run"]["head_sha"] == run["head_sha"], "artifact/source binding")
    require(artifact["size_in_bytes"] == 47_035_803, "provider artifact byte size")
    require(artifact["digest"] == "sha256:6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4",
            "provider artifact digest")
    require(provider["artifactId"] == 13034915662 and provider["run"] == 41178420647, "download metadata identity")
    require(provider["providerRunConclusion"] == "failure", "download metadata run conclusion")
    require(provider["members"] == 1272 and provider["uncompressedBytes"] == 412_381_547, "provider ZIP counts")

    parts = sorted(ZIP_PARTS_DIR.glob("artifact.zip.part-*"))
    require(len(parts) == len(retention["chunks"]) == 12, "artifact ZIP chunk count")
    archive_bytes = bytearray()
    chunk_checks = []
    for path, record in zip(parts, retention["chunks"], strict=True):
        data = path.read_bytes()
        require(path.as_posix() == str(ROOT / record["path"]), f"chunk ordering/path: {path}")
        require(len(data) == record["bytes"], f"chunk length: {path.name}")
        require(sha256(data) == record["sha256"], f"chunk hash: {path.name}")
        archive_bytes.extend(data)
        chunk_checks.append({"path": record["path"], "bytes": len(data), "sha256": record["sha256"]})
    archive_hash = sha256(archive_bytes)
    require(len(archive_bytes) == provider["bytes"] == retention["bytes"] == artifact["size_in_bytes"],
            "reassembled artifact byte count")
    require(archive_hash == provider["sha256"] == retention["sha256"] == artifact["digest"].removeprefix("sha256:"),
            "reassembled artifact SHA-256")

    with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
        infos = zf.infolist()
        names = [item.filename for item in infos]
        require(len(infos) == 1272 and len(names) == len(set(names)), "ZIP member count/uniqueness")
        require(sum(item.file_size for item in infos) == 412_381_547, "ZIP uncompressed size")
        require(all(safe_zip_name(name) for name in names), "ZIP path safety")
        require(zf.testzip() is None, "ZIP CRC verification")

        demo_relative = f"compiled-lifecycle/builds/attempts/{ATTEMPT_ID}/"
        selected_paths = [
            demo_relative + "execution.json",
            demo_relative + "demo/demo-smoke.json",
            demo_relative + "demo/demo.png",
            demo_relative + "demo/site/demo-build.json",
            demo_relative + "demo/site/demo.bundle.mjs",
            demo_relative + "demo/site/demo.css",
            demo_relative + "demo/site/entry.mjs",
            demo_relative + "demo/site/index.html",
            demo_relative + "react/output/apps/lifecycle-7e6575d90707/app-ir.json",
            demo_relative + "react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs",
            demo_relative + "react/output/apps/lifecycle-7e6575d90707/encoder.mjs",
            demo_relative + "dom/output/apps/lifecycle-7e6575d90707/app-ir.json",
            demo_relative + "dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs",
            demo_relative + "matrix/native-cli.json",
            demo_relative + "logs/http-demo-smoke.stdout.log",
            demo_relative + "logs/lifecycle-conformance.stdout.log",
        ]
        zipped_selected = []
        for member_name in selected_paths:
            content = zf.read(member_name)
            extracted = EXTRACTED / member_name
            require(extracted.is_file(), f"extracted selected artifact missing: {member_name}")
            size, extracted_hash = file_hash(extracted)
            require(len(content) == size and sha256(content) == extracted_hash,
                    f"ZIP/extracted selected content mismatch: {member_name}")
            zipped_selected.append({"path": member_name, "bytes": size, "sha256": extracted_hash})

    require(build_receipt["status"] == "failed" and build_receipt["mode"] == "full", "E-BUILD receipt status")
    require(build_receipt["report"]["sha256"] == build_report_hash, "E-BUILD report receipt hash")
    require(execution["status"] == "failed" and execution["mode"] == "full", "lifecycle run status")
    require(execution["sourcePinsMatch"] is True, "run source pins matched before/after")
    require(execution["sourceBefore"] == execution["sourceAfter"], "run source snapshot equality")
    attempt_failure = [item for item in execution["failures"] if item.get("name") == "lifecycle-conformance"]
    require(len(attempt_failure) == 1, "single lifecycle-conformance failure record")
    lifecycle_failure = read_json(ATTEMPT / "matrix/lifecycle.failed.json")
    error_text = " ".join(item["message"] for item in lifecycle_failure["errors"])
    require("spawnSync /home/runner/work/gondola/gondola/go ENOENT" in error_text,
            "global failure is the recorded native Go executable spawn error")
    require(any(stage["name"] == "http-demo" and stage["status"] == "passed" for stage in execution["stages"]),
            "HTTP demo stage passed despite matrix failure")
    require(any(stage["name"] == "native-direct-browser-matrix" and stage["status"] == "failed"
                for stage in execution["stages"]), "native/direct/browser matrix stage failed")
    require(execution["demoOutputPinsBeforeSmoke"] == execution["demoOutputPinsAfterSmoke"],
            "demo output pins stable across smoke")

    # Check build records bind the live browser bundle to the fresh GoScript module and current source.
    component_id = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
    require(demo_build["componentId"] == component_id and demo_build["packagePath"] == component_id,
            "demo build package/component identity")
    require(react_manifest["apps"][0]["componentId"] == component_id, "React build component ID")
    require(dom_manifest["apps"][0]["componentId"] == component_id, "DOM build component ID")
    require(react_app_ir == dom_app_ir, "React/DOM AppIR parity")
    require(react_app_ir["components"][0]["id"] == component_id, "AppIR component ID")
    require("effect.request-reply" in react_app_ir["components"][0]["capabilities"],
            "AppIR request/reply capability")
    require("view.node" in react_app_ir["components"][0]["capabilities"], "AppIR view capability")
    for label, path, expected in [
        ("React AppIR", ATTEMPT / "react/output/apps/lifecycle-7e6575d90707/app-ir.json", demo_build["appIR"]),
        ("React compiled module", ATTEMPT / "react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs", demo_build["module"]),
        ("React encoder", ATTEMPT / "react/output/apps/lifecycle-7e6575d90707/encoder.mjs", demo_build["encoder"]),
    ]:
        size, file_digest = file_hash(path)
        require(size == expected["bytes"] and file_digest == expected["sha256"], f"{label} demo manifest binding")
    require("compiled-lifecycle/builds/attempts/" + ATTEMPT_ID +
            "/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs" in demo_build["bundleInputs"],
            "browser bundle includes compiled lifecycle Go module")
    require("compiled-lifecycle/builds/attempts/" + ATTEMPT_ID +
            "/react/output/apps/lifecycle-7e6575d90707/encoder.mjs" in demo_build["bundleInputs"],
            "browser bundle includes generated Go state encoder")
    require("compiled-frontend/frontend/dom/renderer.mjs" in demo_build["bundleInputs"] and
            "compiled-frontend/frontend/react/renderer.mjs" in demo_build["bundleInputs"],
            "browser bundle includes existing DOM and React renderers")
    source_before = {item["path"]: item for item in execution["sourceBefore"]}
    source_after = {item["path"]: item for item in execution["sourceAfter"]}
    source_files = [
        "compiled-lifecycle/demo/app.mjs",
        "compiled-lifecycle/demo/build.mjs",
        "compiled-lifecycle/demo/smoke.mjs",
        "compiled-lifecycle/runtime/runtime.mjs",
        "compiled-frontend/frontend/runtime/runtime.mjs",
        "fixtures/compiled/lifecycle/app.go",
        "fixtures/compiled/lifecycle/view.go",
        "fixtures/compiled/lifecycle/scenario.json",
    ]
    selected_source_pins = []
    for name in source_files:
        require(name in source_before and name in source_after, f"required source pin missing: {name}")
        require(source_before[name] == source_after[name], f"source changed during run: {name}")
        path = ROOT / name
        size, source_hash = file_hash(path)
        require(size == source_before[name]["bytes"] and source_hash == source_before[name]["sha256"],
                f"current source differs from managed run pin: {name}")
        selected_source_pins.append({"path": name, "bytes": size, "sha256": source_hash})
    require(source_before["compiled-lifecycle/runtime/runtime.mjs"]["sha256"] ==
            "9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed",
            "managed CI run used current R-UNMOUNT wrapper, not old preintegration wrapper")

    require(smoke["schema"] == "gobi.compiled-lifecycle-http-smoke/v1" and smoke["status"] == "passed",
            "HTTP smoke status/schema")
    require(len(smoke["checks"]) == 12 and smoke["rendererSwaps"] == 4 and smoke["finalTicks"] == 24,
            "HTTP smoke check/tick/swap counts")
    require(smoke["finalBackend"] == "dom" and smoke["pendingAtEnd"] == [], "final renderer and pending effects")
    require(smoke["failures"] == [] and smoke["browserErrors"] == [] and smoke["consoleErrors"] == [] and
            smoke["failedRequests"] == [] and smoke["wasmRequests"] == [], "browser/network error counts")
    require(smoke["noWasm"]["wasmRequests"] == [] and smoke["noWasm"]["wasmAPIAttempts"] == [],
            "no-WASM probe")
    require(smoke["requests"] == [
        {"path": "/", "status": 200, "bytes": 4546},
        {"path": "/demo.css", "status": 200, "bytes": 6573},
        {"path": "/demo.bundle.mjs", "status": 200, "bytes": 1837935},
    ], "actual HTTP asset responses")

    ticks = smoke["finalTrace"]["ticks"]
    require(len(ticks) == 24 and ticks[0]["index"] == 0, "raw trace tick count and Init")
    require(decode_value(ticks[0]["state"]) == native["initialState"], "browser Go Init state matches native CLI")
    duplicate_steps = [step for step in native["steps"] if step["kind"] == "go-message" and
                       step.get("outcome") == "duplicate-no-op"]
    require([step["index"] for step in duplicate_steps] == [15, 25], "native duplicate no-op event indices")
    go_steps = [step for step in native["steps"] if step["kind"] != "renderer-swap" and
                not (step["kind"] == "go-message" and step.get("outcome") == "duplicate-no-op")]
    require(len(go_steps) == 23 and len(ticks) == len(go_steps) + 1,
            "native/browsing schedule mapping excludes one renderer swap and two host duplicate probes")
    for offset, step in enumerate(go_steps, start=1):
        tick = ticks[offset]
        require(tick["index"] == offset, f"browser tick index {offset}")
        require(tick["message"] == step["message"], f"Go message at native step {step['index']}")
        require(decode_value(tick["state"]) == step["state"], f"full Go state at native step {step['index']}")
        require(tick["view"]["tree"] == step["view"], f"Go View tree at native step {step['index']}")
        require(effect_signature([item["effect"] for item in tick.get("requestedEffects", [])]) ==
                effect_signature(step.get("effects", [])), f"Go-emitted effects at native step {step['index']}")
        if step["kind"] == "click":
            fixture_event = fixture["events"][step["index"]]
            require(tick["action"] == {key: fixture_event[key] for key in ("path", "event", "value")},
                    f"physical action path at native step {step['index']}")
        if step["kind"] == "effect-reply":
            request_tick = next(prior for prior in ticks[:offset] if any(
                entry.get("effect", {}).get("arg") == step["message"].get("arg")
                for entry in prior.get("requestedEffects", [])))
            correlation = [{"dispatchId": request_tick["dispatchId"], "effectIndex": 0,
                            "message": step["message"]}]
            require(tick.get("completedEffects") == correlation,
                    f"completion correlation at native step {step['index']}")
        else:
            require(tick.get("completedEffects", []) == [], f"unexpected completion at native step {step['index']}")

    remove_state = decode_value(ticks[9]["state"])
    remount_state = decode_value(ticks[10]["state"])
    for node in ("Parent", "Child", "Grandchild"):
        require(remove_state[node]["Alive"] is False and remove_state[node]["Pending"] is False and
                remove_state[node]["Token"] == "", f"subtree removal state for {node}")
    require(remove_state["Sibling"]["Alive"] is True and remove_state["Sibling"]["Pending"] is True and
            remove_state["Sibling"]["Token"] == "sibling:g1:r4", "sibling survives pending at removal")
    for node, token in (("Parent", "parent:g2:r5"), ("Child", "child:g2:r6"),
                        ("Grandchild", "grandchild:g2:r7")):
        require(remount_state[node]["Alive"] is True and remount_state[node]["Generation"] == 2 and
                remount_state[node]["Pending"] is False and remount_state[node]["Token"] == "",
                f"generation-2 remount state for {node}/{token}")
    require(remount_state["Sibling"]["Pending"] is True, "sibling stays pending on remount")
    for stale_tick in ticks[11:14]:
        require(stale_tick["state"] == ticks[10]["state"], "stale Go completion changed remounted state")

    effect_records = smoke["effectRecords"]
    request_records = [item["token"] for item in effect_records if item["kind"] == "request"]
    cancel_records = [item["token"] for item in effect_records if item["kind"] == "cancel"]
    retired_records = [item for item in effect_records if item["kind"] == "force-deliver-retired"]
    accepted_deliveries = [item["token"] for item in effect_records if item["kind"] == "deliver" and
                           item["outcome"] == "accepted"]
    rejected_deliveries = [item["token"] for item in effect_records if item["kind"] == "deliver" and
                           item["outcome"] == "rejected"]
    require(request_records == ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
                                "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7"], "Go request order/tokens")
    require(cancel_records == ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], "child-first cancellation order")
    require([item["token"] for item in retired_records] == cancel_records and
            all(item["outcome"] == "rejected" for item in retired_records), "retired callbacks rejected")
    require(accepted_deliveries == ["sibling:g1:r4", "grandchild:g2:r7", "child:g2:r6", "parent:g2:r5"],
            "accepted completion order")
    require(rejected_deliveries == ["sibling:g1:r4", "child:g2:r6"], "duplicate replies rejected")
    require(len(effect_records) == 19, "ordered effect host record count")
    require([item["token"] for item in smoke["retiredReplyProbeOutcomes"]] == cancel_records and
            all(item["outcome"] == "rejected" for item in smoke["retiredReplyProbeOutcomes"]),
            "retired callback probes")
    require(all(item["stateUnchanged"] for item in smoke["goMessageProbeResults"]), "stale Go messages are no-ops")
    final = smoke["finalState"]
    require(final["parent"]["reply"] == "parent:g2:r5" and final["child"]["reply"] == "child:g2:r6" and
            final["grandchild"]["reply"] == "grandchild:g2:r7" and final["sibling"]["reply"] == "sibling:g1:r4",
            "final Go state replies")
    controls = smoke["finalDOM"]["controls"]
    require([item["key"] for item in controls if item["disabled"]] == [
        "parent-request", "child-request", "grandchild-request", "sibling-request", "parent-remount"],
        "final physical disabled controls")
    require(all(not item["disabled"] for item in controls if item["key"].endswith("-add")),
            "final Add controls remain enabled")
    require(next(item for item in controls if item["key"] == "parent-remove")["disabled"] is False,
            "final parent removal control remains enabled")

    source_pin_map = {item["path"]: item for item in execution["sourceBefore"]}
    demo_source_pins = {path: digest for path, digest in demo_build["sourcePins"].items()}
    for path, digest in demo_source_pins.items():
        require(source_pin_map[path]["sha256"] == digest, f"demo build source pin vs execution snapshot: {path}")
    demo_asset_pins = []
    for rel, expected_bytes, expected_hash in [
        ("demo/demo-smoke.json", 853539, None),
        ("demo/demo.png", 326350, None),
        ("demo/site/demo-build.json", 2517, None),
        ("demo/site/demo.bundle.mjs", 1837935, None),
        ("demo/site/demo.css", 6573, None),
        ("demo/site/entry.mjs", 553, None),
        ("demo/site/index.html", 4546, None),
    ]:
        path = ATTEMPT / rel
        size, digest = file_hash(path)
        require(size == expected_bytes, f"demo artifact byte count: {rel}")
        if expected_hash:
            require(digest == expected_hash, f"demo artifact hash: {rel}")
        demo_asset_pins.append({"path": path.relative_to(EXTRACTED).as_posix(), "bytes": size, "sha256": digest})
    require(isinstance(smoke["browserVersion"], str) and bool(smoke["browserVersion"]),
            "managed browser version captured")

    audit = {
        "schema": "gobi.compiled-lifecycle-ci-demo-audit/v1",
        "decision": "accepted",
        "outcome": "confirmed_reuse",
        "acceptance_scope": "managed CI HTTP demo substep in artifact 13034915662 only; overall workflow remains failed",
        "managed_run": {"id": run["id"], "status": run["status"], "conclusion": run["conclusion"],
                        "head_sha": run["head_sha"], "attempt": run["run_attempt"]},
        "artifact": {"id": artifact["id"], "bytes": len(archive_bytes), "sha256": archive_hash,
                     "members": len(names), "uncompressed_bytes": sum(item.file_size for item in infos),
                     "crc": "all passed", "chunk_checks": chunk_checks},
        "global_lifecycle_status": {
            "run_status": execution["status"],
            "matrix_stage": "failed",
            "demo_stage": "passed",
            "failure": error_text,
            "required_conformance_evidence": "withheld because native_go could not be spawned",
        },
        "source_and_module": {
            "attempt": ATTEMPT.relative_to(EXTRACTED).as_posix(),
            "mode": execution["mode"],
            "source_pins_before_after_equal": execution["sourceBefore"] == execution["sourceAfter"],
            "source_pins_match": execution["sourcePinsMatch"],
            "selected_current_source_pins": selected_source_pins,
            "runtime_wrapper_sha256": source_before["compiled-lifecycle/runtime/runtime.mjs"]["sha256"],
            "component_id": component_id,
            "AppIR_SHA256": demo_build["appIR"]["sha256"],
            "compiled_module_sha256": demo_build["module"]["sha256"],
            "encoder_sha256": demo_build["encoder"]["sha256"],
            "AppIR_parity": True,
            "required_capabilities": ["view.node", "effect.request-reply"],
            "bundle_inputs_include_Go_module_and_both_renderers": True,
            "demo_site_pins_stable_across_smoke": True,
        },
        "http_demo": {
            "schema": smoke["schema"],
            "status": smoke["status"],
            "checks": len(smoke["checks"]),
            "check_descriptions": smoke["checks"],
            "trace_ticks_including_init": len(ticks),
            "native_steps": len(native["steps"]),
            "native_Go_updates_compared_to_browser": len(go_steps),
            "renderer_swaps": smoke["rendererSwaps"],
            "browser": smoke["browserVersion"],
            "final_backend": smoke["finalBackend"],
            "pending_at_end": len(smoke["pendingAtEnd"]),
            "cancel_order": cancel_records,
            "retired_callback_probes_rejected": len(retired_records),
            "stale_Go_complete_probes_unchanged": len(smoke["goMessageProbeResults"]),
            "duplicate_deliveries_rejected": rejected_deliveries,
            "accepted_deliveries": accepted_deliveries,
            "final_reply_state": final,
            "final_disabled_controls": [item["key"] for item in controls if item["disabled"]],
            "http_requests": smoke["requests"],
            "browser_errors": len(smoke["browserErrors"]),
            "console_errors": len(smoke["consoleErrors"]),
            "failed_requests": len(smoke["failedRequests"]),
            "wasm_requests": len(smoke["wasmRequests"]),
            "wasm_api_attempts": len(smoke["noWasm"]["wasmAPIAttempts"]),
            "artifact_pins": demo_asset_pins,
            "screenshot_visually_inspected": True,
        },
        "evidence_hashes": {
            "E-BUILD_report_sha256": build_report_hash,
            "demo_smoke_sha256": file_hash(ATTEMPT / "demo/demo-smoke.json")[1],
            "screenshot_sha256": file_hash(ATTEMPT / "demo/demo.png")[1],
            "bundle_sha256": file_hash(ATTEMPT / "demo/site/demo.bundle.mjs")[1],
            "native_cli_trace_sha256": file_hash(ATTEMPT / "matrix/native-cli.json")[1],
            "execution_sha256": file_hash(ATTEMPT / "execution.json")[1],
        },
        "limitations": [
            "The primary managed workflow conclusion is failure, not pass. This audit accepts only the HTTP demo substep and its source/module binding.",
            "The native/direct/browser matrix is rejected because its native_go executable resolved to /home/runner/work/gondola/gondola/go and spawn failed with ENOENT; the conformance checker withheld full matrix acceptance.",
            "The local lifecycle-only preflight in lanes/demo/preflight.json is not used as evidence for this managed run.",
            "No detached stale physical button click claim is made by this HTTP demo audit.",
        ],
    }
    (CI / "lanes/demo/audit.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"decision": audit["decision"], "outcome": audit["outcome"],
                      "artifact_sha256": archive_hash, "checks": len(smoke["checks"]),
                      "ticks": len(ticks), "swaps": smoke["rendererSwaps"],
                      "matrix_failure": error_text}, sort_keys=True))


if __name__ == "__main__":
    main()
