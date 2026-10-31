#!/usr/bin/env python3
"""Independently verify a local post-repair supplement, its chunks and restores."""
from __future__ import annotations
import gzip, hashlib, json, shutil, stat, sys, tarfile, tempfile
from pathlib import Path, PurePosixPath

ROOT=Path(__file__).resolve().parents[5]
CUSTODY=Path(__file__).resolve().parent
MANIFEST=Path(sys.argv[1]) if len(sys.argv)>1 else CUSTODY/"manifest.json"

def hash_stream(stream):
 h=hashlib.sha256(); n=0
 while block:=stream.read(1024*1024): n+=len(block); h.update(block)
 return n,h.hexdigest()
def hash_file(path):
 with path.open("rb") as f: return hash_stream(f)
def safe_name(name):
 p=PurePosixPath(name)
 if p.is_absolute() or not p.parts or ".." in p.parts or "\\" in name: raise AssertionError(f"unsafe path: {name}")
 return p

def verify():
 m=json.loads(MANIFEST.read_text(encoding="utf-8"))
 assert m["schema"]=="gobi.compiled-capability-local-postrepair-supplement/v1"
 assert m["localLineage"]["classification"].startswith("local focused historical trace")
 assert m["localLineage"]["hostedRunArtifact"]["included"] is False
 assert m["localLineage"]["localFullSession45031"]["included"] is False
 a=m["archive"]; chunks=m["chunking"]["chunks"]; rows=m["members"]
 direct_archive=CUSTODY/a["path"]
 direct_size,direct_sha=hash_file(direct_archive)
 assert (direct_size,direct_sha)==(a["bytes"],a["sha256"]),"direct archive differs from manifest"
 with gzip.open(direct_archive,"rb") as direct_stream:
  while direct_stream.read(1024*1024): pass
 expected={row["path"]:row for row in rows}
 assert len(expected)==len(rows) and list(expected)==sorted(expected)
 assert rows and chunks
 with tempfile.TemporaryDirectory(prefix="gobi-local-postrepair-custody-") as tmp:
  tmp=Path(tmp); rebuilt=tmp/"reassembled.tar.gz"; restored=tmp/"restore"; restored.mkdir()
  offset=0
  with rebuilt.open("xb") as out:
   for index,c in enumerate(chunks,1):
    assert c["index"]==index and c["offset"]==offset
    assert 0<int(c["bytes"])<=m["chunking"]["chunkBytesMaximum"]
    p=safe_name(c["path"])
    source=CUSTODY.joinpath(*p.parts)
    size,digest=hash_file(source)
    assert (size,digest)==(c["bytes"],c["sha256"]),f"chunk mismatch: {c['path']}"
    with source.open("rb") as f: shutil.copyfileobj(f,out)
    offset+=size
  archive_size,archive_sha=hash_file(rebuilt)
  assert (archive_size,archive_sha)==(a["bytes"],a["sha256"]),"chunk reassembly differs from archive catalog"
  with rebuilt.open("rb") as f:
   header=f.read(10)
  assert int.from_bytes(header[4:8],"little")==0,"gzip timestamp must be zero"
  if len(header)>=10 and header[3]&0x08: raise AssertionError("gzip FNAME field must be empty")
  seen=[]
  with tarfile.open(rebuilt,mode="r:gz") as tar:
   for member in tar.getmembers():
    rel=safe_name(member.name)
    if not member.isfile(): raise AssertionError(f"non-regular tar member: {member.name}")
    if member.name in seen: raise AssertionError(f"duplicate tar member: {member.name}")
    row=expected.get(member.name)
    if row is None: raise AssertionError(f"uncataloged member: {member.name}")
    stream=tar.extractfile(member)
    if stream is None: raise AssertionError(f"unreadable member: {member.name}")
    size,digest=hash_stream(stream)
    if (size,digest)!=(row["bytes"],row["sha256"]): raise AssertionError(f"member hash/size differs: {member.name}")
    target=restored.joinpath(*rel.parts); target.parent.mkdir(parents=True,exist_ok=True)
    with tar.extractfile(member) as source,target.open("xb") as out: shutil.copyfileobj(source,out)
    target.chmod(int(row["mode_octal"],8))
    if hash_file(target)!=(row["bytes"],row["sha256"]): raise AssertionError(f"restore mismatch: {member.name}")
    seen.append(member.name)
  if seen!=sorted(expected): raise AssertionError("tar member set/order differs from catalog")
  for rel,row in expected.items():
   source=ROOT.joinpath(*safe_name(rel).parts)
   if not source.is_file() or source.is_symlink(): raise AssertionError(f"source input missing or changed type: {rel}")
   if hash_file(source)!=(row["bytes"],row["sha256"]): raise AssertionError(f"source changed after freeze: {rel}")
 names=set(expected)
 for packet in m["selection"]["authorPacketIds"]:
  assert f"compiled-capabilities/coordination/reports/{packet}.md" in names
  assert f"compiled-capabilities/coordination/receipts/{packet}.json" in names
 for packet in m["selection"]["reviewPacketIds"]:
  receipt_rel=f"compiled-capabilities/coordination/receipts/{packet}.json"
  assert receipt_rel in names
  receipt=json.loads((ROOT/receipt_rel).read_text(encoding="utf-8"))
  report_rel=receipt.get("reviewReport",{}).get("path",f"compiled-capabilities/coordination/reviews/{packet}.md")
  assert report_rel in names
 for name in names:
  assert "E-RESULT" not in name and "XR-RESULT" not in name
  assert "compiled-capabilities/coordination/state.json" not in name
  assert "/acceptance/custody/" not in name
  assert not any(f"/evidence/attempt-{i:02d}/" in name for i in (1,2,3))
  assert "/demo/evidence/attempt-00/" not in name
 assert not any("compiled-capabilities/ci/" in n for n in names)
 for attempt in ("attempt-04","attempt-05"):
  prefix=f"compiled-capabilities/conformance/evidence/{attempt}/"
  assert any(n.startswith(prefix) for n in names)
  assert prefix+"conformance.run.json" in names
 return {"status":"verified","classification":"local historical supplement only","memberCount":len(seen),"sourceBytes":sum(r["bytes"] for r in rows),"archiveBytes":archive_size,"archiveSha256":archive_sha,"chunksVerified":len(chunks),"membersHashVerifiedAndRestored":len(seen),"sourceMembersUnchanged":len(rows),"attempts":[{"attempt":x["attempt"],"status":x["status"],"lifecycleStatus":x["lifecycleStatus"],"capabilityCheckStatus":x["capabilityCheckStatus"]} for x in m["localLineage"]["attempts"]],"hostedFullAcceptanceClaim":False}
if __name__=="__main__": print(json.dumps(verify(),indent=2,sort_keys=True))
