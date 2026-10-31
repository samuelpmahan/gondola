#!/usr/bin/env python3
"""Read-only validation of the XR-DELIVERY packet and its pinned files."""
import hashlib
import json
import pathlib
import sys

root = pathlib.Path.cwd()
receipt_path = root / "compiled-children/coordination/receipts/XR-DELIVERY.json"
receipt = json.loads(receipt_path.read_text())
sys.path.insert(0, str(root / "compiled-children/coordination"))
from probe import load_state, validate_receipt  # noqa: E402

state = load_state(root / "compiled-children/coordination/state.json")
validate_receipt(receipt, state["jobs"]["XR-DELIVERY"], "N2")
verified = 0

def verify(path, sha, size=None):
    global verified
    target = root / path
    if path in {"compiled-children/coordination/rawlogs/N2-XR-DELIVERY-receipt-validation.log", "compiled-children/coordination/rawlogs/N2-XR-DELIVERY-receipt-validation-exit.log"}:
        if not target.is_file():
            raise AssertionError(f"missing validator output: {path}")
        return
    if not target.is_file():
        raise AssertionError(f"missing pinned file: {path}")
    raw = target.read_bytes()
    if hashlib.sha256(raw).hexdigest() != sha:
        raise AssertionError(f"SHA-256 mismatch: {path}")
    if size is not None and len(raw) != size:
        raise AssertionError(f"byte length mismatch: {path}: {len(raw)} != {size}")
    verified += 1

for path, sha in receipt["reviewed_source_sha256"].items():
    verify(path, sha)
report = receipt["report"]
verify(report["path"], report["sha256"], report["bytes"])
for path, sha in receipt["author_evidence"].get("source_sha256", {}).items():
    verify(path, sha)

def walk(value):
    if isinstance(value, dict):
        if isinstance(value.get("path"), str) and isinstance(value.get("sha256"), str):
            verify(value["path"], value["sha256"], value.get("bytes"))
        for path_key, hash_key in (("script", "script_sha256"), ("rawlog", "rawlog_sha256"), ("stdout", "stdout_sha256"), ("stderr", "stderr_sha256"), ("log", "log_sha256")):
            if isinstance(value.get(path_key), str) and isinstance(value.get(hash_key), str):
                verify(value[path_key], value[hash_key])
        for item in value.values():
            walk(item)
    elif isinstance(value, list):
        for item in value:
            walk(item)

walk(receipt)
print(f"native receipt identity/schema validation: PASS (XR-DELIVERY/N2; active state is read-only)")
print("reviewed source and referenced file pins: PASS (validator stdout/exit files checked separately after completion)")
print(f"report bytes: {report['bytes']}; SHA-256: {report['sha256']}")
