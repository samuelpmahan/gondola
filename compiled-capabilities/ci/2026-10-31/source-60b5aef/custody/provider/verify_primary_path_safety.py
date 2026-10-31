#!/usr/bin/env python3
"""Strict raw-component audit for the verified outer ZIP and inner tar paths."""
from __future__ import annotations

import json
from pathlib import Path
import stat
import tarfile
import zipfile


BASE = Path(__file__).resolve().parent
ZIP = BASE / "primary-push-run-41193504188-artifact.zip"
EXTRACTED = BASE / "primary-push-run-41193504188-extracted"
INNER = EXTRACTED / "compiled-capabilities/builds/attempts/attempt-20261031T103752934Z/capabilities-artifacts.tar.gz"


def check_name(name: str, directory: bool) -> tuple[str, ...]:
    if not name or name.startswith("/") or "\\" in name:
        raise ValueError(f"unsafe absolute or backslash path: {name!r}")
    if directory:
        if name.endswith("/"):
            name = name[:-1]
    elif name.endswith("/"):
        raise ValueError(f"file path ends in slash: {name!r}")
    parts = name.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ValueError(f"unsafe raw path component: {name!r}")
    if ":" in parts[0]:
        raise ValueError(f"drive-like path: {name!r}")
    return tuple(parts)


def main() -> None:
    zip_names: set[str] = set()
    zip_files = zip_dirs = 0
    with zipfile.ZipFile(ZIP) as archive:
        for info in archive.infolist():
            name = info.filename
            if name in zip_names:
                raise ValueError(f"duplicate outer ZIP path: {name!r}")
            zip_names.add(name)
            is_dir = info.is_dir()
            check_name(name, is_dir)
            mode = (info.external_attr >> 16) & 0xFFFF
            kind = stat.S_IFMT(mode)
            if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                raise ValueError(f"special outer ZIP member: {name!r}")
            if is_dir:
                zip_dirs += 1
            else:
                zip_files += 1
            if (EXTRACTED / name).resolve().is_relative_to(EXTRACTED.resolve()) is False:
                raise ValueError(f"outer extracted path escapes root: {name!r}")

    tar_names: set[str] = set()
    tar_files = tar_dirs = 0
    with tarfile.open(INNER, "r:gz") as archive:
        for member in archive.getmembers():
            if member.name in tar_names:
                raise ValueError(f"duplicate inner tar path: {member.name!r}")
            tar_names.add(member.name)
            is_dir = member.isdir()
            check_name(member.name, is_dir)
            if not (is_dir or member.isfile()):
                raise ValueError(f"special inner tar member: {member.name!r}")
            if is_dir:
                tar_dirs += 1
            else:
                tar_files += 1

    result = {
        "schema": "gobi.primary-artifact-path-safety/v1",
        "outer_zip_member_count": len(zip_names),
        "outer_zip_file_count": zip_files,
        "outer_zip_directory_count": zip_dirs,
        "outer_zip_raw_paths_safe_and_unique": True,
        "outer_extraction_paths_confined": True,
        "inner_tar_member_count": len(tar_names),
        "inner_tar_file_count": tar_files,
        "inner_tar_directory_count": tar_dirs,
        "inner_tar_raw_paths_safe_and_unique": True,
        "inner_tar_contains_only_regular_files_and_directories": True,
    }
    out = BASE / "primary-push-run-41193504188-path-safety.json"
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
