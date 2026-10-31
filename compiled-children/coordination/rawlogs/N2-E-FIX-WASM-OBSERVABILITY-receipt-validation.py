#!/usr/bin/env python3
"""Read-only native protocol and artifact-pin validation for the author receipt."""
import hashlib
import json
from pathlib import Path
import sys

root = Path.cwd()
receipt_path = root / "compiled-children/coordination/receipts/E-FIX-WASM-OBSERVABILITY.json"
receipt = json.loads(receipt_path.read_text())
sys.path.insert(0, str(root / "compiled-children/coordination"))
from probe import load_state, validate_receipt  # noqa: E402

state = load_state(root / "compiled-children/coordination/state.json")
job = state["jobs"]["E-FIX-WASM-OBSERVABILITY"]
validate_receipt(receipt, job, "N2")
skip = {
    "compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-receipt-validation.log",
    "compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-receipt-validation.exit.log",
}
checked = set()

def verify(path, sha, size=None):
    if path in skip:
        return
    target = root / path
    if not target.is_file():
        raise AssertionError(f"missing pinned file: {path}")
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != sha:
        raise AssertionError(f"SHA-256 mismatch: {path}")
    if size is not None and len(raw) != size:
        raise AssertionError(f"byte count mismatch: {path}")
    checked.add(path)

def walk(value):
    if isinstance(value, dict):
        if isinstance(value.get("path"), str) and isinstance(value.get("sha256"), str):
            verify(value["path"], value["sha256"], value.get("bytes"))
        for item in value.values():
            walk(item)
    elif isinstance(value, list):
        for item in value:
            walk(item)

walk(receipt)
for path, expected in receipt["repair"]["exclusive_source_sha256"].items():
    raw = (root / path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected:
        raise AssertionError(f"source SHA-256 mismatch: {path}")
report = receipt["report"]
print("native probe identity/outcome validation: PASS (E-FIX-WASM-OBSERVABILITY/N2)")
print("current source and referenced artifact SHA/length pins: PASS")
print(f"report bytes: {report['bytes']}; SHA-256: {report['sha256']}")
