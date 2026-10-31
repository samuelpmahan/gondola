#!/usr/bin/env python3
"""Read-only audit of the published PR12 packet and its preserved evidence."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import tarfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
CI = ROOT / "compiled-backends/ci/2026-10-31"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(ok: bool, message: str) -> None:
    if not ok:
        raise AssertionError(message)


def git_tree(treeish: str) -> dict[str, tuple[str, str, str]]:
    raw = subprocess.check_output(
        ["git", "ls-tree", "-rz", "--full-tree", treeish], cwd=ROOT
    )
    result = {}
    for row in raw.split(b"\0"):
        if not row:
            continue
        metadata, name = row.split(b"\t", 1)
        mode, kind, object_id = metadata.decode().split()
        result[name.decode("utf-8", "surrogateescape")] = (mode, kind, object_id)
    return result


def exact_schedule_score(epoch: dict) -> int:
    workers = list(epoch["assignments"])
    pinned = set(epoch["pinned_workers"])
    available = [worker for worker in workers if worker not in pinned]
    ready = epoch["ready_jobs"]
    eligible = epoch["eligible"]
    weights = epoch["weights"]
    scores = {0: 0}
    for job in ready:
        next_scores = dict(scores)
        for mask, score in scores.items():
            for index, worker in enumerate(available):
                bit = 1 << index
                if not mask & bit and worker in eligible[job]:
                    next_mask = mask | bit
                    next_scores[next_mask] = max(next_scores.get(next_mask, -1), score + weights[job])
        scores = next_scores
    return max(scores.values(), default=0)


def audit_native_history() -> dict:
    coordination = ROOT / "compiled-backends/coordination"
    state = load(coordination / "state.json")
    acceptance = load(coordination / "acceptance.json")
    verification = load(coordination / "verification.json")
    jobs = state["jobs"]
    require(state["epoch"] == 15 and len(jobs) == 26, "native history should be 15 epochs / 26 jobs")
    require(acceptance["status"] == "passed" and acceptance["allDone"] is True and acceptance["jobs"] == 26,
            "recursive acceptance summary differs")
    require(verification["status"] == "passed" and verification["completed"] == verification["totalJobs"] == 26,
            "receipt identity verifier differs")
    require(len(verification["receipts"]) == 26 and len({r["job"] for r in verification["receipts"]}) == 26,
            "verification receipts are not 26 unique jobs")

    indexed_epochs = {Path(item["file"]).name: item for item in acceptance["epochs"]}
    require(len(indexed_epochs) == 15, "acceptance index should pin 15 solve records")
    epochs = []
    for epoch_no in range(15):
        name = f"epoch-{epoch_no:02}.json"
        path = coordination / "native" / name
        raw = path.read_bytes()
        record = json.loads(raw)
        index = indexed_epochs.get(name)
        require(index is not None and digest(raw) == index["sha256"], f"{name}: acceptance pin differs")
        require(record["epoch"] == epoch_no and record["native_score"] == record["exact_score"] == index["nativeScore"],
                f"{name}: epoch identity or score differs")
        constraints = record["native_constraints"]
        require(constraints.get("solved") is True and constraints.get("brokenVal") == 0 and constraints.get("brokenCount") == 0,
                f"{name}: native solver reports broken constraints")
        require(record["independent_capacity_check"] is True and record["independent_eligibility_check"] is True,
                f"{name}: independent allocation check missing")
        expected_dispatch = {w: job for w, job in record["assignments"].items()
                             if w not in set(record["pinned_workers"]) and job != "BENCH"}
        require(record["dispatch"] == expected_dispatch, f"{name}: dispatch differs from assignment")
        require(record["native_score"] == sum(record["weights"][job] for job in record["dispatch"].values()),
                f"{name}: native score does not equal dispatched weight")
        require(record["native_score"] == exact_schedule_score(record), f"{name}: exact optimum recomputation differs")
        for worker, job in record["dispatch"].items():
            require(job in record["ready_jobs"] and worker in record["eligible"][job],
                    f"{name}: ineligible or unready dispatch {worker}->{job}")
        epochs.append({"epoch": epoch_no, "sha256": digest(raw), "score": record["native_score"],
                       "dispatch_count": len(record["dispatch"]), "bundle_sha256": digest((coordination / "native" / f"epoch-{epoch_no:02}.bundle").read_bytes())})

    # Every job receipt is identified by the pinned state, the receipt, and the verifier index.
    check_receipts = {}
    for job_id, job in jobs.items():
        require(job["status"] == "done" and job["worker"], f"job not complete: {job_id}")
        path = coordination / "receipts" / f"{job_id}.json"
        receipt_bytes = path.read_bytes()
        receipt = json.loads(receipt_bytes)
        require(receipt["job_id"] == job_id and receipt["worker"] == job["worker"],
                f"receipt identity mismatch: {job_id}")
        index = next((row for row in verification["receipts"] if row["job"] == job_id), None)
        require(index is not None and index["sha256"] == digest(receipt_bytes), f"verifier receipt pin mismatch: {job_id}")
        if job["kind"] == "review":
            dependency = jobs[job["depends_on"]]
            require(job["worker"] != dependency["worker"], f"self-review: {job_id}")
            require(receipt.get("decision") in {"accepted", "amend", "rejected"}, f"bad review decision: {job_id}")
        else:
            require(receipt.get("outcome") in {"confirmed_reuse", "mixed_change", "not_reuse", "insufficient_evidence"},
                    f"bad extraction outcome: {job_id}")
        check_receipts[job_id] = receipt

    # An amended review is resolved only when every recursive repair descendant is independently accepted.
    def resolve_amendment(review_id: str, stack: tuple[str, ...] = ()) -> dict:
        require(review_id not in stack, f"repair cycle detected: {stack + (review_id,)}")
        review_job = jobs[review_id]
        repaired_id = review_job["depends_on"]
        repairs = [jid for jid, entry in jobs.items() if entry.get("repair_of") == repaired_id]
        require(repairs, f"amended review has no repair child: {review_id}")
        descendants = []
        terminals = []
        for repair_id in repairs:
            followups = [jid for jid, entry in jobs.items()
                         if entry["kind"] == "review" and entry.get("depends_on") == repair_id]
            require(followups, f"repair has no independent review: {repair_id}")
            for followup_id in followups:
                decision = check_receipts[followup_id].get("decision")
                if decision == "accepted":
                    terminals.append(followup_id)
                elif decision == "amend":
                    descendants.append(resolve_amendment(followup_id, stack + (review_id,)))
                else:
                    raise AssertionError(f"repair chain rejected: {followup_id}")
        return {"review": review_id, "repair_jobs": repairs,
                "final_reviews": terminals, "nested_chains": descendants}

    amendment_chains = []
    for review_id, review_job in jobs.items():
        if review_job["kind"] == "review" and check_receipts[review_id].get("decision") == "amend":
            amendment_chains.append(resolve_amendment(review_id))

    native_initial = load(coordination / "native/epoch-00.json")
    dispatch = load(coordination / "dispatch.json")
    actual_agents = {worker: (job, agent) for worker, job, agent in dispatch["agents"]}
    require(len(actual_agents) == 6 and dispatch["childrenActuallySpawned"] == 6,
            "actual spawn record must have six distinct children")
    require({worker: job for worker, (job, agent) in actual_agents.items()} == native_initial["dispatch"],
            "actual spawned job mapping differs from the initial native dispatch")
    require(dispatch["score"] == dispatch["exactScore"] == native_initial["native_score"] == 600 and
            dispatch["brokenConstraints"] == 0,
            "initial actual dispatch summary differs from native allocation")

    return {"jobs": len(jobs), "epochs": epochs, "amendment_chains": amendment_chains,
            "native_allocation_and_recorded_actual_dispatch_are_distinct": True,
            "actual_spawn_count": len(actual_agents)}


def audit_initial_ci() -> dict:
    initial_head = "832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb"
    inventory = load(CI / "runs-source832-final.json")
    runs = inventory["workflow_runs"]
    require(inventory["total_count"] == len(runs) == 24 and
            all(row["head_sha"] == initial_head and row["status"] == "completed" for row in runs),
            "source-832 final CI inventory is incomplete or refers to another source")
    conclusions = {result: sum(row["conclusion"] == result for row in runs)
                   for result in ("success", "failure")}
    require(conclusions == {"success": 20, "failure": 4}, "source-832 CI success/failure count differs")
    event_counts = {event: sum(row["event"] == event for row in runs)
                    for event in ("pull_request", "push")}
    require(event_counts == {"pull_request": 12, "push": 12}, "source-832 PR/push run count differs")
    expected_failures = {
        ("Gobi compiled DOM and React backends", "pull_request"),
        ("Gobi compiled Go frontend", "pull_request"),
        ("Gobi compiled DOM and React backends", "push"),
        ("Gobi compiled Go frontend", "push"),
    }
    failures = {(row["name"], row["event"]) for row in runs if row["conclusion"] == "failure"}
    require(failures == expected_failures, "source-832 failed-workflow set differs")

    artifact_meta = load(CI / "initial-source832/artifact.json")["artifacts"]
    require(len(artifact_meta) == 1, "expected one retained source-832 compiled-backends artifact")
    artifact = artifact_meta[0]
    archive_path = CI / "initial-source832/source.zip"
    archive_bytes = archive_path.read_bytes()
    archive_sha = digest(archive_bytes)
    index = load(CI / "initial-source832/index.json")
    require(artifact["id"] == 13025052808 and artifact["workflow_run"]["id"] == 41153480221 and
            artifact["workflow_run"]["head_sha"] == initial_head and artifact["size_in_bytes"] == len(archive_bytes) == index["zipBytes"] == 65988 and
            artifact["digest"] == f"sha256:{archive_sha}" == f"sha256:{index['zipSha256']}" and
            archive_sha == "e78cfe71bcf0f77180d03a9ac2a3cd3ee5afcf9d7df7834aab097e56ef3362fc",
            "source-832 CI artifact identity or archive pin differs")
    expected_members = {row["path"]: {"bytes": row["bytes"], "sha256": row["sha256"]}
                        for row in index["members"]}
    extracted_root = CI / "initial-source832/extracted"
    archive_errors = []
    with zipfile.ZipFile(archive_path) as archive:
        names = set(archive.namelist())
        if names != set(expected_members):
            archive_errors.append("zip_member_names")
        for name, expected in expected_members.items():
            if name not in names:
                continue
            data = archive.read(name)
            extracted = (extracted_root / name).read_bytes()
            current = {"bytes": len(data), "sha256": digest(data)}
            extracted_current = {"bytes": len(extracted), "sha256": digest(extracted)}
            if current != expected or extracted_current != expected:
                archive_errors.append(name)
    require(len(expected_members) == 38 and not archive_errors,
            f"source-832 compiled-backends artifact member/index mismatch: {archive_errors[:3]}")

    execution = load(extracted_root / "compiled-backends/artifacts/execution.json")
    failed_commands = [row for row in execution["commands"] if row["name"] == "inherited-full-runner"]
    require(execution["status"] == "failed" and execution["mode"] == "full" and
            len(failed_commands) == 1 and failed_commands[0]["exitCode"] == 1 and
            execution["checks"] == [],
            "source-832 primary compiled-backends artifact did not fail in the inherited runner before checks")
    node_log = (extracted_root / "compiled-frontend/artifacts/logs/node-tests.stdout.log").read_text(encoding="utf-8")
    require(all(re.search(rf"^# {name} {count}$", node_log, flags=re.MULTILINE) is not None
                for name, count in (("tests", 97), ("pass", 92), ("fail", 5))),
            "source-832 inherited Node test totals differ")
    failed_tests = re.findall(r"^not ok \d+ - (.+)$", node_log, flags=re.MULTILINE)
    require(len(failed_tests) == 5 and
            sum("renderer.test.mjs" in line for line in node_log.splitlines() if "location:" in line) == 4 and
            sum("renderer.browser.test.mjs" in line for line in node_log.splitlines() if "location:" in line) == 1 and
            node_log.count("Failed to launch chromium because executable doesn't exist at /tmp/chromium") == 5,
            "source-832 test failures do not match the five hardcoded-Chromium launch failures")
    return {"runs": len(runs), "successes": conclusions["success"], "failures": conclusions["failure"],
            "events": event_counts, "failed_workflows": [list(row) for row in sorted(failures)],
            "artifact_id": artifact["id"], "artifact_run_id": artifact["workflow_run"]["id"],
            "artifact_zip_sha256": archive_sha, "artifact_zip_bytes": len(archive_bytes),
            "artifact_members": len(expected_members), "node_tests": {"tests": 97, "passed": 92, "failed": 5},
            "failure_reason": "five new DOM/React focused browser cases hardcoded /tmp/chromium, absent on the hosted runner",
            "application_trace_comparison_reached": False, "checks_recorded": len(execution["checks"])}


def audit_repaired_ci_checkouts() -> dict:
    repaired_head = "195c9433179218348d4b9f2477ae1e0725337d15"
    base = "184ccdaabe9e6e46e1052ee79cd7e0be26fe3281"
    merge = load(CI / "merge-source195.json")
    pr = load(CI / "pr-source195.json")
    require(pr["number"] == 12 and pr["draft"] is True and pr["state"] == "open" and
            pr["head"]["sha"] == repaired_head and pr["base"]["sha"] == base,
            "repaired PR12 metadata differs")
    require(merge["sha"] == "ce26da0cb62e4ba3fd1ddd2c2f2456c42969b131" and
            merge["tree"]["sha"] == "c0e4a66eee3fdd8b789e1b565167856fdab62433" and
            [row["sha"] for row in merge["parents"]] == [base, repaired_head] and
            merge["verification"]["verified"] is True,
            "repaired synthetic merge metadata differs")
    run_inventory = load(CI / "runs-source195-initial.json")
    require(run_inventory["total_count"] == len(run_inventory["workflow_runs"]) == 24 and
            all(row["head_sha"] == repaired_head for row in run_inventory["workflow_runs"]),
            "repaired-head initial CI inventory is incomplete or on another source")
    jobs = load(CI / "jobs-source195-initial.json")
    run_map = {row["id"]: row for row in run_inventory["workflow_runs"]}
    job_specs = [
        (124401397795, 41155534464, "Counter interaction parity", "interaction",
         "compiled-backends/ci/2026-10-31/logs/124401397795.log"),
        (124401398200, 41155534454, "Gobi backend replacement", "backend-replacement",
         "compiled-backends/ci/2026-10-31/logs/124401398200.log"),
    ]
    checked = []
    for job_id, run_id, workflow_name, job_name, relative_log in job_specs:
        job_rows = [job for group in jobs for job in group["result"]["jobs"] if job["id"] == job_id]
        run = run_map.get(run_id)
        require(len(job_rows) == 1 and run is not None and run["name"] == workflow_name and
                run["event"] == "pull_request" and run["head_sha"] == repaired_head and
                job_rows[0]["name"] == job_name and
                job_rows[0]["run_id"] == run_id and job_rows[0]["conclusion"] == "success",
                f"repaired checkout job/run metadata differs for job {job_id}")
        raw = (ROOT / relative_log).read_bytes()
        text = raw.decode("utf-8")
        require(f"fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +{merge['sha']}:refs/remotes/pull/12/merge" in text and
                "git checkout --progress --force refs/remotes/pull/12/merge" in text and
                f"HEAD is now at {merge['sha'][:7]}" in text and
                re.search(rf"Z {re.escape(merge['sha'])}\n", text) is not None,
                f"raw repaired-head job log does not establish synthetic-merge checkout: {job_id}")
        for expected in ("Run bash run.sh", "same over 5000 inputs", "receipt matches", "SHA256SUMS ok"):
            require(expected in text, f"repaired-head CI log {job_id} lacks inherited M0 result {expected}")
        if job_name == "interaction":
            require("interaction parity matched 107 scripts over 4473 initial/action ticks (seed 20261030)" in text,
                    "repaired-head interaction seed/count differs")
        else:
            require("interaction parity matched 107 scripts over 4473 initial/action ticks (seed 20261030)" in text and
                    "backend replacement parity matched 103 scripts over 5249 initial/action ticks (seed 20261030)" in text and
                    all(re.search(rf"^.*# {name} {count}$", text, flags=re.MULTILINE) is not None
                        for name, count in (("tests", 20), ("pass", 20), ("fail", 0))),
                    "repaired-head backend replacement seed/count/test result differs")
        checked.append({"job_id": job_id, "run_id": run_id, "workflow": workflow_name,
                        "job": job_name, "run_snapshot_status": run["status"],
                        "run_snapshot_conclusion": run["conclusion"],
                        "log_sha256": digest(raw), "log_bytes": len(raw)})
    return {"head": repaired_head, "tree": merge["tree"]["sha"], "merge": merge["sha"],
            "checkout_jobs": checked, "inherited_M0": "same over 5000 inputs; receipt matches; SHA256SUMS ok",
            "interaction_seed": 20261030, "interaction_scripts": 107, "interaction_ticks": 4473,
            "backend_replacement_seed": 20261030, "backend_replacement_scripts": 103,
            "backend_replacement_ticks": 5249, "backend_replacement_unit_tests": 20}


def audit_typed_source195_artifact() -> dict:
    directory = CI / "typed-source195"
    artifacts = load(directory / "artifact.json")["artifacts"]
    require(len(artifacts) == 1, "expected one repaired-head typed-composition artifact")
    artifact = artifacts[0]
    retention = load(directory / "retention.json")
    inventory = load(directory / "zip-inventory.json")
    selected = load(directory / "selected-index.json")
    require(artifact["id"] == retention["artifact"] == 13025895217 and
            artifact["workflow_run"]["id"] == retention["run"] == 41155534348 and
            artifact["workflow_run"]["head_sha"] == retention["sourceHead"] == "195c9433179218348d4b9f2477ae1e0725337d15" and
            artifact["size_in_bytes"] == retention["zipBytes"] == 120564373 and
            artifact["digest"] == f"sha256:{retention['zipSha256']}" and
            retention["zipSha256"] == "eda966eb257998dd01c350e76375b216c1b9c7e69bf6a222057bae58ebe8b23e",
            "typed-composition artifact metadata differs")
    paths = [row["path"] for row in inventory]
    require(len(paths) == len(set(paths)) == retention["zipMembers"] == 2372 and
            sum(row["bytes"] for row in inventory) == retention["zipUncompressedBytes"] == 3298153070 and
            len(selected) == retention["retained"] == 9 and
            sum(row["bytes"] for row in selected) == retention["retainedBytes"] == 553021,
            "typed-composition ZIP inventory or selected-retention totals differ")
    full_by_path = {row["path"]: row for row in inventory}
    selected_errors = []
    for row in selected:
        data = (directory / "selected" / row["path"]).read_bytes()
        member = full_by_path.get(row["path"])
        if (len(data) != row["bytes"] or digest(data) != row["sha256"] or member is None or
                member["bytes"] != row["bytes"]):
            selected_errors.append(row["path"])
    require(not selected_errors, f"selected typed artifact files mismatch: {selected_errors[:3]}")
    report = load(directory / "selected/typed-composition/build/report.json")
    mismatch_artifact = load(directory / "selected/typed-composition/build/report-mismatches.json")
    require(report["status"] == "matched" and report["seeds"] == [20261030, 20261031] and
            report["casesPerSeed"] == 30 and report["maxActions"] == 40 and
            report["scripts"] == report["nativeExecutions"] == 63 and
            report["actions"] == report["nativeFrames"] == 2463 and
            report["actorNativeFrameComparisons"] == 4926 and report["mismatchCount"] == 0 and
            mismatch_artifact == [], "typed-composition artifact summary differs")
    session = load(directory / "selected/session-tree/build/replay-default.json")
    session_mismatches = load(directory / "selected/session-tree/build/replay-default-mismatches.json")
    focus_negative = load(directory / "selected/session-tree/build/replay-default-focus-negative-mismatches.json")
    browser_smoke = load(directory / "selected/session-tree/build/browser-smoke.json")
    require(session["status"] == "matched" and session["mismatchCount"] == 0 and session_mismatches == [] and
            len(focus_negative) == 3 and browser_smoke["ok"] is True,
            "session-tree selected positive/negative/browser results differ")
    typed_zip = Path("/tmp/gobi-source195-typed.zip")
    typed_zip_hash = None
    typed_zip_verified = False
    if typed_zip.is_file():
        typed_zip_bytes = typed_zip.read_bytes()
        typed_zip_hash = digest(typed_zip_bytes)
        require(len(typed_zip_bytes) == retention["zipBytes"] and typed_zip_hash == retention["zipSha256"],
                "repaired-head typed-composition provider ZIP hash/size differs")
        with zipfile.ZipFile(typed_zip) as archive:
            zip_names = set(archive.namelist())
            require(zip_names == set(paths), "repaired-head typed ZIP names differ from full inventory")
            for member in inventory:
                info = archive.getinfo(member["path"])
                require((info.file_size, info.compress_size, info.CRC) ==
                        (member["bytes"], member["compressedBytes"], member["crc32"]),
                        f"repaired-head typed ZIP metadata differs for {member['path']}")
                data = archive.read(member["path"])
                require(len(data) == member["bytes"],
                        f"repaired-head typed ZIP content size differs for {member['path']}")
        typed_zip_verified = True
    return {"artifact_id": artifact["id"], "run_id": retention["run"],
            "zip_sha256_from_provider_metadata": retention["zipSha256"], "zip_bytes": retention["zipBytes"],
            "zip_members_in_index": len(paths), "uncompressed_bytes_in_index": sum(row["bytes"] for row in inventory),
            "retained_selected_files": len(selected), "retained_selected_bytes": sum(row["bytes"] for row in selected),
            "typed_composition": {"seeds": report["seeds"], "scripts": report["scripts"],
                                  "actions": report["actions"], "native_frames": report["nativeFrames"],
                                  "actor_comparisons": report["actorNativeFrameComparisons"],
                                  "mismatches": report["mismatchCount"]},
            "session_tree": {"positive_status": session["status"], "positive_mismatches": session["mismatchCount"],
                             "intentional_focus_negative_controls": len(focus_negative),
                             "browser_smoke": browser_smoke["ok"]},
            "full_zip_verified_from_ephemeral_local_copy": typed_zip_verified,
            "full_zip_sha256_recomputed": typed_zip_hash,
            "retention_limit": "full 120 MB ZIP is not Git-retained; nine selected files and full member inventory are in the dated evidence tree"}


def audit_primary_ci() -> dict:
    current_head = "195c9433179218348d4b9f2477ae1e0725337d15"
    provenance = load(CI / "primary-provenance.json")
    run = load(CI / "primary-run.json")
    job_packet = load(CI / "primary-jobs.json")
    artifact_meta = load(CI / "artifact.json")["artifacts"]
    retention = load(CI / "retention.json")
    require(provenance["sourceHead"] == run["head_sha"] == current_head and
            provenance["sourceTree"] == run["head_commit"]["tree_id"] ==
            "c0e4a66eee3fdd8b789e1b565167856fdab62433" and
            provenance["directParent"] == "832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb" and
            provenance["prBase"] == "184ccdaabe9e6e46e1052ee79cd7e0be26fe3281" and
            provenance["event"] == run["event"] == "push" and provenance["status"] == run["status"] == "completed" and
            provenance["conclusion"] == run["conclusion"] == "success" and
            provenance["run"] == run["id"] == 41155530877 and provenance["job"] == 124401386239,
            "primary run provenance does not match repaired source/head or push run")
    jobs = job_packet["jobs"]
    require(len(jobs) == 1 and jobs[0]["id"] == provenance["job"] and
            jobs[0]["run_id"] == provenance["run"] and jobs[0]["name"] == "compiled-backends" and
            jobs[0]["status"] == "completed" and jobs[0]["conclusion"] == "success" and
            all(step["conclusion"] == "success" for step in jobs[0]["steps"]),
            "primary compiled-backends job steps are not all successful")
    require(len(artifact_meta) == 1 and artifact_meta[0]["id"] == provenance["artifact"] == 13025112465 and
            artifact_meta[0]["workflow_run"]["id"] == provenance["run"] and
            artifact_meta[0]["workflow_run"]["head_sha"] == current_head and
            artifact_meta[0]["size_in_bytes"] == provenance["artifactZipBytes"] == retention["providerZipBytes"] and
            artifact_meta[0]["digest"] == f"sha256:{provenance['artifactZipSha256']}" ==
            f"sha256:{retention['providerZipSha256']}",
            "primary artifact metadata differs from the selected successful push run")

    raw_log = (CI / provenance["checkoutEvidence"]).read_bytes()
    log_text = raw_log.decode("utf-8-sig")
    branch = run["head_branch"]
    require(f"fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +{current_head}:refs/remotes/origin/{branch}" in log_text and
            f"git checkout --progress --force -B {branch} refs/remotes/origin/{branch}" in log_text and
            re.search(rf"Z {re.escape(current_head)}\n", log_text) is not None and
            "Run interaction/node_modules/.bin/playwright install --with-deps chromium" in log_text and
            "Run bash run-compiled-backends.sh" in log_text and "compiled-backends: passed (full)" in log_text,
            "primary raw log does not establish the exact 195 push checkout/full workflow")

    archive_path = CI / "original.zip"
    archive_bytes = archive_path.read_bytes()
    archive_sha = digest(archive_bytes)
    retained_index = load(CI / "retained-index.json")
    zip_inventory = load(CI / "zip-inventory.json")
    expected = {row["path"]: {"bytes": row["bytes"], "sha256": row["sha256"]} for row in retained_index}
    inventory = {row["path"]: row for row in zip_inventory}
    require(len(archive_bytes) == provenance["artifactZipBytes"] == retention["providerZipBytes"] == 14931201 and
            archive_sha == provenance["artifactZipSha256"] == retention["providerZipSha256"] ==
            "646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa" and
            len(expected) == len(inventory) == provenance["readOnlyExtractedFiles"] == retention["providerMembers"] == 817 and
            len(retained_index) == len(expected) and expected.keys() == inventory.keys(),
            "primary artifact ZIP and retention inventories do not match metadata")
    with zipfile.ZipFile(archive_path) as archive:
        names = set(archive.namelist())
        require(names == set(expected), "primary ZIP member names differ from retained index")
        for name, row in expected.items():
            info = archive.getinfo(name)
            data = archive.read(name)
            member = inventory[name]
            require(len(data) == row["bytes"] and digest(data) == row["sha256"] and
                    (info.file_size, info.compress_size, info.CRC) ==
                    (member["bytes"], member["compressedBytes"], member["crc32"]),
                    f"primary ZIP content or metadata mismatch: {name}")
            extracted = CI / "extracted" / name
            extracted_bytes = extracted.read_bytes()
            require(len(extracted_bytes) == row["bytes"] and digest(extracted_bytes) == row["sha256"],
                    f"retained extracted file mismatch: {name}")
    require(sum(row["bytes"] for row in retained_index) == retention["retainedBytes"] == 87153279,
            "primary retained byte count differs")

    retained_archive = CI / "ci-artifacts.tar.xz"
    retained_archive_bytes = retained_archive.read_bytes()
    retained_archive_sha = digest(retained_archive_bytes)
    expected_tar = {row["path"]: {"bytes": row["bytes"], "sha256": row["sha256"]}
                    for row in retained_index}
    tar_members = {}
    with tarfile.open(retained_archive, "r:xz") as tar:
        for member in tar.getmembers():
            require(member.isfile() and member.name not in tar_members,
                    f"primary Git-retained archive has invalid/duplicate member: {member.name}")
            stream = tar.extractfile(member)
            data = stream.read() if stream else b""
            tar_members[member.name] = {"bytes": len(data), "sha256": digest(data)}
    require(len(retained_archive_bytes) == 5217080 and
            retained_archive_sha == "91b781500ff5379cf118918f545b6593969cb28d5495014b68c9a3ea6ca9218d" and
            tar_members == expected_tar,
            "primary Git-retained archive does not exactly match the 817-member provider retention index")

    extracted = CI / "extracted"
    backend = load(extracted / "compiled-backends/artifacts/execution.json")
    frontend = load(extracted / "compiled-frontend/artifacts/execution.json")
    node_log = (extracted / "compiled-frontend/artifacts/logs/node-tests.stdout.log").read_text(encoding="utf-8")
    require(backend["status"] == "passed" and backend["mode"] == "full" and backend["failures"] == [] and
            len(backend["commands"]) == 18 and all(row["exitCode"] == 0 for row in backend["commands"]) and
            len(backend["checks"]) == 10 and backend["sourcePinsMatch"] is True and
            backend["sourceBefore"] == backend["sourceAfter"] and len(backend["sourceBefore"]) == 126,
            "primary backend full-run execution, source pins or command status differs")
    require(frontend["status"] == "passed" and len(frontend["commands"]) == 33 and
            all(row["exitCode"] == 0 for row in frontend["commands"]) and
            frontend["sourceBefore"] == frontend["sourceAfter"] and len(frontend["sourceBefore"]) == 122 and
            all(re.search(rf"^# {name} {count}$", node_log, flags=re.MULTILINE) for name, count in
                (("tests", 97), ("pass", 97), ("fail", 0))),
            "primary inherited compiled-frontend execution or 97-test result differs")
    current_source_errors = []
    for pin in backend["sourceBefore"] + frontend["sourceBefore"]:
        path = ROOT / pin["path"]
        if not path.is_file() or digest(path.read_bytes()) != pin["sha256"]:
            current_source_errors.append(pin["path"])
    require(not current_source_errors, f"primary current source pins differ: {current_source_errors[:4]}")

    for label, execution in (("backend", backend), ("frontend", frontend)):
        require(execution["versions"]["node"] == "v22.23.4" and execution["versions"]["rootGo"] == "go version go1.24.13 linux/amd64" and
                execution["versions"].get("compiledGo", execution["versions"].get("go")) == "go version go1.27.3 linux/amd64",
                f"primary {label} toolchain versions differ")
    require(backend["versions"]["react"] == backend["versions"]["reactDOM"] == "19.3.1" and
            backend["versions"]["playwright"] == "1.64.1" and backend["versions"]["esbuild"] == "0.28.2" and
            backend["environment"]["CHROMIUM_PATH"] is None and backend["environment"]["CHROMIUM_EXECUTABLE_PATH"] is None,
            "primary browser/package versions or unset Chromium overrides differ")
    require(all(check["exitCode"] == 0 for check in backend["inheritedExecution"]["commands"]) and
            backend["inheritedExecution"]["status"] == "passed" and
            frontend["versions"]["playwright"] == "1.64.1" and
            all(profile["noWasm"]["wasmRequests"] == [] and profile["noWasm"]["wasmAPIAttempts"] == []
                for profile in frontend["apps"]),
            "primary inherited runner or no-WASM evidence differs")

    backend_builds = backend["backendBuilds"]
    react_result = load(extracted / "compiled-backends/artifacts/react-build-result.json")
    dom_result = load(extracted / "compiled-backends/artifacts/dom-build-result.json")
    react_outputs = {row["path"]: (row["sha256"], row["bytes"]) for row in react_result["outputs"]}
    dom_outputs = {row["path"]: (row["sha256"], row["bytes"]) for row in dom_result["outputs"]}
    require(react_result["ok"] is True and dom_result["ok"] is True and
            len(react_result["apps"]) == len(dom_result["apps"]) == 4 and
            len(react_outputs) == len(dom_outputs) == 209 and react_outputs.keys() == dom_outputs.keys(),
            "primary React/DOM build app or output counts differ")
    identical_outputs = sum(react_outputs[path] == dom_outputs[path] for path in react_outputs)
    differing_paths = sorted(path for path in react_outputs if react_outputs[path] != dom_outputs[path])
    expected_different = sorted([f"apps/{app}/gobi-compiled.mjs" for app in
                                 ("counter-b05e9eb0e4e6", "effect-ff8449e8f5b2", "form-a3fe6b48b000", "list-f8359aa2866d")] +
                                ["buildmanifest.json"])
    require(identical_outputs == 204 and differing_paths == expected_different,
            "primary build output byte comparison differs from four raw bundles plus backend-tagged manifest")
    for backend_name, result in (("react", react_result), ("dom", dom_result)):
        require(backend_builds[backend_name]["ok"] is True and backend_builds[backend_name]["appCount"] == 4 and
                backend_builds[backend_name]["diagnostics"] == [], f"primary {backend_name} build result differs")
        for row in result["outputs"]:
            extracted_path = extracted / "compiled-backends/artifacts/compiled" / backend_name / row["path"]
            data = extracted_path.read_bytes()
            require(len(data) == row["bytes"] and digest(data) == row["sha256"],
                    f"primary {backend_name} output pin differs: {row['path']}")
    for backend_name in ("react", "dom"):
        before = {row["path"]: row["sha256"] for row in backend["outputPinsBefore"][backend_name]}
        prefix = f"compiled-backends/artifacts/compiled/{backend_name}/"
        after = {row["path"].removeprefix(prefix): row["sha256"] for row in backend["outputPinsAfter"][backend_name]}
        require(len(before) == 209 and before == after ==
                {path: result_hash[0] for path, result_hash in
                 (react_outputs if backend_name == "react" else dom_outputs).items()},
                f"primary {backend_name} output hashes changed between before/after snapshots")

    for row in backend["backendBuildComparison"]:
        require(row["files"]["appIR"]["identical"] and row["files"]["encoder"]["identical"] and
                row["files"]["components"]["identical"], f"primary backend companion mismatch for {row['app']}")
    react_manifest = load(extracted / "compiled-backends/artifacts/compiled/react/buildmanifest.json")
    dom_manifest = load(extracted / "compiled-backends/artifacts/compiled/dom/buildmanifest.json")
    for manifest in (react_manifest, dom_manifest):
        for app in manifest["apps"]:
            app.pop("backend", None)
    require(react_manifest == dom_manifest, "primary build manifests differ beyond each app's backend tag")
    shared = backend["sharedRuntimeModuleUse"]
    require(len(shared) == 4 and all(row["moduleLoads"] == 1 and set(row["harnessAndDemoRendererSet"]) == {"react", "dom"}
                                     for row in shared),
            "primary module reuse evidence differs")

    profiles = backend["backendConformance"]
    profile_totals = {"ticks": sum(row["check"]["ticks"] for row in profiles),
                      "swaps": sum(row["check"]["swaps"] for row in profiles),
                      "focus_swaps": sum(row["check"]["focusSwaps"] for row in profiles),
                      "mutations": sum(row["check"]["mutationControlsDetected"] for row in profiles)}
    require(len(profiles) == 5 and all(row["status"] == "matched" and row["check"]["status"] == "matched" and
                                       row["check"]["pins"]["sourceStable"] is True and
                                       row["check"]["pins"]["sourceCount"] == 34 for row in profiles) and
            profile_totals == {"ticks": 43, "swaps": 37, "focus_swaps": 9, "mutations": 45},
            "primary five-profile backend matrix or totals differ")
    demo = backend["demoSmoke"]
    require(demo["status"] == "passed" and len(demo["checks"]) == 5 and demo["errors"] == [] and
            demo["wasmRequests"] == [] and demo["browser"] == "156.0.8078.4" and
            backend["demoOutputPinsBeforeSmoke"] == backend["demoOutputPinsAfterSmoke"],
            "primary demo smoke, browser version, no-WASM results or output stability differ")

    return {"run": run["id"], "job": jobs[0]["id"], "event": run["event"],
            "head": run["head_sha"], "tree": run["head_commit"]["tree_id"],
            "raw_log_sha256": digest(raw_log), "raw_log_bytes": len(raw_log),
            "artifact_id": artifact_meta[0]["id"], "artifact_zip_sha256": archive_sha,
            "artifact_zip_bytes": len(archive_bytes), "artifact_files": len(expected),
            "artifact_uncompressed_bytes": retention["retainedBytes"],
            "git_retained_archive": {"sha256": retained_archive_sha,
                                     "bytes": len(retained_archive_bytes),
                                     "members": len(tar_members)},
            "backend_commands": len(backend["commands"]), "backend_source_pins": len(backend["sourceBefore"]),
            "frontend_commands": len(frontend["commands"]), "frontend_source_pins": len(frontend["sourceBefore"]),
            "node_tests": {"tests": 97, "passed": 97, "failed": 0},
            "versions": {"root_go": backend["versions"]["rootGo"], "compiled_go": backend["versions"]["compiledGo"],
                         "node": backend["versions"]["node"], "playwright": backend["versions"]["playwright"],
                         "chromium": demo["browser"]},
            "builds": {"apps_per_backend": 4, "outputs_per_backend": 209,
                       "byte_identical_companions": identical_outputs,
                       "expected_different_outputs": differing_paths,
                       "source_output_hashes_stable": True},
            "shared_module_loads": len(shared), "profiles": [row["profile"] for row in profiles],
            "profile_totals": profile_totals,
            "demo": {"status": demo["status"], "checks": len(demo["checks"]),
                     "errors": len(demo["errors"]), "wasm_requests": len(demo["wasmRequests"])},
            "all_817_provider_members_verified": True,
            "scope_note": "This successful full run is a push event; the concurrent repaired-head PR workflow status is tracked separately."}


def audit_final_status_snapshot() -> dict:
    current_head = "195c9433179218348d4b9f2477ae1e0725337d15"
    current_tree = "c0e4a66eee3fdd8b789e1b565167856fdab62433"
    snapshot_path = CI / "runs-source195-final.json"
    status_path = CI / "status.json"
    snapshot_bytes = snapshot_path.read_bytes()
    snapshot_sha = digest(snapshot_bytes)
    snapshot = json.loads(snapshot_bytes)
    status = load(status_path)
    runs = snapshot["workflow_runs"]
    counts = {event: sum(row["event"] == event for row in runs)
              for event in ("push", "pull_request")}
    conclusions = {value: sum(row["conclusion"] == value for row in runs)
                   for value in ("success", "failure", "cancelled", "skipped")}
    require(snapshot["total_count"] == len(runs) == 24 and
            all(row["status"] == "completed" and row["conclusion"] == "success" and
                row["head_sha"] == current_head and row["head_commit"]["tree_id"] == current_tree
                for row in runs) and counts == {"push": 12, "pull_request": 12} and
            len({row["id"] for row in runs}) == 24 and
            len({(row["name"], row["event"]) for row in runs}) == 24,
            "final repaired-head CI snapshot does not contain 24 unique successful completed runs")
    require(status["schema"] == "gobi.final-ci-status/v1" and
            status["head"] == current_head and status["tree"] == current_tree and
            status["allCompletedSuccess"] is True and status["counts"] == counts and
            status["snapshot"] == snapshot_path.name and status["snapshotSha256"] == snapshot_sha ==
            "f51925822e16899aa2f8951cf749a8696a30d89c2543dcd836291c1d2128ef8b" and
            conclusions["success"] == 24 and sum(conclusions.values()) == 24,
            "final CI status summary differs from its immutable workflow snapshot")
    return {"snapshot": snapshot_path.name, "snapshot_sha256": snapshot_sha,
            "status_file_sha256": digest(status_path.read_bytes()), "runs": len(runs),
            "events": counts, "conclusions": conclusions,
            "all_completed_success": True, "head": current_head, "tree": current_tree,
            "detail_scope": status["detailScope"]}


def main() -> None:
    repair = load(ROOT / "compiled-backends/PORTABLE-BROWSER-REPAIR.json")
    initial_head = repair["parent"]
    require(initial_head == "832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb" and
            repair["parentTree"] == "bc8883df935c7d0c8b7265831cacdf5521fb70d2",
            "portable-browser repair parent differs from the original published source")
    delivery_bytes = subprocess.check_output(
        ["git", "show", f"{initial_head}:compiled-backends/DELIVERY.json"], cwd=ROOT
    )
    delivery = json.loads(delivery_bytes)
    require((ROOT / "compiled-backends/DELIVERY.json").read_bytes() == delivery_bytes,
            "historical DELIVERY manifest changed after initial publication")
    require(delivery["base"] == "184ccdaabe9e6e46e1052ee79cd7e0be26fe3281", "DELIVERY base differs")
    delivery_errors = []
    for entry in delivery["files"]:
        try:
            data = subprocess.check_output(["git", "show", f"{initial_head}:{entry['path']}"], cwd=ROOT)
        except subprocess.CalledProcessError:
            delivery_errors.append({"path": entry["path"], "reason": "missing_at_initial_head"})
            continue
        if len(data) != entry["bytes"] or digest(data) != entry["sha256"]:
            delivery_errors.append({"path": entry["path"], "reason": "hash_or_size_mismatch"})
    require(not delivery_errors and len(delivery["files"]) == 324,
            f"DELIVERY mismatches: {delivery_errors[:3]}")

    repair_manifest_bytes = (ROOT / "compiled-backends/PORTABLE-BROWSER-REPAIR.json").read_bytes()
    repair_errors = []
    for entry in repair["files"]:
        path = ROOT / entry["path"]
        if not path.is_file():
            repair_errors.append({"path": entry["path"], "reason": "missing"})
            continue
        data = path.read_bytes()
        if len(data) != entry["bytes"] or digest(data) != entry["sha256"]:
            repair_errors.append({"path": entry["path"], "reason": "hash_or_size_mismatch"})
    repair_paths = {entry["path"] for entry in repair["files"]}
    repair_paths.add("compiled-backends/PORTABLE-BROWSER-REPAIR.json")
    actual_delta = set(subprocess.check_output(
        ["git", "diff", "--name-only", initial_head, "HEAD"], cwd=ROOT, text=True
    ).splitlines())
    require(not repair_errors and repair_paths == actual_delta and
            repair["excludes"] == ["compiled-backends/PORTABLE-BROWSER-REPAIR.json"],
            f"follow-up repair manifest delta differs: file_errors={repair_errors[:3]}, delta={sorted(actual_delta)}")
    repair_evidence_errors = []
    repair_evidence_pins = repair["localEvidence"]["packetAndLogPins"]
    for entry in repair_evidence_pins:
        path = ROOT / entry["path"]
        if not path.is_file():
            repair_evidence_errors.append({"path": entry["path"], "reason": "missing"})
            continue
        data = path.read_bytes()
        if len(data) != entry["bytes"] or digest(data) != entry["sha256"]:
            repair_evidence_errors.append({"path": entry["path"], "reason": "hash_or_size_mismatch"})
    require(len(repair_evidence_pins) == 6 and not repair_evidence_errors and
            repair["localEvidence"]["domTests"] == 4 and repair["localEvidence"]["reactBrowserTests"] == 1 and
            repair["localEvidence"]["launcherOptionTests"] == 2,
            f"repair local-evidence packet/log pin mismatch: {repair_evidence_errors[:3]}")

    archive_info = load(ROOT / "compiled-backends/evidence/accepted/archive.json")
    index_path = ROOT / "compiled-backends/evidence/accepted/artifact-index.json"
    index = load(index_path)
    archive_path = ROOT / archive_info["archive"]
    archive_sha = digest(archive_path.read_bytes())
    require(archive_sha == archive_info["sha256"] and archive_path.stat().st_size == archive_info["bytes"],
            "artifact archive top-level hash/size mismatch")
    members = {}
    uncompressed = 0
    archive_errors = []
    with tarfile.open(archive_path, "r:xz") as tar:
        for member in tar.getmembers():
            if not member.isfile():
                archive_errors.append(f"non-file member:{member.name}")
                continue
            if member.name in members:
                archive_errors.append(f"duplicate member:{member.name}")
                continue
            fileobj = tar.extractfile(member)
            content = fileobj.read() if fileobj else b""
            members[member.name] = {"bytes": member.size, "sha256": digest(content)}
            uncompressed += member.size
    expected_index = {row["path"]: {"bytes": row["bytes"], "sha256": row["sha256"]} for row in index}
    require(len(index) == archive_info["files"] == len(members) == 2019,
            "archive/member/index count differs")
    require(uncompressed == archive_info["uncompressedBytes"], "archive uncompressed byte count differs")
    require(members == expected_index and not archive_errors,
            f"archive index mismatch: {archive_errors[:3]}")

    base = delivery["base"]
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    head_tree = subprocess.check_output(["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT, text=True).strip()
    parent = subprocess.check_output(["git", "rev-parse", "HEAD^"], cwd=ROOT, text=True).strip()
    require(head == "195c9433179218348d4b9f2477ae1e0725337d15" and
            head_tree == "c0e4a66eee3fdd8b789e1b565167856fdab62433" and parent == initial_head,
            "repaired published branch HEAD/tree/parent differs from expected source snapshot")
    base_tree = git_tree(base)
    current_tree = git_tree(head)
    base_outside = {path: row for path, row in base_tree.items() if not path.startswith("compiled-frontend/")}
    unchanged_outside = {path for path, row in base_outside.items() if current_tree.get(path) == row}
    require(len(base_outside) == len(unchanged_outside) == 1251,
            "inherited baseline-path comparison differs from reported 1251")

    pr = load(CI / "pr-initial.json")
    merge = load(CI / "merge-commit.json")
    require(pr["number"] == 12 and pr["draft"] is True and pr["state"] == "open" and
            pr["head"]["sha"] == initial_head and pr["base"]["sha"] == base,
            "initial PR snapshot branch/base identity differs")
    initial_tree = subprocess.check_output(["git", "rev-parse", f"{initial_head}^{{tree}}"], cwd=ROOT, text=True).strip()
    require(merge["sha"] == "32bdafa0337bfeda55058e9afb36ff06cc6f8496" and
            merge["tree"]["sha"] == initial_tree and
            [p["sha"] for p in merge["parents"]] == [base, initial_head] and
            merge["verification"]["verified"] is True,
            "historical source-832 synthetic merge metadata differs")
    runner_log = CI / "logs/124395035723.log"
    runner_bytes = runner_log.read_bytes()
    runner_text = runner_bytes.decode("utf-8")
    require(len(runner_bytes) == 60932 and
            f"fetch --no-tags --prune --no-recurse-submodules --depth=1 origin +{merge['sha']}:refs/remotes/pull/12/merge" in runner_text and
            "git checkout --progress --force refs/remotes/pull/12/merge" in runner_text and
            f"HEAD is now at {merge['sha'][:7]}" in runner_text and
            re.search(rf"Z {re.escape(merge['sha'])}\n", runner_text) is not None,
            "raw CI log does not establish checkout of the expected synthetic merge")
    for expected in ("Run bash run.sh", "wrote react-map.gen.mjs", "same over 5000 inputs",
                     "receipt matches", "SHA256SUMS ok",
                     "interaction parity matched 107 scripts over 4473 initial/action ticks (seed 20261030)",
                     "backend replacement parity matched 103 scripts over 5249 initial/action ticks (seed 20261030)"):
        require(expected in runner_text, f"CI inherited evidence missing: {expected}")

    archived_logs = {}
    with tarfile.open(archive_path, "r:xz") as tar:
        name = "compiled-frontend/artifacts/logs/node-tests.stdout.log"
        data = tar.extractfile(name).read()
        archived_logs[name] = {"sha256": digest(data), "bytes": len(data)}
        text = data.decode("utf-8")
        require(re.search(r"# tests 97\n# suites 0\n# pass 97\n# fail 0", text) is not None,
                "archived compiled-frontend Node test count differs from 97/97")

    front_execution = load(ROOT / "compiled-backends/evidence/accepted/compiled-frontend/execution.json")
    require(front_execution["status"] == "passed" and len(front_execution["commands"]) == 33 and
            len(front_execution["sourceBefore"]) == len(front_execution["sourceAfter"]) == 122 and
            front_execution["sourceBefore"] == front_execution["sourceAfter"],
            "compiled-frontend execution summary or source pins differ")
    require(len(front_execution["apps"]) == 5 and all(app["status"] == "matched" for app in front_execution["apps"]),
            "compiled-frontend fixture results differ")
    frontend_ticks = sum(app["ticks"] for app in front_execution["apps"])
    frontend_mutations = sum(len(app["mutationControls"]) for app in front_execution["apps"])
    require(frontend_ticks == 43 and frontend_mutations == 89, "compiled-frontend fixture totals differ")

    backend_execution = load(ROOT / "compiled-backends/evidence/accepted/compiled-backends/execution.json")
    require(backend_execution["status"] == "passed" and
            len(backend_execution["sourceBefore"]) == len(backend_execution["sourceAfter"]) == 126 and
            backend_execution["sourceBefore"] == backend_execution["sourceAfter"] and
            backend_execution["sourcePinsMatch"] is True,
            "compiled-backends execution status or source pins differ")
    profiles = backend_execution["backendConformance"]
    require(len(profiles) == 5 and all(profile["status"] == "matched" and profile["sourceStable"] is True
                                       for profile in profiles),
            "compiled-backends profiles are not all matched/stable")
    backend_totals = {
        "ticks": sum(profile["check"]["ticks"] for profile in profiles),
        "swaps": sum(profile["check"]["swaps"] for profile in profiles),
        "focus_swaps": sum(profile["check"]["focusSwaps"] for profile in profiles),
        "mutations": sum(profile["check"]["mutationControlsDetected"] for profile in profiles),
    }
    require(backend_totals == {"ticks": 43, "swaps": 37, "focus_swaps": 9, "mutations": 45},
            "compiled-backends matrix totals differ")
    react_result = load(ROOT / "compiled-backends/evidence/accepted/compiled-backends/react-build-result.json")
    dom_result = load(ROOT / "compiled-backends/evidence/accepted/compiled-backends/dom-build-result.json")
    react_files = {row["path"]: (row["sha256"], row["bytes"]) for row in react_result["outputs"]}
    dom_files = {row["path"]: (row["sha256"], row["bytes"]) for row in dom_result["outputs"]}
    require(react_result["ok"] and dom_result["ok"] and len(react_files) == len(dom_files) == 209 and
            react_files.keys() == dom_files.keys(), "React/DOM output manifests differ in paths or count")
    identical_companions = sum(react_files[path] == dom_files[path] for path in react_files)
    require(identical_companions == 204, "React/DOM companion output count differs")
    backend_demo = load(ROOT / "compiled-backends/evidence/accepted/compiled-backends/demo-smoke.json")
    require(backend_demo["status"] == "passed" and len(backend_demo["checks"]) == 5 and
            not backend_demo["errors"] and not backend_demo["wasmRequests"],
            "compiled-backends HTTP demo smoke differs")

    typed_composition = load(ROOT / "compiled-backends/evidence/accepted/typed-composition-report.json")
    require(typed_composition["status"] == "matched" and typed_composition["seeds"] == [20261030, 20261031] and
            typed_composition["casesPerSeed"] == 30 and typed_composition["maxActions"] == 40 and
            typed_composition["scripts"] == typed_composition["nativeExecutions"] == 63 and
            typed_composition["actions"] == typed_composition["nativeFrames"] == 2463 and
            typed_composition["actorNativeFrameComparisons"] == 4926 and typed_composition["mismatchCount"] == 0,
            "typed-composition inherited run counts or seeds differ")

    independence = load(ROOT / "compiled-backends/evidence/independence/dom-only-counter-run.json")
    require(independence["decision"] == "passed" and independence["bundle"]["inputCount"] == 7 and
            independence["bundle"]["reactPackageInputs"] == [] and independence["bundle"]["reactAdapterInputs"] == [] and
            independence["bundle"]["reactExternalImports"] == [] and
            independence["bundle"]["outputHasReactGlobal"] is False and
            independence["bundle"]["outputHasReactDOMGlobal"] is False,
            "DOM-only bundle independence evidence differs")
    counts = [step["count"] for step in independence["browser"]["steps"]]
    guards = independence["browser"]["guards"]
    require(counts == [0, 1, 2, 0] and all(not value for value in guards.values()),
            "DOM-only browser counter sequence or no-WASM/network guards differ")

    native = audit_native_history()
    initial_ci = audit_initial_ci()
    repaired_checkouts = audit_repaired_ci_checkouts()
    typed_ci = audit_typed_source195_artifact()
    result = {
        "schema": "gobi.ci-evidence-audit/v1",
        "published_source": {"head": head, "parent": parent, "tree": head_tree},
        "initial_published_source": {"head": initial_head, "tree": initial_tree,
                                     "historical_delivery_entries_verified": len(delivery["files"])},
        "portable_browser_repair": {"parent": repair["parent"], "manifest_sha256": digest(repair_manifest_bytes),
                                     "source_delta_entries": len(repair["files"]),
                                     "changed_paths": sorted(actual_delta),
                                     "local_packet_and_log_pins": len(repair_evidence_pins), "verified": True},
        "initial_synthetic_merge": {"sha": merge["sha"], "tree": merge["tree"]["sha"],
                            "parents": [p["sha"] for p in merge["parents"]],
                            "raw_runner_log_sha256": digest(runner_bytes), "raw_runner_log_bytes": len(runner_bytes)},
        "delivery": {"entries": len(delivery["files"]), "verified": True},
        "archive": {"sha256": archive_sha, "bytes": archive_path.stat().st_size,
                    "members": len(members), "uncompressed_bytes": uncompressed, "verified": True},
        "baseline_unchanged": {"base_tracked_outside_compiled_frontend": len(base_outside),
                               "identical": len(unchanged_outside)},
        "m0_and_inherited_ci": {"m0_case_count": 5000, "m0_receipt_and_SHA_manifest": "passed",
                                "interaction_seed": 20261030, "interaction_scripts": 107,
                                "interaction_ticks": 4473, "backend_replacement_seed": 20261030,
                                "backend_replacement_scripts": 103, "backend_replacement_ticks": 5249,
                                "compiled_frontend_node_tests": 97, "archived_test_log": archived_logs,
                                "typed_composition": {"scripts": typed_composition["scripts"],
                                                      "actions": typed_composition["actions"],
                                                      "actor_comparisons": typed_composition["actorNativeFrameComparisons"],
                                                      "seeds": typed_composition["seeds"]}},
        "local_acceptance": {"compiled_frontend": {"commands": len(front_execution["commands"]),
                                                      "source_pins": 122, "ticks": frontend_ticks,
                                                      "mutation_controls": frontend_mutations},
                             "compiled_backends": {"source_pins": 126, "matrix": backend_totals,
                                                   "react_outputs": len(react_files),
                                                   "dom_outputs": len(dom_files),
                                                   "identical_companions": identical_companions,
                                                   "demo_smoke_checks": len(backend_demo["checks"])},
                             "dom_only": {"esbuild_inputs": independence["bundle"]["inputCount"],
                                          "count_sequence": counts}},
        "native_history": native,
        "initial_source_832_ci": initial_ci,
        "repaired_source_195_ci_checkouts": repaired_checkouts,
        "repaired_source_195_typed_ci_artifact": typed_ci,
        "primary_source_195_ci": audit_primary_ci(),
        "repaired_source_195_final_ci_status": audit_final_status_snapshot(),
        "ci_gate": {"primary_compiled_backends_raw_run": "passed",
                    "repaired_source_195_all_workflows": "passed"},
    }
    out = CI / "lanes/evidence/published-packet-audit.json"
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status": "passed", "delivery": len(delivery["files"]),
                      "archive_members": len(members), "baseline_unchanged": len(unchanged_outside),
                      "native_jobs": native["jobs"], "native_epochs": len(native["epochs"]),
                      "primary_ci": "passed", "source_195_all_24_workflows": "passed",
                      "output": str(out.relative_to(ROOT))}, sort_keys=True))


if __name__ == "__main__":
    main()
