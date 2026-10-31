import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
COORD = ROOT / "compiled-children" / "coordination"
sys.path.insert(0, str(COORD))
from probe import validate_receipt  # noqa: E402

receipt = json.loads((COORD / "receipts" / "E-FIX-ORACLE-CUSTODY.json").read_text())
state = json.loads((COORD / "state.json").read_text())
validate_receipt(receipt, state["jobs"][receipt["job_id"]], receipt["worker"])

def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()

for path, expected in receipt["sourceSha256"].items():
    if sha(path) != expected:
        raise SystemExit(f"source pin mismatch: {path}")
report = receipt["report"]
if sha(report["path"]) != report["sha256"] or (ROOT / report["path"]).stat().st_size != report["bytes"]:
    raise SystemExit("report pin mismatch")
for item in receipt["rawlogs"]:
    if sha(item["path"]) != item["sha256"] or (ROOT / item["path"]).stat().st_size != item["bytes"]:
        raise SystemExit(f"rawlog pin mismatch: {item['path']}")
print("receipt identity, outcome, source pins, report pin, and rawlog pins: passed")
