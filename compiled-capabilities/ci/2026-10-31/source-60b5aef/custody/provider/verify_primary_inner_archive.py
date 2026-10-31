#!/usr/bin/env python3
"""Check the hosted E-BUILD receipt, snapshot, manifest, and complete inner tar."""
from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import tarfile


BASE = Path(__file__).resolve().parent / "primary-push-run-41193504188-extracted"
ATTEMPT = BASE / "compiled-capabilities/builds/attempts/attempt-20261031T103752934Z"
RECEIPT_PATH = BASE / "compiled-capabilities/coordination/receipts/E-BUILD.json"
RECEIPT_COPY = Path(__file__).resolve().parent / "primary-push-run-41193504188-e-build-receipt.json"
MANIFEST_COPY = Path(__file__).resolve().parent / "primary-push-run-41193504188-archive-manifest.json"
SNAPSHOT_COPY = Path(__file__).resolve().parent / "primary-push-run-41193504188-execution-before-archive.json"
RESULT = Path(__file__).resolve().parent / "primary-push-run-41193504188-inner-verification.json"


def digest_file(path: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    n = 0
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
            n += len(chunk)
    return n, h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_tar_path(name: str) -> str:
    p = PurePosixPath(name)
    if not name or "\\" in name or name.startswith("/") or any(x in ("", ".", "..") for x in p.parts):
        raise ValueError(f"unsafe tar path {name!r}")
    if ":" in p.parts[0]:
        raise ValueError(f"drive-like tar path {name!r}")
    return p.as_posix().rstrip("/")


def main() -> None:
    receipt_bytes = RECEIPT_PATH.read_bytes()
    receipt = json.loads(receipt_bytes)
    if receipt["schema"] != "gobi.compiled-capabilities-execution/v1":
        raise ValueError("unexpected E-BUILD schema")
    if (receipt["job_id"], receipt["worker"], receipt["mode"], receipt["status"], receipt["sourcePinsMatch"]) != ("E-BUILD", "N6", "full", "passed", True):
        raise ValueError("hosted E-BUILD receipt is not a passing full source-pinned execution")
    if receipt["failures"]:
        raise ValueError(f"hosted E-BUILD has {len(receipt['failures'])} failure(s)")

    attempt = receipt["attempt"]
    if attempt != "compiled-capabilities/builds/attempts/attempt-20261031T103752934Z":
        raise ValueError(f"unexpected attempt path {attempt!r}")
    archive_info = receipt["archive"]
    archive_path = BASE / archive_info["path"]
    archive_bytes, archive_sha = digest_file(archive_path)
    if (archive_bytes, archive_sha) != (archive_info["bytes"], archive_info["sha256"]):
        raise ValueError("inner tar bytes/SHA do not match E-BUILD receipt")

    manifest_path = BASE / archive_info["manifest"]["path"]
    manifest_bytes, manifest_sha = digest_file(manifest_path)
    if (manifest_bytes, manifest_sha) != (archive_info["manifest"]["bytes"], archive_info["manifest"]["sha256"]):
        raise ValueError("archive manifest bytes/SHA do not match E-BUILD receipt")
    manifest = json.loads(manifest_path.read_bytes())
    if manifest["schema"] != "gobi.compiled-capabilities-archive/v1":
        raise ValueError("unexpected archive manifest schema")
    if manifest["members"] != archive_info["members"]:
        raise ValueError("manifest member list differs from final receipt member list")
    if len(manifest["members"]) != archive_info["memberCount"]:
        raise ValueError("manifest member count differs from receipt")
    if sum(member["bytes"] for member in manifest["members"]) != archive_info["memberBytes"]:
        raise ValueError("manifest total member bytes differs from receipt")

    snapshot_info = archive_info["executionSnapshot"]
    snapshot_path = BASE / snapshot_info["path"]
    snapshot_bytes, snapshot_sha = digest_file(snapshot_path)
    if (snapshot_bytes, snapshot_sha) != (snapshot_info["bytes"], snapshot_info["sha256"]):
        raise ValueError("immutable execution-before-archive snapshot bytes/SHA differ from receipt")
    snapshot = json.loads(snapshot_path.read_bytes())
    if snapshot.get("status") != "archive_pending" or snapshot.get("archivePending") is not True or snapshot.get("finalAcceptance") is not False:
        raise ValueError("execution-before-archive snapshot is not marked archive_pending")

    # Fully consume the gzip stream to EOF; gzip verifies the trailer CRC and ISIZE.
    uncompressed = hashlib.sha256()
    uncompressed_bytes = 0
    with gzip.open(archive_path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            uncompressed.update(chunk)
            uncompressed_bytes += len(chunk)

    expected = {member["path"]: member for member in manifest["members"]}
    if len(expected) != len(manifest["members"]):
        raise ValueError("duplicate paths in archive manifest")
    observed: dict[str, dict[str, object]] = {}
    directories: list[str] = []
    with tarfile.open(archive_path, "r:gz") as archive:
        for member in archive.getmembers():
            path = safe_tar_path(member.name)
            if member.isdir():
                directories.append(path)
                continue
            if not member.isfile():
                raise ValueError(f"unsupported tar member type: {member.name!r}")
            if path in observed:
                raise ValueError(f"duplicate tar file path: {path!r}")
            if path not in expected:
                raise ValueError(f"unmanifested tar file: {path!r}")
            if member.size != expected[path]["bytes"]:
                raise ValueError(f"tar size mismatch for {path!r}")
            stream = archive.extractfile(member)
            if stream is None:
                raise ValueError(f"could not read tar member: {path!r}")
            h = hashlib.sha256()
            n = 0
            with stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    h.update(chunk)
                    n += len(chunk)
            observed[path] = {"bytes": n, "sha256": h.hexdigest()}
    if set(observed) != set(expected):
        missing = sorted(set(expected) - set(observed))
        raise ValueError(f"tar is missing {len(missing)} manifest file(s)")
    for path, item in expected.items():
        if (observed[path]["bytes"], observed[path]["sha256"]) != (item["bytes"], item["sha256"]):
            raise ValueError(f"tar content SHA/size mismatch for {path!r}")

    if not archive_info["roundTripVerified"] or not archive_info["sourceAfterMatchesSourceBefore"] or not archive_info["sourceAfterMatchesPreArchiveSnapshot"]:
        raise ValueError("receipt round-trip or source stability flags did not pass")
    if archive_info["preArchiveSourcePins"] != archive_info["sourcePinsAtPreArchive"]:
        raise ValueError("pre-archive source pin snapshots differ")
    if receipt["sourceBefore"] != receipt["sourceAfter"] or receipt["sourceBefore"] != archive_info["sourcePinsAtPreArchive"]:
        raise ValueError("before/after/pre-archive source pin snapshots differ")

    # Preserve exact evidence copies beside the verifier for downstream audits.
    if any(path.exists() for path in (RECEIPT_COPY, MANIFEST_COPY, SNAPSHOT_COPY, RESULT)):
        raise SystemExit("refusing to overwrite existing inner-verification outputs")
    RECEIPT_COPY.write_bytes(receipt_bytes)
    MANIFEST_COPY.write_bytes(manifest_path.read_bytes())
    SNAPSHOT_COPY.write_bytes(snapshot_path.read_bytes())
    result = {
        "schema": "gobi.primary-inner-archive-verification/v1",
        "receipt_path": str(RECEIPT_PATH),
        "receipt_sha256": sha256_bytes(receipt_bytes),
        "receipt_status": receipt["status"],
        "receipt_mode": receipt["mode"],
        "receipt_failures": len(receipt["failures"]),
        "receipt_source_pins_match": receipt["sourcePinsMatch"],
        "attempt": attempt,
        "archive_path": str(archive_path),
        "archive_bytes": archive_bytes,
        "archive_sha256": archive_sha,
        "manifest_bytes": manifest_bytes,
        "manifest_sha256": manifest_sha,
        "manifest_file_count": len(expected),
        "manifest_total_file_bytes": archive_info["memberBytes"],
        "tar_verified_file_count": len(observed),
        "tar_directory_count": len(directories),
        "tar_members_match_manifest": True,
        "gzip_consumed_to_eof_and_trailer_valid": True,
        "gzip_uncompressed_bytes": uncompressed_bytes,
        "gzip_uncompressed_sha256": uncompressed.hexdigest(),
        "execution_snapshot_path": str(snapshot_path),
        "execution_snapshot_bytes": snapshot_bytes,
        "execution_snapshot_sha256": snapshot_sha,
        "execution_snapshot_status": snapshot["status"],
        "receipt_round_trip_verified": archive_info["roundTripVerified"],
        "source_pin_sets_identical": True,
        "copied_receipt": str(RECEIPT_COPY),
        "copied_manifest": str(MANIFEST_COPY),
        "copied_snapshot": str(SNAPSHOT_COPY),
    }
    RESULT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
