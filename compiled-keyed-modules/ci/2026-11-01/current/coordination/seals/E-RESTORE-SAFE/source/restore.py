#!/usr/bin/env python3
"""Restore the frozen keyed-module archive after verifying every published pin.

Atomic no-overwrite commit requires Linux renameat2(RENAME_NOREPLACE); unsupported
platforms fail closed. Checksums establish byte consistency only; this tool does
not authenticate who published the index or manifest. Pass --base-url only with
an immutable raw Git folder URL pinned to the intended commit.
"""
from __future__ import annotations

import argparse
import ctypes
import errno
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile
import tempfile
from typing import Any, BinaryIO
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
MAX_METADATA_BYTES = 8 * 1024 * 1024
MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
MAX_PART_BYTES = 64 * 1024 * 1024
MAX_PARTS = 2048
MAX_MEMBERS = 100_000
MAX_EXPANDED_BYTES = 8 * 1024 * 1024 * 1024
CHUNK = 1024 * 1024
HEX256 = re.compile(r"^[0-9a-f]{64}$")
COMMIT = re.compile(r"^[0-9a-f]{40}$")


class RestoreError(Exception):
    """An input or archive failed a declared restoration check."""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _fail(message: str) -> None:
    raise RestoreError(message)


def _pairs_no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            _fail(f"duplicate JSON key: {key!r}")
        result[key] = value
    return result


def _json_bytes(data: bytes, label: str) -> Any:
    if len(data) > MAX_METADATA_BYTES:
        _fail(f"{label} exceeds the {MAX_METADATA_BYTES}-byte metadata limit")
    try:
        return json.loads(data.decode("utf-8"), object_pairs_hook=_pairs_no_duplicates)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        _fail(f"{label} is not valid UTF-8 JSON: {exc}")


def _object(value: Any, label: str, keys: set[str] | None = None) -> dict[str, Any]:
    if type(value) is not dict:
        _fail(f"{label} must be a JSON object")
    if keys is not None and set(value) != keys:
        _fail(f"{label} fields must be exactly {sorted(keys)}")
    return value


def _integer(value: Any, label: str, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum:
        _fail(f"{label} must be an integer >= {minimum}")
    return value


def _digest(value: Any, label: str) -> str:
    if not isinstance(value, str) or not HEX256.fullmatch(value):
        _fail(f"{label} must be a lowercase SHA-256 hex digest")
    return value


def _safe_member_path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        _fail(f"{label} must be a nonempty canonical POSIX path")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        _fail(f"{label} contains a control character")
    path = PurePosixPath(value)
    if path.is_absolute() or str(path) != value or any(part in ("", ".", "..") for part in value.split("/")):
        _fail(f"{label} is not a safe canonical relative path: {value!r}")
    if re.match(r"^[A-Za-z]:", value):
        _fail(f"{label} has a Windows drive prefix: {value!r}")
    return value


def _member_rows(value: Any, label: str, allow_mode: bool = False) -> dict[str, dict[str, Any]]:
    if type(value) is not list:
        _fail(f"{label} must be an array")
    rows: dict[str, dict[str, Any]] = {}
    for pos, raw in enumerate(value):
        row = _object(raw, f"{label}[{pos}]")
        expected = {"path", "bytes", "sha256"}
        if allow_mode and "mode" in row:
            expected.add("mode")
        if set(row) != expected:
            _fail(f"{label}[{pos}] fields are invalid")
        path = _safe_member_path(row["path"], f"{label}[{pos}].path")
        size = _integer(row["bytes"], f"{label}[{pos}].bytes")
        digest = _digest(row["sha256"], f"{label}[{pos}].sha256")
        if "mode" in row:
            mode = _integer(row["mode"], f"{label}[{pos}].mode")
            if mode > 0o777:
                _fail(f"{label}[{pos}].mode is outside the permission-bit range")
        if path in rows:
            _fail(f"duplicate member path in {label}: {path}")
        row_value = {"path": path, "bytes": size, "sha256": digest}
        if "mode" in row:
            row_value["mode"] = row["mode"]
        rows[path] = row_value
    return rows


def _row_pin(row: dict[str, Any], actual: bytes, label: str) -> None:
    if len(actual) != row["bytes"]:
        _fail(f"{label} length mismatch: expected {row['bytes']}, got {len(actual)}")
    digest = _sha256(actual)
    if digest != row["sha256"]:
        _fail(f"{label} SHA-256 mismatch: expected {row['sha256']}, got {digest}")


def _check_regular(path: Path, label: str) -> bool:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    if not path.is_file() or path.is_symlink():
        _fail(f"{label} must be a regular non-symlink file: {path}")
    if not os.path.isfile(path):
        _fail(f"{label} is not a regular file: {path}")
    return True


class Inputs:
    """Resolve local inputs first; fetch only absent inputs into a temporary cache."""

    def __init__(self, base_url: str | None, cache: Path):
        self.base_url = self._validate_base_url(base_url) if base_url else None
        self.cache = cache
        self.downloads: list[dict[str, Any]] = []

    @staticmethod
    def _validate_base_url(value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or parsed.username or parsed.password:
            _fail("--base-url must be an explicit HTTP(S) raw-directory URL without credentials")
        if parsed.query or parsed.fragment:
            _fail("--base-url must not include a query or fragment")
        return value.rstrip("/") + "/"

    def _download(self, filename: str, expected_bytes: int | None, category: str) -> Path:
        assert self.base_url is not None
        relative_candidates = [filename]
        subdir = "bundle" if category == "bundle" else "audit" if category == "audit" else None
        if subdir:
            relative_candidates.append(f"{subdir}/{filename}")
        last_404: HTTPError | None = None
        for rel in relative_candidates:
            url = urljoin(self.base_url, quote(rel, safe="/.-_"))
            target = self.cache / f"{len(self.downloads):03d}-{Path(filename).name}"
            try:
                with urlopen(url, timeout=30) as response, target.open("xb") as output:
                    final = urlsplit(response.geturl())
                    if final.scheme not in ("http", "https") or not final.netloc:
                        _fail("remote input redirected to a non-HTTP URL")
                    digest = hashlib.sha256()
                    size = 0
                    limit = expected_bytes if expected_bytes is not None else MAX_METADATA_BYTES
                    while True:
                        chunk = response.read(min(CHUNK, limit - size + 1))
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > limit:
                            _fail(f"remote input exceeds expected/maximum length: {filename}")
                        digest.update(chunk)
                        output.write(chunk)
                    if expected_bytes is not None and size != expected_bytes:
                        _fail(f"remote input length mismatch for {filename}: expected {expected_bytes}, got {size}")
                    output.flush()
                    os.fsync(output.fileno())
                self.downloads.append({"url": url, "bytes": size, "sha256": digest.hexdigest()})
                return target
            except HTTPError as exc:
                try:
                    target.unlink(missing_ok=True)
                except OSError:
                    pass
                if exc.code != 404:
                    raise RestoreError(f"HTTP {exc.code} downloading {url}") from exc
                last_404 = exc
            except URLError as exc:
                target.unlink(missing_ok=True)
                raise RestoreError(f"network error downloading {url}: {exc}") from exc
            except Exception:
                target.unlink(missing_ok=True)
                raise
        raise RestoreError(f"remote input not found at {self.base_url} ({filename})") from last_404

    def file(self, filename: str, category: str, local_dirs: list[Path], expected_bytes: int | None = None) -> Path:
        if "/" in filename or "\\" in filename or filename in ("", ".", ".."):
            _fail(f"unsafe input filename: {filename!r}")
        present: list[Path] = []
        for directory in local_dirs:
            candidate = directory / filename
            if os.path.lexists(candidate):
                _check_regular(candidate, "local input")
                present.append(candidate)
        if len(present) > 1:
            _fail(f"ambiguous local copies of input {filename}: {present}")
        if present:
            return present[0]
        if self.base_url:
            return self._download(filename, expected_bytes, category)
        _fail(f"required local input is missing: {filename}; use --base-url with an immutable raw Git folder")


def _read_metadata(inputs: Inputs, filename: str, category: str, dirs: list[Path]) -> tuple[Path, bytes, Any]:
    path = inputs.file(filename, category, dirs)
    data = path.read_bytes()
    if len(data) > MAX_METADATA_BYTES:
        _fail(f"{filename} exceeds the metadata size limit")
    return path, data, _json_bytes(data, filename)


def _parse_index(index: Any, audit: bool) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], str]:
    fields = {"schema", "sourceCommit", "archive", "manifest", "parts"}
    idx = _object(index, "audit parts index" if audit else "bundle parts index", fields)
    if idx["schema"] != "gobi.keyed-module-segments/v1":
        _fail("parts index schema is not gobi.keyed-module-segments/v1")
    if not isinstance(idx["sourceCommit"], str) or not COMMIT.fullmatch(idx["sourceCommit"]):
        _fail("parts index sourceCommit must be a 40-character lowercase commit id")
    expected_subdir = "audit" if audit else "bundle"
    expected_prefix = "audit" if audit else "bundle"
    archive = _object(idx["archive"], "archive pin", {"bytes", "sha256"})
    archive_bytes = _integer(archive["bytes"], "archive.bytes", 1)
    if archive_bytes > MAX_ARCHIVE_BYTES:
        _fail(f"archive.bytes exceeds the {MAX_ARCHIVE_BYTES}-byte profile limit")
    archive_sha = _digest(archive["sha256"], "archive.sha256")
    manifest_pin = _object(idx["manifest"], "manifest pin", {"bytes", "sha256"})
    manifest_bytes = _integer(manifest_pin["bytes"], "manifest.bytes", 1)
    manifest_sha = _digest(manifest_pin["sha256"], "manifest.sha256")
    parts_raw = idx["parts"]
    if type(parts_raw) is not list or not parts_raw or len(parts_raw) > MAX_PARTS:
        _fail(f"parts must contain between 1 and {MAX_PARTS} entries")
    parts: list[dict[str, Any]] = []
    names: set[str] = set()
    for i, value in enumerate(parts_raw):
        row = _object(value, f"parts[{i}]", {"name", "bytes", "sha256"})
        name = row["name"]
        if not isinstance(name, str) or not re.fullmatch(rf"{expected_prefix}\.part-[0-9]{{3}}", name):
            _fail(f"parts[{i}].name is not a safe {expected_prefix} segment name")
        if name in names or name != f"{expected_prefix}.part-{i:03d}":
            _fail("part names must be unique and consecutively numbered from 000")
        names.add(name)
        part_bytes = _integer(row["bytes"], f"parts[{i}].bytes", 1)
        if part_bytes > MAX_PART_BYTES:
            _fail(f"parts[{i}].bytes exceeds the {MAX_PART_BYTES}-byte profile limit")
        parts.append({"name": name, "bytes": part_bytes, "sha256": _digest(row["sha256"], f"parts[{i}].sha256")})
    if sum(row["bytes"] for row in parts) != archive_bytes:
        _fail("sum of part lengths does not equal the pinned archive length")
    return idx, {"bytes": archive_bytes, "sha256": archive_sha}, parts, expected_subdir


def _load_expected_manifest(data: bytes, index: dict[str, Any], audit: bool) -> tuple[dict[str, dict[str, Any]], int, int]:
    manifest = _json_bytes(data, "member manifest")
    if audit:
        manifest = _object(manifest, "audit member manifest", {"schema", "members"})
        if manifest["schema"] != "gobi.keyed-module-audit-members/v1":
            _fail("audit member manifest schema is not supported")
        rows = _member_rows(manifest["members"], "audit members", allow_mode=True)
        expanded = sum(row["bytes"] for row in rows.values())
        if len(rows) > MAX_MEMBERS or expanded > MAX_EXPANDED_BYTES:
            _fail("audit archive exceeds the member-count or expanded-size profile limit")
        return rows, len(rows), expanded

    required = {"schema", "sourceCommit", "verifierGitHead", "verifierGitDirty", "verifierSourcePinsMatch", "sourcePins", "members", "archive", "archivedSnapshotVerified"}
    manifest = _object(manifest, "bundle manifest", required)
    if manifest["schema"] != "gobi.keyed-modules-archive-manifest/v1":
        _fail("bundle manifest schema is not supported")
    commit = index["sourceCommit"]
    if manifest["sourceCommit"] != commit or manifest["verifierGitHead"] != commit:
        _fail("source commit in the parts index and bundle manifest does not match")
    if manifest["verifierGitDirty"] is not False or manifest["verifierSourcePinsMatch"] is not True or manifest["archivedSnapshotVerified"] is not True:
        _fail("bundle manifest does not claim a clean, verified source snapshot")
    archive = _object(manifest["archive"], "manifest archive", {"path", "bytes", "sha256"})
    _integer(archive["bytes"], "manifest archive.bytes", 1)
    _digest(archive["sha256"], "manifest archive.sha256")
    if archive["bytes"] != index["archive"]["bytes"] or archive["sha256"] != index["archive"]["sha256"]:
        _fail("archive pins in bundle manifest and bundle-parts.json differ")
    rows = _member_rows(manifest["members"], "bundle members")
    pins = _object(manifest["sourcePins"], "sourcePins")
    if len(rows) != 600:
        _fail(f"primary archive expected 600 members, got {len(rows)}")
    if len(pins) != 157:
        _fail(f"primary archive expected 157 source pins, got {len(pins)}")
    expanded = sum(row["bytes"] for row in rows.values())
    if expanded > MAX_EXPANDED_BYTES:
        _fail(f"expanded archive exceeds the {MAX_EXPANDED_BYTES}-byte profile limit")
    for source_path, raw in pins.items():
        source_path = _safe_member_path(source_path, "sourcePins path")
        pin = _object(raw, f"sourcePins[{source_path}]", {"bytes", "sha256"})
        pin_bytes = _integer(pin["bytes"], f"sourcePins[{source_path}].bytes")
        pin_sha = _digest(pin["sha256"], f"sourcePins[{source_path}].sha256")
        member = rows.get(f"source/{source_path}")
        if member is None or member["bytes"] != pin_bytes or member["sha256"] != pin_sha:
            _fail(f"source pin does not match archived source member: {source_path}")
    return rows, len(rows), expanded


def _check_local_part_extras(base: Path, subdir: str, parts: list[dict[str, Any]]) -> None:
    directory = base / subdir
    if not os.path.lexists(directory):
        return
    if directory.is_symlink() or not directory.is_dir():
        _fail(f"local part directory must be a real directory: {directory}")
    expected = {row["name"] for row in parts}
    actual: set[str] = set()
    for entry in directory.iterdir():
        if entry.is_symlink() or not entry.is_file():
            _fail(f"part directory contains a non-regular entry: {entry.name}")
        actual.add(entry.name)
    extra = sorted(actual - expected)
    if extra:
        _fail(f"local part directory contains unexpected files: {extra[:4]}")


def _check_local_root_part_extras(base: Path, prefix: str, parts: list[dict[str, Any]]) -> None:
    expected = {row["name"] for row in parts}
    for entry in base.glob(f"{prefix}.part-*"):
        if entry.name not in expected:
            _fail(f"local input directory contains an unexpected segment: {entry.name}")
        _check_regular(entry, "local segment")


def _hash_file(path: Path, expected: dict[str, Any], label: str, sink: BinaryIO | None = None) -> tuple[int, str]:
    if not _check_regular(path, label):
        _fail(f"missing file: {path}")
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as source:
        while True:
            chunk = source.read(CHUNK)
            if not chunk:
                break
            size += len(chunk)
            if size > expected["bytes"]:
                _fail(f"{label} is longer than its pinned length")
            digest.update(chunk)
            if sink is not None:
                sink.write(chunk)
    value = digest.hexdigest()
    if size != expected["bytes"]:
        _fail(f"{label} length mismatch: expected {expected['bytes']}, got {size}")
    if value != expected["sha256"]:
        _fail(f"{label} SHA-256 mismatch: expected {expected['sha256']}, got {value}")
    return size, value


def _assemble(parts: list[dict[str, Any]], archive_pin: dict[str, Any], inputs: Inputs, local_dirs: list[Path], target: Path) -> None:
    digest = hashlib.sha256()
    total = 0
    with target.open("xb") as output:
        for row in parts:
            part_path = inputs.file(row["name"], "audit" if row["name"].startswith("audit.") else "bundle", local_dirs)
            size, part_sha = _hash_file(part_path, row, f"segment {row['name']}", output)
            total += size
            # _hash_file streams bytes to output; digest the assembled file below to avoid trusting joins.
        output.flush()
        os.fsync(output.fileno())
    if total != archive_pin["bytes"]:
        _fail("assembled archive length does not match its pin")
    with target.open("rb") as archive:
        while True:
            chunk = archive.read(CHUNK)
            if not chunk:
                break
            digest.update(chunk)
    if digest.hexdigest() != archive_pin["sha256"]:
        _fail("assembled archive SHA-256 does not match its pin")


def _commit_no_replace(stage: Path, destination: Path) -> None:
    """Atomically move a fully staged tree without replacing an existing path."""
    if not sys.platform.startswith("linux"):
        _fail("atomic no-overwrite commit requires Linux renameat2(RENAME_NOREPLACE)")
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        renameat2 = libc.renameat2
    except (AttributeError, OSError) as exc:
        raise RestoreError("atomic no-overwrite commit requires available Linux renameat2(RENAME_NOREPLACE)") from exc
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    result = renameat2(-100, os.fsencode(stage), -100, os.fsencode(destination), 1)  # AT_FDCWD, RENAME_NOREPLACE
    if result == 0:
        return
    code = ctypes.get_errno()
    if code in (errno.EEXIST, errno.ENOTEMPTY):
        raise FileExistsError(code, os.strerror(code), str(destination))
    if code in (errno.ENOSYS, errno.EINVAL, errno.ENOTSUP, errno.EOPNOTSUPP):
        raise RestoreError("atomic no-overwrite commit requires supported Linux renameat2(RENAME_NOREPLACE)")
    raise OSError(code, os.strerror(code), str(destination))


def _extract(archive_path: Path, rows: dict[str, dict[str, Any]], stage: Path) -> None:
    seen: set[str] = set()
    try:
        with gzip.open(archive_path, "rb") as decompressed, tarfile.open(fileobj=decompressed, mode="r|") as tf:
            for member in tf:
                name = _safe_member_path(member.name, "tar member path")
                if name in seen:
                    _fail(f"duplicate tar member: {name}")
                seen.add(name)
                if member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE) or not member.isfile():
                    _fail(f"tar entry is not a regular file: {name}")
                if type(member.mode) is not int or member.mode < 0 or member.mode > 0o777:
                    _fail(f"tar member has unsafe permission bits: {name}")
                row = rows.get(name)
                if row is None:
                    _fail(f"unexpected extra tar member: {name}")
                if member.size != row["bytes"]:
                    _fail(f"tar member size differs from manifest: {name}")
                if "mode" in row and member.mode != row["mode"]:
                    _fail(f"tar member mode differs from audit manifest: {name}")
                source = tf.extractfile(member)
                if source is None:
                    _fail(f"tar member has no file stream: {name}")
                target = stage.joinpath(*name.split("/"))
                target.parent.mkdir(parents=True, exist_ok=True)
                digest = hashlib.sha256()
                size = 0
                with target.open("xb") as output:
                    remaining = member.size
                    while remaining:
                        chunk = source.read(min(CHUNK, remaining))
                        if not chunk:
                            _fail(f"truncated tar member: {name}")
                        remaining -= len(chunk)
                        size += len(chunk)
                        digest.update(chunk)
                        output.write(chunk)
                    output.flush()
                    os.fsync(output.fileno())
                os.chmod(target, member.mode)
                if size != row["bytes"] or digest.hexdigest() != row["sha256"]:
                    _fail(f"tar member digest mismatch: {name}")
            # Tar iteration stops at the end-of-archive marker. Drain the
            # decompressor so gzip CRC/size trailer truncation is not hidden.
            while True:
                tail = decompressed.read(CHUNK)
                if not tail:
                    break
                if any(tail):
                    _fail("nonzero trailing data after tar end marker")
        if seen != set(rows):
            missing = sorted(set(rows) - seen)
            _fail(f"archive is missing {len(missing)} expected members; first missing: {missing[:5]}")
    except RestoreError:
        raise
    except (tarfile.TarError, EOFError, OSError, ValueError) as exc:
        _fail(f"archive extraction failed (invalid or truncated tar/gzip): {exc}")


def restore(destination: Path, audit: bool = False, base_url: str | None = None) -> dict[str, Any]:
    label = "audit" if audit else "bundle"
    index_name = "audit-parts.json" if audit else "bundle-parts.json"
    manifest_name = "audit-members.json" if audit else "bundle.manifest.json"
    subdir = "audit" if audit else "bundle"
    if destination.exists() or destination.is_symlink():
        _fail(f"destination already exists; refusing to overwrite: {destination}")
    parent = destination.parent
    parent.mkdir(parents=True, exist_ok=True)
    if not parent.is_dir():
        _fail(f"destination parent is not a directory: {parent}")

    with tempfile.TemporaryDirectory(prefix="keyed-module-restore-cache-") as cache_text:
        cache = Path(cache_text)
        inputs = Inputs(base_url, cache)
        metadata_dirs = [ROOT]
        index_path, index_bytes, index_data = _read_metadata(inputs, index_name, label, metadata_dirs)
        idx, archive_pin, parts, subdir = _parse_index(index_data, audit)
        manifest_expected = idx["manifest"]
        manifest_dirs = [ROOT]
        manifest_path = inputs.file(manifest_name, label, manifest_dirs, manifest_expected["bytes"])
        manifest_bytes = manifest_path.read_bytes()
        _row_pin({"bytes": manifest_expected["bytes"], "sha256": manifest_expected["sha256"]}, manifest_bytes, manifest_name)
        rows, member_count, expanded_bytes = _load_expected_manifest(manifest_bytes, idx, audit)
        if not audit and len(rows) != 600:
            _fail("primary manifest member count changed after validation")

        _check_local_part_extras(ROOT, subdir, parts)
        _check_local_root_part_extras(ROOT, "audit" if audit else "bundle", parts)
        part_dirs = [ROOT / subdir, ROOT]
        with tempfile.TemporaryDirectory(prefix="keyed-module-archive-") as archive_tmp:
            archive_path = Path(archive_tmp) / "assembled.tar.gz"
            _assemble(parts, archive_pin, inputs, part_dirs, archive_path)
            if destination.exists() or destination.is_symlink():
                _fail(f"destination appeared during restore; refusing to overwrite: {destination}")
            stage = Path(tempfile.mkdtemp(prefix=f".{destination.name}.restore-", dir=parent))
            try:
                _extract(archive_path, rows, stage)
                os.chmod(stage, 0o755)
                _commit_no_replace(stage, destination)
            except Exception:
                shutil.rmtree(stage, ignore_errors=True)
                raise
        return {
            "status": "passed",
            "mode": label,
            "destination": str(destination),
            "archiveBytes": archive_pin["bytes"],
            "archiveSHA256": archive_pin["sha256"],
            "memberCount": member_count,
            "expandedBytes": expanded_bytes,
            "sourcePinsVerified": 157 if not audit else None,
            "sourceCommit": idx.get("sourceCommit"),
            "manifestSHA256": _sha256(manifest_bytes),
            "indexSHA256": _sha256(index_bytes),
            "remoteDownloads": inputs.downloads,
            "integrityScope": "SHA-256 consistency pins; publisher authenticity is not established",
        }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="new directory to create on Linux with renameat2; existing paths are never overwritten")
    parser.add_argument("--audit", action="store_true", help="restore audit-parts.json and audit-members.json")
    parser.add_argument("--base-url", help="explicit immutable HTTP(S) raw Git directory URL for missing inputs")
    args = parser.parse_args(argv)
    destination = args.destination.expanduser().absolute()
    try:
        result = restore(destination, audit=args.audit, base_url=args.base_url)
    except (RestoreError, OSError, HTTPError, URLError) as exc:
        print(f"restore failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
