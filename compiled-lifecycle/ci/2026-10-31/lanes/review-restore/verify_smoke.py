#!/usr/bin/env python3
"""Check the fresh restored-site smoke against the pinned final evidence."""
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
BASE = ROOT / "compiled-lifecycle/ci/2026-10-31"
LANE = BASE / "lanes/review-restore"


def require(ok, reason):
    if not ok:
        raise AssertionError(reason)


def sha_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def readj(path):
    return json.loads(path.read_text())


restore = readj(LANE / "restore-audit.json")
smoke_path = LANE / "smoke.json"
smoke = readj(smoke_path)
receipt_path = BASE / "lanes/repair-native-path/green/final-run-receipt.json"
receipt = readj(receipt_path)
demo = receipt["demoSmoke"]
site_root = pathlib.Path(restore["restore_root"])

require(smoke["status"] == "passed" and smoke["failures"] == [], "smoke status/failures")
require(len(smoke["checks"]) == 12 and smoke["checks"] == demo["checks"], "all 12 smoke checks vs R-FINAL")
require(smoke["browserVersion"] == "153.0.8010.0" == demo["browserVersion"], "Chromium version")
require(smoke["rendererSwaps"] == 4 == demo["rendererSwaps"], "renderer swaps")
require(smoke["finalTicks"] == 24 == demo["finalTicks"], "Go trace ticks")
require(smoke["finalBackend"] == "dom" == demo["finalBackend"], "terminal backend")
require(smoke["pendingAtEnd"] == [] == demo["pendingAtEnd"], "terminal pending effects")
require(smoke["requests"] == demo["requests"] and len(smoke["requests"]) == 3, "HTTP response identities")
require(all(row["status"] == 200 for row in smoke["requests"]), "HTTP status codes")
require(smoke["httpRequestCount"] == 3, "HTTP request count")
require(smoke["browserErrors"] == [] and smoke["consoleErrors"] == [] and smoke["failedRequests"] == [], "browser/network errors")
require(smoke["wasmRequests"] == [] and smoke["noWasm"]["wasmRequests"] == [] and smoke["noWasm"]["wasmAPIAttempts"] == [], "WASM requests/API attempts")
require(smoke["retiredReplyProbeOutcomes"] == demo["retiredReplyProbeOutcomes"], "retired callback outcomes")
require(smoke["goMessageProbeResults"] == demo["goMessageProbeResults"], "stale Go message probes")
require(smoke["finalState"] == demo["finalState"], "complete final typed state vs R-FINAL")
require(smoke["finalView"] == demo["finalView"], "complete final View/tree vs R-FINAL")
require(smoke["effectRecords"] == demo["effectRecords"], "complete ordered effect trace vs R-FINAL")

records = smoke["effectRecords"]
requests = [row["token"] for row in records if row["kind"] == "request"]
expected_requests = [
    "parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
    "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7",
]
require(requests == expected_requests, "all seven request correlations/order")
cancels = [row for row in records if row["kind"] == "cancel"]
require([row["token"] for row in cancels] == ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], "child-first cancellation ordering")
require(all(row["outcome"] == "cancelled" for row in cancels), "all subtree cancellations accepted")
retired = [row for row in records if row["kind"] == "force-deliver-retired"]
require(len(retired) == 3 and all(row["outcome"] == "rejected" for row in retired), "retired browser callbacks fenced")
require(len(smoke["goMessageProbeResults"]) == 3 and all(row["stateUnchanged"] for row in smoke["goMessageProbeResults"]), "old Go completions no-op")
accepted = [row for row in records if row["kind"] == "deliver" and row["outcome"] == "accepted"]
require(len(accepted) == 4, "sibling and fresh generation-2 replies accepted")
duplicates = [row for row in records if row["kind"] == "deliver" and row["outcome"] == "rejected"]
require(len(duplicates) == 2, "duplicate sibling and child replies rejected")

scenario = readj(ROOT / "fixtures/compiled/lifecycle/scenario.json")
final = scenario["expectedStates"][-1]
require(scenario["componentID"] == restore["demo_build"]["component_id"], "scenario/build package identity")
require(scenario["events"] and len(scenario["events"]) == 26 and len(scenario["expectedStates"]) == 13, "frozen fixture event/state counts")
require(smoke["finalState"]["nextRequestId"] == str(final["nextRequestID"]), "headless expected request sequence")
fields = {"generation": "generations", "requestId": "requestIDs", "alive": "alive", "requested": "requested", "pending": "pending", "token": "tokens", "reply": "replies", "count": "counts"}
for idx, node in enumerate(("parent", "child", "grandchild", "sibling")):
    for target, source in fields.items():
        expected = final[source][idx]
        if target in ("generation", "requestId"):
            expected = str(expected)
        require(smoke["finalState"][node][target] == expected, f"fixture terminal state {node}.{target}")

# Confirm none of the five restored static assets changed while the browser used them.
site_after = {}
for relative, before in restore["demo_site_pins_before_smoke"].items():
    path = site_root / relative
    require(path.is_file() and path.stat().st_size == before["bytes"] and sha_file(path) == before["sha256"], f"site asset changed: {relative}")
    site_after[relative] = {"bytes": path.stat().st_size, "sha256": sha_file(path), "stable": True}

screenshot = LANE / "smoke.png"
require(screenshot.is_file(), "smoke screenshot missing")
require(screenshot.stat().st_size == demo["screenshot"]["bytes"] and sha_file(screenshot) == demo["screenshot"]["sha256"], "screenshot vs R-FINAL")
source_smoke = ROOT / "compiled-lifecycle/demo/smoke.mjs"
require(sha_file(source_smoke) == restore["source_pins_vs_r_final"]["compiled-lifecycle/demo/smoke.mjs"]["sha256"], "smoke source changed after restore audit")

result = {
    "schema": "gobi.xr-restore-smoke-review/v1",
    "status": "passed",
    "node": subprocess.check_output(["/tmp/gondola-node22/node_modules/node/bin/node", "--version"], text=True).strip(),
    "chromium": subprocess.check_output(["/tmp/chromium", "--version"], text=True).strip(),
    "restore_record_sha256": sha_file(LANE / "restore-audit.json"),
    "smoke_source": str(source_smoke),
    "smoke_source_sha256": sha_file(source_smoke),
    "r_final_receipt_sha256": sha_file(receipt_path),
    "component_id": restore["demo_build"]["component_id"],
    "checks": len(smoke["checks"]),
    "ticks": smoke["finalTicks"],
    "renderer_swaps": smoke["rendererSwaps"],
    "request_tokens": requests,
    "cancel_order": [row["token"] for row in cancels],
    "retired_callbacks_rejected": len(retired),
    "stale_go_messages_unchanged": len(smoke["goMessageProbeResults"]),
    "accepted_replies": len(accepted),
    "duplicate_replies_rejected": len(duplicates),
    "http_requests": smoke["requests"],
    "browser_errors": len(smoke["browserErrors"]),
    "console_errors": len(smoke["consoleErrors"]),
    "failed_requests": len(smoke["failedRequests"]),
    "wasm_requests": len(smoke["wasmRequests"]),
    "wasm_api_attempts": len(smoke["noWasm"]["wasmAPIAttempts"]),
    "final_state_vs_receipt": True,
    "final_view_vs_receipt": True,
    "effect_trace_vs_receipt": True,
    "headless_fixture_sha256": sha_file(ROOT / "fixtures/compiled/lifecycle/scenario.json"),
    "headless_final_state_matches": True,
    "site_assets_stable_before_after": site_after,
    "screenshot": {"bytes": screenshot.stat().st_size, "sha256": sha_file(screenshot), "matches_r_final": True},
    "stderr_sha256": sha_file(LANE / "smoke.stderr.log"),
    "stderr_note": "Node emitted a nonfatal experimental EnvHttpProxyAgent warning; browser and request error arrays were empty.",
}
(LANE / "smoke-audit.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
print(json.dumps({"status": result["status"], "checks": result["checks"], "ticks": result["ticks"], "renderer_swaps": result["renderer_swaps"], "archive_restore": restore["archive"]["sha256"], "final_view_and_effects_match": True, "screenshot_sha256": result["screenshot"]["sha256"]}, indent=2))
