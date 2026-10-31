#!/usr/bin/env python3
"""Read-only audit of compiled-methods browser event and renderer-lifetime records.

This script audits already-produced records. It does not launch a browser, build
the app, mutate the input artifact, or treat local evidence as CI acceptance.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import struct
import sys
import tarfile
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any


SOURCE_COMMIT = "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
SOURCE_TREE = "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
EXPECTED_RUN_IDS = {"41169518187", "41169522175"}
FIXTURE = "compiled-value-method-composition-child-readonly-snapshot"
APP_ID = "github.com/samuelpmahan/gondola/fixtures/compiled/methods"

ACTION_SPEC = [
    ("1/1", "childAdd"),
    ("1/1", "childAdd"),
    ("4", "captureChild"),
    ("1/1", "childAdd"),
    ("5", "publishSaved"),
    ("1/2", "childReset"),
    ("1/2", None),
    ("1/1", "childAdd"),
    ("2", "toggleReadOnly"),
    ("1/1", None),
    ("1/2", None),
    ("0/1", "parentAdd"),
    ("4", "captureChild"),
    ("5", "publishSaved"),
    ("2", "toggleReadOnly"),
    ("1/1", "childAdd"),
    ("0/2", "parentReset"),
    ("0/2", None),
]

# Initial tick followed by the exact post-action state sequence in FIXTURE.md.
EXPECTED_STATES = [
    (0, 0, False, 0),
    (0, 1, False, 0),
    (0, 2, False, 0),
    (0, 2, False, 2),
    (0, 3, False, 2),
    (2, 3, False, 2),
    (2, 0, False, 2),
    (2, 0, False, 2),
    (2, 1, False, 2),
    (2, 1, True, 2),
    (2, 1, True, 2),
    (2, 1, True, 2),
    (3, 1, True, 2),
    (3, 1, True, 1),
    (1, 1, True, 1),
    (1, 1, False, 1),
    (1, 2, False, 1),
    (0, 2, False, 1),
    (0, 2, False, 1),
]


class Audit:
    def __init__(self) -> None:
        self.checks: list[dict[str, Any]] = []

    def check(self, name: str, ok: bool, detail: Any = None) -> None:
        row = {"name": name, "passed": bool(ok)}
        if detail is not None:
            row["detail"] = detail
        self.checks.append(row)

    @property
    def passed(self) -> bool:
        return all(row["passed"] for row in self.checks)


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_member_path(name: str) -> PurePosixPath:
    p = PurePosixPath(name)
    if p.is_absolute() or any(part in ("", ".", "..") for part in p.parts):
        raise ValueError(f"unsafe archive member path: {name}")
    return p


def materialize_input(source: Path, temp_root: Path) -> tuple[Path, dict[str, Any]]:
    """Return an audit root and acquisition details; archive extraction is safe/read-only."""
    if source.is_dir():
        return source.resolve(), {"kind": "directory", "path": str(source.resolve())}
    if not source.is_file():
        raise FileNotFoundError(source)

    archive_sha = sha256_file(source)
    dest = temp_root / "input"
    dest.mkdir(parents=True, exist_ok=True)
    if zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as zf:
            for info in zf.infolist():
                rel = safe_member_path(info.filename)
                mode = (info.external_attr >> 16) & 0o170000
                if mode == 0o120000:
                    raise ValueError(f"archive contains symlink: {info.filename}")
                target = dest.joinpath(*rel.parts)
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(info) as src, target.open("wb") as out:
                        while chunk := src.read(1024 * 1024):
                            out.write(chunk)
        kind = "zip"
    elif tarfile.is_tarfile(source):
        with tarfile.open(source, "r:*") as tf:
            for member in tf.getmembers():
                rel = safe_member_path(member.name)
                if not (member.isfile() or member.isdir()):
                    raise ValueError(f"archive contains link or special member: {member.name}")
                target = dest.joinpath(*rel.parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    inp = tf.extractfile(member)
                    if inp is None:
                        raise ValueError(f"cannot read archive member: {member.name}")
                    with inp, target.open("wb") as out:
                        while chunk := inp.read(1024 * 1024):
                            out.write(chunk)
        kind = "tar"
    else:
        raise ValueError("input must be an artifact directory, ZIP, or TAR archive")
    return dest, {"kind": kind, "path": str(source.resolve()), "sha256": archive_sha}


def find_attempt(root: Path) -> Path:
    if (root / "matrix" / "methods.browser.capture.json").is_file():
        return root
    captures = list(root.rglob("methods.browser.capture.json"))
    if len(captures) == 1:
        return captures[0].parent.parent
    if len(captures) > 1:
        # Prefer a unique primary attempt with execution.json marked passed.
        candidates = []
        for capture in captures:
            attempt = capture.parent.parent
            execution = attempt / "execution.json"
            if execution.is_file():
                try:
                    e = read_json(execution)
                    if e.get("status") == "passed" and e.get("mode") in ("methods-only", "full"):
                        candidates.append(attempt)
                except Exception:
                    pass
        if len(candidates) == 1:
            return candidates[0]
        raise ValueError(f"expected a unique browser capture, found {len(captures)}")
    raise FileNotFoundError("methods.browser.capture.json not found")


def fields_by_name(value: dict[str, Any]) -> dict[str, Any]:
    return {f["name"]: f["value"] for f in value.get("fields", [])}


def wire_float(value: dict[str, Any]) -> float:
    if value.get("kind") != "float64":
        raise ValueError(f"expected float64 wire value, got {value.get('kind')}")
    bits = value.get("float64Bits")
    if not isinstance(bits, str) or len(bits) != 16:
        raise ValueError(f"invalid float64Bits: {bits!r}")
    number = struct.unpack(">d", bytes.fromhex(bits))[0]
    if not math.isfinite(number):
        raise ValueError("non-finite fixture state")
    return number


def decode_state(value: dict[str, Any]) -> tuple[Any, ...]:
    if value.get("kind") != "struct":
        raise ValueError(f"expected struct state, got {value.get('kind')}")
    top = fields_by_name(value)
    parent = fields_by_name(top["Parent"])
    child = fields_by_name(top["Child"])
    return (
        wire_float(parent["Count"]),
        wire_float(child["Count"]),
        top["ReadOnly"].get("bool"),
        wire_float(top["SavedChild"]),
    )


def normalized_state(value: Any) -> tuple[Any, ...]:
    if isinstance(value, dict):
        keys = ("parent", "child", "readOnly", "savedChild")
        if all(k in value for k in keys):
            return tuple(value[k] for k in keys)
    if isinstance(value, (tuple, list)) and len(value) == 4:
        return tuple(value)
    raise ValueError(f"unrecognized summary state: {value!r}")


def check_trace(audit: Audit, name: str, trace: dict[str, Any]) -> None:
    ticks = trace.get("ticks")
    audit.check(f"{name}.trace_schema", trace.get("schema") == "gobi.trace/v1")
    audit.check(f"{name}.trace_ticks", isinstance(ticks, list) and len(ticks) == 19,
                {"actual": len(ticks) if isinstance(ticks, list) else None, "expected": 19})
    if not isinstance(ticks, list) or len(ticks) != 19:
        return
    decoded = []
    for i, tick in enumerate(ticks):
        try:
            state = decode_state(tick["state"])
            decoded.append(state)
            audit.check(f"{name}.tick_{i}_index", tick.get("index") == i,
                        {"actual": tick.get("index"), "expected": i})
            audit.check(f"{name}.tick_{i}_state", state == EXPECTED_STATES[i],
                        {"actual": state, "expected": EXPECTED_STATES[i]})
        except Exception as exc:
            audit.check(f"{name}.tick_{i}_state", False, str(exc))
    for tick_index, tick in enumerate(ticks):
        _, message_name = (None, None) if tick_index == 0 else ACTION_SPEC[tick_index - 1]
        expected_id = None if message_name is None else f"dispatch-{sum(1 for _, m in ACTION_SPEC[:tick_index] if m is not None):04d}"
        msg = tick.get("message")
        if message_name is None:
            message_ok = msg is None
        else:
            message_ok = isinstance(msg, dict) and msg.get("name") == message_name and msg.get("arg") == ""
        audit.check(f"{name}.tick_{tick_index}_message", message_ok,
                    {"actual": msg, "expectedName": message_name})
        audit.check(f"{name}.tick_{tick_index}_dispatch_id", tick.get("dispatchId") == expected_id,
                    {"actual": tick.get("dispatchId"), "expected": expected_id})


def audit_profile(audit: Audit, name: str, profile: dict[str, Any]) -> dict[str, Any]:
    actions = profile.get("actions")
    trace = profile.get("trace")
    audit.check(f"{name}.backend", profile.get("backend") == name,
                {"actual": profile.get("backend"), "expected": name})
    audit.check(f"{name}.actions_count", isinstance(actions, list) and len(actions) == 18,
                {"actual": len(actions) if isinstance(actions, list) else None, "expected": 18})
    if isinstance(trace, dict):
        check_trace(audit, name, trace)
    else:
        audit.check(f"{name}.trace_present", False)
    if not isinstance(actions, list) or len(actions) != 18 or not isinstance(trace, dict):
        return {"intents": None, "dispatches": None, "suppressed": None}

    trace_ticks = trace.get("ticks", [])
    dispatches = 0
    suppressed = 0
    for i, (record, (path, message_name)) in enumerate(zip(actions, ACTION_SPEC)):
        action = record.get("action")
        expected_action = {"path": path, "event": "click", "value": ""}
        expected_message = None if message_name is None else {"name": message_name, "arg": ""}
        audit.check(f"{name}.action_{i}_intent", action == expected_action,
                    {"actual": action, "expected": expected_action})
        audit.check(f"{name}.action_{i}_expected_message", record.get("expectedMessage") == expected_message,
                    {"actual": record.get("expectedMessage"), "expected": expected_message})
        audit.check(f"{name}.action_{i}_tick_order",
                    record.get("beforeTickCount") == i + 1
                    and record.get("tickIndex") == i + 1
                    and record.get("afterTickCount") == i + 2,
                    {"before": record.get("beforeTickCount"), "tickIndex": record.get("tickIndex"),
                     "after": record.get("afterTickCount"), "expected": [i + 1, i + 1, i + 2]})
        target = record.get("target") or {}
        click = record.get("physicalClick") or {}
        observed = record.get("observed")
        tick = record.get("tick") or {}
        tick_wire = trace_ticks[i + 1] if len(trace_ticks) == 19 else {}
        if message_name is None:
            suppressed += 1
            suppressed_record = record.get("suppressedDispatch") or {}
            valid = (
                target.get("connected") is True
                and target.get("disabled") is True
                and click.get("method") == "HTMLElement.click"
                and click.get("attempted") is True
                and click.get("disabled") is True
                and click.get("traceTicksUnchanged") is True
                and observed is None
                and suppressed_record.get("accepted") is True
                and suppressed_record.get("dispatchId") is None
                and suppressed_record.get("error") is None
                and tick.get("message") is None
                and tick.get("dispatchId") is None
                and tick_wire.get("message") is None
                and tick_wire.get("dispatchId") is None
                and (name != "swap" or (record.get("beforeCallbacks") or {}).get("stale") == i
                     and (record.get("afterCallbacks") or {}).get("stale") == i)
                and normalized_state(tick.get("state")) == EXPECTED_STATES[i + 1]
                and decode_state(tick_wire["state"]) == EXPECTED_STATES[i + 1]
            )
            audit.check(f"{name}.action_{i}_disabled_suppression", valid,
                        {"targetDisabled": target.get("disabled"), "observed": observed,
                         "suppressedDispatch": suppressed_record, "tickMessage": tick.get("message"),
                         "dispatchId": tick.get("dispatchId")})
        else:
            dispatches += 1
            callbacks_before = record.get("beforeCallbacks") or {}
            callbacks_after = record.get("afterCallbacks") or {}
            observed_message = (observed or {}).get("message") or {}
            expected_id = f"dispatch-{dispatches:04d}"
            valid = (
                target.get("connected") is True
                and target.get("disabled") is False
                and click.get("method") == "HTMLElement.click"
                and click.get("attempted") is True
                and observed is not None
                and observed_message.get("Name") == message_name
                and observed_message.get("Arg") == ""
                and observed.get("action") == expected_action
                and (name == "swap" or observed.get("backend") == name)
                and record.get("suppressedDispatch") is None
                and tick.get("message") == expected_message
                and tick.get("dispatchId") == expected_id
                and tick_wire.get("message") == expected_message
                and tick_wire.get("dispatchId") == expected_id
                and callbacks_before.get("dispatch") == dispatches - 1
                and callbacks_after.get("dispatch") == dispatches
                and (name != "swap" or callbacks_before.get("stale") == i
                     and callbacks_after.get("stale") == i)
                and normalized_state(tick.get("state")) == EXPECTED_STATES[i + 1]
                and decode_state(tick_wire["state"]) == EXPECTED_STATES[i + 1]
            )
            audit.check(f"{name}.action_{i}_dispatch", valid,
                        {"observed": observed, "dispatchId": tick.get("dispatchId"),
                         "callbacksBefore": callbacks_before, "callbacksAfter": callbacks_after})

    counts = profile.get("callbackCounts") or {}
    audit.check(f"{name}.callback_totals", counts.get("dispatch") == 14
                and counts.get("stale") == (18 if name == "swap" else 0),
                {"actual": counts, "expected": {"dispatch": 14, "stale": 18 if name == "swap" else 0}})
    audit.check(f"{name}.intent_dispatch_suppression_totals",
                len(actions) == 18 and dispatches == 14 and suppressed == 4,
                {"intents": len(actions), "dispatches": dispatches, "suppressed": suppressed})
    audit.check(f"{name}.page_errors_empty", profile.get("pageErrors") == [], profile.get("pageErrors"))
    no_wasm = profile.get("noWasm") or {}
    audit.check(f"{name}.no_wasm", all(no_wasm.get(k) == [] for k in ("wasmRequests", "wasmAPIAttempts", "apiAttempts")),
                no_wasm)
    unmount = profile.get("unmount") or {}
    before = unmount.get("before") or {}
    physical = unmount.get("physicalDOM") or {}
    snapshot = unmount.get("rendererSnapshot") or {}
    audit.check(f"{name}.unmount_teardown",
                bool(before.get("html")) and before.get("controlCount") == 7
                and physical.get("html") == "" and physical.get("controls") == 0
                and snapshot.get("html") == "" and snapshot.get("controls") == [],
                {"before": before, "physicalDOM": physical, "rendererSnapshot": snapshot})
    return {"intents": len(actions), "dispatches": dispatches, "suppressed": suppressed}


def audit_swaps(audit: Audit, capture: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    schedule = capture.get("swapSchedule") or {}
    transitions = capture.get("swapTransitions")
    swaps = profile.get("swaps")
    retired = profile.get("retiredCallbacks")
    expected_transitions = [
        {"afterActionIndex": i, "to": "dom" if i % 2 == 0 else "react"}
        for i in range(18)
    ]
    audit.check("swap.schedule", schedule == {
        "schema": "gobi.methods-swap-schedule/v1",
        "initialBackend": "react",
        "backends": ["react", "dom"],
        "policy": "alternate-after-each-fixture-action",
    }, schedule)
    audit.check("swap.transitions", transitions == expected_transitions,
                {"actualCount": len(transitions) if isinstance(transitions, list) else None,
                 "expectedCount": 18})
    audit.check("swap.records_count", isinstance(swaps, list) and len(swaps) == 18,
                {"actual": len(swaps) if isinstance(swaps, list) else None, "expected": 18})
    audit.check("swap.retired_attempts_count", isinstance(retired, list) and len(retired) == 18,
                {"actual": len(retired) if isinstance(retired, list) else None, "expected": 18})
    if not isinstance(swaps, list) or not isinstance(retired, list) or len(swaps) != 18 or len(retired) != 18:
        return {"swaps": len(swaps) if isinstance(swaps, list) else None,
                "retiredAttempts": len(retired) if isinstance(retired, list) else None}

    for i, (swap, retired_item) in enumerate(zip(swaps, retired)):
        rec = swap.get("retiredCallback") or {}
        before = i + 2  # Initial tick plus the first i+1 completed action ticks.
        from_backend = "react" if i % 2 == 0 else "dom"
        to_backend = "dom" if i % 2 == 0 else "react"
        state = EXPECTED_STATES[i + 1]
        snapshots = swap.get("newSnapshot") or {}
        oracle_state = (snapshots.get("oracle") or {}).get("state")
        physical_state = (snapshots.get("physical") or {}).get("state")
        try:
            oracle_matches = normalized_state(oracle_state) == state
            physical_matches = normalized_state(physical_state) == state
            action_state_matches = normalized_state((profile.get("actions") or [])[i]["tick"]["state"]) == state
        except Exception:
            oracle_matches = physical_matches = action_state_matches = False
        action_ok = (
            swap.get("actionIndex") == i
            and swap.get("afterActionIndex") == i
            and swap.get("from") == from_backend
            and swap.get("to") == to_backend
            and swap.get("beforeTickCount") == before
            and swap.get("afterTickCount") == before
            and swap.get("stateUnchanged") is True
            and swap.get("viewUnchanged") is True
            and swap.get("oldRootHTMLBefore") not in (None, "")
            and swap.get("oldRootEmptyAfterUnmount") is True
            and swap.get("oldRootDetached") is True
            and swap.get("newRootDistinct") is True
            and oracle_matches and physical_matches and action_state_matches
            and rec == retired_item
        )
        audit.check(f"swap.{i}.commit_and_tick_fence", action_ok,
                    {"from": swap.get("from"), "to": swap.get("to"),
                     "ticks": [swap.get("beforeTickCount"), swap.get("afterTickCount")],
                     "stateUnchanged": swap.get("stateUnchanged"), "viewUnchanged": swap.get("viewUnchanged"),
                     "oldRootEmpty": swap.get("oldRootEmptyAfterUnmount"),
                     "oldRootDetached": swap.get("oldRootDetached"), "newRootDistinct": swap.get("newRootDistinct"),
                     "newOracleStateMatches": oracle_matches, "newPhysicalStateMatches": physical_matches,
                     "actionStateMatches": action_state_matches})
        fence = rec.get("runtimeFence") or {}
        observation = rec.get("rendererObservation") or {}
        fence_count_before = rec.get("runtimeFenceCountBefore")
        fence_count_after = rec.get("runtimeFenceCountAfter")
        callback_ok = (
            rec.get("id") == f"retired-{i + 1}"
            and rec.get("captured") is True
            and rec.get("originallyConnected") is True
            and rec.get("detachedAtInvocation") is True
            and rec.get("invoked") is True
            and rec.get("rendererStaleCallbackObserved") is True
            and observation.get("backend") == from_backend
            and isinstance(observation.get("renderEpoch"), int)
            and observation.get("renderEpoch", 0) > 0
            and fence.get("renderEpoch") == observation.get("renderEpoch")
            and fence.get("kind") == "stale"
            and fence.get("generation") == i + 1
            and fence_count_before == i
            and fence_count_after == i + 1
            and rec.get("traceTicksBefore") == before
            and rec.get("traceTicksAfter") == before
            and rec.get("traceTicksUnchanged") is True
        )
        audit.check(f"swap.{i}.retired_callback_fence", callback_ok,
                    {"id": rec.get("id"), "backend": observation.get("backend"),
                     "renderEpoch": observation.get("renderEpoch"), "runtimeFence": fence,
                     "runtimeFenceCounts": [fence_count_before, fence_count_after],
                     "traceTicks": [rec.get("traceTicksBefore"), rec.get("traceTicksAfter")]})

    audit.check("swap.renderer_sequence", profile.get("rendererSequence") == ["react", "dom"] * 9 + ["react"],
                {"actualLength": len(profile.get("rendererSequence", []))})
    return {"swaps": len(swaps), "retiredAttempts": len(retired)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path, help="attempt directory, artifact directory, ZIP, or TAR")
    parser.add_argument("--source-commit", help="source SHA established by workflow evidence")
    parser.add_argument("--workflow-run-id", help="current primary push/PR workflow run ID")
    parser.add_argument("--output", type=Path, help="write JSON audit receipt to this path")
    args = parser.parse_args()

    result: dict[str, Any] = {
        "schema": "gobi.ci-order-audit/v1",
        "job_id": "E-CI-ORDER",
        "worker": "N6",
        "expectedSourceCommit": SOURCE_COMMIT,
        "expectedSourceTree": SOURCE_TREE,
        "workflowRunIdsExpected": sorted(EXPECTED_RUN_IDS),
        "outcome": "insufficient_evidence",
        "checks": [],
    }
    audit = Audit()
    try:
        with tempfile.TemporaryDirectory(prefix="gobi-order-audit-") as temp:
            root, acquisition = materialize_input(args.artifact.resolve(), Path(temp))
            attempt = find_attempt(root)
            result["input"] = acquisition
            result["attemptPath"] = str(attempt)
            result["artifactFiles"] = {}
            for rel in ("execution.json", "matrix/methods.browser.capture.json", "matrix/methods.browser.json",
                        "matrix/methods.direct.json", "matrix/methods.native.json", "matrix/methods.run.json"):
                path = attempt / rel
                if path.is_file():
                    result["artifactFiles"][rel] = {"bytes": path.stat().st_size, "sha256": sha256_file(path)}

            execution_path = attempt / "execution.json"
            capture_path = attempt / "matrix" / "methods.browser.capture.json"
            browser_path = attempt / "matrix" / "methods.browser.json"
            execution = read_json(execution_path) if execution_path.is_file() else {}
            capture = read_json(capture_path) if capture_path.is_file() else {}
            if not capture and browser_path.is_file():
                capture = read_json(browser_path)
                result["captureSource"] = "matrix/methods.browser.json"
            else:
                result["captureSource"] = "matrix/methods.browser.capture.json"

            audit.check("execution.present", bool(execution))
            audit.check("execution.status_passed", execution.get("status") == "passed",
                        {"actual": execution.get("status"), "outcome": execution.get("outcome")})
            audit.check("execution.source_pins_match", execution.get("sourcePinsMatch") is True,
                        execution.get("sourcePinsMatch"))
            matrix = execution.get("methodMatrix") or {}
            audit.check("execution.matrix_matched", matrix.get("status") == "matched",
                        {"actual": matrix.get("status"), "checks": matrix.get("checks", {}).get("status")})
            counts = matrix.get("checks") or {}
            audit.check("execution.fixture_counts", counts.get("fixture") == FIXTURE
                        and counts.get("appId") == APP_ID and counts.get("ticks") == 19
                        and counts.get("actions") == 18 and counts.get("suppressedActions") == 4
                        and counts.get("swaps") == 18,
                        {k: counts.get(k) for k in ("fixture", "appId", "ticks", "actions", "suppressedActions", "swaps")})
            audit.check("capture.schema_and_fixture", capture.get("schema") == "gobi.methods-browser-conformance/v1"
                        and capture.get("fixture") == FIXTURE and capture.get("appId") == APP_ID
                        and capture.get("packagePath") == APP_ID,
                        {k: capture.get(k) for k in ("schema", "fixture", "appId", "packagePath")})

            profiles = capture.get("profiles") or {}
            audit.check("capture.profiles", set(profiles) == {"react", "dom", "swap"}, sorted(profiles))
            profile_counts = {}
            for name in ("react", "dom", "swap"):
                if name in profiles:
                    profile_counts[name] = audit_profile(audit, name, profiles[name])
                else:
                    audit.check(f"{name}.profile_present", False)
            if "swap" in profiles:
                audit_swaps(audit, capture, profiles["swap"])
            audit.check("capture.page_errors_empty", capture.get("pageErrors") == [], capture.get("pageErrors"))
            hashes = capture.get("traceSha256") or {}
            audit.check("capture.trace_hashes_equal", len(set(hashes.values())) == 1
                        and set(hashes) == {"react", "dom", "swap"}, hashes)

            for rel in ("matrix/methods.direct.json", "matrix/methods.native.json"):
                p = attempt / rel
                if p.is_file():
                    trace = read_json(p)
                    check_trace(audit, rel.replace("/", "."), trace)
            result["execution"] = {
                "job_id": execution.get("job_id"), "worker": execution.get("worker"),
                "mode": execution.get("mode"), "status": execution.get("status"),
                "outcome": execution.get("outcome"), "versions": execution.get("versions"),
                "methodMatrix": {k: counts.get(k) for k in ("ticks", "actions", "suppressedActions", "swaps")},
            }
            result["profileCounts"] = profile_counts
            source_ok = args.source_commit == SOURCE_COMMIT
            run_ok = args.workflow_run_id is not None and str(args.workflow_run_id) in EXPECTED_RUN_IDS
            result["provenance"] = {
                "sourceCommit": args.source_commit,
                "workflowRunId": str(args.workflow_run_id) if args.workflow_run_id else None,
                "sourceCommitMatchesCurrent": source_ok,
                "workflowRunMatchesCurrentPrimary": run_ok,
                "status": "verified_current_primary_ci" if source_ok and run_ok else "unverified",
            }
    except Exception as exc:
        result["fatalError"] = f"{type(exc).__name__}: {exc}"
        audit.check("audit_completed", False, result["fatalError"])

    result["checkCount"] = len(audit.checks)
    result["passedCheckCount"] = sum(1 for row in audit.checks if row["passed"])
    result["failedCheckCount"] = sum(1 for row in audit.checks if not row["passed"])
    result["failedChecks"] = [row for row in audit.checks if not row["passed"]]
    result["auditStatus"] = "passed" if audit.passed else "failed"
    has_ci_identity = (
        args.source_commit == SOURCE_COMMIT
        and args.workflow_run_id is not None
        and str(args.workflow_run_id) in EXPECTED_RUN_IDS
    )
    if audit.passed and has_ci_identity:
        result["outcome"] = "confirmed_reuse"
    else:
        result["outcome"] = "insufficient_evidence"
    result["summary"] = {
        "clickIntents": 18 if audit.passed else None,
        "enabledDispatchCallbacks": 14 if audit.passed else None,
        "disabledSuppressedIntents": 4 if audit.passed else None,
        "rendererSwaps": 18 if audit.passed else None,
        "retiredCallbackAttempts": 18 if audit.passed else None,
        "pageErrors": 0 if audit.passed else None,
        "wasmAttemptsOrRequests": 0 if audit.passed else None,
        "focusClaim": False,
        "effectCompletionClaim": False,
    }
    output = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    print(json.dumps({k: result[k] for k in (
        "schema", "job_id", "worker", "auditStatus", "outcome", "checkCount",
        "passedCheckCount", "failedCheckCount", "profileCounts", "summary", "provenance", "failedChecks"
    )}, indent=2, sort_keys=True))
    return 0 if audit.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
