#!/usr/bin/env python3
"""Verify and safely extract the one primary current-source Actions artifact."""
from __future__ import annotations
import hashlib,json,os,stat,zipfile,zlib
from pathlib import Path,PurePosixPath

ROOT=Path(__file__).resolve().parents[4]
PROVIDER=Path(__file__).resolve().parent
ZIP_PATH=PROVIDER/"primary-push-run-41190743932-artifact.zip"
EXTRACT=PROVIDER/"primary-push-run-41190743932-extracted"
INVENTORY=PROVIDER/"primary-push-run-41190743932-members.json"
EXPECTED_SIZE=76821513
EXPECTED_SHA256="40dd8c6fea08e9d7fec280e1a31b448ced0d56a2245834c074cb05bfba4353a8"
ARTIFACT_ID=13039351554
RUN_ID=41190743932
SOURCE_SHA="a2e1164d68abaaa7d028bdaf6a20bea842a131ae"
SOURCE_TREE="d22b75e18c7bea70a743cc79d53461b287c7d045"

def file_hash(path:Path)->tuple[int,str]:
 h=hashlib.sha256(); n=0
 with path.open("rb") as f:
  while b:=f.read(1024*1024): n+=len(b); h.update(b)
 return n,h.hexdigest()

def safe_parts(name:str,is_dir:bool)->tuple[str,...]:
 if not name or name.startswith("/") or "\\" in name or "\x00" in name: raise ValueError(f"unsafe ZIP path spelling: {name!r}")
 raw=name[:-1] if is_dir and name.endswith("/") else name
 p=PurePosixPath(raw)
 if p.is_absolute() or not p.parts or any(part in ("..",".") for part in p.parts) or ":" in p.parts[0]: raise ValueError(f"unsafe ZIP member path: {name!r}")
 if p.as_posix()!=raw: raise ValueError(f"non-canonical ZIP member path: {name!r}")
 return p.parts

def main()->None:
 if EXTRACT.exists() or INVENTORY.exists(): raise FileExistsError("preserve prior extraction/inventory; choose a versioned output")
 size,digest=file_hash(ZIP_PATH)
 if (size,digest)!=(EXPECTED_SIZE,EXPECTED_SHA256): raise AssertionError(f"provider ZIP size/hash mismatch: {size} {digest}")
 rows=[]; names=set(); total_uncompressed=0
 stage=PROVIDER/".primary-push-run-41190743932-staging"
 if stage.exists(): raise FileExistsError("preserve existing staging directory")
 stage.mkdir(mode=0o700)
 try:
  with zipfile.ZipFile(ZIP_PATH,"r") as zf:
   infos=zf.infolist()
   for info in infos:
    parts=safe_parts(info.filename,info.is_dir())
    canonical="/".join(parts)
    if canonical in names: raise ValueError(f"duplicate normalized ZIP path: {canonical}")
    names.add(canonical)
    if info.flag_bits & 1: raise ValueError(f"encrypted ZIP member is unsupported: {canonical}")
    mode=(info.external_attr>>16)&0xFFFF
    kind=stat.S_IFMT(mode)
    expected_kind=stat.S_IFDIR if info.is_dir() else stat.S_IFREG
    if kind not in (0,expected_kind): raise ValueError(f"unsupported ZIP member type for {canonical}: {oct(mode)}")
    target=stage.joinpath(*parts)
    if not target.resolve().is_relative_to(stage.resolve()): raise ValueError(f"ZIP path escaped extraction root: {canonical}")
    if info.is_dir():
     if info.file_size!=0 or info.CRC!=0: raise ValueError(f"directory ZIP member has payload bytes: {canonical}")
     target.mkdir(parents=True,exist_ok=True)
     row={"path":canonical+"/","type":"directory","bytes":0,"compressedBytes":info.compress_size,"crc32":f"{info.CRC:08x}","sha256":hashlib.sha256(b"").hexdigest(),"mode_octal":format(stat.S_IMODE(mode),"04o")}
    else:
     target.parent.mkdir(parents=True,exist_ok=True)
     h=hashlib.sha256(); crc=0; count=0
     with zf.open(info,"r") as src,target.open("xb") as out:
      while block:=src.read(1024*1024):
       count+=len(block); h.update(block); crc=zlib.crc32(block,crc); out.write(block)
     crc &= 0xFFFFFFFF
     if count!=info.file_size or crc!=info.CRC: raise AssertionError(f"ZIP member size/CRC mismatch: {canonical}")
     row={"path":canonical,"type":"regular file","bytes":count,"compressedBytes":info.compress_size,"crc32":f"{crc:08x}","sha256":h.hexdigest(),"mode_octal":format(stat.S_IMODE(mode),"04o")}
     total_uncompressed+=count
    rows.append(row)
  # Freeze extracted copies as read-only evidence after successful CRC and SHA checks.
  for p in stage.rglob("*"):
   if p.is_file(): p.chmod(0o444)
  for p in sorted((p for p in stage.rglob("*") if p.is_dir()),key=lambda p:len(p.parts),reverse=True): p.chmod(0o555)
  stage.chmod(0o555)
  os.rename(stage,EXTRACT)
 except Exception:
  # Preserve the ZIP and the failed staging tree for diagnosis.
  raise
 rows.sort(key=lambda r:r["path"])
 if len(rows)!=len(names): raise AssertionError("inventory row count differs from unique member paths")
 payload={"schema":"gobi.compiled-capabilities-provider-artifact-inventory/v1","classification":"FAILED-COHORT evidence; Actions conclusion is not milestone acceptance","source":{"repository":"samuelpmahan/gondola","workflowRunId":RUN_ID,"artifactId":ARTIFACT_ID,"commit":SOURCE_SHA,"tree":SOURCE_TREE,"event":"push"},"zip":{"path":ZIP_PATH.relative_to(ROOT).as_posix(),"bytes":size,"sha256":digest,"providerDigest":"sha256:"+EXPECTED_SHA256,"crcValidation":"all members streamed to EOF; CRC-32 and uncompressed length matched ZIP directory; Python ZipExtFile EOF CRC check active"},"extraction":{"path":EXTRACT.relative_to(ROOT).as_posix(),"filesReadOnly":True,"memberCount":len(rows),"uncompressedFileBytes":total_uncompressed},"members":rows}
 with INVENTORY.open("x",encoding="utf-8",newline="\n") as f: json.dump(payload,f,indent=2,sort_keys=True); f.write("\n")
 print(json.dumps({"status":"verified","zipBytes":size,"zipSha256":digest,"memberCount":len(rows),"uncompressedFileBytes":total_uncompressed,"extraction":payload["extraction"]["path"],"inventory":INVENTORY.relative_to(ROOT).as_posix()},indent=2))
if __name__=="__main__": main()
