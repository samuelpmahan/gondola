#!/usr/bin/env python3
"""Independent read-only review of E-CI-EVIDENCE's current-head claims."""
from __future__ import annotations

import hashlib
import json
import subprocess
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[6]
DATE = ROOT / "compiled-methods/ci/2026-10-31"
LANE = DATE / "lanes/evidence"
EXTRACTED = DATE / "extracted"
SOURCE = "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
TREE = "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
RUNNER_PREFIX = "/home/runner/work/gondola/gondola/"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition: bool, label: str, checks: list[str], failures: list[str]) -> None:
    (checks if condition else failures).append(label)


def mapped_path(path: str, base: Path, absolute_runner_path: bool = False) -> Path:
    if absolute_runner_path and path.startswith(RUNNER_PREFIX):
        path = path[len(RUNNER_PREFIX):]
    return base / path


def verify_pins(rows, base: Path, checks: list[str], failures: list[str], label: str,
                absolute_runner_path: bool = False) -> dict:
    mismatches = []
    for row in rows:
        path = mapped_path(row["path"], base, absolute_runner_path)
        try:
            data = path.read_bytes()
        except Exception as error:
            mismatches.append({"path": row["path"], "reason": f"missing: {error}"})
            continue
        if digest(data) != row["sha256"] or ("bytes" in row and len(data) != row["bytes"]):
            mismatches.append({"path": row["path"], "reason": "size/hash mismatch", "bytes": len(data), "sha256": digest(data)})
    require(not mismatches, f"{label}: {len(rows)} pins match", checks, failures)
    return {"count": len(rows), "matched": len(rows) - len(mismatches), "mismatches": mismatches}


def tap_tests(path: Path) -> int | None:
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# tests "):
            return int(line.split()[-1])
    return None


def main() -> int:
    checks: list[str] = []
    failures: list[str] = []
    coordination = DATE / "coordination"
    report_path = coordination / "reports/E-CI-EVIDENCE.md"
    receipt_path = coordination / "receipts/E-CI-EVIDENCE.json"
    receipt = read_json(receipt_path)
    report_bytes = report_path.read_bytes()
    require(digest(report_bytes) == receipt.get("report", {}).get("sha256"),
            "E-CI-EVIDENCE report bytes match receipt SHA-256", checks, failures)
    require(receipt.get("job_id") == "E-CI-EVIDENCE" and receipt.get("worker") == "N3"
            and bool(receipt.get("summary")), "receipt identity and summary are populated", checks, failures)

    publication = read_json(DATE / "publication-current.json")
    initial = read_json(DATE / "repair-head-initial-workflows.json")
    snapshot_path = LANE / "snapshots/jobs-2026-10-31T050732-682Z-6b49cc0-terminal.json"
    snapshot = read_json(snapshot_path)
    identity_path = LANE / "head-identity-6b49cc0.json"
    identity = read_json(identity_path)
    remote = read_json(DATE / "remote-prepublication.json")

    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True).strip()
    require(head == publication.get("sourceCommit") == snapshot.get("sourceSha") == SOURCE,
            f"worktree/publication/terminal snapshot source is {SOURCE}", checks, failures)
    require(tree == publication.get("sourceTree") == snapshot.get("sourceTree") == TREE,
            f"worktree/publication/terminal snapshot tree is {TREE}", checks, failures)

    pr = identity["pull_request"]
    workflow_pr = next(row for row in initial["workflow_runs"] if row["id"] == receipt["current_workflows"]["primary_pr_run"])
    payload_pr = workflow_pr["pull_requests"][0]
    expected_parents = [pr["base_sha"], pr["head_sha"]]
    merge_identity_consistent = (
        pr["number"] == 13
        and pr["state"] == "open"
        and pr["draft"] is True
        and pr["merged"] is False
        and pr["head_sha"] == SOURCE
        and pr["base_sha"] == remote["base"] == payload_pr["base"]["sha"]
        and pr["head_sha"] == payload_pr["head"]["sha"]
        and pr["merge_test_commit"] == remote["mergeTest"]
        and pr["merge_tree"] == TREE
        and pr["merge_parents"] == expected_parents
    )
    require(merge_identity_consistent,
            "PR state/head/base and merge-test tree/parents agree across publication identity and workflow payloads",
            checks, failures)
    merge_object_available = subprocess.run(
        ["git", "cat-file", "-e", f"{pr['merge_test_commit']}^{{commit}}"], cwd=ROOT,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    ).returncode == 0
    checks.append("merge-test commit object available locally" if merge_object_available else
                  "merge-test commit object absent locally; cross-check is limited to captured provider metadata")

    initial_rows = initial["workflow_runs"]
    terminal_rows = snapshot["runs"]
    initial_by_id = {row["id"]: row for row in initial_rows}
    terminal_by_id = {row["run_id"]: row for row in terminal_rows}
    run_identity_ok = set(initial_by_id) == set(terminal_by_id) and len(initial_by_id) == 26
    all_success = True
    all_source = True
    job_summary = []
    for run_id, old in initial_by_id.items():
        current = terminal_by_id.get(run_id)
        jobs = current.get("structuredContent", {}).get("jobs", []) if current else []
        all_source &= old.get("head_sha") == SOURCE
        if len(jobs) != 1:
            all_success = False
            job_summary.append({"run_id": run_id, "job_count": len(jobs), "status": "not-single-job"})
            continue
        job = jobs[0]
        success = job.get("status") == "completed" and job.get("conclusion") == "success"
        all_success &= success
        job_summary.append({"run_id": run_id, "job_id": job.get("id"), "event": old.get("event"),
                            "name": job.get("name"), "status": job.get("status"), "conclusion": job.get("conclusion"),
                            "head_sha": old.get("head_sha")})
    events = Counter(row.get("event") for row in initial_rows)
    require(snapshot.get("totalRuns") == 26 and len(terminal_rows) == 26 and run_identity_ok,
            "initial and terminal workflow sets contain the same 26 unique run IDs", checks, failures)
    require(all_source and events == Counter({"pull_request": 13, "push": 13}),
            "all 26 initial workflow heads equal current source; events split 13 PR/13 push", checks, failures)
    require(all_success, "all 26 terminal jobs are completed with success conclusions", checks, failures)

    log_manifest_path = LANE / "log-manifest-6b49cc0.json"
    log_manifest = read_json(log_manifest_path)
    log_rows = log_manifest.get("logs", [])
    decoded = []
    log_mismatches = []
    for row in log_rows:
        path = DATE / row["path"]
        try:
            data = path.read_bytes()
            data.decode("utf-8", errors="strict")
        except Exception as error:
            log_mismatches.append({"path": row.get("path"), "error": f"read/UTF-8 failure: {error}"})
            continue
        matching_run = next((candidate for candidate in snapshot["runs"] if candidate["run_id"] == row["run_id"]), None)
        job = matching_run["structuredContent"]["jobs"][0] if matching_run else {}
        valid = (
            len(data) == row.get("bytes")
            and digest(data) == row.get("sha256")
            and row.get("utf8_valid") is True
            and row.get("workflow_head_sha") == SOURCE
            and row.get("conclusion") == "success"
            and job.get("id") == row.get("job_id")
            and job.get("conclusion") == row.get("conclusion")
        )
        if not valid:
            log_mismatches.append({"path": row["path"], "reason": "manifest/hash/identity mismatch"})
        decoded.append({"run_id": row["run_id"], "job_id": row["job_id"], "event": row["event"],
                        "bytes": len(data), "sha256": digest(data), "strict_utf8": True, "matched": valid})
    log_events = Counter(row.get("event") for row in log_rows)
    require(len(log_rows) == 14 and log_events == Counter({"pull_request": 13, "push": 1})
            and log_rows and any(row.get("run_id") == 41169518187 and row.get("event") == "push" for row in log_rows)
            and any(row.get("run_id") == 41169522175 and row.get("event") == "pull_request" for row in log_rows),
            "manifest contains 13 PR logs plus the primary push and PR logs", checks, failures)
    require(not log_mismatches, "all 14 retained logs are strict UTF-8 and match exact byte/hash/job pins", checks, failures)

    retention = read_json(DATE / "artifact-retention.json")
    metadata = read_json(DATE / "primary-artifact-metadata.json")
    zip_path = DATE / "original.zip"
    zip_data = zip_path.read_bytes()
    metadata_ok = (
        retention["source"] == SOURCE and retention["sourceTree"] == TREE
        and retention["run"] == 41169518187 and retention["job"] == 124444234335
        and metadata["id"] == retention["artifactId"] == 13030848292
        and metadata["size_in_bytes"] == len(zip_data) == retention["providerZipBytes"]
        and digest(zip_data) == retention["providerZipSha256"] == metadata["digest"].removeprefix("sha256:")
        and retention["workflowOutcome"] == "success"
    )
    require(metadata_ok, "primary provider metadata and retained ZIP pin agree on source/run/job/artifact/bytes/hash", checks, failures)
    member_rows = retention["members"]
    member_by_name = {row["path"]: row for row in member_rows}
    member_problems = []
    with zipfile.ZipFile(zip_path) as archive:
        corrupt = archive.testzip()
        infos = [info for info in archive.infolist() if not info.is_dir()]
        names = {info.filename for info in infos}
        if corrupt is not None or len(infos) != 968 or len(member_rows) != 968 or names != set(member_by_name):
            member_problems.append({"reason": "ZIP CRC/name/count/manifest mismatch", "bad_member": corrupt,
                                    "zip_files": len(infos), "manifest_files": len(member_rows)})
        for info in infos:
            row = member_by_name.get(info.filename)
            if row is None:
                continue
            payload = archive.read(info.filename)
            extracted = EXTRACTED / info.filename
            if len(payload) != row["bytes"] or digest(payload) != row["sha256"]:
                member_problems.append({"path": info.filename, "reason": "ZIP member differs from retention pin"})
            if not extracted.is_file() or extracted.stat().st_size != row["bytes"] or digest(extracted.read_bytes()) != row["sha256"]:
                member_problems.append({"path": info.filename, "reason": "extracted member differs from retention pin"})
    uncompressed = sum(row["bytes"] for row in member_rows)
    require(not member_problems and uncompressed == 79084644,
            "provider ZIP CRC and all 968 member hashes/sizes match retained manifest and extraction", checks, failures)

    method_path = EXTRACTED / "compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/execution.json"
    method = read_json(method_path)
    frontend = read_json(EXTRACTED / "compiled-frontend/artifacts/execution.json")
    backends = read_json(EXTRACTED / "compiled-backends/artifacts/execution.json")
    execution_rows = []
    source_pin_mismatches = {}
    for name, execution in (("compiled-frontend", frontend), ("compiled-backends", backends), ("compiled-methods", method)):
        before, after = execution.get("sourceBefore", []), execution.get("sourceAfter", [])
        pin_check = verify_pins(before, ROOT, checks, failures, f"{name} source")
        source_pin_mismatches[name] = pin_check["mismatches"]
        execution_rows.append({"lane": name, "status": execution.get("status"), "commands": len(execution.get("commands", [])),
                               "successful_commands": sum(c.get("exitCode") == 0 for c in execution.get("commands", [])),
                               "source_before_count": len(before), "source_after_count": len(after), "pins_stable": before == after,
                               "pin_matches": pin_check["matched"] == pin_check["count"]})
        require(execution.get("status") == "passed" and before == after and pin_check["matched"] == pin_check["count"]
                and all(c.get("exitCode") == 0 for c in execution.get("commands", [])),
                f"{name}: passed commands and source pins are stable/current", checks, failures)
    require([row["source_before_count"] for row in execution_rows] == [126, 130, 137],
            "frontend/backend/methods execution pin counts are 126/130/137", checks, failures)

    frontend_logs = EXTRACTED / "compiled-frontend/artifacts/logs"
    method_logs = EXTRACTED / "compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/logs"
    node_front_count = tap_tests(frontend_logs / "node-tests.stdout.log")
    node_method_count = tap_tests(method_logs / "method-owned-node-tests.stdout.log")
    require(len(frontend.get("commands", [])) == 33 and len(frontend.get("apps", [])) == 5
            and sum(app.get("status") == "matched" for app in frontend["apps"]) == 5 and node_front_count == 97,
            "frontend nested gate: 33 commands, 5/5 apps, 97 Node tests", checks, failures)
    require(len(backends.get("commands", [])) == 18 and len(backends.get("backendConformance", [])) == 5
            and all(app.get("status") == "matched" for app in backends["backendConformance"]),
            "backend nested gate: 18 commands, 5/5 fixtures matched", checks, failures)
    require(len(method.get("commands", [])) == 17 and node_method_count == 10,
            "methods execution: 17 commands and 10 method-owned Node tests", checks, failures)

    method_run = read_json(EXTRACTED / "compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/matrix/methods.run.json")
    method_check = read_json(EXTRACTED / "compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/matrix/methods.check.json")
    require(method["mode"] == "full" and method["status"] == "passed" and len(method["sourceBefore"]) == 137
            and method["sourceBefore"] == method["sourceAfter"] and len(method["commands"]) == 17
            and all(c.get("exitCode") == 0 for c in method["commands"]),
            "methods primary execution is full/passed with 17/17 commands and 137 stable pins", checks, failures)
    require(method_check.get("status") == "matched" and method_check.get("ticks") == 19
            and method_check.get("actions") == 18 and method_check.get("suppressedActions") == 4
            and method_check.get("swaps") == 18 and method_check.get("valueSemanticsChecks") == 14,
            "method conformance totals match 19 ticks/18 actions/4 suppressed/18 swaps/14 value checks", checks, failures)

    typed_log_rel = "compiled-backends/artifacts/logs/inherited-full-runner.stdout.log"
    typed_log = zipfile.ZipFile(zip_path).read(typed_log_rel)
    typed_text = typed_log.decode("utf-8", errors="strict")
    typed_lines = typed_text.splitlines()
    typed_summary = None
    for start, line in enumerate(typed_lines):
        if '"actorNativeFrameComparisons"' not in line:
            continue
        for opening in range(start, max(-1, start - 15), -1):
            if typed_lines[opening].strip() != "{":
                continue
            depth = 0
            for end in range(opening, len(typed_lines)):
                depth += typed_lines[end].count("{") - typed_lines[end].count("}")
                if depth == 0:
                    try:
                        candidate = json.loads("\n".join(typed_lines[opening:end + 1]))
                    except json.JSONDecodeError:
                        continue
                    if "actorNativeFrameComparisons" in candidate:
                        typed_summary = candidate
                    break
            if typed_summary:
                break
        if typed_summary:
            break
    typed_script = (ROOT / "run-typed-composition.sh").read_text(encoding="utf-8")
    typed_run_pin = next((row for row in method.get("sourceBefore", []) if row["path"] == "run-typed-composition.sh"), None)
    seed_command_source_match = bool(typed_run_pin and digest((ROOT / "run-typed-composition.sh").read_bytes()) == typed_run_pin["sha256"])
    seed_source_exact = all(token in typed_script for token in ("--seeds 20261030,20261031", "--cases 30", "--max-actions 40"))
    require(typed_summary is not None and typed_summary.get("status") == "matched" and typed_summary.get("scripts") == 63
            and typed_summary.get("actions") == 2463 and typed_summary.get("nativeExecutions") == 63
            and typed_summary.get("nativeFrames") == 2463 and typed_summary.get("actorNativeFrameComparisons") == 4926
            and typed_summary.get("mismatches") == 0,
            "primary ZIP inherited stdout contains the typed-composition matched summary and recorded totals", checks, failures)
    require(seed_command_source_match and seed_source_exact and not any("typed-composition/build/report.json" in name for name in zipfile.ZipFile(zip_path).namelist()),
            "typed seeds/case bounds derive from the source-pinned command; detailed summary JSON is absent from ZIP", checks, failures)

    m0_lines = (EXTRACTED / "compiled-backends/artifacts/logs/inherited-full-runner.stdout.log").read_text(encoding="utf-8").splitlines()
    m0_meta_path = ROOT / "typed-composition/evidence/milestone0-preflight.json"
    m0_meta = read_json(m0_meta_path)
    sha_sums = ROOT / "SHA256SUMS"
    expected = ROOT / "EXPECTED.json"
    rule_lines = (ROOT / "gobi/rules_test.go").read_text(encoding="utf-8").splitlines()
    rule_start = next(i for i, line in enumerate(rule_lines) if "return []rule{" in line)
    rule_end = next(i for i, line in enumerate(rule_lines[rule_start + 1:], rule_start + 1) if line.strip() == "}")
    rule_rows = sum(line.lstrip().startswith("{") for line in rule_lines[rule_start:rule_end])
    m0_log_claims = all(any(target in line for line in m0_lines) for target in ("same over 5000 inputs", "receipt matches", "SHA256SUMS ok"))
    m0_source_claims = (m0_meta["staticExecution"]["seed"] == 20261030 and m0_meta["staticExecution"]["cases"] == 5000
                        and m0_meta["entries"] == 24 and digest(sha_sums.read_bytes()) == m0_meta["receiptSHA256"]
                        and digest(expected.read_bytes()) == m0_meta["expectedSHA256"] and rule_rows == 59)
    m0_not_in_zip = "typed-composition/evidence/milestone0-preflight.json" not in zipfile.ZipFile(zip_path).namelist()
    require(m0_log_claims and m0_source_claims and m0_not_in_zip,
            "M0 CI pass lines are in the ZIP; seed/receipt/rule metadata is tied to checked-in files and excluded from the ZIP", checks, failures)

    current_claim = receipt["current_workflows"]
    artifact_claim = receipt["primary_artifact"]
    frontend_claim = receipt["inherited_counts"]["compiled_frontend"]
    backend_claim = receipt["inherited_counts"]["compiled_backends"]
    methods_claim = receipt["inherited_counts"]["compiled_methods"]
    claim_consistency = (
        current_claim["total"] == 26 and current_claim["completed"] == 26 and current_claim["success"] == 26
        and current_claim["failure"] == 0 and current_claim["events"] == {"pull_request": 13, "push": 13}
        and current_claim["all_head_shas_match_source"] is True and current_claim["all_initial_run_ids_match"] is True
        and artifact_claim["artifact_id"] == retention["artifactId"]
        and artifact_claim["provider_zip_bytes"] == len(zip_data)
        and artifact_claim["provider_zip_sha256"] == digest(zip_data)
        and artifact_claim["member_count"] == len(member_rows) == 968
        and artifact_claim["uncompressed_bytes"] == uncompressed
        and artifact_claim["execution_status"] == method["status"] == "passed"
        and artifact_claim["execution_mode"] == method["mode"] == "full"
        and artifact_claim["commands"] == len(method["commands"]) == 17
        and frontend_claim["commands"] == len(frontend["commands"]) == 33
        and frontend_claim["matched_apps"] == 5
        and frontend_claim["node_tests"] == node_front_count == 97
        and backend_claim["commands"] == len(backends["commands"]) == 18
        and backend_claim["matched_fixtures"] == len(backends["backendConformance"]) == 5
        and methods_claim["commands"] == len(method["commands"]) == 17
        and methods_claim["method_owned_node_tests"] == node_method_count == 10
        and receipt.get("audit", {}).get("result_sha256") == digest((LANE / "primary-artifact-audit-6b49cc0.json").read_bytes())
    )
    require(claim_consistency, "E-CI-EVIDENCE receipt summary fields match the independently read source, workflow, archive and execution records",
            checks, failures)

    result = {
        "schema": "gobi.ci-evidence-independent-review/v1",
        "job_id": "XR-CI-EVIDENCE",
        "source": {"commit": SOURCE, "tree": TREE, "worktree_commit": head, "worktree_tree": tree,
                   "identity_receipt_sha256": digest(identity_path.read_bytes()),
                   "remote_prepublication_sha256": digest((DATE / "remote-prepublication.json").read_bytes()),
                   "merge_test_commit": pr["merge_test_commit"], "merge_tree": pr["merge_tree"],
                   "merge_parents": pr["merge_parents"], "merge_object_available_locally": merge_object_available},
        "workflows": {"snapshot_path": str(snapshot_path.relative_to(ROOT)), "snapshot_sha256": digest(snapshot_path.read_bytes()),
                      "initial_workflows_sha256": digest((DATE / "repair-head-initial-workflows.json").read_bytes()),
                      "total": len(terminal_rows), "completed_success": sum(1 for row in job_summary if row.get("conclusion") == "success"),
                      "event_counts": dict(events), "run_identity_match": run_identity_ok, "all_source_heads": all_source,
                      "jobs": job_summary},
        "logs": {"manifest_path": str(log_manifest_path.relative_to(ROOT)),
                 "manifest_sha256": digest(log_manifest_path.read_bytes()), "count": len(log_rows),
                 "strict_utf8_sha256_matches": len(decoded) - len(log_mismatches), "mismatches": log_mismatches,
                 "records": decoded},
        "artifact": {"path": str(zip_path.relative_to(ROOT)), "bytes": len(zip_data), "sha256": digest(zip_data),
                     "retention_sha256": digest((DATE / "artifact-retention.json").read_bytes()),
                     "crc_valid": not member_problems, "members": len(member_rows), "uncompressed_bytes": uncompressed,
                     "member_problems": member_problems},
        "execution": {"lanes": execution_rows, "inherited_counts": {"frontend_commands": len(frontend["commands"]),
                        "frontend_apps": len(frontend["apps"]), "frontend_matched": sum(app["status"] == "matched" for app in frontend["apps"]),
                        "frontend_node_tests": node_front_count, "backend_commands": len(backends["commands"]),
                        "backend_fixtures": len(backends["backendConformance"]), "methods_commands": len(method["commands"]),
                        "methods_node_tests": node_method_count},
                      "typed_composition": {"summary": typed_summary, "source_command_pinned": seed_command_source_match,
                                            "seed_source_exact": seed_source_exact, "summary_json_in_zip": False},
                      "m0": {"log_pass_lines": m0_log_claims, "source_metadata_valid": m0_source_claims,
                             "metadata_in_zip": not m0_not_in_zip, "rule_rows": rule_rows}},
        "target_report_sha256": digest(report_bytes),
        "target_receipt_sha256": digest(receipt_path.read_bytes()),
        "checks": checks,
        "failures": failures,
        "decision": "accepted" if not failures else "amend",
        "limits": ["The merge-test commit object is not available in this checkout; the merge tree and parent claims were cross-checked across the captured provider PR metadata and workflow payload, but not re-derived from a local commit object."] if not merge_object_available else [],
    }
    out_path = DATE / "lanes/demo/review-evidence/independent-audit.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"decision": result["decision"], "checks": len(checks), "failures": failures,
                      "output": str(out_path.relative_to(ROOT))}, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
