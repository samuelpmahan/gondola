from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tarfile
from typing import Any, BinaryIO, Callable


PUBLISH_ROOT = Path(__file__).resolve().parents[1]
if str(PUBLISH_ROOT) not in sys.path:
    sys.path.insert(0, str(PUBLISH_ROOT))
import restore  # type: ignore  # The sealed external restore validator is read-only.


SCHEMA_SEGMENTS = "gobi.module-effects-segments/v1"
SCHEMA_AUDIT_MEMBERS = "gobi.module-effects-audit-members/v1"
SCHEMA_AUDIT_EXCLUSIONS = "gobi.module-effects-audit-exclusions/v1"
SCHEMA_PART_HASHES = "gobi.module-effects-part-hashes/v1"
PART_BYTES = 1024 * 1024
MAX_NAMED_PARTS = 1000  # Restore requires exactly three decimal digits in each part name.
HEX40 = re.compile(r"^[0-9a-f]{40}$")


class PackageError(RuntimeError):
    pass


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while True:
            chunk = stream.read(PART_BYTES)
            if not chunk:
                break
            size += len(chunk)
            digest.update(chunk)
    return size, digest.hexdigest()


def regular_file(path: Path, label: str = "file") -> os.stat_result:
    try:
        info = path.lstat()
    except OSError as exc:
        raise PackageError(f"{label} is missing or unreadable: {path}: {exc}") from exc
    if not stat.S_ISREG(info.st_mode):
        raise PackageError(f"{label} must be a regular non-symlink file: {path}")
    return info


def safe_relative_path(value: str, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise PackageError(f"{label} must be a nonempty canonical POSIX path")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise PackageError(f"{label} contains a control character")
    parsed = PurePosixPath(value)
    if parsed.is_absolute() or str(parsed) != value or any(part in ("", ".", "..") for part in value.split("/")):
        raise PackageError(f"{label} is not a safe canonical relative path: {value!r}")
    if re.match(r"^[A-Za-z]:", value):
        raise PackageError(f"{label} has a Windows drive prefix: {value!r}")
    return value


def read_json(path: Path, label: str, max_bytes: int | None = None) -> tuple[bytes, Any]:
    regular_file(path, label)
    data = path.read_bytes()
    if max_bytes is not None and len(data) > max_bytes:
        raise PackageError(f"{label} exceeds the {max_bytes}-byte limit")
    try:
        value = restore._json_bytes(data, label)
    except restore.RestoreError as exc:
        raise PackageError(str(exc)) from exc
    return data, value


def dump_json(value: Any) -> bytes:
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def git_state(git_root: Path) -> tuple[str, bool, Path]:
    root = git_root.resolve()
    try:
        top = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"], cwd=root, check=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        ).stdout.strip()
        head = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD"], cwd=root, check=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        ).stdout.strip()
        status = subprocess.run(
            ["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=root, check=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as exc:
        raise PackageError(f"cannot inspect Git source state read-only: {exc}") from exc
    if not HEX40.fullmatch(head):
        raise PackageError("Git HEAD is not a 40-character lowercase commit id")
    return head, bool(status), Path(top).resolve()


def require_clean_commit(git_root: Path, expected_commit: str) -> Path:
    if not HEX40.fullmatch(expected_commit):
        raise PackageError("sourceCommit must be a 40-character lowercase commit id")
    head, dirty, top = git_state(git_root)
    if head != expected_commit:
        raise PackageError(f"Git HEAD {head} differs from sourceCommit {expected_commit}")
    if dirty:
        raise PackageError("Git source tree is dirty; publication preparation requires a clean source snapshot")
    return top


def git_blob_sha(data: bytes, git_root: Path) -> str:
    """Compute a Git blob id without writing an object (no `-w`)."""
    try:
        proc = subprocess.run(
            ["git", "hash-object", "--stdin"], cwd=git_root, input=data,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
        )
    except (OSError, subprocess.CalledProcessError) as exc:
        raise PackageError(f"read-only git hash-object failed: {exc}") from exc
    value = proc.stdout.decode("ascii", "strict").strip()
    if not HEX40.fullmatch(value):
        raise PackageError("git hash-object returned a malformed blob id")
    return value


def check_source_pins(source_root: Path, source_pins: dict[str, Any]) -> None:
    root = source_root.resolve()
    for raw_path, raw_pin in source_pins.items():
        rel = safe_relative_path(raw_path, "source pin path")
        pin = restore._object(raw_pin, f"sourcePins[{rel}]", {"bytes", "sha256"})
        source = root.joinpath(*rel.split("/"))
        current = root
        for component in rel.split("/"):
            current = current / component
            if current.is_symlink():
                raise PackageError(f"source pin traverses a symlink: {rel}")
        regular_file(source, f"source pin {rel}")
        size, digest = sha256_file(source)
        if size != pin["bytes"] or digest != pin["sha256"]:
            raise PackageError(f"current source differs from clean manifest pin: {rel}")


def check_source_closure(source_root: Path, manifest: dict[str, Any]) -> None:
    """Ensure the pinned source path set equals the declared current source closure."""
    root = source_root.resolve()
    scope = manifest["sourceClosureScope"]
    excluded_names = set(scope["excludedDirectoryNames"])
    excluded_files = set(scope["excludedFiles"])
    discovered: set[str] = set()

    def add_file(rel: str, path: Path) -> None:
        if rel in excluded_files:
            return
        if scope["excludedCompilerLogs"] and rel.startswith("compiled-frontend/") and (rel.endswith(".log") or rel.endswith(".exit-code")):
            return
        regular_file(path, f"source closure member {rel}")
        discovered.add(rel)

    for rel in scope["explicitFiles"]:
        safe_relative_path(rel, "sourceClosureScope.explicitFiles entry")
        add_file(rel, root.joinpath(*rel.split("/")))
    for directory in scope["directories"]:
        safe_relative_path(directory, "sourceClosureScope.directories entry")
        base = root.joinpath(*directory.split("/"))
        if base.is_symlink() or not base.is_dir():
            raise PackageError(f"declared source directory is missing or not a real directory: {directory}")
        stack = [base]
        while stack:
            current = stack.pop()
            for child in sorted(current.iterdir(), key=lambda p: p.name, reverse=True):
                info = child.lstat()
                rel = child.relative_to(root).as_posix()
                if stat.S_ISLNK(info.st_mode):
                    raise PackageError(f"source closure contains a symlink: {rel}")
                if stat.S_ISDIR(info.st_mode):
                    if child.name not in excluded_names:
                        stack.append(child)
                elif stat.S_ISREG(info.st_mode):
                    add_file(rel, child)
                else:
                    raise PackageError(f"source closure contains a non-regular entry: {rel}")
    pinned = set(manifest["sourcePins"])
    if discovered != pinned:
        missing = sorted(discovered - pinned)
        extra = sorted(pinned - discovered)
        raise PackageError(f"current source closure differs from sourcePins (unpinned={missing[:4]}, absent={extra[:4]})")
    root_sum = scope["rootGoSum"]
    if root_sum["present"] is False and (root / root_sum["path"]).exists():
        raise PackageError("sourceClosureScope marks go.sum absent but it exists in the source root")


def verify_tar_members(archive_path: Path, rows: dict[str, dict[str, Any]]) -> None:
    """Read-only strict tar/gzip check against exact manifest members."""
    expected = rows
    seen: set[str] = set()
    archive_info = regular_file(archive_path, "primary archive")
    try:
        with archive_path.open("rb") as raw, gzip.GzipFile(fileobj=raw, mode="rb") as decompressed:
            with tarfile.open(fileobj=decompressed, mode="r|") as tf:
                for member in tf:
                    name = safe_relative_path(member.name, "archive member path")
                    if name in seen:
                        raise PackageError(f"duplicate archive member: {name}")
                    seen.add(name)
                    if not member.isfile() or member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE):
                        raise PackageError(f"archive member is not a regular file: {name}")
                    row = expected.get(name)
                    if row is None:
                        raise PackageError(f"unexpected archive member: {name}")
                    if member.size != row["bytes"]:
                        raise PackageError(f"archive member length differs from manifest: {name}")
                    if "mode" in row and member.mode != row["mode"]:
                        raise PackageError(f"archive member mode differs from manifest: {name}")
                    stream = tf.extractfile(member)
                    if stream is None:
                        raise PackageError(f"archive member has no data stream: {name}")
                    digest = hashlib.sha256()
                    size = 0
                    while True:
                        chunk = stream.read(PART_BYTES)
                        if not chunk:
                            break
                        size += len(chunk)
                        digest.update(chunk)
                    if size != row["bytes"] or digest.hexdigest() != row["sha256"]:
                        raise PackageError(f"archive member bytes or SHA-256 differ from manifest: {name}")
            # Drain gzip so truncated trailers/CRC failures cannot hide after tar end markers.
            while True:
                tail = decompressed.read(PART_BYTES)
                if not tail:
                    break
                if any(tail):
                    raise PackageError("primary archive has nonzero bytes after the tar end marker")
    except (OSError, EOFError, gzip.BadGzipFile, tarfile.TarError) as exc:
        raise PackageError(f"invalid or truncated primary tar/gzip archive: {exc}") from exc
    if seen != set(expected):
        missing = sorted(set(expected) - seen)
        raise PackageError(f"primary archive is missing manifest members: {missing[:4]}")
    after = regular_file(archive_path, "primary archive")
    if (archive_info.st_dev, archive_info.st_ino, archive_info.st_size, archive_info.st_mtime_ns) != \
       (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
        raise PackageError("primary archive changed during verification")


def segment_archive(
    archive_path: Path,
    output_dir: Path,
    prefix: str,
    git_root: Path,
    expected_pin: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, str]], list[dict[str, Any]]]:
    """Create 1 MiB parts and exact SHA-256/Git-blob metadata without overwriting."""
    if prefix not in ("bundle", "audit"):
        raise PackageError("segment prefix must be bundle or audit")
    info = regular_file(archive_path, "archive to segment")
    if info.st_size <= 0 or info.st_size > restore.MAX_ARCHIVE_BYTES:
        raise PackageError("archive size is outside the restore profile limits")
    parts_dir = output_dir / prefix
    if parts_dir.exists() or parts_dir.is_symlink():
        raise PackageError(f"segment directory already exists: {parts_dir}")
    parts_dir.mkdir(parents=True)
    archive_digest = hashlib.sha256()
    archive_bytes = 0
    parts: list[dict[str, Any]] = []
    git_index: list[dict[str, str]] = []
    full_hashes: list[dict[str, Any]] = []
    try:
        with archive_path.open("rb") as source:
            ordinal = 0
            while True:
                chunk = source.read(PART_BYTES)
                if not chunk:
                    break
                if ordinal >= min(restore.MAX_PARTS, MAX_NAMED_PARTS):
                    raise PackageError(f"archive exceeds the {min(restore.MAX_PARTS, MAX_NAMED_PARTS)} three-digit part-name limit")
                name = f"{prefix}.part-{ordinal:03d}"
                part_path = parts_dir / name
                with part_path.open("xb") as output:
                    output.write(chunk)
                    output.flush()
                    os.fsync(output.fileno())
                digest = sha256(chunk)
                blob = git_blob_sha(chunk, git_root)
                parts.append({"name": name, "bytes": len(chunk), "sha256": digest})
                git_index.append({"name": name, "sha": blob})
                full_hashes.append({"name": name, "bytes": len(chunk), "sha256": digest, "gitBlobSHA1": blob})
                archive_digest.update(chunk)
                archive_bytes += len(chunk)
                ordinal += 1
        after = regular_file(archive_path, "archive to segment")
        if (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns) != \
           (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns):
            raise PackageError("archive changed while parts were being generated")
        archive_pin = {"bytes": archive_bytes, "sha256": archive_digest.hexdigest()}
        if archive_bytes != info.st_size:
            raise PackageError("archive byte count changed while parts were generated")
        if expected_pin is not None and archive_pin != expected_pin:
            raise PackageError("archive bytes/SHA-256 differ from the primary manifest pin")
        if not parts or any(row["bytes"] > PART_BYTES for row in parts) or sum(row["bytes"] for row in parts) != archive_bytes:
            raise PackageError("generated parts do not exactly cover the archive")
        return archive_pin, parts, git_index, full_hashes
    except Exception:
        import shutil
        shutil.rmtree(parts_dir, ignore_errors=True)
        raise


def part_sidecars(prefix: str, full_hashes: list[dict[str, Any]]) -> tuple[bytes, bytes]:
    simple_upload = [{"name": row["name"], "sha": row["gitBlobSHA1"]} for row in full_hashes]
    detailed = {"schema": SCHEMA_PART_HASHES, "parts": full_hashes}
    return dump_json(simple_upload), dump_json(detailed)


def ensure_output_absent(path: Path) -> Path:
    candidate = Path(os.path.abspath(os.fspath(path.expanduser())))
    if os.path.lexists(candidate):
        raise PackageError(f"output directory already exists; refusing to overwrite: {candidate}")
    candidate.parent.mkdir(parents=True, exist_ok=True)
    current = candidate.parent
    while current != current.parent:
        if current.is_symlink() or not current.is_dir():
            raise PackageError(f"output path traverses a non-directory or symlink parent: {current}")
        current = current.parent
    if os.path.lexists(candidate):
        raise PackageError(f"output directory appeared during preparation; refusing to overwrite: {candidate}")
    return candidate


def write_bytes_new(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())

