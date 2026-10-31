#!/usr/bin/env python3
"""Freeze the selected pre-repair capability evidence into deterministic custody chunks."""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import shutil
import stat
import tarfile
import tempfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[4]
CUSTODY = Path(__file__).resolve().parent
ARCHIVE = CUSTODY / "evidence.tar.gz"
CHUNKS = CUSTODY / "chunks"
MANIFEST = CUSTODY / "manifest.json"
CHUNK_BYTES = 1024 * 1024

E_PACKET_IDS = ["E-BUILD", "E-DEMO", "E-FIX-GO", "E-GO", "E-HARNESS", "E-HOST", "E-ORACLE"]
XR_PACKET_IDS = ["XR-BUILD", "XR-DEMO", "XR-FIX-GO", "XR-GO", "XR-HARNESS", "XR-HOST", "XR-ORACLE"]


def sha256_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            size += len(block)
            digest.update(block)
    return size, digest.hexdigest()


def selected_paths() -> list[Path]:
    paths: set[Path] = set()
    fixed_roots = [
        ROOT / "compiled-capabilities/conformance/evidence/attempt-01",
        ROOT / "compiled-capabilities/conformance/evidence/attempt-02",
        ROOT / "compiled-capabilities/conformance/evidence/attempt-03",
        ROOT / "compiled-capabilities/demo/evidence/attempt-00",
    ]
    for directory in fixed_roots:
        if not directory.is_dir():
            raise FileNotFoundError(f"required evidence directory is missing: {directory.relative_to(ROOT)}")
        paths.update(path for path in directory.rglob("*") if path.is_file())

    for packet in E_PACKET_IDS:
        report = ROOT / "compiled-capabilities/coordination/reports" / f"{packet}.md"
        receipt = ROOT / "compiled-capabilities/coordination/receipts" / f"{packet}.json"
        for path in (report, receipt):
            if not path.is_file():
                raise FileNotFoundError(f"required closed author packet is missing: {path.relative_to(ROOT)}")
            paths.add(path)

    for packet in XR_PACKET_IDS:
        report = ROOT / "compiled-capabilities/coordination/reviews" / f"{packet}.md"
        review_directory = ROOT / "compiled-capabilities/coordination/reviews" / packet
        receipt = ROOT / "compiled-capabilities/coordination/receipts" / f"{packet}.json"
        for path in (report, receipt):
            if not path.is_file():
                raise FileNotFoundError(f"required closed review packet is missing: {path.relative_to(ROOT)}")
            paths.add(path)
        if review_directory.is_dir():
            paths.update(path for path in review_directory.rglob("*") if path.is_file())

    failed_epoch = ROOT / "compiled-capabilities/coordination/epoch-03-failed-nonoptimal.log"
    if not failed_epoch.is_file():
        raise FileNotFoundError(f"required preserved failed native epoch log is missing: {failed_epoch.relative_to(ROOT)}")
    paths.add(failed_epoch)

    normalized = sorted(paths, key=lambda path: path.relative_to(ROOT).as_posix())
    for path in normalized:
        relative = PurePosixPath(path.relative_to(ROOT).as_posix())
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError(f"unsafe archive path: {relative}")
        if not stat.S_ISREG(path.lstat().st_mode):
            raise ValueError(f"custody input is not a regular file: {relative}")
    return normalized


def catalog(paths: list[Path]) -> list[dict[str, object]]:
    rows = []
    for path in paths:
        size, digest = sha256_file(path)
        rows.append({
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": size,
            "sha256": digest,
            "mode_octal": format(stat.S_IMODE(path.stat().st_mode), "04o"),
        })
    return rows


def write_tar_gz(path: Path, files: list[Path]) -> None:
    with path.open("wb") as raw_stream:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw_stream, compresslevel=9, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
                for source in files:
                    relative = source.relative_to(ROOT).as_posix()
                    info = archive.gettarinfo(str(source), arcname=relative)
                    info.uid = 0
                    info.gid = 0
                    info.uname = ""
                    info.gname = ""
                    info.mtime = 0
                    info.mode = stat.S_IMODE(source.stat().st_mode)
                    with source.open("rb") as stream:
                        archive.addfile(info, stream)


def split_archive(path: Path) -> list[dict[str, object]]:
    CHUNKS.mkdir(parents=True, exist_ok=True)
    for stale in CHUNKS.iterdir():
        if stale.is_file():
            stale.unlink()
    records = []
    with path.open("rb") as source:
        index = 1
        while block := source.read(CHUNK_BYTES):
            name = f"part-{index:04d}.bin"
            destination = CHUNKS / name
            destination.write_bytes(block)
            records.append({
                "path": f"chunks/{name}",
                "index": index,
                "offset": (index - 1) * CHUNK_BYTES,
                "bytes": len(block),
                "sha256": hashlib.sha256(block).hexdigest(),
            })
            index += 1
    return records


def verify_archive(path: Path, rows: list[dict[str, object]]) -> dict[str, object]:
    expected = {str(row["path"]): row for row in rows}
    seen = set()
    gzip_mtime = int.from_bytes(path.read_bytes()[4:8], "little")
    if gzip_mtime != 0:
        raise AssertionError(f"gzip header mtime is {gzip_mtime}, expected 0")
    with tarfile.open(path, mode="r:gz") as archive:
        members = archive.getmembers()
        names = [member.name for member in members]
        if names != sorted(expected):
            raise AssertionError("tar member names/order differ from the frozen input catalog")
        for member in members:
            relative = PurePosixPath(member.name)
            if relative.is_absolute() or ".." in relative.parts or not member.isfile():
                raise AssertionError(f"unsafe or unsupported tar member: {member.name}")
            row = expected[member.name]
            stream = archive.extractfile(member)
            if stream is None:
                raise AssertionError(f"could not read tar member: {member.name}")
            digest = hashlib.sha256()
            size = 0
            with stream:
                while block := stream.read(1024 * 1024):
                    size += len(block)
                    digest.update(block)
            if size != row["bytes"] or digest.hexdigest() != row["sha256"]:
                raise AssertionError(f"tar member hash/size differs: {member.name}")
            seen.add(member.name)
    if seen != set(expected):
        raise AssertionError("tar member set differs from the frozen input catalog")

    with tempfile.TemporaryDirectory(prefix="gobi-capability-custody-verify-") as temporary:
        extraction_root = Path(temporary) / "restore"
        extraction_root.mkdir()
        with tarfile.open(path, mode="r:gz") as archive:
            for member in archive.getmembers():
                target = extraction_root.joinpath(*PurePosixPath(member.name).parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                stream = archive.extractfile(member)
                if stream is None:
                    raise AssertionError(f"could not restore member: {member.name}")
                with stream, target.open("wb") as output:
                    shutil.copyfileobj(stream, output)
                os.chmod(target, int(expected[member.name]["mode_octal"], 8))
                size, digest = sha256_file(target)
                if size != expected[member.name]["bytes"] or digest != expected[member.name]["sha256"]:
                    raise AssertionError(f"restored member hash/size differs: {member.name}")

    return {"tarMembers": len(seen), "restoredMembers": len(seen), "gzipMtime": gzip_mtime}


def main() -> None:
    CUSTODY.mkdir(parents=True, exist_ok=True)
    previous_archive_sha = None
    if MANIFEST.is_file():
        try:
            previous_archive_sha = json.loads(MANIFEST.read_text(encoding="utf-8")).get("archive", {}).get("sha256")
        except (json.JSONDecodeError, OSError):
            previous_archive_sha = None
    files = selected_paths()
    rows_before = catalog(files)
    write_tar_gz(ARCHIVE, files)
    archive_bytes, archive_sha = sha256_file(ARCHIVE)
    chunks = split_archive(ARCHIVE)
    for chunk in chunks:
        chunk_path = CUSTODY / str(chunk["path"])
        chunk_size, chunk_sha = sha256_file(chunk_path)
        if chunk_size != chunk["bytes"] or chunk_sha != chunk["sha256"]:
            raise AssertionError(f"written chunk hash/size differs: {chunk_path.name}")

    with tempfile.TemporaryDirectory(prefix="gobi-capability-custody-rebuild-") as temporary:
        reconstructed = Path(temporary) / "reconstructed.tar.gz"
        with reconstructed.open("wb") as output:
            for chunk in chunks:
                with (CUSTODY / str(chunk["path"])).open("rb") as source:
                    shutil.copyfileobj(source, output)
        rebuilt_bytes, rebuilt_sha = sha256_file(reconstructed)
        if rebuilt_bytes != archive_bytes or rebuilt_sha != archive_sha:
            raise AssertionError("concatenated 1 MiB chunks do not reconstruct the exact archive")
        round_trip = verify_archive(reconstructed, rows_before)

    rows_after = catalog(files)
    if rows_before != rows_after:
        raise AssertionError("one or more frozen input files changed while custody was being created")
    chunk_bytes = sum(int(row["bytes"]) for row in chunks)
    if chunk_bytes != archive_bytes or any(int(row["bytes"]) > CHUNK_BYTES for row in chunks):
        raise AssertionError("chunk lengths do not cover the exact archive within the size limit")

    manifest = {
        "schema": "gobi.compiled-capability-custody/v1",
        "scope": "immutable pre-repair focused evidence, closed author/review packets, and the failed native epoch-03 log",
        "sourceRoot": ".",
        "selection": {
            "focusedAttempts": [
                "compiled-capabilities/conformance/evidence/attempt-01",
                "compiled-capabilities/conformance/evidence/attempt-02",
                "compiled-capabilities/conformance/evidence/attempt-03",
                "compiled-capabilities/demo/evidence/attempt-00",
            ],
            "closedAuthorPacketIds": E_PACKET_IDS,
            "closedReviewPacketIds": XR_PACKET_IDS,
            "preservedNativeFailureLog": "compiled-capabilities/coordination/epoch-03-failed-nonoptimal.log",
            "reviewDirectoriesIncludeAllFiles": True,
        },
        "archive": {
            "path": "evidence.tar.gz",
            "bytes": archive_bytes,
            "sha256": archive_sha,
            "format": "PAX tar inside gzip",
            "reproducibility": {"gzipMtime": 0, "gzipFilenameHeader": "empty", "tarOwner": 0, "tarGroup": 0, "tarMtime": 0, "order": "sorted relative member paths"},
        },
        "chunking": {
            "chunkBytesMaximum": CHUNK_BYTES,
            "reassembly": "concatenate chunks in ascending index order without separators",
            "chunks": chunks,
        },
        "members": rows_before,
        "exclusions": [
            "compiled-capabilities/coordination/state.json and current mutable coordination scheduler/native state",
            "ongoing E-FIX-HARNESS and E-FIX-BUILD author packets and all PREP reports/receipts",
            "newer conformance/demo evidence attempts beyond the explicitly selected attempts 01-03 and demo attempt-00",
            "the custody output itself, preventing recursive inclusion",
            "uncaptured failures: custody includes only surviving raw files and does not reconstruct missing output",
        ],
        "knownUncapturedFailureNotes": [
            "E-DEMO reports an initial selector failure whose raw invocation output was not captured; only the surviving attempt-00 files are archived.",
            "E-HOST reports initial environment-missing invocations and an intermediate replacement regression whose raw output was not captured.",
        ],
        "verification": {
            **round_trip,
            "reassembledArchiveSha256": rebuilt_sha,
            "reassembledArchiveBytes": rebuilt_bytes,
            "verifiedChunkCount": len(chunks),
            "sourceHashesUnchangedAfterBuild": True,
            "previousArchiveSha256": previous_archive_sha,
            "reproducibleRebuildFromPreviousManifest": previous_archive_sha == archive_sha if previous_archive_sha else None,
        },
        "restore": {
            "commands": [
                "cat compiled-capabilities/coordination/acceptance/custody/chunks/part-*.bin > /tmp/capability-evidence.tar.gz",
                "sha256sum /tmp/capability-evidence.tar.gz",
                "tar -tzf /tmp/capability-evidence.tar.gz",
                "mkdir -p /tmp/capability-evidence-restore",
                "tar --no-same-owner -xzf /tmp/capability-evidence.tar.gz -C /tmp/capability-evidence-restore",
            ],
            "safety": "Extract only into a clean destination directory after verifying the archive hash and member catalog; member names are relative and contain no parent traversal.",
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "memberCount": len(rows_before),
        "sourceBytes": sum(int(row["bytes"]) for row in rows_before),
        "archiveBytes": archive_bytes,
        "archiveSha256": archive_sha,
        "chunks": len(chunks),
        "allMembersRoundTripped": round_trip["restoredMembers"] == len(rows_before),
        "manifest": str(MANIFEST.relative_to(ROOT)),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
