#!/usr/bin/env python3
"""Build a deterministic audit archive of coordination evidence and 1 MiB parts."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import tarfile
from typing import Any

from common import (
    PART_BYTES,
    SCHEMA_AUDIT_EXCLUSIONS,
    SCHEMA_AUDIT_MEMBERS,
    SCHEMA_SEGMENTS,
    PackageError,
    dump_json,
    ensure_output_absent,
    git_state,
    part_sidecars,
    read_json,
    regular_file,
    require_clean_commit,
    safe_relative_path,
    segment_archive,
    sha256,
    verify_tar_members,
    write_bytes_new,
)
import restore  # loaded from /tmp/module-effects-publish by common.py
from prepare_parts import validate_primary_binding


CACHE_NAMES = {"__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".cache", "gocache", "go-build-cache"}
EXTRACT_NAMES = {"restored", "audit-restored", "bundle-restored", "restored-primary-verified"}


def _hash_path(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    info_before = regular_file(path, "coordination member")
    with path.open("rb") as stream:
        while True:
            block = stream.read(PART_BYTES)
            if not block:
                break
            digest.update(block)
            size += len(block)
    info_after = regular_file(path, "coordination member")
    if (info_before.st_dev, info_before.st_ino, info_before.st_size, info_before.st_mtime_ns) != \
       (info_after.st_dev, info_after.st_ino, info_after.st_size, info_after.st_mtime_ns):
        raise PackageError(f"coordination file changed during snapshot: {path}")
    return size, digest.hexdigest()


def scan_tree(root: Path) -> tuple[dict[str, dict[str, Any]], set[str]]:
    requested = Path(os.path.abspath(os.fspath(root.expanduser())))
    if requested.is_symlink() or not requested.is_dir():
        raise PackageError(f"coordination root must be a real directory: {requested}")
    root = requested.resolve()
    files: dict[str, dict[str, Any]] = {}
    directories: set[str] = set()
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            entries = sorted(os.scandir(current), key=lambda entry: entry.name, reverse=True)
        except OSError as exc:
            raise PackageError(f"cannot scan coordination directory {current}: {exc}") from exc
        for entry in entries:
            path = Path(entry.path)
            rel = path.relative_to(root).as_posix()
            info = entry.stat(follow_symlinks=False)
            if stat.S_ISLNK(info.st_mode):
                raise PackageError(f"coordination tree contains a symlink: {rel}")
            if stat.S_ISDIR(info.st_mode):
                directories.add(rel)
                stack.append(path)
            elif stat.S_ISREG(info.st_mode):
                size, digest = _hash_path(path)
                files[rel] = {"path": rel, "bytes": size, "sha256": digest, "mode": stat.S_IMODE(info.st_mode)}
            else:
                raise PackageError(f"coordination tree contains a non-regular entry: {rel}")
    return files, directories


def _iter_path_rows(value: Any):
    if isinstance(value, dict):
        if isinstance(value.get("path"), str) and type(value.get("bytes")) is int and isinstance(value.get("sha256"), str):
            yield value
        for child in value.values():
            yield from _iter_path_rows(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_path_rows(child)


def _resolve_index_path(index_rel: str, raw_path: str, files: dict[str, dict[str, Any]]) -> str | None:
    if not raw_path or raw_path.startswith("/") or "\\" in raw_path or "\x00" in raw_path:
        return None
    candidates: list[Path] = []
    try:
        safe_relative_path(raw_path, "indexed path")
    except PackageError:
        return None
    path = PurePosixPath(raw_path)
    if path.parts and path.parts[0] == "coordination":
        candidates.append(Path(*path.parts[1:]))
    candidates.append(Path(*PurePosixPath(index_rel).parent.parts) / Path(*path.parts))
    candidates.append(Path(*path.parts))
    found = [candidate.as_posix() for candidate in candidates if candidate.as_posix() in files]
    return found[0] if found else None


def indexed_references(root: Path, files: dict[str, dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    references: dict[str, list[dict[str, Any]]] = {}
    for index_rel in sorted(path for path in files if path.endswith("index.json") or path.endswith("-index.json")):
        data_path = root / index_rel
        data = data_path.read_bytes()
        try:
            parsed = restore._json_bytes(data, f"authoritative index {index_rel}")
        except restore.RestoreError as exc:
            raise PackageError(f"cannot parse authoritative index {index_rel}: {exc}") from exc
        for row in _iter_path_rows(parsed):
            target = _resolve_index_path(index_rel, row["path"], files)
            if target is None:
                continue
            references.setdefault(target, []).append({
                "indexPath": index_rel,
                "indexedPath": row["path"],
                "bytes": row["bytes"],
                "sha256": row["sha256"],
            })
    for rows in references.values():
        rows.sort(key=lambda row: (row["indexPath"], row["indexedPath"]))
    return references


def _exact_extracted_copy(
    directory_rel: str,
    files: dict[str, dict[str, Any]],
    primary_rows: dict[str, dict[str, Any]],
) -> list[str] | None:
    prefix = directory_rel.rstrip("/") + "/"
    members = {path[len(prefix):]: row for path, row in files.items() if path.startswith(prefix)}
    if not members or set(members) != set(primary_rows):
        return None
    for rel, expected in primary_rows.items():
        actual = members[rel]
        if actual["bytes"] != expected["bytes"] or actual["sha256"] != expected["sha256"]:
            return None
    return sorted(prefix + rel for rel in members)


def _select_exclusions(
    root: Path,
    files: dict[str, dict[str, Any]],
    directories: set[str],
    primary_archive: dict[str, Any] | None,
    primary_rows: dict[str, dict[str, Any]] | None,
) -> tuple[set[str], list[dict[str, Any]]]:
    references = indexed_references(root, files)
    excluded: set[str] = set()
    records: list[dict[str, Any]] = []

    def add(rel: str, kind: str, reason: str, **extra: Any) -> None:
        if rel in excluded:
            return
        row = files[rel]
        index_refs = references.get(rel, [])
        conflicts = [ref for ref in index_refs if ref["bytes"] != row["bytes"] or ref["sha256"] != row["sha256"]]
        if conflicts:
            return
        excluded.add(rel)
        records.append({
            "kind": kind,
            "path": rel,
            "bytes": row["bytes"],
            "sha256": row["sha256"],
            "indexedBy": index_refs,
            "reason": reason,
            **extra,
        })

    # Only known ephemeral cache directory names are eligible; indexed files remain included.
    for rel in sorted(files):
        parts = PurePosixPath(rel).parts
        cache_component = next((part for part in parts[:-1] if part in CACHE_NAMES), None)
        if cache_component is not None:
            add(rel, "cache", f"File is under the explicitly recognized ephemeral cache directory {cache_component!r}.")

    # Exclude only an extraction that exactly matches every pinned primary member.
    if primary_rows is not None:
        for directory_rel in sorted(directory for directory in directories if PurePosixPath(directory).name in EXTRACT_NAMES):
            copied = _exact_extracted_copy(directory_rel, files, primary_rows)
            if copied is None:
                continue
            for rel in copied:
                add(rel, "verified-primary-extraction", "Exact byte-for-byte extracted copy of the separately published primary archive.",
                    extractionRoot=directory_rel, primaryArchiveSHA256=primary_archive["sha256"] if primary_archive else None)

    # Exclude a full primary archive only after its complete manifest pin matches.
    if primary_archive is not None:
        for rel, row in sorted(files.items()):
            if row["bytes"] == primary_archive["bytes"] and row["sha256"] == primary_archive["sha256"]:
                add(rel, "duplicate-primary-archive", "Exact full-byte duplicate of the separately published primary archive.",
                    primaryArchiveSHA256=primary_archive["sha256"])
    records.sort(key=lambda row: (row["path"], row["kind"]))
    return excluded, records


class _HashingReader:
    def __init__(self, stream):
        self.stream = stream
        self.digest = hashlib.sha256()
        self.bytes_read = 0

    def read(self, size: int = -1) -> bytes:
        data = self.stream.read(size)
        self.digest.update(data)
        self.bytes_read += len(data)
        return data

    def close(self) -> None:
        self.stream.close()


def _write_audit_tar(
    root: Path,
    stage: Path,
    files: dict[str, dict[str, Any]],
    excluded: set[str],
    exclusion_bytes: bytes | None,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    output_rows: list[dict[str, Any]] = []
    for rel in sorted(set(files) - excluded):
        row = files[rel]
        tar_path = "coordination/" + rel
        safe_relative_path(tar_path, "audit tar path")
        output_rows.append({"path": tar_path, "bytes": row["bytes"], "sha256": row["sha256"], "mode": row["mode"]})
    if exclusion_bytes is not None:
        tar_path = "coordination/audit-exclusions.json"
        if any(row["path"] == tar_path for row in output_rows):
            raise PackageError("generated audit exclusion record collides with a coordination member")
        output_rows.append({"path": tar_path, "bytes": len(exclusion_bytes), "sha256": sha256(exclusion_bytes), "mode": 0o644})
    if len(output_rows) > restore.MAX_MEMBERS:
        raise PackageError("audit member count exceeds restore profile limits")
    output_rows.sort(key=lambda row: row["path"])
    expected = {row["path"]: row for row in output_rows}
    archive_path = stage / "audit.tar.gz"
    with archive_path.open("xb") as raw:
        with gzip.GzipFile(filename="", fileobj=raw, mode="wb", compresslevel=9, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode="w|", format=tarfile.PAX_FORMAT) as tf:
                for row in output_rows:
                    info = tarfile.TarInfo(row["path"])
                    info.type = tarfile.REGTYPE
                    info.size = row["bytes"]
                    info.mode = row["mode"]
                    info.mtime = 0
                    info.uid = 0
                    info.gid = 0
                    info.uname = ""
                    info.gname = ""
                    info.pax_headers = {}
                    if row["path"] == "coordination/audit-exclusions.json" and exclusion_bytes is not None:
                        source: Any = _HashingReader(io.BytesIO(exclusion_bytes))
                    else:
                        source_path = root / row["path"].removeprefix("coordination/")
                        source = _HashingReader(source_path.open("rb"))
                    try:
                        tf.addfile(info, source)
                    finally:
                        source.close()
                    if source.bytes_read != row["bytes"] or source.digest.hexdigest() != row["sha256"]:
                        raise PackageError(f"coordination file changed while preparing audit archive: {row['path']}")
        raw.flush()
        os.fsync(raw.fileno())
    verify_tar_members(archive_path, expected)
    return output_rows, expected


def pack_audit(
    coordination_root: Path,
    source_root: Path,
    output_dir: Path,
    *,
    primary_manifest: Path | None = None,
    primary_archive: Path | None = None,
    require_clean_git: bool = True,
    source_commit: str | None = None,
) -> dict[str, Any]:
    requested_coordination_root = Path(os.path.abspath(os.fspath(coordination_root.expanduser())))
    if requested_coordination_root.is_symlink() or not requested_coordination_root.is_dir():
        raise PackageError(
            "coordination root must be a real non-symlink coordination directory: "
            f"{requested_coordination_root}"
        )
    coordination_root = requested_coordination_root.resolve()
    source_root = source_root.resolve()
    if require_clean_git:
        head, dirty, git_root = git_state(source_root)
        if git_root != source_root:
            raise PackageError(f"sourceRoot must be the Git worktree root: {git_root}")
        if dirty:
            raise PackageError("Git source tree is dirty; audit packaging requires a clean source snapshot")
    else:
        head = source_commit or "0" * 40
        if len(head) != 40 or any(char not in "0123456789abcdef" for char in head):
            raise PackageError("sourceCommit must be a 40-character lowercase commit id")
        git_root = source_root
    if (primary_manifest is None) != (primary_archive is None):
        raise PackageError("primary manifest and primary archive must be provided together")
    primary_pin = None
    primary_rows = None
    if primary_manifest is not None and primary_archive is not None:
        _, primary, primary_rows, primary_pin, _ = validate_primary_binding(
            primary_archive, primary_manifest, source_root, require_clean_git=require_clean_git,
        )
        if primary["sourceCommit"] != head:
            raise PackageError("audit sourceCommit differs from the validated primary manifest sourceCommit")
    requested_target = Path(os.path.abspath(os.fspath(output_dir.expanduser())))
    resolved_target = requested_target.resolve()
    if resolved_target == coordination_root or coordination_root in resolved_target.parents:
        raise PackageError("audit output must be outside the coordination source tree")
    target = ensure_output_absent(requested_target)
    before_files, before_directories = scan_tree(coordination_root)
    excluded, exclusion_rows = _select_exclusions(coordination_root, before_files, before_directories, primary_pin, primary_rows)
    exclusion_bytes = None
    if exclusion_rows:
        exclusion_doc = {
            "schema": SCHEMA_AUDIT_EXCLUSIONS,
            "sourceCommit": head,
            "primaryArchive": primary_pin,
            "exclusions": exclusion_rows,
            "indexedEvidencePreservedByRecord": True,
        }
        exclusion_bytes = dump_json(exclusion_doc)
    stage = target
    stage.mkdir()
    try:
        member_rows, expected = _write_audit_tar(coordination_root, stage, before_files, excluded, exclusion_bytes)
        # Recheck every source file and directory after the archive was written.
        after_files, after_directories = scan_tree(coordination_root)
        if before_files != after_files or before_directories != after_directories:
            raise PackageError("coordination source snapshot changed during audit packaging")
        archive_path = stage / "audit.tar.gz"
        from common import sha256_file
        archive_size, archive_sha = sha256_file(archive_path)
        expanded = sum(row["bytes"] for row in member_rows)
        if len(member_rows) > restore.MAX_MEMBERS or expanded > restore.MAX_EXPANDED_BYTES:
            raise PackageError("audit archive exceeds restore member or expanded-byte limits")
        members_bytes = dump_json({"schema": SCHEMA_AUDIT_MEMBERS, "members": member_rows})
        member_manifest = restore._json_bytes(members_bytes, "audit member manifest")
        index_seed = {
            "schema": SCHEMA_SEGMENTS,
            "sourceCommit": head,
            "archive": {"bytes": archive_size, "sha256": archive_sha},
            "manifest": {"bytes": len(members_bytes), "sha256": sha256(members_bytes)},
            "parts": [{"name": "audit.part-000", "bytes": 1, "sha256": "0" * 64}],
            "memberCount": len(member_rows),
            "sourcePinCount": 0,
        }
        try:
            _, member_count, _, source_pin_count = restore._load_expected_manifest(members_bytes, index_seed, audit=True)
        except restore.RestoreError as exc:
            raise PackageError(f"audit member manifest does not satisfy restore contract: {exc}") from exc
        measured_pin, parts, _, full_hashes = segment_archive(archive_path, stage, "audit", git_root, expected_pin={"bytes": archive_size, "sha256": archive_sha})
        index = {
            "schema": SCHEMA_SEGMENTS,
            "sourceCommit": head,
            "archive": measured_pin,
            "manifest": {"bytes": len(members_bytes), "sha256": sha256(members_bytes)},
            "parts": parts,
            "memberCount": member_count,
            "sourcePinCount": source_pin_count,
        }
        try:
            restore._parse_index(index, audit=True)
        except restore.RestoreError as exc:
            raise PackageError(f"generated audit-parts index is not restore-compatible: {exc}") from exc
        upload, details = part_sidecars("audit", full_hashes)
        write_bytes_new(stage / "audit-members.json", members_bytes)
        write_bytes_new(stage / "audit-parts.json", dump_json(index))
        write_bytes_new(stage / "audit-upload-index.json", upload)
        write_bytes_new(stage / "audit-part-hashes.json", details)
        if exclusion_bytes is not None:
            write_bytes_new(stage / "audit-exclusions.json", exclusion_bytes)
        return {
            "status": "prepared-effects-audit-parts",
            "sourceCommit": head,
            "memberCount": member_count,
            "sourcePinCount": source_pin_count,
            "expandedBytes": expanded,
            "archive": measured_pin,
            "memberManifestSHA256": index["manifest"]["sha256"],
            "partCount": len(parts),
            "maxPartBytes": max(row["bytes"] for row in parts),
            "excludedFileCount": len(exclusion_rows),
            "snapshotStable": True,
            "outputDir": str(target),
        }
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coordination-root", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="new, absent audit publication directory")
    parser.add_argument("--primary-manifest", type=Path)
    parser.add_argument("--primary-archive", type=Path)
    args = parser.parse_args(argv)
    try:
        result = pack_audit(
            args.coordination_root,
            args.source_root,
            args.output,
            primary_manifest=args.primary_manifest,
            primary_archive=args.primary_archive,
        )
    except (PackageError, restore.RestoreError, OSError, ValueError) as exc:
        print(f"package error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
