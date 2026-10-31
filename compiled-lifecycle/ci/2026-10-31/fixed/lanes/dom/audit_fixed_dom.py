#!/usr/bin/env python3
"""Bounded independent audit of the current 00da primary lifecycle artifact."""
import hashlib
import json
import math
import pathlib
import struct
import subprocess

ROOT = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
FIXED = ROOT / "compiled-lifecycle/ci/2026-10-31/fixed"
EXTRACTED = FIXED / "extracted"
ATTEMPT_REL = "compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z"
ATTEMPT = EXTRACTED / ATTEMPT_REL
MATRIX = ATTEMPT / "matrix"
SOURCE_COMMIT = "00da54ad0f5a4006b13a5cded18ce291845978bc"
SOURCE_TREE = "51b64a89b5f7e0edd4792becbed9adad6a27a698"
ZIP_PATH = pathlib.Path("/tmp/gobi-compiled-lifecycle-41181505234.zip")
EXPECTED_ZIP_BYTES = 47_072_021
EXPECTED_ZIP_SHA256 = "0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26"
PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
NODE = pathlib.Path("/tmp/gondola-node22/node_modules/node/bin/node")


def require(ok, message):
    if not ok:
        raise AssertionError(message)


def sha_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def readj(path):
    return json.loads(path.read_text())


def decode(value):
    """Decode the compiler's typed JSON Value form to ordinary Go-like values."""
    if isinstance(value, list):
        return [decode(item) for item in value]
    if not isinstance(value, dict):
        return value
    kind = value.get("kind")
    if kind == "struct" and "typeId" in value:
        return {field["name"]: decode(field["value"]) for field in value["fields"]}
    if kind == "slice" and "typeId" in value:
        return [decode(item) for item in value.get("items", [])]
    if kind in ("uint", "int") and "integer" in value:
        return int(value["integer"])
    if kind == "float64" and "float64Bits" in value:
        return struct.unpack(">d", bytes.fromhex(value["float64Bits"]))[0]
    if kind == "string" and "string" in value:
        return value["string"]
    if kind == "bool" and "bool" in value:
        return value["bool"]
    return {key: decode(item) for key, item in value.items()}


def trace_projection(tick):
    fields = ("index", "message", "dispatchId", "state", "requestedEffects", "completedEffects", "view")
    return {key: tick.get(key) for key in fields}


def expected_effect_records(steps, probes):
    records = []
    requests = {}
    sequence = 0
    for index, step in enumerate(steps):
        for effect_index, effect in enumerate(step.get("effects", [])):
            token = effect["arg"]
            sequence += 1
            if effect["kind"] == "fixture.request":
                correlation = {"dispatchId": f"dispatch-{step['stateIndex']:04d}", "effectIndex": 0}
                requests[token] = correlation
                records.append({"sequence": sequence, "kind": "request", **correlation,
                    "token": token, "outcome": "queued"})
            elif effect["kind"] == "lifecycle.cancel":
                require(token in requests, f"oracle cancellation has no request: {token}")
                records.append({"sequence": sequence, "kind": "cancel",
                    "dispatchId": f"dispatch-{step['stateIndex']:04d}", "effectIndex": effect_index,
                    "token": token, "target": requests[token], "outcome": "cancelled"})
            else:
                raise AssertionError(f"unsupported effect in literal oracle: {effect['kind']}")
        for probe in probes:
            if probe["afterEvent"] == index and probe["expectRuntimeCompletion"] == "rejected-cancelled":
                token = probe["token"]
                require(token in requests, f"retired callback has no request: {token}")
                sequence += 1
                records.append({"sequence": sequence, "kind": "force-deliver-retired", **requests[token],
                    "token": token, "outcome": "rejected", "message": {"name": "complete", "arg": token},
                    "runtimeResult": {"accepted": False, "error": "unknown or extra effect completion"}})
        if step["kind"] == "effect-reply":
            token = step["token"]
            require(token in requests, f"reply has no request: {token}")
            sequence += 1
            records.append({"sequence": sequence, "kind": "deliver", **requests[token], "token": token,
                "outcome": "accepted", "message": step["message"],
                "runtimeResult": {"accepted": True, "dispatchId": f"dispatch-{step['stateIndex']:04d}"}})
    return records


def expected_direct_effect_records(steps):
    records = []
    requests = {}
    sequence = 0
    for step in steps:
        if step["kind"] == "effect-reply":
            token = step["token"]
            require(token in requests, f"direct reply has no request: {token}")
            sequence += 1
            records.append({"sequence": sequence, "kind": "deliver", **requests[token], "token": token,
                "outcome": "accepted", "message": step["message"]})
        for effect_index, effect in enumerate(step.get("effects", [])):
            token = effect["arg"]
            sequence += 1
            if effect["kind"] == "fixture.request":
                correlation = {"dispatchId": f"dispatch-{step['stateIndex']:04d}", "effectIndex": 0}
                requests[token] = correlation
                records.append({"sequence": sequence, "kind": "request", **correlation,
                    "token": token, "outcome": "queued"})
            elif effect["kind"] == "lifecycle.cancel":
                require(token in requests, f"direct cancellation has no request: {token}")
                records.append({"sequence": sequence, "kind": "cancel",
                    "dispatchId": f"dispatch-{step['stateIndex']:04d}", "effectIndex": effect_index,
                    "token": token, "target": requests[token], "outcome": "cancelled"})
            else:
                raise AssertionError(f"unsupported direct effect: {effect['kind']}")
    return records


def expected_controls(state):
    controls = []

    def add(path, key, disabled):
        controls.append({"path": path, "key": key, "tag": "button", "type": "submit",
            "value": "", "checked": False, "disabled": disabled})

    parent = state["Parent"]
    if parent["Alive"]:
        add("0/1", "parent-add", False)
        add("0/2", "parent-request", parent["Requested"])
        child = state["Child"]
        if child["Alive"]:
            add("0/3/1", "child-add", False)
            add("0/3/2", "child-request", child["Requested"])
            grandchild = state["Grandchild"]
            if grandchild["Alive"]:
                add("0/3/3/1", "grandchild-add", False)
                add("0/3/3/2", "grandchild-request", grandchild["Requested"])
    sibling = state["Sibling"]
    add("1/1", "sibling-add", False)
    add("1/2", "sibling-request", sibling["Requested"])
    add("2/0", "parent-remove", not parent["Alive"])
    add("2/1", "parent-remount", parent["Alive"])
    return controls


def main():
    provider = readj(FIXED / "provider-download.json")
    require(provider["artifactId"] == 13035044166 and provider["run"] == 41181505234, "provider artifact/run identity")
    require(provider["providerRunConclusion"] == "success", "primary provider run did not pass")
    require(provider["source"] == SOURCE_COMMIT and provider["tree"] == SOURCE_TREE, "provider source identity")
    require(ZIP_PATH.is_file() and ZIP_PATH.stat().st_size == EXPECTED_ZIP_BYTES, "retained ZIP size")
    zip_sha = sha_file(ZIP_PATH)
    require(zip_sha == EXPECTED_ZIP_SHA256 == provider["sha256"], "retained provider ZIP SHA-256")
    require(provider["bytes"] == EXPECTED_ZIP_BYTES, "provider ZIP byte count")

    git_tree = subprocess.check_output(["git", "rev-parse", f"{SOURCE_COMMIT}^{{tree}}"], cwd=ROOT, text=True).strip()
    require(git_tree == SOURCE_TREE, "00da commit tree identity")
    current_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()

    scenario_path = ROOT / "fixtures/compiled/lifecycle/scenario.json"
    scenario = readj(scenario_path)
    run = readj(MATRIX / "lifecycle.run.json")
    check = readj(MATRIX / "lifecycle.check.json")
    manifest = readj(MATRIX / "lifecycle.manifest.json")
    native = readj(MATRIX / "lifecycle.native.json")
    direct = readj(MATRIX / "lifecycle.direct.json")
    browser = readj(MATRIX / "lifecycle.browser.capture.json")

    require(run["status"] == "matched" and check["status"] == "matched" and manifest["status"] == "matched", "complete lifecycle checker status")
    require(run["summary"] == check, "run summary and complete checker output differ")
    require(all(stage["status"] == "completed" for stage in run["stages"]), "a lifecycle run stage did not complete")
    require(run["sourcesStable"] and run["sourceStableThroughCheck"] and run["buildOutputsStableThroughCheck"], "recorded source/output stability flags")
    require(run["sourcePinsBefore"] == run["sourcePinsAfter"] == run["sourcePinsFinal"], "lifecycle source pin arrays changed")
    require(run["buildOutputPinsBeforeCheck"] == run["buildOutputPinsAfterCheck"], "build output pins changed through checker")

    pin_rows = run["sourcePinsBefore"]
    require(len(pin_rows) == 179 and len({row["path"] for row in pin_rows}) == 179, "lifecycle source/build pin inventory")
    pin_mismatches = []
    input_pin_rows = []
    generated_pin_rows = []
    for row in pin_rows:
        if row["path"].startswith(f"compiled-lifecycle/builds/attempts/{ATTEMPT_REL.split('/')[-1]}/"):
            generated_pin_rows.append(row)
            local = EXTRACTED / row["path"]
            if not local.is_file() or local.stat().st_size != row["bytes"] or sha_file(local) != row["sha256"]:
                pin_mismatches.append(row["path"])
        else:
            input_pin_rows.append(row)
            result = subprocess.run(["git", "show", f"{SOURCE_COMMIT}:{row['path']}"], cwd=ROOT,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if result.returncode != 0 or len(result.stdout) != row["bytes"] or hashlib.sha256(result.stdout).hexdigest() != row["sha256"]:
                pin_mismatches.append(row["path"])
    require(not pin_mismatches, f"source pin mismatch against immutable source commit: {pin_mismatches[:5]}")

    for row in run["buildOutputPinsBeforeCheck"]:
        path = EXTRACTED / row["path"]
        require(path.is_file() and path.stat().st_size == row["bytes"] and sha_file(path) == row["sha256"],
            f"archived BuildResult output pin mismatch: {row['path']}")
    evidence_paths = {
        "lifecycle.native.json": MATRIX / "lifecycle.native.json",
        "lifecycle.direct.json": MATRIX / "lifecycle.direct.json",
        "lifecycle.browser.json": MATRIX / "lifecycle.browser.json",
        "lifecycle.browser.capture.json": MATRIX / "lifecycle.browser.capture.json",
        "lifecycle.check.json": MATRIX / "lifecycle.check.json",
    }
    evidence_hashes = {}
    for row in run["evidencePins"]:
        local = evidence_paths[pathlib.PurePosixPath(row["path"]).name]
        require(local.is_file() and local.stat().st_size == row["bytes"] and sha_file(local) == row["sha256"],
            f"matrix evidence pin mismatch: {row['path']}")
        evidence_hashes[local.name] = {"bytes": row["bytes"], "sha256": row["sha256"]}

    # Materialize only the pure hand-authored literal oracle; this does not run the app or its tests.
    oracle_export = """
import {LIFECYCLE_STATES,LIFECYCLE_STEPS,LIFECYCLE_PROBES,expectedLifecycleView,expectedLifecycleDOM,expectedLifecyclePhysicalControls} from './compiled-lifecycle/browser/lifecycle-oracle.mjs';
const out={states:LIFECYCLE_STATES,steps:LIFECYCLE_STEPS,probes:LIFECYCLE_PROBES,views:LIFECYCLE_STATES.map(expectedLifecycleView),doms:LIFECYCLE_STATES.map(expectedLifecycleDOM),controls:LIFECYCLE_STATES.map(expectedLifecyclePhysicalControls)};
process.stdout.write(JSON.stringify(out));
"""
    oracle_process = subprocess.run([str(NODE), "--input-type=module", "-e", oracle_export], cwd=ROOT,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    oracle_bytes = oracle_process.stdout
    oracle = json.loads(oracle_bytes)
    states, steps, probes = oracle["states"], oracle["steps"], oracle["probes"]
    require(len(states) == 26 and len(steps) == 26 and len(probes) == 5, "literal oracle dimensions")
    require(scenario["componentID"] == PACKAGE and scenario["packagePath"] == PACKAGE, "fixture package identity")
    require(scenario["name"] == "compiled-lifecycle-parent-child-grandchild-remount-fence" and len(scenario["events"]) == 26,
        "fixture identity/event count")
    require(native["componentID"] == PACKAGE and direct["componentID"] == PACKAGE and browser["componentID"] == PACKAGE,
        "native/direct/browser component identity")
    require(native["packagePath"] == PACKAGE and direct["packagePath"] == PACKAGE and browser["packagePath"] == PACKAGE,
        "native/direct/browser package path")
    require(native["steps"] and len(native["steps"]) == 26, "native event count")
    require(len(direct["steps"]) == 26 and len(direct["trace"]["ticks"]) == 26, "direct event/tick count")
    require(native["initialState"] == states[0], "native initial state vs literal oracle")

    for index, step in enumerate(steps):
        native_step = native["steps"][index]
        direct_step = direct["steps"][index]
        expected_state = states[step["stateIndex"]]
        require(native_step["index"] == index and native_step["kind"] == step["kind"], f"native event index/kind {index}")
        require(native_step["message"] == (None if step["kind"] == "renderer-swap" else step.get("message")), f"native message {index}")
        require(native_step["effects"] == step.get("effects", []), f"native ordered effects {index}")
        require(native_step["state"] == expected_state, f"native Go state vs literal state {index}")
        require(native_step["view"] == oracle["views"][step["stateIndex"]]["tree"], f"native View tree vs literal View {index}")
        require(direct_step["eventIndex"] == index and direct_step["event"] == scenario["events"][index], f"direct fixture event {index}")
        require(direct_step["message"] == native_step["message"], f"native/direct message {index}")
        require(decode(direct_step["state"]) == expected_state, f"direct typed Go state vs literal state {index}")
        require(direct_step["view"] == oracle["views"][step["stateIndex"]], f"direct View record vs literal View {index}")
        require([row["effect"] for row in direct_step["requestedEffects"]] == step.get("effects", []), f"direct effect projection {index}")

    for checkpoint in scenario["expectedStates"]:
        event_index = checkpoint["afterEvent"]
        state_index = 0 if event_index < 0 else steps[event_index]["stateIndex"]
        expected_state = states[state_index]
        actual_nodes = [expected_state[key] for key in ("Parent", "Child", "Grandchild", "Sibling")]
        for field, names in (("generations", "Generation"), ("requestIDs", "RequestID"), ("alive", "Alive"),
                ("requested", "Requested"), ("pending", "Pending"), ("tokens", "Token"), ("replies", "Reply")):
            require([node[names] for node in actual_nodes] == checkpoint[field],
                f"fixture expected state {event_index} field {field}")
        require([node["Counter"]["Count"] for node in actual_nodes] == checkpoint["counts"],
            f"fixture expected state {event_index} counters")
        require(expected_state["NextRequestID"] == checkpoint["nextRequestID"],
            f"fixture expected state {event_index} request sequence")

    core_names = ("index", "message", "dispatchId", "state", "requestedEffects", "completedEffects", "view")
    tick_by_state = {step["stateIndex"]: step for step in steps if step["kind"] != "renderer-swap"}
    requests = {}
    for step in steps:
        for effect in step.get("effects", []):
            if effect["kind"] == "fixture.request":
                requests[effect["arg"]] = {"dispatchId": f"dispatch-{step['stateIndex']:04d}", "effectIndex": 0}
    for tick_index in range(26):
        expected_step = tick_by_state.get(tick_index)
        expected_message = expected_step.get("message") if expected_step else None
        expected_dispatch = f"dispatch-{tick_index:04d}" if expected_step else None
        expected_requested = [] if expected_step is None else [
            {"dispatchId": expected_dispatch, "effectIndex": i, "effect": effect}
            for i, effect in enumerate(expected_step.get("effects", []))
        ]
        expected_completed = []
        if expected_step and expected_step["kind"] == "effect-reply":
            corr = requests[expected_step["token"]]
            expected_completed = [{**corr, "message": expected_step["message"]}]
        direct_tick = direct["trace"]["ticks"][tick_index]
        require(direct_tick["index"] == tick_index and decode(direct_tick["state"]) == states[tick_index], f"direct trace state {tick_index}")
        require(direct_tick["message"] == expected_message and direct_tick["dispatchId"] == expected_dispatch,
            f"direct trace message/correlation {tick_index}")
        require(direct_tick["requestedEffects"] == expected_requested and direct_tick["completedEffects"] == expected_completed,
            f"direct trace effects {tick_index}")
        require(direct_tick["view"] == oracle["views"][tick_index] and direct_tick["dom"] is None,
            f"direct trace View/DOM projection {tick_index}")

    profile_summaries = {}
    total_snapshots = 0
    total_live_control_properties = 0
    total_disabled_properties = 0
    total_active_clicks = 0
    total_detached_clicks = 0
    for profile_name in ("react", "dom", "swap"):
        profile = browser["profiles"][profile_name]
        require(profile["backend"] == profile_name and profile["componentId"] == PACKAGE and profile["appId"] == PACKAGE,
            f"browser profile identity {profile_name}")
        require(len(profile["trace"]["ticks"]) == 26 and len(profile["events"]) == 26, f"browser trace/event count {profile_name}")
        require(len(profile["actions"]) == 16 and len(profile["snapshots"]) == 27, f"browser actions/snapshots {profile_name}")
        for tick_index, tick in enumerate(profile["trace"]["ticks"]):
            require(tick["index"] == tick_index and decode(tick["state"]) == states[tick_index], f"{profile_name} browser Go state {tick_index}")
            require(tick["view"] == oracle["views"][tick_index] and tick["dom"] == oracle["doms"][tick_index],
                f"{profile_name} browser View/DOM trace {tick_index}")
            require(trace_projection(tick) == trace_projection(direct["trace"]["ticks"][tick_index]),
                f"direct/browser full Go projection {profile_name}:{tick_index}")
        for snap_index, snapshot in enumerate(profile["snapshots"]):
            state_index = snapshot["stateIndex"]
            require(0 <= state_index < 26 and snapshot["traceTickIndex"] == state_index, f"snapshot tick index {profile_name}:{snap_index}")
            require(snapshot["traceTick"] == profile["trace"]["ticks"][state_index], f"snapshot trace binding {profile_name}:{snap_index}")
            expected_dom = oracle["doms"][state_index]
            expected_control_rows = [{k: v for k, v in c.items() if k != "text"} for c in oracle["controls"][state_index]]
            physical = snapshot["physicalDOM"]
            require(physical == expected_dom, f"actual physical DOM/live control properties vs literal DOM {profile_name}:{snap_index}")
            require(snapshot["expectedDOM"] == expected_dom and snapshot["rendererSnapshot"] == expected_dom,
                f"literal/renderer DOM snapshot {profile_name}:{snap_index}")
            require(snapshot["runtimeSnapshot"]["dom"] == expected_dom, f"runtime DOM snapshot {profile_name}:{snap_index}")
            require(physical["controls"] == expected_control_rows, f"live disabled properties vs literal controls {profile_name}:{snap_index}")
            require(all(isinstance(c["disabled"], bool) for c in physical["controls"]), f"disabled is not a boolean property {profile_name}:{snap_index}")
            total_snapshots += 1
            total_live_control_properties += len(physical["controls"])
            total_disabled_properties += sum(1 for c in physical["controls"] if c["disabled"])

        click_index = 0
        for event_index, step in enumerate(steps):
            event_record = profile["events"][event_index]
            require(event_record["eventIndex"] == event_index and event_record["event"] == scenario["events"][event_index],
                f"browser event binding {profile_name}:{event_index}")
            require(event_record["stateIndex"] == step["stateIndex"], f"browser event state index {profile_name}:{event_index}")
            if step["kind"] != "click":
                continue
            action = profile["actions"][click_index]
            pre_state = states[step["stateIndex"] - 1]
            control = next(c for c in oracle["controls"][step["stateIndex"] - 1] if c["path"] == step["action"]["path"])
            expected_target = {"connected": True, "disabled": control["disabled"], "value": step["action"]["value"],
                "type": control["type"], "text": control["text"]}
            require(action["eventIndex"] == event_index and action["method"] == "HTMLElement.click" and action["attempted"],
                f"physical click method/attempt {profile_name}:{click_index}")
            require(action["action"] == step["action"] and action["expectedMessage"] == step["message"],
                f"physical click action/message {profile_name}:{click_index}")
            require(action["target"] == expected_target, f"physical click target/live disabled property {profile_name}:{click_index}")
            require(action["afterTicks"] == action["beforeTicks"] + 1, f"physical click Go tick {profile_name}:{click_index}")
            click_index += 1
            total_active_clicks += 1
        require(click_index == 16, f"physical active click count {profile_name}")

        stale_rows = profile["stalePhysicalClicks"]
        require(len(stale_rows) == 1 and stale_rows[0]["eventIndex"] == 10, f"detached click event {profile_name}")
        stale = stale_rows[0]
        require(len(stale["attempts"]) == 6, f"detached click count {profile_name}")
        expected_detached = [("0/1", "addParent"), ("0/2", "requestParent"), ("0/3/1", "addChild"),
            ("0/3/2", "requestChild"), ("0/3/3/1", "addGrandchild"), ("0/3/3/2", "requestGrandchild")]
        for attempt, (path, message) in zip(stale["attempts"], expected_detached):
            require(attempt["path"] == path and attempt["message"] == {"name": message, "arg": ""},
                f"detached probe target {profile_name}:{path}")
            require(attempt["method"] == "retained-detached-HTMLElement.click" and attempt["attempted"],
                f"detached probe method {profile_name}:{path}")
            require(attempt["targetBefore"]["connected"] is False and attempt["targetConnectedAfter"] is False,
                f"detached probe connectivity {profile_name}:{path}")
            total_detached_clicks += 1
        for key in ("trace", "snapshot", "callbacks", "pending", "effectRecords", "physicalHTML"):
            require(stale["before"][key] == stale["after"][key], f"detached click changed {key} in {profile_name}")
        require(profile["pendingAtEnd"] == [] and profile["pageErrors"] == [], f"browser terminal queue/errors {profile_name}")
        require(profile["noWasm"]["apiAttempts"] == [] and profile["noWasm"]["wasmRequests"] == [], f"browser WASM probes {profile_name}")
        require(profile["unmount"]["physicalDOM"]["html"] == "" and profile["unmount"]["physicalDOM"]["controls"] == 0,
            f"browser unmount left DOM {profile_name}")
        profile_summaries[profile_name] = {
            "ticks": len(profile["trace"]["ticks"]), "events": len(profile["events"]),
            "physical_snapshots": len(profile["snapshots"]), "active_clicks": len(profile["actions"]),
            "detached_clicks": len(stale["attempts"]), "effect_records": len(profile["effectRecords"]),
            "pending_at_end": len(profile["pendingAtEnd"]), "page_errors": len(profile["pageErrors"]),
            "dom_html_and_live_controls_match_literal_oracle": True,
        }

    require(total_snapshots == 81 and total_active_clicks == 48 and total_detached_clicks == 18, "physical browser evidence aggregate counts")
    direct_expected_effects = expected_direct_effect_records(steps)
    require(direct["effectRecords"] == direct_expected_effects and direct["pending"] == [], "direct full ordered effects/pending queue")
    expected_browser_effects = expected_effect_records(steps, probes)
    for profile_name in ("react", "dom", "swap"):
        profile = browser["profiles"][profile_name]
        require(profile["effectRecords"] == expected_browser_effects, f"browser full effect trace vs literal oracle {profile_name}")
    request_tokens = [row["token"] for row in direct["effectRecords"] if row["kind"] == "request"]
    cancel_order = [row["token"] for row in direct["effectRecords"] if row["kind"] == "cancel"]
    require(request_tokens == ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4",
        "parent:g2:r5", "child:g2:r6", "grandchild:g2:r7"], "request token sequence")
    require(cancel_order == ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], "subtree cancellation order")

    # Explicit lifecycle semantics around removal, remount, and old replies.
    removed = native["steps"][9]["state"]
    remounted = native["steps"][10]["state"]
    require(not removed["Parent"]["Alive"] and not removed["Child"]["Alive"] and not removed["Grandchild"]["Alive"],
        "removeParent did not retire the subtree")
    require(removed["Sibling"]["Alive"] and removed["Sibling"]["Pending"] and removed["Sibling"]["Token"] == "sibling:g1:r4",
        "removeParent did not preserve pending sibling")
    require(all(remounted[name]["Alive"] and remounted[name]["Generation"] == 2 and remounted[name]["Counter"]["Count"] == 0
        for name in ("Parent", "Child", "Grandchild")), "remount did not create a fresh generation-2 subtree")
    require(remounted["Sibling"] == removed["Sibling"], "remount changed the independent sibling")
    for event_index in (11, 12, 13):
        require(native["steps"][event_index]["state"] == remounted, f"old generation-1 message mutated remounted state at event {event_index}")
    require(native["steps"][15]["state"] == native["steps"][14]["state"], "duplicate sibling completion changed state")
    require(native["steps"][25]["state"] == native["steps"][24]["state"], "duplicate generation-2 child completion changed state")

    swap_profile = browser["profiles"]["swap"]
    swaps = swap_profile["swaps"]
    require(len(swaps) == 17, "renderer swap count")
    eligible = [row for row in swaps if row["after"]["retiredCallbacks"]["eligible"]]
    ineligible = [row for row in swaps if not row["after"]["retiredCallbacks"]["eligible"]]
    fence_count = 0
    for row in eligible:
        retired = row["after"]["retiredCallbacks"]
        require(retired["dispatch"]["accepted"] is False and retired["dispatch"]["stale"] is True,
            f"retired dispatch callback not fenced at {row['reason']}")
        require(retired["stale"]["accepted"] is False and retired["stale"]["stale"] is True,
            f"retired stale callback not fenced at {row['reason']}")
        before_n = len(retired["before"]["diagnostics"]["fencedCallbacks"])
        after_n = len(retired["after"]["diagnostics"]["fencedCallbacks"])
        require(after_n - before_n == 2, f"expected two retired callback fences at {row['reason']}")
        fence_count += after_n - before_n
    require(len(eligible) == 16 and len(ineligible) == 1 and fence_count == 32, "callback fence counts")
    fixed_swap = next(row for row in swaps if row["reason"] == "fixture-renderer-swap-8")
    pending_tokens = ["parent:g1:r1", "child:g1:r2", "grandchild:g1:r3", "sibling:g1:r4"]
    require([row["token"] for row in fixed_swap["before"]["pending"]] == pending_tokens, "pending effects before fixed swap")
    require(fixed_swap["after"]["pending"] == fixed_swap["before"]["pending"], "pending correlations lost across fixed renderer swap")
    require(browser["profiles"]["swap"]["rendererSequence"][-1]["backend"] == "react", "swap profile terminal renderer")

    expected_mutations = ["native-child-first-cancel-order", "direct-old-generation-state", "direct-message",
        "react-physical-dom", "dom-disabled-control", "swap-effect-correlation", "remounted-detached-button", "cancel-order-literal"]
    mutations = check["mutationControls"]
    require([row["name"] for row in mutations] == expected_mutations and all(row["detected"] for row in mutations),
        "eight complete-checker mutation controls")
    require(check["mutationControlsDetected"] == 8 and check["nativeTraceCheckedAgainstLiteralOracle"] and
        check["directTraceCheckedAgainstLiteralOracle"] and check["browserTracesCheckedAgainstLiteralOracle"] and
        check["physicalDOMCheckedAgainstLiteralOracle"], "complete checker literal oracle flags")
    require(check["events"] == 26 and check["ticks"] == 26 and check["clicks"] == 16 and check["swaps"] == 17 and
        check["requests"] == 7 and check["cancellations"] == 3 and check["stalePhysicalClicksAcrossProfiles"] == 18 and
        check["retiredRendererFences"] == 32 and check["callbackFenceEligibleSwaps"] == 16 and
        check["callbackFenceIneligibleSwaps"] == 1, "checker count summary")

    react_app = readj(ATTEMPT / "react/output/apps/lifecycle-7e6575d90707/app-ir.json")
    dom_app = readj(ATTEMPT / "dom/output/apps/lifecycle-7e6575d90707/app-ir.json")
    component = next(row for row in react_app["components"] if row["packagePath"] == PACKAGE)
    require(react_app == dom_app and component["id"] == PACKAGE and "effect.request-reply" in component["capabilities"],
        "React/DOM AppIR identity/capability")
    react_module = ATTEMPT / "react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs"
    dom_module = ATTEMPT / "dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs"
    react_encoder = ATTEMPT / "react/output/apps/lifecycle-7e6575d90707/encoder.mjs"
    dom_encoder = ATTEMPT / "dom/output/apps/lifecycle-7e6575d90707/encoder.mjs"
    require(sha_file(react_encoder) == sha_file(dom_encoder), "React/DOM encoder equality")
    require(sha_file(react_module) != sha_file(dom_module), "separate compiler roots should retain distinct raw modules")

    result = {
        "schema": "gobi.compiled-lifecycle-fixed-dom-review/v1",
        "status": "accepted_bounded_current_primary_artifact_dom_audit",
        "provider": {"artifact_id": provider["artifactId"], "run_id": provider["run"],
            "conclusion": provider["providerRunConclusion"], "zip_bytes": provider["bytes"], "zip_sha256": zip_sha,
            "source_commit": SOURCE_COMMIT, "source_tree": SOURCE_TREE, "members": provider["members"],
            "uncompressed_bytes": provider["uncompressedBytes"]},
        "source": {"worktree_head": current_head, "immutable_tree_verified": git_tree,
            "lifecycle_pin_entries": len(pin_rows), "source_input_pin_entries": len(input_pin_rows),
            "generated_build_pin_entries": len(generated_pin_rows), "lifecycle_source_pin_mismatches": len(pin_mismatches),
            "source_pins_stable_before_after_check": True, "build_output_pins_stable_through_check": True,
            "oracle_module_sha256": next(row["sha256"] for row in pin_rows if row["path"] == "compiled-lifecycle/browser/lifecycle-oracle.mjs"),
            "oracle_test_sha256": next(row["sha256"] for row in pin_rows if row["path"] == "compiled-lifecycle/browser/lifecycle-oracle.test.mjs"),
            "complete_checker_sha256": next(row["sha256"] for row in pin_rows if row["path"] == "compiled-lifecycle/conformance/check.mjs")},
        "complete_run": {"run_status": run["status"], "check_status": check["status"], "all_stages_completed": True,
            "checker_summary_sha256": sha_file(MATRIX / "lifecycle.check.json"), "run_record_sha256": sha_file(MATRIX / "lifecycle.run.json"),
            "manifest_sha256": sha_file(MATRIX / "lifecycle.manifest.json"), "matrix_evidence": evidence_hashes},
        "literal_oracle": {"source": "compiled-lifecycle/browser/lifecycle-oracle.mjs", "states": len(states),
            "events": len(steps), "probe_expectations": len(probes), "materialized_bytes": len(oracle_bytes),
            "materialized_sha256": hashlib.sha256(oracle_bytes).hexdigest(),
            "native_states_and_views_match": True, "direct_states_views_effects_match": True,
            "three_browser_traces_match_direct_and_oracle": True},
        "native_direct": {"native_events": len(native["steps"]), "direct_events": len(direct["steps"]),
            "Go_ticks": len(direct["trace"]["ticks"]), "fixture_state_checkpoints": len(scenario["expectedStates"]),
            "native_direct_state_view_pairs_matched": len(steps), "direct_request_effects": 7,
            "direct_cancellation_order": cancel_order, "final_pending": len(direct["pending"])},
        "browser_profiles": profile_summaries,
        "physical_dom": {"profiles": 3, "snapshots_per_profile": 27, "total_snapshots": total_snapshots,
            "live_button_properties_checked": total_live_control_properties, "disabled_true_properties": total_disabled_properties,
            "active_physical_clicks": total_active_clicks, "detached_subtree_clicks": total_detached_clicks,
            "detached_callbacks_noop": True, "remove_remount_sibling_lifecycle_verified": True,
            "fixed_swap_pending_tokens_preserved": pending_tokens, "renderer_swaps": len(swaps),
            "eligible_swaps": len(eligible), "ineligible_swaps": len(ineligible), "retired_callback_fences": fence_count},
        "mutations": {"count": len(mutations), "all_detected": True, "names": expected_mutations},
        "app_identity": {"component_id": PACKAGE, "react_dom_appir_equal": True,
            "react_encoder_sha256": sha_file(react_encoder), "dom_encoder_sha256": sha_file(dom_encoder),
            "react_module_sha256": sha_file(react_module), "dom_module_sha256": sha_file(dom_module),
            "raw_module_equality_claimed": False},
        "scope": "Independent review of the current primary artifact's finite lifecycle fixture, complete checker, and captured physical DOM. No product/source/Git edits and no test reruns."
    }
    output = FIXED / "lanes/dom/audit.json"
    output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": result["status"], "artifact": result["provider"],
        "snapshots": total_snapshots, "live_control_properties": total_live_control_properties,
        "detached_clicks": total_detached_clicks, "callback_fences": fence_count,
        "mutations_detected": len(mutations), "native_direct_browser_oracle_match": True,
        "audit": str(output.relative_to(ROOT))}, indent=2))


if __name__ == "__main__":
    main()
