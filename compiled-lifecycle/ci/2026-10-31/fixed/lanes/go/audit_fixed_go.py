#!/usr/bin/env python3
"""Independently bind the current primary lifecycle artifact to source and Go ABI."""
from __future__ import annotations

import hashlib
import json
import pathlib
import re
import struct
import subprocess
import zipfile

ROOT = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
SOURCE = pathlib.Path("/workspace/scratch/39a56936f173/gondola")
FIXED = ROOT / "compiled-lifecycle/ci/2026-10-31/fixed"
EXTRACTED = FIXED / "extracted"
LANE = FIXED / "lanes/go"
ZIP_PATH = pathlib.Path("/tmp/gobi-compiled-lifecycle-41181505234.zip")
EXPECTED = {
    "run": 41181505234,
    "artifact": 13035044166,
    "head": "00da54ad0f5a4006b13a5cded18ce291845978bc",
    "tree": "51b64a89b5f7e0edd4792becbed9adad6a27a698",
    "zip_bytes": 47072021,
    "zip_sha256": "0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26",
    "component_id": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle",
    "effect_slice": "[]github.com/samuelpmahan/gondola/gobi.Effect",
    "attempt": "compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z",
}


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def need(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def hash_record(path: pathlib.Path, display: str | None = None) -> dict:
    return {"path": display or str(path), "bytes": path.stat().st_size, "sha256": sha_file(path)}


def pin_path(base: pathlib.Path, row: dict, label: str):
    path = base / row["path"]
    need(path.is_file(), f"{label} is missing: {row['path']}")
    need(path.stat().st_size == row["bytes"] and sha_file(path) == row["sha256"], f"{label} pin mismatch: {row['path']}")
    return path


def decode_typed_value(value: dict):
    kind = value["kind"]
    if kind == "struct":
        return {field["name"]: decode_typed_value(field["value"]) for field in value["fields"]}
    if kind == "string":
        return value["string"]
    if kind == "bool":
        return value["bool"]
    if kind in ("uint", "int"):
        return int(value["integer"])
    if kind == "float64":
        return struct.unpack(">d", bytes.fromhex(value["float64Bits"]))[0]
    if kind == "slice":
        return [decode_typed_value(item) for item in value["items"]]
    raise AssertionError(f"unhandled compiled Value kind {kind}")


def verify_provider_artifact() -> dict:
    download_path = FIXED / "provider-download.json"
    members_path = FIXED / "provider-members.json"
    download = read_json(download_path)
    member_rows = read_json(members_path)
    need(download["run"] == EXPECTED["run"] and download["artifactId"] == EXPECTED["artifact"], "provider run/artifact identity")
    need(download["source"] == EXPECTED["head"] and download["tree"] == EXPECTED["tree"], "provider source/tree identity")
    need(download["bytes"] == EXPECTED["zip_bytes"] and download["sha256"] == EXPECTED["zip_sha256"], "provider ZIP metadata")
    need(download["members"] == 1270 and len(member_rows) == 1270 and download["CRC"] == "all passed", "provider member/CRC inventory")
    need(ZIP_PATH.is_file() and ZIP_PATH.stat().st_size == EXPECTED["zip_bytes"] and sha_file(ZIP_PATH) == EXPECTED["zip_sha256"], "provider ZIP bytes")

    expected_by_path = {row["path"]: row for row in member_rows}
    need(len(expected_by_path) == len(member_rows), "duplicate provider inventory path")
    with zipfile.ZipFile(ZIP_PATH, "r") as archive:
        infos = archive.infolist()
        names = [info.filename for info in infos]
        need(len(names) == 1270 and len(set(names)) == 1270 and set(names) == set(expected_by_path), "provider ZIP member set")
        bad = archive.testzip()
        need(bad is None, f"provider ZIP CRC failure: {bad}")
        for info in infos:
            expected = expected_by_path[info.filename]
            need(info.file_size == expected["bytes"], f"provider ZIP size differs: {info.filename}")
            need(f"{info.CRC:08x}" == expected["crc32"].lower(), f"provider ZIP CRC inventory differs: {info.filename}")

    extracted_checks = 0
    for row in member_rows:
        candidate = (EXTRACTED / row["path"]).resolve()
        try:
            candidate.relative_to(EXTRACTED.resolve())
        except ValueError as error:
            raise AssertionError(f"provider path escapes extraction root: {row['path']}") from error
        need(candidate.is_file() and not candidate.is_symlink(), f"provider member not a regular extracted file: {row['path']}")
        need(candidate.stat().st_size == row["bytes"] and sha_file(candidate) == row["sha256"], f"provider extracted member mismatch: {row['path']}")
        extracted_checks += 1
    need(extracted_checks == 1270, "provider extraction verification count")
    return {
        "run_id": download["run"],
        "artifact_id": download["artifactId"],
        "head_sha": download["source"],
        "tree_sha": download["tree"],
        "provider_conclusion": download["providerRunConclusion"],
        "zip": hash_record(ZIP_PATH),
        "zip_crc_test": "passed",
        "zip_member_count": len(member_rows),
        "extracted_member_hashes_verified": extracted_checks,
        "uncompressed_bytes": download["uncompressedBytes"],
        "download_record": hash_record(download_path, str(download_path.relative_to(ROOT))),
        "provider_member_inventory": hash_record(members_path, str(members_path.relative_to(ROOT))),
    }


def verify_attempt_and_source() -> tuple[dict, dict, dict, pathlib.Path]:
    attempt_root = EXTRACTED / EXPECTED["attempt"]
    execution_path = attempt_root / "execution.json"
    execution = read_json(execution_path)
    need(execution["status"] == "passed" and execution["mode"] == "full" and execution["failures"] == [], "current attempt status/mode/failures")
    need(execution["attempt"] == EXPECTED["attempt"] and execution["sourcePinsMatch"] is True, "attempt path/source pin status")
    need(all(stage["status"] == "passed" for stage in execution["stages"]), "one or more full-run stages failed")
    need(len(execution["sourceBefore"]) == 123 and execution["sourceBefore"] == execution["sourceAfter"], "source pin inventory stability/count")
    source_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=SOURCE, text=True).strip()
    need(source_head == EXPECTED["head"], f"current source checkout is {source_head}, expected 00da")

    source_rows = {row["path"]: row for row in execution["sourceBefore"]}
    source_checks = []
    for row in execution["sourceBefore"]:
        path = SOURCE / row["path"]
        need(path.is_file() and path.stat().st_size == row["bytes"] and sha_file(path) == row["sha256"], f"source pin differs at 00da: {row['path']}")
        source_checks.append({"path": row["path"], "bytes": row["bytes"], "sha256": row["sha256"], "matched": True})

    output_before = execution["outputPinsBefore"]
    output_after = execution["outputPinsAfter"]
    need(set(output_before) == {"react", "dom"} and output_before == output_after, "backend build-output pin stability")
    output_counts = {}
    for backend in ("react", "dom"):
        rows = output_before[backend]
        need(len(rows) == 67, f"{backend} output count")
        for row in rows:
            pin_path(EXTRACTED, row, f"{backend} build output")
        output_counts[backend] = {"count": len(rows), "stable": True}
    demo_before = execution["demoOutputPinsBeforeSmoke"]
    demo_after = execution["demoOutputPinsAfterSmoke"]
    need(demo_before == demo_after and len(demo_before) == 5, "demo static asset pin stability")
    for row in demo_before:
        pin_path(EXTRACTED, row, "demo asset")

    report = execution["report"]
    report_path = EXTRACTED / report["path"]
    need(report_path.is_file() and sha_file(report_path) == report["sha256"], "attempt report pin")
    archive_path = EXTRACTED / execution["archive"]["path"]
    archive_manifest_path = EXTRACTED / execution["archive"]["manifest"]["path"]
    need(archive_path.stat().st_size == execution["archive"]["bytes"] and sha_file(archive_path) == execution["archive"]["sha256"], "attempt artifact archive pin")
    need(archive_manifest_path.stat().st_size == execution["archive"]["manifest"]["bytes"] and sha_file(archive_manifest_path) == execution["archive"]["manifest"]["sha256"], "attempt archive manifest pin")

    essential = [
        "fixtures/compiled/lifecycle/app.go", "fixtures/compiled/lifecycle/app_test.go", "fixtures/compiled/lifecycle/view.go", "fixtures/compiled/lifecycle/scenario.json",
        "cmd/compiled-lifecycle-native/main.go", "cmd/compiled-lifecycle-native/main_test.go",
        "compiled-frontend/frontend/runtime/runtime.mjs", "compiled-frontend/frontend/runtime/runtime.test.mjs",
        "compiled-frontend/build/pipeline.go", "compilercontract/js_encoder.go", "compilercontract/contract.go",
        "compiled-lifecycle/runtime/runtime.mjs", "compiled-lifecycle/runtime/runtime.test.mjs",
        "compiled-lifecycle/conformance/run.mjs", "compiled-lifecycle/demo/smoke.mjs",
    ]
    need(all(path in source_rows for path in essential), "essential source file absent from source pin set")
    return execution, {"head": source_head, "pin_count": len(source_checks), "all_matched": True, "essential_pins": [source_rows[path] for path in essential]}, {"react": output_counts["react"], "dom": output_counts["dom"], "demo_assets": len(demo_before)}, attempt_root


def verify_build_and_typed_bridge(execution: dict, attempt_root: pathlib.Path) -> dict:
    builds = {}
    for backend in ("react", "dom"):
        record = execution["builds"][backend]
        build_dir = attempt_root / backend / "output"
        app_path = build_dir / "apps/lifecycle-7e6575d90707/app-ir.json"
        module_path = build_dir / "apps/lifecycle-7e6575d90707/gobi-compiled.mjs"
        encoder_path = build_dir / "apps/lifecycle-7e6575d90707/encoder.mjs"
        manifest_path = build_dir / "buildmanifest.json"
        need(sha_file(app_path) == record["appIR"]["sha256"] and app_path.stat().st_size == record["appIR"]["bytes"], f"{backend} AppIR identity")
        need(sha_file(module_path) == record["rawModule"]["sha256"] and module_path.stat().st_size == record["rawModule"]["bytes"], f"{backend} module identity")
        need(sha_file(encoder_path) == record["encoder"]["sha256"] and encoder_path.stat().st_size == record["encoder"]["bytes"], f"{backend} encoder identity")
        manifest = read_json(manifest_path)
        need(manifest["schema"] == "gobi.build-manifest/v1" and len(manifest["apps"]) == 1, f"{backend} build manifest schema")
        manifest_app = manifest["apps"][0]
        need(manifest_app["backend"] == backend and manifest_app["componentId"] == EXPECTED["component_id"], f"{backend} build manifest identity")
        need(manifest_app["packagePath"] == EXPECTED["component_id"], f"{backend} manifest package path")
        need(manifest_app["appIR"] == "apps/lifecycle-7e6575d90707/app-ir.json", f"{backend} manifest AppIR linkage")
        need(manifest_app["module"] == "apps/lifecycle-7e6575d90707/gobi-compiled.mjs", f"{backend} manifest module linkage")
        need(manifest_app["encoder"] == "apps/lifecycle-7e6575d90707/encoder.mjs", f"{backend} manifest encoder linkage")

        app = read_json(app_path)
        need(app["schema"] == "gobi.app-ir/v1" and app["packagePath"] == EXPECTED["component_id"], f"{backend} AppIR schema/package")
        need(len(app["components"]) == 1 and app["components"][0]["id"] == EXPECTED["component_id"], f"{backend} component identity")
        component = app["components"][0]
        need("effect.request-reply" in component["capabilities"], f"{backend} request/reply capability")
        update = next(symbol for symbol in app["symbols"] if symbol["id"] == component["update"])
        signature = update["signature"]
        need(signature["params"] == [component["stateType"], component["messageType"]], f"{backend} Update params")
        need(signature["results"] == [component["stateType"], EXPECTED["effect_slice"]], f"{backend} Update result type ID")
        types = {item["id"]: item for item in app["types"]}
        state_type = types[component["stateType"]]
        need(state_type["kind"] == "struct", f"{backend} State type shape")
        state_fields = {item["name"]: item["type"] for item in state_type["fields"]}
        need(state_fields == {"Parent": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState", "Child": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState", "Grandchild": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState", "Sibling": "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle.NodeState", "NextRequestID": "uint64"}, f"{backend} finite State fields")
        node_type = types[state_fields["Parent"]]
        node_fields = {item["name"]: item["type"] for item in node_type["fields"]}
        need(node_fields["Generation"] == "uint64" and node_fields["RequestID"] == "uint64", f"{backend} lifecycle ID types")
        need(types["uint64"]["bits"] == 64 and types["uint64"]["jsRepresentation"] == "bigint", f"{backend} uint64 representation")
        effect_slice = types[EXPECTED["effect_slice"]]
        need(effect_slice["kind"] == "slice" and effect_slice["elemType"] == "github.com/samuelpmahan/gondola/gobi.Effect" and effect_slice["jsRepresentation"] == "array-or-goscript-slice", f"{backend} Effect slice metadata")
        effect_type = types[effect_slice["elemType"]]
        need(effect_type["kind"] == "struct" and effect_type["fields"] == [{"name": "Kind", "type": "string"}, {"name": "Name", "type": "string"}, {"name": "Arg", "type": "string"}, {"name": "Reply", "type": "string"}], f"{backend} Effect struct ABI")

        encoder_text = encoder_path.read_text(encoding="utf-8")
        module_text = module_path.read_text(encoding="utf-8")
        need("export function gobiEncodeState" in encoder_text and "ownGoScriptBacking" in encoder_text and "array-or-goscript-slice" in encoder_text, f"{backend} generated GoSlice encoder")
        need("function Update(" in module_text and "function removeParent(" in module_text and "appendOne(effects, cancelEffect(state.Grandchild.Token))" in module_text, f"{backend} compiled Go Update/removal path")
        removal_start = module_text.index("function removeParent(state)")
        remount_start = module_text.index("function remountParent(state)", removal_start)
        removal_source = module_text[removal_start:remount_start]
        ordered = [removal_source.find(f"appendOne(effects, cancelEffect(state.{node}.Token))") for node in ("Grandchild", "Child", "Parent")]
        need(all(index >= 0 for index in ordered) and ordered == sorted(ordered), f"{backend} compiled append cancellation order")

        builds[backend] = {
            "app_ir": hash_record(app_path, f"{EXPECTED['attempt']}/{backend}/output/apps/lifecycle-7e6575d90707/app-ir.json"),
            "compiled_module": hash_record(module_path, f"{EXPECTED['attempt']}/{backend}/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs"),
            "encoder": hash_record(encoder_path, f"{EXPECTED['attempt']}/{backend}/output/apps/lifecycle-7e6575d90707/encoder.mjs"),
            "manifest": hash_record(manifest_path, f"{EXPECTED['attempt']}/{backend}/output/buildmanifest.json"),
            "component_id": component["id"],
            "update_params": signature["params"],
            "update_results": signature["results"],
            "state_fields": state_fields,
            "effect_fields": effect_type["fields"],
            "effect_slice_representation": effect_slice["jsRepresentation"],
            "compiled_append_cancel_order": ["Grandchild", "Child", "Parent"],
        }
    need(builds["react"]["app_ir"]["sha256"] == builds["dom"]["app_ir"]["sha256"], "React/DOM AppIR identity differs")
    need(builds["react"]["encoder"]["sha256"] == builds["dom"]["encoder"]["sha256"], "React/DOM encoders differ")
    return builds


def verify_runtime_and_tests(execution: dict, attempt_root: pathlib.Path) -> dict:
    source_hashes = {row["path"]: row["sha256"] for row in execution["sourceBefore"]}
    need(source_hashes["compiled-frontend/frontend/runtime/runtime.mjs"] == "42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0", "core runtime version pin")
    need(source_hashes["compiled-frontend/frontend/runtime/runtime.test.mjs"] == "6ea9236b08d1bf624bc9f8a84d2bebd6cacfbc12c91749cabf97b8fc6a7bf7b1", "core runtime test version pin")
    core = (SOURCE / "compiled-frontend/frontend/runtime/runtime.mjs").read_text(encoding="utf-8")
    lifecycle = (SOURCE / "compiled-lifecycle/runtime/runtime.mjs").read_text(encoding="utf-8")
    core_test = (SOURCE / "compiled-frontend/frontend/runtime/runtime.test.mjs").read_text(encoding="utf-8")
    lifecycle_test = (SOURCE / "compiled-lifecycle/runtime/runtime.test.mjs").read_text(encoding="utf-8")
    for term in ("effectResultTypeId", "effectSliceMetadata", "encoder.gobiEncodeState(effects, metadata.typeId)", "readEncodedEffectSlice", "validateEffectByPolicy"):
        need(term in core, f"core typed-effect bridge missing {term}")
    need('const SUPPORTED_EFFECT_KINDS = new Set(["fixture.request"])' in core, "default core effect allowlist changed")
    need('if (effectPolicy === null)' in core and 'validateSupportedEffect(effect, "gobi.Effect")' in core, "default effect policy is not strict")
    for term in ("validateLifecycleEffect", "effectPolicy: validateLifecycleEffect", 'effect.kind === "lifecycle.cancel"', "cancelEffect(target.correlation)"):
        need(term in lifecycle, f"closed lifecycle effect wrapper missing {term}")
    need("compiled effects require the exact marked GoScript struct ABI" in core_test and "unsupported effect kind" in core_test, "default strict effect regression test missing")
    for term in ("generated encoder accepts a nonzero-offset effect GoSlice from compiled append", "generated encoder rejects malformed GoSlice wrappers and malformed Go Effect fields", "runtime rejects unexpected fields in the typed Value returned for effects"):
        need(term in lifecycle_test, f"targeted GoSlice/effect regression test missing: {term}")

    logs = {}
    for name, expected_pass in (("lifecycle-go-tests.stdout.log", None), ("lifecycle-compiler-go-tests.stdout.log", None), ("lifecycle-node-tests-before-build.stdout.log", 71), ("lifecycle-compiled-runtime-tests.stdout.log", 10)):
        path = attempt_root / "logs" / name
        stderr_path = attempt_root / "logs" / name.replace("stdout", "stderr")
        need(path.is_file() and stderr_path.is_file() and stderr_path.stat().st_size == 0, f"test log/stderr missing or nonempty: {name}")
        text = path.read_text(encoding="utf-8")
        need("not ok " not in text and "FAIL" not in text, f"failing test output in {name}")
        if expected_pass is not None:
            match = re.search(r"# tests (\d+)\s+# suites (\d+)\s+# pass (\d+)\s+# fail (\d+)", text)
            need(match is not None and int(match.group(1)) == expected_pass and int(match.group(3)) == expected_pass and int(match.group(4)) == 0, f"test count/result differs: {name}")
        else:
            need(re.search(r"^ok\s+github\.com/samuelpmahan/gondola/", text, flags=re.MULTILINE) is not None, f"no successful Go package result in {name}")
        logs[name] = {"stdout": hash_record(path, f"{EXPECTED['attempt']}/logs/{name}"), "stderr": hash_record(stderr_path, f"{EXPECTED['attempt']}/logs/{stderr_path.name}"), "tests_passed": expected_pass}
    return {
        "core_effect_policy": "closed default supports fixture.request; lifecycle.cancel is accepted only by the explicit lifecycle wrapper policy",
        "typed_effect_path": "Update result signature second result TypeID -> AppIR declared slice -> generated gobiEncodeState -> exact Effect fields -> synchronous effectPolicy -> host correlation",
        "test_results": logs,
        "test_limits": "Go package tests and Node test outputs were read from the current primary hosted artifact; this audit did not rerun them or compile locally.",
    }


def verify_matrix(execution: dict, attempt_root: pathlib.Path) -> dict:
    matrix_dir = attempt_root / "matrix"
    run = read_json(matrix_dir / "lifecycle.run.json")
    check = read_json(matrix_dir / "lifecycle.check.json")
    native = read_json(matrix_dir / "native-cli.json")
    direct = read_json(matrix_dir / "lifecycle.direct.json")
    need(run["status"] == "matched" and run["nativeCommand"][0] == "go" and run["nativeCommand"][1:3] == ["run", "./cmd/compiled-lifecycle-native"] and run["nativeGoStderr"] == "", "matrix bare-Go native command")
    need(run["sourcesStable"] and run["sourceStableThroughCheck"] and run["buildOutputsStableThroughCheck"], "matrix source/build pin stability")
    need(native["schema"] == "gobi.compiled-lifecycle-native/v1" and native["componentID"] == EXPECTED["component_id"] and len(native["steps"]) == 26, "native replay schema/component/steps")
    need(direct["schema"] == "gobi.compiled-lifecycle-direct/v1" and direct["componentID"] == EXPECTED["component_id"] and len(direct["steps"]) == 26, "direct replay schema/component/steps")
    previous_state = native["initialState"]
    for index, (native_step, direct_step) in enumerate(zip(native["steps"], direct["steps"])):
        trace_tick = direct_step["traceTick"]
        if trace_tick is not None:
            previous_state = decode_typed_value(trace_tick["state"])
            direct_effects = [row["effect"] for row in trace_tick["requestedEffects"]]
        else:
            direct_effects = []
        need(native_step["state"] == previous_state, f"native/direct typed State mismatch at event {index}")
        need(native_step["effects"] == direct_effects, f"native/direct Go Effect mismatch at event {index}")
    need(check["status"] == "matched" and check["events"] == 26 and check["ticks"] == 26 and check["swaps"] == 17, "full mounted checker counts")
    need(check["browserProfiles"] == ["react", "dom", "swap"], "mounted React/DOM/swap profiles")
    need(check["nativeTraceCheckedAgainstLiteralOracle"] and check["directTraceCheckedAgainstLiteralOracle"] and check["browserTracesCheckedAgainstLiteralOracle"] and check["physicalDOMCheckedAgainstLiteralOracle"], "mounted comparison oracle/DOM flags")
    need(check["mutationControlsDetected"] == 8 and all(row["detected"] for row in check["mutationControls"]), "literal mutation controls")
    need(check["cancellationOrder"] == ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], "child-first cancellation order")
    need(check["requests"] == 7 and check["cancellations"] == 3 and check["retiredRendererFences"] == 32, "effect/fence counts")

    native_remove = next(step for step in native["steps"] if step.get("message") and step["message"]["name"] == "removeParent")
    expected_tokens = ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"]
    need([effect["arg"] for effect in native_remove["effects"]] == expected_tokens, "native Go removal effects")
    need(native_remove["state"]["Parent"]["Alive"] is False and native_remove["state"]["Child"]["Alive"] is False and native_remove["state"]["Grandchild"]["Alive"] is False, "native Go parent subtree removal")
    sibling = native_remove["state"]["Sibling"]
    need(sibling["Alive"] and sibling["Pending"] and sibling["Token"] == "sibling:g1:r4", "native Go independent sibling remains live/pending")

    direct_remove = next(step for step in direct["steps"] if step.get("message") and step["message"]["name"] == "removeParent")
    typed = direct_remove["typedEffects"]
    need(typed["typeId"] == EXPECTED["effect_slice"] and typed["kind"] == "slice" and typed["isNil"] is False, "direct Update GoSlice encoded as declared typed slice")
    effect_tokens = []
    for item in typed["items"]:
        need(item["typeId"] == "github.com/samuelpmahan/gondola/gobi.Effect" and item["kind"] == "struct", "direct Effect Value type")
        fields = {field["name"]: field["value"] for field in item["fields"]}
        need(set(fields) == {"Kind", "Name", "Arg", "Reply"}, "direct Effect exact field set")
        need(fields["Kind"]["string"] == "lifecycle.cancel" and fields["Name"]["string"] == "cancel" and fields["Reply"]["string"] == "", "direct lifecycle cancel ABI")
        effect_tokens.append(fields["Arg"]["string"])
    need(effect_tokens == expected_tokens, "direct GoSlice Effect payload/order")
    requested_effects = direct_remove["requestedEffects"]
    need([item["effect"]["arg"] for item in requested_effects] == expected_tokens, "direct normalized host effects/order")

    # The emitted trace encodes uint64 state as decimal integer strings. Native JSON
    # numbers stay inside the fixture's documented JavaScript-safe bound.
    uint_values = []
    def collect_values(value):
        if isinstance(value, dict):
            if value.get("typeId") == "uint64":
                uint_values.append(value)
            for child in value.values(): collect_values(child)
        elif isinstance(value, list):
            for child in value: collect_values(child)
    collect_values(direct["trace"])
    need(uint_values and all(v.get("kind") == "uint" and isinstance(v.get("integer"), str) for v in uint_values), "direct uint64 Value encoding")
    safe_limit = 9007199254740991
    for step in native["steps"]:
        for key in ("Generation", "RequestID"):
            for node in ("Parent", "Child", "Grandchild", "Sibling"):
                value = step["state"][node][key]
                need(isinstance(value, int) and 0 <= value <= safe_limit, "native lifecycle ID outside safe integer bound")
        need(step["state"]["NextRequestID"] <= safe_limit, "native next request ID outside safe integer bound")

    browser_paths = {}
    for row in run["evidencePins"]:
        local = EXTRACTED / row["path"]
        need(local.is_file() and local.stat().st_size == row["bytes"] and sha_file(local) == row["sha256"], f"matrix evidence pin {row['path']}")
        browser_paths[pathlib.PurePosixPath(row["path"]).name] = {"path": row["path"], "bytes": row["bytes"], "sha256": row["sha256"]}
    need("lifecycle.browser.json" in browser_paths and browser_paths["lifecycle.browser.json"]["bytes"] > 60_000_000, "raw browser profile evidence not preserved")
    demo = read_json(attempt_root / "demo/demo-smoke.json")
    need(demo["status"] == "passed" and len(demo["checks"]) == 12 and demo["finalTicks"] == 24 and demo["rendererSwaps"] == 4 and demo["failures"] == [], "mounted HTTP demo checks")
    need(len(demo["requests"]) == 3 and all(request["status"] == 200 for request in demo["requests"]), "mounted HTTP asset responses")
    need(not demo["browserErrors"] and not demo["consoleErrors"] and not demo["failedRequests"] and demo["wasmRequests"] == [], "mounted demo error/WASM arrays")

    important = {}
    for name in ("lifecycle.native.json", "lifecycle.direct.json", "lifecycle.check.json", "lifecycle.browser.json", "lifecycle.browser.capture.json"):
        pin = next(row for row in run["evidencePins"] if pathlib.PurePosixPath(row["path"]).name == name)
        important[name] = {"path": pin["path"], "bytes": pin["bytes"], "sha256": pin["sha256"]}
    important["lifecycle.run.json"] = hash_record(matrix_dir / "lifecycle.run.json", f"{EXPECTED['attempt']}/matrix/lifecycle.run.json")
    important["native-cli.json"] = {**hash_record(matrix_dir / "native-cli.json", f"{EXPECTED['attempt']}/matrix/native-cli.json")}
    important["demo/demo-smoke.json"] = hash_record(attempt_root / "demo/demo-smoke.json", f"{EXPECTED['attempt']}/demo/demo-smoke.json")
    return {
        "command": run["command"],
        "native_command": run["nativeCommand"],
        "native_stderr": run["nativeGoStderr"],
        "status": run["status"],
        "source_stable_through_check": run["sourceStableThroughCheck"],
        "build_outputs_stable_through_check": run["buildOutputsStableThroughCheck"],
        "checks": {key: check[key] for key in ("status", "appId", "events", "ticks", "swaps", "requests", "cancellations", "cancellationOrder", "browserProfiles", "retiredRendererFences", "callbackFenceEligibleSwaps", "callbackFenceIneligibleSwaps", "mutationControls", "mutationControlsDetected", "nativeTraceCheckedAgainstLiteralOracle", "directTraceCheckedAgainstLiteralOracle", "browserTracesCheckedAgainstLiteralOracle", "physicalDOMCheckedAgainstLiteralOracle")},
        "native_remove_parent": {"step": native_remove["index"], "cancellations": native_remove["effects"], "sibling_after_removal": sibling},
        "native_direct_state_effect_steps_identical": 26,
        "direct_remove_parent": {"event_index": direct_remove["eventIndex"], "typed_effect_type": typed["typeId"], "typed_effect_kind": typed["kind"], "typed_effects": typed["items"], "normalized_host_effects": requested_effects, "uint64_values_encoded_as_decimal_strings": len(uint_values)},
        "browser_evidence": browser_paths,
        "mounted_http_demo": {"status": demo["status"], "checks": len(demo["checks"]), "ticks": demo["finalTicks"], "renderer_swaps": demo["rendererSwaps"], "requests": demo["requests"], "browser_errors": len(demo["browserErrors"]), "console_errors": len(demo["consoleErrors"]), "failed_requests": len(demo["failedRequests"]), "wasm_requests": len(demo["wasmRequests"])},
        "important_artifacts": important,
    }


def main():
    provider = verify_provider_artifact()
    execution, source, output_pins, attempt_root = verify_attempt_and_source()
    builds = verify_build_and_typed_bridge(execution, attempt_root)
    runtime_tests = verify_runtime_and_tests(execution, attempt_root)
    matrix = verify_matrix(execution, attempt_root)
    audit = {
        "schema": "gobi.compiled-lifecycle-fixed-go-audit/v1",
        "job_id": "E-FIXED-GO",
        "status": "verified_current_primary_artifact",
        "provider": provider,
        "attempt": {"path": EXPECTED["attempt"], "execution": hash_record(attempt_root / "execution.json", f"{EXPECTED['attempt']}/execution.json"), "status": execution["status"], "mode": execution["mode"], "failures": execution["failures"], "stages": execution["stages"], "source_pins_match": execution["sourcePinsMatch"], "archive": execution["archive"], "versions": execution["versions"]},
        "source": source,
        "build_output_pins": output_pins,
        "builds": builds,
        "runtime_and_tests": runtime_tests,
        "matrix": matrix,
        "limits": ["This review is bound only to the verified current artifact 13035044166/run 41181505234 at 00da/tree 51b64a8; no earlier 49cc artifact is used.", "The finite admitted Go lifecycle fixture demonstrates typed GoState/Message/Effect and generated GoSlice handling; it does not establish arbitrary Manager or pointer-owned Go compilation.", "AppIR effect.request-reply is a coarse capability marker. The shared frontend runtime remains strict by default; the lifecycle wrapper provides the closed request/cancel policy.", "Full browser trace JSON remains in the provider artifact extraction and is hash-bound here; it was not duplicated into this lane.", "No local Go compilation, npm installation, or rebuild was performed."],
    }
    out = LANE / "audit.json"
    out.write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"audit": str(out.relative_to(ROOT)), "status": audit["status"], "provider_members_verified": provider["extracted_member_hashes_verified"], "source_pins_verified": source["pin_count"], "react_dom_output_pins": output_pins, "node_tests": runtime_tests["test_results"]["lifecycle-node-tests-before-build.stdout.log"]["tests_passed"], "lifecycle_runtime_tests": runtime_tests["test_results"]["lifecycle-compiled-runtime-tests.stdout.log"]["tests_passed"], "matrix_status": matrix["status"], "check_status": matrix["checks"]["status"], "effect_slice": matrix["direct_remove_parent"]["typed_effect_type"]}, indent=2))


if __name__ == "__main__":
    main()
