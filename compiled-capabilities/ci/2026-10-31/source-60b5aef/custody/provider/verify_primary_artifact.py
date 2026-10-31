#!/usr/bin/env python3
"""Verify and safely extract the pinned primary capability artifact once."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import sys
import zipfile


HERE = Path(__file__).resolve().parent
ZIP = HERE / "primary-push-run-41193504188-artifact.zip"
DEST = HERE / "primary-push-run-41193504188-extracted"
STAGING = HERE / ".primary-push-run-41193504188-extracting"
INVENTORY = HERE / "primary-push-run-41193504188-member-inventory.json"
OUTER = HERE / "primary-push-run-41193504188-outer-verification.json"
EXPECTED_BYTES = 76_786_265
EXPECTED_SHA256 = "3a54a53c81ac93ad1c5a8231b17ac289875ed57ad7bb12d7ae2b3609ff267de1"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_parts(name: str, is_dir: bool) -> tuple[str, ...]:
    if not name or "\\" in name or name.startswith("/"):
        raise ValueError(f"unsafe member path: {name!r}")
    path = PurePosixPath(name)
    parts = path.parts[:-1] if is_dir and path.parts[-1:] == ("",) else path.parts
    if not parts or any(part in ("", ".", "..") for part in parts):
        raise ValueError(f"unsafe member path: {name!r}")
    if ":" in parts[0]:
        raise ValueError(f"drive-like member path: {name!r}")
    return tuple(parts)


def main() -> int:
    if DEST.exists() or STAGING.exists() or INVENTORY.exists() or OUTER.exists():
        raise SystemExit("refusing to overwrite an existing custody output")
    size = ZIP.stat().st_size
    digest = sha256_file(ZIP)
    if size != EXPECTED_BYTES or digest != EXPECTED_SHA256:
        raise SystemExit(f"ZIP identity mismatch: bytes={size}, sha256={digest}")

    STAGING.mkdir()
    inventory: list[dict[str, object]] = []
    seen: set[str] = set()
    extracted_bytes = 0
    try:
        with zipfile.ZipFile(ZIP, "r") as archive:
            infos = archive.infolist()
            if len(infos) != 1476:
                raise ValueError(f"unexpected member count: {len(infos)}")
            for info in infos:
                name = info.filename
                if name in seen:
                    raise ValueError(f"duplicate member path: {name!r}")
                seen.add(name)
                is_dir = info.is_dir()
                parts = safe_parts(name, is_dir)
                if info.flag_bits & 0x1:
                    raise ValueError(f"encrypted member: {name!r}")
                mode = (info.external_attr >> 16) & 0xFFFF
                file_type = stat.S_IFMT(mode)
                if file_type not in (0, stat.S_IFREG, stat.S_IFDIR):
                    raise ValueError(f"unsupported member type {oct(file_type)}: {name!r}")
                if is_dir and file_type not in (0, stat.S_IFDIR):
                    raise ValueError(f"directory type mismatch: {name!r}")
                if not is_dir and file_type == stat.S_IFDIR:
                    raise ValueError(f"file type mismatch: {name!r}")

                target = STAGING.joinpath(*parts)
                if is_dir:
                    target.mkdir(parents=True, exist_ok=True)
                    inventory.append({"path": name, "type": "directory", "bytes": 0, "crc32": f"{info.CRC:08x}", "sha256": None})
                    continue

                target.parent.mkdir(parents=True, exist_ok=True)
                member_hash = hashlib.sha256()
                member_bytes = 0
                with archive.open(info, "r") as src, target.open("xb") as dst:
                    for block in iter(lambda: src.read(1024 * 1024), b""):
                        dst.write(block)
                        member_hash.update(block)
                        member_bytes += len(block)
                if member_bytes != info.file_size:
                    raise ValueError(f"member length mismatch for {name!r}: {member_bytes} != {info.file_size}")
                extracted_bytes += member_bytes
                inventory.append({"path": name, "type": "file", "bytes": member_bytes, "crc32": f"{info.CRC:08x}", "sha256": member_hash.hexdigest()})

        os.replace(STAGING, DEST)
        outer_record = {
            "schema": "gobi.primary-artifact-verification/v1",
            "artifact_id": 13040129310,
            "run_id": 41193504188,
            "repository": "samuelpmahan/gondola",
            "provider_expected_bytes": EXPECTED_BYTES,
            "provider_expected_sha256": EXPECTED_SHA256,
            "observed_bytes": size,
            "observed_sha256": digest,
            "zip_member_count": len(inventory),
            "expanded_file_bytes": extracted_bytes,
            "expanded_directory_count": sum(item["type"] == "directory" for item in inventory),
            "all_members_crc_and_sha_verified": True,
            "safe_paths_and_regular_types_only": True,
            "extraction_root": str(DEST),
        }
        INVENTORY.write_text(json.dumps({"schema": "gobi.primary-artifact-member-inventory/v1", "members": inventory}, indent=2) + "\n", encoding="utf-8")
        OUTER.write_text(json.dumps(outer_record, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(outer_record, sort_keys=True))
        return 0
    except BaseException:
        shutil.rmtree(STAGING, ignore_errors=True)
        raise


if __name__ == "__main__":
    sys.exit(main())
