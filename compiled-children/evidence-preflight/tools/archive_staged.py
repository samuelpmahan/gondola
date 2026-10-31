#!/usr/bin/env python3
"""Create a fresh uniquely named archive from an already frozen stage."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import prepare_archive  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("output_name", help="new tar.gz filename inside evidence-preflight")
    args = parser.parse_args()
    target = (prepare_archive.OWN / args.output_name).resolve()
    if target.parent != prepare_archive.OWN or not target.name.endswith(".tar.gz"):
        raise SystemExit("output must be a new .tar.gz file directly inside evidence-preflight")
    if not prepare_archive.STAGE.is_dir() or not prepare_archive.INVENTORY.is_file():
        raise SystemExit("frozen archive-root and archive-inventory.json are required")
    prepare_archive.create_archive(target)
    size, digest = prepare_archive.digest_path(target)
    print(f"archive={target}")
    print(f"bytes={size}")
    print(f"sha256={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
