#!/usr/bin/env python3
"""Read-only audit for the pinned 6b49 current-head CI evidence packet."""
from __future__ import annotations
import hashlib, json, pathlib, subprocess, zipfile
from collections import Counter

ROOT = pathlib.Path.cwd()
DATE = ROOT / "compiled-methods/ci/2026-10-31"
LANE = DATE / "lanes/evidence"
EXTRACTED = DATE / "extracted"
ATTEMPT = EXTRACTED / "compiled-methods/artifacts/attempts/attempt-20261031T044100445Z"
SOURCE = "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
TREE = "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
RUN_PREFIX = "/home/runner/work/gondola/gondola/"

def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def load(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))

def verify_pins(rows, base: pathlib.Path, map_absolute=False):
    bad=[]
    for row in rows:
        rel=row["path"]
        if map_absolute and rel.startswith(RUN_PREFIX): rel=rel[len(RUN_PREFIX):]
        path=base / rel
        if not path.is_file():
            bad.append({"path":row["path"],"reason":"missing"}); continue
        actual=sha(path)
        if actual != row["sha256"] or ("bytes" in row and path.stat().st_size != row["bytes"]):
            bad.append({"path":row["path"],"reason":"pin_mismatch","actual_sha256":actual,"actual_bytes":path.stat().st_size})
    return {"count":len(rows),"matched":len(rows)-len(bad),"mismatches":bad}

publication=load(DATE/"publication-current.json")
initial=load(DATE/"repair-head-initial-workflows.json")
snap_path=LANE/"snapshots/jobs-2026-10-31T050732-682Z-6b49cc0-terminal.json"
snapshot=load(snap_path)
identity=load(LANE/"head-identity-6b49cc0.json")
assert publication["sourceCommit"] == snapshot["sourceSha"] == SOURCE
assert publication["sourceTree"] == snapshot["sourceTree"] == TREE
assert snapshot["totalRuns"] == len(snapshot["runs"]) == 26
initial_by_id={r["id"]:r for r in initial["workflow_runs"]}
terminal_by_id={r["run_id"]:r["structuredContent"]["jobs"] for r in snapshot["runs"]}
assert set(initial_by_id)==set(terminal_by_id)
assert len(initial_by_id)==26
assert all(r["head_sha"]==SOURCE for r in initial["workflow_runs"])
assert all(len(jobs)==1 and jobs[0]["status"]=="completed" for jobs in terminal_by_id.values())
assert all(jobs[0]["conclusion"]=="success" for jobs in terminal_by_id.values())
assert Counter(r["event"] for r in initial["workflow_runs"])=={"pull_request":13,"push":13}
assert identity["pull_request"]["merge_test_commit"]=="0e8d8f962fdb2e0ff74a86bd58bb932a2be3e6a5"
assert identity["pull_request"]["merge_tree"]==TREE

log_rows=[]
for run_id, run in sorted(initial_by_id.items(), key=lambda pair:(pair[1]["event"],pair[0])):
    event=run["event"]
    # Retain all 13 PR logs and the specifically designated primary push log.
    if event!="pull_request" and run_id!=41169518187: continue
    job=terminal_by_id[run_id][0]
    expected_base=(LANE/"pull_request"/"6b49cc0" if event=="pull_request" else LANE/"push"/"6b49cc0")
    log_path=expected_base/f"run-{run_id}"/f"job-{job['id']}"/"job.log"
    raw=log_path.read_bytes()
    raw.decode("utf-8",errors="strict")
    log_rows.append({"run_id":run_id,"job_id":job["id"],"event":event,"job_name":job["name"],
        "workflow_head_sha":run["head_sha"],"conclusion":job["conclusion"],
        "path":str(log_path.relative_to(DATE)),"bytes":len(raw),"sha256":hashlib.sha256(raw).hexdigest(),"utf8_valid":True})
assert len(log_rows)==14
assert sum(row["event"]=="pull_request" for row in log_rows)==13
assert sum(row["run_id"]==41169518187 for row in log_rows)==1
assert sum(row["run_id"]==41169522175 for row in log_rows)==1
log_manifest={"schema":"gobi.ci-current-head-evidence-index/v1","source_sha":SOURCE,"source_tree":TREE,
    "initial_workflows_sha256":sha(DATE/"repair-head-initial-workflows.json"),
    "terminal_snapshot_path":str(snap_path.relative_to(DATE)),"terminal_snapshot_sha256":sha(snap_path),
    "all_initial_run_ids_and_heads_match":True,
    "run_summary":{"total_runs":26,"status_counts":{"completed":26},"conclusion_counts":{"success":26},
        "event_counts":{"pull_request":13,"push":13},"failed_jobs":[]},
    "logs":log_rows,"log_count":14,"all_13_pr_logs_present":True,"primary_push_log_present":True,"primary_pr_log_present":True}
(LANE/"log-manifest-6b49cc0.json").write_text(json.dumps(log_manifest,indent=2)+"\n",encoding="utf-8")

retention=load(DATE/"artifact-retention.json")
zip_path=DATE/"original.zip"
assert zip_path.stat().st_size==retention["providerZipBytes"]
assert sha(zip_path)==retention["providerZipSha256"]
with zipfile.ZipFile(zip_path) as zf:
    bad_member=zf.testzip()
    members=[x for x in zf.infolist() if not x.is_dir()]
assert bad_member is None
manifest={x["path"]:x for x in retention["members"]}
assert len(members)==len(manifest)==968
member_bad=[]
for info in members:
    row=manifest.get(info.filename)
    if row is None:
        member_bad.append({"path":info.filename,"reason":"not-in-retention-manifest"}); continue
    path=EXTRACTED/info.filename
    if not path.is_file():
        member_bad.append({"path":info.filename,"reason":"missing-extraction"}); continue
    if info.file_size!=row["bytes"] or path.stat().st_size!=row["bytes"] or sha(path)!=row["sha256"]:
        member_bad.append({"path":info.filename,"reason":"member-hash-or-size-mismatch"})
assert not member_bad

front=load(EXTRACTED/"compiled-frontend/artifacts/execution.json")
back=load(EXTRACTED/"compiled-backends/artifacts/execution.json")
method=load(ATTEMPT/"execution.json")
method_run=load(ATTEMPT/"matrix/methods.run.json")
method_check=load(ATTEMPT/"matrix/methods.check.json")
method_browser=load(ATTEMPT/"matrix/methods.browser.json")
method_native=load(ATTEMPT/"matrix/methods.native.json")
method_direct=load(ATTEMPT/"matrix/methods.direct.json")
exec_records=[]
for name,doc in [("compiled-frontend",front),("compiled-backends",back),("compiled-methods",method)]:
    before=doc["sourceBefore"]; after=doc["sourceAfter"]
    assert before==after
    source_audit=verify_pins(before,ROOT)
    assert not source_audit["mismatches"]
    assert doc["status"]=="passed"
    assert all(c.get("exitCode")==0 for c in doc.get("commands",[]))
    exec_records.append({"lane":name,"status":doc["status"],"commands":len(doc["commands"]),
        "successfulCommands":sum(c.get("exitCode")==0 for c in doc["commands"]),"sourcePins":source_audit})
assert method_run["sourcePinsBefore"]==method_run["sourcePinsAfter"]==method_run["sourcePinsFinal"]
# This matrix field is a combined source/build input set: generated build pins
# live under the retained attempt; the remaining paths are checkout source.
source_rows=[r for r in method_run["sourcePinsBefore"] if not r["path"].startswith("compiled-methods/artifacts/")]
build_rows=[r for r in method_run["sourcePinsBefore"] if r["path"].startswith("compiled-methods/artifacts/")]
method_source_audit=verify_pins(source_rows,ROOT)
method_build_audit=verify_pins(build_rows,EXTRACTED)
assert not method_source_audit["mismatches"] and not method_build_audit["mismatches"]
all_output_rows=method_run["outputPinsBeforeCheck"]
output_checkout_rows=[r for r in all_output_rows if "/compiled-methods/artifacts/" not in r["path"]]
output_artifact_rows=[r for r in all_output_rows if "/compiled-methods/artifacts/" in r["path"]]
method_output_source_audit=verify_pins(output_checkout_rows,ROOT,map_absolute=True)
method_outputs=verify_pins(output_artifact_rows,EXTRACTED,map_absolute=True)
assert not method_outputs["mismatches"] and not method_output_source_audit["mismatches"]
assert method_run["outputPinsBeforeCheck"]==method_run["outputPinsAfterCheck"]
assert method_check["status"]==method_run["status"]=="matched"
assert method_check["ticks"]==19 and method_check["actions"]==18 and method_check["swaps"]==18
assert method_check["suppressedActions"]==4 and method_check["valueSemanticsChecks"]==14
assert method_check["mutationControls"]["detected"]==4
assert method_run["summary"]["browserProfiles"]==["react","dom","swap"]
assert method_native==method_direct
assert method_browser["pageErrors"]==[]
for profile_name,profile in method_browser["profiles"].items():
    assert len(profile["trace"]["ticks"])==19 and len(profile["actions"])==18
    assert len(profile["domOracle"])==19 and len(profile["physicalDOMSnapshots"])==19
    assert not profile["pageErrors"]
    assert profile["noWasm"]["wasmRequests"]==[] and profile["noWasm"]["wasmAPIAttempts"]==[] and profile["noWasm"]["apiAttempts"]==[]
assert len(method_browser["profiles"]["swap"]["swaps"])==18
assert len(method_browser["swapTransitions"])==18
assert len(front["apps"])==5 and all(a["status"]=="matched" for a in front["apps"])
assert len(back["backendConformance"])==5
assert all(a["status"]=="matched" for a in back["backendConformance"])

# The existing full-runner log carries the inherited M0 and typed-composition output.
backlog=EXTRACTED/"compiled-backends/artifacts/logs/inherited-full-runner.stdout.log"
backlines=backlog.read_text(encoding="utf-8").splitlines()
assert "same over 5000 inputs" in backlines and "receipt matches" in backlines and "SHA256SUMS ok" in backlines
# Extract the unique typed-composition JSON summary from the final section of the log.
typed=None
for i,line in enumerate(backlines):
    if '"actorNativeFrameComparisons"' in line and '"scripts"' in "\n".join(backlines[max(0,i-10):i+2]):
        start=max(j for j in range(i) if backlines[j].strip()=="{")
        depth=0; chunks=[]
        for item in backlines[start:]:
            chunks.append(item)
            depth+=item.count("{")-item.count("}")
            if depth==0:
                try: candidate=json.loads("\n".join(chunks))
                except json.JSONDecodeError: candidate=None
                if candidate and "actorNativeFrameComparisons" in candidate: typed=candidate; break
                chunks=[]; continue
        if typed: break
assert typed and typed["status"]=="matched" and typed["scripts"]==63 and typed["actions"]==2463
assert typed["nativeExecutions"]==63 and typed["nativeFrames"]==2463
assert typed["actorNativeFrameComparisons"]==4926 and typed["mismatches"]==0

m0=load(ROOT/"typed-composition/evidence/milestone0-preflight.json")
# Current full-runner stdout confirms the M0 pass; source documentation supplies the exact seed/receipt metadata.
assert m0["staticExecution"]["seed"]==20261030 and m0["staticExecution"]["cases"]==5000
assert m0["entries"]==24 and m0["expectedSHA256"]=="639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2"
assert sha(ROOT/"SHA256SUMS")==m0["receiptSHA256"]
assert sha(ROOT/"EXPECTED.json")==m0["expectedSHA256"]
rules_lines=(ROOT/"gobi/rules_test.go").read_text(encoding="utf-8").splitlines()
rules_start=next(i for i,line in enumerate(rules_lines) if "return []rule{" in line)
rules_end=next(i for i,line in enumerate(rules_lines[rules_start+1:],rules_start+1) if line.strip()=="}")
rules_count=sum(1 for line in rules_lines[rules_start:rules_end] if line.lstrip().startswith("{"))
assert rules_count==59
node_front=EXTRACTED/"compiled-frontend/artifacts/logs/node-tests.stdout.log"
node_method=ATTEMPT/"logs/method-owned-node-tests.stdout.log"
def tap_count(path):
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("# tests "): return int(line.split()[-1])
    return None
assert tap_count(node_front)==97 and tap_count(node_method)==10

result={"schema":"gobi.ci-primary-evidence-audit/v1","job_id":"E-CI-EVIDENCE","worker":"N3","outcome":"mixed_change","status":"all_current_head_workflows_and_primary_artifact_verified",
 "source":{"commit":SOURCE,"tree":TREE,"parent":publication["parent"],"publication_sha256":sha(DATE/"publication-current.json"),"publication_production_change":publication["productionChange"],
  "pull_request":identity["pull_request"],"current_worktree_head":subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip(),"current_worktree_tree":subprocess.check_output(["git","rev-parse","HEAD^{tree}"],cwd=ROOT,text=True).strip()},
 "current_workflow_matrix":{"snapshot_path":str(snap_path.relative_to(DATE)),"snapshot_sha256":sha(snap_path),"captured_at":snapshot["capturedAt"],"total":26,"completed":26,"success":26,"failure":0,"events":{"pull_request":13,"push":13},"all_heads_equal_source":True,"all_run_ids_match_initial":True,"logs_manifest_path":"lanes/evidence/log-manifest-6b49cc0.json","logs_manifest_sha256":sha(LANE/"log-manifest-6b49cc0.json"),"decoded_logs":14},
 "primary_artifact":{"run_id":retention["run"],"job_id":retention["job"],"artifact_id":retention["artifactId"],"workflow_outcome":retention["workflowOutcome"],"zip_path":"original.zip","zip_bytes":zip_path.stat().st_size,"zip_sha256":sha(zip_path),"zip_integrity":"passed","members":len(members),"uncompressed_bytes":sum(i.file_size for i in members),"retention_entries":len(manifest),"member_hash_mismatches":member_bad,"retention_sha256":sha(DATE/"artifact-retention.json"),"attempt_path":"compiled-methods/artifacts/attempts/attempt-20261031T044100445Z","execution_status":method["status"],"execution_mode":method["mode"],"execution_started":method["startedAt"],"execution_finished":method["finishedAt"],"execution_commands":len(method["commands"]),"all_command_exit_codes_zero":True,"execution_source_pins":len(method["sourceBefore"]),"execution_source_pins_match_checkout":True,"matrix_combined_input_pins":len(method_run["sourcePinsBefore"]),"matrix_checkout_source_pins":method_source_audit["count"],"matrix_checkout_source_pins_match":True,"matrix_build_input_pins":method_build_audit["count"],"matrix_build_input_pins_match_extracted_artifact":True,"matrix_output_pins":len(method_run["outputPinsBeforeCheck"]),"matrix_output_artifact_pins":method_outputs["count"],"matrix_output_checkout_pins":method_output_source_audit["count"],"matrix_output_pins_match_extracted_artifact_and_checkout":True,"matrix_output_stable_through_check":True,
  "method_matrix":{"status":method_run["status"],"ticks":method_check["ticks"],"actions":method_check["actions"],"suppressed_actions":method_check["suppressedActions"],"swaps":method_check["swaps"],"value_semantics_checks":method_check["valueSemanticsChecks"],"mutation_controls_detected":method_check["mutationControls"]["detected"],"browser_profiles":method_run["summary"]["browserProfiles"],"native_sha256":sha(ATTEMPT/"matrix/methods.native.json"),"direct_sha256":sha(ATTEMPT/"matrix/methods.direct.json"),"browser_sha256":sha(ATTEMPT/"matrix/methods.browser.json")}},
 "inherited_ci_counts":{"compiled_frontend":{"status":front["status"],"commands":len(front["commands"]),"apps":len(front["apps"]),"matched_apps":sum(a["status"]=="matched" for a in front["apps"]),"node_tests":tap_count(node_front)},"compiled_backends":{"status":back["status"],"commands":len(back["commands"]),"matched_apps":len(back["backendConformance"])},"compiled_methods":{"status":method["status"],"commands":len(method["commands"]),"method_owned_node_tests":tap_count(node_method)},"typed_composition":{"source_pinned_command":"COMPOSITION_REPLAY_BIN=... node typed-composition/check.mjs --seeds 20261030,20261031 --cases 30 --max-actions 40 --output .../report.json","seeds":[20261030,20261031],"cases_per_seed":30,"max_actions":40,"status":typed["status"],"scripts":typed["scripts"],"actions":typed["actions"],"native_executions":typed["nativeExecutions"],"native_frames":typed["nativeFrames"],"actor_native_frame_comparisons":typed["actorNativeFrameComparisons"],"mismatches":typed["mismatches"],"ci_stdout_sha256":sha(backlog),"seed_source_path":"run-typed-composition.sh","seed_source_sha256":sha(ROOT/"run-typed-composition.sh"),"summary_report_not_in_primary_zip":True},"m0":{"ci_log_result_lines":["same over 5000 inputs","receipt matches","SHA256SUMS ok"],"seed":m0["staticExecution"]["seed"],"cases":m0["staticExecution"]["cases"],"sha256sum_entries":m0["entries"],"checksum_manifest_sha256":m0["receiptSHA256"],"expected_json_sha256":m0["expectedSHA256"],"m0_metadata_path":"typed-composition/evidence/milestone0-preflight.json","m0_metadata_is_checkout_not_primary_zip":True,"rule_rows":rules_count,"rule_table_path":"gobi/rules_test.go","rule_table_sha256":sha(ROOT/"gobi/rules_test.go"),"run_script_sha256":sha(ROOT/"run.sh"),"command":"go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json"}},
 "versions":method["versions"],"execution_lane_summaries":exec_records,
 "historical_8ed":{"source":"8ed5b66a223de1992756516f8d3895c6e096f842","workflow_counts":{"total":26,"success":24,"failure":2},"primary_failure_archive_audit":"lanes/evidence/old-head-artifact-audit.json","current_acceptance_uses_old_head":False},
 "limitations":["Current-head acceptance is scoped to the published source commit and primary CI artifact; it does not imply PR merge or release.","Typed-composition exact seeds are taken from the source-pinned runner command; the primary ZIP contains the inherited stdout summary but not the typed-composition report JSON itself.","The old 8ed failures remain historical and are not counted as current-head failures or passes."]}
(DATE/"lanes/evidence/primary-artifact-audit-6b49cc0.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"status":result["status"],"workflow_counts":result["current_workflow_matrix"],"artifact":result["primary_artifact"],"inherited":result["inherited_ci_counts"]},indent=2))
