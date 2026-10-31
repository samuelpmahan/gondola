#!/usr/bin/env python3
"""Read-only custody and build-output audit for E-CI-BUILD preflight."""

from __future__ import annotations

import hashlib
import json
import tarfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
CI = ROOT / "compiled-methods/ci/2026-10-31"
LOCAL_ARCHIVE = ROOT / "compiled-methods/evidence/builds/final-local-methods-only.tar.gz"
LOCAL_MANIFEST = ROOT / "compiled-methods/evidence/builds/final-local-methods-only.json"
OLD_ROOT = CI / "initial-source8ed"
OLD_RETENTION = OLD_ROOT / "artifact-retention.json"
OLD_EXTRACTED = OLD_ROOT / "extracted"
OUT = Path(__file__).with_name("preflight-audit.json")
REPORT = CI / "coordination/reports/E-CI-BUILD.md"
RECEIPT = CI / "coordination/receipts/E-CI-BUILD.json"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"path": str(path.relative_to(ROOT)), "bytes": len(data), "sha256": digest(data)}


def tar_bytes(archive: tarfile.TarFile, path: str) -> bytes:
    entry = archive.extractfile(path)
    if entry is None:
        raise AssertionError(f"tar member is not a file: {path}")
    return entry.read()


def json_bytes(data: bytes, label: str):
    try:
        return json.loads(data)
    except Exception as exc:
        raise AssertionError(f"invalid JSON in {label}: {exc}") from exc


def audit_old_ci() -> dict:
    metadata = json.loads(OLD_RETENTION.read_text())
    archive_path = OLD_ROOT / "original.zip"
    archive_bytes = archive_path.read_bytes()
    assert len(archive_bytes) == metadata["providerZipBytes"]
    assert digest(archive_bytes) == metadata["providerZipSha256"]

    chunk_rows = []
    chunk_data = []
    for row in metadata["chunks"]:
        path = OLD_ROOT / row["path"]
        part = path.read_bytes()
        assert len(part) == row["bytes"] and digest(part) == row["sha256"]
        chunk_rows.append(file_pin(path))
        chunk_data.append(part)
    reconstructed = b"".join(chunk_data)
    assert len(reconstructed) == len(archive_bytes) and digest(reconstructed) == digest(archive_bytes)

    members = {}
    with zipfile.ZipFile(archive_path) as zf:
        bad = zf.testzip()
        assert bad is None, f"ZIP CRC failure: {bad}"
        infos = [item for item in zf.infolist() if not item.is_dir()]
        assert len(infos) == len(metadata["members"])
        assert len({item.filename for item in infos}) == len(infos)
        expected = {item["path"]: item for item in metadata["members"]}
        for item in infos:
            raw = zf.read(item)
            row = expected[item.filename]
            assert len(raw) == row["bytes"] and digest(raw) == row["sha256"], item.filename
            extracted = OLD_EXTRACTED / item.filename
            assert extracted.is_file()
            assert file_pin(extracted)["bytes"] == len(raw)
            assert file_pin(extracted)["sha256"] == digest(raw)
            members[item.filename] = {"bytes": len(raw), "sha256": digest(raw)}
    assert set(members) == set(expected)
    assert len(members) == 957
    return {
        "sourceCommit": metadata["source"],
        "run": metadata["run"],
        "job": metadata["job"],
        "artifactId": metadata["artifactId"],
        "outcome": metadata["outcome"],
        "providerZip": file_pin(archive_path),
        "chunks": chunk_rows,
        "reconstructedChunkStreamMatchesZip": True,
        "zipTestzip": None,
        "memberCount": len(members),
        "extractedMembersMatchArchive": True,
        "memberInventorySha256": digest(json.dumps(metadata["members"], sort_keys=True, separators=(",", ":")).encode()),
        "acceptanceUse": "custody and historical diagnosis only; failed 8ed source is not a complete accepted methods run",
    }


def audit_local_methods_only() -> dict:
    metadata = json.loads(LOCAL_MANIFEST.read_text())
    archive_data = LOCAL_ARCHIVE.read_bytes()
    assert len(archive_data) == metadata["bytes"] and digest(archive_data) == metadata["sha256"]
    expected_members = {row["path"]: row for row in metadata["members"]}
    assert len(expected_members) == len(metadata["members"]) == 189

    with tarfile.open(LOCAL_ARCHIVE, "r:gz") as tf:
        entries = [m for m in tf.getmembers() if m.isfile()]
        assert len(entries) == len(expected_members)
        assert len({m.name for m in entries}) == len(entries)
        for item in entries:
            raw = tar_bytes(tf, item.name)
            row = expected_members[item.name]
            assert len(raw) == row["bytes"] and digest(raw) == row["sha256"], item.name
        assert {m.name for m in entries} == set(expected_members)

        prefixes = {
            backend: f"compiled-methods/artifacts/attempts/{metadata['attempt'].split('/')[-1]}/builds/{backend}"
            for backend in ("react", "dom")
        }
        backend_details = {}
        backend_output_rows = {}
        manifests = {}
        app_irs = {}
        for backend, prefix in prefixes.items():
            request = json_bytes(tar_bytes(tf, f"{prefix}/request.json"), f"{backend} request")
            result = json_bytes(tar_bytes(tf, f"{prefix}/result.json"), f"{backend} result")
            manifest = json_bytes(tar_bytes(tf, f"{prefix}/output/buildmanifest.json"), f"{backend} manifest")
            assert request["schema"] == "gobi.build-request/v1" and request["backend"] == backend
            assert request["entryPackages"] == ["github.com/samuelpmahan/gondola/fixtures/compiled/methods"]
            assert result["schema"] == "gobi.build-result/v1" and result["ok"] is True
            assert len(result["apps"]) == 1 and len(result["outputs"]) == 67
            assert result["diagnostics"] == []
            assert result["preservedPreviousOutput"] is False
            output_rows = result["outputs"]
            assert len({row["path"] for row in output_rows}) == len(output_rows)
            actual_output_paths = {name[len(f"{prefix}/output/"):] for name in expected_members if name.startswith(f"{prefix}/output/")}
            assert actual_output_paths == {row["path"] for row in output_rows}
            for row in output_rows:
                raw = tar_bytes(tf, f"{prefix}/output/{row['path']}")
                assert len(raw) == row["bytes"] and digest(raw) == row["sha256"], f"{backend}:{row['path']}"

            assert manifest["schema"] == "gobi.build-manifest/v1"
            assert len(manifest["apps"]) == 1
            app = manifest["apps"][0]
            assert app["backend"] == backend
            assert app["packagePath"] == request["entryPackages"][0]
            assert app["appIR"] == "apps/methods-0cac42b0a982/app-ir.json"
            assert app["module"] == "apps/methods-0cac42b0a982/gobi-compiled.mjs"
            assert app["encoder"] == "apps/methods-0cac42b0a982/encoder.mjs"
            ir_bytes = tar_bytes(tf, f"{prefix}/output/{app['appIR']}")
            app_ir = json_bytes(ir_bytes, f"{backend} AppIR")
            assert result["apps"][0] == app_ir
            forwarder_path = next(path for path in manifest["forwarderSources"] if path.endswith("/forwarder.go"))
            forwarder_bytes = tar_bytes(tf, f"{prefix}/output/{forwarder_path}")
            forwarder_text = forwarder_bytes.decode()
            forwarder_expectations = [
                "func GobiCompiledInit() gobiApp.State {",
                "return gobiApp.Init()",
                "func GobiCompiledUpdate(state gobiApp.State, message gobiType0.Message) (gobiApp.State, []gobiType0.Effect) {",
                "return gobiApp.Update(state, message)",
                "func GobiCompiledView(state gobiApp.State) gobiType0.Node {",
                "return gobiApp.View(state)",
            ]
            assert all(fragment in forwarder_text for fragment in forwarder_expectations), f"{backend} forwarder ABI/wiring"
            manifests[backend] = manifest
            app_irs[backend] = app_ir
            backend_output_rows[backend] = {row["path"]: row for row in output_rows}
            backend_details[backend] = {
                "request": {"backend": request["backend"], "entryPackages": request["entryPackages"]},
                "result": {"ok": result["ok"], "appCount": len(result["apps"]), "outputCount": len(output_rows), "diagnostics": result["diagnostics"], "preservedPreviousOutput": result["preservedPreviousOutput"]},
                "manifestApp": app,
                "goForwarder": {"path": forwarder_path, "bytes": len(forwarder_bytes), "sha256": digest(forwarder_bytes), "directRoleForwarding": True},
                "outputInventorySha256": digest(json.dumps(output_rows, sort_keys=True, separators=(",", ":")).encode()),
                "outputRolePins": {
                    key: row_pin(output_rows, app[key])
                    for key in ("appIR", "module", "encoder", "components")
                },
            }

        assert app_irs["react"] == app_irs["dom"]
        assert manifests["react"]["forwarderModule"] == manifests["dom"]["forwarderModule"]
        assert manifests["react"]["forwarderGoMod"] == manifests["dom"]["forwarderGoMod"]
        assert manifests["react"]["forwarderSources"] == manifests["dom"]["forwarderSources"]
        assert manifests["react"]["emittedTypeScript"] == manifests["dom"]["emittedTypeScript"]
        for backend in ("react", "dom"):
            paths = ["apps/methods-0cac42b0a982/app-ir.json", "apps/methods-0cac42b0a982/encoder.mjs", "apps/methods-0cac42b0a982/components.gen.mjs"]
            paths.extend(manifests[backend]["emittedTypeScript"])
            paths.extend(manifests[backend]["forwarderSources"])
            for path in paths:
                if backend == "react":
                    left = tar_bytes(tf, f"{prefixes['react']}/output/{path}")
                    right = tar_bytes(tf, f"{prefixes['dom']}/output/{path}")
                    assert left == right, f"backend-neutral artifact differs: {path}"

        ir = app_irs["react"]
        symbols = {symbol["id"]: symbol for symbol in ir["symbols"]}
        pkg = "github.com/samuelpmahan/gondola/fixtures/compiled/methods"
        expected_roles = {
            f"{pkg}.Init": {"params": [], "results": [f"{pkg}.State"]},
            f"{pkg}.Update": {"params": [f"{pkg}.State", "github.com/samuelpmahan/gondola/gobi.Message"], "results": [f"{pkg}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]},
            f"{pkg}.View": {"params": [f"{pkg}.State"], "results": ["github.com/samuelpmahan/gondola/gobi.Node"]},
        }
        expected_methods = {
            "Initialize": ([], [f"{pkg}.State"]),
            "Reduce": (["github.com/samuelpmahan/gondola/gobi.Message"], [f"{pkg}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
            "AddParent": ([], [f"{pkg}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
            "ResetParent": ([], [f"{pkg}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
            "AddChild": ([], [f"{pkg}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
            "ResetChild": ([], [f"{pkg}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
            "ToggleReadOnly": ([], [f"{pkg}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
            "CaptureChild": ([], [f"{pkg}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
            "PublishSaved": ([], [f"{pkg}.State", "[]github.com/samuelpmahan/gondola/gobi.Effect"]),
            "ComposeView": ([], ["github.com/samuelpmahan/gondola/gobi.Node"]),
        }
        expected_calls = {
            f"{pkg}.Init": [f"{pkg}.State.Initialize"],
            f"{pkg}.State.Initialize": ["github.com/samuelpmahan/gondola/counter.Init"],
            f"{pkg}.Update": [f"{pkg}.State.Reduce"],
            f"{pkg}.State.Reduce": [f"{pkg}.State.AddParent", f"{pkg}.State.ResetParent", f"{pkg}.State.AddChild", f"{pkg}.State.ResetChild", f"{pkg}.State.ToggleReadOnly", f"{pkg}.State.CaptureChild", f"{pkg}.State.PublishSaved"],
            f"{pkg}.State.AddParent": ["github.com/samuelpmahan/gondola/counter.Update"],
            f"{pkg}.State.ResetParent": ["github.com/samuelpmahan/gondola/counter.Update"],
            f"{pkg}.State.AddChild": ["github.com/samuelpmahan/gondola/counter.Update"],
            f"{pkg}.State.ResetChild": ["github.com/samuelpmahan/gondola/counter.Update"],
            f"{pkg}.State.ComposeView": [],
            f"{pkg}.View": [f"{pkg}.State.ComposeView"],
        }
        for symbol_id, signature in expected_roles.items():
            assert symbol_id in symbols and symbols[symbol_id]["signature"] == signature, symbol_id
        for method, (explicit, results) in expected_methods.items():
            symbol_id = f"{pkg}.State.{method}"
            assert symbol_id in symbols, symbol_id
            sig = symbols[symbol_id]["signature"]
            assert sig["params"] == [f"{pkg}.State", *explicit] and sig["results"] == results, symbol_id
        for symbol_id, calls in expected_calls.items():
            assert symbols[symbol_id]["calls"] == calls, symbol_id
        assert all(call in symbols for call in expected_calls[f"{pkg}.State.Reduce"])
        assert len([symbol for symbol in symbols if symbol.startswith(pkg + ".State.")]) == 10
        assert f"github.com/samuelpmahan/gondola/counter.Init" in symbols
        assert f"github.com/samuelpmahan/gondola/counter.Update" in symbols
        assert len(symbols) == 15

        role_graph = {key: symbols[key]["calls"] for key in expected_calls}
        role_bindings = manifests["react"]["apps"][0]["roleBindings"]
        assert role_bindings == manifests["dom"]["apps"][0]["roleBindings"]
        assert [x["role"] for x in role_bindings] == ["init", "update", "view"]

        output_comparison = {}
        all_paths = set(backend_output_rows["react"]) | set(backend_output_rows["dom"])
        changed = []
        for path in sorted(all_paths):
            left, right = backend_output_rows["react"].get(path), backend_output_rows["dom"].get(path)
            if left != right:
                changed.append(path)
        assert set(changed) == {
            "buildmanifest.json",
            "apps/methods-0cac42b0a982/gobi-compiled.mjs",
        }, changed
        output_comparison = {
            "sharedOutputCount": len(all_paths) - len(changed),
            "expectedDifferingOutputPaths": changed,
            "rawBundlePins": {
                backend: row_pin(list(backend_output_rows[backend].values()), "apps/methods-0cac42b0a982/gobi-compiled.mjs")
                for backend in ("react", "dom")
            },
        }

    with tarfile.open(LOCAL_ARCHIVE, "r:gz") as tf:
        attempt_root = f"compiled-methods/artifacts/attempts/{metadata['attempt'].split('/')[-1]}"
        execution = json_bytes(tar_bytes(tf, f"{attempt_root}/matrix/methods.run.json"), "methods conformance execution")
        compiler_go = tar_bytes(tf, f"{attempt_root}/logs/version-compiled-go.stdout.log").decode().strip()
    assert execution["status"] == "matched"
    assert execution["node"] == "v22.23.4"
    assert execution["versions"]["go"]["output"].startswith("go version go1.24.0 ")
    assert compiler_go.startswith("go version go1.27.3 ")
    pins = execution.get("sourcePinsFinal", [])
    return {
        "archive": file_pin(LOCAL_ARCHIVE),
        "memberCount": len(expected_members),
        "allMembersMatchManifest": True,
        "attempt": metadata["attempt"],
        "scope": metadata["scope"],
        "execution": {"status": execution["status"], "node": execution["node"], "rootGoVersion": execution["versions"]["go"]["output"].strip(), "compiledGoVersion": compiler_go, "chromium": execution["versions"]["chromium"], "sourcePinsFinalCount": len(pins), "sourceStable": execution.get("sourceStable"), "sourceStableThroughCheck": execution.get("sourceStableThroughCheck"), "outputsStableThroughCheck": execution.get("outputsStableThroughCheck")},
        "backends": backend_details,
        "backendNeutralArtifacts": {"AppIR": True, "encoder": True, "components": True, "emittedTypeScriptPathsAndBytes": True, "forwarderSourcesAndBytes": True, "roleBindings": True},
        "moduleBackendOutputDifference": output_comparison,
        "appIR": {"schema": ir["schema"], "packagePath": ir["packagePath"], "componentCount": len(ir["components"]), "symbolCount": len(symbols), "roleSignatures": expected_roles, "methodCount": 10, "dependencySymbols": ["github.com/samuelpmahan/gondola/counter.Init", "github.com/samuelpmahan/gondola/counter.Update"], "callGraph": role_graph},
        "acceptanceUse": "preflight only; local methods-only build is not current-head CI evidence or full inherited local success",
    }


def row_pin(rows: list[dict], path: str) -> dict:
    for row in rows:
        if row["path"] == path:
            return {"path": path, "bytes": row["bytes"], "sha256": row["sha256"]}
    raise AssertionError(f"missing output row: {path}")


def main() -> None:
    publication = json.loads((CI / "publication-current.json").read_text())
    assert publication["sourceCommit"] == "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
    assert publication["sourceTree"] == "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
    assert publication["parent"] == "8ed5b66a223de1992756516f8d3895c6e096f842"
    old = audit_old_ci()
    local = audit_local_methods_only()
    source_paths = [
        "compiled-methods/run.mjs",
        "compiled-frontend/go.mod",
        "compiled-frontend/go.sum",
        "compiled-frontend/build/pipeline.go",
        "compiled-frontend/emit/backend.go",
        "compiled-frontend/cmd/gobi-build/main.go",
        "compilercontract/contract.go",
        "compilercontract/validation.go",
    ]
    source_pins = [file_pin(ROOT / path) for path in source_paths]
    goscript_module = json.loads((Path(__file__).with_name("go-list-goscript.json")).read_text())
    goscript_origin_path = ROOT / "compiled-frontend/toolchain/probe_counter/results/module-origin.json"
    goscript_origin = json.loads(goscript_origin_path.read_text())
    assert goscript_module["Version"] == "v0.6.2"
    assert goscript_module["GoVersion"] == "1.27.0"
    assert goscript_origin["Origin"]["Hash"] == "d8f58a091947cff26a9171be7bd130892b0afad3"
    snapshots = sorted((CI / "lanes/evidence/snapshots").glob("*6b49cc0.json"), key=lambda path: path.name)
    current_snapshot_path = snapshots[-1]
    current_snapshot = json.loads(current_snapshot_path.read_text())
    assert current_snapshot["sourceSha"] == publication["sourceCommit"]
    run_status = {}
    for row in current_snapshot["runs"]:
        run_id = row.get("run_id")
        if run_id not in (publication["primaryPush"], publication["primaryPR"]):
            continue
        jobs = row.get("structuredContent", {}).get("jobs", [])
        assert len(jobs) == 1 and jobs[0]["name"] == "compiled-methods"
        run_status[str(run_id)] = {"jobStatus": jobs[0]["status"], "conclusion": jobs[0].get("conclusion"), "steps": [{"name": step["name"], "status": step["status"], "conclusion": step.get("conclusion")} for step in jobs[0].get("steps", [])]}
    assert set(run_status) == {str(publication["primaryPush"]), str(publication["primaryPR"])}
    result = {
        "schema": "gobi.e-ci-build-preflight/v1",
        "job_id": "E-CI-BUILD",
        "worker": "N4",
        "status": "preflight_complete_fresh_ci_pending",
        "outcome": "insufficient_evidence",
        "currentSource": {"commit": publication["sourceCommit"], "tree": publication["sourceTree"], "parent": publication["parent"], "primaryPush": publication["primaryPush"], "primaryPullRequestRun": publication["primaryPR"], "productionChange": publication["productionChange"]},
        "latestCIStatusSnapshot": {"captureTime": current_snapshot["capturedAt"], "pin": file_pin(current_snapshot_path), "targetRuns": run_status},
        "sourcePins": source_pins,
        "goscript": {"module": "github.com/s4wave/goscript", "version": goscript_module["Version"], "goVersion": goscript_module["GoVersion"], "sum": goscript_module["Sum"], "goModSum": goscript_module["GoModSum"], "origin": goscript_origin["Origin"], "capturedModuleCommandOutput": file_pin(Path(__file__).with_name("go-list-goscript.json")), "originMetadata": file_pin(goscript_origin_path)},
        "historical8ed": old,
        "localMethodsOnly": local,
        "freshCurrentHeadArtifact": {"run": publication["primaryPush"], "pullRequestRun": publication["primaryPR"], "status": "build jobs in progress at the latest captured snapshot; final audit blocked until root supplies retained artifact"},
        "limits": ["The historical 8ed CI artifact failed its methods provenance-path gate and is not accepted as complete.", "The retained local METHODS-ONLY run is useful build evidence but cannot substitute for fresh CI at 6b49.", "Raw React and DOM bundle bytes are separately pinned; no normalized-bundle equality claim is made.", "No source, production, CI artifact, or Git state was changed by this audit."],
    }
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    audit_pin = file_pin(OUT)
    script_pin = file_pin(Path(__file__))
    commands = [
        {
            "command": "PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go list -m -json github.com/s4wave/goscript",
            "working_directory": "repository root",
            "exit_code": 1,
            "stderr": "go: module github.com/s4wave/goscript: not a known dependency",
            "result": "Exploratory query used the wrong module directory; rerun from compiled-frontend succeeded.",
        },
        {
            "command": "python3 compiled-methods/ci/2026-10-31/lanes/build/preflight.py",
            "working_directory": "repository root",
            "exit_code": 0,
            "result": "Verified local archive members and both backend output inventories; wrote preflight audit.",
        },
        {
            "command": "PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go list -m -json github.com/s4wave/goscript",
            "working_directory": "compiled-frontend",
            "exit_code": 0,
            "stdout": "compiled-methods/ci/2026-10-31/lanes/build/go-list-goscript.json",
            "stdout_sha256": digest((Path(__file__).with_name("go-list-goscript.json")).read_bytes()),
            "result": "Resolved pinned GoScript module v0.6.2 and sums.",
        },
        {
            "command": "git diff --name-only HEAD^ HEAD -- compiled-frontend cmd/compiled-native compilercontract gobi counter fixtures/compiled/methods",
            "working_directory": "repository root",
            "exit_code": 0,
            "stdout": "empty",
            "result": "No Go application, analyzer/build/compiler-contract, native, or renderer source changed in this producer-path commit.",
        },
        {
            "command": "git diff --stat HEAD^ HEAD -- compiled-methods/run.mjs",
            "working_directory": "repository root",
            "exit_code": 0,
            "stdout": "compiled-methods/run.mjs | 23 +++++++++++++++--------; 1 file changed, 15 insertions(+), 8 deletions(-)",
            "result": "The reviewed code delta is the runner provenance layout and final inventory roots recorded in publication-current.json.",
        },
    ]
    receipt = {
        "schema": "gobi.compiled-methods-ci-build-audit/v1",
        "job_id": "E-CI-BUILD",
        "worker": "N4",
        "status": "preflight_complete_waiting_for_current_head_artifact",
        "outcome": "insufficient_evidence",
        "summary": "Preflight custody and local backend build audit passed; final CI build acceptance is pending the retained current-head 6b49 artifact.",
        "source": result["currentSource"],
        "latest_ci_snapshot": result["latestCIStatusSnapshot"],
        "evidence": {"audit": audit_pin, "audit_script": script_pin, "GoScript_module_output": file_pin(Path(__file__).with_name("go-list-goscript.json")), "historical_8ed": result["historical8ed"]["providerZip"], "local_methods_only": result["localMethodsOnly"]["archive"]},
        "commands": commands,
        "checks": [
            "Historical 8ed provider ZIP digest matches all three retained chunks; ZIP CRC passes; 957 archive members match retained extracted files.",
            "Local methods-only tar digest and all 189 manifest members match.",
            "Both local backend requests/builds use the methods fixture, return ok:true with one AppIR and exactly 67 outputs; every BuildResult path/size/hash matches archive bytes.",
            "Both manifests identify the requested backend while module/AppIR/encoder paths, roles and package identity remain stable.",
            "React and DOM AppIR bytes match and contain 3 role symbols, 10 State value-receiver methods, and 2 counter dependency symbols with the expected signatures/call edges.",
            "Encoder, components, emitted TypeScript, forwarder Go sources, and role bindings match byte for byte across local builds; only buildmanifest.json and raw gobi-compiled.mjs differ.",
            "The generated Go forwarder directly returns methods.Init, methods.Update, and methods.View with typed State/Message/Effect/Node signatures; no JavaScript reducer is inserted.",
            "GoScript v0.6.2 module version, Go version, VCS origin, and sums are tied to module query output, module metadata and current nested go.mod/go.sum.",
        ],
        "failures": [
            "No build or test failure was encountered in this read-only preflight. An exploratory Go module query from repository root failed because GoScript is a dependency of the nested compiled-frontend module; the exact query from compiled-frontend succeeded and its output is retained.",
        ],
        "limits": result["limits"] + ["No Go tests, race tests, vet, current-head build, or CI artifact were run by this preflight worker; fresh workflow logs/artifacts remain the completion gate."],
    }
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT.write_text(json.dumps(receipt, indent=2) + "\n")
    audit_sha = audit_pin["sha256"]
    report = f"""# E-CI-BUILD interim preflight

**Outcome: `insufficient_evidence`.** The local and historical artifact preflight passed, but the fresh current-head CI artifact has not yet been supplied. This packet does not accept CI for the current source.

## Current source and CI gate

- Source commit `{publication['sourceCommit']}`, tree `{publication['sourceTree']}`, parent `{publication['parent']}`.
- Primary push run `{publication['primaryPush']}` and pull-request run `{publication['primaryPR']}`.
- Latest retained workflow snapshot: `{current_snapshot['capturedAt']}` (`{file_pin(current_snapshot_path)['sha256']}`). Both target `compiled-methods` jobs remain `in_progress` in that snapshot.
- The source publication records the producer change as `compiled-methods/run.mjs` provenance layout and final inventory roots. The source diff has no changes under `compiled-frontend`, `cmd/compiled-native`, `compilercontract`, `gobi`, `counter`, or `fixtures/compiled/methods`; `run.mjs` is 15 insertions / 8 deletions. It is not an application/analyzer/emitter code change.

## Historical and local artifact preflight

The historical 8ed provider ZIP is retained at `compiled-methods/ci/2026-10-31/initial-source8ed/original.zip`: {old['providerZip']['bytes']} bytes, SHA-256 `{old['providerZip']['sha256']}`. Its three retained chunks reconstruct that exact ZIP. ZIP CRC validation passes, and each of its {old['memberCount']} members matches the retained extracted copy and recorded inventory. This run failed the methods provenance-path gate and is retained for history only.

The local METHODS-ONLY tar is `{local['archive']['bytes']}` bytes, SHA-256 `{local['archive']['sha256']}`; all {local['memberCount']} archive members match the manifest. It records a matched local methods-only run with Node `{local['execution']['node']}`, root/native `{local['execution']['rootGoVersion']}`, compiler `{local['execution']['compiledGoVersion']}`, and Chromium `{local['execution']['chromium']}`. The archive does not represent a full inherited local run and is not a substitute for the current-head CI artifact.

Both React and DOM requests target `{local['backends']['react']['manifestApp']['packagePath']}`. Each BuildResult reports one AppIR, 67 outputs, no diagnostics, and all output paths/bytes/SHA-256 values match the archive. Each manifest records its requested `backend` and uses the same module, AppIR, encoder, component, forwarder and role-binding paths.

React and DOM AppIR bytes are identical. The emitted module contains 15 symbols: 3 role functions, 10 `State` value-receiver methods, and 2 `counter` dependency symbols. Receiver-first signatures and the call graph match `compiled-methods/FIXTURE.md`; Update forwards `(State, []gobi.Effect)`. The generated Go facade directly returns `methods.Init`, `methods.Update`, and `methods.View` with typed State/Message/Effect/Node signatures; no JavaScript reducer is inserted. The encoder, components, emitted TypeScript, forwarder source files, and role bindings match exactly between local backend builds. The only differing output paths are `buildmanifest.json` and `apps/methods-0cac42b0a982/gobi-compiled.mjs`. The raw module pins are separate: React {local['moduleBackendOutputDifference']['rawBundlePins']['react']['bytes']} bytes, SHA-256 `{local['moduleBackendOutputDifference']['rawBundlePins']['react']['sha256']}`; DOM {local['moduleBackendOutputDifference']['rawBundlePins']['dom']['bytes']} bytes, SHA-256 `{local['moduleBackendOutputDifference']['rawBundlePins']['dom']['sha256']}`. No normalized bundle equality is claimed.

## Build provenance and reproducibility boundary

The current nested module pins `github.com/s4wave/goscript` `{goscript_module['Version']}` with module Go version `{goscript_module['GoVersion']}`, sum `{goscript_module['Sum']}`, go.mod sum `{goscript_module['GoModSum']}`, and VCS origin `{goscript_origin['Origin']['Hash']}` (`{goscript_origin['Origin']['Ref']}`). The module query output is retained at `compiled-methods/ci/2026-10-31/lanes/build/go-list-goscript.json`.

The machine-readable preflight audit is `compiled-methods/ci/2026-10-31/lanes/build/preflight-audit.json` (SHA-256 `{audit_sha}`). Its audit program checks ZIP/tar custody and every local BuildResult output directly against archived bytes; no extraction or source changes were performed. No Go test, race, vet, or fresh current-head build was run by this worker.

## Gate to finish

Wait for root to supply the retained primary artifact for commit `{publication['sourceCommit']}`. Then audit its provenance against the source/tree and run IDs, archive CRC/member inventory, both 67-output backend BuildResults, manifests, AppIR/encoder/forwarder/TypeScript parity, separate raw module pins, GoScript and root/compiler tool versions, and captured Go test/race/vet logs. Until then this receipt remains `insufficient_evidence`.
"""
    REPORT.write_text(report)
    print(json.dumps({"output": str(OUT.relative_to(ROOT)), "sha256": digest(OUT.read_bytes()), "status": result["status"], "oldZipMembers": old["memberCount"], "localMembers": local["memberCount"], "localOutputsPerBackend": 67, "changedBackendOutputPaths": local["moduleBackendOutputDifference"]["expectedDifferingOutputPaths"]}, indent=2))


if __name__ == "__main__":
    main()
