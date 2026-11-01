#!/usr/bin/env python3
"""Create, verify, and safely restore a deterministic split evidence bundle."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import pathlib
import re
import shutil
import stat
import sys
import tarfile
import zlib
from typing import Any

SCHEMA = "effects-qualification-pack/v1"
PART_LIMIT = 900_000
CHUNK_SIZE = 128 * 1024
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
PART_RE = re.compile(r"^part-[0-9]{5}\.bin$")
WINDOWS_RESERVED = {"con", "prn", "aux", "nul"} | {
    f"{prefix}{number}" for prefix in ("com", "lpt") for number in range(1, 10)
}


class PackError(Exception):
    """An invalid input tree or evidence package."""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _is_within(path: pathlib.Path, root: pathlib.Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _canonical_existing_dir(raw_path: str | os.PathLike[str], label: str) -> pathlib.Path:
    path = pathlib.Path(raw_path).expanduser()
    try:
        if path.is_symlink():
            raise PackError(f"{label} must not be a symlink: {path}")
        resolved = path.resolve(strict=True)
    except OSError as exc:
        raise PackError(f"cannot resolve {label} {path}: {exc}") from exc
    if not resolved.is_dir():
        raise PackError(f"{label} must be a directory: {resolved}")
    return resolved


def _canonical_new_dir(raw_path: str | os.PathLike[str], label: str) -> pathlib.Path:
    path = pathlib.Path(raw_path).expanduser()
    if not path.is_absolute():
        path = pathlib.Path.cwd() / path
    if path.name in ("", ".", ".."):
        raise PackError(f"{label} must name a new directory")
    try:
        parent = path.parent.resolve(strict=True)
    except OSError as exc:
        raise PackError(f"{label} parent must already exist: {path.parent}: {exc}") from exc
    if not parent.is_dir():
        raise PackError(f"{label} parent is not a directory: {parent}")
    return parent / path.name


def _validate_member_path(value: Any) -> str:
    if not isinstance(value, str) or not value:
        raise PackError("unsafe member path: path must be a non-empty string")
    try:
        value.encode("utf-8", "strict")
    except UnicodeEncodeError as exc:
        raise PackError(f"unsafe member path: path is not valid UTF-8: {value!r}") from exc
    if "\x00" in value or "\\" in value or ":" in value:
        raise PackError(f"unsafe member path: {value!r}")
    if value.startswith("/"):
        raise PackError(f"unsafe member path: {value!r}")
    path = pathlib.PurePosixPath(value)
    if path.is_absolute() or path.as_posix() != value:
        raise PackError(f"unsafe member path: {value!r}")
    parts = value.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise PackError(f"unsafe member path: {value!r}")
    for part in parts:
        if part.endswith((".", " ")) or any(ord(char) < 32 or ord(char) == 127 for char in part):
            raise PackError(f"unsafe member path: {value!r}")
        device_name = part.split(".", 1)[0].casefold()
        if device_name in WINDOWS_RESERVED:
            raise PackError(f"unsafe member path: {value!r}")
    return value


def _read_regular_file(path: pathlib.Path, expected_stat: os.stat_result) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise PackError(f"cannot safely open regular file {path}: {exc}") from exc
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or (before.st_dev, before.st_ino) != (
            expected_stat.st_dev,
            expected_stat.st_ino,
        ):
            raise PackError(f"input changed during scan: {path}")
        chunks = []
        with os.fdopen(fd, "rb", closefd=False) as stream:
            while True:
                chunk = stream.read(CHUNK_SIZE)
                if not chunk:
                    break
                chunks.append(chunk)
        data = b"".join(chunks)
        after = os.fstat(fd)
        signature_before = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
        signature_after = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
        signature_expected = (
            expected_stat.st_dev,
            expected_stat.st_ino,
            expected_stat.st_size,
            expected_stat.st_mtime_ns,
            expected_stat.st_ctime_ns,
        )
        if signature_before != signature_expected or signature_after != signature_before or len(data) != before.st_size:
            raise PackError(f"input changed while reading: {path}")
        return data
    finally:
        os.close(fd)


def _scan_input(root: pathlib.Path) -> list[dict[str, Any]]:
    members: list[dict[str, Any]] = []

    def visit(directory: pathlib.Path, prefix: tuple[str, ...]) -> None:
        try:
            with os.scandir(directory) as scan:
                entries = sorted(scan, key=lambda entry: entry.name)
        except OSError as exc:
            raise PackError(f"cannot scan input directory {directory}: {exc}") from exc
        for entry in entries:
            name = entry.name
            relative = "/".join((*prefix, name))
            _validate_member_path(relative)
            try:
                entry_stat = entry.stat(follow_symlinks=False)
            except OSError as exc:
                raise PackError(f"cannot stat input path {relative!r}: {exc}") from exc
            if stat.S_ISLNK(entry_stat.st_mode):
                raise PackError(f"symlink input is not allowed: {relative}")
            if stat.S_ISDIR(entry_stat.st_mode):
                visit(pathlib.Path(entry.path), (*prefix, name))
            elif stat.S_ISREG(entry_stat.st_mode):
                data = _read_regular_file(pathlib.Path(entry.path), entry_stat)
                members.append({
                    "path": relative,
                    "size_bytes": len(data),
                    "sha256": _sha256(data),
                    "data": data,
                })
            else:
                raise PackError(f"special file is not allowed: {relative}")

    visit(root, ())
    members.sort(key=lambda member: member["path"])
    return members


def _make_archive(members: list[dict[str, Any]]) -> bytes:
    tar_bytes = io.BytesIO()
    with gzip.GzipFile(fileobj=tar_bytes, filename="", mode="wb", compresslevel=9, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
            for member in members:
                info = tarfile.TarInfo(name=member["path"])
                info.type = tarfile.REGTYPE
                info.size = member["size_bytes"]
                info.mode = 0o644
                info.uid = 0
                info.gid = 0
                info.uname = ""
                info.gname = ""
                info.mtime = 0
                info.linkname = ""
                info.pax_headers = {}
                archive.addfile(info, io.BytesIO(member["data"]))
    return tar_bytes.getvalue()


def _build_index(members: list[dict[str, Any]], archive: bytes) -> tuple[dict[str, Any], list[tuple[str, bytes]]]:
    parts: list[tuple[str, bytes]] = []
    part_records: list[dict[str, Any]] = []
    for part_index, start in enumerate(range(0, len(archive), PART_LIMIT)):
        data = archive[start : start + PART_LIMIT]
        name = f"part-{part_index:05d}.bin"
        parts.append((name, data))
        part_records.append({"name": name, "size_bytes": len(data), "sha256": _sha256(data)})
    if not parts:
        raise PackError("internal error: generated empty archive")
    member_records = [
        {"path": member["path"], "size_bytes": member["size_bytes"], "sha256": member["sha256"]}
        for member in members
    ]
    index = {
        "schema": SCHEMA,
        "part_size_limit": PART_LIMIT,
        "archive": {"size_bytes": len(archive), "sha256": _sha256(archive)},
        "parts": part_records,
        "members": member_records,
    }
    return index, parts


def _write_new_file(path: pathlib.Path, data: bytes) -> None:
    with path.open("xb") as stream:
        stream.write(data)
    try:
        path.chmod(0o644)
    except OSError:
        pass


def pack(input_path: str | os.PathLike[str], output_path: str | os.PathLike[str]) -> dict[str, Any]:
    root = _canonical_existing_dir(input_path, "input root")
    output = _canonical_new_dir(output_path, "output")
    if _is_within(output, root):
        raise PackError(f"output must be outside the input tree: {output}")
    if os.path.lexists(output):
        raise PackError(f"output already exists: {output}")

    members = _scan_input(root)
    archive = _make_archive(members)
    index, parts = _build_index(members, archive)
    index_bytes = (json.dumps(index, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("ascii")

    created = False
    try:
        output.mkdir(mode=0o755, exist_ok=False)
        created = True
        for name, data in parts:
            _write_new_file(output / name, data)
        _write_new_file(output / "index.json", index_bytes)
    except Exception:
        if created:
            shutil.rmtree(output, ignore_errors=True)
        raise
    return index


def _strict_json_object(data: bytes, label: str) -> dict[str, Any]:
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise PackError(f"duplicate JSON key {key!r} in {label}")
            result[key] = value
        return result

    try:
        value = json.loads(data.decode("utf-8"), object_pairs_hook=unique_object)
    except PackError:
        raise
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackError(f"invalid JSON in {label}: {exc}") from exc
    if not isinstance(value, dict):
        raise PackError(f"{label} must be a JSON object")
    return value


def _require_int(value: Any, label: str, minimum: int = 0) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise PackError(f"{label} must be an integer >= {minimum}")
    return value


def _require_hash(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise PackError(f"{label} must be a lowercase SHA-256 hex digest")
    return value


def _validate_index(index: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int, str]:
    expected_keys = {"schema", "part_size_limit", "archive", "parts", "members"}
    if set(index) != expected_keys:
        raise PackError(f"index has unexpected or missing keys: {sorted(index)}")
    if index.get("schema") != SCHEMA:
        raise PackError(f"unsupported index schema: {index.get('schema')!r}")
    limit = _require_int(index.get("part_size_limit"), "part_size_limit", 1)
    if limit != PART_LIMIT:
        raise PackError(f"part_size_limit must equal {PART_LIMIT}")

    archive_record = index.get("archive")
    if not isinstance(archive_record, dict) or set(archive_record) != {"size_bytes", "sha256"}:
        raise PackError("archive must contain exactly size_bytes and sha256")
    archive_size = _require_int(archive_record.get("size_bytes"), "archive.size_bytes", 1)
    archive_hash = _require_hash(archive_record.get("sha256"), "archive.sha256")

    raw_parts = index.get("parts")
    if not isinstance(raw_parts, list) or not raw_parts:
        raise PackError("parts must be a non-empty array")
    expected_part_count = (archive_size + PART_LIMIT - 1) // PART_LIMIT
    if len(raw_parts) != expected_part_count:
        raise PackError("part count does not match archive size")
    parts = []
    total_part_bytes = 0
    for position, record in enumerate(raw_parts):
        if not isinstance(record, dict) or set(record) != {"name", "size_bytes", "sha256"}:
            raise PackError(f"parts[{position}] must contain exactly name, size_bytes, and sha256")
        expected_name = f"part-{position:05d}.bin"
        if record.get("name") != expected_name or not PART_RE.fullmatch(str(record.get("name"))):
            raise PackError(f"parts[{position}].name must be {expected_name}")
        size = _require_int(record.get("size_bytes"), f"parts[{position}].size_bytes", 1)
        expected_size = min(PART_LIMIT, archive_size - total_part_bytes)
        if size != expected_size:
            raise PackError(f"parts[{position}].size_bytes does not match deterministic split size")
        digest = _require_hash(record.get("sha256"), f"parts[{position}].sha256")
        parts.append({"name": expected_name, "size_bytes": size, "sha256": digest})
        total_part_bytes += size
    if total_part_bytes != archive_size:
        raise PackError("part sizes do not sum to archive size")

    raw_members = index.get("members")
    if not isinstance(raw_members, list):
        raise PackError("members must be an array")
    members = []
    previous = None
    member_paths = set()
    for position, record in enumerate(raw_members):
        if not isinstance(record, dict) or set(record) != {"path", "size_bytes", "sha256"}:
            raise PackError(f"members[{position}] must contain exactly path, size_bytes, and sha256")
        member_path = _validate_member_path(record.get("path"))
        if previous is not None and member_path <= previous:
            raise PackError("member paths must be unique and sorted")
        previous = member_path
        member_paths.add(member_path)
        members.append({
            "path": member_path,
            "size_bytes": _require_int(record.get("size_bytes"), f"members[{position}].size_bytes"),
            "sha256": _require_hash(record.get("sha256"), f"members[{position}].sha256"),
        })
    for member in members:
        parent = pathlib.PurePosixPath(member["path"]).parent
        while parent.as_posix() != ".":
            if parent.as_posix() in member_paths:
                raise PackError(f"member path conflicts with a file parent: {parent.as_posix()!r}")
            parent = parent.parent
    return parts, members, archive_size, archive_hash


def _read_package_file(path: pathlib.Path, label: str) -> bytes:
    try:
        info = path.lstat()
    except OSError as exc:
        raise PackError(f"missing {label}: {path}") from exc
    if stat.S_ISLNK(info.st_mode):
        raise PackError(f"symlink is not allowed for {label}: {path}")
    if not stat.S_ISREG(info.st_mode):
        raise PackError(f"{label} must be a regular file: {path}")
    return _read_regular_file(path, info)


def _verify_package_files(package: pathlib.Path, part_records: list[dict[str, Any]]) -> None:
    allowed = {"index.json", *(record["name"] for record in part_records)}
    try:
        entries = list(os.scandir(package))
    except OSError as exc:
        raise PackError(f"cannot list package directory {package}: {exc}") from exc
    for entry in entries:
        if entry.name not in allowed:
            raise PackError(f"unexpected package entry: {entry.name!r}")
        try:
            info = entry.stat(follow_symlinks=False)
        except OSError as exc:
            raise PackError(f"cannot stat package entry {entry.name!r}: {exc}") from exc
        if stat.S_ISLNK(info.st_mode):
            raise PackError(f"symlink is not allowed in package: {entry.name}")
        if not stat.S_ISREG(info.st_mode):
            raise PackError(f"package entry must be a regular file: {entry.name}")
    missing = allowed - {entry.name for entry in entries}
    if missing:
        name = sorted(missing)[0]
        if name == "index.json":
            raise PackError("missing package index.json")
        raise PackError(f"missing archive part: {name}")


def _bounded_gzip_decompress(archive: bytes, members: list[dict[str, Any]]) -> bytes:
    if len(archive) < 10 or archive[3] != 0 or archive[4:8] != b"\x00\x00\x00\x00":
        raise PackError("archive gzip header must have zero mtime and no optional fields")
    expected_payload = sum(member["size_bytes"] for member in members)
    # Headers, PAX path records, and tar end padding are bounded relative to
    # member count and path length. This prevents a small gzip bomb from
    # exhausting memory before tar members can be validated.
    path_bytes = sum(len(member["path"].encode("utf-8")) for member in members)
    maximum = expected_payload + (len(members) + 2) * 4096 + path_bytes * 2 + 1024 * 1024
    output = io.BytesIO()
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(archive), mode="rb") as compressed:
            while True:
                chunk = compressed.read(CHUNK_SIZE)
                if not chunk:
                    break
                if output.tell() + len(chunk) > maximum:
                    raise PackError("decompressed tar exceeds bounded size")
                output.write(chunk)
    except PackError:
        raise
    except (OSError, EOFError, zlib.error) as exc:
        raise PackError(f"invalid gzip archive: {exc}") from exc
    return output.getvalue()


def _extract_and_check_tar(tar_bytes: bytes, expected_members: list[dict[str, Any]]) -> list[tuple[str, bytes]]:
    try:
        archive = tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:", errorlevel=2)
    except (tarfile.TarError, OSError) as exc:
        raise PackError(f"invalid tar archive: {exc}") from exc
    with archive:
        try:
            tar_members = archive.getmembers()
        except (tarfile.TarError, OSError) as exc:
            raise PackError(f"invalid tar member table: {exc}") from exc
        if any(tar_bytes[archive.offset:]):
            raise PackError("tar archive contains non-zero trailing data")
        if len(tar_members) != len(expected_members):
            raise PackError("archive member count does not match index")
        restored: list[tuple[str, bytes]] = []
        for position, (tar_member, expected) in enumerate(zip(tar_members, expected_members)):
            member_path = _validate_member_path(tar_member.name)
            if member_path != expected["path"]:
                raise PackError(f"archive member path mismatch at position {position}")
            if tar_member.type != tarfile.REGTYPE or not tar_member.isfile():
                raise PackError(f"archive member must be a regular file: {member_path}")
            if (tar_member.uid, tar_member.gid, tar_member.mtime, tar_member.mode) != (0, 0, 0, 0o644):
                raise PackError(f"archive member metadata is not normalized: {member_path}")
            if tar_member.uname != "" or tar_member.gname != "" or tar_member.linkname:
                raise PackError(f"archive member ownership or link metadata is not normalized: {member_path}")
            if tar_member.size != expected["size_bytes"]:
                raise PackError(f"archive member size mismatch: {member_path}")
            stream = archive.extractfile(tar_member)
            if stream is None:
                raise PackError(f"cannot read archive member: {member_path}")
            with stream:
                data = stream.read()
            if len(data) != expected["size_bytes"]:
                raise PackError(f"archive member truncated: {member_path}")
            if _sha256(data) != expected["sha256"]:
                raise PackError(f"archive member SHA-256 mismatch: {member_path}")
            restored.append((member_path, data))
        return restored


def verify(package_path: str | os.PathLike[str]) -> tuple[dict[str, Any], list[tuple[str, bytes]]]:
    package = _canonical_existing_dir(package_path, "package input")
    index_data = _read_package_file(package / "index.json", "package index.json")
    index = _strict_json_object(index_data, "index.json")
    part_records, member_records, archive_size, archive_hash = _validate_index(index)
    _verify_package_files(package, part_records)

    archive_parts = []
    for part in part_records:
        data = _read_package_file(package / part["name"], f"archive part {part['name']}")
        if len(data) != part["size_bytes"]:
            raise PackError(f"part size mismatch: {part['name']}")
        if _sha256(data) != part["sha256"]:
            raise PackError(f"part SHA-256 mismatch: {part['name']}")
        archive_parts.append(data)
    archive_bytes = b"".join(archive_parts)
    if len(archive_bytes) != archive_size:
        raise PackError("aggregate archive size mismatch")
    if _sha256(archive_bytes) != archive_hash:
        raise PackError("aggregate archive SHA-256 mismatch")

    tar_bytes = _bounded_gzip_decompress(archive_bytes, member_records)
    restored = _extract_and_check_tar(tar_bytes, member_records)
    return index, restored


def restore(package_path: str | os.PathLike[str], destination_path: str | os.PathLike[str], verified_members: list[tuple[str, bytes]]) -> pathlib.Path:
    package = _canonical_existing_dir(package_path, "package input")
    destination = _canonical_new_dir(destination_path, "restore destination")
    if _is_within(destination, package):
        raise PackError("restore destination must be outside the package directory")
    if os.path.lexists(destination):
        raise PackError(f"restore destination already exists: {destination}")

    created = False
    try:
        destination.mkdir(mode=0o755, exist_ok=False)
        created = True
        created_dirs = {"."}
        for member_path, data in verified_members:
            parts = pathlib.PurePosixPath(member_path).parts
            current = destination
            relative_dir = []
            for part in parts[:-1]:
                relative_dir.append(part)
                current = current / part
                key = "/".join(relative_dir)
                if key not in created_dirs:
                    current.mkdir(mode=0o755, exist_ok=False)
                    created_dirs.add(key)
            target = current / parts[-1]
            _write_new_file(target, data)
    except Exception:
        if created:
            shutil.rmtree(destination, ignore_errors=True)
        raise
    return destination


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="input tree to pack, or package directory with --verify")
    parser.add_argument("--output", help="new package output directory (pack mode only)")
    parser.add_argument("--verify", action="store_true", help="verify an existing package instead of creating one")
    parser.add_argument("--restore", help="after verification, restore into this new directory")
    args = parser.parse_args(argv)
    if args.verify:
        if args.output:
            parser.error("--output cannot be combined with --verify")
    else:
        if not args.output:
            parser.error("--output is required unless --verify is used")
        if args.restore:
            parser.error("--restore requires --verify")
    return args


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        if args.verify:
            index, members = verify(args.input)
            if args.restore:
                restored_to = restore(args.input, args.restore, members)
                print(f"verified and restored {len(members)} files to {restored_to}")
            else:
                print(f"verified {len(members)} files, {len(index['parts'])} parts, archive sha256 {index['archive']['sha256']}")
        else:
            index = pack(args.input, args.output)
            print(f"packed {len(index['members'])} files into {len(index['parts'])} parts at {pathlib.Path(args.output).resolve()}")
        return 0
    except (PackError, OSError, tarfile.TarError, ValueError) as exc:
        print(f"pack_evidence: error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
