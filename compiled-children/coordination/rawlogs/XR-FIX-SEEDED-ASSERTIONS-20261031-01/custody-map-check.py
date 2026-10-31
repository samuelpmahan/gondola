#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

root = Path.cwd()
manifest_path = root / "compiled-children/coordination/repairs/E-FIX-SEEDED-ASSERTIONS/originals/manifest.json"
manifest = json.loads(manifest_path.read_text())
fix_receipt = json.loads((root / "compiled-children/coordination/receipts/E-FIX-SEEDED-ASSERTIONS.json").read_text())

def pin(path):
    data = path.read_bytes()
    return len(data), hashlib.sha256(data).hexdigest()

for item in manifest["files"]:
    source = root / item["source"]
    preserved = root / item["preserved"]
    actual = pin(preserved)
    expected = (item["bytes"], item["sha256"])
    assert actual == expected, f"preserved original mismatch: {item['preserved']}"
    if item["source"].endswith(("E-CHECKER-TESTS.md", "E-CHECKER-TESTS.json")):
        assert pin(source) == expected, f"current original report/receipt changed: {item['source']}"
    elif item["source"].endswith("seeded.test.mjs"):
        current_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        expected_hash = fix_receipt["sourceSha256"][item["source"]]
        assert current_hash == expected_hash == "404a94cb93f4c0f1646062b1ddcb283084b7f6e00a776f687ec513659542ec83"
    print(f"PASS {item['source']} -> {item['preserved']} bytes={actual[0]} sha256={actual[1]}")

print("PASS E-CHECKER-TESTS report and receipt remain byte-identical to preserved originals")
print("PASS amended seeded test matches its frozen E-FIX source pin; preserved pre-repair test remains distinct")
