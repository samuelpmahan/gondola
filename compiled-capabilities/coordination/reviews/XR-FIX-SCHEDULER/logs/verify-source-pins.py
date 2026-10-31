#!/usr/bin/env python3
"""Check E-FIX-SCHEDULER's source pins and preserved original evidence."""
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[5]
COORD = ROOT / "compiled-capabilities/coordination"


def sha(path: str) -> str:
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def main() -> None:
    receipt = json.loads((COORD / "receipts/E-FIX-SCHEDULER.json").read_text())
    checks = {}
    for path, expected in receipt["source_sha256"].items():
        checks[path] = {"expected": expected, "actual": sha(path), "matches": sha(path) == expected}
    for path, expected in receipt["preserved_original_sha256"].items():
        checks[path] = {"expected": expected, "actual": sha(path), "matches": sha(path) == expected}
    report = receipt["report"]["path"]
    checks[report] = {
        "expected": receipt["report"]["sha256"],
        "actual": sha(report),
        "matches": sha(report) == receipt["report"]["sha256"],
    }
    result = {"all_pins_match": all(row["matches"] for row in checks.values()), "checks": checks}
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["all_pins_match"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
