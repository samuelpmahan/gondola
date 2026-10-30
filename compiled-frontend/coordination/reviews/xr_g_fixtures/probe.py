#!/usr/bin/env python3
"""Independent structural and source-forward review of the N5 native artifacts."""

import hashlib
import json
import pathlib
import struct


HERE = pathlib.Path(__file__).resolve().parent
FRONTEND = HERE.parents[2]
ROOT = HERE.parents[3]
BUILD_ROOT = pathlib.Path("/tmp/gondola-compiled-atomic/apps")
N5_TRACE_ROOT = pathlib.Path("/tmp/gondola-compiled-native")
BUILD_RESULT = FRONTEND / "toolchain/build-four/result.json"
FIXTURE_ROOT = FRONTEND / "fixtures"
RECEIPT = FRONTEND / "coordination/receipts/G-FIXTURES.json"

APPS = {
    "counter": {
        "directory": "counter-b05e9eb0e4e6",
        "package": "github.com/samuelpmahan/gondola/counter",
        "state_type": "github.com/samuelpmahan/gondola/counter.State",
        "state_fields": [("Count", "float64")],
        "view_result": "github.com/samuelpmahan/gondola/gobi.Node",
        "ticks": 5,
    },
    "form": {
        "directory": "form-a3fe6b48b000",
        "package": "github.com/samuelpmahan/gondola/fixtures/compiled/form",
        "state_type": "github.com/samuelpmahan/gondola/fixtures/compiled/form.State",
        "state_fields": [("Draft", "string"), ("Checked", "bool"), ("Saved", "string"), ("Saves", "int"), ("Literal", "string")],
        "view_result": "github.com/samuelpmahan/gondola/compilercontract.View",
        "ticks": 10,
    },
    "list": {
        "directory": "list-f8359aa2866d",
        "package": "github.com/samuelpmahan/gondola/fixtures/compiled/list",
        "state_type": "github.com/samuelpmahan/gondola/fixtures/compiled/list.State",
        "state_fields": [("Rows", "[]github.com/samuelpmahan/gondola/fixtures/compiled/list.Row"), ("NextID", "uint64")],
        "view_result": "github.com/samuelpmahan/gondola/compilercontract.View",
        "ticks": 11,
    },
    "effect": {
        "directory": "effect-ff8449e8f5b2",
        "package": "github.com/samuelpmahan/gondola/fixtures/compiled/effect",
        "state_type": "github.com/samuelpmahan/gondola/fixtures/compiled/effect.State",
        "state_fields": [("Input", "string"), ("Value", "string"), ("Status", "string"), ("Pending", "bool"), ("Requests", "int"), ("Completions", "int"), ("NegativeZero", "float64")],
        "view_result": "github.com/samuelpmahan/gondola/compilercontract.View",
        "ticks": 5,
    },
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def decode_value(value):
    kind = value["kind"]
    if kind == "bool":
        return value["bool"]
    if kind == "string":
        return value["string"]
    if kind in ("int", "uint"):
        return int(value["integer"])
    if kind == "float64":
        return struct.unpack(">d", bytes.fromhex(value["float64Bits"]))[0]
    if kind == "slice":
        if value["isNil"]:
            return None
        return [decode_value(item) for item in value["items"]]
    if kind == "struct":
        return {field["name"]: decode_value(field["value"]) for field in value["fields"]}
    raise AssertionError(f"unsupported trace value kind {kind!r}")


def state_matches(expected, actual_value, app_name):
    actual = decode_value(actual_value)
    normalized = dict(expected)
    negative_bits = normalized.pop("NegativeZeroBits", None)
    if negative_bits is not None:
        normalized["NegativeZero"] = -0.0
    check(actual == normalized, f"{app_name}: typed state mismatch: expected {normalized!r}, got {actual!r}")
    if negative_bits is not None:
        fields = {field["name"]: field["value"] for field in actual_value["fields"]}
        check(fields["NegativeZero"]["float64Bits"] == negative_bits, f"{app_name}: negative-zero bits changed")


def node_at_path(tree, path):
    node = tree
    if path == "":
        return node
    for component in path.split("/"):
        index = int(component)
        kids = node.get("kids") or []
        if index >= len(kids):
            return None
        node = kids[index]
    return node


def is_disabled(node):
    return any(attr["name"] == "disabled" and attr["flag"] for attr in node.get("attrs") or [])


def expected_message(view, action):
    node = node_at_path(view["tree"], action["path"])
    if node is None or is_disabled(node):
        return None
    for binding in view["bindings"]:
        if binding["path"] == action["path"] and binding["event"] == action["event"]:
            return {"name": binding["message"], "arg": action["value"]}
    matches = [handler for handler in node.get("on") or [] if handler["event"] == action["event"]]
    check(len(matches) <= 1, f"ambiguous handler at {action['path']!r}/{action['event']!r}")
    if not matches:
        return None
    handler = matches[0]
    return {"name": handler["message"], "arg": handler["arg"]}


def validate_app_ir(app_name, spec, app_ir, build_result):
    check(app_ir == next(item for item in build_result["apps"] if item["packagePath"] == spec["package"]),
          f"{app_name}: /tmp AppIR differs from toolchain/build-four/result.json")
    component = app_ir["components"][0]
    check(component["packagePath"] == spec["package"] and component["stateType"] == spec["state_type"],
          f"{app_name}: component package or state type differs")
    symbols = {symbol["id"]: symbol for symbol in app_ir["symbols"]}
    init = symbols[component["init"]]
    update = symbols[component["update"]]
    view = symbols[component["view"]]
    check((init["name"], init["signature"]) == ("Init", {"params": [], "results": [spec["state_type"]]}),
          f"{app_name}: generated Init role signature differs")
    check((update["name"], update["signature"]) == ("Update", {
        "params": [spec["state_type"], component["messageType"]],
        "results": [spec["state_type"], "[]github.com/samuelpmahan/gondola/gobi.Effect"],
    }), f"{app_name}: generated Update role signature differs")
    check((view["name"], view["signature"]) == ("View", {
        "params": [spec["state_type"]], "results": [spec["view_result"]],
    }), f"{app_name}: generated View role signature differs")
    state_type = next(item for item in app_ir["types"] if item["id"] == spec["state_type"])
    got_fields = [(field["name"], field["type"]) for field in state_type["fields"]]
    check(got_fields == spec["state_fields"], f"{app_name}: AppIR state type fields {got_fields!r} differ from source")
    output = next(item for item in build_result["outputs"] if item["path"] == f"apps/{spec['directory']}/app-ir.json")
    app_path = BUILD_ROOT / spec["directory"] / "app-ir.json"
    check(output["sha256"] == sha256(app_path), f"{app_name}: current build result output hash differs from /tmp artifact")


def validate_trace(app_name, spec, script, trace):
    check(trace["schema"] == "gobi.trace/v1" and trace["appId"] == spec["package"],
          f"{app_name}: trace schema or appId differs")
    check(len(trace["ticks"]) == spec["ticks"], f"{app_name}: tick count differs")
    check(trace["ticks"][0]["index"] == 0 and trace["ticks"][0]["action"] is None,
          f"{app_name}: initial tick missing")
    check(trace["ticks"][0]["dom"] is None, f"{app_name}: native trace unexpectedly claims DOM")
    state_matches(script["initialState"], trace["ticks"][0]["state"], app_name)

    action_ticks = {}
    completion_ticks = []
    previous_view = trace["ticks"][0]["view"]
    tick_index = 1
    dispatch_number = 0
    total_requests = 0
    total_completions = 0
    for action_index, action in enumerate(script["actions"]):
        tick = trace["ticks"][tick_index]
        check(tick["index"] == tick_index and tick["action"] == action,
              f"{app_name}: action {action_index} does not match its trace tick")
        expected = expected_message(previous_view, action)
        check(tick["message"] == expected, f"{app_name}: source-forward message differs for action {action_index}: {tick['message']!r} != {expected!r}")
        if expected is None:
            check(tick["dispatchId"] is None, f"{app_name}: suppressed action has a dispatch id")
        else:
            dispatch_number += 1
            check(tick["dispatchId"] == f"dispatch-{dispatch_number:04d}", f"{app_name}: dispatch id sequence differs")
        state_matches(next(x["state"] for x in script["expectations"] if x.get("actionIndex") == action_index), tick["state"], app_name)
        action_ticks[action_index] = tick
        previous_view = tick["view"]
        total_requests += len(tick["requestedEffects"])
        total_completions += len(tick["completedEffects"])
        tick_index += 1

        if tick["requestedEffects"]:
            for request in tick["requestedEffects"]:
                host_step = script["hostScript"]["steps"][len(completion_ticks)]
                check(host_step["request"] == request, f"{app_name}: host request differs from actual request")
                check(request["effect"]["kind"] == "fixture.request" and request["effect"]["name"] == "lookup" and request["effect"]["reply"] == "complete",
                      f"{app_name}: unsupported effect request descriptor")
                completion = host_step["completion"]
                if completion is not None:
                    reply = trace["ticks"][tick_index]
                    expected_completion = {
                        "dispatchId": request["dispatchId"],
                        "effectIndex": request["effectIndex"],
                        "message": completion,
                    }
                    check(reply["action"] is None and reply["message"] == completion,
                          f"{app_name}: completion is missing or dispatched as a user action")
                    check(reply["completedEffects"] == [expected_completion], f"{app_name}: completion correlation differs")
                    dispatch_number += 1
                    check(reply["dispatchId"] == f"dispatch-{dispatch_number:04d}", f"{app_name}: completion dispatch id sequence differs")
                    state_matches(next(x["state"] for x in script["expectations"] if x.get("completionIndex") == len(completion_ticks)), reply["state"], app_name)
                    completion_ticks.append(reply)
                    previous_view = reply["view"]
                    total_completions += len(reply["completedEffects"])
                    tick_index += 1
    check(tick_index == len(trace["ticks"]), f"{app_name}: unaccounted trace ticks")
    check(len(script["expectations"]) == len(action_ticks) + len(completion_ticks), f"{app_name}: unexpected expectation count")
    check(len(script["hostScript"]["steps"]) == total_requests, f"{app_name}: unused or missing host steps")
    return {"ticks": len(trace["ticks"]), "actions": len(action_ticks), "actual_updates": dispatch_number,
            "requests": total_requests, "completions": total_completions}


def main():
    build_result = read_json(BUILD_RESULT)
    check(build_result["schema"] == "gobi.build-result/v1" and build_result["ok"], "current four-app build result is not successful")
    historical = read_json(RECEIPT)
    old_hashes = {run["app"]: run["app_ir_sha256"] for run in historical["evidence"]["native_runs"]}
    current_hashes = {}
    result = {"build_result_sha256": sha256(BUILD_RESULT), "apps": {}, "app_ir_hash_drift": {}}
    source_files = [
        ROOT / "counter/counter.go",
        ROOT / "fixtures/compiled/form/app.go", ROOT / "fixtures/compiled/form/view.go",
        ROOT / "fixtures/compiled/list/app.go", ROOT / "fixtures/compiled/list/view.go",
        ROOT / "fixtures/compiled/effect/app.go", ROOT / "fixtures/compiled/effect/view.go",
        ROOT / "cmd/compiled-native/replay.go", ROOT / "cmd/compiled-native/replay_test.go",
    ]
    result["source_sha256"] = {str(path.relative_to(ROOT)): sha256(path) for path in source_files}
    for name, spec in APPS.items():
        app_path = BUILD_ROOT / spec["directory"] / "app-ir.json"
        script_path = FIXTURE_ROOT / f"{name}.json"
        native_path = HERE / f"{name}.native.trace.json"
        old_trace_path = N5_TRACE_ROOT / f"{name}.trace.json"
        app_ir = read_json(app_path)
        script = read_json(script_path)
        trace = read_json(native_path)
        validate_app_ir(name, spec, app_ir, build_result)
        counts = validate_trace(name, spec, script, trace)
        check(sha256(native_path) == sha256(old_trace_path), f"{name}: fresh native output differs from retained N5 trace")
        current_hashes[name] = sha256(app_path)
        result["apps"][name] = {
            "app_ir_sha256": current_hashes[name],
            "trace_sha256": sha256(native_path),
            "retained_n5_trace_sha256": sha256(old_trace_path),
            "counts": counts,
        }
    for name in APPS:
        if current_hashes[name] != old_hashes[name]:
            result["app_ir_hash_drift"][name] = {"prior_receipt": old_hashes[name], "current": current_hashes[name]}

    form_trace = read_json(HERE / "form.native.trace.json")
    literal = form_trace["ticks"][3]
    check(literal["action"]["value"] == "must not replace literal", "form literal action intent changed")
    check(literal["message"] == {"name": "literal", "arg": "target.value"}, "form literal On.Arg was rewritten")

    list_trace = read_json(HERE / "list.native.trace.json")
    rows_initial = next(field["value"] for field in list_trace["ticks"][0]["state"]["fields"] if field["name"] == "Rows")
    rows_empty = next(field["value"] for field in list_trace["ticks"][9]["state"]["fields"] if field["name"] == "Rows")
    check(rows_initial["isNil"] is True and rows_initial["items"] == [], "list Init no longer records nil Rows")
    check(rows_empty["isNil"] is False and rows_empty["items"] == [], "list reset/removal no longer records non-nil empty Rows")

    form_trace = read_json(HERE / "form.native.trace.json")
    form_saves = [field["value"]["integer"] for tick in form_trace["ticks"] for field in tick["state"]["fields"] if field["name"] == "Saves"]
    check("9007199254740991" in form_saves and form_saves[-1] == "0", "form safe-integer boundary/reset missing")
    check(form_trace["ticks"][6]["state"]["fields"][3]["value"]["integer"] == "9007199254740991", "form crossed max safe integer")

    effect_trace = read_json(HERE / "effect.native.trace.json")
    request_ticks = [tick for tick in effect_trace["ticks"] if tick["requestedEffects"]]
    completion_ticks = [tick for tick in effect_trace["ticks"] if tick["completedEffects"]]
    check(len(request_ticks) == 1 and len(completion_ticks) == 1, "effect request/reply was not exactly one each")
    request = request_ticks[0]
    reply = completion_ticks[0]
    check(request["state"]["fields"][3]["value"]["bool"] is True and request["state"]["fields"][4]["value"]["integer"] == "1" and request["state"]["fields"][5]["value"]["integer"] == "0",
          "pending state was not committed before reply")
    check(reply["state"]["fields"][3]["value"]["bool"] is False and reply["state"]["fields"][4]["value"]["integer"] == "1" and reply["state"]["fields"][5]["value"]["integer"] == "1",
          "completion count/state differs")
    check(all(tick["state"]["fields"][6]["value"]["float64Bits"] == "8000000000000000" for tick in effect_trace["ticks"]),
          "effect trace lost IEEE negative-zero bits")
    result["verified_claims"] = [
        "current AppIR roles and state fields match generated build result and source declarations",
        "fresh direct-Go native traces byte-match retained N5 trace files",
        "source-forward messages match each recorded View binding or literal On handler; disabled actions have no dispatch",
        "form literal Action.value remains distinct from its literal On.Arg message argument",
        "list nil Rows and non-nil empty Rows remain distinct in typed trace values",
        "form trace reaches 9007199254740991 and does not cross the safe-integer boundary",
        "effect trace records one correlated lookup request and complete reply, with pending state committed first",
        "effect NegativeZero remains 8000000000000000 at every tick",
    ]
    result["limits"] = [
        "AppIR hashes for counter and effect differ from the hashes in the earlier G-FIXTURES receipt; the prior AppIR blobs are not present for a semantic diff. Current artifacts match toolchain/build-four/result.json, and native traces were rerun from them.",
        "Native traces have dom:null; this verifies direct-Go behavior, not emitted JavaScript or mounted-browser parity.",
        "The native fixture contains one request/reply and the trace proves one observed completion; duplicate completion suppression is separately covered by the effect Go test, not by repeated host delivery in this CLI run.",
    ]
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
