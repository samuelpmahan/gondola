#!/usr/bin/env python3
"""Read-only independent audit of the retained primary CI demo evidence."""
from __future__ import annotations

import hashlib
import json
import subprocess
import tarfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
REPO = ROOT.parents[2]
OUT = Path(__file__).resolve().parent / "audit.json"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load(path: Path):
    return json.loads(path.read_text())


def file_pin(path: Path):
    raw = path.read_bytes()
    return {"bytes": len(raw), "sha256": sha(raw)}


def main() -> None:
    prov = load(ROOT / "primary-provenance.json")
    run = load(ROOT / "primary-run.json")
    jobs = load(ROOT / "primary-jobs.json")["jobs"]
    artifact_meta = load(ROOT / "artifact.json")["artifacts"]
    index = load(ROOT / "retained-index.json")
    retention = load(ROOT / "retention.json")
    author = load(ROOT / "coordination/receipts/E-CI-DEMO.json")
    e = author["evidence"]
    outer = e["execution"]
    inherited = outer["inherited"]
    full_exec_path = ROOT / "extracted/compiled-backends/artifacts/execution.json"
    nested_exec_path = ROOT / "extracted/compiled-frontend/artifacts/execution.json"
    full_exec = load(full_exec_path)
    nested_exec = load(nested_exec_path)

    checks: dict[str, object] = {}
    failures: list[str] = []

    def check(name: str, ok: bool, detail=None):
        checks[name] = {"ok": bool(ok), "detail": detail}
        if not ok:
            failures.append(name)

    head = prov["sourceHead"]
    tree = prov["sourceTree"]
    local_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    check("primary_identity", (
        head == "195c9433179218348d4b9f2477ae1e0725337d15"
        and tree == "c0e4a66eee3fdd8b789e1b565167856fdab62433"
        and prov["event"] == "push" and prov["status"] == "completed"
        and prov["conclusion"] == "success" and prov["actualCheckout"] == head
        and run["id"] == prov["run"] and run["head_sha"] == head
        and run["event"] == "push" and run["status"] == "completed"
        and run["conclusion"] == "success" and local_head == head
    ), {"head": head, "tree": tree, "run": run["id"], "localHead": local_head})
    job = next((x for x in jobs if x.get("id") == prov["job"]), {})
    check("primary_job", bool(job) and job.get("conclusion") == "success"
          and e["primary_ci"]["allJobStepsSucceeded"] is True
          and all(x.get("conclusion") == "success" for x in job.get("steps", [])),
          {"job": prov["job"], "name": job.get("name"), "conclusion": job.get("conclusion"),
           "steps": len(job.get("steps", []))})
    provider = artifact_meta[0]
    zip_path = ROOT / "original.zip"
    zip_pin = file_pin(zip_path)
    check("provider_artifact", provider.get("id") == prov["artifact"]
          and provider.get("digest") == "sha256:" + zip_pin["sha256"]
          and zip_pin["bytes"] == prov["artifactZipBytes"]
          and zip_pin["sha256"] == prov["artifactZipSha256"]
          and e["artifact"]["providerSha256"] == zip_pin["sha256"]
          and e["artifact"]["zipBytes"] == zip_pin["bytes"],
          {"artifactId": provider.get("id"), **zip_pin})

    entries = {x["path"]: x for x in index}
    check("retained_index_shape", len(index) == 817 and len(entries) == 817,
          {"entries": len(index), "uniquePaths": len(entries)})
    zip_members: dict[str, bytes] = {}
    zip_failures: list[str] = []
    with zipfile.ZipFile(zip_path) as zf:
        names = [n for n in zf.namelist() if not n.endswith("/")]
        for name in names:
            try:
                zip_members[name] = zf.read(name)
            except Exception as exc:  # keep audit diagnostic rather than abort
                zip_failures.append(f"zip read {name}: {exc}")
    zip_paths_match = len(names) == len(entries) and set(names) == set(entries)
    if zip_paths_match:
        for name, expected in entries.items():
            data = zip_members.get(name, b"")
            extracted = ROOT / "extracted" / name
            if len(data) != expected["bytes"] or sha(data) != expected["sha256"]:
                zip_failures.append(f"zip indexed mismatch: {name}")
            if not extracted.is_file():
                zip_failures.append(f"missing extracted file: {name}")
            else:
                exdata = extracted.read_bytes()
                if len(exdata) != expected["bytes"] or sha(exdata) != expected["sha256"]:
                    zip_failures.append(f"extracted indexed mismatch: {name}")
                if exdata != data:
                    zip_failures.append(f"zip/extracted bytes differ: {name}")
    check("zip_817_member_inventory_and_extraction", zip_paths_match and not zip_failures,
          {"zipMembers": len(names), "indexEntries": len(entries), "mismatches": zip_failures[:30]})

    tar_path = ROOT / "ci-artifacts.tar.xz"
    tar_pin = file_pin(tar_path)
    tar_failures: list[str] = []
    with tarfile.open(tar_path, "r:xz") as tf:
        members = [m for m in tf.getmembers() if m.isfile()]
        tar_names = [m.name for m in members]
        if len(tar_names) != len(entries) or set(tar_names) != set(entries):
            tar_failures.append("tar inventory differs from retained index")
        else:
            for member in members:
                data = tf.extractfile(member).read()
                expected = entries[member.name]
                if len(data) != expected["bytes"] or sha(data) != expected["sha256"]:
                    tar_failures.append(f"tar indexed mismatch: {member.name}")
    check("readable_retained_copy", tar_pin["bytes"] == retention["archiveBytes"]
          and tar_pin["sha256"] == retention["archiveSha256"]
          and retention["retainedMembers"] == 817 and retention["allRetainedMembersVerified"] is True
          and not tar_failures,
          {**tar_pin, "members": len(tar_names), "mismatches": tar_failures[:20]})

    retained_index_pin = file_pin(ROOT / "retained-index.json")
    retention_pin = file_pin(ROOT / "retention.json")
    check("retention_manifests", retained_index_pin["sha256"] == e["artifact"]["retainedIndexSha256"]
          and retention_pin["sha256"] == e["artifact"]["retentionManifestSha256"],
          {"index": retained_index_pin, "retention": retention_pin})

    workflow_log = ROOT / "logs/124401386239.log"
    workflow_data = workflow_log.read_bytes()
    workflow_text = workflow_data.decode("utf-8", "replace")
    workflow_pin = file_pin(workflow_log)
    check("workflow_transcript", workflow_pin["sha256"] == e["workflow_log"]["sha256"]
          and workflow_pin["bytes"] == e["workflow_log"]["bytes"]
          and "bash run-compiled-backends.sh" in workflow_text
          and "--backends-only" not in workflow_text
          and "156.0.8078.4" in workflow_text
          and "chromium-1248" in workflow_text,
          {**workflow_pin, "defaultFullCommand": "bash run-compiled-backends.sh" in workflow_text,
           "partialFlagSeen": "--backends-only" in workflow_text,
           "managedBrowserVersionSeen": "156.0.8078.4" in workflow_text})

    # Verify the retained source files against both recorded pin arrays and the
    # exact source tree object rather than trusting the author's match booleans.
    source_audit = outer["sourcePinAudit"]
    src_before = source_audit["before"]
    src_after = source_audit["after"]
    source_failures: list[str] = []
    if len(src_before) != 126 or len(src_after) != 126 or src_before != src_after:
        source_failures.append("pin arrays missing, count mismatch, or changed across run")
    for pin in src_before:
        try:
            blob = subprocess.check_output(["git", "show", f"{head}:{pin['path']}"], cwd=REPO)
            if sha(blob) != pin["sha256"]:
                source_failures.append(f"source object mismatch: {pin['path']}")
        except subprocess.CalledProcessError:
            source_failures.append(f"source path absent at head: {pin['path']}")
    check("126_source_pins", len(src_before) == len(src_after) == 126
          and src_before == src_after and source_audit["beforeMatchesCommit"] is True
          and source_audit["afterMatchesCommit"] is True and not source_failures,
          {"before": len(src_before), "after": len(src_after), "same": src_before == src_after,
           "commit": head, "mismatches": source_failures[:30]})

    check("outer_execution_metadata", outer["sha256"] == sha(full_exec_path.read_bytes())
          and outer["status"] == full_exec["status"] == "passed"
          and outer["mode"] == full_exec.get("mode") == "full"
          and outer["commandCount"] == len(outer["commands"]) == len(full_exec["commands"]) == 18
          and not outer["failures"] and not full_exec.get("failures")
          and all(c["exitCode"] == 0 and c.get("signal") is None and c.get("error") is None
                  for c in outer["commands"])
          and [c["name"] for c in outer["commands"]] == [c["name"] for c in full_exec["commands"]],
          {"commands": len(outer["commands"]), "mode": outer["mode"], "status": outer["status"],
           "names": [c["name"] for c in outer["commands"]]})

    def verify_streams(section, label):
        stream_failures = []
        streams = section["commandLogAudit"]["streams"]
        for s in streams:
            path = ROOT / "extracted" / s["path"]
            if not path.is_file():
                stream_failures.append(f"missing {s['path']}")
                continue
            actual = sha(path.read_bytes())
            if actual != s["expectedSha256"] or actual != s["actualSha256"] or not s["matches"]:
                stream_failures.append(f"hash mismatch {s['path']}")
        count_ok = section["commandLogAudit"]["streamCount"] == len(streams)
        count_expected = 36 if label == "outer" else 66
        return {"ok": len(streams) == count_expected and count_ok
                and section["commandLogAudit"]["matchedStreams"] == count_expected
                and not section["commandLogAudit"]["mismatches"] and not stream_failures,
                "count": len(streams), "matched": section["commandLogAudit"]["matchedStreams"],
                "failures": stream_failures[:30]}

    outer_streams = verify_streams(outer, "outer")
    check("outer_commands_and_36_streams", outer_streams["ok"], outer_streams)

    check("inherited_execution_metadata", inherited["embeddedHashMatches"] is True
          and inherited["sha256"] == inherited["embeddedSha256"] == sha(nested_exec_path.read_bytes())
          and inherited["status"] == nested_exec["status"] == "passed"
          and inherited["commandCount"] == len(inherited["commands"]) == len(nested_exec["commands"]) == 33
          and inherited["allExitZero"] is True and not inherited["failures"]
          and all(c["exitCode"] == 0 and c.get("signal") is None and c.get("error") is None
                  for c in inherited["commands"])
          and [c["name"] for c in inherited["commands"]] == [c["name"] for c in nested_exec["commands"]],
          {"commands": len(inherited["commands"]), "status": inherited["status"],
           "names": [c["name"] for c in inherited["commands"]]})
    nested_streams = verify_streams(inherited, "inherited")
    check("inherited_66_streams", nested_streams["ok"], nested_streams)
    check("total_102_streams", outer_streams["count"] + nested_streams["count"] == 102,
          {"outer": outer_streams["count"], "inherited": nested_streams["count"]})

    # Check both actual CLI requests/results/manifests and their complete pin
    # inventories. Backend output-root normalization is exact-prefix removal.
    backend_outputs = {}
    manifests = {}
    build_failures: list[str] = []
    for backend in ("react", "dom"):
        request = load(ROOT / f"extracted/compiled-backends/artifacts/{backend}-request.json")
        result = load(ROOT / f"extracted/compiled-backends/artifacts/{backend}-build-result.json")
        manifest_path = ROOT / f"extracted/compiled-backends/artifacts/compiled/{backend}/buildmanifest.json"
        manifest = load(manifest_path)
        manifests[backend] = manifest
        data = outer["backendOutputPins"][backend]
        root_prefix = outer["backendBuilds"][backend]["outputDir"].rstrip("/") + "/"
        before = data["before"]
        after = data["after"]
        b_norm = [(x["path"], x["sha256"]) for x in before]
        a_norm = []
        for x in after:
            if not x["path"].startswith(root_prefix):
                build_failures.append(f"{backend} after-root mismatch: {x['path']}")
                a_norm.append((x["path"], x["sha256"]))
            else:
                a_norm.append((x["path"][len(root_prefix):], x["sha256"]))
        if len(before) != 209 or len(after) != 209 or set(b_norm) != set(a_norm):
            build_failures.append(f"{backend} output pin inventory changed/count mismatch")
        for pin in before:
            archive_path = f"compiled-backends/artifacts/compiled/{backend}/{pin['path']}"
            expected = entries.get(archive_path)
            if expected is None or expected["sha256"] != pin["sha256"] or expected["bytes"] != pin["bytes"]:
                build_failures.append(f"{backend} output pin not in retained index: {pin['path']}")
        if request.get("backend") != backend or result.get("ok") is not True or len(result.get("apps", [])) != 4:
            build_failures.append(f"{backend} CLI request/result invalid")
        if manifest.get("schema") != "gobi.build-manifest/v1" or len(manifest.get("apps", [])) != 4:
            build_failures.append(f"{backend} manifest invalid")
        if any(app.get("backend") != backend for app in manifest.get("apps", [])):
            build_failures.append(f"{backend} manifest entries not tagged")
        if len(result.get("outputs", [])) != 209:
            build_failures.append(f"{backend} result inventory is not 209")
        backend_outputs[backend] = {
            "requestBackend": request.get("backend"),
            "resultOk": result.get("ok"),
            "appCount": len(result.get("apps", [])),
            "manifestBackendTags": sorted({x.get("backend") for x in manifest.get("apps", [])}),
            "manifestApps": [{"name": x.get("name"), "packagePath": x.get("packagePath"),
                              "module": x.get("module"), "encoder": x.get("encoder"),
                              "backend": x.get("backend")} for x in manifest.get("apps", [])],
            "outputPinsBefore": len(before), "outputPinsAfter": len(after),
            "resultOutputRecords": len(result.get("outputs", [])),
        }
    check("react_dom_cli_manifests_and_209_outputs", not build_failures,
          {"backends": backend_outputs, "mismatches": build_failures[:50]})

    # Four-app shared AppIR, encoder, component-role bytes; raw bundle hashes
    # remain independently pinned and no bundle equality is claimed.
    pair_failures: list[str] = []
    comparison = outer["backendBuildComparison"]
    app_module_hashes = {}
    for app in comparison:
        if app.get("backendTags") != ["react", "dom"]:
            pair_failures.append(f"{app.get('app')}: tags {app.get('backendTags')}")
        for field in ("appIR", "encoder", "components"):
            if app.get("files", {}).get(field, {}).get("identical") is not True:
                pair_failures.append(f"{app.get('app')}: {field} not identical")
        package_path = app["packagePath"]
        manifest_entries = {}
        for backend in ("react", "dom"):
            matching = [x for x in manifests[backend]["apps"] if x["packagePath"] == package_path]
            if len(matching) != 1:
                pair_failures.append(f"{app.get('app')}: {backend} manifest app not unique")
            else:
                manifest_entries[backend] = matching[0]
        if set(manifest_entries) == {"react", "dom"}:
            mr, md = manifest_entries["react"], manifest_entries["dom"]
            for field in ("appIR", "encoder", "components"):
                if mr.get(field) != md.get(field):
                    pair_failures.append(f"{app.get('app')}: {field} manifest path differs")
                rp = f"compiled-backends/artifacts/compiled/react/{mr[field]}"
                dp = f"compiled-backends/artifacts/compiled/dom/{md[field]}"
                if rp not in zip_members or dp not in zip_members or zip_members.get(rp) != zip_members.get(dp):
                    pair_failures.append(f"{app.get('app')}: emitted {field} bytes differ")
            if mr.get("module") != md.get("module") or mr.get("encoder") != md.get("encoder"):
                pair_failures.append(f"{app.get('app')}: module/encoder role path differs")
            rp = f"compiled-backends/artifacts/compiled/react/{mr['module']}"
            dp = f"compiled-backends/artifacts/compiled/dom/{md['module']}"
            rh, dh = sha(zip_members.get(rp, b"")), sha(zip_members.get(dp, b""))
            claimed = app.get("files", {}).get("module", {})
            if rh != claimed.get("rawReactSha256") or dh != claimed.get("rawDOMSha256"):
                pair_failures.append(f"{app.get('app')}: recorded raw GoScript bundle pin mismatch")
            app_module_hashes[app.get("app")] = {"react": rh, "dom": dh}
            if mr.get("backend") != "react" or md.get("backend") != "dom":
                pair_failures.append(f"{app.get('app')}: backend tags missing or wrong")
            if {k: v for k, v in mr.items() if k != "backend"} != {k: v for k, v in md.items() if k != "backend"}:
                pair_failures.append(f"{app.get('app')}: manifest entry differs beyond backend tag")

    # Across both 209-file inventories, the 204 non-bundle, non-manifest
    # companions must compare byte-for-byte. Keep raw bundle bytes/hashes intact.
    react_inventory = {x["path"]: x["sha256"] for x in outer["backendOutputPins"]["react"]["before"]}
    dom_inventory = {x["path"]: x["sha256"] for x in outer["backendOutputPins"]["dom"]["before"]}
    if set(react_inventory) != set(dom_inventory) or len(react_inventory) != 209:
        pair_failures.append("React/DOM output relative path inventories differ")
    else:
        for rel in react_inventory:
            if rel == "buildmanifest.json" or (rel.startswith("apps/") and rel.endswith("/gobi-compiled.mjs")):
                continue
            rp = f"compiled-backends/artifacts/compiled/react/{rel}"
            dp = f"compiled-backends/artifacts/compiled/dom/{rel}"
            if zip_members.get(rp) != zip_members.get(dp):
                pair_failures.append(f"non-bundle companion differs: {rel}")
    check("four_shared_module_profiles", len(comparison) == 4 and not pair_failures
          and len(outer["sharedRuntimeModuleUse"]) == 4
          and all(x.get("moduleLoads") == 1 and x.get("harnessAndDemoRendererSet") == ["react", "dom"]
                  for x in outer["sharedRuntimeModuleUse"]),
          {"apps": len(comparison), "runtimeUse": outer["sharedRuntimeModuleUse"],
           "rawGoScriptModuleSha256": app_module_hashes,
           "byteEqualNonBundleCompanionCount": 204,
           "fileComparisons": comparison, "mismatches": pair_failures})
    check("compiler_and_shared_artifact_claims", len(comparison) == 4
          and all(x.get("forwarderSourceCount") == 5 and x.get("emittedTypeScriptCount") == 186
                  and x.get("identicalSharedForwardersAndGoScriptTypeScript") is True for x in comparison)
          and outer["sharedReactMap"].get("identical") is True
          and outer["sharedReactMap"].get("sha256") == "9cb7fa3ff84042c36b9ac211dfe2b97a69169e4fb880283e8f000495a8216a54",
          {"sharedMap": outer["sharedReactMap"],
           "forwardersAndTypeScript": [{"app": a.get("app"), "forwarders": a.get("forwarderSourceCount"),
                                         "typeScript": a.get("emittedTypeScriptCount"),
                                         "sharedIdentical": a.get("identicalSharedForwardersAndGoScriptTypeScript")}
                                        for a in comparison]})

    conformance = outer["conformance"]
    conf_failures: list[str] = []
    for profile in conformance:
        if profile.get("status") != "matched" or profile.get("sourceStable") is not True:
            conf_failures.append(f"profile status/source changed: {profile.get('profile')}")
        for pin in profile.get("inputPins", []) + profile.get("capturePins", []):
            archive_item = entries.get(pin["path"])
            if archive_item is None or archive_item["sha256"] != pin["sha256"] or archive_item["bytes"] != pin["bytes"]:
                conf_failures.append(f"profile pin mismatch: {pin['path']}")
            if pin.get("matchesArchive") is False or pin.get("matchesArchiveAndStatus") is False:
                conf_failures.append(f"profile pin flagged mismatch: {pin['path']}")
    check("five_conformance_profiles", len(conformance) == 5
          and {x.get("profile") for x in conformance} == {"counter", "form", "list", "effect", "list-growth"}
          and all(x.get("checkStatus") == "matched" for x in conformance)
          and not conf_failures,
          {"profiles": [{"profile": x.get("profile"), "status": x.get("status"),
                         "checkStatus": x.get("checkStatus"), "inputPins": len(x.get("inputPins", [])),
                         "capturePins": len(x.get("capturePins", []))} for x in conformance],
           "mismatches": conf_failures[:30]})

    nested_source_pins = inherited["sourcePins"]
    nested_output_pins = inherited["outputPins"]
    check("inherited_209_output_pin_pair", nested_source_pins.get("beforeCount") == 122
          and nested_source_pins.get("afterCount") == 122
          and nested_source_pins.get("beforeAfterEqual") is True
          and nested_source_pins.get("allBeforePinsMatchHead") is True
          and nested_output_pins.get("beforeCount") == 209
          and nested_output_pins.get("afterCount") == 209
          and nested_output_pins.get("beforeAfterEqual") is True
          and nested_output_pins.get("allBeforeAndAfterFilesMatchRetainedArchive") is True
          and all(x.get("status") == "matched" for x in inherited["apps"]),
          {"sourcePins": nested_source_pins, "outputPins": nested_output_pins,
           "profiles": inherited["apps"]})

    demo = outer["demo"]
    smoke_path = ROOT / "extracted/compiled-backends/artifacts/demo-smoke.json"
    smoke = load(smoke_path)
    screenshot_path = ROOT / "extracted/compiled-backends/artifacts/demo.png"
    screenshot_pin = file_pin(screenshot_path)
    demo_failures = []
    if smoke != demo["smoke"]:
        demo_failures.append("embedded and archived smoke JSON differ")
    if smoke.get("status") != "passed" or len(smoke.get("checks", [])) != 5:
        demo_failures.append("HTTP smoke not five-check pass")
    if smoke.get("errors") or smoke.get("failures") or smoke.get("wasmRequests"):
        demo_failures.append("smoke errors/failures/WASM requests are non-empty")
    if outer["environment"].get("CHROMIUM_PATH") is not None or outer["environment"].get("CHROMIUM_EXECUTABLE_PATH") is not None:
        demo_failures.append("smoke environment specifies a browser executable override")
    if smoke.get("browser") != "156.0.8078.4":
        demo_failures.append("smoke browser version differs")
    if screenshot_pin["bytes"] != 151554 or screenshot_pin["sha256"] != "5422b89958275a81bed3fd203ae2840d047dd8bfcbe12dfe90e397c3a1ac93fe":
        demo_failures.append("screenshot hash/size differs")
    root_screenshot = ROOT / "demo.png"
    if root_screenshot.read_bytes() != screenshot_path.read_bytes():
        demo_failures.append("retained screenshot copy differs from extracted screenshot")
    build_before = demo["buildOutputPinsBeforeSmoke"]
    build_after = demo["buildOutputPinsAfterSmoke"]
    if build_before != build_after or len(build_before) != 4:
        demo_failures.append("demo four-output pins changed or have wrong count")
    for pin in build_before:
        archived = entries.get(pin["path"])
        if archived is None or archived["sha256"] != pin["sha256"]:
            demo_failures.append(f"demo output pin absent/mismatched: {pin['path']}")
    check("http_demo_smoke_managed_chromium_and_screenshot", not demo_failures,
          {"checks": smoke.get("checks"), "browser": smoke.get("browser"),
           "environmentCHROMIUM_PATH": outer["environment"].get("CHROMIUM_PATH"),
           "wasmRequests": smoke.get("wasmRequests"), "screenshot": screenshot_pin,
           "demoBuildPins": len(build_before), "mismatches": demo_failures})

    # Verify final/initial history and canonical packet paths without changing
    # consumed bytes. This interim packet is intentionally not an acceptance.
    old_report = load(ROOT / "coordination/history/E-CI-DEMO-interim-insufficient.json")
    old_report_md = ROOT / "coordination/history/E-CI-DEMO-interim-insufficient.md"
    scope = author["source_scope"]
    check("interim_history_and_canonical_paths", old_report["outcome"] == "insufficient_evidence"
          and old_report.get("status") == "pending_fresh_ci_artifacts"
          and old_report.get("sourceCommit") == "832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb"
          and author["outcome"] == "confirmed_reuse"
          and any("compiled-backends/ci/2026-10-31/coordination/reports/E-CI-DEMO.md" in x for x in scope)
          and any("compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-DEMO.json" in x for x in scope)
          and not any(x.startswith("compiled-backends/coordination/") for x in scope)
          and (ROOT / "coordination/reports/E-CI-DEMO.md").is_file()
          and (ROOT / "coordination/receipts/E-CI-DEMO.json").is_file(),
          {"interimOutcome": old_report.get("outcome"), "interimSource": old_report.get("sourceCommit"),
           "sourceScope": scope,
           "canonicalReport": "compiled-backends/ci/2026-10-31/coordination/reports/E-CI-DEMO.md",
           "canonicalReceipt": "compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-DEMO.json",
           "interimMarkdownSha256": sha(old_report_md.read_bytes())})

    result = {
        "schema": "gobi.xr-ci-demo-audit/v1",
        "reviewer": "N4",
        "inputReport": "compiled-backends/ci/2026-10-31/coordination/reports/E-CI-DEMO.md",
        "inputReportSha256": sha((ROOT / "coordination/reports/E-CI-DEMO.md").read_bytes()),
        "inputReceipt": "compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-DEMO.json",
        "inputReceiptSha256": sha((ROOT / "coordination/receipts/E-CI-DEMO.json").read_bytes()),
        "reviewedHead": head,
        "reviewedTree": tree,
        "primaryRun": {"id": run["id"], "event": run["event"], "status": run["status"],
                       "conclusion": run["conclusion"], "head": run["head_sha"]},
        "archive": {"zip": zip_pin, "retainedIndexSha256": retained_index_pin["sha256"],
                    "retainedTar": tar_pin, "zipMembers": len(names), "indexEntries": len(index)},
        "streamCounts": {"outerCommands": len(outer["commands"]), "outerStreams": outer_streams["count"],
                         "inheritedCommands": len(inherited["commands"]), "inheritedStreams": nested_streams["count"],
                         "combinedStreams": outer_streams["count"] + nested_streams["count"]},
        "sourcePinCount": len(src_before),
        "backendOutputs": backend_outputs,
        "conformanceProfiles": [x.get("profile") for x in conformance],
        "demo": {"status": smoke.get("status"), "checks": smoke.get("checks"),
                 "browser": smoke.get("browser"), "chromiumPath": outer["environment"].get("CHROMIUM_PATH"),
                 "screenshot": screenshot_pin},
        "checks": checks,
        "failures": failures,
        "decision": "accepted" if not failures else "amend",
        "reviewerExecution": "Read-only artifact, log, source-object, and output-pin audit; no CI/browser tests rerun.",
        "limits": [
            "The evidence proves the successful push run at 195c943; it does not establish the separately tracked PR run or PR readiness.",
            "Raw GoScript bundle hashes remain separately recorded; no cross-build bundle byte-identity claim is made.",
            "The packet retains final execution receipts rather than a separate pre-command status=running snapshot.",
            "The demo uses loopback HTTP and in-memory manual effects; it does not prove production transport behavior."
        ]
    }
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"audit": str(OUT), "decision": result["decision"],
                      "failedChecks": failures,
                      "checkSummary": {k: v["ok"] for k, v in checks.items()}}, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
