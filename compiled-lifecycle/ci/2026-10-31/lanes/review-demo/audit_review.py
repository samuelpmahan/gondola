#!/usr/bin/env python3
"""Independent bounded review of the managed lifecycle HTTP demo evidence."""

from __future__ import annotations

import hashlib
import json
import struct
import zipfile
from pathlib import Path, PurePosixPath


HERE = Path(__file__).resolve().parent
CI = HERE.parents[1]
ROOT = CI.parents[2]
EXTRACTED = CI / "extracted"
ATTEMPT_REL = "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z"
ATTEMPT = EXTRACTED / ATTEMPT_REL
PROVIDER = CI / "provider/failed-41178420647"
ARCHIVE = Path("/tmp/gobi-compiled-lifecycle-41178420647.zip")
EXPECTED_ARCHIVE_SHA = "6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def digest(path: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    count = 0
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            h.update(block)
            count += len(block)
    return count, h.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise AssertionError(reason)


def decode(value):
    kind = value["kind"]
    if kind == "struct":
        return {item["name"]: decode(item["value"]) for item in value["fields"]}
    if kind in ("array", "slice"):
        return [decode(item) for item in value.get("elements", [])]
    if kind == "string":
        return value["string"]
    if kind == "bool":
        return value["bool"]
    if kind in ("int", "uint"):
        return int(value["integer"])
    if kind == "float64":
        return struct.unpack(">d", bytes.fromhex(value["float64Bits"]))[0]
    if kind == "nil":
        return None
    raise AssertionError(f"unhandled encoded state kind {kind}")


def effects(items):
    return [{name: item.get(name, "") for name in ("kind", "name", "arg", "reply")} for item in items]


def main() -> None:
    report = CI / "coordination/reports/E-CI-DEMO.md"
    receipt = read_json(CI / "coordination/receipts/E-CI-DEMO.json")
    author_audit = read_json(CI / "lanes/demo/audit.json")
    provider = read_json(CI / "provider-download.json")
    retention = read_json(PROVIDER / "retention.json")
    run = read_json(CI / "lanes/evidence/run-push-41178420647-final.json")
    artifact_index = read_json(CI / "lanes/evidence/artifacts-push-41178420647.json")
    execution = read_json(ATTEMPT / "execution.json")
    smoke = read_json(ATTEMPT / "demo/demo-smoke.json")
    native = read_json(ATTEMPT / "matrix/native-cli.json")
    fixture = read_json(ROOT / "fixtures/compiled/lifecycle/scenario.json")
    failures = read_json(ATTEMPT / "matrix/lifecycle.failed.json")

    report_sha = digest(report)[1]
    require(report_sha == "ff7a8cab3a3a2c47486a25b74f20e1b9f874d8b7a923d10bef6bdd42bc3b17c6",
            "N3 author report pin")
    require(receipt["report"]["sha256"] == report_sha, "N3 receipt/report binding")
    require(receipt["audit"]["sha256"] == digest(CI / "lanes/demo/audit.json")[1],
            "N3 receipt/audit binding")
    require(run["id"] == 41178420647 and run["head_sha"] == "49cc2b96c8817a47319d5b7bd484184a22fa984b",
            "provider run/head identity")
    require(run["status"] == "completed" and run["conclusion"] == "failure", "provider workflow conclusion")
    artifact = next(item for item in artifact_index["artifacts"] if item["id"] == 13034915662)
    require(artifact["workflow_run"]["id"] == run["id"] and artifact["workflow_run"]["head_sha"] == run["head_sha"],
            "artifact is bound to provider run and source head")

    chunks = sorted(PROVIDER.glob("artifact.zip.part-*"))
    require(len(chunks) == len(retention["chunks"]) == 12, "provider chunk count")
    joined = bytearray()
    chunk_pins = []
    for path, item in zip(chunks, retention["chunks"], strict=True):
        data = path.read_bytes()
        require(path.as_posix() == str(ROOT / item["path"]), f"provider chunk ordering {path.name}")
        require(len(data) == item["bytes"] and sha(data) == item["sha256"], f"provider chunk pin {path.name}")
        joined.extend(data)
        chunk_pins.append({"path": item["path"], "bytes": len(data), "sha256": sha(data)})
    require(len(joined) == 47_035_803 and sha(joined) == EXPECTED_ARCHIVE_SHA, "reassembled provider ZIP pin")
    require(ARCHIVE.is_file() and digest(ARCHIVE) == (len(joined), EXPECTED_ARCHIVE_SHA), "retained original ZIP pin")
    require(ARCHIVE.read_bytes() == joined, "original ZIP equals independently reassembled provider chunks")
    require(provider["providerRunConclusion"] == "failure" and provider["members"] == 1272,
            "download metadata retains failed provider outcome")

    selected_members = [
        f"{ATTEMPT_REL}/execution.json",
        f"{ATTEMPT_REL}/demo/demo-smoke.json",
        f"{ATTEMPT_REL}/demo/demo.png",
        f"{ATTEMPT_REL}/demo/site/demo-build.json",
        f"{ATTEMPT_REL}/demo/site/demo.bundle.mjs",
        f"{ATTEMPT_REL}/demo/site/demo.css",
        f"{ATTEMPT_REL}/demo/site/entry.mjs",
        f"{ATTEMPT_REL}/demo/site/index.html",
        f"{ATTEMPT_REL}/react/output/apps/lifecycle-7e6575d90707/app-ir.json",
        f"{ATTEMPT_REL}/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs",
        f"{ATTEMPT_REL}/react/output/apps/lifecycle-7e6575d90707/encoder.mjs",
        f"{ATTEMPT_REL}/dom/output/apps/lifecycle-7e6575d90707/app-ir.json",
        f"{ATTEMPT_REL}/dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs",
        f"{ATTEMPT_REL}/matrix/native-cli.json",
        f"{ATTEMPT_REL}/logs/http-demo-smoke.stdout.log",
        f"{ATTEMPT_REL}/logs/lifecycle-conformance.stdout.log",
    ]
    with zipfile.ZipFile(ARCHIVE) as zf:
        infos = zf.infolist()
        names = [info.filename for info in infos]
        require(len(infos) == 1272 and len(names) == len(set(names)), "ZIP member count and uniqueness")
        require(sum(info.file_size for info in infos) == 412_381_547 and zf.testzip() is None,
                "ZIP uncompressed byte count and CRCs")
        require(all(not name.startswith("/") and "\\" not in name and
                    all(part not in ("", ".", "..") for part in PurePosixPath(name.rstrip("/")).parts)
                    for name in names), "ZIP member paths are safe")
        selected_pins = []
        for name in selected_members:
            raw = zf.read(name)
            extracted = EXTRACTED / name
            require(extracted.is_file() and extracted.read_bytes() == raw, f"ZIP/extraction equality: {name}")
            selected_pins.append({"path": name, "bytes": len(raw), "sha256": sha(raw)})

    require(execution["mode"] == "full" and execution["status"] == "failed" and
            execution["sourcePinsMatch"] is True and execution["sourceBefore"] == execution["sourceAfter"],
            "attempt mode/outcome and source stability")
    current_source = {}
    for pin in execution["sourceBefore"]:
        path = ROOT / pin["path"]
        require(path.is_file(), f"pinned source absent: {pin['path']}")
        size, source_sha = digest(path)
        require((size, source_sha) == (pin["bytes"], pin["sha256"]), f"managed source pin mismatch: {pin['path']}")
        current_source[pin["path"]] = source_sha
    require(len(current_source) == 122, "complete managed source pin inventory")
    require(execution["demoOutputPinsBeforeSmoke"] == execution["demoOutputPinsAfterSmoke"],
            "managed demo outputs did not change during smoke")

    component = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
    build = read_json(ATTEMPT / "demo/site/demo-build.json")
    react_manifest = read_json(ATTEMPT / "react/output/buildmanifest.json")
    dom_manifest = read_json(ATTEMPT / "dom/output/buildmanifest.json")
    react_ir = read_json(ATTEMPT / "react/output/apps/lifecycle-7e6575d90707/app-ir.json")
    dom_ir = read_json(ATTEMPT / "dom/output/apps/lifecycle-7e6575d90707/app-ir.json")
    require(build["componentId"] == component and build["packagePath"] == component, "demo Go package identity")
    require(react_manifest["apps"][0]["componentId"] == component and
            dom_manifest["apps"][0]["componentId"] == component, "React/DOM app identity")
    require(react_ir == dom_ir and react_ir["components"][0]["id"] == component, "React/DOM AppIR equality")
    capabilities = react_ir["components"][0]["capabilities"]
    require("view.node" in capabilities and "effect.request-reply" in capabilities, "fixture capabilities")
    for label, rel, manifest_key in (
        ("AppIR", f"{ATTEMPT_REL}/react/output/apps/lifecycle-7e6575d90707/app-ir.json", "appIR"),
        ("Go module", f"{ATTEMPT_REL}/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs", "module"),
        ("encoder", f"{ATTEMPT_REL}/react/output/apps/lifecycle-7e6575d90707/encoder.mjs", "encoder"),
    ):
        size, value = digest(EXTRACTED / rel)
        require(size == build[manifest_key]["bytes"] and value == build[manifest_key]["sha256"],
                f"demo build source/output binding: {label}")
    require(any(item.endswith("/gobi-compiled.mjs") for item in build["bundleInputs"]), "bundle includes compiled module")
    require(any(item.endswith("/encoder.mjs") for item in build["bundleInputs"]), "bundle includes generated encoder")
    require(any(item.endswith("compiled-frontend/frontend/dom/renderer.mjs") for item in build["bundleInputs"]) and
            any(item.endswith("compiled-frontend/frontend/react/renderer.mjs") for item in build["bundleInputs"]),
            "bundle includes both existing renderers")

    require(smoke["schema"] == "gobi.compiled-lifecycle-http-smoke/v1" and smoke["status"] == "passed",
            "HTTP smoke schema/status")
    require(len(smoke["checks"]) == 12 and len(smoke["finalTrace"]["ticks"]) == 24 and
            smoke["finalTicks"] == 24 and smoke["rendererSwaps"] == 4, "HTTP check/tick/swap counts")
    require(smoke["requests"] == [
        {"path": "/", "status": 200, "bytes": 4546},
        {"path": "/demo.css", "status": 200, "bytes": 6573},
        {"path": "/demo.bundle.mjs", "status": 200, "bytes": 1837935},
    ], "actual managed HTTP responses")
    require(all(not smoke[key] for key in ("failures", "browserErrors", "consoleErrors", "failedRequests",
                                            "wasmRequests")), "browser and network errors/WASM requests absent")
    require(not smoke["noWasm"]["wasmRequests"] and not smoke["noWasm"]["wasmAPIAttempts"], "no-WASM API probe")
    require(smoke["browserVersion"] == "156.0.8078.4" and smoke["pendingAtEnd"] == [] and
            smoke["finalBackend"] == "dom", "browser version/final state metadata")

    ticks = smoke["finalTrace"]["ticks"]
    steps = native["steps"]
    go_steps = [step for step in steps if step["kind"] != "renderer-swap" and
                not (step["kind"] == "go-message" and step.get("outcome") == "duplicate-no-op")]
    require(len(steps) == 26 and len(go_steps) == 23 and len(ticks) == len(go_steps) + 1,
            "native and browser event cardinalities")
    require(decode(ticks[0]["state"]) == native["initialState"], "browser Go Init equals native initial state")
    for tick_index, step in enumerate(go_steps, start=1):
        tick = ticks[tick_index]
        require(tick["index"] == tick_index and tick["message"] == step["message"],
                f"native/browser message at update {tick_index}")
        require(decode(tick["state"]) == step["state"], f"full native/browser Go state at update {tick_index}")
        require(tick["view"]["tree"] == step["view"], f"native/browser Go View at update {tick_index}")
        actual = effects([item["effect"] for item in tick.get("requestedEffects", [])])
        require(actual == effects(step.get("effects", [])), f"native/browser effects at update {tick_index}")
        if step["kind"] == "click":
            event = fixture["events"][step["index"]]
            require(tick["action"] == {key: event[key] for key in ("path", "event", "value")},
                    f"native/browser physical click action at update {tick_index}")
        if step["kind"] == "effect-reply":
            prior = next(entry for entry in ticks[:tick_index] if any(
                item.get("effect", {}).get("arg") == step["message"].get("arg")
                for item in entry.get("requestedEffects", [])))
            require(tick["completedEffects"] == [{"dispatchId": prior["dispatchId"], "effectIndex": 0,
                                                    "message": step["message"]}],
                    f"completion correlation at update {tick_index}")
        else:
            require(tick.get("completedEffects", []) == [], f"unexpected completion correlation {tick_index}")

    remove, remount = decode(ticks[9]["state"]), decode(ticks[10]["state"])
    for key in ("Parent", "Child", "Grandchild"):
        require(not remove[key]["Alive"] and not remove[key]["Pending"] and not remove[key]["Token"],
                f"removed subtree state {key}")
    require(remove["Sibling"]["Alive"] and remove["Sibling"]["Pending"] and
            remove["Sibling"]["Token"] == "sibling:g1:r4", "independent sibling survives subtree removal")
    for key, token in (("Parent", "parent:g2:r5"), ("Child", "child:g2:r6"), ("Grandchild", "grandchild:g2:r7")):
        require(remount[key]["Alive"] and remount[key]["Generation"] == 2 and not remount[key]["Pending"] and
                remount[key]["Token"] == "", f"fresh remounted state {key}/{token}")
    require(remount["Sibling"]["Pending"], "sibling remains pending after remount")
    require(all(tick["state"] == ticks[10]["state"] for tick in ticks[11:14]),
            "explicit stale Go completions leave remount unchanged")

    records = smoke["effectRecords"]
    requests = [entry["token"] for entry in records if entry["kind"] == "request"]
    cancels = [entry["token"] for entry in records if entry["kind"] == "cancel"]
    retired = [entry for entry in records if entry["kind"] == "force-deliver-retired"]
    accepted = [entry["token"] for entry in records if entry["kind"] == "deliver" and entry["outcome"] == "accepted"]
    rejected = [entry["token"] for entry in records if entry["kind"] == "deliver" and entry["outcome"] == "rejected"]
    require(requests == ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
                         "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7"], "Go-emitted request order")
    require(cancels == ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], "child-first cancellation")
    require(len(records) == 19 and len(retired) == 3 and all(item["outcome"] == "rejected" for item in retired),
            "effect host records and retired callback rejections")
    require([item["token"] for item in retired] == cancels, "retired probes match cancelled requests")
    require(accepted == ["sibling:g1:r4", "grandchild:g2:r7", "child:g2:r6", "parent:g2:r5"],
            "accepted manual reply order")
    require(rejected == ["sibling:g1:r4", "child:g2:r6"], "duplicate replies rejected")
    require(all(item["stateUnchanged"] for item in smoke["goMessageProbeResults"]), "stale Go message no-ops")
    disabled = [item["key"] for item in smoke["finalDOM"]["controls"] if item["disabled"]]
    require(disabled == ["parent-request", "child-request", "grandchild-request", "sibling-request",
                         "parent-remount"], "final disabled controls")
    require(all(not item["disabled"] for item in smoke["finalDOM"]["controls"] if item["key"].endswith("-add")) and
            not next(item for item in smoke["finalDOM"]["controls"] if item["key"] == "parent-remove")["disabled"],
            "final Add and Remove enabled controls")

    failed_text = " ".join(item["message"] for item in failures["errors"])
    require("spawnSync /home/runner/work/gondola/gondola/go ENOENT" in failed_text,
            "preserved provider native executable failure")
    require("withheld" in failed_text.lower(), "full conformance check withheld")
    require(any(item["name"] == "http-demo" and item["status"] == "passed" for item in execution["stages"]) and
            any(item["name"] == "native-direct-browser-matrix" and item["status"] == "failed"
                for item in execution["stages"]), "demo pass and overall matrix failure both retained")

    screenshot = ATTEMPT / "demo/demo.png"
    screenshot_size, screenshot_sha = digest(screenshot)
    require(screenshot_size == 326350 and screenshot_sha ==
            "d1a9d09dc59e88ce02a83e7d8734acf5987e3e4a1a5c3714384a881295b17648", "managed screenshot pin")
    raw_smoke_size, raw_smoke_sha = digest(ATTEMPT / "demo/demo-smoke.json")
    native_size, native_sha = digest(ATTEMPT / "matrix/native-cli.json")
    execution_size, execution_sha = digest(ATTEMPT / "execution.json")

    result = {
        "schema": "gobi.compiled-lifecycle-xr-ci-demo-review/v1",
        "reviewer": "N5",
        "decision": "accepted",
        "outcome": "confirmed_reuse",
        "acceptance_scope": "faithful bounded HTTP demo extraction from provider artifact 13034915662 only",
        "global_ci_acceptance": False,
        "provider": {"run": 41178420647, "head": run["head_sha"], "conclusion": run["conclusion"],
                     "artifact": 13034915662, "bytes": len(joined), "sha256": sha(joined),
                     "members": 1272, "uncompressed_bytes": 412381547, "crc": "all passed",
                     "chunks": chunk_pins},
        "author_packet": {"report_sha256": report_sha,
                          "receipt_sha256": digest(CI / "coordination/receipts/E-CI-DEMO.json")[1],
                          "audit_sha256": digest(CI / "lanes/demo/audit.json")[1]},
        "attempt": {"path": ATTEMPT_REL, "mode": execution["mode"], "status": execution["status"],
                    "source_pin_count": len(current_source), "source_pins_match": True,
                    "source_before_after_equal": True},
        "demo": {"status": smoke["status"], "http_checks": len(smoke["checks"]),
                 "http_responses": smoke["requests"], "trace_ticks_including_init": len(ticks),
                 "native_steps": len(steps), "native_updates_compared": len(go_steps),
                 "renderer_swaps": smoke["rendererSwaps"], "browser_version": smoke["browserVersion"],
                 "browser_errors": len(smoke["browserErrors"]), "console_errors": len(smoke["consoleErrors"]),
                 "failed_requests": len(smoke["failedRequests"]), "wasm_requests": len(smoke["wasmRequests"]),
                 "wasm_api_attempts": len(smoke["noWasm"]["wasmAPIAttempts"]),
                 "pending_at_end": len(smoke["pendingAtEnd"]), "request_tokens": requests,
                 "cancel_order": cancels, "retired_replies_rejected": len(retired),
                 "accepted_manual_replies": accepted, "duplicate_replies_rejected": rejected,
                 "final_disabled_controls": disabled},
        "evidence": {"original_zip_sha256": digest(ARCHIVE)[1], "selected_members_verified": selected_pins,
                      "smoke": {"bytes": raw_smoke_size, "sha256": raw_smoke_sha},
                      "native_cli": {"bytes": native_size, "sha256": native_sha},
                      "execution": {"bytes": execution_size, "sha256": execution_sha},
                      "screenshot": {"bytes": screenshot_size, "sha256": screenshot_sha,
                                     "visually_inspected": True}},
        "global_failure_boundary": {
            "matrix_stage": "failed",
            "error": failed_text,
            "conformance_evidence": "withheld after --native-go go resolved to missing repository-local executable",
            "limitation": "No complete provider CI, native/direct/browser conformance, or overall workflow pass is claimed.",
        },
    }
    output = HERE / "audit.json"
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"decision": result["decision"], "artifact_sha256": result["provider"]["sha256"],
                      "checks": result["demo"]["http_checks"], "updates_compared": len(go_steps),
                      "ticks": len(ticks), "swaps": smoke["rendererSwaps"], "global_status": execution["status"],
                      "report_sha256": report_sha}, sort_keys=True))


if __name__ == "__main__":
    main()
