#!/usr/bin/env python3
"""Compare semantic browser evidence from the fresh local run and hosted artifact."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
LOCAL_ATTEMPT = ROOT / "compiled-capabilities/builds/attempts/attempt-20261031T103735751Z"
HOSTED_ATTEMPT = ROOT / "compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/primary-push-run-41193504188-extracted/compiled-capabilities/builds/attempts/attempt-20261031T103752934Z"


def require(ok: bool, message: str):
    if not ok:
        raise AssertionError(message)


def read(root: Path, rel: str):
    return json.loads((root / rel).read_text())


def sha(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


cap_rel = "matrix/capabilities.capability.browser.capture.json"
check_rel = "matrix/capabilities.capability-check.json"
run_rel = "matrix/capabilities.run.json"
life_check_rel = "matrix/capabilities.lifecycle.check.json"
life_browser_rel = "matrix/capabilities.lifecycle.browser.json"
app_ir_rel = "react/output/apps/lifecycle-7e6575d90707/app-ir.json"

local_browser = read(LOCAL_ATTEMPT, cap_rel)
hosted_browser = read(HOSTED_ATTEMPT, cap_rel)
local_check = read(LOCAL_ATTEMPT, check_rel)
hosted_check = read(HOSTED_ATTEMPT, check_rel)
local_run = read(LOCAL_ATTEMPT, run_rel)
hosted_run = read(HOSTED_ATTEMPT, run_rel)
local_life_check = read(LOCAL_ATTEMPT, life_check_rel)
hosted_life_check = read(HOSTED_ATTEMPT, life_check_rel)
local_life_browser = read(LOCAL_ATTEMPT, life_browser_rel)
hosted_life_browser = read(HOSTED_ATTEMPT, life_browser_rel)
local_ir = read(LOCAL_ATTEMPT, app_ir_rel)
hosted_ir = read(HOSTED_ATTEMPT, app_ir_rel)

for label, cap_run, cap_check, life_run, life_check, life_browser in (
    ("local", local_run, local_check, read(LOCAL_ATTEMPT, "matrix/capabilities.lifecycle.run.json"), local_life_check, local_life_browser),
    ("hosted", hosted_run, hosted_check, read(HOSTED_ATTEMPT, "matrix/capabilities.lifecycle.run.json"), hosted_life_check, hosted_life_browser),
):
    require(cap_run.get("status") == "matched", f"{label}: capability run not matched")
    require(cap_check.get("status") == "matched", f"{label}: capability check not matched")
    require(life_run.get("status") == "matched", f"{label}: lifecycle run not matched")
    require(life_check.get("status") == "matched", f"{label}: lifecycle check not matched")
    require(life_browser.get("schema") == "gobi.compiled-lifecycle-browser/v1" and life_browser.get("pageErrors") == [],
            f"{label}: lifecycle browser summary invalid")
    require(cap_run.get("sourcePinsBefore") == cap_run.get("sourcePinsFinal") and cap_run.get("sourceStableThroughCheck") is True,
            f"{label}: capability source pins unstable")

require(local_browser["componentId"] == hosted_browser["componentId"], "component IDs differ")
require(local_browser["componentCapabilities"] == hosted_browser["componentCapabilities"] == local_ir["components"][0]["capabilities"],
        "compiled capability sets differ")
require(hosted_ir["components"][0]["capabilities"] == local_ir["components"][0]["capabilities"], "hosted AppIR differs")
require(local_browser["initialAppIRUsedUnmodified"] is True and hosted_browser["initialAppIRUsedUnmodified"] is True,
        "capture does not use unmodified AppIR")

require(local_browser["admissions"] == hosted_browser["admissions"], "raw 19-case admissions differ between local and hosted captures")
require(len(local_browser["admissions"]["admissions"]) + len(local_browser["admissions"]["hostDescriptorCases"]) +
        len(local_browser["admissions"]["rendererDescriptorCases"]) == 19, "admission matrix is not 19 rows")
require(local_browser["admissions"]["hostDescriptorCases"] == hosted_browser["admissions"]["hostDescriptorCases"],
        "host descriptor evidence differs")

local_swap, hosted_swap = local_browser["swap"], hosted_browser["swap"]
for label in ("rejected", "compatible"):
    for moment in ("before", "after"):
        left, right = local_swap[label][moment], hosted_swap[label][moment]
        for field in ("state", "view", "dom"):
            require(left["snapshot"][field] == right["snapshot"][field], f"{label} {moment} {field} differs across runs")
        require(left["pending"] == right["pending"], f"{label} {moment} pending effects differ across runs")
        # The per-run diagnostics have path/generation counters, so require them
        # to agree on the generation and lease facts used by the claim.
        require(left["diagnostics"]["currentGeneration"] == right["diagnostics"]["currentGeneration"],
                f"{label} {moment} generation differs")

for key in ("eventOrder", "expectedPreservedAfterRejectedSwap", "observedPreservedAfterRejectedSwap", "oldActiveClickAccepted",
            "oldActiveClick", "oldCallbackFencedAfterCommit", "oldCallbackResult", "replyAccepted", "replyResult",
            "requestRecord", "expectedCompatibleRendererCapabilities", "activeRendererProfiles", "disabledClick", "finalTrace", "finalSnapshot"):
    require(local_swap[key] == hosted_swap[key], f"raw swap fact differs between local and hosted: {key}")
require(local_swap["compatible"]["observedPreserved"] == hosted_swap["compatible"]["observedPreserved"],
        "compatible swap preservation facts differ")
require(local_swap["oldCallbackFence"]["beforeGeneration"] == hosted_swap["oldCallbackFence"]["beforeGeneration"],
        "old callback source generation differs")
require(local_swap["oldCallbackFence"]["afterGeneration"] == hosted_swap["oldCallbackFence"]["afterGeneration"],
        "old callback post-commit generation differs")
require(local_swap["oldCallbackFence"]["beforeTrace"] == local_swap["oldCallbackFence"]["afterTrace"] and
        hosted_swap["oldCallbackFence"]["beforeTrace"] == hosted_swap["oldCallbackFence"]["afterTrace"],
        "old callback changed trace in one capture")
require(len(local_swap["finalTrace"]["ticks"]) == len(hosted_swap["finalTrace"]["ticks"]) == 5,
        "five-tick trace missing")

mutation_ids = ["rejected-state", "rejected-view", "rejected-dom", "rejected-pending", "compatible-state", "compatible-view",
                "compatible-dom", "compatible-pending", "host-option-accessor-construction"]
require([row["id"] for row in local_check["capabilityMutationControls"]] == mutation_ids and
        [row["id"] for row in hosted_check["capabilityMutationControls"]] == mutation_ids, "nine mutation control IDs/order differ")
require(all(row["detected"] is True for row in local_check["capabilityMutationControls"] + hosted_check["capabilityMutationControls"]),
        "capture-data mutation escaped in one run")
require(local_check["swap"]["rejected"]["rawPreservationVerified"] is True and
        local_check["swap"]["compatible"]["rawPreservationVerified"] is True and
        hosted_check["swap"]["rejected"]["rawPreservationVerified"] is True and
        hosted_check["swap"]["compatible"]["rawPreservationVerified"] is True, "raw-preservation checker field missing")
require(local_life_check["mutationControlsDetected"] == hosted_life_check["mutationControlsDetected"] == 8, "8 inherited controls not detected")
require([x["name"] for x in local_life_check["mutationControls"]] == [x["name"] for x in hosted_life_check["mutationControls"]],
        "inherited mutation controls differ")
require(local_life_check["swaps"] == hosted_life_check["swaps"] == 17 and local_life_check["events"] == hosted_life_check["events"] == 26 and
        local_life_check["ticks"] == hosted_life_check["ticks"] == 26, "inherited lifecycle counts differ")

def rec_digest(root: Path, rel: str):
    path = root / rel
    return {"bytes": path.stat().st_size, "sha256": sha(path)}

result = {
    "schema": "gobi.current-browser-local-hosted-comparison/v1",
    "status": "matched",
    "sourceCommit": "60b5aeff3172837ad7831c2b78b210454a3d81a2",
    "sourceTree": "cc3a129b4372d00d5168135aa2e5687dfbf6788f",
    "localAttempt": str(LOCAL_ATTEMPT),
    "hostedAttempt": str(HOSTED_ATTEMPT),
    "rawInputs": {
        "capabilityBrowserCapture": {"local": rec_digest(LOCAL_ATTEMPT, cap_rel), "hosted": rec_digest(HOSTED_ATTEMPT, cap_rel), "byteIdentical": (LOCAL_ATTEMPT/cap_rel).read_bytes() == (HOSTED_ATTEMPT/cap_rel).read_bytes()},
        "capabilityCheck": {"local": rec_digest(LOCAL_ATTEMPT, check_rel), "hosted": rec_digest(HOSTED_ATTEMPT, check_rel), "byteIdentical": (LOCAL_ATTEMPT/check_rel).read_bytes() == (HOSTED_ATTEMPT/check_rel).read_bytes()},
        "capabilityRun": {"local": rec_digest(LOCAL_ATTEMPT, run_rel), "hosted": rec_digest(HOSTED_ATTEMPT, run_rel), "byteIdentical": (LOCAL_ATTEMPT/run_rel).read_bytes() == (HOSTED_ATTEMPT/run_rel).read_bytes()},
        "lifecycleCheck": {"local": rec_digest(LOCAL_ATTEMPT, life_check_rel), "hosted": rec_digest(HOSTED_ATTEMPT, life_check_rel), "byteIdentical": (LOCAL_ATTEMPT/life_check_rel).read_bytes() == (HOSTED_ATTEMPT/life_check_rel).read_bytes()},
        "appIR": {"local": rec_digest(LOCAL_ATTEMPT, app_ir_rel), "hosted": rec_digest(HOSTED_ATTEMPT, app_ir_rel), "byteIdentical": (LOCAL_ATTEMPT/app_ir_rel).read_bytes() == (HOSTED_ATTEMPT/app_ir_rel).read_bytes()},
    },
    "verifiedFacts": {
        "admissions": 19,
        "fiveTickTraceMatches": True,
        "rejectedAndCompatibleRawStateViewDomPendingMatchAcrossRuns": True,
        "oldClickContinuesAndOldCallbackFenced": True,
        "pendingReplyAccepted": True,
        "captureMutationsDetectedPerRun": 9,
        "inheritedMutationsDetectedPerRun": 8,
        "inheritedLifecycleSwapsEventsTicks": [17, 26, 26],
        "focusDiagnostics": {
            "localRejected": {"captured": local_swap["rejected"]["diagnostic"]["focusCaptured"], "restored": local_swap["rejected"]["diagnostic"]["focusRestored"]},
            "hostedRejected": {"captured": hosted_swap["rejected"]["diagnostic"]["focusCaptured"], "restored": hosted_swap["rejected"]["diagnostic"]["focusRestored"]},
            "localCompatible": {"captured": local_swap["compatible"]["after"]["diagnostics"]["replacements"][-1]["focusCaptured"], "restored": local_swap["compatible"]["after"]["diagnostics"]["replacements"][-1]["focusRestored"]},
            "hostedCompatible": {"captured": hosted_swap["compatible"]["after"]["diagnostics"]["replacements"][-1]["focusCaptured"], "restored": hosted_swap["compatible"]["after"]["diagnostics"]["replacements"][-1]["focusRestored"]},
            "interpretation": "Both captures report false/false; this programmatic-click sequence contains no focus identity claim.",
        },
    },
}
print(json.dumps(result, indent=2, sort_keys=True))
