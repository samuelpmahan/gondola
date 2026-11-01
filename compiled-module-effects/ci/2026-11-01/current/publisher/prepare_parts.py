#!/usr/bin/env python3
"""Prepare strict effects-profile segment indexes from an already verified archive."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
from typing import Any

from common import (
    SCHEMA_SEGMENTS,
    PackageError,
    check_source_closure,
    check_source_pins,
    dump_json,
    ensure_output_absent,
    read_json,
    regular_file,
    require_clean_commit,
    segment_archive,
    verify_tar_members,
    write_bytes_new,
)
import restore  # loaded from /tmp/module-effects-publish by common.py


def validate_primary_binding(
    archive_path: Path,
    manifest_path: Path,
    source_root: Path,
    *,
    require_clean_git: bool = True,
) -> tuple[bytes, dict[str, Any], dict[str, dict[str, Any]], dict[str, Any], Path]:
    """Verify closed manifest, commit cleanliness, source closure, archive pin and member bytes."""
    manifest_bytes, raw_manifest = read_json(manifest_path, "bundle manifest", restore.MAX_METADATA_BYTES)
    manifest = restore._object(raw_manifest, "bundle manifest", {
        "schema", "sourceCommit", "verifierGitHead", "verifierGitDirty", "verifierSourcePinsMatch",
        "sourcePinMismatches", "sourcePins", "testSourceFilesPinned", "sourceClosureScope", "members",
        "excludedDuplicateLogs", "excludedRegenerableBundles", "archive", "archivedSnapshotVerified",
    })
    if manifest["schema"] != "gobi.module-effects-archive-manifest/v1":
        raise PackageError("bundle manifest schema must be gobi.module-effects-archive-manifest/v1")
    commit = manifest["sourceCommit"]
    if not isinstance(commit, str) or not restore.COMMIT.fullmatch(commit):
        raise PackageError("bundle manifest sourceCommit is malformed")
    source_root = Path(os.path.abspath(os.fspath(source_root.expanduser())))
    if source_root.is_symlink() or not source_root.is_dir():
        raise PackageError("sourceRoot must be a real, non-symlink directory")
    source_root = source_root.resolve()
    if require_clean_git:
        top = require_clean_commit(source_root, commit)
        if top != source_root:
            raise PackageError(f"sourceRoot must be the Git worktree root: expected {top}, got {source_root}")
    if manifest["verifierGitHead"] != commit:
        raise PackageError("bundle manifest verifierGitHead differs from sourceCommit")
    if type(manifest["verifierGitDirty"]) is not bool or manifest["verifierGitDirty"] is not False:
        raise PackageError("bundle manifest must record a clean verifier Git tree")
    if type(manifest["verifierSourcePinsMatch"]) is not bool or manifest["verifierSourcePinsMatch"] is not True:
        raise PackageError("bundle manifest must record matching verifier source pins")
    if type(manifest["archivedSnapshotVerified"]) is not bool or manifest["archivedSnapshotVerified"] is not True:
        raise PackageError("bundle manifest must record archivedSnapshotVerified=true")
    if manifest["sourcePinMismatches"] != []:
        raise PackageError("clean bundle manifest must have no sourcePinMismatches")

    rows = restore._member_rows(manifest["members"], "bundle members")
    pins = restore._object(manifest["sourcePins"], "sourcePins")
    archive_pin = restore._object(manifest["archive"], "manifest archive", {"path", "bytes", "sha256"})
    archive_bytes = restore._integer(archive_pin["bytes"], "manifest archive.bytes", 1)
    archive_sha = restore._digest(archive_pin["sha256"], "manifest archive.sha256")
    archive_pin = {"bytes": archive_bytes, "sha256": archive_sha}
    index_contract = {
        "schema": SCHEMA_SEGMENTS,
        "sourceCommit": commit,
        "archive": archive_pin,
        "manifest": {"bytes": len(manifest_bytes), "sha256": hashlib.sha256(manifest_bytes).hexdigest()},
        "parts": [{"name": "bundle.part-000", "bytes": 1, "sha256": "0" * 64}],
        "memberCount": len(rows),
        "sourcePinCount": len(pins),
    }
    try:
        expected_rows, member_count, _, source_pin_count = restore._load_expected_manifest(manifest_bytes, index_contract, audit=False)
    except restore.RestoreError as exc:
        raise PackageError(f"bundle manifest does not satisfy the restore contract: {exc}") from exc
    if member_count != len(rows) or source_pin_count != len(pins):
        raise PackageError("manifest member/source pin counts did not derive from validated arrays")

    archive_input = Path(os.path.abspath(os.fspath(archive_path.expanduser())))
    regular_file(archive_input, "primary archive")
    resolved_archive = archive_input.resolve()
    declared = Path(archive_pin_path(manifest))
    if not declared.is_absolute():
        declared = source_root / declared
    if declared.resolve() != resolved_archive:
        raise PackageError("CLI archive path differs from the exact archive.path recorded in the manifest")
    info = regular_file(resolved_archive, "primary archive")
    if info.st_size != archive_bytes:
        raise PackageError("primary archive byte length differs from the manifest pin")
    from common import sha256_file
    actual_size, actual_sha = sha256_file(resolved_archive)
    if actual_size != archive_bytes or actual_sha != archive_sha:
        raise PackageError("primary archive bytes or SHA-256 differ from the manifest pin")

    if require_clean_git:
        check_source_pins(source_root, pins)
        check_source_closure(source_root, manifest)
    verify_tar_members(resolved_archive, expected_rows)
    return manifest_bytes, manifest, expected_rows, archive_pin, source_root


def archive_pin_path(manifest: dict[str, Any]) -> str:
    value = manifest["archive"]["path"]
    if not isinstance(value, str) or not value or len(value) > 4096 or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise PackageError("manifest archive.path must be a nonempty bounded plain path")
    return value


def prepare_primary_parts(
    archive_path: Path,
    manifest_path: Path,
    source_root: Path,
    output_dir: Path,
    *,
    require_clean_git: bool = True,
) -> dict[str, Any]:
    manifest_bytes, manifest, rows, archive_pin, git_root = validate_primary_binding(
        archive_path, manifest_path, source_root, require_clean_git=require_clean_git,
    )
    target = ensure_output_absent(output_dir)
    target.mkdir()
    try:
        measured_pin, parts, _, full_hashes = segment_archive(
            archive_path.resolve(), target, "bundle", git_root, expected_pin=archive_pin,
        )
        if measured_pin != archive_pin:
            raise PackageError("segmented primary archive does not match its validated pin")
        index = {
            "schema": SCHEMA_SEGMENTS,
            "sourceCommit": manifest["sourceCommit"],
            "archive": measured_pin,
            "manifest": {"bytes": len(manifest_bytes), "sha256": hashlib.sha256(manifest_bytes).hexdigest()},
            "parts": parts,
            "memberCount": len(rows),
            "sourcePinCount": len(manifest["sourcePins"]),
        }
        try:
            restore._parse_index(index, audit=False)
        except restore.RestoreError as exc:
            raise PackageError(f"generated bundle-parts index is not restore-compatible: {exc}") from exc
        from common import part_sidecars
        upload, details = part_sidecars("bundle", full_hashes)
        write_bytes_new(target / "bundle.manifest.json", manifest_bytes)
        write_bytes_new(target / "bundle-parts.json", dump_json(index))
        write_bytes_new(target / "bundle-upload-index.json", upload)
        write_bytes_new(target / "bundle-part-hashes.json", details)
        return {
            "status": "prepared-effects-primary-parts",
            "sourceCommit": manifest["sourceCommit"],
            "archive": measured_pin,
            "manifestSHA256": index["manifest"]["sha256"],
            "memberCount": index["memberCount"],
            "sourcePinCount": index["sourcePinCount"],
            "partCount": len(parts),
            "maxPartBytes": max(row["bytes"] for row in parts),
            "gitBlobSidecar": "bundle-part-hashes.json",
            "outputDir": str(target),
        }
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True, help="clean-run primary .tar.gz")
    parser.add_argument("--manifest", type=Path, required=True, help="adjacent effects archive manifest")
    parser.add_argument("--source-root", type=Path, required=True, help="clean source Git worktree root")
    parser.add_argument("--output", type=Path, required=True, help="new, absent publication directory")
    args = parser.parse_args(argv)
    try:
        result = prepare_primary_parts(args.archive, args.manifest, args.source_root, args.output)
    except (PackageError, restore.RestoreError, OSError, ValueError) as exc:
        print(f"package error: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
