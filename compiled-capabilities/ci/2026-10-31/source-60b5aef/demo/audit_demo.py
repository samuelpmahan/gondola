#!/usr/bin/env python3
"""Read-only acceptance audit for one immutable full-run demo attempt.

The audit consumes existing receipts, Playwright smoke JSON, logs, outputs,
screenshots, and source pins. It never builds the demo or launches a browser.
Pass --evidence-root and --attempt-root to audit either the local full attempt
or N4's extracted primary CI artifact; --source-root points to the frozen
60b5aeff source checkout for either case.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import struct
import sys
from typing import Any


EXPECTED_COMMIT = "60b5aeff3172837ad7831c2b78b210454a3d81a2"
EXPECTED_TREE = "cc3a129b4372d00d5168135aa2e5687dfbf6788f"
EXPECTED_PARENT = "a2e1164d68abaaa7d028bdaf6a20bea842a131ae"
EXPECTED_PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
EXPECTED_CAPS = ["view.node", "numeric.safe-integer", "numeric.float64", "effect.request-reply", "effect.cancel"]
EXPECTED_CHECKS = [
    "HTTP served the compiled Go lifecycle app and mounted its actual Parent, Child, Grandchild, and Sibling view with the DOM renderer",
    "the page, stylesheet, and compiled browser bundle each returned HTTP 200",
    "the page exposes compiled Go requirements, the lifecycle host's explicit support, and the active DOM view profile",
    "enabled DOM clicks created one Go tick each in order; the disabled pending request ignored an injected click without a tick",
    "the compatible DOM→React 19.3.1 swap retained the mounted Go counter, view, tick history, and pending request",
    "the missing-view.node profile was rejected during admission before old renderer unmount; the original DOM node, count, trace, and pending request remained intact",
    "a compatible React→DOM recovery swap succeeded with the pending Go request still correlated",
    "the recovered DOM renderer delivered the pending reply into Go Update after the four ordered user/host events",
]
EXPECTED_PATHS = ["/", "/demo.css", "/demo.bundle.mjs"]


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: pathlib.Path) -> str:
    return sha_bytes(path.read_bytes())


def load_json(path: pathlib.Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AssertionError(f"expected JSON object: {path}")
    return value


def assert_pin(path: pathlib.Path, pin: dict[str, Any], label: str) -> dict[str, Any]:
    assert path.is_file(), f"{label} is missing: {path}"
    data = path.read_bytes()
    digest = sha_bytes(data)
    assert len(data) == pin.get("bytes"), f"{label} byte count differs"
    assert digest == pin.get("sha256"), f"{label} SHA-256 differs"
    return {"path": str(path), "bytes": len(data), "sha256": digest}


def field(value: dict[str, Any], name: str) -> dict[str, Any]:
    for item in value.get("fields", []):
        if item.get("name") == name:
            return item["value"]
    raise AssertionError(f"missing state field {name}")


def scalar(value: dict[str, Any]) -> Any:
    kind = value.get("kind")
    if kind == "bool":
        return value["bool"]
    if kind == "string":
        return value["string"]
    if kind == "float64":
        return struct.unpack(">d", bytes.fromhex(value["float64Bits"]))[0]
    if kind in ("uint", "int"):
        return int(value["integer"])
    return value


def last_json_line(path: pathlib.Path) -> dict[str, Any]:
    rows = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert rows, f"command stdout is empty: {path}"
    value = json.loads(rows[-1])
    assert isinstance(value, dict), f"command's final stdout row is not an object: {path}"
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-root", type=pathlib.Path, required=True,
                        help="root against which E-BUILD's relative output/log paths resolve")
    parser.add_argument("--attempt-root", type=pathlib.Path, required=True,
                        help="full attempt directory containing execution.json and demo outputs")
    parser.add_argument("--source-root", type=pathlib.Path, required=True,
                        help="frozen source checkout matching the expected commit and tree")
    parser.add_argument("--outer-receipt", type=pathlib.Path, required=True,
                        help="E-BUILD receipt copied alongside the attempt")
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--runner-exit-code", type=int, default=None,
                        help="root-observed local runner exit code; do not infer from the receipt")
    parser.add_argument("--catalog", type=pathlib.Path, default=None,
                        help="optional N4 catalog JSON; interpreted separately from local receipt status")
    parser.add_argument("--screenshot-inspected", action="store_true",
                        help="record that a human visually inspected the exact captured PNG")
    args = parser.parse_args()

    evidence_root = args.evidence_root.resolve(strict=True)
    source_root = args.source_root.resolve(strict=True)
    attempt = args.attempt_root.resolve(strict=True)
    receipt_path = args.outer_receipt.resolve(strict=True)
    execution_path = attempt / "execution.json"
    execution = load_json(execution_path)
    receipt = load_json(receipt_path)
    assert receipt_path.read_bytes() == execution_path.read_bytes(), "outer E-BUILD receipt differs from attempt execution.json"
    assert execution.get("schema") == "gobi.compiled-capabilities-execution/v1"
    assert execution.get("job_id") == "E-BUILD" and execution.get("mode") == "full"
    assert execution.get("status") == "passed", f"full E-BUILD status is {execution.get('status')!r}"
    assert execution.get("failures") == [], "full E-BUILD contains failures"
    assert execution.get("sourcePinsMatch") is True
    assert isinstance(execution.get("finishedAt"), str) and execution["finishedAt"]
    assert execution.get("archive", {}).get("roundTripVerified") is True

    binding = load_json(source_root / "compiled-capabilities/coordination/publication-binding-followup.json")
    local_binding = binding.get("local", {})
    assert local_binding.get("commit") == EXPECTED_COMMIT
    assert local_binding.get("tree") == EXPECTED_TREE
    assert local_binding.get("parents", [None])[0] == EXPECTED_PARENT
    if binding.get("remote"):
        assert binding["remote"].get("tree") == EXPECTED_TREE
        assert binding["remote"].get("commit") == EXPECTED_COMMIT
    publication_audit = load_json(source_root / "compiled-capabilities/ci/2026-10-31/source-60b5aef/provenance/publication-audit.json")
    assert publication_audit.get("status") == "passed" and publication_audit.get("finalAcceptance") is False
    assert publication_audit.get("source", {}).get("commit") == EXPECTED_COMMIT
    assert publication_audit.get("source", {}).get("tree") == EXPECTED_TREE

    source_before = {row["path"]: row for row in execution.get("sourceBefore", [])}
    source_after = {row["path"]: row for row in execution.get("sourceAfter", [])}
    assert len(source_before) > 0 and source_before == source_after, "source pins changed during the run"
    smoke_source_rel = "compiled-capabilities/demo/smoke.mjs"
    smoke_source_path = source_root / smoke_source_rel
    smoke_source_hash = sha_file(smoke_source_path)
    assert source_before.get(smoke_source_rel, {}).get("sha256") == smoke_source_hash, "Playwright smoke harness is not pinned to the current source"
    versions = execution.get("versions", {})
    dependencies = versions.get("dependencies", {})
    locked = versions.get("lockedDependencies", {})
    assert versions.get("node") == "v22.23.4"
    assert versions.get("rootGo", "").startswith("go version go1.24.")
    assert versions.get("compiledGo") == "go version go1.27.3 linux/amd64"
    assert isinstance(versions.get("chromium"), str) and versions["chromium"]
    assert dependencies.get("react") == locked.get("react") == "19.3.1"
    assert dependencies.get("reactDOM") == locked.get("reactDOM") == "19.3.1"
    assert dependencies.get("playwright") == locked.get("playwright") == "1.64.1"
    assert dependencies.get("esbuild") == locked.get("esbuild") == "0.28.2"
    assert dependencies.get("frontendEsbuild") == locked.get("frontendEsbuild") == "0.28.2"
    if "fast-check" in dependencies or "fastCheck" in dependencies:
        assert dependencies.get("fast-check", dependencies.get("fastCheck")) == "4.10.2"

    stages = {row.get("name"): row.get("status") for row in execution.get("stages", [])}
    assert stages.get("n5-http-demo") == "passed"
    assert stages.get("compiled-output-stability") == "passed"
    assert all(status == "passed" for status in stages.values()), f"not every recorded stage passed: {stages}"

    demo = attempt / "demo"
    smoke_path = demo / "demo-smoke.json"
    screenshot_path = demo / "demo.png"
    build_path = demo / "site/demo-build.json"
    bundle_path = demo / "site/demo.bundle.mjs"
    css_path = demo / "site/demo.css"
    html_path = demo / "site/index.html"
    smoke = load_json(smoke_path)
    build = load_json(build_path)
    assert smoke.get("schema") == "gobi.compiled-capabilities-demo-smoke/v1"
    assert smoke.get("status") == "passed" and smoke.get("failures") == []
    assert smoke.get("checks") == EXPECTED_CHECKS, "the exact eight browser assertions are not present"
    assert len(smoke["checks"]) == 8
    assert smoke.get("reactVersions") == {"react": "19.3.1", "reactDOM": "19.3.1"}
    assert isinstance(smoke.get("browserVersion"), str) and versions["chromium"].split()[-1] == smoke["browserVersion"]
    assert smoke.get("browserErrors") == [] and smoke.get("consoleErrors") == []
    assert smoke.get("failedRequests") == [] and smoke.get("wasmRequests") == []
    assert smoke.get("noWasm") == {"wasmRequests": [], "wasmAPIAttempts": []}

    requests = {row.get("path"): row for row in smoke.get("requests", [])}
    assert set(requests) == set(EXPECTED_PATHS)
    for path in EXPECTED_PATHS:
        assert requests[path].get("status") == 200 and requests[path].get("bytes", 0) > 0

    trace = smoke.get("finalTrace", {})
    ticks = trace.get("ticks", [])
    assert len(ticks) == 5, f"expected 5 ticks, got {len(ticks)}"
    messages = [tick.get("message", {}).get("name") if tick.get("message") else None for tick in ticks]
    dispatch_ids = [tick.get("dispatchId") for tick in ticks]
    assert messages == [None, "addParent", "requestParent", "addParent", "complete"]
    assert dispatch_ids == [None, "dispatch-0001", "dispatch-0002", "dispatch-0003", "dispatch-0004"]
    assert ticks[-1].get("message", {}).get("arg") == "parent:g1:r1"
    assert smoke.get("finalPending") == []
    final_state = smoke.get("finalSnapshot", {}).get("state", {})
    parent = field(final_state, "Parent")
    count = scalar(field(field(parent, "Counter"), "Count"))
    reply = scalar(field(parent, "Reply"))
    pending = scalar(field(parent, "Pending"))
    assert count == 2 and reply == "parent:g1:r1" and pending is False

    assert build.get("schema") == "gobi.compiled-capabilities-demo-build/v1"
    assert build.get("backend") == "react" and build.get("packagePath") == EXPECTED_PACKAGE
    assert build.get("requirements") == EXPECTED_CAPS
    assert build.get("sourcePins") == {
        f"compiled-capabilities/demo/{name}": sha_file(source_root / "compiled-capabilities/demo" / name)
        for name in ("app.mjs", "build.mjs", "demo.css", "index.html")
    }
    for rel, digest in build["sourcePins"].items():
        pin = source_before.get(rel)
        assert pin and pin.get("sha256") == digest, f"demo source pin differs from execution sourceBefore: {rel}"

    react_output = attempt / "react/output"
    input_pins = {}
    for key in ("appIR", "module", "encoder", "manifest"):
        item = build.get(key, {})
        path = react_output / item.get("path", "")
        input_pins[key] = assert_pin(path, item, f"React build input {key}")
    app_ir = load_json(react_output / build["appIR"]["path"])
    component = next((row for row in app_ir.get("components", []) if row.get("packagePath") == EXPECTED_PACKAGE), None)
    assert component and component.get("capabilities") == EXPECTED_CAPS
    assert component.get("id") == build.get("componentId")

    manifest = load_json(react_output / "buildmanifest.json")
    assert manifest.get("schema") == "gobi.build-manifest/v1" and len(manifest.get("apps", [])) == 1
    app = manifest["apps"][0]
    assert app.get("packagePath") == EXPECTED_PACKAGE and app.get("backend") == "react"
    assert app.get("appIR") == build["appIR"]["path"]
    assert app.get("module") == build["module"]["path"]
    assert app.get("encoder") == build["encoder"]["path"]

    commands = {row.get("name"): row for row in execution.get("commands", [])}
    command_evidence: dict[str, Any] = {}
    for name in ("n5-build-http-demo", "n5-http-demo-smoke"):
        row = commands.get(name)
        assert row and row.get("exitCode") == 0 and row.get("signal") is None and row.get("error") is None
        stdout_path = evidence_root / row["stdoutPath"]
        stderr_path = evidence_root / row["stderrPath"]
        assert sha_file(stdout_path) == row.get("stdoutSha256"), f"{name} stdout pin mismatch"
        assert sha_file(stderr_path) == row.get("stderrSha256"), f"{name} stderr pin mismatch"
        command_evidence[name] = {
            "stdout": {"path": row["stdoutPath"], "bytes": stdout_path.stat().st_size, "sha256": sha_file(stdout_path)},
            "stderr": {"path": row["stderrPath"], "bytes": stderr_path.stat().st_size, "sha256": sha_file(stderr_path)},
            "exitCode": row["exitCode"],
        }
    build_log = evidence_root / commands["n5-build-http-demo"]["stdoutPath"]
    build_stdout = last_json_line(build_log)
    bundle_hash = sha_file(bundle_path)
    assert build_stdout.get("bundle", {}).get("sha256") == bundle_hash
    assert build_stdout.get("bundle", {}).get("bytes") == bundle_path.stat().st_size
    smoke_log = evidence_root / commands["n5-http-demo-smoke"]["stdoutPath"]
    smoke_stdout = last_json_line(smoke_log)
    assert smoke_stdout.get("status") == "passed" and smoke_stdout.get("checks") == 8

    output_files = {
        "demo/demo-smoke.json": smoke_path,
        "demo/demo.png": screenshot_path,
        "demo/site/demo-build.json": build_path,
        "demo/site/demo.bundle.mjs": bundle_path,
        "demo/site/demo.css": css_path,
        "demo/site/index.html": html_path,
    }
    archive_meta = execution.get("archive", {})
    archive_members = {row["path"]: row for row in archive_meta.get("members", [])}
    archive_member_pins = {}
    for member, path in output_files.items():
        pin = archive_members.get(member)
        assert pin, f"archive is missing demo member {member}"
        archive_member_pins[member] = assert_pin(path, pin, f"archive member {member}")
    for pin in execution.get("demoOutputPinsBeforeSmoke", []) + execution.get("demoOutputPinsAfterSmoke", []):
        # Paths are repository-relative, so this works for both the local root
        # and N4's extracted artifact root.
        rel = pin.get("path", "")
        target = evidence_root / rel
        assert_pin(target, pin, f"smoke-stability output {rel}")

    assert screenshot_path.is_file() and screenshot_path.stat().st_size > 1000
    png = screenshot_path.read_bytes()
    assert png.startswith(b"\x89PNG\r\n\x1a\n"), "screenshot is not a PNG"
    width, height = struct.unpack(">II", png[16:24])
    assert width > 500 and height > 500

    archive_path = evidence_root / archive_meta["path"]
    manifest_meta = archive_meta["manifest"]
    manifest_path = evidence_root / manifest_meta["path"]
    archive_pin = {"path": archive_meta["path"], "bytes": archive_meta["bytes"], "sha256": archive_meta["sha256"]}
    manifest_pin = {"path": manifest_meta["path"], "bytes": manifest_meta["bytes"], "sha256": manifest_meta["sha256"]}
    archive_actual_bytes = archive_path.read_bytes()
    archive_digest = {"path": str(archive_path), "bytes": len(archive_actual_bytes), "sha256": sha_bytes(archive_actual_bytes)}
    archive_binding_matches = archive_digest["bytes"] == archive_pin["bytes"] and archive_digest["sha256"] == archive_pin["sha256"]
    manifest_digest = assert_pin(manifest_path, manifest_pin, "archive manifest")

    catalog = load_json(args.catalog.resolve(strict=True)) if args.catalog else None
    if catalog:
        assert catalog.get("sourceCommit", catalog.get("commit", EXPECTED_COMMIT)) in (EXPECTED_COMMIT, None)
        assert catalog.get("sourceTree", catalog.get("tree", EXPECTED_TREE)) in (EXPECTED_TREE, None)

    result = {
        "schema": "gobi.compiled-capabilities-demo-acceptance-audit/v1",
        "status": "passed",
        "scope": "demo evidence only; full completion is independently gated by E-BUILD and primary CI catalog",
        "source": {"commit": EXPECTED_COMMIT, "tree": EXPECTED_TREE, "parent": EXPECTED_PARENT},
        "attempt": str(attempt),
        "execution": {
            "status": execution["status"],
            "mode": execution["mode"],
            "startedAt": execution.get("startedAt"),
            "finishedAt": execution.get("finishedAt"),
            "runnerExitCode": args.runner_exit_code,
            "stageStatus": stages["n5-http-demo"],
            "versions": {key: versions.get(key) for key in ("node", "rootGo", "compiledGo", "chromium")},
            "react": dependencies["react"],
            "reactDOM": dependencies["reactDOM"],
            "failures": execution.get("failures"),
        },
        "smoke": {
            "path": str(smoke_path),
            "sha256": sha_file(smoke_path),
            "status": smoke["status"],
            "meaningfulCheckCount": len(smoke["checks"]),
            "checks": smoke["checks"],
            "httpAssets": [requests[path] for path in EXPECTED_PATHS],
            "reactVersions": smoke["reactVersions"],
            "eventMessages": messages,
            "dispatchIds": dispatch_ids,
            "replyToken": ticks[-1]["message"]["arg"],
            "finalState": {"parentCount": count, "pending": pending, "reply": reply, "pendingRequests": smoke["finalPending"]},
            "errors": {"page": smoke["browserErrors"], "console": smoke["consoleErrors"], "failedRequests": smoke["failedRequests"], "wasmRequests": smoke["wasmRequests"], "wasmAPIAttempts": smoke["noWasm"]["wasmAPIAttempts"]},
            "harnessSource": {"path": smoke_source_rel, "sha256": smoke_source_hash},
        },
        "build": {
            "path": str(build_path),
            "sha256": sha_file(build_path),
            "packagePath": build["packagePath"],
            "backend": build["backend"],
            "requirements": build["requirements"],
            "inputs": input_pins,
            "manifest": {"bytes": (react_output / "buildmanifest.json").stat().st_size, "sha256": sha_file(react_output / "buildmanifest.json")},
            "bundle": {"path": str(bundle_path), "bytes": bundle_path.stat().st_size, "sha256": bundle_hash},
            "bundleSource": build_stdout,
        },
        "screenshot": {"path": str(screenshot_path), "bytes": len(png), "sha256": sha_bytes(png), "width": width, "height": height, "visuallyInspected": args.screenshot_inspected},
        "archive": {"path": str(archive_path), "receiptBinding": archive_pin, "actual": archive_digest, "receiptBindingMatches": archive_binding_matches, "status": "matched" if archive_binding_matches else "receipt-binding-mismatch", "manifestPath": str(manifest_path), "manifestBytes": manifest_digest["bytes"], "manifestSha256": manifest_digest["sha256"], "demoMemberPins": archive_member_pins},
        "commands": command_evidence,
        "catalog": {"path": str(args.catalog.resolve()) if args.catalog else None, "sha256": sha_file(args.catalog.resolve()) if args.catalog else None, "metadata": catalog},
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status": "passed", "attempt": str(attempt), "checks": len(smoke["checks"]), "bundleSha256": bundle_hash, "screenshotSha256": sha_bytes(png), "out": str(args.out)}, indent=2, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - CLI must fail closed with concise diagnostics.
        print(json.dumps({"status": "failed", "error": f"{type(exc).__name__}: {exc}"}, sort_keys=True), file=sys.stderr)
        raise
