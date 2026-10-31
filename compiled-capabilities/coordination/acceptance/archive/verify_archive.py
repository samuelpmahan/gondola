#!/usr/bin/env python3
"""Read-only verifier for a completed E-BUILD capability evidence archive.

The final E-BUILD receipt and archive manifest intentionally live outside the
immutable tar. The receipt binds both by SHA-256; the manifest binds every
member by path, byte count, and SHA-256. The verifier reads archive members
without extracting them to the filesystem.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import posixpath
import re
import sys
import tarfile
import zlib
from pathlib import Path, PurePosixPath
from typing import Any


SNAPSHOT_MEMBER = "execution-before-archive.json"
SNAPSHOT_SCHEMA = "gobi.compiled-capabilities-execution-before-archive/v1"
MANIFEST_SCHEMA = "gobi.compiled-capabilities-archive/v1"
RECEIPT_SCHEMA = "gobi.compiled-capabilities-execution/v1"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
MAX_MEMBER_BYTES = 1 << 30
MAX_TOTAL_BYTES = 4 << 30
MAX_SNAPSHOT_BYTES = 64 << 20
REQUIRED_STAGES = (
    "toolchain-and-dependency-inventory",
    "m0-receipt-and-source-preservation",
    "inherited-static-and-interaction-lifecycle",
    "react-goscript-build",
    "dom-goscript-build",
    "backend-build-comparison",
    "n4-independent-literal-oracle",
    "n3-compiled-conformance",
    "n5-http-demo",
    "compiled-output-stability",
)
REQUIRED_DEPENDENCY_VERSIONS = {
    "react": "19.3.1",
    "reactDOM": "19.3.1",
    "playwright": "1.64.1",
    "esbuild": "0.28.2",
    "frontendEsbuild": "0.28.2",
}
PACKAGE_LOCK_PATHS = (
    "package-lock.json",
    "interaction/package-lock.json",
    "compiled-frontend/package-lock.json",
)
OPTIONAL_FAST_CHECK_NAMES = ("fast-check", "fastCheck")


class VerificationError(Exception):
    """Raised when a supplied receipt or archive fails closed validation."""


def fail(message: str) -> None:
    raise VerificationError(message)


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_relative_path(value: Any, label: str, *, allow_directory_slash: bool = False) -> str:
    if not isinstance(value, str) or not value or "\x00" in value or "\\" in value:
        fail(f"{label} is not a safe POSIX relative path")
    path = value
    if allow_directory_slash and path.endswith("/"):
        path = path[:-1]
    if not path or path.startswith("/") or path.startswith("//"):
        fail(f"{label} must be relative")
    parts = path.split("/")
    if any(part in ("", ".", "..") for part in parts):
        fail(f"{label} contains an empty, dot, or traversal component")
    if re.match(r"^[A-Za-z]:", parts[0]):
        fail(f"{label} contains a drive-qualified path")
    if PurePosixPath(path).is_absolute() or posixpath.normpath(path) != path:
        fail(f"{label} is not canonical")
    return path


def resolve_bound_file(root: Path, relative: Any, label: str) -> Path:
    rel = safe_relative_path(relative, label)
    base = root.resolve()
    candidate = (base / PurePosixPath(rel)).resolve(strict=True)
    try:
        candidate.relative_to(base)
    except ValueError:
        fail(f"{label} resolves outside --root")
    if not candidate.is_file():
        fail(f"{label} is not a regular file")
    return candidate


def read_json_bytes(data: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"{label} is not valid UTF-8 JSON: {exc}")
    if not isinstance(value, dict):
        fail(f"{label} must be a JSON object")
    return value


def validate_hash_record(value: Any, label: str) -> tuple[str, int, str]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    path = safe_relative_path(value.get("path"), f"{label}.path")
    size = value.get("bytes")
    digest = value.get("sha256")
    if isinstance(size, bool) or not isinstance(size, int) or size < 0:
        fail(f"{label}.bytes must be a non-negative integer")
    if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
        fail(f"{label}.sha256 must be a lowercase SHA-256 digest")
    return path, size, digest


def validate_inventory(value: Any, label: str) -> dict[str, tuple[int, str]]:
    if not isinstance(value, list) or not value:
        fail(f"{label} must be a non-empty array")
    result: dict[str, tuple[int, str]] = {}
    for index, row in enumerate(value):
        path, size, digest = validate_hash_record(row, f"{label}[{index}]")
        if path in result:
            fail(f"{label} contains duplicate path {path!r}")
        if size > MAX_MEMBER_BYTES:
            fail(f"{label} member {path!r} exceeds the verifier size limit")
        result[path] = (size, digest)
    return result


def validate_source_pins(value: Any, label: str) -> list[dict[str, Any]]:
    pins = validate_inventory(value, label)
    rows = []
    for row in value:
        path, size, digest = validate_hash_record(row, label)
        rows.append({"path": path, "bytes": size, "sha256": digest})
    rows.sort(key=lambda row: row["path"])
    return rows


def normalized_inventory(inventory: dict[str, tuple[int, str]]) -> list[dict[str, Any]]:
    return [
        {"path": path, "bytes": size, "sha256": digest}
        for path, (size, digest) in sorted(inventory.items())
    ]


def equal_source_pins(left: Any, right: Any, message: str) -> None:
    lrows = validate_source_pins(left, "source pins (left)")
    rrows = validate_source_pins(right, "source pins (right)")
    if canonical(lrows) != canonical(rrows):
        fail(message)


def validate_command_rows(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        fail(f"{label} must be an array")
    for index, row in enumerate(value):
        if not isinstance(row, dict):
            fail(f"{label}[{index}] must be an object")
        if not isinstance(row.get("name"), str) or not row["name"]:
            fail(f"{label}[{index}] is missing a command name")
        args = row.get("args")
        if not isinstance(args, list) or any(not isinstance(arg, str) for arg in args):
            fail(f"{label}[{index}].args must be a string array")
        if "exitCode" in row and (isinstance(row["exitCode"], bool) or not isinstance(row["exitCode"], int)):
            fail(f"{label}[{index}].exitCode must be an integer")
    return value


def require_prefix(prefix: list[Any], full: Any, label: str) -> None:
    if not isinstance(full, list) or len(prefix) > len(full):
        fail(f"{label} is not a prefix of the final receipt ledger")
    if canonical(prefix) != canonical(full[:len(prefix)]):
        fail(f"{label} does not match the final receipt ledger prefix")


def validate_successful_commands(rows: list[Any], label: str) -> None:
    if not rows:
        fail(f"{label} is empty")
    for index, row in enumerate(rows):
        if isinstance(row.get("exitCode"), bool) or row.get("exitCode") != 0:
            fail(f"{label}[{index}] did not exit successfully")
        if row.get("signal") is not None:
            fail(f"{label}[{index}] records signal {row.get('signal')!r}")
        if row.get("error") is not None:
            fail(f"{label}[{index}] records command error {row.get('error')!r}")


def validate_toolchain_contract(versions: dict[str, Any], source_before: list[dict[str, Any]]) -> dict[str, Any]:
    node = versions.get("node")
    if not isinstance(node, str) or not re.fullmatch(r"v22\.\d+\.\d+", node):
        fail(f"complete receipt must record Node 22.x; got {node!r}")
    root_go = versions.get("rootGo")
    if not isinstance(root_go, str) or not re.search(r"\bgo1\.24\.\d+\b", root_go):
        fail(f"complete receipt must record root Go 1.24.x; got {root_go!r}")
    compiler_go = versions.get("compiledGo")
    if not isinstance(compiler_go, str) or not re.search(r"\bgo1\.27\.3\b", compiler_go):
        fail(f"complete receipt must record compiler Go 1.27.3; got {compiler_go!r}")

    dependencies = versions.get("dependencies")
    locked = versions.get("lockedDependencies")
    if not isinstance(dependencies, dict) or not isinstance(locked, dict):
        fail("complete receipt must include installed and locked dependency maps")
    if set(dependencies) != set(locked):
        fail("installed and locked dependency maps have different package names")
    for name, expected in REQUIRED_DEPENDENCY_VERSIONS.items():
        if dependencies.get(name) != expected:
            fail(f"complete receipt must record {name} {expected}; got {dependencies.get(name)!r}")
        if locked.get(name) != expected:
            fail(f"lock metadata must pin {name} {expected}; got {locked.get(name)!r}")
    for name, installed in dependencies.items():
        if not isinstance(installed, str) or not installed:
            fail(f"installed dependency {name!r} must have a version string")
        if locked.get(name) != installed:
            fail(f"installed dependency {name!r} differs from its locked version")
    for name in OPTIONAL_FAST_CHECK_NAMES:
        if name in dependencies or name in locked:
            if dependencies.get(name) != "4.10.2" or locked.get(name) != "4.10.2":
                fail("fast-check metadata, when recorded by the runner, must agree on version 4.10.2")

    package_locks = versions.get("packageLocks")
    if not isinstance(package_locks, dict) or set(package_locks) != set(PACKAGE_LOCK_PATHS):
        fail("complete receipt must pin the root, interaction, and compiled-frontend package lockfiles")
    source_hashes = {row["path"]: row["sha256"] for row in source_before}
    for path in PACKAGE_LOCK_PATHS:
        digest = package_locks.get(path)
        if not isinstance(digest, str) or not SHA256_RE.fullmatch(digest):
            fail(f"versions.packageLocks[{path!r}] is not a SHA-256 digest")
        if source_hashes.get(path) != digest:
            fail(f"versions.packageLocks[{path!r}] differs from sourceBefore")

    return {
        "nodeMajor": 22,
        "rootGoMinor": "1.24",
        "compiledGo": "1.27.3",
        "requiredDependencies": dict(REQUIRED_DEPENDENCY_VERSIONS),
        "fastCheckVersionRecorded": any(name in dependencies for name in OPTIONAL_FAST_CHECK_NAMES),
        "packageLockPinsMatchSourceBefore": True,
        "attestation": "metadata consistency only; does not independently authenticate toolchain execution or arbitrary forged source evidence",
    }


def expected_parent_directories(paths: set[str]) -> set[str]:
    parents: set[str] = set()
    for path in paths:
        parent = PurePosixPath(path).parent
        while str(parent) not in (".", ""):
            parents.add(str(parent))
            parent = parent.parent
    return parents


def hash_tar_members(archive_bytes: bytes, manifest_inventory: dict[str, tuple[int, str]]) -> tuple[dict[str, tuple[int, str]], dict[str, bytes]]:
    files: dict[str, tuple[int, str]] = {}
    directories: set[str] = set()
    special_payloads: dict[str, bytes] = {}
    total = 0
    try:
        tar = tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz")
    except (tarfile.TarError, OSError, EOFError, zlib.error) as exc:
        fail(f"archive is not a readable gzip tar: {exc}")
    with tar:
        for info in tar.getmembers():
            raw_name = info.name
            if info.isdir():
                name = safe_relative_path(raw_name, "tar directory path", allow_directory_slash=True)
                if name in directories:
                    fail(f"archive contains duplicate directory {name!r}")
                directories.add(name)
                continue
            if not info.isreg():
                fail(f"archive contains a link or unsupported member type: {raw_name!r}")
            name = safe_relative_path(raw_name, "tar member path")
            if name in files:
                fail(f"archive contains duplicate member {name!r}")
            if name not in manifest_inventory:
                fail(f"archive contains an unmanifested member {name!r}")
            declared_size, _ = manifest_inventory[name]
            if info.size != declared_size:
                fail(f"tar header size differs from manifest for {name!r}")
            if info.size > MAX_MEMBER_BYTES:
                fail(f"archive member {name!r} exceeds the verifier size limit")
            total += info.size
            if total > MAX_TOTAL_BYTES:
                fail("archive exceeds the verifier total uncompressed size limit")
            stream = tar.extractfile(info)
            if stream is None:
                fail(f"archive member {name!r} has no readable content")
            digest = hashlib.sha256()
            chunks: list[bytes] | None = [] if name == SNAPSHOT_MEMBER else None
            count = 0
            while True:
                block = stream.read(1024 * 1024)
                if not block:
                    break
                count += len(block)
                if count > info.size:
                    fail(f"archive member {name!r} contains more data than its header")
                digest.update(block)
                if chunks is not None:
                    if count > MAX_SNAPSHOT_BYTES:
                        fail("immutable execution snapshot exceeds the verifier size limit")
                    chunks.append(block)
            if count != info.size:
                fail(f"archive member {name!r} is truncated")
            files[name] = (count, digest.hexdigest())
            if chunks is not None:
                special_payloads[name] = b"".join(chunks)
    if files.keys() != manifest_inventory.keys():
        missing = sorted(set(manifest_inventory) - set(files))
        extra = sorted(set(files) - set(manifest_inventory))
        fail(f"archive member inventory differs from manifest (missing={missing}, extra={extra})")
    file_paths = set(files)
    expected_dirs = expected_parent_directories(file_paths)
    collisions = file_paths & (directories | expected_dirs)
    if collisions:
        fail(f"archive contains regular-file/directory path collisions: {sorted(collisions)}")
    if directories != expected_dirs:
        fail(f"archive directory inventory differs from member parents (missing={sorted(expected_dirs - directories)}, extra={sorted(directories - expected_dirs)})")
    for path, (size, digest) in files.items():
        if manifest_inventory[path] != (size, digest):
            fail(f"archive round-trip hash mismatch for member {path!r}")
    return files, special_payloads


def verify_objects(receipt: dict[str, Any], manifest: dict[str, Any], archive_bytes: bytes, manifest_bytes: bytes, *, require_complete: bool) -> dict[str, Any]:
    if receipt.get("schema") != RECEIPT_SCHEMA or receipt.get("job_id") != "E-BUILD":
        fail("outer receipt is not a versioned E-BUILD execution receipt")
    if manifest.get("schema") != MANIFEST_SCHEMA:
        fail("archive manifest schema is missing or unsupported")
    if not isinstance(receipt.get("archive"), dict):
        fail("outer receipt is missing archive metadata")
    archive_meta = receipt["archive"]
    manifest_meta = archive_meta.get("manifest")
    if not isinstance(manifest_meta, dict):
        fail("outer receipt does not bind an external archive manifest")
    manifest_path, expected_manifest_size, expected_manifest_hash = validate_hash_record(manifest_meta, "outer archive.manifest")
    if len(manifest_bytes) != expected_manifest_size or sha256(manifest_bytes) != expected_manifest_hash:
        fail("external manifest bytes do not match the final receipt binding")
    archive_path, expected_archive_size, expected_archive_hash = validate_hash_record(archive_meta, "outer archive")
    if len(archive_bytes) != expected_archive_size or sha256(archive_bytes) != expected_archive_hash:
        fail("archive bytes do not match the final receipt binding")

    manifest_inventory = validate_inventory(manifest.get("members"), "manifest.members")
    if SNAPSHOT_MEMBER not in manifest_inventory:
        fail(f"manifest is missing required provenance member {SNAPSHOT_MEMBER!r}")
    receipt_inventory = validate_inventory(archive_meta.get("members"), "outer archive.members")
    if receipt_inventory != manifest_inventory:
        fail("outer receipt member inventory differs from the externally bound manifest")
    member_count = archive_meta.get("memberCount")
    if isinstance(member_count, bool) or not isinstance(member_count, int) or member_count != len(manifest_inventory):
        fail("outer receipt memberCount differs from the manifest inventory")
    member_bytes = sum(size for size, _ in manifest_inventory.values())
    recorded_member_bytes = archive_meta.get("memberBytes")
    if isinstance(recorded_member_bytes, bool) or not isinstance(recorded_member_bytes, int) or recorded_member_bytes != member_bytes:
        fail("outer receipt memberBytes differs from the manifest inventory")

    tar_inventory, payloads = hash_tar_members(archive_bytes, manifest_inventory)
    if tar_inventory != manifest_inventory:
        fail("tar members differ from the manifest inventory")
    snapshot_bytes = payloads.get(SNAPSHOT_MEMBER)
    if snapshot_bytes is None:
        fail("archive does not contain the immutable execution snapshot")
    snapshot_record = manifest_inventory[SNAPSHOT_MEMBER]
    if len(snapshot_bytes) != snapshot_record[0] or sha256(snapshot_bytes) != snapshot_record[1]:
        fail("immutable execution snapshot differs from its manifest pin")
    snapshot = read_json_bytes(snapshot_bytes, SNAPSHOT_MEMBER)
    if snapshot.get("schema") != SNAPSHOT_SCHEMA:
        fail("immutable execution snapshot schema is missing or unsupported")
    if snapshot.get("status") != "archive_pending":
        fail("immutable snapshot status must be archive_pending")
    if snapshot.get("archiveStatus") != "PENDING" or snapshot.get("archivePending") is not True:
        fail("immutable snapshot does not record pending archive status")
    if snapshot.get("acceptanceStatus") != "NOT_FINAL" or snapshot.get("finalAcceptance") is not False:
        fail("immutable snapshot incorrectly claims final acceptance")
    archive_binding = snapshot.get("archiveBinding")
    if not isinstance(archive_binding, dict) or archive_binding.get("finalArchiveHash") != "PENDING":
        fail("immutable snapshot archive binding is not explicitly pending")

    if snapshot.get("sourcePinsMatchBeforeArchive") is not True or archive_meta.get("sourcePinsMatchBeforeArchive") is not True:
        fail("source pins did not match before archive creation")
    source_before = validate_source_pins(receipt.get("sourceBefore"), "outer sourceBefore")
    source_after = validate_source_pins(receipt.get("sourceAfter"), "outer sourceAfter")
    snapshot_before = validate_source_pins(snapshot.get("sourceBefore"), "snapshot sourceBefore")
    snapshot_prearchive = validate_source_pins(snapshot.get("preArchiveSourcePins"), "snapshot preArchiveSourcePins")
    snapshot_end_pins = validate_source_pins(snapshot.get("sourcePinsAtEndOfCommandsAndPreArchive"), "snapshot sourcePinsAtEndOfCommandsAndPreArchive")
    outer_prearchive = validate_source_pins(archive_meta.get("sourcePinsAtPreArchive"), "outer archive.sourcePinsAtPreArchive")
    outer_prearchive_alias = validate_source_pins(archive_meta.get("preArchiveSourcePins"), "outer archive.preArchiveSourcePins")
    for candidate, label in (
        (source_before, "snapshot sourceBefore differs from final sourceBefore"),
        (source_after, "final sourceAfter differs from sourceBefore"),
        (snapshot_before, "snapshot sourceBefore differs from final sourceBefore"),
        (snapshot_prearchive, "snapshot pre-archive pins differ from final sourceBefore"),
        (snapshot_end_pins, "snapshot end-of-command pins differ from final sourceBefore"),
        (outer_prearchive, "outer pre-archive pins differ from final sourceBefore"),
        (outer_prearchive_alias, "outer pre-archive alias differs from final sourceBefore"),
    ):
        if canonical(candidate) != canonical(source_before):
            fail(label)
    if archive_meta.get("sourceAfterMatchesSourceBefore") is not True or archive_meta.get("sourceAfterMatchesPreArchiveSnapshot") is not True:
        fail("outer receipt does not confirm final source pins matched both snapshots")
    if receipt.get("sourcePinsMatch") is not True:
        fail("outer receipt does not confirm stable source pins")

    toolchain = snapshot.get("toolchainAndDependencies")
    if not isinstance(toolchain, dict):
        fail("immutable snapshot is missing toolchainAndDependencies")
    versions = toolchain.get("versions")
    dependency_install = toolchain.get("dependencyInstall")
    if not isinstance(versions, dict) or not versions:
        fail("immutable snapshot is missing toolchain versions")
    if canonical(versions) != canonical(receipt.get("versions")):
        fail("snapshot toolchain versions differ from the final outer receipt")
    if not isinstance(dependency_install, dict) or canonical(dependency_install) != canonical(receipt.get("dependencyInstall")):
        fail("snapshot dependency installation details differ from the final outer receipt")

    command_ledger = validate_command_rows(snapshot.get("commandLedger"), "snapshot.commandLedger")
    execution_receipt = snapshot.get("executionReceiptBeforeArchive")
    if not isinstance(execution_receipt, dict):
        fail("immutable snapshot is missing executionReceiptBeforeArchive")
    if (execution_receipt.get("schema") != RECEIPT_SCHEMA
            or execution_receipt.get("job_id") != "E-BUILD"
            or execution_receipt.get("mode") != "full"
            or execution_receipt.get("status") != "running"):
        fail("embedded pre-archive receipt must be the running full E-BUILD execution receipt")
    if canonical(command_ledger) != canonical(validate_command_rows(execution_receipt.get("commands"), "snapshot.executionReceiptBeforeArchive.commands")):
        fail("snapshot command ledger differs from its embedded pre-archive receipt")
    require_prefix(command_ledger, receipt.get("commands"), "snapshot command ledger")
    if canonical(execution_receipt.get("sourceBefore")) != canonical(snapshot.get("sourceBefore")):
        fail("embedded pre-archive receipt sourceBefore differs from the immutable snapshot")
    if canonical(execution_receipt.get("versions")) != canonical(versions):
        fail("embedded pre-archive receipt versions differ from the immutable snapshot")
    if canonical(execution_receipt.get("dependencyInstall")) != canonical(dependency_install):
        fail("embedded pre-archive dependency details differ from the immutable snapshot")

    snapshot_stages = snapshot.get("stages")
    stage_outcomes = snapshot.get("stageOutcomes")
    if not isinstance(snapshot_stages, list) or canonical(snapshot_stages) != canonical(stage_outcomes):
        fail("snapshot stages and stageOutcomes differ or are missing")
    if canonical(execution_receipt.get("stages")) != canonical(snapshot_stages):
        fail("snapshot stages differ from its embedded pre-archive receipt")
    require_prefix(snapshot_stages, receipt.get("stages"), "snapshot stages")

    snapshot_meta = archive_meta.get("executionSnapshot")
    if not isinstance(snapshot_meta, dict):
        fail("outer receipt is missing immutable execution snapshot metadata")
    snapshot_path, snapshot_size, snapshot_hash = validate_hash_record(snapshot_meta, "outer archive.executionSnapshot")
    if PurePosixPath(snapshot_path).name != SNAPSHOT_MEMBER or snapshot_size != len(snapshot_bytes) or snapshot_hash != sha256(snapshot_bytes):
        fail("outer immutable execution snapshot pin does not match the archived member")
    if (snapshot_meta.get("status") != "archive_pending"
            or snapshot_meta.get("status") != snapshot.get("status")):
        fail("outer immutable execution snapshot status contradicts the archived pending status")
    if snapshot_meta.get("immutable") is not True or snapshot_meta.get("finalAcceptance") is not False:
        fail("outer receipt does not preserve immutable pending snapshot status")

    complete = (
        receipt.get("mode") == "full"
        and receipt.get("status") == "passed"
        and receipt.get("sourcePinsMatch") is True
        and isinstance(receipt.get("failures"), list)
        and len(receipt["failures"]) == 0
        and archive_meta.get("roundTripVerified") is True
    )
    toolchain_consistency = None
    if complete:
        prearchive_commands = validate_command_rows(execution_receipt.get("commands"), "snapshot.executionReceiptBeforeArchive.commands")
        final_commands_for_status = validate_command_rows(receipt.get("commands"), "outer receipt.commands")
        validate_successful_commands(command_ledger, "snapshot.commandLedger")
        validate_successful_commands(prearchive_commands, "snapshot.executionReceiptBeforeArchive.commands")
        validate_successful_commands(final_commands_for_status, "outer receipt.commands")
        toolchain_consistency = validate_toolchain_contract(versions, source_before)
    if require_complete:
        if not complete:
            fail("--require-complete requires a passed full E-BUILD receipt, stable pins, no failures, and verified round-trip")
        if not isinstance(receipt.get("finishedAt"), str) or not receipt["finishedAt"]:
            fail("complete outer receipt is missing finishedAt")
        if len(command_ledger) == 0 or len(receipt.get("commands", [])) <= len(command_ledger):
            fail("complete receipt is missing archive commands after the immutable command-ledger prefix")
        final_commands = receipt["commands"]
        if [row.get("name") for row in final_commands[-3:]] != [
            "archive-capability-artifacts",
            "list-capability-archive",
            "extract-capability-archive",
        ]:
            fail("complete receipt does not end with archive creation, listing, and extraction commands")
        if not isinstance(receipt.get("stages"), list):
            fail("complete receipt is missing stage outcomes")
        stages_by_name = {row.get("name"): row.get("status") for row in receipt["stages"] if isinstance(row, dict)}
        missing_stages = [name for name in REQUIRED_STAGES if stages_by_name.get(name) != "passed"]
        if missing_stages:
            fail(f"complete receipt is missing passed required stages: {missing_stages}")

    return {
        "status": "verified",
        "completeAcceptance": bool(complete),
        "requireComplete": require_complete,
        "archive": {"path": archive_path, "bytes": len(archive_bytes), "sha256": sha256(archive_bytes)},
        "manifest": {"path": manifest_path, "bytes": len(manifest_bytes), "sha256": sha256(manifest_bytes)},
        "memberCount": len(manifest_inventory),
        "memberBytes": member_bytes,
        "provenanceMember": SNAPSHOT_MEMBER,
        "sourcePinCount": len(source_before),
        "commandLedgerPrefixLength": len(command_ledger),
        "finalCommandCount": len(receipt.get("commands", [])),
        "stages": len(receipt.get("stages", [])),
        "toolchainConsistency": toolchain_consistency,
    }


def read_outer_files(receipt_path: Path, root: Path, archive_override: Path | None, manifest_override: Path | None) -> tuple[dict[str, Any], dict[str, Any], bytes, bytes]:
    receipt = read_json_bytes(receipt_path.read_bytes(), str(receipt_path))
    archive_meta = receipt.get("archive")
    if not isinstance(archive_meta, dict):
        fail("outer receipt is missing archive metadata")
    archive_ref = archive_override or resolve_bound_file(root, archive_meta.get("path"), "outer archive.path")
    manifest_meta = archive_meta.get("manifest")
    if not isinstance(manifest_meta, dict):
        fail("outer receipt is missing archive.manifest metadata")
    manifest_ref = manifest_override or resolve_bound_file(root, manifest_meta.get("path"), "outer archive.manifest.path")
    archive_bytes = archive_ref.read_bytes()
    manifest_bytes = manifest_ref.read_bytes()
    manifest = read_json_bytes(manifest_bytes, str(manifest_ref))
    return receipt, manifest, archive_bytes, manifest_bytes


def run_cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", type=Path, help="final E-BUILD receipt JSON")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="root used to resolve receipt-bound relative archive paths")
    parser.add_argument("--archive", type=Path, help="override archive file path (receipt hash binding is still enforced)")
    parser.add_argument("--manifest", type=Path, help="override manifest file path (receipt hash binding is still enforced)")
    parser.add_argument("--require-complete", action="store_true", help="fail unless the final full E-BUILD run is accepted")
    parser.add_argument("--self-test", action="store_true", help="run in-memory valid and mutation fixtures")
    args = parser.parse_args(argv)
    try:
        if args.self_test:
            if args.receipt or args.archive or args.manifest:
                fail("--self-test cannot be combined with input paths")
            self_test_result = run_self_tests()
            print(json.dumps({
                "status": "passed",
                "selfTests": len(self_test_result["validFixtures"]) + len(self_test_result["mutationTests"]),
                **self_test_result,
            }, sort_keys=True))
            return 0
        if args.receipt is None:
            fail("--receipt is required unless --self-test is used")
        receipt_path = args.receipt.resolve(strict=True)
        receipt, manifest, archive_bytes, manifest_bytes = read_outer_files(
            receipt_path,
            args.root,
            args.archive.resolve(strict=True) if args.archive else None,
            args.manifest.resolve(strict=True) if args.manifest else None,
        )
        result = verify_objects(receipt, manifest, archive_bytes, manifest_bytes, require_complete=args.require_complete)
        print(json.dumps(result, sort_keys=True, indent=2))
        return 0
    except (VerificationError, OSError, tarfile.TarError, EOFError, zlib.error) as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, sort_keys=True), file=sys.stderr)
        return 2


def make_fixture(*, mutation: str | None = None) -> tuple[dict[str, Any], dict[str, Any], bytes, bytes]:
    source_content = b"src"
    source_blobs = {
        "src/main.go": source_content,
        "package-lock.json": b"root package lock fixture",
        "interaction/package-lock.json": b"interaction package lock fixture",
        "compiled-frontend/package-lock.json": b"frontend package lock fixture",
    }
    pins = [
        {"path": path, "bytes": len(data), "sha256": sha256(data)}
        for path, data in source_blobs.items()
    ]
    versions = {
        "node": "v22.23.4",
        "npm": "10.9.4",
        "rootGo": "go version go1.24.0 linux/amd64",
        "compiledGo": "go version go1.27.3 linux/amd64",
        "chromium": "Chromium 153.0.8010.0",
        "dependencies": dict(REQUIRED_DEPENDENCY_VERSIONS),
        "lockedDependencies": dict(REQUIRED_DEPENDENCY_VERSIONS),
        "packageLocks": {
            path: sha256(source_blobs[path])
            for path in PACKAGE_LOCK_PATHS
        },
        "chromiumPath": "/tmp/chromium",
    }
    dependency_install = {"source": ".github/workflows/gobi-compiled-capabilities.yml", "commands": ["npm ci"]}
    initial_commands = [{"name": "compile", "command": "go", "args": ["build"], "exitCode": 0}]
    stages = [{"name": name, "status": "passed"} for name in REQUIRED_STAGES]
    pre_receipt = {
        "schema": RECEIPT_SCHEMA,
        "job_id": "E-BUILD",
        "mode": "full",
        "status": "running",
        "sourceBefore": pins,
        "versions": versions,
        "dependencyInstall": dependency_install,
        "commands": initial_commands,
        "stages": stages,
    }
    snapshot = {
        "schema": SNAPSHOT_SCHEMA,
        "status": "archive_pending",
        "archiveStatus": "PENDING",
        "archivePending": True,
        "acceptanceStatus": "NOT_FINAL",
        "finalAcceptance": False,
        "sourceBefore": pins,
        "preArchiveSourcePins": pins,
        "sourcePinsAtEndOfCommandsAndPreArchive": pins,
        "sourcePinsMatchBeforeArchive": True,
        "toolchainAndDependencies": {"versions": versions, "dependencyInstall": dependency_install},
        "commandLedger": initial_commands,
        "stages": stages,
        "stageOutcomes": stages,
        "executionReceiptBeforeArchive": pre_receipt,
        "archiveBinding": {"finalArchiveHash": "PENDING"},
    }
    if mutation == "wrong-source-pin":
        snapshot["preArchiveSourcePins"] = [{"path": "src/main.go", "bytes": 3, "sha256": "b" * 64}]
    if mutation == "fake-version":
        versions["node"] = "v99.0.0"
    if mutation == "consistent-node18":
        versions["node"] = "v18.0.0"
    if mutation == "locked-react-mismatch":
        versions["lockedDependencies"]["react"] = "18.0.0"
    if mutation == "locked-playwright-mismatch":
        versions["lockedDependencies"]["playwright"] = "1.64.0"
    if mutation == "package-lock-hash-mismatch":
        versions["packageLocks"]["interaction/package-lock.json"] = "b" * 64
    if mutation == "fast-check-version-mismatch":
        versions["dependencies"]["fast-check"] = "4.9.0"
        versions["lockedDependencies"]["fast-check"] = "4.9.0"
    if mutation == "fast-check-version-valid":
        versions["dependencies"]["fast-check"] = "4.10.2"
        versions["lockedDependencies"]["fast-check"] = "4.10.2"
    if mutation == "nonzero-prearchive-command":
        snapshot["commandLedger"][0]["exitCode"] = 23
    if mutation == "signal-prearchive-command":
        snapshot["commandLedger"][0]["signal"] = "SIGTERM"
    if mutation == "snapshot-status-passed":
        snapshot["status"] = "passed"
    if mutation == "embedded-receipt-status-passed":
        snapshot["executionReceiptBeforeArchive"]["status"] = "passed"
    if mutation == "embedded-receipt-mode-not-full":
        snapshot["executionReceiptBeforeArchive"]["mode"] = "partial"
    if mutation == "embedded-receipt-schema-invalid":
        snapshot["executionReceiptBeforeArchive"]["schema"] = "other/v1"

    payload = json.dumps(snapshot, sort_keys=True, indent=2).encode() + b"\n"
    ordinary = b"compiled evidence\n"
    rows = [
        {"path": SNAPSHOT_MEMBER, "bytes": len(payload), "sha256": sha256(payload)},
        {"path": "react/build-result.json", "bytes": len(ordinary), "sha256": sha256(ordinary)},
    ]
    collision_content = b"regular file occupying the react directory path\n"
    if mutation == "file-directory-collision":
        rows.append({"path": "react", "bytes": len(collision_content), "sha256": sha256(collision_content)})
    if mutation == "missing-payload":
        rows = [row for row in rows if row["path"] != SNAPSHOT_MEMBER]
    if mutation == "unsafe-path":
        rows.append({"path": "../escape", "bytes": 1, "sha256": sha256(b"x")})
    rows.sort(key=lambda row: row["path"])
    manifest = {"schema": MANIFEST_SCHEMA, "members": rows}
    manifest_bytes = json.dumps(manifest, sort_keys=True, indent=2).encode() + b"\n"

    archive_stream = io.BytesIO()
    with tarfile.open(fileobj=archive_stream, mode="w:gz") as tar:
        directory = tarfile.TarInfo("react/")
        directory.type = tarfile.DIRTYPE
        directory.mode = 0o755
        tar.addfile(directory)
        if mutation == "unsafe-path":
            escaped = tarfile.TarInfo("../escape")
            escaped.size = 1
            tar.addfile(escaped, io.BytesIO(b"x"))
        if mutation == "file-directory-collision":
            collision = tarfile.TarInfo("react")
            collision.size = len(collision_content)
            tar.addfile(collision, io.BytesIO(collision_content))
        if mutation != "missing-payload":
            entry = tarfile.TarInfo(SNAPSHOT_MEMBER)
            entry.size = len(payload)
            tar.addfile(entry, io.BytesIO(payload))
        entry = tarfile.TarInfo("react/build-result.json")
        entry.size = len(ordinary)
        tar.addfile(entry, io.BytesIO(ordinary))
    archive_bytes = archive_stream.getvalue()
    if mutation == "tamper-member":
        # The archive's outer byte pin is updated below; the manifest's member
        # pin remains unchanged so this tests member integrity independently.
        tampered = io.BytesIO()
        with tarfile.open(fileobj=tampered, mode="w:gz") as tar:
            directory = tarfile.TarInfo("react/")
            directory.type = tarfile.DIRTYPE
            directory.mode = 0o755
            tar.addfile(directory)
            entry = tarfile.TarInfo(SNAPSHOT_MEMBER)
            entry.size = len(payload)
            tar.addfile(entry, io.BytesIO(payload))
            altered = b"x" * len(ordinary)
            entry = tarfile.TarInfo("react/build-result.json")
            entry.size = len(altered)
            tar.addfile(entry, io.BytesIO(altered))
        archive_bytes = tampered.getvalue()

    archive_member_rows = rows if mutation != "unsafe-path" else rows
    outer_archive = {
        "path": "attempt/capabilities-artifacts.tar.gz",
        "bytes": len(archive_bytes),
        "sha256": sha256(archive_bytes),
        "manifest": {"path": "attempt/archive-manifest.json", "bytes": len(manifest_bytes), "sha256": sha256(manifest_bytes)},
        "members": archive_member_rows,
        "memberCount": len(archive_member_rows),
        "memberBytes": sum(row["bytes"] for row in archive_member_rows),
        "sourcePinsAtPreArchive": pins,
        "preArchiveSourcePins": pins,
        "sourcePinsMatchBeforeArchive": True,
        "sourceAfterMatchesSourceBefore": True,
        "sourceAfterMatchesPreArchiveSnapshot": True,
        "roundTripVerified": True,
        "executionSnapshot": {"path": SNAPSHOT_MEMBER, "bytes": len(payload), "sha256": sha256(payload), "immutable": True, "status": "archive_pending", "finalAcceptance": False},
    }
    if mutation == "outer-snapshot-status-passed":
        outer_archive["executionSnapshot"]["status"] = "passed"
    archive_commands = [
        {"name": "archive-capability-artifacts", "command": "tar", "args": ["-czf"], "exitCode": 0},
        {"name": "list-capability-archive", "command": "tar", "args": ["-tzf"], "exitCode": 0},
        {"name": "extract-capability-archive", "command": "tar", "args": ["-xzf"], "exitCode": 0},
    ]
    if mutation == "nonzero-final-archive-command":
        archive_commands[0]["exitCode"] = 17
    if mutation == "error-final-archive-command":
        archive_commands[0]["error"] = "tar failed"
    receipt = {
        "schema": RECEIPT_SCHEMA,
        "job_id": "E-BUILD",
        "worker": "N6",
        "mode": "full",
        "status": "passed",
        "sourceBefore": pins,
        "sourceAfter": pins,
        "sourcePinsMatch": True,
        "versions": versions,
        "dependencyInstall": dependency_install,
        "commands": initial_commands + archive_commands,
        "stages": stages,
        "failures": [],
        "finishedAt": "2026-10-31T00:00:00.000Z",
        "archive": outer_archive,
    }
    if mutation == "fake-version":
        receipt["versions"] = versions
    if mutation == "wrong-source-pin":
        receipt["sourceAfter"] = [{"path": "src/main.go", "bytes": 3, "sha256": "b" * 64}]
    return receipt, manifest, archive_bytes, manifest_bytes


def expect_failure(
    label: str,
    fixture: tuple[dict[str, Any], dict[str, Any], bytes, bytes],
    expected_error: str,
) -> None:
    try:
        verify_objects(*fixture, require_complete=True)
    except VerificationError as exc:
        if expected_error not in str(exc):
            fail(f"self-test mutation {label!r} failed for the wrong reason: {exc}")
        return
    fail(f"self-test mutation was unexpectedly accepted: {label}")


def run_self_tests() -> dict[str, list[str]]:
    valid_fixtures = ["baseline"]
    verify_objects(*make_fixture(), require_complete=True)
    verify_objects(*make_fixture(mutation="fast-check-version-valid"), require_complete=True)
    valid_fixtures.append("fast-check recorded at the expected version")
    mutations = (
        ("wrong source pin", "wrong-source-pin", "final sourceAfter differs from sourceBefore"),
        ("missing provenance payload", "missing-payload", "manifest is missing required provenance member"),
        ("member tamper", "tamper-member", "archive round-trip hash mismatch"),
        ("fake toolchain version", "fake-version", "Node 22.x"),
        ("unsafe traversal member", "unsafe-path", "traversal component"),
        ("consistent Node 18 metadata", "consistent-node18", "Node 22.x"),
        ("locked React version differs from installed metadata", "locked-react-mismatch", "lock metadata must pin react 19.3.1"),
        ("locked Playwright version differs from runner contract", "locked-playwright-mismatch", "lock metadata must pin playwright 1.64.1"),
        ("package-lock hash differs from source pins", "package-lock-hash-mismatch", "differs from sourceBefore"),
        ("fast-check differs from its declared version", "fast-check-version-mismatch", "fast-check metadata"),
        ("nonzero pre-archive command exit", "nonzero-prearchive-command", "snapshot.commandLedger[0] did not exit successfully"),
        ("nonzero final archive command exit", "nonzero-final-archive-command", "outer receipt.commands[1] did not exit successfully"),
        ("pre-archive command signal", "signal-prearchive-command", "snapshot.commandLedger[0] records signal"),
        ("final archive command error", "error-final-archive-command", "outer receipt.commands[1] records command error"),
        ("snapshot status contradicts pending archive", "snapshot-status-passed", "immutable snapshot status must be archive_pending"),
        ("outer snapshot status contradicts pending archive", "outer-snapshot-status-passed", "outer immutable execution snapshot status contradicts"),
        ("embedded receipt status contradicts pre-archive boundary", "embedded-receipt-status-passed", "embedded pre-archive receipt must be"),
        ("embedded receipt mode contradicts full runner", "embedded-receipt-mode-not-full", "embedded pre-archive receipt must be"),
        ("embedded receipt schema is invalid", "embedded-receipt-schema-invalid", "embedded pre-archive receipt must be"),
        ("regular-file/directory prefix collision", "file-directory-collision", "regular-file/directory path collisions"),
    )
    for label, mutation, expected_error in mutations:
        expect_failure(label, make_fixture(mutation=mutation), expected_error)
    return {
        "validFixtures": valid_fixtures,
        "mutationTests": [label for label, _, _ in mutations],
    }


if __name__ == "__main__":
    raise SystemExit(run_cli())
