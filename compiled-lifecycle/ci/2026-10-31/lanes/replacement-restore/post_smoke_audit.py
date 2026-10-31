#!/usr/bin/env python3
"""Compare the restored-site smoke against pinned R-FINAL output and site pins."""
from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
BASE = ROOT / "compiled-lifecycle/ci/2026-10-31"
LANE = BASE / "lanes/replacement-restore"
SOURCE_ROOT = pathlib.Path("/workspace/scratch/39a56936f173/gondola")
EXPECTED_SOURCE_COMMIT = "00da54ad0f5a4006b13a5cded18ce291845978bc"
EXPECTED_SCREENSHOT_SHA = "6f366f62a04be4223324602333013b5bfc5c69aaf2c9eeb2edd61e44b8bd8053"


def sha_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


restore = read_json(LANE / "restore.json")
smoke_path = LANE / "smoke.json"
smoke = read_json(smoke_path)
final_receipt_path = BASE / "lanes/repair-native-path/green/final-run-receipt.json"
final_receipt = read_json(final_receipt_path)
expected = final_receipt["demoSmoke"]
require(sha_file(final_receipt_path) == "a6c99407c97e2d6634de14a0a431293309e40d5fcf691a14b6bacaf16791d810", "R-FINAL receipt changed")
require(restore["source_commit"] == EXPECTED_SOURCE_COMMIT, "restore source commit identity")
require(subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=SOURCE_ROOT, text=True).strip() == EXPECTED_SOURCE_COMMIT, "source worktree commit identity")

require(smoke["status"] == "passed" and not smoke["failures"], "smoke status/failures")
require(len(smoke["checks"]) == 12 and smoke["checks"] == expected["checks"], "smoke check list differs from R-FINAL")
require(smoke["finalTicks"] == 24 and smoke["finalTicks"] == expected["finalTicks"], "tick count differs from R-FINAL")
require(smoke["rendererSwaps"] == 4 and smoke["rendererSwaps"] == expected["rendererSwaps"], "renderer swap count differs from R-FINAL")
require(smoke["browserVersion"] == "153.0.8010.0" and smoke["browserVersion"] == expected["browserVersion"], "browser version differs")
require(smoke["requests"] == expected["requests"] and len(smoke["requests"]) == 3 and all(row["status"] == 200 for row in smoke["requests"]), "HTTP asset results differ")
require(not smoke["browserErrors"] and not smoke["consoleErrors"] and not smoke["failedRequests"], "browser/console/request errors")
require(smoke["wasmRequests"] == expected["wasmRequests"] == [] and smoke["noWasm"] == expected["noWasm"], "unexpected WASM request/API use")
require(smoke["httpRequestCount"] == 3 and smoke["pendingAtEnd"] == expected["pendingAtEnd"] == [], "request/pending terminal state")

# Compare full payloads, not selected display fields, to the source-pinned R-FINAL receipt.
payload_matches = {}
for name in ("finalState", "finalView", "finalDOM", "finalTrace", "effectRecords"):
    same = smoke[name] == expected[name]
    require(same, f"complete {name} differs from R-FINAL")
    payload_matches[name] = {"matched": True, "sha256": hashlib.sha256(json.dumps(smoke[name], sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
require(len(smoke["effectRecords"]) == 19 and len(smoke["effectRecords"]) == len(expected["effectRecords"]), "effect record count")
cancels = [row["token"] for row in smoke["effectRecords"] if row["kind"] == "cancel"]
require(cancels == ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], "child-first cancellation order")
require(smoke["retiredReplyProbeOutcomes"] == expected["retiredReplyProbeOutcomes"] and len(smoke["retiredReplyProbeOutcomes"]) == 3, "retired callback results")
require(smoke["goMessageProbeResults"] == expected["goMessageProbeResults"] and len(smoke["goMessageProbeResults"]) == 3, "stale Go completion results")

# Rehash the restored static assets after the browser run and compare every pin.
after = {}
site = pathlib.Path(restore["restored_site"])
for relative, before in restore["site_pins_before_smoke"].items():
    path = site / pathlib.PurePosixPath(relative).relative_to("demo/site")
    data_hash = sha_file(path)
    size = path.stat().st_size
    require(size == before["bytes"] and data_hash == before["sha256"], f"site asset mutated during smoke: {relative}")
    after[relative] = {"bytes": size, "sha256": data_hash, "stable": True}

source_after = []
source_pins = {row["path"]: row for row in final_receipt["sourceBefore"]}
for rel in ("compiled-lifecycle/demo/app.mjs", "compiled-lifecycle/demo/build.mjs", "compiled-lifecycle/demo/smoke.mjs", "fixtures/compiled/lifecycle/scenario.json"):
    row = source_pins[rel]
    path = SOURCE_ROOT / rel
    require(path.stat().st_size == row["bytes"] and sha_file(path) == row["sha256"], f"source changed during restore/smoke: {rel}")
    source_after.append({"path": rel, "bytes": row["bytes"], "sha256": row["sha256"], "stable": True})

screenshot_path = LANE / "smoke.png"
screenshot_sha = sha_file(screenshot_path)
require(screenshot_path.stat().st_size == expected["screenshot"]["bytes"], "screenshot size differs")
require(screenshot_sha == EXPECTED_SCREENSHOT_SHA == expected["screenshot"]["sha256"], "screenshot pin differs from R-FINAL")

result = {
    "schema": "gobi.compiled-lifecycle-replacement-restore-smoke-audit/v1",
    "status": "passed_bounded_local_restore_smoke",
    "source_commit": EXPECTED_SOURCE_COMMIT,
    "source_worktree": str(SOURCE_ROOT),
    "restored_site": str(site),
    "r_final_receipt_sha256": sha_file(final_receipt_path),
    "smoke": {"path": str(smoke_path.relative_to(ROOT)), "bytes": smoke_path.stat().st_size, "sha256": sha_file(smoke_path), "status": smoke["status"], "checks": len(smoke["checks"]), "ticks": smoke["finalTicks"], "renderer_swaps": smoke["rendererSwaps"], "requests": smoke["requests"], "browser_errors": len(smoke["browserErrors"]), "console_errors": len(smoke["consoleErrors"]), "failed_requests": len(smoke["failedRequests"]), "wasm_requests": len(smoke["wasmRequests"]), "pending_at_end": len(smoke["pendingAtEnd"]), "cancel_order": cancels, "retired_callbacks_rejected": sum(row["outcome"] == "rejected" for row in smoke["retiredReplyProbeOutcomes"]), "stale_go_messages_unchanged": sum(row["stateUnchanged"] for row in smoke["goMessageProbeResults"])},
    "complete_payload_matches_r_final": payload_matches,
    "site_pins_before_smoke": restore["site_pins_before_smoke"],
    "site_pins_after_smoke": after,
    "site_pins_stable": True,
    "source_pins_after_smoke": source_after,
    "screenshot": {"path": str(screenshot_path.relative_to(ROOT)), "bytes": screenshot_path.stat().st_size, "sha256": screenshot_sha, "matches_r_final": True},
    "build_identity": restore["build_identity"],
    "no_build_or_install": True,
    "hosted_ci_claim": False
}
out = LANE / "post-smoke.json"
out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps({"post_smoke_audit": str(out.relative_to(ROOT)), "status": result["status"], "checks": result["smoke"]["checks"], "ticks": result["smoke"]["ticks"], "renderer_swaps": result["smoke"]["renderer_swaps"], "http_200": len(result["smoke"]["requests"]), "complete_state_view_dom_trace_effects_match": True, "site_pins_stable": True, "screenshot_sha256": screenshot_sha}, indent=2))
