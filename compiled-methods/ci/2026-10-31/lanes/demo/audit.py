#!/usr/bin/env python3
"""Audit the methods demo evidence without running the browser or changing source."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import subprocess
import tarfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

EXPECTED_COMMIT = "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
EXPECTED_TREE = "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
EXPECTED_STATE = {"parent": 0, "child": 2, "readOnly": False, "savedChild": 1}
REQUIRED_SMOKE_ASSETS = {
    "/": ("http-demo/site/index.html", "text/html"),
    "/demo.css": ("http-demo/site/demo.css", "text/css"),
    "/demo.bundle.mjs": ("http-demo/site/demo.bundle.mjs", "text/javascript"),
}


class ArtifactStore:
    def __init__(self, directory: Path | None = None, archive: Path | None = None):
        self.directory = directory.resolve() if directory else None
        self.archive = archive.resolve() if archive else None
        self.tar: tarfile.TarFile | None = None
        self.names: set[str] = set()
        if self.archive:
            self.tar = tarfile.open(self.archive, "r:gz")
            self.names = {member.name for member in self.tar.getmembers() if member.isfile()}

    def read(self, relative_path: str) -> bytes:
        safe = PurePosixPath(relative_path)
        if safe.is_absolute() or ".." in safe.parts:
            raise ValueError(f"artifact path escapes root: {relative_path}")
        normalized = safe.as_posix()
        if self.directory:
            path = self.directory.joinpath(*safe.parts)
            if not path.is_file():
                raise FileNotFoundError(str(path))
            return path.read_bytes()
        if self.tar is None or normalized not in self.names:
            raise FileNotFoundError(normalized)
        stream = self.tar.extractfile(normalized)
        if stream is None:
            raise FileNotFoundError(normalized)
        return stream.read()

    def has(self, relative_path: str) -> bool:
        try:
            self.read(relative_path)
            return True
        except (FileNotFoundError, ValueError):
            return False

    def close(self) -> None:
        if self.tar:
            self.tar.close()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_bytes(data: bytes, label: str) -> Any:
    try:
        return json.loads(data)
    except Exception as error:
        raise ValueError(f"{label} is not valid JSON: {error}") from error


def pin_rows(store: ArtifactStore, rows: Any, label: str, checks: list[str], failures: list[str]) -> None:
    if not isinstance(rows, list):
        failures.append(f"{label}: pin list missing or malformed")
        return
    for row in rows:
        path = row.get("path", "")
        try:
            data = store.read(path)
        except Exception as error:
            failures.append(f"{label}: cannot read {path}: {error}")
            continue
        if ("bytes" in row and len(data) != row.get("bytes")) or sha(data) != row.get("sha256"):
            failures.append(f"{label}: bytes or SHA-256 mismatch for {path}")
        else:
            checks.append(f"{label}: {path}")


def audit_local_archive(archive: Path, manifest_path: Path, checks: list[str], failures: list[str]) -> ArtifactStore:
    manifest = json.loads(manifest_path.read_text())
    archive_bytes = archive.read_bytes()
    if sha(archive_bytes) != manifest.get("sha256") or len(archive_bytes) != manifest.get("bytes"):
        failures.append("local evidence archive does not match its stored size/SHA-256")
    else:
        checks.append("local 189-member evidence archive matches its manifest size/SHA-256")
    store = ArtifactStore(archive=archive)
    rows = manifest.get("members", [])
    expected_names = {row.get("path") for row in rows}
    if store.names != expected_names or len(rows) != 189:
        failures.append(f"local archive member set differs from manifest (manifest={len(rows)}, archive={len(store.names)})")
    else:
        checks.append("local evidence archive contains exactly 189 unique manifested members")
    pin_rows(store, rows, "local archive member", checks, failures)
    return store


def verify_current_source(receipt: dict[str, Any], source_root: Path, checks: list[str], failures: list[str]) -> None:
    before = receipt.get("sourceBefore")
    after = receipt.get("sourceAfter")
    if not isinstance(before, list) or not isinstance(after, list) or before != after:
        failures.append("runner source pin arrays are absent or differ")
        return
    if receipt.get("sourcePinsMatch") is not True:
        failures.append("runner receipt does not mark sourcePinsMatch true")
    mismatches = []
    for row in before:
        path = source_root / row.get("path", "")
        try:
            data = path.read_bytes()
        except Exception:
            mismatches.append(row.get("path", "<missing path>"))
            continue
        if ("bytes" in row and len(data) != row.get("bytes")) or sha(data) != row.get("sha256"):
            mismatches.append(row.get("path", "<unknown>"))
    if mismatches:
        failures.append(f"current source mismatches {len(mismatches)} pins: {mismatches[:8]}")
    else:
        checks.append(f"all {len(before)} runner source pins match the current source checkout")


def verify_worktree(source_root: Path, checks: list[str], failures: list[str]) -> None:
    try:
        commit = subprocess.check_output(["git", "-C", str(source_root), "rev-parse", "HEAD"], text=True).strip()
        tree = subprocess.check_output(["git", "-C", str(source_root), "rev-parse", "HEAD^{tree}"], text=True).strip()
    except Exception as error:
        failures.append(f"cannot inspect source checkout identity: {error}")
        return
    if (commit, tree) != (EXPECTED_COMMIT, EXPECTED_TREE):
        failures.append(f"source checkout identity differs from assigned publication: commit {commit}, tree {tree}")
    else:
        checks.append(f"source checkout is assigned commit/tree {commit}/{tree}")


def audit_primary_artifact_retention(
    retention_path: Path,
    metadata_path: Path,
    extraction_root: Path,
    checks: list[str],
    failures: list[str],
) -> dict[str, Any]:
    retention = json.loads(retention_path.read_text())
    metadata = json.loads(metadata_path.read_text())
    if retention.get("source") != EXPECTED_COMMIT or retention.get("sourceTree") != EXPECTED_TREE:
        failures.append("primary artifact retention is not pinned to the assigned source commit/tree")
    workflow_run = metadata.get("workflow_run", {})
    if (
        metadata.get("id") != retention.get("artifactId")
        or metadata.get("size_in_bytes") != retention.get("providerZipBytes")
        or metadata.get("digest") != f"sha256:{retention.get('providerZipSha256')}"
        or workflow_run.get("id") != retention.get("run")
        or workflow_run.get("head_sha") != EXPECTED_COMMIT
        or retention.get("workflowOutcome") != "success"
    ):
        failures.append("retained provider metadata does not match the primary source/run/artifact record")
    else:
        checks.append("provider artifact metadata matches current source, primary run, artifact id, size, digest, and success outcome")

    root = retention_path.parent
    pieces: list[bytes] = []
    chunk_hash_mismatch = False
    for row in retention.get("chunks", []):
        try:
            data = (root / row["path"]).read_bytes()
        except Exception as error:
            failures.append(f"primary provider ZIP chunk unavailable: {row.get('path')}: {error}")
            chunk_hash_mismatch = True
            continue
        if len(data) != row.get("bytes") or sha(data) != row.get("sha256"):
            failures.append(f"primary provider ZIP chunk size/SHA mismatch: {row.get('path')}")
            chunk_hash_mismatch = True
        pieces.append(data)
    zip_bytes = b"".join(pieces)
    if len(zip_bytes) != retention.get("providerZipBytes") or sha(zip_bytes) != retention.get("providerZipSha256"):
        failures.append("reassembled primary provider ZIP does not match retained size/SHA-256")
    elif not chunk_hash_mismatch:
        checks.append("all retained provider ZIP chunks and reassembled ZIP size/SHA-256 match")

    manifest_rows = retention.get("members", [])
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
            zip_names = {info.filename for info in archive.infolist() if not info.is_dir()}
            expected_names = {row.get("path") for row in manifest_rows}
            if zip_names != expected_names or len(manifest_rows) != 968:
                failures.append(f"provider ZIP member names differ from retention manifest (zip={len(zip_names)}, manifest={len(manifest_rows)})")
            else:
                checks.append("provider ZIP contains exactly 968 unique manifested files")
    except Exception as error:
        failures.append(f"reassembled primary provider ZIP is not readable: {error}")
        zip_names = set()

    missing = []
    mismatched = []
    for row in manifest_rows:
        path = extraction_root / row.get("path", "")
        try:
            data = path.read_bytes()
        except Exception:
            missing.append(row.get("path", "<unknown>"))
            continue
        if len(data) != row.get("bytes") or sha(data) != row.get("sha256"):
            mismatched.append(row.get("path", "<unknown>"))
    if missing or mismatched:
        failures.append(f"provider extraction mismatch: {len(missing)} missing and {len(mismatched)} size/SHA mismatches")
    else:
        checks.append("all 968 extracted provider members match retained bytes and SHA-256 pins")
    return {
        "source": retention.get("source"),
        "sourceTree": retention.get("sourceTree"),
        "run": retention.get("run"),
        "job": retention.get("job"),
        "artifactId": retention.get("artifactId"),
        "workflowOutcome": retention.get("workflowOutcome"),
        "providerZipBytes": retention.get("providerZipBytes"),
        "providerZipSha256": retention.get("providerZipSha256"),
        "chunkCount": len(retention.get("chunks", [])),
        "memberCount": len(manifest_rows),
        "extractedMembersMatch": not missing and not mismatched and len(manifest_rows) == 968,
    }


def audit_primary_workflow_snapshot(
    snapshot_path: Path,
    checks: list[str],
    failures: list[str],
) -> dict[str, Any]:
    snapshot = json.loads(snapshot_path.read_text())
    if (
        snapshot.get("schema") != "gobi.github-job-snapshot/v1"
        or snapshot.get("sourceSha") != EXPECTED_COMMIT
        or snapshot.get("sourceTree") != EXPECTED_TREE
    ):
        failures.append("terminal workflow snapshot is not pinned to the assigned source commit/tree")
    primary_run = next((run for run in snapshot.get("runs", []) if run.get("run_id") == 41169518187), None)
    jobs = (primary_run or {}).get("structuredContent", {}).get("jobs", [])
    job = next((row for row in jobs if row.get("id") == 124444234335), None)
    steps = (job or {}).get("steps", [])
    step_by_name = {row.get("name"): row for row in steps}
    managed = step_by_name.get("Install Playwright managed Chromium")
    full_run = step_by_name.get("Run inherited gates and compiled method demo")
    preserve = step_by_name.get("Preserve method and inherited compiler evidence")
    if (
        not primary_run
        or not job
        or job.get("status") != "completed"
        or job.get("conclusion") != "success"
        or not managed
        or managed.get("status") != "completed"
        or managed.get("conclusion") != "success"
        or not full_run
        or full_run.get("status") != "completed"
        or full_run.get("conclusion") != "success"
        or not preserve
        or preserve.get("status") != "completed"
        or preserve.get("conclusion") != "success"
    ):
        failures.append("terminal snapshot does not show the primary managed-Chromium full run and artifact-preservation steps successful")
    else:
        checks.append("terminal workflow snapshot binds the primary job to successful managed Chromium, full run, and evidence-preservation steps")
    return {
        "path": str(snapshot_path),
        "sha256": sha(snapshot_path.read_bytes()),
        "capturedAt": snapshot.get("capturedAt"),
        "totalRuns": snapshot.get("totalRuns"),
        "source": snapshot.get("sourceSha"),
        "sourceTree": snapshot.get("sourceTree"),
        "run": primary_run.get("run_id") if primary_run else None,
        "job": job.get("id") if job else None,
        "jobStatus": job.get("status") if job else None,
        "jobConclusion": job.get("conclusion") if job else None,
        "managedChromiumStep": managed.get("conclusion") if managed else None,
        "fullRunStep": full_run.get("conclusion") if full_run else None,
        "preservationStep": preserve.get("conclusion") if preserve else None,
    }


def audit_demo_receipt(
    receipt: dict[str, Any],
    store: ArtifactStore,
    source_root: Path,
    require_full: bool,
    checks: list[str],
    failures: list[str],
) -> dict[str, Any]:
    if receipt.get("schema") != "gobi.compiled-methods-execution/v1":
        failures.append("unexpected runner receipt schema")
    if receipt.get("status") != "passed":
        failures.append(f"runner status is {receipt.get('status')!r}")
    report_pin = receipt.get("report", {})
    if report_pin.get("path"):
        try:
            try:
                report_bytes = store.read(report_pin["path"])
            except FileNotFoundError:
                if require_full:
                    raise
                report_bytes = (source_root / report_pin["path"]).read_bytes()
            if sha(report_bytes) != report_pin.get("sha256"):
                failures.append("runner report path SHA-256 does not match its receipt")
            else:
                checks.append("runner report hash matches its recorded path")
        except Exception as error:
            failures.append(f"runner report unavailable: {error}")
    else:
        failures.append("runner receipt has no report path/hash")
    if require_full:
        if receipt.get("mode") != "full":
            failures.append(f"managed CI receipt mode is {receipt.get('mode')!r}, expected full")
        inherited = receipt.get("inheritedRun") or {}
        if inherited.get("status") != "passed" or inherited.get("mode") != "full":
            failures.append("inherited compiled-backends receipt is missing or not a full pass")
        elif inherited.get("commandCount", 0) < 1:
            failures.append("inherited receipt has no recorded command count")
        else:
            try:
                inherited_bytes = store.read(inherited.get("path", ""))
                inherited_receipt = json_bytes(inherited_bytes, "inherited backend receipt")
                if sha(inherited_bytes) != inherited.get("sha256"):
                    failures.append("inherited full backend receipt SHA-256 differs from outer receipt")
                elif inherited_receipt.get("status") != "passed" or inherited_receipt.get("mode") != "full":
                    failures.append("archived inherited backend receipt is not a full pass")
                else:
                    nested_commands = inherited_receipt.get("commands", [])
                    nested_log_failures = []
                    for nested in nested_commands:
                        if nested.get("exitCode") != 0 or nested.get("signal") or nested.get("error"):
                            nested_log_failures.append(nested.get("name", "<unnamed>"))
                            continue
                        for stream_name, path_key, hash_key in [
                            ("stdout", "stdoutPath", "stdoutSha256"),
                            ("stderr", "stderrPath", "stderrSha256"),
                        ]:
                            nested_path = nested.get(path_key)
                            if not nested_path:
                                continue
                            try:
                                nested_data = store.read(nested_path)
                            except Exception as error:
                                failures.append(f"inherited command log unavailable: {nested_path}: {error}")
                                continue
                            if sha(nested_data) != nested.get(hash_key):
                                failures.append(f"inherited {nested.get('name')} {stream_name} log hash mismatch: {nested_path}")
                    if nested_log_failures:
                        failures.append(f"non-passing inherited commands: {nested_log_failures}")
                    elif len(nested_commands) != inherited.get("commandCount"):
                        failures.append("inherited command count differs from outer receipt")
                    else:
                        checks.append(f"inherited full backend receipt and all {len(nested_commands)} command exit/log hashes verified")
            except Exception as error:
                failures.append(f"inherited full backend receipt unavailable: {error}")
        if receipt.get("commands", [{}])[0].get("name") != "inherited-full-runner":
            failures.append("inherited full runner was not the first recorded method-runner step")
    elif receipt.get("mode") != "methods-only":
        failures.append(f"local preflight receipt mode is {receipt.get('mode')!r}, expected methods-only")
    else:
        checks.append("local evidence is explicitly methods-only")

    attempt = receipt.get("attempt")
    if not isinstance(attempt, str) or not attempt:
        failures.append("runner receipt has no attempt directory")
        return {}
    attempt_dir = PurePosixPath(attempt)
    if attempt_dir.is_absolute() or ".." in attempt_dir.parts:
        failures.append("runner receipt attempt directory is not a safe relative path")
        return {}
    attempt_path = attempt_dir.as_posix()

    commands = receipt.get("commands", [])
    if not isinstance(commands, list) or not commands:
        failures.append("runner receipt has no completed command records")
    else:
        command_failures = []
        for command in commands:
            if command.get("exitCode") != 0 or command.get("signal") or command.get("error"):
                command_failures.append(command.get("name", "<unnamed>"))
                continue
            for stream_name, path_key, hash_key in [
                ("stdout", "stdoutPath", "stdoutSha256"),
                ("stderr", "stderrPath", "stderrSha256"),
            ]:
                path = command.get(path_key)
                if not path:
                    continue
                try:
                    data = store.read(path)
                except Exception as error:
                    failures.append(f"command log unavailable: {path}: {error}")
                    continue
                if sha(data) != command.get(hash_key):
                    failures.append(f"{command.get('name')} {stream_name} log hash mismatch: {path}")
        if command_failures:
            failures.append(f"non-passing recorded commands: {command_failures}")
        elif not any("command log" in failure or "log hash" in failure for failure in failures):
            checks.append(f"all {len(commands)} recorded runner commands exited 0 and their available log hashes match")

    verify_current_source(receipt, source_root, checks, failures)

    output_before = receipt.get("outputPinsBefore", {})
    output_after = receipt.get("outputPinsAfter", {})
    for backend in ("react", "dom"):
        before = output_before.get(backend, [])
        after = output_after.get(backend, [])
        if not before or before != after:
            failures.append(f"{backend} output pin arrays are missing or changed")
        elif len(before) != 67:
            failures.append(f"{backend} output pin count is {len(before)}, expected 67")
        else:
            checks.append(f"{backend} compiler output has 67 exact stable before/after pins")
            pin_rows(store, after, f"{backend} output", checks, failures)

    matrix = receipt.get("methodMatrix", {})
    matrix_checks = matrix.get("checks", {})
    expected_matrix = {
        "status": "matched",
        "ticks": 19,
        "actions": 18,
        "suppressedActions": 4,
        "swaps": 18,
        "valueSemanticsChecks": 14,
    }
    for key, value in expected_matrix.items():
        observed = matrix_checks.get(key) if key != "status" else matrix.get("status")
        if observed != value:
            failures.append(f"method matrix {key} is {observed!r}, expected {value!r}")
    if matrix.get("status") == "matched" and all(matrix_checks.get(k) == v for k, v in expected_matrix.items() if k != "status"):
        checks.append("native/direct/React/DOM/swap method matrix matched 19 ticks and 18 swaps")

    demo = receipt.get("demoSmoke", {})
    expected_demo = {
        "status": "passed",
        "acceptedDispatches": 14,
        "rendererSwaps": 3,
        "finalBackend": "dom",
        "finalState": EXPECTED_STATE,
    }
    for key, value in expected_demo.items():
        if demo.get(key) != value:
            failures.append(f"demo smoke {key} differs: {demo.get(key)!r}")
    if demo.get("browserErrors") != [] or demo.get("wasmRequests") != []:
        failures.append("demo smoke records browser errors or WebAssembly requests")
    if demo.get("noWasm", {}).get("wasmRequests") != [] or demo.get("noWasm", {}).get("wasmAPIAttempts") != []:
        failures.append("demo no-WASM guard contains a request or API attempt")
    if not failures:
        checks.append("demo smoke passed with 14 Go dispatches, 3 renderer swaps, correct final Go state, and no WASM/errors")

    smoke_checks = demo.get("checks", [])
    preservation_claim = "React/DOM swaps retained the Go snapshot without allocating an application tick"
    if preservation_claim not in smoke_checks:
        failures.append("demo smoke did not report its exact snapshot/tick preservation check")
    source_script = source_root / "compiled-methods/demo/smoke.mjs"
    try:
        source_text = source_script.read_text()
        if "assert.deepEqual(await snapshot(), beforeSwap," not in source_text or "assert.equal(await tickCount(), beforeTicks," not in source_text:
            failures.append("current HTTP smoke source lacks exact snapshot and tick assertions")
        else:
            checks.append("pinned HTTP smoke source contains deep snapshot equality and no-tick swap assertions")
    except Exception as error:
        failures.append(f"cannot read current HTTP smoke source: {error}")

    smoke_file = store.read(f"{attempt_path}/http-demo/demo-smoke.json")
    smoke_json_meta = demo.get("smokeJson", {})
    if len(smoke_file) != smoke_json_meta.get("bytes") or sha(smoke_file) != smoke_json_meta.get("sha256"):
        failures.append("raw demo-smoke.json bytes/SHA-256 do not match runner receipt")
    else:
        checks.append("raw HTTP smoke record matches runner receipt bytes/SHA-256")
    smoke_json = json_bytes(smoke_file, "demo-smoke.json")
    if smoke_json.get("status") != "passed" or smoke_json.get("finalState") != EXPECTED_STATE:
        failures.append("raw HTTP smoke record is not a pass with the expected final state")

    screenshot_meta = demo.get("screenshot", {})
    try:
        screenshot = store.read(screenshot_meta.get("path", ""))
        if len(screenshot) != screenshot_meta.get("bytes") or sha(screenshot) != screenshot_meta.get("sha256"):
            failures.append("actual demo screenshot bytes/SHA-256 do not match runner receipt")
        elif not screenshot.startswith(b"\x89PNG\r\n\x1a\n"):
            failures.append("demo screenshot is not a PNG")
        else:
            checks.append("actual HTTP demo screenshot matches the receipt and is a PNG")
    except Exception as error:
        failures.append(f"actual HTTP demo screenshot unavailable: {error}")

    requests = {row.get("path"): row for row in demo.get("requests", [])}
    for request_path, (local_file, _asset_kind) in REQUIRED_SMOKE_ASSETS.items():
        request = requests.get(request_path)
        if not request or request.get("status") != 200:
            failures.append(f"HTTP smoke lacks status 200 for {request_path}")
            continue
        try:
            data = store.read(f"{attempt_path}/{local_file}")
            if len(data) != request.get("bytes"):
                failures.append(f"served asset byte count differs for {request_path}")
            else:
                checks.append(f"served HTTP asset {request_path} returned 200 and matches recorded byte count")
        except Exception as error:
            failures.append(f"served HTTP asset unavailable for {request_path}: {error}")

    demo_build = json_bytes(store.read(f"{attempt_path}/http-demo/site/demo-build.json"), "demo-build.json")
    react_build = receipt.get("methodBuilds", {}).get("react", {})
    for label, demo_key, build_key in [
        ("compiled module", "module", "rawModule"),
        ("AppIR", "appIR", "appIR"),
        ("encoder", "encoder", "encoder"),
    ]:
        observed = demo_build.get(demo_key, {}).get("sha256")
        expected = react_build.get(build_key, {}).get("sha256")
        if observed != expected:
            failures.append(f"HTTP demo {label} hash does not match the actual React GoScript build")
    if demo_build.get("backend") != "react" or demo_build.get("packagePath") != "github.com/samuelpmahan/gondola/fixtures/compiled/methods":
        failures.append("HTTP demo build record does not identify the expected React Go method package")
    elif all(demo_build.get(k, {}).get("sha256") == react_build.get(v, {}).get("sha256") for k, v in [("module", "rawModule"), ("appIR", "appIR"), ("encoder", "encoder")]):
        checks.append("HTTP demo records the same actual React-built GoScript module, AppIR, and encoder")
    source_mismatches = []
    for path, expected_hash in demo_build.get("sourceFiles", {}).items():
        try:
            if sha((source_root / path).read_bytes()) != expected_hash:
                source_mismatches.append(path)
        except Exception:
            source_mismatches.append(path)
    if source_mismatches:
        failures.append(f"HTTP build source file hashes differ from current checkout: {source_mismatches}")
    elif demo_build.get("sourceFiles"):
        checks.append("HTTP demo build source-file hashes match current demo source")

    demo_before = receipt.get("demoOutputPinsBeforeSmoke", [])
    demo_after = receipt.get("demoOutputPinsAfterSmoke", [])
    if not demo_before or demo_before != demo_after:
        failures.append("HTTP demo output pins are missing or changed across browser smoke")
    else:
        checks.append(f"HTTP demo assets remained stable across smoke ({len(demo_before)} output pins)")
        pin_rows(store, demo_after, "HTTP demo output", checks, failures)

    if require_full:
        environment = receipt.get("environment", {})
        smoke_command = next((c for c in commands if c.get("name") == "http-demo-smoke"), {})
        if environment.get("CHROMIUM_PATH") not in (None, "") or "--chromium" in smoke_command.get("args", []):
            failures.append("CI demo smoke appears to use an explicit Chromium executable instead of Playwright-managed Chromium")
        else:
            checks.append(f"CI demo smoke used Playwright-managed Chromium ({demo.get('browserVersion', 'version not recorded')})")
        workflow_path = source_root / ".github/workflows/compiled-methods.yml"
        workflow = workflow_path.read_text() if workflow_path.is_file() else ""
        if "playwright install --with-deps chromium" not in workflow or "run: bash run-compiled-methods.sh" not in workflow:
            failures.append("current workflow does not install managed Chromium and run the default full wrapper")
        else:
            checks.append("current workflow installs Playwright-managed Chromium and invokes the default full wrapper")

    if not require_full and receipt.get("localInheritedFullRun", {}).get("status") != "incomplete":
        failures.append("local history does not clearly separate the incomplete inherited full run")
    elif not require_full:
        checks.append("local full-run history remains explicitly incomplete; this is not CI evidence")

    local_coverage: dict[str, Any] = {}
    if not require_full:
        m0 = receipt.get("m0Gate", {})
        m0_receipt_path = source_root / m0.get("attempt", "") / "receipt.json"
        try:
            m0_receipt = json.loads(m0_receipt_path.read_text())
            m0_pins_equal = m0_receipt.get("sourceBefore") == m0_receipt.get("sourceAfter")
            run_command = next((c for c in m0_receipt.get("commands", []) if c.get("name") == "milestone-0"), {})
            stdout_row, stderr_row = run_command.get("stdout", {}), run_command.get("stderr", {})
            stdout_path = source_root / stdout_row.get("path", "")
            stderr_path = source_root / stderr_row.get("path", "")
            m0_log_hashes_match = (
                stdout_path.is_file() and stderr_path.is_file()
                and sha(stdout_path.read_bytes()) == stdout_row.get("sha256") == m0.get("stdoutSha256")
                and sha(stderr_path.read_bytes()) == stderr_row.get("sha256") == m0.get("stderrSha256")
            )
            if m0.get("status") != "passed" or m0_receipt.get("status") != "passed" or not m0_pins_equal or len(m0_receipt.get("sourceBefore", [])) != 27 or not m0_log_hashes_match:
                failures.append("standalone local M0 evidence is incomplete or does not match the canonical E-DEMO receipt")
            else:
                checks.append("standalone local M0 passed with 5,000 seeded cases, 27 stable pins, and matching logs")
            local_coverage["m0Gate"] = {"status": m0.get("status"), "sourcePinCount": len(m0_receipt.get("sourceBefore", [])), "pinsMatch": m0_pins_equal, "logHashesMatch": m0_log_hashes_match}
        except Exception as error:
            failures.append(f"standalone local M0 evidence unavailable: {error}")
        local_coverage["inheritedFullRun"] = receipt.get("localInheritedFullRun", {})

    return {
        "attempt": attempt_path,
        "mode": receipt.get("mode"),
        "runnerStatus": receipt.get("status"),
        "inheritedRun": receipt.get("inheritedRun"),
        "sourcePinCount": len(receipt.get("sourceBefore", [])),
        "matrix": {
            "status": matrix.get("status"),
            "ticks": matrix_checks.get("ticks"),
            "actions": matrix_checks.get("actions"),
            "swaps": matrix_checks.get("swaps"),
        },
        "demoSmoke": {
            "status": demo.get("status"),
            "browserVersion": demo.get("browserVersion"),
            "dispatches": demo.get("acceptedDispatches"),
            "swaps": demo.get("rendererSwaps"),
            "finalBackend": demo.get("finalBackend"),
            "finalState": demo.get("finalState"),
            "screenshot": screenshot_meta,
        },
        "localCoverage": local_coverage,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)
    local = sub.add_parser("local-preflight", help="audit only the already preserved local archive")
    local.add_argument("--archive", type=Path, required=True)
    local.add_argument("--manifest", type=Path, required=True)
    local.add_argument("--receipt", type=Path, required=True)
    local.add_argument("--source-root", type=Path, required=True)
    local.add_argument("--output", type=Path, required=True)
    ci = sub.add_parser("ci", help="audit an extracted managed-CI primary artifact")
    ci.add_argument("--artifact-root", type=Path, required=True)
    ci.add_argument("--receipt", type=Path, required=True)
    ci.add_argument("--source-root", type=Path, required=True)
    ci.add_argument("--retention", type=Path, required=True)
    ci.add_argument("--provider-metadata", type=Path, required=True)
    ci.add_argument("--workflow-snapshot", type=Path, required=True)
    ci.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    checks: list[str] = []
    failures: list[str] = []
    source_root = args.source_root.resolve()
    verify_worktree(source_root, checks, failures)
    if args.mode == "local-preflight":
        if args.receipt.resolve().parent == source_root:
            receipt_obj = json.loads(args.receipt.read_text())
        else:
            receipt_obj = json.loads(args.receipt.read_text())
        store = audit_local_archive(args.archive, args.manifest, checks, failures)
        result_mode = "local-preflight-only"
        require_full = False
        primary_artifact = None
        primary_workflow = None
    else:
        store = ArtifactStore(directory=args.artifact_root)
        receipt_obj = json.loads(args.receipt.read_text())
        result_mode = "managed-ci-primary-artifact-audit"
        require_full = True
        primary_artifact = audit_primary_artifact_retention(
            args.retention, args.provider_metadata, args.artifact_root,
            checks, failures,
        )
        primary_workflow = audit_primary_workflow_snapshot(args.workflow_snapshot, checks, failures)
    try:
        details = audit_demo_receipt(receipt_obj, store, source_root, require_full, checks, failures)
    except Exception as error:
        details = {}
        failures.append(f"audit stopped on malformed/incomplete evidence: {type(error).__name__}: {error}")
    finally:
        store.close()

    result = {
        "schema": "gobi.methods-demo-evidence-audit/v1",
        "classification": result_mode,
        "status": "passed" if not failures else "failed",
        "source": {
            "expectedCommit": EXPECTED_COMMIT,
            "expectedTree": EXPECTED_TREE,
            "runnerSourceSha256": sha((source_root / "compiled-methods/run.mjs").read_bytes()),
        },
        "receipt": {
            "path": str(args.receipt),
            "sha256": sha(args.receipt.read_bytes()),
        },
        "details": details,
        "primaryArtifact": primary_artifact,
        "primaryWorkflowSnapshot": primary_workflow,
        "checks": checks,
        "failures": failures,
        "claimLimit": "Local preflight is not managed-CI acceptance." if args.mode == "local-preflight" else "This audit binds method-demo evidence to the selected primary CI run and artifact; it does not claim that all PR workflows are green.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"status": result["status"], "mode": result_mode, "checks": len(checks), "failures": failures, "output": str(args.output)}, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
