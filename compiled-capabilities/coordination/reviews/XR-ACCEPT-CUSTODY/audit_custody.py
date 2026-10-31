#!/usr/bin/env python3
"""Read-only independent consistency audit for E-ACCEPT-CUSTODY."""
from __future__ import annotations
import gzip, hashlib, json, pathlib, stat, tarfile, zipfile
from collections import Counter
from pathlib import PurePosixPath

ROOT = pathlib.Path(__file__).resolve().parents[4]
PROVIDER = ROOT / "compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider"
REVIEW = pathlib.Path(__file__).resolve().parent
RECEIPT_PATH = ROOT / "compiled-capabilities/coordination/receipts/E-ACCEPT-CUSTODY.json"
REPORT_PATH = ROOT / "compiled-capabilities/coordination/reports/E-ACCEPT-CUSTODY.md"
EXPECTED_SOURCE = "60b5aeff3172837ad7831c2b78b210454a3d81a2"
EXPECTED_TREE = "cc3a129b4372d00d5168135aa2e5687dfbf6788f"
EXPECTED_PARENT = "a2e1164d68abaaa7d028bdaf6a20bea842a131ae"
EXPECTED_ARCHIVE_SHA = "ba17805387c8204ef2624caec0af35641771bc8af48d4f03b82c1a6609586d8f"

checks = []
findings = []
def sha(path: pathlib.Path):
    h=hashlib.sha256(); n=0
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):
            h.update(b); n+=len(b)
    return n,h.hexdigest()
def check(name, ok, detail):
    if not ok: raise AssertionError(f"{name}: {detail}")
    checks.append({"check":name,"status":"passed","detail":detail})
def readj(path): return json.loads(path.read_bytes())

receipt=readj(RECEIPT_PATH)
check("review target identity", receipt.get("job_id")=="E-ACCEPT-CUSTODY" and receipt.get("worker")=="N4" and receipt.get("outcome")=="mixed_change", "current N4 extraction packet is the corrected mixed_change receipt")
orig=ROOT/"compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/rejected-receipt-original-E-ACCEPT-CUSTODY.json"
old=readj(orig)
a=old.copy(); b=receipt.copy(); a.pop("outcome",None); b.pop("outcome",None)
check("outcome-only receipt correction", a==b and old.get("outcome")!=receipt.get("outcome"), f"preserved original={old.get('outcome')!r}, current={receipt.get('outcome')!r}; all other JSON fields identical")
report_ref=receipt["report"]
report_size,report_hash=sha(REPORT_PATH)
check("author report binding", (report_size,report_hash)==(REPORT_PATH.stat().st_size,report_ref["sha256"]), f"report bytes={report_size}, sha256={report_hash}")

# Exact-source terminal catalog, embedded per-run jobs, and raw provider run list.
catinfo=receipt["hostedCI"]["terminalCatalog"]
catpath=ROOT/catinfo["path"]
catbytes,catsha=sha(catpath); catalog=readj(catpath)
check("terminal catalog identity", (catbytes,catsha)==(catinfo["bytes"],catinfo["sha256"]), f"{catbytes} bytes sha256={catsha}")
check("terminal catalog source and complete cohort", catalog["source"]=={"commit":EXPECTED_SOURCE,"tree":EXPECTED_TREE,"parent":EXPECTED_PARENT,"pullRequest":15,"syntheticMerge":"07fc827212889af17524eadfe8c5c9da75d26850"} and catalog["runCount"]==30 and catalog["jobCount"]==30 and catalog["allRunsTerminal"] and catalog["allRunsConcludedSuccess"] and catalog["allJobsConcludedSuccess"] and catalog["allRunHeadShasMatchSource"], "30 terminal-success workflows and jobs all source-bound")
check("terminal event distribution", catalog["eventCounts"]=={"push":15,"pull_request":15} and catalog["runStatusCounts"]=={"completed:success":30} and catalog["jobStatusCounts"]=={"completed:success":30}, "15 push plus 15 pull_request; all run/job statuses completed:success")
rawinfo=catinfo["rawRunList"]; rawpath=ROOT/rawinfo["path"]; rawbytes,rawsha=sha(rawpath); rawruns=readj(rawpath)
check("raw run-list bytes", (rawbytes,rawsha)==(rawinfo["bytes"],rawinfo["sha256"]), f"{rawbytes} bytes sha256={rawsha}")
check("catalog job snapshots", len(catalog["runs"])==30 and len({r["id"] for r in catalog["runs"]})==30, "catalog has 30 unique run records")
job_total=0; job_ids=[]
for run in catalog["runs"]:
    check(f"run {run['id']} source status", run["headSha"]==EXPECTED_SOURCE and run["status"]=="completed" and run["conclusion"]=="success", "source head and terminal conclusion match")
    ji=run["jobSnapshot"]; jp=ROOT/ji["path"]; jb,jh=sha(jp); jobs=readj(jp)
    check(f"run {run['id']} job API snapshot", (jb,jh)==(ji["bytes"],ji["sha256"]) and ji["jobCount"]==len(jobs["jobs"]), f"{jb} bytes sha256={jh}, {len(jobs['jobs'])} job(s)")
    check(f"run {run['id']} all jobs successful", all(j["run_id"]==run["id"] and j["status"]=="completed" and j["conclusion"]=="success" and all(s["status"]=="completed" and s["conclusion"]=="success" for s in j["steps"]) for j in jobs["jobs"]), "every recorded job and step completed-success")
    job_total += len(jobs["jobs"]); job_ids.extend(j["id"] for j in jobs["jobs"])
check("job snapshot total", job_total==30 and len(set(job_ids))==30, "30 distinct jobs verified from exact per-run response bytes")
check("raw list run identity", isinstance(rawruns,dict) and len(rawruns["workflow_runs"])==30 and {r["id"] for r in rawruns["workflow_runs"]}=={r["id"] for r in catalog["runs"]}, "raw provider run list reconciles to final catalog run IDs")

# Primary ZIP identity and existing exhaustive ZIP verifier record.
art=receipt["primaryArtifact"]; zipp=ROOT/art["savedZip"]["path"]; zipbytes,zipsha=sha(zipp)
check("provider ZIP bytes and digest", (zipbytes,zipsha)==(art["savedZip"]["bytes"],art["savedZip"]["sha256"]) and zipsha==art["providerSha256"], f"{zipbytes} bytes sha256={zipsha}")
with zipfile.ZipFile(zipp) as zf:
    infos=zf.infolist(); names=[i.filename for i in infos]
    check("outer ZIP count and path safety", len(infos)==art["outerVerification"]["zipMemberCount"] and len(set(names))==len(names) and all(n and not n.startswith('/') and '\\' not in n and '..' not in PurePosixPath(n).parts and stat.S_IFMT(i.external_attr>>16) in (0,stat.S_IFREG,stat.S_IFDIR) for i,n in zip(infos,names)), f"{len(infos)} unique safe regular/directory ZIP members")
    bad=zf.testzip()
    check("outer ZIP CRC stream", bad is None, "ZipFile.testzip found no corrupt member")
outerp=ROOT/art["outerVerification"]["path"]; outer=readj(outerp); outer_bytes,outer_sha=sha(outerp)
check("outer verification record", outer_sha==art["outerVerification"]["sha256"] and outer_bytes>0 and outer["zip_member_count"]==1476 and outer["all_members_crc_and_sha_verified"] and outer["safe_paths_and_regular_types_only"], f"verification record sha256={outer_sha}; {outer['zip_member_count']} members")

# E-BUILD receipt, manifest, immutable snapshot, and full tar byte-level member verification.
extracted=ROOT/art["extractedPath"]
ebuildp=extracted/"compiled-capabilities/coordination/receipts/E-BUILD.json"; eb=readj(ebuildp)
check("embedded E-BUILD receipt", eb["job_id"]=="E-BUILD" and eb["worker"]=="N6" and eb["mode"]=="full" and eb["status"]=="passed" and not eb["failures"] and eb["sourcePinsMatch"] and len(eb["sourceBefore"])==163, "full passed execution, zero failures, exact stable 163-file source pins")
arc=eb["archive"]; tarpath=extracted/arc["path"]; tarbytes,tarsha=sha(tarpath)
check("inner archive receipt binding", (tarbytes,tarsha)==(arc["bytes"],arc["sha256"]) and tarsha==EXPECTED_ARCHIVE_SHA, f"{tarbytes} bytes sha256={tarsha}")
manpath=extracted/arc["manifest"]["path"]; manbytes,mansha=sha(manpath); manifest=readj(manpath)
check("manifest binding and count", (manbytes,mansha)==(arc["manifest"]["bytes"],arc["manifest"]["sha256"]) and manifest["members"]==arc["members"] and len(manifest["members"])==189, f"{len(manifest['members'])} manifest file members, sha256={mansha}")
snapinfo=arc["executionSnapshot"]; snappath=extracted/snapinfo["path"]; snapbytes,snapsha=sha(snappath); snapshot=readj(snappath)
check("immutable pending snapshot bytes and state", (snapbytes,snapsha)==(snapinfo["bytes"],snapinfo["sha256"]) and snapshot.get("status")=="archive_pending" and snapshot.get("archivePending") is True and snapshot.get("finalAcceptance") is False, "pre-archive snapshot identity matches; pending/nonfinal state is intentional")
check("outer receipt binds final archive", eb["archive"]["roundTripVerified"] and eb["archive"]["sourceAfterMatchesSourceBefore"] and eb["archive"]["sourceAfterMatchesPreArchiveSnapshot"] and eb["sourceBefore"]==eb["sourceAfter"]==eb["archive"]["sourcePinsAtPreArchive"], "final receipt binds archive and all source pin snapshots agree")
expected={m["path"]:m for m in manifest["members"]}; observed={}; dirs=[]
with gzip.open(tarpath,'rb') as g:
    while g.read(1024*1024): pass
with tarfile.open(tarpath,'r:gz') as tf:
    for m in tf.getmembers():
        name=m.name.rstrip('/'); p=PurePosixPath(name)
        check("tar safe member path", bool(name) and not name.startswith('/') and '\\' not in name and all(x not in ('','.', '..') for x in p.parts) and ':' not in p.parts[0], repr(m.name))
        if m.isdir(): dirs.append(name); continue
        check("tar member type", m.isfile(), f"{name} is regular file")
        check("tar unique manifest member", name in expected and name not in observed, name)
        stream=tf.extractfile(m); h=hashlib.sha256(); n=0
        for block in iter(lambda:stream.read(1024*1024),b''): h.update(block); n+=len(block)
        observed[name]={'bytes':n,'sha256':h.hexdigest()}
        check("tar member size and hash", (n,h.hexdigest())==(expected[name]['bytes'],expected[name]['sha256']), name)
check("tar exact manifest inventory", len(observed)==189 and set(observed)==set(expected) and len(dirs)==61, f"{len(observed)} regular files, {len(dirs)} directories")

# Corrected durable delivery: exact index, all 15 chunks, canonical records and reconstruction.
delinfo=receipt["durableDelivery"]; delpath=ROOT/delinfo["deliveryIndexPath"]; db,dsha=sha(delpath); delivery=readj(delpath)
check("delivery index binding", dsha==delinfo["deliveryIndexSha256"] and db==5330, f"{db} bytes sha256={dsha}")
h=hashlib.sha256(); total=0
for c in delivery["chunks"]:
    cp=ROOT/c["path"]; cb,ch=sha(cp); check(f"delivery chunk {c['path']}",(cb,ch)==(c["bytes"],c["sha256"]),f"{cb} bytes sha256={ch}")
    with cp.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): h.update(block); total+=len(block)
check("delivery chunk count and reconstruction", len(delivery["chunks"])==15 and total==14960460 and h.hexdigest()==EXPECTED_ARCHIVE_SHA and delivery["archive"]["sha256"]==EXPECTED_ARCHIVE_SHA, f"15 chunks reconstruct {total} bytes sha256={h.hexdigest()}")
for rec in delivery["records"]:
    rp=ROOT/rec["path"]; rb,rh=sha(rp); check(f"delivery record {rec['path']}",(rb,rh)==(rec["bytes"],rec["sha256"]),f"{rb} bytes sha256={rh}")

# Failed local archive and malformed first attempts remain excluded evidence.
local=receipt["separateLocalArchive"]; localroot=ROOT/"compiled-capabilities/builds/attempts"/local["attempt"]; localtar=localroot/"capabilities-artifacts.tar.gz"; lb,lh=sha(localtar)
check("local archive rejection preserved", local["containerStatus"]=="rejected" and local["cause"]=="unknown" and local["originalReceiptAndArchiveChanged"] is False and (lb,lh)==(local["actualBytes"],local["actualSha256"]) and lb!=local["receiptClaimedBytes"], f"actual {lb} bytes sha256={lh}; receipt claimed {local['receiptClaimedBytes']} bytes; cause unknown")
mal=receipt["catalogWriterAndSnapshotNotes"]["malformedPreservedCatalog"]; mp=ROOT/mal["path"]; mb,mh=sha(mp); malformed=mp.read_bytes()
check("malformed catalog excluded", (mb,mh)==(mal["bytes"],mal["sha256"]) and mb==25822 and malformed.endswith(b'\\n'), f"preserved malformed JSON bytes={mb} sha256={mh}; not used as final catalog")
try: json.loads(malformed); parsed=False
except json.JSONDecodeError: parsed=True
check("malformed catalog parse failure", parsed, "json.loads rejects the two-character literal backslash-n suffix")
first=receipt["catalogWriterAndSnapshotNotes"]["firstWriterFailurePreserved"]
firstp=ROOT/"compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/source-60b5aef-terminal-runs-jobs-20261031T111444Z.json"
fb,fh=sha(firstp)
check("zero-byte writer attempt excluded", fb==0 and fh==hashlib.sha256(b'').hexdigest() and fb==first["bytes"], f"actual preserved zero-byte failed writer is not the corrected catalog: {firstp.relative_to(ROOT)}")
if first["path"] != firstp.relative_to(ROOT).as_posix():
    findings.append({"severity":"amend","claim":"catalogWriterAndSnapshotNotes.firstWriterFailurePreserved.path","receiptPath":first["path"],"observedPath":firstp.relative_to(ROOT).as_posix(),"detail":"Receipt names a non-existent path with an extra f in the source prefix; the preserved zero-byte failed writer file exists at the observed seven-character-prefix path."})
corrected=catpath
check("corrected catalog distinct from failures", corrected!=mp and corrected!=firstp and catsha=="b69f432f53e8d4ff85ae0d855bbfabec35f76febb4830853d313cb0a8b2d9bfc", "valid final catalog is the separate v2 path")

result={"schema":"gobi.xr-accept-custody-audit/v1","reviewer":"N5","subject":"E-ACCEPT-CUSTODY","source":EXPECTED_SOURCE,"tree":EXPECTED_TREE,"checks":checks,"checkCount":len(checks),"findings":findings,"status":"amend" if findings else "accepted","limitations":["Read-only custody review; no provider download, build, browser smoke, or full suite was repeated.","The local archive remains rejected with cause unknown.","This review covers hosted source-bound artifact custody only and does not close the overall milestone."]}
out=REVIEW/"audit.json"; out.write_text(json.dumps(result,indent=2)+"\n")
print(json.dumps({"status":result["status"],"checkCount":result["checkCount"],"output":str(out)},sort_keys=True))
