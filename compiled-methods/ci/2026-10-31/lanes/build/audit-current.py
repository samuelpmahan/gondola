#!/usr/bin/env python3
"""Verify the retained current-head primary CI artifact without modifying it."""

from __future__ import annotations

import hashlib
import json
import subprocess
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
CI = ROOT / "compiled-methods/ci/2026-10-31"
EXTRACTED = CI / "extracted"
ZIP = CI / "original.zip"
RETENTION_PATH = CI / "artifact-retention.json"
ATTEMPT_REL = Path("compiled-methods/artifacts/attempts/attempt-20261031T044100445Z")
ATTEMPT = EXTRACTED / ATTEMPT_REL
OUT = Path(__file__).with_name("current-primary-audit.json")


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pin(path: Path, relative_to: Path = ROOT) -> dict:
    raw = path.read_bytes()
    return {"path": path.relative_to(relative_to).as_posix(), "bytes": len(raw), "sha256": sha(raw)}


def json_file(path: Path):
    return json.loads(path.read_text())


def assert_exec_logs(execution: dict, log_root: Path, path_prefix: Path | None = None) -> dict:
    assert execution.get("status") == "passed", f"execution status: {execution.get('status')}"
    commands = execution.get("commands", [])
    assert commands, "execution has no commands"
    failures = []
    verified_streams = 0
    for command in commands:
        if command.get("exitCode") != 0 or command.get("error") or command.get("signal"):
            failures.append({"name": command.get("name"), "exitCode": command.get("exitCode"), "error": command.get("error"), "signal": command.get("signal")})
        name = command["name"]
        for stream in ("stdout", "stderr"):
            expected = command.get(f"{stream}Sha256")
            if expected is None:
                continue
            path_key = f"{stream}Path"
            if command.get(path_key):
                path = EXTRACTED / command[path_key]
            else:
                path = log_root / f"{name}.{stream}.log"
            assert path.is_file(), f"missing {stream} log for {name}: {path}"
            actual = sha(path.read_bytes())
            assert actual == expected, f"{stream} hash mismatch for {name}"
            verified_streams += 1
    assert not failures, f"commands failed: {failures}"
    return {"commandCount": len(commands), "allExitZero": True, "verifiedLogStreams": verified_streams, "failures": failures}


def verify_output_tree(output_root: Path, rows: list[dict], *, prefix: str = "") -> dict:
    expected = {row["path"]: row for row in rows}
    assert len(expected) == len(rows), f"duplicate output path in {output_root}"
    physical = {path.relative_to(output_root).as_posix() for path in output_root.rglob("*") if path.is_file()}
    assert physical == set(expected), f"physical output set differs at {output_root}"
    for rel, row in expected.items():
        raw = (output_root / rel).read_bytes()
        if "bytes" in row:
            assert len(raw) == row["bytes"], f"byte length mismatch: {prefix}{rel}"
        assert sha(raw) == row["sha256"], f"hash mismatch: {prefix}{rel}"
    return {"outputCount": len(rows), "inventorySha256": sha(json.dumps(rows, sort_keys=True, separators=(",", ":")).encode()), "allPathsBytesHashesMatch": True}


def validate_app_ir(ir: dict) -> dict:
    assert ir["schema"] == "gobi.app-ir/v1"
    package = "github.com/samuelpmahan/gondola/fixtures/compiled/methods"
    assert ir["packagePath"] == package and len(ir["components"]) == 1
    component = ir["components"][0]
    assert component["init"] == f"{package}.Init"
    assert component["update"] == f"{package}.Update"
    assert component["view"] == f"{package}.View"
    assert component["stateType"] == f"{package}.State"
    assert component["messageType"] == "github.com/samuelpmahan/gondola/gobi.Message"
    symbols = {row["id"]: row for row in ir["symbols"]}
    expected_roles = {
        f"{package}.Init": {"params": [], "results": [f"{package}.State"]},
        f"{package}.Update": {"params": [f"{package}.State", "github.com/samuelpmahan/gondola/gobi.Message"], "results": [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]},
        f"{package}.View": {"params": [f"{package}.State"], "results": ["github.com/samuelpmahan/gondola/gobi.Node"]},
    }
    for symbol_id, signature in expected_roles.items():
        assert symbols[symbol_id]["signature"] == signature, symbol_id
    expected_method_extra = {
        "Initialize": ([], [f"{package}.State"]),
        "Reduce": (["github.com/samuelpmahan/gondola/gobi.Message"], [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
        "AddParent": ([], [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
        "ResetParent": ([], [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
        "AddChild": ([], [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
        "ResetChild": ([], [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
        "ToggleReadOnly": ([], [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
        "CaptureChild": ([], [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
        "PublishSaved": ([], [f"{package}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
        "ComposeView": ([], ["github.com/samuelpmahan/gondola/gobi.Node"]),
    }
    for method, (explicit, results) in expected_method_extra.items():
        sid = f"{package}.State.{method}"
        assert sid in symbols, sid
        signature = symbols[sid]["signature"]
        assert signature["params"] == [f"{package}.State", *explicit]
        assert signature["results"] == results
    expected_calls = {
        f"{package}.Init": [f"{package}.State.Initialize"],
        f"{package}.State.Initialize": ["github.com/samuelpmahan/gondola/counter.Init"],
        f"{package}.Update": [f"{package}.State.Reduce"],
        f"{package}.State.Reduce": [f"{package}.State.{name}" for name in ("AddParent", "ResetParent", "AddChild", "ResetChild", "ToggleReadOnly", "CaptureChild", "PublishSaved")],
        f"{package}.State.AddParent": ["github.com/samuelpmahan/gondola/counter.Update"],
        f"{package}.State.ResetParent": ["github.com/samuelpmahan/gondola/counter.Update"],
        f"{package}.State.AddChild": ["github.com/samuelpmahan/gondola/counter.Update"],
        f"{package}.State.ResetChild": ["github.com/samuelpmahan/gondola/counter.Update"],
        f"{package}.View": [f"{package}.State.ComposeView"],
    }
    for sid, calls in expected_calls.items():
        assert symbols[sid]["calls"] == calls, sid
    assert len([sid for sid in symbols if sid.startswith(package + ".State.")]) == 10
    assert set(symbols) == set(expected_roles) | {f"{package}.State.{m}" for m in expected_method_extra} | {"github.com/samuelpmahan/gondola/counter.Init", "github.com/samuelpmahan/gondola/counter.Update"}
    return {
        "schema": ir["schema"],
        "packagePath": package,
        "componentCount": 1,
        "symbolCount": len(symbols),
        "roleSymbols": list(expected_roles),
        "methodSymbols": [f"{package}.State.{method}" for method in expected_method_extra],
        "dependencySymbols": ["github.com/samuelpmahan/gondola/counter.Init", "github.com/samuelpmahan/gondola/counter.Update"],
        "receiverFirstMethodSignatures": True,
        "typedTupleUpdateAndActionResults": True,
        "callGraph": {sid: symbols[sid]["calls"] for sid in expected_calls},
    }


def main() -> None:
    retention = json_file(RETENTION_PATH)
    metadata = json_file(CI / "primary-artifact-metadata.json")
    publication = json_file(CI / "publication-current.json")
    assert retention["source"] == publication["sourceCommit"] == "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
    assert retention["sourceTree"] == publication["sourceTree"] == "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
    assert retention["run"] == publication["primaryPush"] == 41169518187
    assert retention["job"] == 124444234335 and retention["artifactId"] == metadata["id"] == 13030848292
    assert retention["workflowOutcome"] == "success"
    assert metadata["workflow_run"]["head_sha"] == retention["source"]
    assert metadata["digest"] == f"sha256:{retention['providerZipSha256']}"
    assert metadata["size_in_bytes"] == retention["providerZipBytes"]

    git_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    git_tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True).strip()
    assert git_commit == retention["source"] and git_tree == retention["sourceTree"]

    archive_bytes = ZIP.read_bytes()
    assert len(archive_bytes) == retention["providerZipBytes"]
    assert sha(archive_bytes) == retention["providerZipSha256"]
    chunk_data = []
    chunk_pins = []
    for row in retention["chunks"]:
        path = CI / row["path"]
        raw = path.read_bytes()
        assert len(raw) == row["bytes"] and sha(raw) == row["sha256"]
        chunk_data.append(raw)
        chunk_pins.append(pin(path))
    rebuilt = b"".join(chunk_data)
    assert len(rebuilt) == len(archive_bytes) and sha(rebuilt) == sha(archive_bytes)

    expected_members = {row["path"]: row for row in retention["members"]}
    assert len(expected_members) == 968
    archive_members = {}
    with zipfile.ZipFile(ZIP) as zf:
        bad = zf.testzip()
        assert bad is None, f"zip CRC failure at {bad}"
        infos = [row for row in zf.infolist() if not row.is_dir()]
        assert len(infos) == len(expected_members)
        assert len({row.filename for row in infos}) == len(infos)
        total_uncompressed = 0
        for row in infos:
            raw = zf.read(row)
            total_uncompressed += len(raw)
            expected = expected_members[row.filename]
            assert len(raw) == expected["bytes"] and sha(raw) == expected["sha256"], row.filename
            extracted_path = EXTRACTED / row.filename
            assert extracted_path.is_file(), row.filename
            extracted_raw = extracted_path.read_bytes()
            assert len(extracted_raw) == len(raw) and sha(extracted_raw) == sha(raw), row.filename
            archive_members[row.filename] = {"bytes": len(raw), "sha256": sha(raw)}
    assert set(archive_members) == set(expected_members)
    extracted_files = [path for path in EXTRACTED.rglob("*") if path.is_file()]
    assert len(extracted_files) == len(expected_members)
    extracted_paths = {path.relative_to(EXTRACTED).as_posix() for path in extracted_files}
    assert extracted_paths == set(expected_members)
    assert total_uncompressed == sum(row["bytes"] for row in expected_members.values()) == 79084644

    methods_execution = json_file(ATTEMPT / "execution.json")
    assert methods_execution["mode"] == "full" and methods_execution["status"] == "passed"
    assert methods_execution["attempt"] == ATTEMPT_REL.as_posix()
    assert len(methods_execution["commands"]) == 17
    method_command_audit = assert_exec_logs(methods_execution, ATTEMPT / "logs")
    assert methods_execution["sourcePinsMatch"] is True
    source_before = methods_execution["sourceBefore"]
    source_after = methods_execution["sourceAfter"]
    assert len(source_before) == len(source_after) == 137 and source_before == source_after
    source_mismatches = []
    for row in source_before:
        source_path = ROOT / row["path"]
        if not source_path.is_file() or sha(source_path.read_bytes()) != row["sha256"]:
            source_mismatches.append(row["path"])
    assert not source_mismatches, source_mismatches
    source_pin_sha = sha(json.dumps(source_before, sort_keys=True, separators=(",", ":")).encode())

    methods_matrix = json_file(ATTEMPT / "matrix/methods.run.json")
    assert methods_matrix["status"] == "matched" and methods_matrix["sourceStable"] is True
    assert methods_matrix["sourceStableThroughCheck"] is True and methods_matrix["outputsStableThroughCheck"] is True
    assert len(methods_matrix["sourcePinsBefore"]) == len(methods_matrix["sourcePinsAfter"]) == len(methods_matrix["sourcePinsFinal"]) == 188
    assert methods_matrix["sourcePinsBefore"] == methods_matrix["sourcePinsAfter"] == methods_matrix["sourcePinsFinal"]
    assert methods_matrix["domBuildParity"]["appIR"] == "exact"
    matrix_pin_mismatches = []
    matrix_source_count = 0
    matrix_attempt_output_count = 0
    for row in methods_matrix["sourcePinsFinal"]:
        source_path = ROOT / row["path"]
        archive_path = EXTRACTED / row["path"]
        if source_path.is_file():
            raw = source_path.read_bytes()
            matrix_source_count += 1
        elif archive_path.is_file():
            raw = archive_path.read_bytes()
            matrix_attempt_output_count += 1
        else:
            matrix_pin_mismatches.append({"path": row["path"], "reason": "missing"})
            continue
        if sha(raw) != row["sha256"]:
            matrix_pin_mismatches.append({"path": row["path"], "reason": "sha256 mismatch"})
    assert not matrix_pin_mismatches, matrix_pin_mismatches

    backend_data = {}
    backend_rows = {}
    manifests = {}
    app_irs = {}
    for backend in ("react", "dom"):
        build_root = ATTEMPT / "builds" / backend
        request = json_file(build_root / "request.json")
        result = json_file(build_root / "result.json")
        manifest = json_file(build_root / "output/buildmanifest.json")
        assert request["schema"] == "gobi.build-request/v1" and request["backend"] == backend
        assert request["entryPackages"] == ["github.com/samuelpmahan/gondola/fixtures/compiled/methods"]
        expected_out = f"/home/runner/work/gondola/gondola/{ATTEMPT_REL.as_posix()}/builds/{backend}/output"
        assert request["outputDir"] == expected_out
        assert result["schema"] == "gobi.build-result/v1" and result["ok"] is True
        assert len(result["apps"]) == 1 and len(result["outputs"]) == 67 and result["diagnostics"] == []
        assert result["preservedPreviousOutput"] is False
        output_rows = result["outputs"]
        assert len({row["path"] for row in output_rows}) == 67
        before_rows = methods_execution["outputPinsBefore"][backend]
        after_rows = methods_execution["outputPinsAfter"][backend]
        assert before_rows == after_rows and len(before_rows) == 67
        for pin_row in before_rows:
            expected_prefix = f"{ATTEMPT_REL.as_posix()}/builds/{backend}/output/"
            assert pin_row["path"].startswith(expected_prefix)
            relative_output = pin_row["path"][len(expected_prefix):]
            expected = row_pin(output_rows, relative_output)
            assert pin_row["bytes"] == expected["bytes"] and pin_row["sha256"] == expected["sha256"]
        output_root = build_root / "output"
        physical = [path.relative_to(output_root).as_posix() for path in output_root.rglob("*") if path.is_file()]
        assert set(physical) == {row["path"] for row in output_rows}
        full_prefix = f"{ATTEMPT_REL.as_posix()}/builds/{backend}/output/"
        for row in output_rows:
            actual = output_root / row["path"]
            raw = actual.read_bytes()
            assert len(raw) == row["bytes"] and sha(raw) == row["sha256"], f"{backend}/{row['path']}"
            member = expected_members[f"{full_prefix}{row['path']}"]
            assert member == {"path": f"{full_prefix}{row['path']}", "bytes": len(raw), "sha256": sha(raw)}

        assert manifest["schema"] == "gobi.build-manifest/v1" and len(manifest["apps"]) == 1
        app = manifest["apps"][0]
        assert app["backend"] == backend and app["packagePath"] == request["entryPackages"][0]
        assert app["appIR"] == "apps/methods-0cac42b0a982/app-ir.json"
        assert app["module"] == "apps/methods-0cac42b0a982/gobi-compiled.mjs"
        assert app["encoder"] == "apps/methods-0cac42b0a982/encoder.mjs"
        ir_bytes = (output_root / app["appIR"]).read_bytes()
        ir = json.loads(ir_bytes)
        assert result["apps"][0] == ir
        abi = validate_app_ir(ir)
        forwarder_path = next(path for path in manifest["forwarderSources"] if path.endswith("/forwarder.go"))
        forwarder_bytes = (output_root / forwarder_path).read_bytes()
        forwarder = forwarder_bytes.decode()
        forwarder_lines = [
            "func GobiCompiledInit() gobiApp.State {", "return gobiApp.Init()",
            "func GobiCompiledUpdate(state gobiApp.State, message gobiType0.Message) (gobiApp.State, []gobiType0.Effect) {", "return gobiApp.Update(state, message)",
            "func GobiCompiledView(state gobiApp.State) gobiType0.Node {", "return gobiApp.View(state)",
        ]
        assert all(line in forwarder for line in forwarder_lines)
        assert [row["role"] for row in app["roleBindings"]] == ["init", "update", "view"]
        assert app["roleBindings"] == manifest["apps"][0]["roleBindings"]

        build_record = methods_execution["methodBuilds"][backend]
        compile_command = next(row for row in methods_execution["commands"] if row["name"] == f"compile-{backend}")
        compile_stdout = (ATTEMPT / "logs" / f"compile-{backend}.stdout.log").read_bytes()
        assert build_record["backend"] == backend and build_record["outputCount"] == len(output_rows)
        assert build_record["request"]["sha256"] == sha((build_root / "request.json").read_bytes())
        assert build_record["result"]["sha256"] == sha(compile_stdout) == compile_command["stdoutSha256"]
        canonical_stdin = json.dumps(request, separators=(",", ":"), ensure_ascii=False).encode()
        assert compile_command["stdinSha256"] == sha(canonical_stdin)
        assert json.loads(compile_stdout) == result
        assert build_record["manifest"]["sha256"] == sha((output_root / "buildmanifest.json").read_bytes())
        assert build_record["outputPins"] == output_rows
        manifests[backend] = manifest
        app_irs[backend] = ir_bytes
        backend_rows[backend] = {row["path"]: row for row in output_rows}
        backend_data[backend] = {
            "request": pin(build_root / "request.json", relative_to=EXTRACTED),
            "result": pin(build_root / "result.json", relative_to=EXTRACTED),
            "manifest": pin(output_root / "buildmanifest.json", relative_to=EXTRACTED),
            "backend": backend,
            "packagePath": app["packagePath"],
            "outputCount": len(output_rows),
            "beforeAfterInventoryExact": True,
            "outputInventorySha256": sha(json.dumps(output_rows, sort_keys=True, separators=(",", ":")).encode()),
            "appIR": row_pin(output_rows, app["appIR"]),
            "module": row_pin(output_rows, app["module"]),
            "encoder": row_pin(output_rows, app["encoder"]),
            "components": row_pin(output_rows, app["components"]),
            "forwarder": {"path": forwarder_path, "bytes": len(forwarder_bytes), "sha256": sha(forwarder_bytes), "directTypedRoleForwarding": True},
            "roleBindings": app["roleBindings"],
        }

    assert app_irs["react"] == app_irs["dom"]
    assert manifests["react"]["emittedTypeScript"] == manifests["dom"]["emittedTypeScript"]
    assert manifests["react"]["forwarderSources"] == manifests["dom"]["forwarderSources"]
    assert manifests["react"]["apps"][0]["roleBindings"] == manifests["dom"]["apps"][0]["roleBindings"]
    compare_paths = set(backend_rows["react"]) | set(backend_rows["dom"])
    diff_paths = [path for path in sorted(compare_paths) if backend_rows["react"].get(path) != backend_rows["dom"].get(path)]
    assert set(diff_paths) == {"buildmanifest.json", "apps/methods-0cac42b0a982/gobi-compiled.mjs"}
    for path in manifests["react"]["emittedTypeScript"] + manifests["react"]["forwarderSources"] + ["apps/methods-0cac42b0a982/encoder.mjs", "apps/methods-0cac42b0a982/components.gen.mjs"]:
        assert (ATTEMPT / "builds/react/output" / path).read_bytes() == (ATTEMPT / "builds/dom/output" / path).read_bytes(), path

    e_front = json_file(EXTRACTED / "compiled-frontend/artifacts/execution.json")
    e_back = json_file(EXTRACTED / "compiled-backends/artifacts/execution.json")
    front_logs = assert_exec_logs(e_front, EXTRACTED / "compiled-frontend/artifacts/logs")
    back_logs = assert_exec_logs(e_back, EXTRACTED / "compiled-backends/artifacts/logs")
    assert len(e_front["commands"]) == 33 and len(e_back["commands"]) == 18
    assert e_front["versions"]["go"] == "go version go1.27.3 linux/amd64"
    assert e_front["versions"]["rootGo"] == "go version go1.24.13 linux/amd64"
    assert e_back["versions"]["compiledGo"] == "go version go1.27.3 linux/amd64"
    assert e_back["versions"]["rootGo"] == "go version go1.24.13 linux/amd64"
    method_versions = methods_execution["versions"]
    assert method_versions["compiledGo"] == "go version go1.27.3 linux/amd64"
    assert method_versions["rootGo"] == "go version go1.24.13 linux/amd64"

    frontend_artifacts = EXTRACTED / "compiled-frontend/artifacts"
    frontend_result = json.loads((frontend_artifacts / "logs/compile-four.stdout.log").read_bytes())
    assert frontend_result["schema"] == "gobi.build-result/v1" and frontend_result["ok"] is True
    assert len(frontend_result["apps"]) == 4 and len(frontend_result["outputs"]) == 209 and frontend_result["diagnostics"] == []
    assert e_front["outputPinsBefore"] == e_front["outputPinsAfter"] == frontend_result["outputs"]
    frontend_output_audit = verify_output_tree(frontend_artifacts / "compiled", frontend_result["outputs"])
    frontend_manifest = json_file(frontend_artifacts / "compiled/buildmanifest.json")
    assert frontend_manifest["schema"] == "gobi.build-manifest/v1" and len(frontend_manifest["apps"]) == 4
    assert sha((frontend_artifacts / "logs/compile-four.stdout.log").read_bytes()) == next(row["stdoutSha256"] for row in e_front["commands"] if row["name"] == "compile-four")

    backend_output_audit = {}
    for backend in ("react", "dom"):
        record = e_back["backendBuilds"][backend]
        build_output = EXTRACTED / record["outputDir"]
        compile_row = next(row for row in e_back["commands"] if row["name"] == f"compile-{backend}")
        compile_log = EXTRACTED / "compiled-backends/artifacts/logs" / f"compile-{backend}.stdout.log"
        result = json.loads(compile_log.read_bytes())
        assert sha(compile_log.read_bytes()) == compile_row["stdoutSha256"]
        assert record["ok"] is True and record["schema"] == "gobi.build-result/v1" and record["appCount"] == 4
        assert result["ok"] is True and len(result["apps"]) == 4 and len(result["outputs"]) == 209 and result["diagnostics"] == []
        assert record["outputPins"] == result["outputs"]
        assert e_back["outputPinsBefore"][backend] == result["outputs"]
        tree_audit = verify_output_tree(build_output, result["outputs"])
        after_rows = e_back["outputPinsAfter"][backend]
        prefix = f"compiled-backends/artifacts/compiled/{backend}/"
        assert len(after_rows) == 209
        for row in after_rows:
            assert row["path"].startswith(prefix)
            relpath = row["path"][len(prefix):]
            expected = row_pin(result["outputs"], relpath)
            assert row["sha256"] == expected["sha256"]
        manifest = json_file(build_output / "buildmanifest.json")
        assert manifest["schema"] == "gobi.build-manifest/v1" and len(manifest["apps"]) == 4
        backend_output_audit[backend] = {"resultStdout": pin(compile_log, relative_to=EXTRACTED), "requestInputSha256": compile_row.get("inputSha256"), "manifest": pin(build_output / "buildmanifest.json", relative_to=EXTRACTED), "appCount": len(result["apps"]), **tree_audit, "beforeInventoryExact": True, "afterInventoryExact": True}

    goscript_module = json_file(Path(__file__).with_name("go-list-goscript.json"))
    goscript_origin_path = ROOT / "compiled-frontend/toolchain/probe_counter/results/module-origin.json"
    goscript_origin = json_file(goscript_origin_path)
    go_mod = (ROOT / "compiled-frontend/go.mod").read_text()
    go_sum = (ROOT / "compiled-frontend/go.sum").read_text()
    assert "github.com/s4wave/goscript v0.6.2" in go_mod
    assert "github.com/s4wave/goscript v0.6.2 h1:GucUqQ+xvaBzAH6W4U9Ec62T4ytUBDbmGojJbWrVEKc=" in go_sum
    assert "github.com/s4wave/goscript v0.6.2/go.mod h1:g2psiTXAhkiM7vtr8YEgkq/xUlYHLSghruODJL8VpAU=" in go_sum
    assert goscript_module["Version"] == "v0.6.2" and goscript_module["GoVersion"] == "1.27.0"
    assert goscript_module["Sum"] == "h1:GucUqQ+xvaBzAH6W4U9Ec62T4ytUBDbmGojJbWrVEKc="
    assert goscript_origin["Origin"]["Hash"] == "d8f58a091947cff26a9171be7bd130892b0afad3"
    methods_go_build_commands = {row["name"]: row for row in methods_execution["commands"] if row["name"] in ("compile-react", "compile-dom")}
    assert set(methods_go_build_commands) == {"compile-react", "compile-dom"}
    for backend, command in (("react", methods_go_build_commands["compile-react"]), ("dom", methods_go_build_commands["compile-dom"])):
        assert command["command"] == "go" and command["args"] == ["run", "./cmd/gobi-build"]
        assert command["environmentOverrides"]["GOTOOLCHAIN"] == "go1.27.3"
        assert command["stdoutSha256"] == methods_execution["methodBuilds"][backend]["result"]["sha256"]

    build_commands = [row for row in e_front["commands"] if row["name"] in ("root-go-tests", "root-go-race", "root-go-vet", "go-tests", "go-race", "go-vet")]
    assert len(build_commands) == 6 and all(row["exitCode"] == 0 for row in build_commands)
    assert e_front["status"] == "passed" and e_back["status"] == "passed"

    source_pin_sha = sha(json.dumps(source_before, sort_keys=True, separators=(",", ":")).encode())
    current_snapshot_paths = sorted((CI / "lanes/evidence/snapshots").glob("*6b49cc0.json"), key=lambda path: path.name)
    snapshot_path = current_snapshot_paths[-1]
    snapshot = json_file(snapshot_path)
    snapshot_runs = {}
    for run in snapshot["runs"]:
        if run.get("run_id") in (retention["run"], publication["primaryPR"]):
            jobs = run.get("structuredContent", {}).get("jobs", [])
            snapshot_runs[str(run["run_id"])] = [{"job": job["name"], "status": job["status"], "conclusion": job.get("conclusion")} for job in jobs]

    result = {
        "schema": "gobi.e-ci-build-primary-audit/v1",
        "job_id": "E-CI-BUILD",
        "worker": "N4",
        "outcome": "confirmed_reuse",
        "status": "passed_current_primary_artifact",
        "summary": "The successful current-source CI artifact is correctly retained and source-bound; both actual GoScript CLI method builds have complete 67-output inventories, exact role ABI/call graph, shared backend-neutral module support artifacts and separately pinned raw bundles.",
        "sourceBinding": {"commit": retention["source"], "tree": retention["sourceTree"], "gitHead": git_commit, "gitTree": git_tree, "publicationPath": "compiled-methods/ci/2026-10-31/publication-current.json", "publicationPin": pin(CI / "publication-current.json"), "artifactRun": retention["run"], "artifactJob": retention["job"], "artifactId": retention["artifactId"], "workflowOutcome": retention["workflowOutcome"], "metadata": pin(CI / "primary-artifact-metadata.json"), "retention": pin(RETENTION_PATH), "latestWorkflowSnapshot": {"capturedAt": snapshot["capturedAt"], **pin(snapshot_path)}, "snapshotRuns": snapshot_runs},
        "artifactCustody": {"providerZip": pin(ZIP), "providerMetadataZipSha256": metadata["digest"], "retainedChunks": chunk_pins, "chunksReassembleProviderZip": True, "zipCrc": "passed", "memberCount": len(archive_members), "uncompressedBytes": total_uncompressed, "everyArchiveMemberMatchesRetentionAndExtractedFile": True, "extractedFileCount": len(extracted_files), "retentionMemberInventorySha256": sha(json.dumps(retention["members"], sort_keys=True, separators=(",", ":")).encode())},
        "goscript": {"module": "github.com/s4wave/goscript", "version": goscript_module["Version"], "moduleGoVersion": goscript_module["GoVersion"], "moduleSum": goscript_module["Sum"], "goModSum": goscript_module["GoModSum"], "origin": goscript_origin["Origin"], "goListCommandOutput": pin(Path(__file__).with_name("go-list-goscript.json")), "originMetadata": pin(goscript_origin_path), "goMod": pin(ROOT / "compiled-frontend/go.mod"), "goSum": pin(ROOT / "compiled-frontend/go.sum"), "pinnedInCurrentCiSourceInventory": {path: next(row["sha256"] for row in source_before if row["path"] == path) for path in ("compiled-frontend/go.mod", "compiled-frontend/go.sum", "compiled-frontend/build/pipeline.go", "compiled-frontend/emit/backend.go", "compiled-frontend/cmd/gobi-build/main.go")}},
        "methodsAttempt": {"attempt": methods_execution["attempt"], "status": methods_execution["status"], "mode": methods_execution["mode"], "commandCount": len(methods_execution["commands"]), "commands": [{"name": row["name"], "command": row["command"], "args": row["args"], "cwd": row["cwd"], "environmentOverrides": row["environmentOverrides"], "exitCode": row["exitCode"], "stdoutSha256": row["stdoutSha256"], "stderrSha256": row["stderrSha256"]} for row in methods_execution["commands"]], "commandLogs": method_command_audit, "sourceBeforeCount": len(source_before), "sourceAfterCount": len(source_after), "sourceBeforeAfterExact": True, "sourcePinsMatchCurrentCommitFiles": True, "sourcePinInventorySha256": source_pin_sha, "matrix": {"status": methods_matrix["status"], "node": methods_matrix["node"], "versions": methods_matrix["versions"], "sourcePinCount": len(methods_matrix["sourcePinsFinal"]), "sourcePinSourceFilesMatched": matrix_source_count, "sourcePinAttemptOutputsMatched": matrix_attempt_output_count, "sourceStable": methods_matrix["sourceStable"], "sourceStableThroughCheck": methods_matrix["sourceStableThroughCheck"], "outputsStableThroughCheck": methods_matrix["outputsStableThroughCheck"], "domBuildParity": methods_matrix["domBuildParity"]}, "versions": method_versions, "backends": backend_data, "backendOutputParity": {"identicalAppIR": True, "identicalEncoder": True, "identicalComponents": True, "identicalEmittedTypeScript": True, "identicalGoForwarders": True, "identicalRoleBindings": True, "sharedOutputCount": len(compare_paths) - len(diff_paths), "differingPaths": diff_paths}, "appIRABI": abi},
        "inheritedRuns": {"compiledFrontend": {"status": e_front["status"], "commandCount": len(e_front["commands"]), "commandLogs": front_logs, "versions": e_front["versions"], "buildOutput": {"appCount": len(frontend_result["apps"]), **frontend_output_audit, "beforeAfterInventoryExact": True}}, "compiledBackends": {"status": e_back["status"], "commandCount": len(e_back["commands"]), "commandLogs": back_logs, "versions": e_back["versions"], "backendBuildOutputs": backend_output_audit}, "goTestRaceVet": [{"name": row["name"], "args": row["args"], "exitCode": row["exitCode"], "stdoutSha256": row["stdoutSha256"], "stderrSha256": row["stderrSha256"]} for row in build_commands]},
        "limits": ["This confirms the retained current push-run artifact and its source/build provenance; it does not claim that the pull-request workflow is complete or that all repository workflows are green.", "The raw React and DOM GoScript module hashes differ and are pinned separately; no normalized-bundle equality claim is made.", "This audit checked captured CI logs and artifacts; it did not rerun Go tests, race tests, vet, builds, or browser tests."],
    }
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"output": str(OUT.relative_to(ROOT)), "sha256": sha(OUT.read_bytes()), "outcome": result["outcome"], "providerZip": result["artifactCustody"]["providerZip"], "members": result["artifactCustody"]["memberCount"], "sourcePins": len(source_before), "outputsPerBackend": {key: value["outputCount"] for key, value in backend_data.items()}, "rawModules": {key: value["module"] for key, value in backend_data.items()}, "compilerCommands": len(build_commands), "fullMethodCommands": len(methods_execution["commands"])}, indent=2))


def row_pin(rows: list[dict], path: str) -> dict:
    for row in rows:
        if row["path"] == path:
            return {"path": path, "bytes": row["bytes"], "sha256": row["sha256"]}
    raise AssertionError(f"missing output pin {path}")


if __name__ == "__main__":
    main()
