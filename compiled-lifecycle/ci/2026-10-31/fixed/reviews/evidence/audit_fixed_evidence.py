#!/usr/bin/env python3
"""Read-only, source-bound review of the final hosted CI evidence packet."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path("/workspace/scratch/39a56936f173/gondola-lifecycle-ci")
SOURCE = Path("/workspace/scratch/39a56936f173/gondola")
FIXED = ROOT / "compiled-lifecycle/ci/2026-10-31/fixed"
EVIDENCE = FIXED / "lanes/evidence"
EXTRACTED = FIXED / "extracted"
LANE = FIXED / "reviews/evidence"
ZIP = Path("/tmp/gobi-compiled-lifecycle-41181505234.zip")
EXPECTED = {
    "run": 41181505234,
    "artifact": 13035044166,
    "head": "00da54ad0f5a4006b13a5cded18ce291845978bc",
    "tree": "51b64a89b5f7e0edd4792becbed9adad6a27a698",
    "base": "6b49cc0bd4c9512a041f723c86b632ec506afd9d",
    "merge": "527cd2970435b913a7054f6ad796abfadf2bb56a",
    "snapshot_sha256": "d6a4fa32f68d50445fb1e388a81f211cde795e47ea548028dfaeaa59f3955d71",
    "log_index_sha256": "ffc463b2f0b1d7592627d838fbe7a6b7c81c87090b5e67915798368adac48d65",
    "zip_sha256": "0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26",
    "extra_sha256": "4888479ee2bcf9d514698b27677d027799b4cdbca02d9fbee8fda39d209120a2",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_record(path: Path, label: str | None = None) -> dict:
    raw = path.read_bytes()
    try:
        shown = str(path.relative_to(ROOT))
    except ValueError:
        shown = str(path)
    return {"path": label or shown, "bytes": len(raw), "sha256": digest(raw)}


def need(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def read_json(path: Path) -> tuple[dict, dict]:
    raw = path.read_bytes()
    return json.loads(raw.decode("utf-8")), {
        "path": str(path.relative_to(ROOT)),
        "bytes": len(raw),
        "sha256": digest(raw),
    }


def parse_failure(path: Path) -> dict:
    raw = path.read_bytes()
    try:
        json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        return {"valid_json": False, "bytes": len(raw), "sha256": digest(raw), "error": str(exc), "char_offset": exc.pos}
    raise AssertionError(f"expected preserved invalid JSON: {path}")


def tap_counts(path: Path, expected: int) -> dict:
    text = path.read_bytes().decode("utf-8")
    tests = re.search(r"(?m)^# tests (\d+)\s*$", text)
    passed = re.search(r"(?m)^# pass (\d+)\s*$", text)
    failed = re.search(r"(?m)^# fail (\d+)\s*$", text)
    need(tests and passed and failed, f"TAP summary absent: {path}")
    counts = {"tests": int(tests.group(1)), "passed": int(passed.group(1)), "failed": int(failed.group(1))}
    need(counts == {"tests": expected, "passed": expected, "failed": 0}, f"TAP counts differ: {path}")
    return {**file_record(path), **counts}


def main() -> None:
    report_path = ROOT / "compiled-lifecycle/ci/2026-10-31/coordination/reports/E-FIXED-EVIDENCE.md"
    receipt_path = ROOT / "compiled-lifecycle/ci/2026-10-31/coordination/receipts/E-FIXED-EVIDENCE.json"
    report_raw = report_path.read_bytes()
    receipt, receipt_record = read_json(receipt_path)
    need(digest(report_raw) == "a3ed36d30edb7ee4366a8ce5bfbb8648ab83fabb3d19bde0c8bdb051696dc1bb", "E-FIXED-EVIDENCE report pin")
    need(digest(receipt_path.read_bytes()) == "28dad302407fc7362c7316d60be9dfa8c431377910f098f1ea410f1965e08b2e", "E-FIXED-EVIDENCE receipt pin")
    need(receipt["report_sha256"] == digest(report_raw) and receipt["job_id"] == "E-FIXED-EVIDENCE" and receipt["worker"] == "N6", "author receipt/report binding")

    snapshot_path = EVIDENCE / "snapshots/workflows-20261031T081509Z.json"
    snapshot, snapshot_record = read_json(snapshot_path)
    runs = snapshot["workflow_runs"]
    need(snapshot["total_count"] == 28 and len(runs) == 28, "final raw workflow snapshot count")
    need(digest(snapshot_path.read_bytes()) == EXPECTED["snapshot_sha256"], "final raw workflow snapshot SHA-256")
    event_counts = {event: sum(row["event"] == event for row in runs) for event in ("push", "pull_request")}
    need(event_counts == {"push": 14, "pull_request": 14}, "final push/PR distribution")
    need(all(row["status"] == "completed" and row["conclusion"] == "success" for row in runs), "all 28 terminal successful workflow records")
    need(all(row["head_sha"] == EXPECTED["head"] and row["head_branch"] == "codex/gobi-compiled-lifecycle-20261031" for row in runs), "workflow head identity")
    pr_rows = [row for row in runs if row["event"] == "pull_request"]
    need(all(len(row.get("pull_requests", [])) == 1 for row in pr_rows), "PR workflow metadata shape")
    need(all(row["pull_requests"][0]["number"] == 14 and row["pull_requests"][0]["head"]["sha"] == EXPECTED["head"] and row["pull_requests"][0]["base"]["sha"] == EXPECTED["base"] for row in pr_rows), "all PR workflow records corroborate PR14 head/base")
    primary_run = next(row for row in runs if row["id"] == EXPECTED["run"])
    primary_pr = next(row for row in runs if row["id"] == 41181508994)
    need(primary_run["event"] == "push" and primary_pr["event"] == "pull_request", "primary run event identities")

    summary_path = EVIDENCE / "snapshots/workflows-summary-20261031T081509Z.json"
    summary, summary_record = read_json(summary_path)
    need(summary["counts"] == {"total": 28, "push": 14, "pull_request": 14, "completed": 28, "in_progress": 0, "queued": 0, "success": 28, "failure": 0, "cancelled": 0} and summary["exceptions"] == [], "parsed final summary counts")
    need(summary["head_sha"] == EXPECTED["head"] and len(summary["runs"]) == 28, "parsed final summary identity")

    jobs_path = EVIDENCE / "jobs/pull-request-jobs-final-20261031T081509Z.json"
    pr_jobs, jobs_record = read_json(jobs_path)
    need(pr_jobs["source_head"] == EXPECTED["head"], "terminal PR job source head")
    need(set(pr_jobs["runs"]) == {str(row["id"]) for row in pr_rows}, "14 PR job snapshot/run mapping")
    job_by_run = {}
    for run_key, record in pr_jobs["runs"].items():
        need(len(record["jobs"]) == 1, f"expected one terminal PR job in run {run_key}")
        job = record["jobs"][0]
        need(job["run_id"] == int(run_key) and job["status"] == "completed" and job["conclusion"] == "success", f"terminal PR job fields for {run_key}")
        job_by_run[int(run_key)] = job["id"]
    need(digest(jobs_path.read_bytes()) == "cbddcf4de9c9778ffe244a908d14043975a09acc36ba62c46367299006517c1d", "final PR jobs snapshot hash")

    index_path = EVIDENCE / "logs/job-log-index-final.json"
    index, index_record = read_json(index_path)
    need(digest(index_path.read_bytes()) == EXPECTED["log_index_sha256"], "final byte-hash log index")
    need(index["pr_logs_count"] == 14 and index["primary_push_logs_count"] == 1 and len(index["logs"]) == 15, "indexed log counts")
    need(index["workflow_snapshot"]["sha256"] == EXPECTED["snapshot_sha256"] and index["source_head"] == EXPECTED["head"], "log index final source/snapshot binding")

    primary_jobs_path = EVIDENCE / "jobs/primary-current-20261031074641.json"
    primary_jobs, primary_jobs_record = read_json(primary_jobs_path)
    primary_row = next(row for row in primary_jobs["rows"] if row["run_id"] == EXPECTED["run"])
    primary_job = next(row for row in primary_row["jobs"]["jobs"] if row["run_id"] == EXPECTED["run"])
    need(primary_job["id"] == 124479683598, "primary push job ID from captured job inventory")
    need(primary_run["conclusion"] == "success", "terminal push status from final workflow snapshot")

    bom = b"\xef\xbb\xbf"
    log_records = []
    for entry in index["logs"]:
        path = ROOT / entry["path"]
        raw = path.read_bytes()
        need(len(raw) == entry["bytes"] and digest(raw) == entry["sha256"], f"indexed raw log byte/hash: {path.name}")
        need(raw.startswith(bom), f"raw UTF-8 BOM absent: {path.name}")
        text = raw.decode("utf-8", errors="strict")
        need(str(entry["run_id"]) in text, f"run ID missing from raw log: {path.name}")
        if entry["event"] == "pr":
            need(entry["run_id"] in job_by_run and entry["job_id"] == job_by_run[entry["run_id"]], f"PR run/job/log index binding: {path.name}")
            job_source = "final-pull-request-jobs-snapshot"
        else:
            need(entry["event"] == "push" and entry["run_id"] == EXPECTED["run"] and entry["job_id"] == primary_job["id"], f"primary push job/log binding: {path.name}")
            job_source = "primary-current-jobs-snapshot; terminal status from final workflow snapshot"
        log_records.append({**entry, "raw_utf8_bom": True, "strict_utf8": True, "job_id_source": job_source})
    need(sum(row["event"] == "pr" for row in log_records) == 14 and sum(row["event"] == "push" for row in log_records) == 1, "raw log event totals")

    source_commit_path = EVIDENCE / "lineage/source-commit.json"
    source_commit, source_commit_record = read_json(source_commit_path)
    merge_path = EVIDENCE / "lineage/synthetic-merge-commit.json"
    merge_commit, merge_record = read_json(merge_path)
    need(source_commit["sha"] == EXPECTED["head"] and source_commit["tree"]["sha"] == EXPECTED["tree"], "source commit/tree identity")
    need(source_commit["parents"][0]["sha"] == "49cc2b96c8817a47319d5b7bd484184a22fa984b", "source parent identity")
    need(merge_commit["sha"] == EXPECTED["merge"] and merge_commit["tree"]["sha"] == EXPECTED["tree"], "synthetic merge/tree identity")
    need([row["sha"] for row in merge_commit["parents"]] == [EXPECTED["base"], EXPECTED["head"]], "synthetic merge parent order")
    pr_snapshot_path = FIXED / "root-pr-14-current.json"
    pr_snapshot, pr_snapshot_record = read_json(pr_snapshot_path)
    need(pr_snapshot["number"] == 14 and pr_snapshot["head"]["sha"] == EXPECTED["head"] and pr_snapshot["base"]["sha"] == EXPECTED["base"] and pr_snapshot["merge_commit_sha"] == EXPECTED["merge"], "fresh strict PR snapshot identity")
    need(pr_snapshot["merged"] is False and pr_snapshot["merged_at"] is None, "PR was not merged")

    old_workflow_path = EVIDENCE / "snapshots/workflows-20261031074228T.json"
    old_workflow_error = parse_failure(old_workflow_path)
    need(old_workflow_error["bytes"] == 359954 and old_workflow_error["sha256"] == "3611879716d0d6dd04dceccddbf23482921739efb536933a61be20106fbd6ca0" and old_workflow_error["char_offset"] == 7000, "historical malformed workflow snapshot custody")
    malformed_pr_path = EVIDENCE / "lineage/pull-14.json"
    malformed_pr_error = parse_failure(malformed_pr_path)
    need(malformed_pr_error["bytes"] == 21260 and malformed_pr_error["sha256"] == "56f7b1838c9d632174bd6172557a462510eb5020b0a473268a3c545a36fad9fd" and malformed_pr_error["char_offset"] == 7000, "ancillary malformed PR snapshot custody")

    anomalies_path = FIXED / "extraction-anomalies.json"
    anomalies, anomalies_record = read_json(anomalies_path)
    extra = anomalies["extraFile"]
    extra_path = EXTRACTED / extra["extractionRelativePath"]
    extra_raw = extra_path.read_bytes()
    need(len(extra_raw) == 48496640 and digest(extra_raw) == EXPECTED["extra_sha256"] and digest(extra_raw) == extra["sha256"], "extraction-only temp file identity")
    need(extra["isProviderMember"] is False and extra["equalsExactSourcePrefix"] is True and extra["origin"].startswith("not established"), "root extraction anomaly catalog fields")

    zip_raw = ZIP.read_bytes()
    need(len(zip_raw) == 47072021 and digest(zip_raw) == EXPECTED["zip_sha256"], "primary provider ZIP identity")
    with zipfile.ZipFile(ZIP) as archive:
        names = set(archive.namelist())
        need(len(names) == 1270 and sum(row.file_size for row in archive.infolist()) == 413394195, "provider ZIP member totals")
        need(extra["extractionRelativePath"] not in names and extra["sourceMember"] in names, "extra file excluded from provider ZIP")
        with archive.open(extra["sourceMember"]) as stream:
            prefix = stream.read(len(extra_raw))
        need(prefix == extra_raw, "extra file exact authoritative browser trace prefix")

    attempt_path = "compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z"
    attempt_root = EXTRACTED / attempt_path
    execution, execution_record = read_json(attempt_root / "execution.json")
    need(execution["job_id"] == "E-BUILD" and execution["mode"] == "full" and execution["status"] == "passed" and execution["failures"] == [], "current E-BUILD full attempt status")
    need(len(execution["commands"]) == 18 and all(row["exitCode"] == 0 for row in execution["commands"]), "18 successful full-runner commands")
    need(len(execution["stages"]) == 13 and all(row["status"] == "passed" for row in execution["stages"]), "13 passing full-runner stages")
    source_before = {row["path"]: row for row in execution["sourceBefore"]}
    source_after = {row["path"]: row for row in execution["sourceAfter"]}
    need(len(source_before) == 123 and source_before == source_after and execution["sourcePinsMatch"] is True, "123 identical before/after source pins")
    need(execution["inheritedRun"]["status"] == "passed" and execution["inheritedRun"]["commandCount"] == 17, "inherited compiled-methods run")

    frontend_execution, frontend_execution_record = read_json(EXTRACTED / "compiled-frontend/artifacts/execution.json")
    need(frontend_execution["status"] == "passed" and len(frontend_execution["sourceBefore"]) == 131 and frontend_execution["sourceBefore"] == frontend_execution["sourceAfter"], "inherited compiled-frontend execution pins")
    compiled_backends_log = EXTRACTED / "compiled-backends/artifacts/logs/inherited-full-runner.stdout.log"
    compiled_backends_text = compiled_backends_log.read_bytes().decode("utf-8")
    for line in (
        "same over 5000 inputs", "receipt matches", "SHA256SUMS ok",
        "interaction parity matched 107 scripts over 4473 initial/action ticks (seed 20261030)",
        "backend replacement parity matched 103 scripts over 5249 initial/action ticks (seed 20261030)",
        "controlled-input parity matched 216 scripts over 10149 observations",
        "async-effects parity matched 76 scripts over 1552 initial/action observations",
        "HTTP effects parity matched 82 scripts over 1572 initial/action observations",
        "keyed collection parity matched 70 scripts over 1113 initial/action observations",
        "renderer contract parity matched 71 scripts over 1184 initial/action observations",
        "multi-root replay matched 63 scripts, 1896 actions, 1959 ticks, 11754 actor observations",
    ):
        need(line in compiled_backends_text, f"inherited hosted log line missing: {line}")
    for seed in ("20261030", "20261031"):
        need(seed in compiled_backends_text, f"inherited parity seed missing: {seed}")

    root_source_head = subprocess.check_output(["git", "-C", str(SOURCE), "rev-parse", "HEAD"], text=True).strip()
    root_source_tree = subprocess.check_output(["git", "-C", str(SOURCE), "rev-parse", "HEAD^{tree}"], text=True).strip()
    tracked_diff = subprocess.run(["git", "-C", str(SOURCE), "diff", "--quiet"], check=False).returncode
    staged_diff = subprocess.run(["git", "-C", str(SOURCE), "diff", "--cached", "--quiet"], check=False).returncode
    need(root_source_head == EXPECTED["head"] and root_source_tree == EXPECTED["tree"] and tracked_diff == 0 and staged_diff == 0, "source checkout identity and clean tracked content")
    m0_run = SOURCE / "run.sh"
    m0_sums = SOURCE / "SHA256SUMS"
    m0_expected = SOURCE / "EXPECTED.json"
    rules_path = SOURCE / "gobi/rules_test.go"
    m0_script = m0_run.read_text(encoding="utf-8")
    need("go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json" in m0_script, "source M0 invocation seed/case count")
    rules_text = rules_path.read_text(encoding="utf-8")
    rule_rows = len(re.findall(r"(?m)^\s*\{\"", rules_text))
    need(rule_rows == 59 and digest(rules_path.read_bytes()) == source_before["gobi/rules_test.go"]["sha256"], "source-pinned 59 compatibility rule rows")
    m0_log_text = compiled_backends_text
    need(str(rule_rows) not in "", "M0 row count recorded")

    test_paths = {
        "lifecycle_prebuild": (attempt_root / "logs/lifecycle-node-tests-before-build.stdout.log", 71),
        "lifecycle_runtime": (attempt_root / "logs/lifecycle-compiled-runtime-tests.stdout.log", 10),
        "inherited_frontend": (EXTRACTED / "compiled-frontend/artifacts/logs/node-tests.stdout.log", 99),
        "compiled_methods_owned": (attempt_root / "inherited/attempt-20261031T074041000Z/logs/method-owned-node-tests.stdout.log", 10),
    }
    tap_results = {name: tap_counts(path, count) for name, (path, count) in test_paths.items()}

    run_path = EXTRACTED / "compiled-lifecycle/conformance/evidence/attempt-00/lifecycle.run.json"
    check_path = EXTRACTED / "compiled-lifecycle/conformance/evidence/attempt-00/lifecycle.check.json"
    matrix_run, matrix_run_record = read_json(run_path)
    matrix_check, matrix_check_record = read_json(check_path)
    need(matrix_run["status"] == "matched" and matrix_check["status"] == "matched", "lifecycle run/check status")
    need(matrix_check["events"] == 26 and matrix_check["ticks"] == 26 and matrix_check["clicks"] == 16 and matrix_check["swaps"] == 17, "lifecycle matrix counts")
    need(matrix_check["requests"] == 7 and matrix_check["cancellations"] == 3 and matrix_check["mutationControlsDetected"] == 8, "lifecycle request/cancel/mutation counts")
    need(matrix_check["cancellationOrder"] == ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], "child-first cancellation order")
    need(matrix_check["nativeTraceCheckedAgainstLiteralOracle"] and matrix_check["directTraceCheckedAgainstLiteralOracle"] and matrix_check["browserTracesCheckedAgainstLiteralOracle"] and matrix_check["physicalDOMCheckedAgainstLiteralOracle"], "native/direct/browser literal oracle and physical DOM flags")
    matrix_zip_pins = []
    with zipfile.ZipFile(ZIP) as archive:
        for row in matrix_run["evidencePins"]:
            need(row["path"] in archive.namelist(), f"primary matrix trace present in ZIP: {row['path']}")
            sha = hashlib.sha256()
            size = 0
            with archive.open(row["path"]) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    size += len(chunk)
                    sha.update(chunk)
            need(size == row["bytes"] and sha.hexdigest() == row["sha256"], f"primary matrix raw trace pin: {row['path']}")
            matrix_zip_pins.append({"path": row["path"], "bytes": size, "sha256": sha.hexdigest()})

    demo_path = attempt_root / "demo/demo-smoke.json"
    demo, demo_record = read_json(demo_path)
    need(demo["status"] == "passed" and len(demo["checks"]) == 12 and demo["finalTicks"] == 24 and demo["rendererSwaps"] == 4, "managed HTTP demo totals")
    need(len(demo["requests"]) == 3 and all(row["status"] == 200 for row in demo["requests"]), "managed HTTP asset responses")
    need(demo["browserErrors"] == [] and demo["consoleErrors"] == [] and demo["failedRequests"] == [] and demo["wasmRequests"] == [], "managed HTTP error/WASM status")

    go_review_report = ROOT / "compiled-lifecycle/ci/2026-10-31/coordination/reports/E-FIXED-GO.md"
    go_review_receipt = ROOT / "compiled-lifecycle/ci/2026-10-31/coordination/receipts/E-FIXED-GO.json"
    go_audit_path = FIXED / "lanes/go/audit.json"
    go_audit, go_audit_record = read_json(go_audit_path)
    go_receipt, go_receipt_record = read_json(go_review_receipt)
    need(go_audit["provider"]["zip"]["sha256"] == EXPECTED["zip_sha256"] and go_audit["provider"]["extracted_member_hashes_verified"] == 1270 and go_audit["provider"]["zip_crc_test"] == "passed", "independent current-primary artifact audit binding")
    need(go_receipt["job_id"] == "E-FIXED-GO" and go_receipt["outcome"] == "confirmed_reuse" and go_receipt["report_sha256"] == digest(go_review_report.read_bytes()), "E-FIXED-GO review packet binding")

    audit = {
        "schema": "gobi.compiled-lifecycle-fixed-evidence-review-audit/v1",
        "job_id": "XR-FIXED-EVIDENCE",
        "decision": "accepted",
        "source_identity": {
            "repository": "samuelpmahan/gondola",
            "source_head": root_source_head,
            "source_tree": root_source_tree,
            "source_parent": source_commit["parents"][0]["sha"],
            "pr_base": EXPECTED["base"],
            "synthetic_merge": merge_commit["sha"],
            "synthetic_merge_tree": merge_commit["tree"]["sha"],
            "synthetic_merge_parents": [row["sha"] for row in merge_commit["parents"]],
            "fresh_pr_snapshot": pr_snapshot_record,
            "source_commit_capture": source_commit_record,
            "synthetic_merge_capture": merge_record,
        },
        "author_packet": {"report": file_record(report_path), "receipt": receipt_record},
        "terminal_workflows": {
            "snapshot": snapshot_record,
            "summary": summary_record,
            "counts": {"total": 28, "push": 14, "pull_request": 14, "completed_success": 28, "failure": 0, "cancelled": 0, "queued_or_active": 0},
            "all_heads_match": True,
            "all_pr_records_bind_pr14_head_base": True,
            "primary_push_run": {"run_id": primary_run["id"], "conclusion": primary_run["conclusion"], "job_id": primary_job["id"], "job_status_at_job_inventory": primary_job["status"]},
            "primary_lifecycle_pr": {"run_id": primary_pr["id"], "conclusion": primary_pr["conclusion"], "job_id": job_by_run[primary_pr["id"]]},
            "final_pr_jobs_snapshot": jobs_record,
        },
        "job_log_index": {
            "index": index_record,
            "logs_verified": log_records,
            "counts": {"pr_job_logs": 14, "primary_push_logs": 1, "strict_utf8": 15, "raw_bom_preserved_in_hashes": 15},
            "job_id_binding": "PR logs match the final PR jobs snapshot; primary push log job ID matches the captured primary-current jobs record, while terminal success comes from the final workflow snapshot. Job IDs are not asserted to occur inside log bytes.",
        },
        "current_primary_artifact": {
            "id": EXPECTED["artifact"],
            "workflow_run_id": EXPECTED["run"],
            "provider_conclusion": "success",
            "head_sha": EXPECTED["head"],
            "tree_sha": EXPECTED["tree"],
            "zip": {"path": str(ZIP), "bytes": len(zip_raw), "sha256": digest(zip_raw), "zip_members": 1270, "uncompressed_bytes": 413394195},
            "full_attempt": {"path": attempt_path, "execution": execution_record, "commands": 18, "all_command_exits_zero": True, "stages": 13, "all_stages_passed": True, "source_pins": 123, "source_pins_stable": True, "versions": execution["versions"]},
            "go_review": {"report": file_record(go_review_report), "receipt": go_receipt_record, "audit": go_audit_record},
            "typed_lifecycle_matrix": {"run": matrix_run_record, "check": matrix_check_record, "status": "matched", "events": 26, "ticks": 26, "clicks": 16, "swaps": 17, "requests": 7, "cancellations": 3, "child_first_order": matrix_check["cancellationOrder"], "mutation_controls_detected": 8, "literal_oracle_profiles": matrix_check["browserProfiles"], "raw_matrix_zip_pins": matrix_zip_pins},
            "managed_http_demo": {"record": demo_record, "status": "passed", "checks": 12, "ticks": 24, "swaps": 4, "http_200_assets": [row["path"] for row in demo["requests"]], "browser_errors": 0, "console_errors": 0, "failed_requests": 0, "wasm_requests": 0},
        },
        "test_suites_separately_reported": tap_results,
        "m0_and_inherited_gates": {
            "source_checkout_head": root_source_head,
            "m0_command": "go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json",
            "m0_files": [file_record(m0_run), file_record(m0_expected), file_record(m0_sums), file_record(rules_path)],
            "hosted_log": file_record(compiled_backends_log),
            "log_lines": ["same over 5000 inputs", "receipt matches", "SHA256SUMS ok"],
            "compatibility_rule_rows": rule_rows,
            "inherited_child": {"path": execution["inheritedRun"]["path"], "status": execution["inheritedRun"]["status"], "commands": execution["inheritedRun"]["commandCount"]},
            "inherited_compiled_frontend": {"execution": frontend_execution_record, "source_pins": len(frontend_execution["sourceBefore"]), "source_pins_stable": frontend_execution["sourceBefore"] == frontend_execution["sourceAfter"]},
            "inherited_parity_lines": [line for line in compiled_backends_text.splitlines() if "parity matched" in line or "replay matched" in line],
            "test_count_note": "The four Node suites above are distinct and may overlap; no sum is claimed. The 59 Go compatibility rows are table cases, not a test count.",
        },
        "exclusions_and_limits": {
            "malformed_early_workflow_snapshot": old_workflow_error,
            "extra_extraction_file": {"path": extra["extractionRelativePath"], "bytes": len(extra_raw), "sha256": digest(extra_raw), "provider_member": False, "exact_prefix_of": extra["sourceMember"], "prefix_verified_against_authoritative_zip": True, "origin": "not established"},
            "malformed_ancillary_pr_snapshot": {**malformed_pr_error, "treatment": "preserved and excluded from parsed proof; source/base/tree/merge are independently corroborated by valid commit captures, final workflow PR records, and fresh strict PR snapshot"},
            "unretained_raw_artifacts": "The primary ZIP does not contain every older workflow Go/WASM raw directory. Those workflows are covered by terminal API records and their indexed job logs where retained; the typed-composition PR artifact metadata is present but its 120,564,491-byte ZIP was not downloaded.",
            "claim_boundary": "Accepted for the 28 terminal workflows and exact current-primary artifact only. No PR merge or deployment is claimed. No CI suite, Go/WASM command, browser replay, or duplicate artifact download was run for this review.",
        },
    }
    out = LANE / "audit.json"
    out.write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status": "verified", "workflows": 28, "pr_logs": 14, "push_logs": 1, "source_pins": 123, "matrix_events": 26, "extra_prefix_verified": True, "audit": str(out.relative_to(ROOT)), "audit_sha256": digest(out.read_bytes())}, indent=2))


if __name__ == "__main__":
    main()
