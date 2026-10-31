#!/usr/bin/env python3
"""Rerun the evidence verifier without replacing its retained output file."""

from __future__ import annotations

import hashlib
import runpy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[6]
AUDIT = ROOT / "compiled-backends/ci/2026-10-31/lanes/evidence/audit_published_packet.py"
RESULT = ROOT / "compiled-backends/ci/2026-10-31/lanes/evidence/published-packet-audit.json"

original_write_text = Path.write_text
captured: dict[str, bytes] = {}


def intercept_result(path: Path, content: str, *args, **kwargs):
    if path.resolve() == RESULT.resolve():
        encoding = kwargs.get("encoding") or "utf-8"
        captured["audit"] = content.encode(encoding)
        return len(content)
    return original_write_text(path, content, *args, **kwargs)


Path.write_text = intercept_result
runpy.run_path(str(AUDIT), run_name="__main__")

assert "audit" in captured, "verifier did not produce its audit output"
retained = RESULT.read_bytes()
assert captured["audit"] == retained, "recomputed audit differs from retained result"
print(
    "audit_output_byte_identical=true",
    f"bytes={len(retained)}",
    f"sha256={hashlib.sha256(retained).hexdigest()}",
)
