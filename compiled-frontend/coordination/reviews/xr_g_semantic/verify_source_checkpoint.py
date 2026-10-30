import hashlib
import json
from pathlib import Path

here = Path(__file__).resolve().parent
module_root = here.parents[2]
checkpoint_path = module_root / "toolchain/build-four/source-checkpoint.json"
checkpoint = json.loads(checkpoint_path.read_text())
entries = []
issues = []
for item in checkpoint["files"]:
    path = module_root / item["path"]
    if not path.is_file():
        issues.append({"path": item["path"], "error": "missing"})
        continue
    data = path.read_bytes()
    actual = hashlib.sha256(data).hexdigest()
    if actual != item["sha256"] or len(data) != item["bytes"]:
        issues.append({"path": item["path"], "actual_sha256": actual, "expected_sha256": item["sha256"], "actual_bytes": len(data), "expected_bytes": item["bytes"]})
    entries.append((item["path"], actual))

tree_material = "".join(f"{digest}  {path}\n" for path, digest in sorted(entries))
actual_tree = hashlib.sha256(tree_material.encode()).hexdigest()
result = {
    "schema": "gobi.n5-source-checkpoint-audit/v1",
    "checkpoint": str(checkpoint_path),
    "checkpoint_file_sha256": hashlib.sha256(checkpoint_path.read_bytes()).hexdigest(),
    "expected_files": checkpoint["file_count"],
    "verified_files": len(entries),
    "issues": issues,
    "actual_tree_sha256": actual_tree,
    "expected_tree_sha256": checkpoint["source_tree_sha256"],
    "matches": not issues and len(entries) == checkpoint["file_count"] and actual_tree == checkpoint["source_tree_sha256"],
}
output = here / "source-checkpoint-audit.json"
output.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
if not result["matches"]:
    raise SystemExit(1)
