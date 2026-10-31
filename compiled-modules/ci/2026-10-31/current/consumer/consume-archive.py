#!/usr/bin/env python3
"""Verify the published compiled-modules archive before privately extracting it."""
import argparse
import gzip
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tarfile
import tempfile
from typing import Any

MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_MEMBERS = 10000
MAX_MEMBER_BYTES = 64 * 1024 * 1024
MAX_TOTAL_BYTES = 1024 * 1024 * 1024
MANIFEST_SCHEMA = "gobi.compiled-modules-archive-manifest/v1"


def fail(message: str) -> None:
    raise ValueError(message)


def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            fail(f"duplicate JSON property: {key}")
        result[key] = value
    return result


def read_json(path: pathlib.Path) -> Any:
    raw = path.read_bytes()
    if raw.startswith(b"\xef\xbb\xbf"):
        fail(f"BOM not permitted in JSON: {path}")
    return json.loads(raw.decode("utf-8", errors="strict"), object_pairs_hook=strict_object)


def sha256_file(path: pathlib.Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    return size, digest.hexdigest()


def safe_relative(name: Any) -> str:
    if not isinstance(name, str) or not name or "\x00" in name or "\\" in name or name.startswith("/"):
        fail(f"unsafe archive path: {name!r}")
    if re.match(r"^[A-Za-z]:", name):
        fail(f"drive-qualified archive path: {name!r}")
    pieces = name.split("/")
    if any(piece in ("", ".", "..") for piece in pieces):
        fail(f"noncanonical archive path: {name!r}")
    return name


def run_git(repo: pathlib.Path, args: list[str], *, input_bytes: bytes | None = None) -> bytes:
    result = subprocess.run(["git", *args], cwd=repo, input=input_bytes, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        fail(f"git {' '.join(args)} failed ({result.returncode}): {result.stderr.decode('utf-8', 'replace').strip()}")
    return result.stdout


def git_tree(repo: pathlib.Path, commit: str) -> tuple[str, dict[str, str]]:
    tree = run_git(repo, ["rev-parse", f"{commit}^{{tree}}"]).decode().strip()
    entries = run_git(repo, ["ls-tree", "-rz", "--full-tree", commit])
    blobs = {}
    for row in entries.split(b"\0"):
        if not row:
            continue
        header, sep, path_bytes = row.partition(b"\t")
        if not sep:
            fail("malformed git ls-tree row")
        mode, kind, oid = header.decode("ascii").split(" ", 2)
        path = path_bytes.decode("utf-8", "strict")
        if kind == "blob":
            if mode not in ("100644", "100755"):
                fail(f"published source path is not a regular Git blob: {path}")
            blobs[path] = oid
    return tree, blobs


def source_bytes(tf: tarfile.TarFile, by_name: dict[str, tarfile.TarInfo], relative: str) -> bytes:
    member = by_name.get(f"source/{relative}")
    if member is None:
        fail(f"source pin is absent from archive: {relative}")
    handle = tf.extractfile(member)
    if handle is None:
        fail(f"cannot read archived source pin: {relative}")
    data = handle.read(MAX_MEMBER_BYTES + 1)
    if len(data) > MAX_MEMBER_BYTES:
        fail(f"source pin exceeds member size cap: {relative}")
    return data


def verify_and_extract(args) -> dict[str, Any]:
    archive = pathlib.Path(args.archive).resolve(strict=True)
    manifest_path = pathlib.Path(args.manifest).resolve(strict=True)
    repo = pathlib.Path(args.git_repo).resolve(strict=True)
    destination = pathlib.Path(args.extract_root).absolute()
    if destination.exists():
        fail(f"private extraction destination already exists: {destination}")
    if not destination.parent.is_dir():
        fail("extraction parent must already exist")

    archive_size, archive_sha = sha256_file(archive)
    if archive_size > MAX_ARCHIVE_BYTES:
        fail("archive exceeds compressed-size cap")
    manifest_bytes = manifest_path.read_bytes()
    manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
    if manifest_sha != args.expected_manifest_sha256:
        fail("manifest SHA-256 does not match the supplied publication pin")
    manifest = read_json(manifest_path)
    if not isinstance(manifest, dict) or manifest.get("schema") != MANIFEST_SCHEMA:
        fail("unsupported archive manifest schema")
    expected_keys = {"schema", "sourceCommit", "verifierGitHead", "verifierGitDirty", "verifierSourcePinsMatch", "members", "archive", "sourcePinsBefore", "archivedSnapshotVerified"}
    if set(manifest) != expected_keys:
        fail("manifest has missing or extra top-level properties")
    source_commit = manifest.get("sourceCommit")
    if not isinstance(source_commit, str) or not re.fullmatch(r"[0-9a-f]{40}", source_commit):
        fail("manifest sourceCommit is not a canonical Git SHA-1")
    if source_commit != args.source_commit:
        fail("manifest sourceCommit differs from the supplied published commit")
    if manifest.get("verifierGitHead") != source_commit or manifest.get("verifierGitDirty") is not False or manifest.get("verifierSourcePinsMatch") is not True or manifest.get("archivedSnapshotVerified") is not True:
        fail("producer source-boundary/round-trip fields do not attest a clean matching source")
    archive_record = manifest.get("archive")
    if not isinstance(archive_record, dict) or set(archive_record) != {"path", "bytes", "sha256"}:
        fail("manifest archive record is malformed")
    if archive_record["path"] != str(archive):
        fail("manifest archive path differs from the supplied archive")
    if archive_record["bytes"] != archive_size or archive_record["sha256"] != archive_sha:
        fail("archive byte size or SHA-256 does not match the manifest")
    if archive_sha != args.expected_archive_sha256:
        fail("archive SHA-256 differs from the supplied publication pin")

    raw_members = manifest.get("members")
    if not isinstance(raw_members, list) or not raw_members or len(raw_members) > MAX_MEMBERS:
        fail("manifest member inventory is empty or exceeds the member cap")
    expected = {}
    total_bytes = 0
    for record in raw_members:
        if not isinstance(record, dict) or set(record) != {"path", "bytes", "sha256"}:
            fail("manifest member record has missing or extra properties")
        name = safe_relative(record["path"])
        size = record["bytes"]
        digest = record["sha256"]
        if not isinstance(size, int) or isinstance(size, bool) or size < 0 or size > MAX_MEMBER_BYTES:
            fail(f"invalid or oversized manifest member: {name}")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            fail(f"invalid SHA-256 for manifest member: {name}")
        if name in expected:
            fail(f"duplicate manifest member: {name}")
        expected[name] = record
        total_bytes += size
    if total_bytes > MAX_TOTAL_BYTES:
        fail("manifest expanded size exceeds cap")
    for name in expected:
        pieces = name.split("/")
        for boundary in range(1, len(pieces)):
            parent_name = "/".join(pieces[:boundary])
            if parent_name in expected:
                fail(f"archive member path is also a file parent: {parent_name} -> {name}")

    pins = manifest.get("sourcePinsBefore")
    if not isinstance(pins, dict) or not pins:
        fail("manifest sourcePinsBefore is missing")
    for path, pin in pins.items():
        safe_relative(path)
        if not isinstance(pin, dict) or set(pin) != {"bytes", "sha256"}:
            fail(f"malformed source pin: {path}")
        if not isinstance(pin["bytes"], int) or isinstance(pin["bytes"], bool) or pin["bytes"] < 0 or pin["bytes"] > MAX_MEMBER_BYTES:
            fail(f"invalid source pin size: {path}")
        if not isinstance(pin["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", pin["sha256"]):
            fail(f"invalid source pin SHA-256: {path}")
        member = expected.get(f"source/{path}")
        if member is None or member["bytes"] != pin["bytes"] or member["sha256"] != pin["sha256"]:
            fail(f"source archive inventory does not bind source pin: {path}")
    archived_source_paths = {name[len("source/"):] for name in expected if name.startswith("source/")}
    if archived_source_paths != set(pins):
        fail("archived source inventory differs from sourcePinsBefore")

    # Complete the archive's path/type/inventory/content checks before creating
    # any extracted filesystem paths.
    with tarfile.open(archive, mode="r:gz") as tf:
        infos = tf.getmembers()
        actual = {}
        for info in infos:
            name = safe_relative(info.name)
            if not info.isfile() or info.type not in (tarfile.REGTYPE, tarfile.AREGTYPE):
                fail(f"archive member is not a regular file: {name}")
            if name in actual:
                fail(f"duplicate archive member: {name}")
            if name not in expected:
                fail(f"unlisted archive member: {name}")
            record = expected[name]
            if info.size != record["bytes"]:
                fail(f"archive header size disagrees with manifest: {name}")
            if info.size > MAX_MEMBER_BYTES:
                fail(f"archive member exceeds size cap: {name}")
            actual[name] = info
        if set(actual) != set(expected):
            missing = sorted(set(expected) - set(actual))
            fail(f"archive member set differs from manifest; missing={missing[:5]}")
        for name in sorted(actual):
            digest = hashlib.sha256()
            size = 0
            stream = tf.extractfile(actual[name])
            if stream is None:
                fail(f"cannot stream archive member: {name}")
            with stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    size += len(chunk)
                    if size > expected[name]["bytes"] or size > MAX_MEMBER_BYTES:
                        fail(f"archive member expands beyond manifest size: {name}")
                    digest.update(chunk)
            if size != expected[name]["bytes"] or digest.hexdigest() != expected[name]["sha256"]:
                fail(f"archive content differs from manifest: {name}")

    # Bind the complete archived source snapshot to actual blobs in the
    # published commit before extraction. Git blob IDs are computed over the
    # exact source bytes using Git's object framing.
    tree, git_blobs = git_tree(repo, source_commit)
    if args.expected_tree and tree != args.expected_tree:
        fail(f"published commit tree mismatch: got {tree}")
    pin_blob_ids = {}
    with tarfile.open(archive, mode="r:gz") as tf:
        info_by_name = {info.name: info for info in tf.getmembers()}
        for path, pin in pins.items():
            oid = git_blobs.get(path)
            if oid is None:
                fail(f"source pin is absent from published Git tree: {path}")
            data = source_bytes(tf, info_by_name, path)
            if len(data) != pin["bytes"] or hashlib.sha256(data).hexdigest() != pin["sha256"]:
                fail(f"archived source bytes disagree with source pin: {path}")
            git_oid = hashlib.sha1(f"blob {len(data)}\0".encode("ascii") + data).hexdigest()
            if git_oid != oid:
                fail(f"archived source bytes disagree with published Git blob: {path}")
            pin_blob_ids[path] = oid

    destination.mkdir(mode=0o700)
    try:
        with tarfile.open(archive, mode="r:gz") as tf:
            for info in tf.getmembers():
                name = safe_relative(info.name)
                target = destination.joinpath(*name.split("/"))
                target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
                # Parent directories are new under a freshly-created root; make
                # sure no unexpected link or existing entry has appeared.
                if target.exists() or target.is_symlink():
                    fail(f"refusing to overwrite extracted member: {name}")
                stream = tf.extractfile(info)
                if stream is None:
                    fail(f"cannot extract validated member: {name}")
                with stream, target.open("xb") as output:
                    shutil.copyfileobj(stream, output, length=1024 * 1024)
                target.chmod(0o444)
        for path, oid in pin_blob_ids.items():
            source = destination / "source" / pathlib.PurePosixPath(path)
            data = source.read_bytes()
            git_data = run_git(repo, ["cat-file", "blob", oid])
            if data != git_data:
                fail(f"extracted source bytes are not byte-identical to Git: {path}")
        snapshot_path = destination / "execution-before-archive.json"
        snapshot = read_json(snapshot_path)
        if snapshot.get("schema") != "gobi.compiled-modules-execution-snapshot/v1" or snapshot.get("sourceCommit") != source_commit or snapshot.get("sourcePins") != pins:
            fail("archived pre-archive source snapshot does not match manifest source pins")
    except BaseException:
        shutil.rmtree(destination, ignore_errors=True)
        raise

    native_json = destination / "native/native-trace.json"
    raw_native_stdout = destination / "logs/native-trace.stdout.bin"
    return {
        "schema": "gobi.compiled-modules-consumer-preflight/v1",
        "status": "verified-and-extracted",
        "sourceCommit": source_commit,
        "sourceTree": tree,
        "sourcePinCount": len(pins),
        "sourceGitBlobsByteMatched": True,
        "archiveBytes": archive_size,
        "archiveSHA256": archive_sha,
        "manifestBytes": len(manifest_bytes),
        "manifestSHA256": manifest_sha,
        "memberCount": len(expected),
        "expandedBytes": total_bytes,
        "extractionRoot": str(destination),
        "sourceRoot": str(destination / "source"),
        "nativeTracePath": str(native_json) if native_json.exists() else None,
        "rawNativeStdoutPath": str(raw_native_stdout) if raw_native_stdout.exists() else None,
        "sourcePinsByteIdenticalToPublishedGit": True,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--expected-archive-sha256", required=True)
    parser.add_argument("--expected-manifest-sha256", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--expected-tree")
    parser.add_argument("--git-repo", default="/workspace/scratch/39a56936f173/gondola")
    parser.add_argument("--extract-root", required=True)
    args = parser.parse_args()
    for value, label in [(args.expected_archive_sha256,"archive SHA-256"),(args.expected_manifest_sha256,"manifest SHA-256")]:
        if not re.fullmatch(r"[0-9a-f]{64}", value):
            fail(f"{label} must be lowercase hexadecimal")
    result = verify_and_extract(args)
    print(json.dumps(result, sort_keys=True, ensure_ascii=False))


if __name__ == "__main__":
    main()
