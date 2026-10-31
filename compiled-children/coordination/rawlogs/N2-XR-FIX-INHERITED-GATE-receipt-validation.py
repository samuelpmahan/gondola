import hashlib
import json
from pathlib import Path
import sys

root = Path.cwd()
coord = root / "compiled-children/coordination"
sys.path.insert(0, str(coord))
from probe import load_state, validate_receipt  # noqa: E402

receipt = json.loads((coord / "receipts/XR-FIX-INHERITED-GATE.json").read_text())
state = load_state(coord / "state.json")
validate_receipt(receipt, state["jobs"][receipt["job_id"]], receipt["worker"])

def verify(pin):
    path = root / pin["path"]
    data = path.read_bytes()
    actual = hashlib.sha256(data).hexdigest()
    assert actual == pin["sha256"], f"SHA-256 mismatch: {pin['path']}"
    assert len(data) == pin["bytes"], f"byte count mismatch: {pin['path']}"

for pin in receipt["sourceArtifacts"]:
    verify(pin)
for pin in receipt["rawlogs"]:
    verify(pin)
verify(receipt["report"])
assert receipt["sourceSha256"] == {pin["path"]: pin["sha256"] for pin in receipt["sourceArtifacts"]}
print("native job/worker/decision identity and all source, rawlog, and report SHA-256/byte pins passed")
