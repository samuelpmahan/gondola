#!/usr/bin/env python3
"""Freeze local post-repair capability attempts and closed fix packets."""
from __future__ import annotations
import gzip, hashlib, json, os, shutil, stat, subprocess, tarfile, tempfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[5]
CUSTODY = Path(__file__).resolve().parent
ARCHIVE = CUSTODY / "postrepair-local-supplement.tar.gz"
CHUNKS = CUSTODY / "chunks"
MANIFEST = CUSTODY / "manifest.json"
CHUNK_BYTES = 1024 * 1024
E_PACKETS = ["E-FIX-ARCHIVE-AUDIT", "E-FIX-BUILD", "E-FIX-GO", "E-FIX-HARNESS", "E-FIX-SCHEDULER", "E-FIX-STARTUP"]
XR_PACKETS = ["XR-FIX-ARCHIVE-AUDIT", "XR-FIX-BUILD", "XR-FIX-GO", "XR-FIX-HARNESS", "XR-FIX-SCHEDULER", "XR-FIX-STARTUP"]


def sha_file(path: Path) -> tuple[int, str]:
    h = hashlib.sha256(); size = 0
    with path.open("rb") as f:
        while block := f.read(1024 * 1024): size += len(block); h.update(block)
    return size, h.hexdigest()


def add_tree(paths: set[Path], directory: Path) -> None:
    if not directory.is_dir(): raise FileNotFoundError(f"required directory missing: {directory.relative_to(ROOT)}")
    for path in directory.rglob("*"):
        if path.is_dir() and not path.is_symlink(): continue
        paths.add(path)


def selected_paths() -> list[Path]:
    paths: set[Path] = set()
    for name in ("attempt-04", "attempt-05"):
        add_tree(paths, ROOT / "compiled-capabilities/conformance/evidence" / name)
    for packet in E_PACKETS:
        for p in (ROOT / "compiled-capabilities/coordination/reports" / f"{packet}.md",
                  ROOT / "compiled-capabilities/coordination/receipts" / f"{packet}.json"):
            if not p.is_file(): raise FileNotFoundError(f"required author packet file missing: {p.relative_to(ROOT)}")
            paths.add(p)
        author_dir = ROOT / "compiled-capabilities/coordination/reviews" / packet
        if author_dir.exists(): add_tree(paths, author_dir)
    for packet in XR_PACKETS:
        receipt = ROOT / "compiled-capabilities/coordination/receipts" / f"{packet}.json"
        if not receipt.is_file(): raise FileNotFoundError(f"required review receipt missing: {receipt.relative_to(ROOT)}")
        paths.add(receipt)
        root_report = ROOT / "compiled-capabilities/coordination/reviews" / f"{packet}.md"
        if root_report.is_file():
            paths.add(root_report)
        else:
            receipt_data = json.loads(receipt.read_text(encoding="utf-8"))
            report_path = receipt_data.get("reviewReport", {}).get("path")
            report = ROOT / str(report_path) if report_path else None
            if report is None or not report.is_file(): raise FileNotFoundError(f"review report missing for {packet}")
            paths.add(report)
        add_tree(paths, ROOT / "compiled-capabilities/coordination/reviews" / packet)
    add_tree(paths, ROOT / "compiled-capabilities/coordination/acceptance/archive/repair-logs")
    add_tree(paths, ROOT / "compiled-capabilities/coordination/acceptance/scheduler/logs")
    add_tree(paths, ROOT / "compiled-capabilities/coordination/root-checks/startup-failed-2324068")
    ordered = sorted(paths, key=lambda p: p.relative_to(ROOT).as_posix())
    for p in ordered:
        rel = PurePosixPath(p.relative_to(ROOT).as_posix())
        if rel.is_absolute() or ".." in rel.parts: raise ValueError(f"unsafe source path: {rel}")
        if not stat.S_ISREG(p.lstat().st_mode): raise ValueError(f"source is not a regular file: {rel}")
        s = rel.as_posix()
        if "E-RESULT" in s or "XR-RESULT" in s or "coordination/state.json" in s:
            raise ValueError(f"mutable RESULT/state input selected: {s}")
        if "/acceptance/custody/" in s or "/evidence/attempt-01/" in s or "/evidence/attempt-02/" in s or "/evidence/attempt-03/" in s or "/demo/evidence/attempt-00/" in s:
            raise ValueError(f"pre-repair custody source selected: {s}")
    return ordered


def file_rows(paths: list[Path]) -> list[dict[str, object]]:
    rows=[]
    for p in paths:
        size,digest=sha_file(p)
        rows.append({"path":p.relative_to(ROOT).as_posix(),"bytes":size,"sha256":digest,"mode_octal":format(stat.S_IMODE(p.stat().st_mode),"04o")})
    return rows


def archive_tar_gz(paths: list[Path]) -> None:
    with ARCHIVE.open("xb") as raw:
        with gzip.GzipFile(filename="",mode="wb",fileobj=raw,compresslevel=9,mtime=0) as gz:
            with tarfile.open(fileobj=gz,mode="w",format=tarfile.PAX_FORMAT) as tar:
                for p in paths:
                    rel=p.relative_to(ROOT).as_posix()
                    info=tar.gettarinfo(str(p),arcname=rel)
                    info.uid=info.gid=0; info.uname=info.gname=""; info.mtime=0; info.mode=stat.S_IMODE(p.stat().st_mode)
                    with p.open("rb") as source: tar.addfile(info,source)


def split_archive() -> list[dict[str, object]]:
    CHUNKS.mkdir()
    rows=[]
    with ARCHIVE.open("rb") as source:
        index=1
        while block:=source.read(CHUNK_BYTES):
            name=f"part-{index:04d}.bin"; out=CHUNKS/name
            with out.open("xb") as f: f.write(block)
            rows.append({"path":f"chunks/{name}","index":index,"offset":(index-1)*CHUNK_BYTES,"bytes":len(block),"sha256":hashlib.sha256(block).hexdigest()})
            index+=1
    return rows


def local_lineage() -> dict[str, object]:
    def git(*args: str) -> str:
        return subprocess.run(["git","rev-parse",*args],cwd=ROOT,check=True,text=True,capture_output=True).stdout.strip()
    attempts=[]
    for attempt in ("attempt-04","attempt-05"):
        path=ROOT/"compiled-capabilities/conformance/evidence"/attempt/"conformance.run.json"
        run=json.loads(path.read_text(encoding="utf-8"))
        lifecycle=json.loads((path.parent/"conformance.lifecycle.run.json").read_text(encoding="utf-8"))
        check_path=path.parent/"conformance.capability-check.json"
        check=json.loads(check_path.read_text(encoding="utf-8")) if check_path.is_file() else None
        attempts.append({"attempt":attempt,"runManifest":path.relative_to(ROOT).as_posix(),"runManifestSha256":sha_file(path)[1],"status":run.get("status"),"startedAt":run.get("startedAt"),"finishedAt":run.get("finishedAt"),"node":run.get("node"),"go":run.get("versions",{}).get("go",{}).get("output"),"lifecycleStatus":lifecycle.get("status"),"capabilityCheckStatus":check.get("status") if check else None,"sourceStableThroughCheck":run.get("sourceStableThroughCheck"),"buildOutputsStableThroughCheck":run.get("buildOutputsStableThroughCheck"),"summary":run.get("summary"),"failedStages":[s for s in run.get("stages",[]) if s.get("status")=="failed"]})
    return {"classification":"local focused historical trace only; not hosted CI and not full-run acceptance","localHead":git("HEAD"),"localTree":git("HEAD^{tree}"),"localParent":git("HEAD^"),"attempts":attempts,"localFullSession45031":{"statusAtFreeze":"running per coordinator notice","included":False,"acceptanceInferred":False},"hostedRunArtifact":{"included":False,"primaryPushRunId":41190743932,"statusAtLastPoll":"in_progress","artifactAvailable":False}}


def main() -> None:
    CUSTODY.mkdir(parents=True,exist_ok=True)
    if ARCHIVE.exists() or MANIFEST.exists() or CHUNKS.exists(): raise FileExistsError("supplement outputs already exist; preserve them and create a versioned supplement instead")
    paths=selected_paths(); before=file_rows(paths)
    archive_tar_gz(paths)
    archive_size,archive_sha=sha_file(ARCHIVE)
    chunks=split_archive()
    after=file_rows(paths)
    if before!=after: raise AssertionError("one or more source files changed during custody build")
    if sum(int(c["bytes"]) for c in chunks)!=archive_size or any(int(c["bytes"])>CHUNK_BYTES for c in chunks): raise AssertionError("chunk coverage/size error")
    lineage=local_lineage()
    manifest={"schema":"gobi.compiled-capability-local-postrepair-supplement/v1","scope":"LOCAL historical supplement: conformance attempts 04 and 05 plus closed E-FIX/XR-FIX author and review raw outputs","sourceRoot":".","localLineage":lineage,"selection":{"conformanceAttempts":["compiled-capabilities/conformance/evidence/attempt-04","compiled-capabilities/conformance/evidence/attempt-05"],"authorPacketIds":E_PACKETS,"reviewPacketIds":XR_PACKETS,"includedAuthorRawRoots":["compiled-capabilities/coordination/reviews/E-FIX-STARTUP","compiled-capabilities/coordination/acceptance/archive/repair-logs","compiled-capabilities/coordination/acceptance/scheduler/logs","compiled-capabilities/coordination/root-checks/startup-failed-2324068"],"reviewDirectoriesIncludeAllFiles":True},"exclusions":["all mutable RESULT jobs and current provider snapshots/artifacts","coordination/state.json and scheduler/native live state","the pre-repair 127-member custody archive and all its evidence inputs (attempts 01-03, demo attempt-00, and previous custody output)","the local full session 45031 output; it was still running at freeze","this supplement's own archive, chunks, manifest, and builder/verifier scripts"],"archive":{"path":"postrepair-local-supplement.tar.gz","bytes":archive_size,"sha256":archive_sha,"format":"PAX tar inside deterministic gzip","gzipMtime":0,"gzipFilenameHeader":"empty","tarOwner":0,"tarGroup":0,"tarMtime":0,"memberOrder":"sorted repository-relative paths"},"chunking":{"chunkBytesMaximum":CHUNK_BYTES,"reassembly":"concatenate chunks by ascending index without separators","chunks":chunks},"members":before,"memberCount":len(before),"sourceBytes":sum(int(x["bytes"]) for x in before)}
    with MANIFEST.open("x",encoding="utf-8",newline="\n") as f: json.dump(manifest,f,indent=2,sort_keys=True); f.write("\n")
    print(json.dumps({"status":"built","members":len(before),"sourceBytes":manifest["sourceBytes"],"archiveBytes":archive_size,"archiveSha256":archive_sha,"chunks":len(chunks),"localHead":lineage["localHead"],"tree":lineage["localTree"],"attempts":[(x["attempt"],x["status"],x["lifecycleStatus"],x["capabilityCheckStatus"]) for x in lineage["attempts"]]},indent=2))

if __name__=="__main__": main()
