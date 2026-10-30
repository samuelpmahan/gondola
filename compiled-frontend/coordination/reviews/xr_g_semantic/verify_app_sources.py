import hashlib
import json
from pathlib import Path

here = Path(__file__).resolve().parent
nested_root = here.parents[2]
repository_root = nested_root.parent
receipt_path = nested_root / "coordination/receipts/G-FIXTURES.json"
receipt = json.loads(receipt_path.read_text())
hashes = receipt["evidence"]["source_sha256"]
issues = []
verified = []
for relative, expected in sorted(hashes.items()):
    path = repository_root / relative
    if not path.is_file():
        issues.append({"path": relative, "error": "missing"})
        continue
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    verified.append({"path": relative, "sha256": actual})
    if actual != expected:
        issues.append({"path": relative, "actual_sha256": actual, "expected_sha256": expected})

result = {
    "schema": "gobi.n5-app-source-audit/v1",
    "source_receipt": str(receipt_path),
    "source_receipt_sha256": hashlib.sha256(receipt_path.read_bytes()).hexdigest(),
    "expected_files": len(hashes),
    "verified_files": len(verified),
    "issues": issues,
    "all_match": not issues and len(verified) == len(hashes),
    "verified_sources": verified,
}
output = here / "app-source-audit.json"
output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({k: v for k, v in result.items() if k != "verified_sources"}, indent=2))
if not result["all_match"]:
    raise SystemExit(1)
