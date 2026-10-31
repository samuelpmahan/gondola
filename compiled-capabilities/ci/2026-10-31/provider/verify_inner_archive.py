#!/usr/bin/env python3
"""Verify the E-BUILD receipt, pre-archive snapshot, payload manifest and inner tar."""
from __future__ import annotations
import gzip,hashlib,json,tarfile,tempfile,shutil
from pathlib import Path,PurePosixPath

ROOT=Path(__file__).resolve().parents[4]
PROVIDER=Path(__file__).resolve().parent
EXTRACT=PROVIDER/"primary-push-run-41190743932-extracted"
OUTPUT=PROVIDER/"primary-push-run-41190743932-inner-verification.json"


def hash_stream(stream):
 h=hashlib.sha256(); n=0
 while block:=stream.read(1024*1024): n+=len(block); h.update(block)
 return n,h.hexdigest()
def hash_file(path):
 with path.open("rb") as f: return hash_stream(f)
def safe_member(name):
 p=PurePosixPath(name)
 if p.is_absolute() or ".." in p.parts or "\\" in name or not p.parts: raise AssertionError(f"unsafe tar path: {name}")
 return p

def main():
 if OUTPUT.exists(): raise FileExistsError("preserve existing inner verification; use a numbered snapshot")
 receipt_path=EXTRACT/"compiled-capabilities/coordination/receipts/E-BUILD.json"
 report_path=EXTRACT/"compiled-capabilities/coordination/reports/E-BUILD.md"
 receipt=json.loads(receipt_path.read_text(encoding="utf-8"))
 expected_failure="fresh lifecycle receipt does not confirm the inherited full compiled-methods regression chain"
 assert receipt["status"]=="failed" and receipt["outcome"]=="mixed_change"
 assert len(receipt["failures"])==1 and receipt["failures"][0]["error"]==expected_failure
 assert receipt["sourceBefore"]==receipt["sourceAfter"] and receipt.get("sourcePinsMatch") is True
 run_rel=receipt["attempt"]
 run_root=EXTRACT.joinpath(*safe_member(run_rel).parts)
 pre_path=run_root/"execution-before-archive.json"
 final_path=run_root/"execution.json"
 manifest_path=run_root/"archive-manifest.json"
 pre=json.loads(pre_path.read_text(encoding="utf-8"))
 manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
 pre_bind=receipt["archive"]["executionSnapshot"]
 pre_size,pre_sha=hash_file(pre_path)
 assert (pre_size,pre_sha)==(pre_bind["bytes"],pre_bind["sha256"])
 assert pre["attempt"]==run_rel and pre["status"]=="archive_pending"
 assert pre["archivePending"] is True and pre["archiveStatus"]=="PENDING"
 assert pre["acceptanceStatus"]=="NOT_FINAL" and pre["finalAcceptance"] is False
 assert pre["sourceBefore"]==receipt["sourceBefore"]
 assert pre["preArchiveSourcePins"]==pre["sourceBefore"]
 assert pre["sourcePinsAtEndOfCommandsAndPreArchive"]==pre["sourceBefore"]
 manifest_bind=receipt["archive"]["manifest"]
 manifest_size,manifest_sha=hash_file(manifest_path)
 assert (manifest_size,manifest_sha)==(manifest_bind["bytes"],manifest_bind["sha256"])
 assert manifest["schema"]=="gobi.compiled-capabilities-archive/v1"
 expected_rows=manifest["members"]
 assert expected_rows==receipt["archive"]["members"]
 expected={x["path"]:x for x in expected_rows}
 assert len(expected)==len(expected_rows) and list(expected)==sorted(expected)
 archive_rel=receipt["archive"]["path"]
 archive_path=EXTRACT.joinpath(*safe_member(archive_rel).parts)
 archive_size,archive_sha=hash_file(archive_path)
 assert (archive_size,archive_sha)==(receipt["archive"]["bytes"],receipt["archive"]["sha256"])
 verified=[]; directory_entries=0
 with tarfile.open(archive_path,"r:gz") as tar:
  members=tar.getmembers(); names=[x.name for x in members]
  assert len(set(names))==len(names),"duplicate tar path"
  for member in members:
   safe_member(member.name)
   if member.isdir():
    assert member.size==0,f"directory tar member has data: {member.name}"
    directory_entries+=1
    continue
   assert member.isfile(),f"unsupported tar member type: {member.name}"
   stream=tar.extractfile(member)
   assert stream is not None
   size,digest=hash_stream(stream)
   row=expected[member.name]
   assert (size,digest)==(row["bytes"],row["sha256"]),f"member hash/size mismatch: {member.name}"
   verified.append(member.name)
  assert sorted(verified)==sorted(expected),"regular tar file set differs from payload manifest"
  assert len(verified)==receipt["archive"]["memberCount"]
 # Force gzip trailer/CRC validation through EOF.
 with gzip.open(archive_path,"rb") as stream:
  while stream.read(1024*1024): pass
 final_size,final_sha=hash_file(final_path)
 canonical_size,canonical_sha=hash_file(receipt_path)
 final_receipt_equal=(final_size==canonical_size and final_sha==canonical_sha)
 nested_path=run_root/"inherited/E-BUILD.json"
 nested=json.loads(nested_path.read_text(encoding="utf-8"))
 assert nested["status"]=="passed" and not nested.get("failures")
 lifecycle_path=EXTRACT/"compiled-lifecycle/coordination/receipts/E-BUILD.json"
 lifecycle=json.loads(lifecycle_path.read_text(encoding="utf-8"))
 assert lifecycle["status"]=="passed" and lifecycle.get("failures")==[]
 demo_relatives=["demo/demo-smoke.json","demo/demo.png","demo/site/demo-build.json","demo/site/demo.bundle.mjs","demo/site/demo.css","demo/site/entry.mjs","demo/site/index.html"]
 matrix_relatives=["matrix/capabilities.run.json","matrix/capabilities.capability-check.json","matrix/capabilities.capability.browser.capture.json","matrix/capabilities.lifecycle.run.json","matrix/capabilities.lifecycle.check.json","matrix/capabilities.lifecycle.native.json","matrix/capabilities.lifecycle.direct.json","matrix/capabilities.lifecycle.browser.json","matrix/capabilities.manifest.json","matrix/capabilities.lifecycle.manifest.json"]
 def key_row(rel):
  p=run_root/rel
  if not p.is_file(): raise FileNotFoundError(f"key evidence missing: {rel}")
  n,d=hash_file(p)
  return {"path":p.relative_to(EXTRACT).as_posix(),"bytes":n,"sha256":d}
 demo_rows=[key_row(x) for x in demo_relatives]
 matrix_rows=[key_row(x) for x in matrix_relatives]
 cap_check=json.loads((run_root/"matrix/capabilities.capability-check.json").read_text())
 matrix_run=json.loads((run_root/"matrix/capabilities.run.json").read_text())
 matrix_life=json.loads((run_root/"matrix/capabilities.lifecycle.run.json").read_text())
 outer_report=report_path.read_text(encoding="utf-8")
 result={"schema":"gobi.compiled-capabilities-primary-inner-custody/v1","classification":"FAILED-COHORT evidence; no acceptance inferred from successful Actions result","workflow":{"runId":41190743932,"event":"push","commit":"a2e1164d68abaaa7d028bdaf6a20bea842a131ae","tree":"d22b75e18c7bea70a743cc79d53461b287c7d045","actionsConclusion":"success","jobConclusion":"success"},"outerReceipt":{"path":receipt_path.relative_to(EXTRACT).as_posix(),"bytes":canonical_size,"sha256":canonical_sha,"status":receipt["status"],"outcome":receipt["outcome"],"attempt":run_rel,"sourceBeforeCount":len(receipt["sourceBefore"]),"sourceAfterCount":len(receipt["sourceAfter"]),"sourcePinsMatch":receipt.get("sourcePinsMatch"),"failures":receipt["failures"],"reportPath":report_path.relative_to(EXTRACT).as_posix(),"reportStatusLinePresent":"- Status: `failed`" in outer_report},"preArchiveSnapshot":{"path":pre_path.relative_to(EXTRACT).as_posix(),"bytes":pre_size,"sha256":pre_sha,"status":pre["status"],"archivePending":pre["archivePending"],"archiveStatus":pre["archiveStatus"],"acceptanceStatus":pre["acceptanceStatus"],"finalAcceptance":pre["finalAcceptance"],"sourcePinsMatch":pre.get("sourcePinsMatchBeforeArchive")},"payloadManifest":{"path":manifest_path.relative_to(EXTRACT).as_posix(),"bytes":manifest_size,"sha256":manifest_sha,"memberCount":len(expected_rows)},"innerArchive":{"path":archive_path.relative_to(EXTRACT).as_posix(),"bytes":archive_size,"sha256":archive_sha,"regularFileCount":len(verified),"directoryEntryCount":directory_entries,"tarEntryCount":len(verified)+directory_entries,"memberBytes":sum(row["bytes"] for row in expected_rows),"allMemberPathTypeSizeShaVerified":True,"gzipTrailerVerified":True},"attemptExecutionCopy":{"path":final_path.relative_to(EXTRACT).as_posix(),"bytes":final_size,"sha256":final_sha,"byteIdenticalToCanonicalReceipt":final_receipt_equal},"nestedLifecycle":{"path":nested_path.relative_to(EXTRACT).as_posix(),"status":nested["status"],"failures":nested.get("failures"),"summary":nested.get("summary"),"canonicalPath":lifecycle_path.relative_to(EXTRACT).as_posix(),"canonicalStatus":lifecycle["status"],"canonicalFailures":lifecycle.get("failures")},"matrix":{"capabilityCheckStatus":cap_check.get("status"),"capabilityRunStatus":matrix_run.get("status"),"lifecycleRunStatus":matrix_life.get("status"),"evidenceFiles":matrix_rows},"demo":{"evidenceFiles":demo_rows},"causalReading":"The full capability receipt is failed because the inherited lifecycle gate reported the exact error above; the nested lifecycle receipt is passed and the capability stages are recorded separately in the full receipt. The Actions conclusion alone is not an acceptance result."}
 with OUTPUT.open("x",encoding="utf-8",newline="\n") as f: json.dump(result,f,indent=2,sort_keys=True); f.write("\n")
 print(json.dumps({"status":"verified_failed_cohort","outerReceiptStatus":receipt["status"],"outerFailures":receipt["failures"],"nestedLifecycleStatus":nested["status"],"nestedLifecycleFailures":nested.get("failures"),"innerArchiveMembersVerified":len(verified),"innerArchiveSha256":archive_sha,"preArchiveSnapshotSha256":pre_sha,"manifestSha256":manifest_sha,"demoFileCount":len(demo_rows),"matrixFileCount":len(matrix_rows),"report":OUTPUT.relative_to(ROOT).as_posix()},indent=2))
if __name__=="__main__": main()
