#!/usr/bin/env python3
"""Read-only integrity and semantic summary for N3's preserved attempt 10."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
CAPTURES = ROOT / "compiled-backends/artifacts/conformance-captures"
FIXTURES = ("counter", "form", "list", "effect", "list-growth")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    attempt = CAPTURES / "attempt-10"
    per_fixture = {}
    totals = {"ticks": 0, "swaps": 0, "focus_swaps": 0, "mutations": 0}
    current_sources = {}

    for name in FIXTURES:
        run_path = attempt / f"{name}.run.json"
        check_path = attempt / f"{name}.check.json"
        manifest_path = attempt / f"{name}.manifest.json"
        run = load(run_path)
        result = load(check_path)
        manifest = load(manifest_path)

        check(run["status"] == "matched" and run["sourceStable"] is True,
              f"{name}: run is not matched with stable sources")
        check(run["sourcePinsBefore"] == run["sourcePinsAfter"],
              f"{name}: before/after source pins differ")
        check(len(run["sourcePinsBefore"]) == 34, f"{name}: expected 34 source pins")
        check(result["status"] == "matched", f"{name}: checker did not match")
        check(result["backends"] == {"react": "matched", "dom": "matched", "alternatingSwap": "matched"},
              f"{name}: backend oracle results differ")
        check(result["pins"]["sourceStable"] is True and result["pins"]["sourceCount"] == 34,
              f"{name}: checker pin assertion differs")
        check(run["summary"]["ticks"] == result["ticks"] and
              run["summary"]["swaps"] == result["swaps"] and
              run["summary"]["focusSwaps"] == result["focusSwaps"] and
              run["summary"]["mutationControlsDetected"] == result["mutationControlsDetected"],
              f"{name}: run/check summary differs")
        check(all(item["detected"] is True for item in result["mutationControls"]),
              f"{name}: at least one mutation control was not detected")

        for pin in run["sourcePinsBefore"]:
            path = (ROOT / pin["path"]).resolve()
            check(path.is_file(), f"{name}: missing pinned source {pin['path']}")
            check(sha256(path) == pin["sha256"] and path.stat().st_size == pin["bytes"],
                  f"{name}: source pin changed {pin['path']}")
            current_sources[pin["path"]] = pin["sha256"]

        for pin in run["outputPins"]:
            path = Path(pin["path"])
            check(path.is_file(), f"{name}: missing build output {pin['path']}")
            check(sha256(path) == pin["sha256"] and path.stat().st_size == pin["bytes"],
                  f"{name}: build output pin changed {pin['path']}")

        browser_bundle_pins = manifest["browserBundle"]
        check(len(browser_bundle_pins) == 1, f"{name}: expected one browser bundle pin")
        for pin in browser_bundle_pins:
            path = Path(pin["path"])
            check(path.is_file(), f"{name}: missing browser bundle {pin['path']}")
            check(sha256(path) == pin["sha256"] and path.stat().st_size == pin["bytes"],
                  f"{name}: browser bundle pin changed")

        native = load(attempt / f"{name}.native.json")
        direct = load(attempt / f"{name}.direct.json")
        check(native == direct, f"{name}: native and direct traces differ")

        summary = run["summary"]
        totals["ticks"] += summary["ticks"]
        totals["swaps"] += summary["swaps"]
        totals["focus_swaps"] += summary["focusSwaps"]
        totals["mutations"] += summary["mutationControlsDetected"]
        per_fixture[name] = {
            "status": run["status"],
            "source_pins": len(run["sourcePinsBefore"]),
            "source_pins_stable": run["sourcePinsBefore"] == run["sourcePinsAfter"],
            "native_direct_trace_equal": native == direct,
            "ticks": summary["ticks"],
            "swaps": summary["swaps"],
            "focus_swaps": summary["focusSwaps"],
            "mutation_controls_detected": summary["mutationControlsDetected"],
            "run_sha256": sha256(run_path),
            "check_sha256": sha256(check_path),
        }

    check(totals == {"ticks": 43, "swaps": 37, "focus_swaps": 9, "mutations": 45},
          f"attempt totals differ: {totals}")

    unmounts_are_suppressed_attempts = True
    for name in FIXTURES:
        browser = load(attempt / f"{name}.browser.json")
        unmount = browser["unmount"]
        check(unmount["result"] is True and
              unmount["physical"] == {"normalization": "container-innerHTML-v1", "html": "", "controls": 0} and
              unmount["rendererSnapshot"] == {"normalization": "outerHTML-v1", "html": "", "controls": []},
              f"{name}: unmount left a physical root or renderer snapshot")
        check(unmount["traceBefore"] == unmount["traceAfterUnmount"],
              f"{name}: unmount itself changed the application trace")
        check(unmount["fenced"]["trace"] == unmount["traceAfter"],
              f"{name}: post-unmount probes are not represented in final trace")
        extra = unmount["traceAfter"]["ticks"][len(unmount["traceAfterUnmount"]["ticks"]):]
        check(len(extra) == 2 and unmount["fenced"]["dispatch"]["accepted"] is True and
              unmount["fenced"]["dispatch"]["dispatchId"] is None and
              unmount["fenced"]["stale"]["accepted"] is True and
              unmount["fenced"]["stale"]["dispatchId"] is None,
              f"{name}: expected distinct dispatch/stale suppressed callback probes")
        for tick in extra:
            check(tick["message"] is None and tick["dispatchId"] is None and
                  tick["requestedEffects"] == [] and tick["completedEffects"] == [] and
                  tick["state"] == unmount["traceAfterUnmount"]["ticks"][-1]["state"] and
                  tick["view"] == unmount["traceAfterUnmount"]["ticks"][-1]["view"] and
                  tick["dom"] == {"normalization": "outerHTML-v1", "html": "", "controls": []},
                  f"{name}: post-unmount callback was not a state-preserving suppressed tick")

    list_browser = load(attempt / "list.browser.json")
    stale = list_browser["profiles"]["swap"]["actions"][7]
    retired = stale["retiredCallbackProbe"]
    check(stale["classification"] == "retired-renderer-probe-plus-active-missing-target-attempt" and
          stale["method"] == "active renderer onStaleAction for missing detached target",
          "list stale action is not explicitly classified as a driver attempt")
    check(stale["targetConnectedBefore"] is False and stale["activeRendererId"] == 8 and
          stale["rendererCallback"]["rendererId"] == 8,
          "list active stale-action evidence has unexpected target or renderer")
    check(retired["classification"] == "retired-renderer-callback-fenced-out-of-band" and
          retired["rendererId"] == 7 and retired["callback"]["rendererId"] == 7,
          "list retired callback provenance differs")
    check(retired["before"]["trace"] == retired["after"]["trace"] and
          retired["before"]["snapshot"] == retired["after"]["snapshot"] and
          retired["before"]["callbacks"]["dispatch"] == retired["after"]["callbacks"]["dispatch"] and
          retired["after"]["callbacks"]["stale"] == retired["before"]["callbacks"]["stale"] + 1,
          "retired callback changed application output or was not counted once")
    check(stale["before"]["ticks"] == 8 and stale["afterPhysical"]["ticks"] == 9 and
          stale["before"]["callbacks"]["dispatch"] == stale["afterPhysical"]["callbacks"]["dispatch"] == 7 and
          stale["traceTick"]["dispatchId"] is None,
          "active missing-target attempt did not add exactly one suppressed tick")

    historic = {}
    for attempt_no, files in {
        "06": ("counter.run.json", "form.failed.json"),
        "07": ("form.failed.json", "list.failed.json", "effect.run.json", "list-growth.failed.json"),
        "08": ("list.failed.json",),
    }.items():
        for file_name in files:
            path = CAPTURES / f"attempt-{attempt_no}" / file_name
            check(path.is_file(), f"historical diagnostic missing: {path}")
            historic[str(path.relative_to(ROOT))] = sha256(path)

    audit = {
        "review": "XR--HARNESS",
        "result": "accepted",
        "attempt": "10",
        "toolchain": {"python": "standard library only"},
        "totals": totals,
        "all_source_pins_resolve_and_match": True,
        "all_build_and_browser_bundle_pins_match": True,
        "native_and_direct_trace_objects_equal": True,
        "list_lifetime_evidence": {
            "retired_renderer": 7,
            "retired_probe_out_of_band_no_trace_or_snapshot_change": True,
            "active_renderer": 8,
            "active_missing_target_driver_attempt": True,
            "active_attempt_adds_one_suppressed_tick": True,
            "retained_dom_listener_invoked": False,
        },
        "post_unmount_evidence": {
            "physical_container_and_renderer_snapshot_empty": True,
            "unmount_does_not_change_application_trace": True,
            "dispatch_and_stale_attempts_add_two_suppressed_ticks_per_profile": True,
            "state_view_and_empty_dom_preserved_without_go_update_or_effect": True,
        },
        "historical_capture_sha256": historic,
        "current_source_sha256": current_sources,
        "per_fixture": per_fixture,
    }
    output = Path(__file__).with_name("attempt10-audit.json")
    output.write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"result": "accepted", "totals": totals,
                      "pins": "verified 34 before/after inputs per fixture plus build and bundle outputs",
                      "audit": str(output.relative_to(ROOT))}, sort_keys=True))


if __name__ == "__main__":
    main()
