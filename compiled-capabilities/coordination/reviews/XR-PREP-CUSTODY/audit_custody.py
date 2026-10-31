#!/usr/bin/env python3
"""Independent read-only reconstruction and member/source audit of N4 custody."""

from __future__ import annotations

import hashlib
import io
import json
import posixpath
import re
import stat
import tarfile
import tempfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[4]
CUSTODY = ROOT / "compiled-capabilities/coordination/acceptance/custody"
REVIEW = Path(__file__).resolve().parent
CHUNK_MAX = 1024 * 1024
EXPECTED_ATTEMPTS = [
    "compiled-capabilities/conformance/evidence/attempt-01",
    "compiled-capabilities/conformance/evidence/attempt-02",
    "compiled-capabilities/conformance/evidence/attempt-03",
    "compiled-capabilities/demo/evidence/attempt-00",
]
EXPECTED_AUTHORS = ["E-BUILD", "E-DEMO", "E-FIX-GO", "E-GO", "E-HARNESS", "E-HOST", "E-ORACLE"]
EXPECTED_REVIEWS = ["XR-BUILD", "XR-DEMO", "XR-FIX-GO", "XR-GO", "XR-HARNESS", "XR-HOST", "XR-ORACLE"]


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_pin(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while block := stream.read(CHUNK_MAX):
            size += len(block)
            digest.update(block)
    return size, digest.hexdigest()


def expected_selection(manifest: dict) -> list[Path]:
    selection = manifest["selection"]
    assert selection["focusedAttempts"] == EXPECTED_ATTEMPTS
    assert selection["closedAuthorPacketIds"] == EXPECTED_AUTHORS
    assert selection["closedReviewPacketIds"] == EXPECTED_REVIEWS
    assert selection["preservedNativeFailureLog"] == "compiled-capabilities/coordination/epoch-03-failed-nonoptimal.log"
    assert selection["reviewDirectoriesIncludeAllFiles"] is True
    selected: set[Path] = set()
    for relative in EXPECTED_ATTEMPTS:
        directory = ROOT / relative
        assert directory.is_dir(), f"selected evidence directory is missing: {relative}"
        selected.update(path for path in directory.rglob("*") if path.is_file())
    for packet in EXPECTED_AUTHORS:
        for relative in (
            f"compiled-capabilities/coordination/reports/{packet}.md",
            f"compiled-capabilities/coordination/receipts/{packet}.json",
        ):
            path = ROOT / relative
            assert path.is_file(), f"closed author packet is missing: {relative}"
            selected.add(path)
    for packet in EXPECTED_REVIEWS:
        for relative in (
            f"compiled-capabilities/coordination/reviews/{packet}.md",
            f"compiled-capabilities/coordination/receipts/{packet}.json",
        ):
            path = ROOT / relative
            assert path.is_file(), f"closed review packet is missing: {relative}"
            selected.add(path)
        directory = ROOT / f"compiled-capabilities/coordination/reviews/{packet}"
        if directory.is_dir():
            selected.update(path for path in directory.rglob("*") if path.is_file())
    failure = ROOT / selection["preservedNativeFailureLog"]
    assert failure.is_file(), "preserved native failure log is missing"
    selected.add(failure)
    return sorted(selected, key=lambda path: path.relative_to(ROOT).as_posix())


def main() -> None:
    manifest_path = CUSTODY / "manifest.json"
    archive_path = CUSTODY / "evidence.tar.gz"
    receipt_path = ROOT / "compiled-capabilities/coordination/receipts/E-PREP-CUSTODY.json"
    manifest_bytes_before = manifest_path.read_bytes()
    archive_bytes = archive_path.read_bytes()
    manifest = json.loads(manifest_bytes_before)
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert manifest["schema"] == "gobi.compiled-capability-custody/v1"
    assert receipt["job_id"] == "E-PREP-CUSTODY" and receipt["worker"] == "N4"
    archive_row = manifest["archive"]
    receipt_archive = receipt["archive"]
    assert len(archive_bytes) == archive_row["bytes"] == receipt_archive["bytes"] == 13_252_799
    archive_sha = sha(archive_bytes)
    assert archive_sha == archive_row["sha256"] == receipt_archive["sha256"] == "c40e8a0c2fecef574c118992dc85ba4ca1e2f5b1785a9b29fc588ff49f034324"
    assert sha(manifest_bytes_before) == receipt["manifest"]["sha256"]
    assert len(manifest_bytes_before) == receipt["manifest"]["bytes"]
    for key, relative in (
        ("builder", "compiled-capabilities/coordination/acceptance/custody/build_custody.py"),
        ("verifier", "compiled-capabilities/coordination/acceptance/custody/verify_custody.py"),
    ):
        assert sha((ROOT / relative).read_bytes()) == receipt["custodyScripts"][key]["sha256"]
    assert archive_bytes[3] == 0, "gzip FNAME/optional flags must be clear for an empty filename field"
    assert int.from_bytes(archive_bytes[4:8], "little") == 0, "gzip timestamp is not zero"

    chunks = manifest["chunking"]["chunks"]
    receipt_chunks = receipt["chunks"]
    assert len(chunks) == len(receipt_chunks) == 13
    chunk_files = sorted((CUSTODY / "chunks").glob("*.bin"))
    assert len(chunk_files) == 13
    expected_chunk_paths = [f"chunks/part-{index:04d}.bin" for index in range(1, 14)]
    assert [row["path"] for row in chunks] == expected_chunk_paths
    assert [path.name for path in chunk_files] == [Path(path).name for path in expected_chunk_paths]

    custody_pins_before = {path: sha(path.read_bytes()) for path in [manifest_path, archive_path, *chunk_files]}
    offsets = []
    total_chunk_bytes = 0
    with tempfile.TemporaryDirectory(prefix="xr-prep-custody-", dir=REVIEW) as temp:
        rebuilt_path = Path(temp) / "reconstructed-evidence.tar.gz"
        offset = 0
        with rebuilt_path.open("wb") as output:
            for index, (chunk, receipt_chunk) in enumerate(zip(chunks, receipt_chunks), start=1):
                assert chunk["index"] == receipt_chunk["index"] == index
                assert chunk["offset"] == offset, f"chunk {index} has a noncontiguous offset"
                assert chunk["path"] == expected_chunk_paths[index - 1]
                assert receipt_chunk["path"] == f"compiled-capabilities/coordination/acceptance/custody/{chunk['path']}"
                chunk_path = CUSTODY / chunk["path"]
                block = chunk_path.read_bytes()
                block_sha = sha(block)
                assert len(block) == chunk["bytes"] == receipt_chunk["bytes"]
                assert block_sha == chunk["sha256"] == receipt_chunk["sha256"]
                assert 0 < len(block) <= CHUNK_MAX
                if index < 13:
                    assert len(block) == CHUNK_MAX
                output.write(block)
                offsets.append(offset)
                offset += len(block)
                total_chunk_bytes += len(block)
        rebuilt = rebuilt_path.read_bytes()
        assert len(rebuilt) == total_chunk_bytes == len(archive_bytes)
        rebuilt_sha = sha(rebuilt)
        assert rebuilt_sha == archive_sha, "independent chunk concatenation differs from the archive"

        selected_paths = expected_selection(manifest)
        expected_names = [path.relative_to(ROOT).as_posix() for path in selected_paths]
        rows = manifest["members"]
        assert len(rows) == 127
        assert [row["path"] for row in rows] == expected_names, "manifest is not the exact selected path set"
        assert len(set(expected_names)) == len(expected_names)
        source_bytes = 0
        tar_names = []
        with tarfile.open(rebuilt_path, mode="r:gz") as archive:
            members = archive.getmembers()
            assert len(members) == 127
            tar_names = [member.name for member in members]
            assert tar_names == sorted(expected_names), "tar paths/order differ from the exact catalog"
            for member, row, source in zip(members, rows, selected_paths):
                name = member.name
                relative = PurePosixPath(name)
                assert name == row["path"]
                assert "\\" not in name and "\x00" not in name
                assert not relative.is_absolute() and ".." not in relative.parts and "." not in relative.parts
                assert posixpath.normpath(name) == name and not re.match(r"^[A-Za-z]:", name)
                assert member.isfile(), f"non-regular archive member: {name}"
                assert stat.S_IMODE(member.mode) == int(row["mode_octal"], 8)
                assert member.uid == 0 and member.gid == 0 and member.mtime == 0
                assert member.uname == "" and member.gname == ""
                source_stat = source.lstat()
                assert stat.S_ISREG(source_stat.st_mode), f"source is not a regular file: {name}"
                assert stat.S_IMODE(source_stat.st_mode) == int(row["mode_octal"], 8)
                tar_stream = archive.extractfile(member)
                assert tar_stream is not None
                digest_tar = hashlib.sha256()
                digest_source = hashlib.sha256()
                size_tar = size_source = 0
                with tar_stream, source.open("rb") as source_stream:
                    while block := tar_stream.read(CHUNK_MAX):
                        source_block = source_stream.read(len(block))
                        assert block == source_block, f"archive bytes differ from original source: {name}"
                        digest_tar.update(block)
                        digest_source.update(source_block)
                        size_tar += len(block)
                        size_source += len(source_block)
                    assert source_stream.read(1) == b"", f"source has trailing bytes: {name}"
                assert size_tar == size_source == row["bytes"]
                assert digest_tar.hexdigest() == digest_source.hexdigest() == row["sha256"]
                source_bytes += size_source

    assert source_bytes == 295_193_643 == receipt["memberCatalog"]["totalBytes"]
    assert receipt["memberCatalog"]["memberCount"] == 127
    assert manifest["verification"]["verifiedChunkCount"] == 13
    assert manifest["verification"]["reassembledArchiveSha256"] == rebuilt_sha
    assert manifest["verification"]["reassembledArchiveBytes"] == len(archive_bytes)

    excluded = [
        "compiled-capabilities/coordination/state.json",
        "compiled-capabilities/coordination/reports/E-FIX-HARNESS.md",
        "compiled-capabilities/coordination/receipts/E-FIX-HARNESS.json",
        "compiled-capabilities/coordination/reports/E-FIX-BUILD.md",
        "compiled-capabilities/coordination/receipts/E-FIX-BUILD.json",
        "compiled-capabilities/coordination/reports/E-PREP-CUSTODY.md",
        "compiled-capabilities/coordination/receipts/E-PREP-CUSTODY.json",
        "compiled-capabilities/coordination/reviews/XR-PREP-CUSTODY.md",
        "compiled-capabilities/coordination/receipts/XR-PREP-CUSTODY.json",
        "compiled-capabilities/coordination/reviews/XR-FIX-BUILD.md",
        "compiled-capabilities/coordination/receipts/XR-FIX-BUILD.json",
        "compiled-capabilities/conformance/evidence/attempt-04",
        "compiled-capabilities/conformance/evidence/attempt-05",
        "compiled-capabilities/coordination/acceptance/custody/",
    ]
    member_names = set(expected_names)
    for path in excluded:
        if path.endswith("/"):
            assert not any(name.startswith(path) for name in member_names), f"excluded subtree is present: {path}"
        elif path.endswith("attempt-04") or path.endswith("attempt-05"):
            assert not any(name.startswith(path + "/") for name in member_names), f"new attempt is present: {path}"
        else:
            assert path not in member_names, f"excluded mutable/repair/PREP input is present: {path}"
    assert manifest["knownUncapturedFailureNotes"] == receipt["knownUncapturedFailureNotes"]
    assert manifest["exclusions"] == receipt["excluded"]
    assert receipt["selection"]["focusedAttempts"] == EXPECTED_ATTEMPTS
    assert receipt["selection"]["closedAuthorPacketIds"] == EXPECTED_AUTHORS
    assert receipt["selection"]["closedReviewPacketIds"] == EXPECTED_REVIEWS
    assert receipt["verified"]["tarMembers"] == receipt["verified"]["restoredMembers"] == 127
    assert receipt["verified"]["verifiedChunkCount"] == 13
    assert receipt["verified"]["sourceHashesUnchangedAfterBuild"] is True
    assert receipt["verified"]["reassembledArchiveSha256"] == rebuilt_sha
    assert receipt["verified"]["reassembledArchiveBytes"] == len(archive_bytes)
    assert receipt["verified"]["reproducibleRebuildFromPreviousManifest"] is True
    assert receipt["archive"]["reproducibility"]["gzipMtime"] == 0
    assert receipt["archive"]["reproducibility"]["gzipFilenameHeader"] == "empty"
    assert receipt["archive"]["reproducibility"]["tarOwner"] == 0
    assert receipt["archive"]["reproducibility"]["tarGroup"] == 0
    assert receipt["archive"]["reproducibility"]["tarMtime"] == 0
    attempt_counts = {
        prefix: sum(name.startswith(prefix + "/") for name in member_names)
        for prefix in EXPECTED_ATTEMPTS
    }
    assert attempt_counts == {
        EXPECTED_ATTEMPTS[0]: 10,
        EXPECTED_ATTEMPTS[1]: 14,
        EXPECTED_ATTEMPTS[2]: 15,
        EXPECTED_ATTEMPTS[3]: 3,
    }
    demo_report = (ROOT / "compiled-capabilities/coordination/reports/E-DEMO.md").read_text(encoding="utf-8")
    host_report = (ROOT / "compiled-capabilities/coordination/reports/E-HOST.md").read_text(encoding="utf-8")
    custody_report = (ROOT / "compiled-capabilities/coordination/reports/E-PREP-CUSTODY.md").read_text(encoding="utf-8")
    assert "That first tool output was not saved separately." in demo_report
    assert "The first failed invocations were not separately captured." in host_report
    assert "The initial tool output for that intermediate pass was not tee'd to a file" in host_report
    assert "Four consecutive builds of the same selection produced the same archive SHA-256." in custody_report
    assert receipt["verified"]["previousArchiveSha256"] == archive_sha

    custody_pins_after = {path: sha(path.read_bytes()) for path in [manifest_path, archive_path, *chunk_files]}
    assert custody_pins_before == custody_pins_after, "read-only audit changed custody archive, manifest, or chunks"

    print(json.dumps({
        "status": "independently-verified",
        "chunkCount": len(chunks),
        "chunkBytes": total_chunk_bytes,
        "reassembledArchiveBytes": len(archive_bytes),
        "reassembledArchiveSha256": rebuilt_sha,
        "tarMembers": len(tar_names),
        "sourceMembersByteCompared": 127,
        "sourceBytes": source_bytes,
        "attemptMemberCounts": attempt_counts,
        "safeRelativeRegularMembers": True,
        "exactSelectedPathSet": True,
        "excludedMutableRepairPrepAndNewAttemptsAbsent": True,
        "knownUncapturedFailureNotesMatchReceipt": True,
        "uncapturedFailureCaveatsCorroboratedByClosedReports": True,
        "custodyFilesUnchanged": True,
        "authorReportsFourIdenticalBuilds": True,
        "independentRebuildsPerformed": 1,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
