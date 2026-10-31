#!/usr/bin/env python3
"""Independent, extraction-free verification of the closed lifecycle archive."""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import posixpath
import platform
import tarfile
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[4]
REVIEW = ROOT / "compiled-lifecycle/coordination/reviews/xr-archive"
ARCHIVE = Path("/tmp/gondola-lifecycle-history.tar.gz")
INVENTORY_PATH = ROOT / "compiled-lifecycle/coordination/archive/members.json"
REPORT_PATH = ROOT / "compiled-lifecycle/coordination/reports/E-ARCHIVE.md"
RECEIPT_PATH = ROOT / "compiled-lifecycle/coordination/receipts/E-ARCHIVE.json"


def digest_stream(stream) -> tuple[int, str]:
    h = hashlib.sha256()
    size = 0
    while True:
        chunk = stream.read(1024 * 1024)
        if not chunk:
            break
        size += len(chunk)
        h.update(chunk)
    return size, h.hexdigest()


def digest_file(path: Path) -> tuple[int, str]:
    with path.open("rb") as stream:
        return digest_stream(stream)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def safe_name(name: str, is_directory: bool) -> str:
    require("\\" not in name, f"backslash in tar path: {name!r}")
    require(not name.startswith("/"), f"absolute tar path: {name!r}")
    normalized = name[:-1] if is_directory and name.endswith("/") else name
    require(normalized != "", "empty tar path")
    require(posixpath.normpath(normalized) == normalized, f"non-normal tar path: {name!r}")
    path = PurePosixPath(normalized)
    require(all(part not in ("", ".", "..") for part in path.parts), f"unsafe path component: {name!r}")
    return normalized


def main() -> None:
    REVIEW.mkdir(parents=True, exist_ok=True)
    inventory_bytes = INVENTORY_PATH.read_bytes()
    report_bytes = REPORT_PATH.read_bytes()
    inventory = json.loads(inventory_bytes)
    receipt = json.loads(RECEIPT_PATH.read_bytes())

    inventory_hash = hashlib.sha256(inventory_bytes).hexdigest()
    report_hash = hashlib.sha256(report_bytes).hexdigest()
    archive_size, archive_hash = digest_file(ARCHIVE)

    require(inventory["schema"] == "gondola.lifecycle-history-archive/v1", "inventory schema")
    require(receipt["job_id"] == "E-ARCHIVE" and receipt["worker"] == "N1", "archive receipt identity")
    require(receipt["outcome"] == "mixed_change", "archive receipt outcome")
    require(receipt["evidence"]["report_sha256"] == report_hash, "E-ARCHIVE report receipt hash")
    require(receipt["evidence"]["inventory"]["sha256"] == inventory_hash, "inventory receipt hash")
    require(receipt["evidence"]["archive"]["sha256"] == archive_hash, "archive receipt hash")
    require(inventory["archive"]["sha256"] == archive_hash, "archive inventory hash")
    require(inventory["archive"]["bytes"] == archive_size, "archive byte length")
    require(archive_size == 20_398_966, "claimed compressed archive size")
    require(archive_hash == "09d8f49c7d039a44ad0ba1e10973aaa1d2a7c561c6972f05d1ceb24dba47f4a6", "claimed archive digest")
    require(inventory_hash == "716d61ef287c3a4b0cffdb1a79d41710489d8fd0ce580197e19392b3255cd9f5", "claimed inventory digest")
    require(report_hash == "c8a0094dfaadae26598af8f8a9a81a0116d69ee172ef7cae72dc7ba39eab3a34", "claimed report digest")

    file_entries = inventory["members"]
    directory_entries = inventory["directories"]
    expected_files = {entry["path"]: entry for entry in file_entries}
    expected_directories = {entry["path"]: entry for entry in directory_entries}
    require(len(expected_files) == len(file_entries), "duplicate file paths in inventory")
    require(len(expected_directories) == len(directory_entries), "duplicate directory paths in inventory")
    require(not (expected_files.keys() & expected_directories.keys()), "file/directory path collision in inventory")
    require(inventory["regular_member_count"] == len(expected_files) == 261, "regular file count")
    require(inventory["directory_member_count"] == len(expected_directories) == 92, "directory count")
    require(inventory["archive_member_count"] == len(expected_files) + len(expected_directories) == 353,
            "total tar member count")
    require(inventory["total_uncompressed_bytes"] == 435_916_585, "inventory total file bytes")
    require(sum(entry["bytes"] for entry in file_entries) == 435_916_585, "sum of inventory file bytes")

    roots = inventory["member_roots"]
    require(roots == receipt["evidence"]["included_roots"], "receipt/inventory root list")
    require(len(roots) == 16 and len(set(roots)) == 16, "selected root count and uniqueness")
    for root in roots:
        require(root in expected_directories, f"selected root directory absent: {root}")
        require(any(path.startswith(root + "/") for path in expected_files), f"selected root has no files: {root}")

    actual_files: dict[str, dict] = {}
    actual_directories: dict[str, dict] = {}
    archive_order: list[str] = []
    target_json: dict[str, bytearray] = {}
    status_paths = {
        f"compiled-lifecycle/conformance/evidence/attempt-{i:02d}/lifecycle.run.json"
        for i in range(6)
    }
    status_paths |= {
        "compiled-lifecycle/conformance/evidence/attempt-05/lifecycle.check.json",
        "compiled-lifecycle/demo/evidence/attempt-01-slice-abi-failure/attempt.json",
    }

    with tarfile.open(ARCHIVE, mode="r|gz") as tf:
        for info in tf:
            is_dir = info.isdir()
            name = safe_name(info.name, is_dir)
            archive_order.append(name)
            require(name not in actual_files and name not in actual_directories, f"duplicate tar member: {name}")
            require(any(name == root or name.startswith(root + "/") for root in roots),
                    f"tar member outside selected roots: {name}")
            if is_dir:
                require(info.size == 0, f"nonempty directory header: {name}")
                actual_directories[name] = {"bytes": 0, "sha256": None}
                continue

            require(info.isfile(), f"unsupported tar type for {name}: {info.type!r}")
            member = tf.extractfile(info)
            require(member is not None, f"could not read tar member: {name}")
            h = hashlib.sha256()
            size = 0
            capture = bytearray() if name in status_paths else None
            while True:
                chunk = member.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk)
                size += len(chunk)
                if capture is not None:
                    capture.extend(chunk)
            member.close()
            actual_files[name] = {"bytes": size, "sha256": h.hexdigest()}
            if capture is not None:
                target_json[name] = capture

    require(len(archive_order) == 353, "actual tar member count")
    require(set(actual_files) == set(expected_files), "tar file names differ from external inventory")
    require(set(actual_directories) == set(expected_directories), "tar directory names differ from external inventory")
    require(sum(value["bytes"] for value in actual_files.values()) == 435_916_585,
            "actual tar file byte sum")

    file_checks = []
    for name, expected in expected_files.items():
        actual = actual_files[name]
        require(actual["bytes"] == expected["bytes"], f"tar/inventory byte mismatch: {name}")
        require(actual["sha256"] == expected["sha256"], f"tar/inventory SHA mismatch: {name}")
        source_path = ROOT / name
        require(source_path.is_file() and not source_path.is_symlink(), f"current source missing or not regular: {name}")
        source_size, source_hash = digest_file(source_path)
        require(source_size == expected["bytes"], f"current source/inventory byte mismatch: {name}")
        require(source_hash == expected["sha256"], f"current source/inventory SHA mismatch: {name}")
        file_checks.append({"path": name, "bytes": actual["bytes"], "sha256": actual["sha256"],
                            "matches_inventory": True, "matches_current_source": True})

    directory_checks = []
    for name, expected in expected_directories.items():
        require(expected["bytes"] == 0 and expected["sha256"] is None, f"directory inventory shape: {name}")
        path = ROOT / name
        require(path.is_dir() and not path.is_symlink(), f"current source directory missing or symlink: {name}")
        directory_checks.append({"path": name, "matches_inventory": True, "matches_current_source": True})

    current_files: set[str] = set()
    current_directories: set[str] = set()
    for root in roots:
        root_path = ROOT / root
        for parent, dirnames, filenames in os.walk(root_path, followlinks=False):
            dirnames.sort()
            filenames.sort()
            parent_path = Path(parent)
            rel_parent = parent_path.relative_to(ROOT).as_posix()
            current_directories.add(rel_parent)
            for dirname in list(dirnames):
                path = parent_path / dirname
                require(not path.is_symlink(), f"symlink directory in selected source tree: {path}")
                current_directories.add(path.relative_to(ROOT).as_posix())
            for filename in filenames:
                path = parent_path / filename
                require(not path.is_symlink() and path.is_file(), f"special source file in selected tree: {path}")
                current_files.add(path.relative_to(ROOT).as_posix())
    require(current_files == set(expected_files), "selected source tree has missing or unarchived files")
    require(current_directories == set(expected_directories), "selected source tree has missing or unarchived directories")

    require(all(root in expected_directories for root in roots), "selected roots are represented")
    conformance_paths = [name for name in actual_files if name.startswith("compiled-lifecycle/conformance/evidence/attempt-")]
    conformance_attempts = sorted({name.split("/attempt-", 1)[1].split("/", 1)[0] for name in conformance_paths})
    require(conformance_attempts == ["00", "01", "02", "03", "04", "05"],
            f"unexpected conformance attempts: {conformance_attempts}")
    demo_attempts = sorted({name.split("/attempt-", 1)[1].split("/", 1)[0] for name in actual_files
                            if name.startswith("compiled-lifecycle/demo/evidence/attempt-")})
    require(demo_attempts == ["01-slice-abi-failure"], f"unexpected demo attempts: {demo_attempts}")
    require(not any("/attempt-06/" in name or "/attempt-07/" in name for name in actual_files),
            "active later full attempt included")
    require(not any(name.startswith("compiled-lifecycle/coordination/archive/") for name in archive_order),
            "archive inventory recursively included")
    require(not any("/r-portable-test" in name for name in archive_order), "excluded portable review included")
    require(not any(name.startswith("node_modules/") or "/node_modules/" in name for name in archive_order),
            "node_modules content included")

    statuses = {}
    for index in range(6):
        path = f"compiled-lifecycle/conformance/evidence/attempt-{index:02d}/lifecycle.run.json"
        result = json.loads(target_json[path])
        statuses[f"attempt-{index:02d}"] = result["status"]
    require([statuses[f"attempt-{i:02d}"] for i in range(5)] == ["rejected"] * 5,
            "rejected attempts 00-04 must remain rejected")
    require(statuses["attempt-05"] == "matched", "attempt-05 run status")
    check = json.loads(target_json["compiled-lifecycle/conformance/evidence/attempt-05/lifecycle.check.json"])
    require(check["status"] == "matched", "attempt-05 checker status")
    demo_failure = json.loads(target_json[
        "compiled-lifecycle/demo/evidence/attempt-01-slice-abi-failure/attempt.json"])
    require(demo_failure["status"] == "failed" and demo_failure["acceptance"] is False,
            "failed demo ABI attempt must stay labeled failed and non-acceptance")

    verification = inventory["verification"]
    require(verification["all_archive_files_match_pre_archive_source_manifest"] is True,
            "inventory pre-source match flag")
    require(verification["source_before_after_members_equal"] is True,
            "inventory source-before/after equality flag")
    require(verification["source_after_archive_members_equal_pre_archive_manifest"] is True,
            "inventory post-source match flag")
    require(verification["archive_directory_members_match_source_directories"] is True,
            "inventory directory source match flag")
    require(verification["unsupported_symlink_or_special_members"] == 0, "inventory special member count")
    require(len(verification["pre_archive_source_manifest_sha256"]) == 64, "pre-source manifest hash shape")

    # Consume the gzip stream to EOF, forcing gzip CRC/ISIZE validation independently of tar iteration.
    with gzip.open(ARCHIVE, "rb") as gz:
        decompressed_bytes, decompressed_tar_hash = digest_stream(gz)

    audit = {
        "schema": "gobi.compiled-lifecycle-xr-archive-audit/v1",
        "decision": "accepted",
        "scope": "E-ARCHIVE tar bytes and external inventory; no history attempt is promoted by this review",
        "tool": {"python": platform.python_version(), "tar_parser": "Python tarfile r|gz", "extraction": False},
        "evidence_hashes": {
            "archive_sha256": archive_hash,
            "archive_bytes": archive_size,
            "inventory_sha256": inventory_hash,
            "report_sha256": report_hash,
            "pre_archive_source_manifest_sha256": verification["pre_archive_source_manifest_sha256"],
        },
        "counts": {
            "files": len(actual_files),
            "directories": len(actual_directories),
            "total_members": len(archive_order),
            "uncompressed_file_bytes": sum(item["bytes"] for item in actual_files.values()),
            "decompressed_tar_bytes_including_headers": decompressed_bytes,
            "directory_entries_zero_size": True,
        },
        "path_safety": {
            "all_paths_relative_normalized_posix": True,
            "no_dot_or_parent_components": True,
            "no_duplicate_members": True,
            "no_symlink_hardlink_or_special_members": True,
            "all_members_under_selected_roots": True,
            "tar_members_match_inventory_paths_and_types": True,
        },
        "inventory_and_source": {
            "every_tar_file_sha_and_size_matches_inventory": True,
            "every_current_source_file_sha_and_size_matches_inventory": True,
            "every_directory_matches_current_source_tree": True,
            "selected_current_tree_has_no_unlisted_files_or_directories": True,
            "reported_source_before_after_equal": True,
            "independent_pre_snapshot_reconstruction": False,
            "source_limit": "The inventory exposes its pre/post equality result and pre-manifest digest but not two separate full snapshot files; this audit independently matched archive and current source against the per-file inventory.",
        },
        "selected_roots": roots,
        "attempt_statuses": statuses,
        "attempt_05_check_status": check["status"],
        "failed_demo_attempt": {
            "path": "compiled-lifecycle/demo/evidence/attempt-01-slice-abi-failure",
            "status": demo_failure["status"],
            "acceptance": demo_failure["acceptance"],
        },
        "exclusion_checks": {
            "conformance_attempts_present": conformance_attempts,
            "demo_attempts_present": demo_attempts,
            "later_full_attempt_included": False,
            "archive_inventory_recursively_included": False,
            "portable_review_included": False,
            "node_modules_included": False,
        },
        "source_before_after_claim": {
            "inventory_pre_post_equality_flag": verification["source_before_after_members_equal"],
            "inventory_pre_manifest_sha256": verification["pre_archive_source_manifest_sha256"],
            "archive_and_current_tree_match_inventory": True,
            "limit": "A separate pre-run source manifest file was not retained; equality is recorded in the inventory and cross-checked against archive/current bytes, but the independent pre/post scan itself cannot be replayed from two snapshots.",
        },
        "files": file_checks,
        "directories": directory_checks,
        "gzip_crc_and_size_validation": "passed to EOF",
        "decompressed_tar_sha256": decompressed_tar_hash,
    }
    (REVIEW / "audit.json").write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    (REVIEW / "member-checks.json").write_text(json.dumps({
        "schema": "gobi.compiled-lifecycle-xr-archive-members/v1",
        "files": file_checks,
        "directories": directory_checks,
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "decision": audit["decision"],
        "files": audit["counts"]["files"],
        "directories": audit["counts"]["directories"],
        "total_members": audit["counts"]["total_members"],
        "uncompressed_file_bytes": audit["counts"]["uncompressed_file_bytes"],
        "archive_sha256": archive_hash,
        "statuses": statuses,
        "audit": str(REVIEW / "audit.json"),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
