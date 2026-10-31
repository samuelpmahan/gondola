#!/usr/bin/env python3
"""Inventory and archive the corrected temporary custody stage."""
from __future__ import annotations

import json
from pathlib import Path
import sys

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import prepare_archive  # noqa: E402

OWN = prepare_archive.OWN
STAGE = Path("/tmp/gobi-author-custody-final-stage-20261031-cut-125230-v3")
INVENTORY = OWN / "archive-inventory.final.json"
ARCHIVE = OWN / "pre-repair-author-review-history.final.tar.gz"


def main() -> int:
    if not STAGE.is_dir():
        raise SystemExit(f"final temp stage is missing: {STAGE}")
    if INVENTORY.exists() or ARCHIVE.exists():
        raise SystemExit("refusing to overwrite final inventory/archive")
    entries = []
    for path in sorted(STAGE.rglob("*")):
        if path.is_symlink():
            raise SystemExit(f"rejecting symlink in final stage: {path}")
        if path.is_file():
            size, digest = prepare_archive.digest_path(path)
            entries.append({"member": path.relative_to(STAGE).as_posix(), "bytes": size, "sha256": digest})
    if not entries:
        raise SystemExit("final stage is empty")
    INVENTORY.write_text(json.dumps({
        "schema": "gobi.author-custody-archive-inventory/v1",
        "native_snapshot_time_utc": "2026-10-31T12:51:44Z",
        "coordination_rawlog_cutoff_utc": "2026-10-31T12:52:30Z",
        "source_stage": str(STAGE),
        "archive_member_count": len(entries),
        "members": entries,
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    INVENTORY.chmod(0o444)
    prepare_archive.create_archive(ARCHIVE, stage_path=STAGE, inventory_path=INVENTORY)
    size, digest = prepare_archive.digest_path(ARCHIVE)
    print(f"archive={ARCHIVE}")
    print(f"archive_bytes={size}")
    print(f"archive_sha256={digest}")
    print(f"inventory={INVENTORY}")
    print(f"inventory_sha256={prepare_archive.digest_path(INVENTORY)[1]}")
    print(f"members={len(entries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
