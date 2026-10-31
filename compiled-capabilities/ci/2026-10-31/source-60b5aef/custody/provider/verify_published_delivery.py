#!/usr/bin/env python3
"""Read-only verification of root's durable chunked primary-CI delivery."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[6]
DELIVERY = REPO / "compiled-capabilities/ci/2026-10-31/published/primary-ci/delivery.json"
OUT = Path(__file__).resolve().parent / "primary-ci-delivery-verification.json"


def sha256(path: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
            size += len(block)
    return size, h.hexdigest()


def main() -> None:
    dbytes, dsha = sha256(DELIVERY)
    delivery = json.loads(DELIVERY.read_bytes())
    joined = hashlib.sha256()
    total = 0
    chunk_evidence = []
    for entry in delivery["chunks"]:
        path = REPO / entry["path"]
        size, digest = sha256(path)
        if (size, digest) != (entry["bytes"], entry["sha256"]):
            raise ValueError(f"delivery chunk mismatch: {entry['path']}")
        with path.open("rb") as f:
            for block in iter(lambda: f.read(1024 * 1024), b""):
                joined.update(block)
        total += size
        chunk_evidence.append({"path": entry["path"], "bytes": size, "sha256": digest})
    inner = Path(__file__).resolve().parent / "primary-push-run-41193504188-extracted/compiled-capabilities/builds/attempts/attempt-20261031T103752934Z/capabilities-artifacts.tar.gz"
    inner_bytes, inner_sha = sha256(inner)
    if (total, joined.hexdigest()) != (delivery["archive"]["bytes"], delivery["archive"]["sha256"]):
        raise ValueError("concatenated delivery bytes differ from delivery record")
    if (total, joined.hexdigest()) != (inner_bytes, inner_sha):
        raise ValueError("concatenated delivery bytes differ from verified provider archive")
    records = []
    for entry in delivery["records"]:
        path = REPO / entry["path"]
        size, digest = sha256(path)
        if (size, digest) != (entry["bytes"], entry["sha256"]):
            raise ValueError(f"delivery record mismatch: {entry['path']}")
        records.append({"path": entry["path"], "bytes": size, "sha256": digest})
    result = {
        "schema": "gobi.primary-ci-delivery-verification/v1",
        "source": delivery["source"],
        "tree": delivery["tree"],
        "run": delivery["run"],
        "job": delivery["job"],
        "delivery_path": str(DELIVERY),
        "delivery_bytes": dbytes,
        "delivery_sha256": dsha,
        "chunk_count": len(chunk_evidence),
        "chunks": chunk_evidence,
        "reconstructed_archive_bytes": total,
        "reconstructed_archive_sha256": joined.hexdigest(),
        "matches_provider_archive": True,
        "record_count": len(records),
        "records": records,
    }
    OUT.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("delivery_path", "delivery_bytes", "delivery_sha256", "chunk_count", "reconstructed_archive_bytes", "reconstructed_archive_sha256", "matches_provider_archive", "record_count")}, sort_keys=True))


if __name__ == "__main__":
    main()
