#!/usr/bin/env python3
"""Rebuild a source-bound GitHub run/job catalog from frozen raw API responses."""
from __future__ import annotations
import hashlib,json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
PROVIDER=Path(__file__).resolve().parent
RAW=PROVIDER/"raw-api-snapshot.json"
OUTPUT=PROVIDER/"source-run-catalog-snapshot-1008Z.json"
SOURCE_SHA="a2e1164d68abaaa7d028bdaf6a20bea842a131ae"

def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def main():
    if OUTPUT.exists(): raise FileExistsError(f"preserve existing snapshot: {OUTPUT.name}")
    envelope=json.loads(RAW.read_text(encoding="utf-8"))
    list_raw=envelope["list_raw"]; listing=json.loads(list_raw)
    runs=listing["workflow_runs"]
    if listing.get("total_count")!=30 or len(runs)!=30: raise ValueError("source run list is not the expected 30-record page")
    if any(r.get("head_sha")!=SOURCE_SHA or r.get("event") not in ("push","pull_request") for r in runs): raise ValueError("run list contains a different source or event")
    normalized=[]
    raw_hashes={}
    for r in runs:
        raw=envelope["jobs_raw"][str(r["id"])]
        raw_hashes[str(r["id"])]=sha(raw.encode("utf-8"))
        jobs_doc=json.loads(raw)
        jobs=jobs_doc.get("jobs",[])
        normalized.append({"id":r["id"],"event":r["event"],"name":r["name"],"workflow_id":r["workflow_id"],"status":r["status"],"conclusion":r.get("conclusion"),"run_attempt":r.get("run_attempt"),"head_sha":r["head_sha"],"head_branch":r["head_branch"],"created_at":r["created_at"],"updated_at":r["updated_at"],"pull_request_numbers":[p["number"] for p in r.get("pull_requests",[])],"jobs":[{"id":j["id"],"name":j["name"],"status":j["status"],"conclusion":j.get("conclusion"),"started_at":j.get("started_at"),"completed_at":j.get("completed_at"),"steps":[{"name":s["name"],"status":s["status"],"conclusion":s.get("conclusion")} for s in j.get("steps",[])]} for j in jobs]})
    normalized.sort(key=lambda r:(r["event"],r["name"],r["id"]))
    counts={"total":len(normalized),"push":sum(r["event"]=="push" for r in normalized),"pull_request":sum(r["event"]=="pull_request" for r in normalized),"runs_by_status":{status:sum(r["status"]==status for r in normalized) for status in sorted({r["status"] for r in normalized})},"jobs":sum(len(r["jobs"]) for r in normalized),"runs_without_jobs":[r["id"] for r in normalized if not r["jobs"]]}
    if counts["push"]!=15 or counts["pull_request"]!=15 or counts["jobs"]!=30 or counts["runs_without_jobs"]: raise ValueError(f"unexpected cohort shape: {counts}")
    raw_bytes=RAW.read_bytes()
    malformed=PROVIDER/"current-source-runs-41190743932.json"
    catalog={"schema":"gobi.compiled-capabilities-provider-run-catalog/v1","retrievedAt":"2026-10-31T10:08Z","retrievalTimePrecision":"minute only; this is the original 10:08 UTC batch snapshot","repository":"samuelpmahan/gondola","source":{"commit":SOURCE_SHA,"tree":"d22b75e18c7bea70a743cc79d53461b287c7d045","parent":"00da54ad0f5a4006b13a5cded18ce291845978bc","pullRequest":15},"api":{"runListEndpoint":"GET /repos/samuelpmahan/gondola/actions/runs?head_sha=<commit>&per_page=100","rawSnapshotPath":RAW.relative_to(ROOT).as_posix(),"rawSnapshotBytes":len(raw_bytes),"rawSnapshotSha256":sha(raw_bytes),"rawRunListResponseSha256":sha(list_raw.encode("utf-8")),"rawJobResponsesSha256ByRun":raw_hashes},"counts":counts,"runs":normalized,"artifactPolicy":{"primaryPushRunId":41190743932,"primaryPrRunId":41190759391,"downloadOnlyPrimaryPushArtifact":True,"artifactAvailableAtThisSnapshot":False,"acceptanceRule":"Inspect the actual E-BUILD receipt and verified archive; do not infer milestone acceptance from Actions conclusion."},"knownCohortRisk":{"source":"root current-source local full-run inspection","status":"failed receipt despite shell exit 0","detail":"E-BUILD.status was failed due to an outer prose-phrase match while the nested lifecycle receipt passed and capability stages passed; retain provider artifact as FAILED-COHORT evidence if it reproduces."},"preservedMalformedAttempt":{"path":malformed.relative_to(ROOT).as_posix(),"sha256":sha(malformed.read_bytes()) if malformed.exists() else None,"reason":"the earlier normalizer appended a literal backslash-n after JSON; this snapshot is a new corrected file and does not overwrite it."}}
    with OUTPUT.open("x",encoding="utf-8",newline="\n") as f: json.dump(catalog,f,indent=2,sort_keys=True); f.write("\n")
    print(json.dumps({"output":OUTPUT.relative_to(ROOT).as_posix(),"counts":counts,"rawSnapshotSha256":catalog["api"]["rawSnapshotSha256"],"rawRunListResponseSha256":catalog["api"]["rawRunListResponseSha256"],"sha256ByJobResponses":len(raw_hashes),"malformedCatalogPreserved":catalog["preservedMalformedAttempt"]},indent=2))
if __name__=="__main__": main()
