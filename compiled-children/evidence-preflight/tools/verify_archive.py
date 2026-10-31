#!/usr/bin/env python3
"""Independent streaming consumer for the E-AUTHOR-CUSTODY tar.gz archive."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import tarfile
import time

CHUNK = 1024 * 1024


def normalized(name: str) -> str:
    while name.startswith("./"):
        name = name[2:]
    return name.rstrip("/")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("inventory", type=Path)
    args = parser.parse_args()
    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    expected = {row["member"]: row for row in inventory["members"]}
    seen = {}
    total_bytes = 0
    start = time.monotonic()
    with tarfile.open(args.archive, mode="r|gz") as archive:
        for entry in archive:
            name = normalized(entry.name)
            if entry.isdir():
                continue
            if not entry.isfile():
                raise SystemExit(f"rejecting non-regular archive member: {entry.name} type={entry.type!r}")
            if name in seen:
                raise SystemExit(f"duplicate archive member: {name}")
            if name not in expected:
                raise SystemExit(f"unexpected archive member: {name}")
            h = hashlib.sha256()
            size = 0
            stream = archive.extractfile(entry)
            if stream is None:
                raise SystemExit(f"unreadable archive member: {name}")
            with stream:
                while True:
                    block = stream.read(CHUNK)
                    if not block:
                        break
                    size += len(block)
                    h.update(block)
            row = expected[name]
            digest = h.hexdigest()
            if size != row["bytes"] or digest != row["sha256"]:
                raise SystemExit(
                    f"member mismatch {name}: observed bytes={size} sha256={digest}; "
                    f"expected bytes={row['bytes']} sha256={row['sha256']}"
                )
            seen[name] = {"bytes": size, "sha256": digest}
            total_bytes += size
    missing = sorted(set(expected) - set(seen))
    if missing:
        raise SystemExit("missing archive members: " + ", ".join(missing[:20]))
    archive_hash = hashlib.sha256()
    archive_bytes = 0
    with args.archive.open("rb") as stream:
        while True:
            block = stream.read(CHUNK)
            if not block:
                break
            archive_bytes += len(block)
            archive_hash.update(block)
    print(json.dumps({
        "result": "verified",
        "archive": str(args.archive),
        "archive_bytes": archive_bytes,
        "archive_sha256": archive_hash.hexdigest(),
        "inventory": str(args.inventory),
        "expected_regular_members": len(expected),
        "verified_regular_members": len(seen),
        "uncompressed_member_bytes": total_bytes,
        "elapsed_seconds": round(time.monotonic() - start, 3),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
