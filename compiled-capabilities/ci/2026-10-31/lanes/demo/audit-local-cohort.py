#!/usr/bin/env python3
"""Read-only audit of the local 031c462 full-attempt demo evidence.

This is failed-cohort corroboration only. It intentionally never converts the
outer runner's failed status into a passed/full acceptance result.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import struct
import sys


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def get_field(value: dict, name: str) -> dict:
    for item in value.get("fields", []):
        if item.get("name") == name:
            return item["value"]
    raise AssertionError(f"missing state field {name}")


def scalar(value: dict):
    kind = value.get("kind")
    if kind == "bool":
        return value["bool"]
    if kind == "string":
        return value["string"]
    if kind == "float64":
        return struct.unpack(">d", bytes.fromhex(value["float64Bits"]))[0]
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=pathlib.Path, default=pathlib.Path.cwd())
    parser.add_argument("--attempt", default="compiled-capabilities/builds/attempts/attempt-20261031T095356051Z")
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--source-commit", default="031c462bcd72c0ae0bee2dc05a0972b3902ca40c")
    parser.add_argument("--source-tree", default="d22b75e18c7bea70a743cc79d53461b287c7d045")
    args = parser.parse_args()
    repo = args.repo.resolve()
    attempt = repo / args.attempt
    execution = json.loads((attempt / "execution.json").read_text())
    outer_receipt_path = repo / "compiled-capabilities/coordination/receipts/E-BUILD.json"
    outer_receipt = json.loads(outer_receipt_path.read_text())
    smoke_path = attempt / "demo/demo-smoke.json"
    build_path = attempt / "demo/site/demo-build.json"
    smoke = json.loads(smoke_path.read_text())
    build = json.loads(build_path.read_text())
    commands = {row.get("name"): row for row in execution.get("commands", [])}
    stages = {row.get("name"): row.get("status") for row in execution.get("stages", [])}

    expected_checks = [
        "HTTP served the compiled Go lifecycle app and mounted its actual Parent, Child, Grandchild, and Sibling view with the DOM renderer",
        "the page, stylesheet, and compiled browser bundle each returned HTTP 200",
        "the page exposes compiled Go requirements, the lifecycle host's explicit support, and the active DOM view profile",
        "enabled DOM clicks created one Go tick each in order; the disabled pending request ignored an injected click without a tick",
        "the compatible DOM→React 19.3.1 swap retained the mounted Go counter, view, tick history, and pending request",
        "the missing-view.node profile was rejected during admission before old renderer unmount; the original DOM node, count, trace, and pending request remained intact",
        "a compatible React→DOM recovery swap succeeded with the pending Go request still correlated",
        "the recovered DOM renderer delivered the pending reply into Go Update after the four ordered user/host events",
    ]
    assert smoke.get("schema") == "gobi.compiled-capabilities-demo-smoke/v1"
    assert smoke.get("status") == "passed" and not smoke.get("failures")
    assert smoke.get("checks") == expected_checks
    assert smoke.get("reactVersions") == {"react": "19.3.1", "reactDOM": "19.3.1"}
    assert not smoke.get("browserErrors") and not smoke.get("consoleErrors") and not smoke.get("failedRequests")
    assert not smoke.get("wasmRequests")
    assert smoke.get("noWasm") == {"wasmRequests": [], "wasmAPIAttempts": []}

    requests = {row.get("path"): row for row in smoke.get("requests", [])}
    for path in ("/", "/demo.css", "/demo.bundle.mjs"):
        assert requests[path]["status"] == 200 and requests[path]["bytes"] > 0
    assert len(smoke["checks"]) == 8

    trace = smoke["finalTrace"]
    ticks = trace["ticks"]
    messages = [tick.get("message", {}).get("name") if tick.get("message") else None for tick in ticks]
    dispatch_ids = [tick.get("dispatchId") for tick in ticks]
    assert messages == [None, "addParent", "requestParent", "addParent", "complete"]
    assert dispatch_ids == [None, "dispatch-0001", "dispatch-0002", "dispatch-0003", "dispatch-0004"]
    assert ticks[-1]["message"]["arg"] == "parent:g1:r1"
    assert smoke.get("finalPending") == []

    final_state = smoke["finalSnapshot"]["state"]
    parent = get_field(final_state, "Parent")
    counter = get_field(parent, "Counter")
    count = scalar(get_field(counter, "Count"))
    reply = scalar(get_field(parent, "Reply"))
    pending_flag = scalar(get_field(parent, "Pending"))
    assert count == 2 and reply == "parent:g1:r1" and pending_flag is False

    versions = execution["versions"]
    assert versions["dependencies"]["react"] == versions["lockedDependencies"]["react"] == "19.3.1"
    assert versions["dependencies"]["reactDOM"] == versions["lockedDependencies"]["reactDOM"] == "19.3.1"
    assert versions["node"] == "v22.23.4" and versions["chromium"] == "Chromium 153.0.8010.0"
    assert build["packagePath"] == "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
    for required in ("view.node", "effect.request-reply", "effect.cancel"):
        assert required in build["requirements"]
    assert build["backend"] == "react"

    build_root = attempt / "react/output"
    input_hashes = {}
    for key in ("appIR", "module", "encoder"):
        rel = build[key]["path"]
        path = build_root / rel
        assert path.is_file()
        actual = sha(path)
        assert actual == build[key]["sha256"]
        assert len(path.read_bytes()) == build[key]["bytes"]
        input_hashes[key] = {"path": str(path.relative_to(repo)), "bytes": path.stat().st_size, "sha256": actual}
    manifest = build_root / build["manifest"]["path"]
    assert sha(manifest) == build["manifest"]["sha256"]

    source_before = {item["path"]: item for item in execution.get("sourceBefore", [])}
    source_checks = {}
    for rel, expected in build["sourcePins"].items():
        current = sha(repo / rel)
        pin = source_before.get(rel)
        assert current == expected and pin and pin.get("sha256") == current
        source_checks[rel] = current
    smoke_source = "compiled-capabilities/demo/smoke.mjs"
    assert source_before[smoke_source]["sha256"] == sha(repo / smoke_source)

    bundle = attempt / "demo/site/demo.bundle.mjs"
    screenshot = attempt / "demo/demo.png"
    build_log = repo / commands["n5-build-http-demo"]["stdoutPath"]
    smoke_log = repo / commands["n5-http-demo-smoke"]["stdoutPath"]
    assert commands["n5-build-http-demo"]["exitCode"] == 0
    assert commands["n5-http-demo-smoke"]["exitCode"] == 0
    build_stdout = json.loads(build_log.read_text().strip().splitlines()[-1])
    assert build_stdout["bundle"]["bytes"] == bundle.stat().st_size
    assert build_stdout["bundle"]["sha256"] == sha(bundle)
    assert screenshot.is_file() and screenshot.stat().st_size > 0

    archive_info = outer_receipt["archive"]
    archive_members = {row["path"]: row for row in archive_info["members"]}
    archive_file_map = {
        "demo/demo-smoke.json": smoke_path,
        "demo/demo.png": screenshot,
        "demo/site/demo-build.json": build_path,
        "demo/site/demo.bundle.mjs": bundle,
        "demo/site/demo.css": attempt / "demo/site/demo.css",
        "demo/site/index.html": attempt / "demo/site/index.html",
    }
    archive_member_checks = {}
    for member, path in archive_file_map.items():
        row = archive_members[member]
        actual_hash = sha(path)
        assert row["bytes"] == path.stat().st_size and row["sha256"] == actual_hash
        archive_member_checks[member] = {
            "bytes": path.stat().st_size,
            "sha256": actual_hash,
            "matchesOuterArchiveManifest": True,
        }

    failure = next((row for row in execution.get("failures", []) if row.get("name") == "stage:inherited-static-and-interaction-lifecycle"), None)
    assert execution.get("status") == "failed" and stages.get("inherited-static-and-interaction-lifecycle") == "failed"
    assert outer_receipt.get("status") == "failed" and outer_receipt.get("sourcePinsMatch") is True
    assert outer_receipt.get("attempt") == args.attempt
    assert failure is not None
    for stage in ("react-goscript-build", "dom-goscript-build", "n4-independent-literal-oracle", "n3-compiled-conformance", "n5-http-demo", "compiled-output-stability"):
        assert stages.get(stage) == "passed"

    result = {
        "schema": "gobi.compiled-capabilities-local-demo-audit/v1",
        "cohort": "local-031c462-failed-full-attempt-corroboration",
        "sourceCommit": args.source_commit,
        "sourceTree": args.source_tree,
        "attempt": args.attempt,
        "outerExecutionStatus": execution["status"],
        "outerFailedStage": failure,
        "outerFullAcceptance": False,
        "currentRunDemoStageStatus": stages["n5-http-demo"],
        "demoSmokeStatus": smoke["status"],
        "checkCount": len(smoke["checks"]),
        "checks": smoke["checks"],
        "httpRequests": [requests[path] for path in ("/", "/demo.css", "/demo.bundle.mjs")],
        "reactVersions": smoke["reactVersions"],
        "browserVersion": smoke["browserVersion"],
        "errors": {"page": smoke["browserErrors"], "console": smoke["consoleErrors"], "failedRequests": smoke["failedRequests"], "wasm": smoke["wasmRequests"], "wasmApiAttempts": smoke["noWasm"]["wasmAPIAttempts"]},
        "orderedGoEvents": [{"message": tick.get("message"), "dispatchId": tick.get("dispatchId")} for tick in ticks[1:]],
        "finalState": {"parentCounter": count, "pending": pending_flag, "reply": reply, "pendingRequests": smoke["finalPending"]},
        "buildInputs": input_hashes,
        "manifest": {"path": str(manifest.relative_to(repo)), "bytes": manifest.stat().st_size, "sha256": sha(manifest)},
        "demoBundle": {"path": str(bundle.relative_to(repo)), "bytes": bundle.stat().st_size, "sha256": sha(bundle)},
        "screenshot": {"path": str(screenshot.relative_to(repo)), "bytes": screenshot.stat().st_size, "sha256": sha(screenshot), "visuallyInspected": True, "observation": "Shows DOM renderer active, Parent count 2, delivered parent:g1:r1 reply, declared requirements/host/view support, final trace. Visual observation only; no pixel equivalence claimed."},
        "sourcePins": source_checks,
        "smokeJson": {"path": str(smoke_path.relative_to(repo)), "bytes": smoke_path.stat().st_size, "sha256": sha(smoke_path)},
        "demoBuildJson": {"path": str(build_path.relative_to(repo)), "bytes": build_path.stat().st_size, "sha256": sha(build_path)},
        "buildLog": {"path": str(build_log.relative_to(repo)), "bytes": build_log.stat().st_size, "sha256": sha(build_log)},
        "smokeLog": {"path": str(smoke_log.relative_to(repo)), "bytes": smoke_log.stat().st_size, "sha256": sha(smoke_log)},
        "archive": {"path": archive_info["path"], "bytes": archive_info["bytes"], "sha256": archive_info["sha256"], "manifest": archive_info["manifest"], "memberChecks": archive_member_checks, "outerReceiptStatus": outer_receipt["status"], "sourcePinsMatch": outer_receipt["sourcePinsMatch"]},
        "limitations": ["This is only local current-run demo corroboration. The overall full execution failed at inherited-static-and-interaction-lifecycle; no full/source/publication acceptance is claimed.", "Hosted authoritative artifacts have not yet been cataloged by N4."],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"out": str(args.out), "outerExecutionStatus": result["outerExecutionStatus"], "demoSmokeStatus": result["demoSmokeStatus"], "checks": result["checkCount"], "bundleSha256": result["demoBundle"]["sha256"], "screenshotSha256": result["screenshot"]["sha256"]}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
