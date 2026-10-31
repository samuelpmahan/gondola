#!/usr/bin/env python3
"""Independently reconstruct and verify the custody archive and every member."""

from __future__ import annotations

import hashlib
import json
import shutil
import tarfile
import tempfile
from pathlib import Path, PurePosixPath


CUSTODY = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[4]
MANIFEST = CUSTODY / "manifest.json"


def digest_stream(stream) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    while block := stream.read(1024 * 1024):
        size += len(block)
        digest.update(block)
    return size, digest.hexdigest()


def digest_file(path: Path) -> tuple[int, str]:
    with path.open("rb") as stream:
        return digest_stream(stream)


def verify() -> dict[str, object]:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("schema") != "gobi.compiled-capability-custody/v1":
        raise ValueError("unsupported custody manifest schema")
    archive_row = manifest["archive"]
    chunks = manifest["chunking"]["chunks"]
    members = manifest["members"]
    if not chunks or not members:
        raise ValueError("custody manifest has no chunks or members")

    with tempfile.TemporaryDirectory(prefix="gobi-capability-custody-independent-") as temporary:
        temporary_root = Path(temporary)
        rebuilt = temporary_root / "evidence.tar.gz"
        prior_offset = 0
        with rebuilt.open("wb") as target:
            for expected_index, chunk in enumerate(chunks, start=1):
                if chunk["index"] != expected_index or chunk["offset"] != prior_offset:
                    raise AssertionError("chunk ordering or offset is not contiguous")
                if chunk["bytes"] > manifest["chunking"]["chunkBytesMaximum"]:
                    raise AssertionError("chunk exceeds the declared 1 MiB limit")
                chunk_path = CUSTODY / chunk["path"]
                size, digest = digest_file(chunk_path)
                if size != chunk["bytes"] or digest != chunk["sha256"]:
                    raise AssertionError(f"chunk hash/size differs: {chunk['path']}")
                with chunk_path.open("rb") as source:
                    shutil.copyfileobj(source, target)
                prior_offset += size

        rebuilt_size, rebuilt_sha = digest_file(rebuilt)
        if rebuilt_size != archive_row["bytes"] or rebuilt_sha != archive_row["sha256"]:
            raise AssertionError("reassembled chunks do not match the manifest archive hash")
        if int.from_bytes(rebuilt.read_bytes()[4:8], "little") != 0:
            raise AssertionError("gzip timestamp is not zero")

        expected = {row["path"]: row for row in members}
        if list(expected) != sorted(expected):
            raise AssertionError("member catalog is not sorted")
        seen = set()
        restored_root = temporary_root / "restore"
        restored_root.mkdir()
        with tarfile.open(rebuilt, mode="r:gz") as archive:
            actual_names = [member.name for member in archive.getmembers()]
            if actual_names != sorted(expected):
                raise AssertionError("archive members differ from the manifest catalog")
            for member in archive.getmembers():
                relative = PurePosixPath(member.name)
                if relative.is_absolute() or ".." in relative.parts or not member.isfile():
                    raise AssertionError(f"unsafe or unsupported archive member: {member.name}")
                if member.name.startswith("compiled-capabilities/coordination/acceptance/custody/"):
                    raise AssertionError("custody output recursively appears in the archive")
                row = expected[member.name]
                stream = archive.extractfile(member)
                if stream is None:
                    raise AssertionError(f"archive member cannot be read: {member.name}")
                with stream:
                    size, digest = digest_stream(stream)
                if size != row["bytes"] or digest != row["sha256"]:
                    raise AssertionError(f"archive member hash/size differs: {member.name}")

                # Read again for the complete extraction-and-hash round trip.
                stream = archive.extractfile(member)
                if stream is None:
                    raise AssertionError(f"archive member cannot be restored: {member.name}")
                target = restored_root.joinpath(*relative.parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                with stream, target.open("wb") as output:
                    shutil.copyfileobj(stream, output)
                target.chmod(int(row["mode_octal"], 8))
                restored_size, restored_sha = digest_file(target)
                if restored_size != row["bytes"] or restored_sha != row["sha256"]:
                    raise AssertionError(f"restored member hash/size differs: {member.name}")
                seen.add(member.name)
        if seen != set(expected):
            raise AssertionError("archive member set differs from the manifest")

    unchanged_sources = []
    for row in members:
        source = ROOT / row["path"]
        if not source.is_file():
            raise FileNotFoundError(f"catalog source is no longer present: {row['path']}")
        size, digest = digest_file(source)
        if size != row["bytes"] or digest != row["sha256"]:
            raise AssertionError(f"source changed after freeze: {row['path']}")
        unchanged_sources.append(row["path"])

    names = set(expected)
    e_packets = ["E-BUILD", "E-DEMO", "E-FIX-GO", "E-GO", "E-HARNESS", "E-HOST", "E-ORACLE"]
    xr_packets = ["XR-BUILD", "XR-DEMO", "XR-FIX-GO", "XR-GO", "XR-HARNESS", "XR-HOST", "XR-ORACLE"]
    for packet in e_packets:
        for path in [
            f"compiled-capabilities/coordination/reports/{packet}.md",
            f"compiled-capabilities/coordination/receipts/{packet}.json",
        ]:
            if path not in names:
                raise AssertionError(f"closed author packet is missing: {path}")
    for packet in xr_packets:
        for path in [
            f"compiled-capabilities/coordination/reviews/{packet}.md",
            f"compiled-capabilities/coordination/receipts/{packet}.json",
        ]:
            if path not in names:
                raise AssertionError(f"closed review packet is missing: {path}")
    prohibited_fragments = [
        "compiled-capabilities/coordination/state.json",
        "/E-FIX-HARNESS.",
        "/E-FIX-BUILD.",
        "/E-PREP-",
        "/XR-PREP-",
        "compiled-capabilities/coordination/reviews/XR-FIX-HARNESS/",
        "compiled-capabilities/coordination/reviews/XR-FIX-HARNESS.md",
        "compiled-capabilities/coordination/receipts/XR-FIX-HARNESS.json",
        "compiled-capabilities/coordination/acceptance/custody/",
    ]
    for path in names:
        if any(fragment in path for fragment in prohibited_fragments):
            raise AssertionError(f"excluded mutable or preparation file is present: {path}")

    expected_attempts = [
        "compiled-capabilities/conformance/evidence/attempt-01/",
        "compiled-capabilities/conformance/evidence/attempt-02/",
        "compiled-capabilities/conformance/evidence/attempt-03/",
        "compiled-capabilities/demo/evidence/attempt-00/",
    ]
    attempt_counts = {prefix: sum(path.startswith(prefix) for path in names) for prefix in expected_attempts}
    if any(count == 0 for count in attempt_counts.values()):
        raise AssertionError("one of the required original evidence attempts is missing")
    if any("attempt-04/" in path for path in names):
        raise AssertionError("a post-freeze attempt was included")
    required_failed_log = "compiled-capabilities/coordination/epoch-03-failed-nonoptimal.log"
    if required_failed_log not in names:
        raise AssertionError("the preserved failed native epoch-03 log is missing")

    return {
        "status": "verified",
        "memberCount": len(seen),
        "sourceBytes": sum(row["bytes"] for row in members),
        "sourceFilesStillMatch": len(unchanged_sources),
        "archiveBytes": rebuilt_size,
        "archiveSha256": rebuilt_sha,
        "chunkCount": len(chunks),
        "chunksVerifiedIndividually": len(chunks),
        "membersVerifiedAndRestored": len(seen),
        "attemptMemberCounts": attempt_counts,
        "failedNativeEpochLogPresent": True,
    }


if __name__ == "__main__":
    print(json.dumps(verify(), indent=2, sort_keys=True))
