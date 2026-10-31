#!/usr/bin/env python3
"""Read-only independent audit of current compiled capability browser artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def required(path, label):
    require(path.exists(), f"missing {label}: {path}")
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--attempt-root", type=Path, required=True)
    parser.add_argument("--react-app-ir", type=Path, required=True)
    parser.add_argument("--dom-app-ir", type=Path, required=True)
    parser.add_argument("--expectations", type=Path, required=True)
    parser.add_argument("--lifecycle-check", type=Path, required=True)
    parser.add_argument("--lifecycle-browser", type=Path, required=True)
    parser.add_argument("--bundle-root", type=Path, action="append", default=[],
                        help="additional read-only roots to locate the pinned browser bundle")
    parser.add_argument("--require-bundle-root", type=Path,
                        help="require a byte-matching browser bundle under this artifact root")
    args = parser.parse_args()

    attempt = args.attempt_root.resolve()
    matrix = attempt / "matrix"
    browser_path = required(matrix / "capabilities.capability.browser.capture.json", "capability browser capture")
    check_path = required(matrix / "capabilities.capability-check.json", "capability check")
    capability_run_path = required(matrix / "capabilities.run.json", "capability run")
    lifecycle_run_path = required(matrix / "capabilities.lifecycle.run.json", "inherited lifecycle run")
    execution_path = required(attempt / "execution.json", "full execution receipt")
    lifecycle_check_path = required(args.lifecycle_check.resolve(), "inherited lifecycle check")
    lifecycle_browser_path = required(args.lifecycle_browser.resolve(), "inherited lifecycle browser summary")

    browser = load(browser_path)
    check = load(check_path)
    capability_run = load(capability_run_path)
    lifecycle_run = load(lifecycle_run_path)
    execution = load(execution_path)
    expectations = load(args.expectations.resolve())
    app_ir = load(args.react_app_ir.resolve())
    dom_app_ir = load(args.dom_app_ir.resolve())
    inherited_check = load(lifecycle_check_path)
    inherited_browser = load(lifecycle_browser_path)

    require(browser.get("schema") == "gobi.compiled-capability-browser/v1", "browser capture schema")
    require(check.get("schema") == "gobi.compiled-capability-check/v1" and check.get("status") == "matched",
            "capability check is not matched")
    require(capability_run.get("status") == "matched", "capability run is not matched")
    require(lifecycle_run.get("status") == "matched", "inherited lifecycle run is not matched")
    require(inherited_check.get("status") == "matched", "inherited lifecycle check is not matched")
    require(execution.get("status") == "passed", "current full E-BUILD receipt is not passed")
    failed_stages = [stage.get("name") for stage in execution.get("stages", [])
                     if stage.get("status") == "failed"]
    require(not failed_stages, f"current full E-BUILD has failed stages: {failed_stages}")
    require(execution.get("sourcePinsMatch") is True and
            execution.get("sourceBefore") == execution.get("sourceAfter"),
            "full E-BUILD source pins are not stable")
    full_source_pins = execution.get("sourceBefore", [])
    require(len(full_source_pins) == 163, "full E-BUILD source pin count differs from the completed attempt")
    for row in full_source_pins:
        source_file = Path.cwd() / row["path"]
        require(source_file.is_file() and source_file.stat().st_size == row["bytes"] and
                digest(source_file) == row["sha256"], f"full E-BUILD source pin differs from current bytes: {row['path']}")
    binding_path = Path.cwd() / "compiled-capabilities/coordination/publication-binding-followup.json"
    binding = load(required(binding_path, "current publication binding"))
    require(binding["local"]["commit"] == "60b5aeff3172837ad7831c2b78b210454a3d81a2" and
            binding["remote"]["commit"] == binding["local"]["commit"],
            "current local/published source commit binding mismatch")
    require(binding["local"]["tree"] == "cc3a129b4372d00d5168135aa2e5687dfbf6788f" and
            binding["remote"]["tree"] == binding["local"]["tree"],
            "current local/published source tree binding mismatch")
    require(binding["local"]["parents"] == ["a2e1164d68abaaa7d028bdaf6a20bea842a131ae"] and
            binding["remote"]["parents"] == binding["local"]["parents"],
            "current local/published direct parent binding mismatch")

    # Recompute the expected case IDs from the literal oracle and compare them
    # with the actual browser rows, rather than trusting check output labels.
    admission = expectations["admission"]
    groups = [
        ("admissions", admission["rejectBeforeInitOrRender"]),
        ("hostDescriptorCases", admission["strictHostDeclarations"]),
        ("rendererDescriptorCases", admission["strictRendererDeclarations"]),
    ]
    observed = browser["admissions"]
    expected_ids = []
    actual_ids = []
    raw_admission_counts = {}
    for field, expected_rows in groups:
        actual_rows = observed[field]
        expected_group_ids = [row["id"] for row in expected_rows]
        actual_group_ids = [row["id"] for row in actual_rows]
        require(actual_group_ids == expected_group_ids, f"{field} IDs/order differ from the literal oracle")
        expected_ids.extend(expected_group_ids)
        actual_ids.extend(actual_group_ids)
        raw_admission_counts[field] = len(actual_rows)
        for row in actual_rows:
            label = f"admission {row['id']}"
            require(row.get("rejected") is True and row.get("errorName") == "TypeError", f"{label}: no TypeError rejection")
            require(all(row.get(key) == 0 for key in ("initCalls", "updateCalls", "viewCalls")),
                    f"{label}: a Go role ran")
            require(row.get("rendererCalls") == 0, f"{label}: a renderer method ran")
            require(row.get("containerEmpty") is True, f"{label}: physical container was touched")
    require(len(actual_ids) == 19 and len(set(actual_ids)) == 19, "expected 19 unique admission stimuli")

    host_array_accessor = next(row for row in observed["hostDescriptorCases"]
                               if row["id"] == "accessor-host-capability")
    host_option_accessor = next(row for row in observed["hostDescriptorCases"]
                                if row["id"] == "accessor-host-capabilities-property")
    require(host_array_accessor.get("descriptorGetterCalls") == 0 and
            host_array_accessor.get("optionGetterCalls") == 0,
            "host capability array accessor was invoked")
    require(host_option_accessor.get("optionAccessorConstructed") is True,
            "raw host option case lacks evidence that an own getter descriptor was constructed")
    require(host_option_accessor.get("optionGetterCalls") == 0 and
            host_option_accessor.get("descriptorGetterCalls") == 0,
            "host option getter was invoked")
    for row in observed["rendererDescriptorCases"]:
        if row["id"] in {"accessor-renderer-capability", "accessor-renderer-capabilities-property"}:
            require(row.get("descriptorGetterCalls") == 0 and
                    row.get("rendererCapabilityGetterCalls") == 0,
                    f"renderer capability accessor was invoked: {row['id']}")

    # Bind the capture's component declaration to the real built AppIR file and
    # derive the active candidate profile from that unmodified declaration.
    component_id = browser["componentId"]
    component = next(item for item in app_ir["components"] if item["id"] == component_id)
    dom_component = next(item for item in dom_app_ir["components"] if item["id"] == component_id)
    require(browser.get("initialAppIRUsedUnmodified") is True, "capture does not attest unmodified AppIR use")
    require(browser["componentCapabilities"] == component["capabilities"],
            "captured capabilities differ from the actual compiled AppIR")
    require(component["capabilities"] == dom_component["capabilities"],
            "React and DOM AppIR capability lists differ")
    known_view = expectations["renderer"]["knownCapabilities"]
    actual_required = [cap for cap in component["capabilities"] if cap in known_view]
    rejected = browser["swap"]["rejected"]
    require(rejected["missingCapability"] in actual_required, "missing renderer capability is not AppIR-required")
    candidate = [cap for cap in actual_required if cap != rejected["missingCapability"]]
    require(rejected["candidateCapabilities"] == candidate,
            "active incompatible candidate is not derived from the actual AppIR requirement")
    require(rejected["errorName"] == "TypeError", "active incompatible swap did not throw TypeError")
    diagnostic = rejected["diagnostic"]
    require(diagnostic.get("phase") == "admission" and diagnostic.get("oldUnmounted") is False and
            diagnostic.get("toGeneration") is None,
            "rejected swap diagnostic does not show admission before unmount")
    require(all(value == 0 for value in rejected["candidateCalls"].values()),
            "incompatible candidate methods ran")

    swap = browser["swap"]
    for label in ("rejected", "compatible"):
        before = swap[label]["before"]
        after = swap[label]["after"]
        require(before["snapshot"]["state"] == after["snapshot"]["state"], f"{label} raw state changed")
        require(before["snapshot"]["view"] == after["snapshot"]["view"], f"{label} raw view changed")
        require(before["snapshot"]["dom"] == after["snapshot"]["dom"], f"{label} raw DOM changed")
        require(before["pending"] == after["pending"], f"{label} raw pending effects changed")

    required_rejected = expectations["swap"]["preservedAfterRejectedSwap"]
    required_compatible = expectations["swap"]["compatibleSwapPreserves"]
    require(swap["expectedPreservedAfterRejectedSwap"] == required_rejected and
            swap["observedPreservedAfterRejectedSwap"] == required_rejected,
            "rejected preservation list differs from the literal contract")
    require(swap["compatible"]["expectedPreserved"] == required_compatible and
            swap["compatible"]["observedPreserved"] == required_compatible,
            "compatible preservation list differs from the literal contract")
    require(swap["oldActiveClickAccepted"] is True and
            swap["oldActiveClick"]["after"]["ticks"] == swap["oldActiveClick"]["before"]["ticks"] + 1 and
            swap["oldActiveClick"]["after"]["generation"] == swap["oldActiveClick"]["before"]["generation"],
            "old active click did not continue on the retained lease after rejection")
    require(swap["compatible"]["oldRootDetached"] is True,
            "compatible swap did not detach the old root")
    require(swap["oldCallbackFencedAfterCommit"] is True and
            swap["oldCallbackResult"].get("accepted") is False and
            swap["oldCallbackResult"].get("stale") is True,
            "old callback was not fenced after committed swap")
    fence = swap["oldCallbackFence"]
    require(fence["beforeGeneration"] == fence["afterGeneration"] and
            fence["beforeTrace"] == fence["afterTrace"],
            "fenced callback changed generation or trace")
    require(swap["replyAccepted"] is True and swap["replyResult"].get("accepted") is True,
            "pending request reply was not accepted after compatible swap")
    require(swap["disabledClick"].get("attempted") is True and
            swap["disabledClick"].get("targetDisabled") is True and
            swap["disabledClick"].get("beforeTicks") == swap["disabledClick"].get("afterTicks"),
            "physical disabled Request click changed the trace")

    # Preserve and validate the focus decision as part of the real swap trace.
    # An admission rejection must not ask the rejected candidate to inspect or
    # restore focus. On a committed swap, if the active renderer captured a
    # focus record, the replacement must report restoring it.
    rejected_focus = {
        "captured": rejected["diagnostic"].get("focusCaptured"),
        "restored": rejected["diagnostic"].get("focusRestored"),
        "candidateFocusStateCalls": rejected["candidateCalls"].get("focusState"),
        "candidateRestoreFocusCalls": rejected["candidateCalls"].get("restoreFocus"),
    }
    require(rejected_focus["captured"] is False and rejected_focus["restored"] is False and
            rejected_focus["candidateFocusStateCalls"] == 0 and rejected_focus["candidateRestoreFocusCalls"] == 0,
            "rejected candidate touched focus state before admission")
    compatible_replacements = swap["compatible"]["after"]["diagnostics"].get("replacements", [])
    committed = [row for row in compatible_replacements if row.get("toGeneration") is not None]
    require(committed, "compatible commit has no generation-bearing diagnostic")
    commit_diagnostic = committed[-1]
    require(isinstance(commit_diagnostic.get("focusCaptured"), bool) and
            isinstance(commit_diagnostic.get("focusRestored"), bool),
            "compatible commit omits explicit focus diagnostic booleans")
    require(not commit_diagnostic["focusCaptured"] or commit_diagnostic["focusRestored"],
            "compatible commit captured focus but did not restore it")

    expected_order = [
        "init", "click-add-parent", "click-request-parent", "disabled-request-click-suppressed",
        "reject-incompatible-renderer", "old-active-click-after-rejection", "compatible-renderer-commit",
        "fence-old-callback-after-commit", "deliver-pending-reply",
    ]
    require(swap["eventOrder"] == expected_order, "active swap event order differs")
    trace = swap["finalTrace"]
    expected_messages = [None, {"name": "addParent", "arg": ""}, {"name": "requestParent", "arg": ""},
                         {"name": "addParent", "arg": ""}, {"name": "complete", "arg": swap["requestRecord"]["token"]}]
    require(len(trace["ticks"]) == 5, "active trace does not have five ticks")
    for index, tick in enumerate(trace["ticks"]):
        require(tick["index"] == index and tick["message"] == expected_messages[index],
                f"trace tick {index} message/order differs")
        expected_dispatch = None if index == 0 else f"dispatch-{index:04d}"
        require(tick["dispatchId"] == expected_dispatch, f"trace tick {index} dispatch ID differs")
    request = trace["ticks"][2]["requestedEffects"]
    require(len(request) == 1 and request[0]["effect"]["arg"] == swap["requestRecord"]["token"],
            "request effect is missing or does not match the captured token")
    completed = trace["ticks"][4]["completedEffects"]
    require(len(completed) == 1 and completed[0]["message"] == expected_messages[4],
            "completion tick is not correlated to the pending request")
    require(swap["finalSnapshot"]["state"] != swap["compatible"]["after"]["snapshot"]["state"],
            "reply delivery did not update final state")
    require(browser.get("pageErrors") == [], "capability browser reported page errors")
    require(browser.get("noWasm", {}).get("apiAttempts") == [] and
            browser.get("noWasm", {}).get("wasmRequests") == [],
            "capability browser used a WebAssembly API or request")

    mutations = check.get("capabilityMutationControls", [])
    expected_mutations = [
        "rejected-state", "rejected-view", "rejected-dom", "rejected-pending",
        "compatible-state", "compatible-view", "compatible-dom", "compatible-pending",
        "host-option-accessor-construction",
    ]
    require([item["id"] for item in mutations] == expected_mutations and len(mutations) == 9,
            "capture-data mutation-control IDs/order differ")
    require(all(item.get("detected") is True and item.get("error") not in
                (None, "checker accepted mutated raw capture") for item in mutations),
            "a capture-data mutation was not detected")
    require(check.get("capabilityMutationControlsDetected") == 9,
            "check summary does not report all nine capture-data mutations detected")
    require(check["swap"]["rejected"].get("rawPreservationVerified") is True and
            check["swap"]["compatible"].get("rawPreservationVerified") is True,
            "check summary omits raw-preservation verification")

    # Check the inherited lifecycle raw summary and all named controls.
    require(inherited_check.get("swaps") == 17, "inherited lifecycle did not perform 17 swaps")
    lifecycle_mutations = inherited_check.get("mutationControls", [])
    require(len(lifecycle_mutations) == 8 and inherited_check.get("mutationControlsDetected") == 8,
            "inherited lifecycle controls do not report 8/8")
    require(all(item.get("detected") is True for item in lifecycle_mutations),
            "an inherited lifecycle mutation control was not detected")
    require(inherited_check.get("ticks") == 26 and inherited_check.get("events") == 26,
            "inherited lifecycle raw event/tick counts differ")
    require(inherited_browser.get("schema") == "gobi.compiled-lifecycle-browser/v1" and
            inherited_browser.get("pageErrors") == [], "inherited browser summary has page errors or wrong schema")

    # Tie raw outputs back to the conformance runner's own source/build/evidence
    # pins and compare the relevant source files with those pinned rows.
    source_before = capability_run.get("sourcePinsBefore", [])
    source_final = capability_run.get("sourcePinsFinal", [])
    require(source_before == source_final and capability_run.get("sourcesStableBeforeCheck") is True and
            capability_run.get("sourceStableThroughCheck") is True,
            "conformance source pins changed during the run")
    source_pin_map = {row["path"]: row for row in source_final}
    capability_sources = [
        "compiled-capabilities/conformance/capability-browser-entry.mjs",
        "compiled-capabilities/conformance/capability-browser.mjs",
        "compiled-capabilities/conformance/check.mjs",
        "compiled-capabilities/conformance/run.mjs",
        "compiled-capabilities/oracle/expectations.json",
        "fixtures/compiled/lifecycle/scenario.json",
    ]
    lifecycle_source_before = lifecycle_run.get("sourcePinsBefore", [])
    lifecycle_source_final = lifecycle_run.get("sourcePinsFinal", [])
    require(lifecycle_source_before == lifecycle_source_final and
            lifecycle_run.get("sourcesStable") is True and
            lifecycle_run.get("sourceStableThroughCheck") is True,
            "inherited lifecycle source pins changed during the run")
    lifecycle_source_map = {row["path"]: row for row in lifecycle_source_final}
    lifecycle_sources = [
        "compiled-lifecycle/conformance/browser-entry.mjs",
        "compiled-lifecycle/conformance/browser.mjs",
        "compiled-lifecycle/conformance/check.mjs",
        "compiled-lifecycle/conformance/run.mjs",
        "compiled-lifecycle/conformance/lifecycle-contract.json",
        "compiled-lifecycle/conformance/swap-schedule.json",
        "compiled-lifecycle/runtime/runtime.mjs",
        "fixtures/compiled/lifecycle/scenario.json",
    ]
    for source_map, relevant_sources, label in (
        (source_pin_map, capability_sources, "capability"),
        (lifecycle_source_map, lifecycle_sources, "inherited lifecycle"),
    ):
        for relpath in relevant_sources:
            row = source_map.get(relpath)
            require(row is not None, f"{label} source pin missing for {relpath}")
            source_file = Path.cwd() / relpath
            require(source_file.exists() and source_file.stat().st_size == row["bytes"] and
                    digest(source_file) == row["sha256"], f"{label} source differs from pinned bytes: {relpath}")

    before_build_pins = capability_run.get("buildOutputPinsBeforeCheck", [])
    after_build_pins = capability_run.get("buildOutputPinsAfterCheck", [])
    require(before_build_pins == after_build_pins and capability_run.get("buildOutputsStableThroughCheck") is True,
            "React/DOM compiled build outputs changed during the conformance check")
    for app_ir_path in (args.react_app_ir.resolve(), args.dom_app_ir.resolve()):
        pin = next((row for row in before_build_pins if row["path"].endswith(str(app_ir_path).split("/compiled-capabilities/", 1)[-1])), None)
        # The original absolute input paths may differ from an extracted artifact
        # root; also match the stable backend/app suffix in that case.
        if pin is None:
            backend = "react" if app_ir_path == args.react_app_ir.resolve() else "dom"
            suffix = f"/{backend}/output/apps/"
            pin = next((row for row in before_build_pins
                        if row["path"].endswith(app_ir_path.name) and suffix in row["path"]), None)
        require(pin is not None, f"AppIR build pin missing for {app_ir_path}")
        require(app_ir_path.stat().st_size == pin["bytes"] and digest(app_ir_path) == pin["sha256"],
                f"AppIR bytes differ from build output pin: {app_ir_path}")

    evidence_pins = {Path(row["path"]).name: row for row in capability_run.get("evidencePins", [])}
    for path in (browser_path, check_path):
        row = evidence_pins.get(path.name)
        require(row is not None and path.stat().st_size == row["bytes"] and digest(path) == row["sha256"],
                f"raw capability evidence differs from its runner evidence pin: {path.name}")
    bundle_meta = browser.get("browserBundle", {})
    bundle_original = Path(bundle_meta.get("path", ""))
    bundle_candidates = []
    if bundle_original.exists():
        bundle_candidates.append(bundle_original.resolve())
    search_roots = [attempt, *(root.resolve() for root in args.bundle_root), Path.cwd()]
    bundle_name = bundle_original.name
    for search_root in search_roots:
        if search_root.exists():
            bundle_candidates.extend(candidate.resolve() for candidate in search_root.rglob(bundle_name)
                                     if candidate.is_file())
    bundle_paths = sorted({path for path in bundle_candidates
                           if path.stat().st_size == bundle_meta.get("bytes") and
                           digest(path) == bundle_meta.get("sha256")}, key=str)
    require(bundle_paths, "pinned browser bundle is missing from the local or supplied artifact roots")
    if args.require_bundle_root is not None:
        required_bundle_root = args.require_bundle_root.resolve()
        require(any(path.is_relative_to(required_bundle_root) for path in bundle_paths),
                f"pinned browser bundle is not present under required artifact root {required_bundle_root}")
    bundle_path = bundle_paths[0]

    paths = [browser_path, check_path, capability_run_path, lifecycle_run_path,
             execution_path, lifecycle_check_path, lifecycle_browser_path, args.react_app_ir.resolve(),
             args.dom_app_ir.resolve(), args.expectations.resolve()]
    result = {
        "schema": "gobi.current-full-browser-audit/v1",
        "status": "passed",
        "attemptRoot": str(attempt),
        "fullRunnerStatus": execution.get("status"),
        "fullRunnerFailedStages": [stage.get("name") for stage in execution.get("stages", [])
                                   if stage.get("status") == "failed"],
        "fullRunnerSourcePins": len(full_source_pins),
        "fullRunnerSourcePinsStable": True,
        "fullRunnerCommandCount": len(execution.get("commands", [])),
        "fullRunnerAllRecordedCommandsExitZero": all(command.get("exitCode") == 0
                                                       for command in execution.get("commands", [])),
        "publicationBinding": {
            "path": str(binding_path),
            "sha256": digest(binding_path),
            "localCommit": binding["local"]["commit"],
            "publishedCommit": binding["remote"]["commit"],
            "tree": binding["local"]["tree"],
            "directParent": binding["local"]["parents"][0],
        },
        "capabilityAdmissionRows": raw_admission_counts,
        "actualAppIR": {
            "path": str(args.react_app_ir.resolve()),
            "componentId": component_id,
            "capabilities": component["capabilities"],
            "requiredRendererCapabilities": actual_required,
            "rejectedCandidateCapabilities": candidate,
            "missingCapability": rejected["missingCapability"],
        },
        "rawSwap": {
            "rejectedSnapshotPreserved": True,
            "compatibleSnapshotPreserved": True,
            "oldActiveClickContinued": True,
            "oldCallbackFencedAfterCommit": True,
            "pendingReplyAccepted": True,
            "physicalDisabledClickSuppressed": True,
            "fiveTickTrace": True,
            "eventOrder": expected_order,
        },
        "focus": {
            "rejected": rejected_focus,
            "compatibleCommit": {
                "focusCaptured": commit_diagnostic["focusCaptured"],
                "focusRestored": commit_diagnostic["focusRestored"],
                "generation": commit_diagnostic.get("toGeneration"),
            },
            "matchingBrowserBundlePaths": [str(path) for path in bundle_paths],
        },
        "mutationControls": {"captureDataDetected": len(mutations),
                              "inheritedLifecycleDetected": len(lifecycle_mutations)},
        "inheritedLifecycle": {"swaps": inherited_check["swaps"], "ticks": inherited_check["ticks"],
                               "events": inherited_check["events"]},
        "lifecycleSourcePinCount": len(lifecycle_source_final),
        "evidenceSha256": {str(path): digest(path) for path in paths},
        "browserBundleSha256": bundle_meta["sha256"],
        "sourcePinCount": len(source_final),
        "buildOutputPinCount": len(before_build_pins),
        "sourcePinsStable": True,
        "buildOutputPinsStable": True,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
