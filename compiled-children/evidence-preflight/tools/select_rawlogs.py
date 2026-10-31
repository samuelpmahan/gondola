#!/usr/bin/env python3
"""Freeze the 235 coordination rawlog entries selected for author custody."""
from __future__ import annotations

import json
from pathlib import Path

OWN = Path(__file__).resolve().parents[1]
BASE = OWN / "archive-root"
SOURCE_INVENTORY = BASE / "CONTENT-INVENTORY.json"
OUT = OWN / "selection-rawlogs-235.json"
CUTOFF = 1793451150  # 2026-10-31T12:52:30Z


def main() -> None:
    if OUT.exists():
        raise SystemExit(f"refusing to overwrite frozen selection list: {OUT}")
    inventory = json.loads(SOURCE_INVENTORY.read_text(encoding="utf-8"))
    rows = [
        {k: item[k] for k in ("member", "source", "source_bytes", "source_mtime_ns", "sha256", "role")}
        for item in inventory["files"]
        if item["member"].startswith("project/compiled-children/coordination/rawlogs/")
        and item["source_mtime_ns"] <= CUTOFF * 1_000_000_000
    ]
    rows.sort(key=lambda item: item["member"])
    if len(rows) != 235:
        raise SystemExit(f"selected {len(rows)} rawlogs; expected the parent-frozen count 235")
    data = {
        "schema": "gobi.author-custody-rawlog-selection/v1",
        "cutoff_utc": "2026-10-31T12:52:30Z",
        "selection_basis": "Frozen CONTENT-INVENTORY source_mtime_ns cutoff selected 235 entries, matching the initial coordination/rawlogs count; no later N2/N6 or fresh harness paths are admitted.",
        "count": len(rows),
        "entries": rows,
    }
    OUT.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"selection={OUT}")
    print(f"count={len(rows)}")
    print(f"sha256={__import__('hashlib').sha256(OUT.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
