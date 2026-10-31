import importlib.util
import json
from pathlib import Path

root = Path("compiled-children/coordination")
module_spec = importlib.util.spec_from_file_location("compiled_children_probe_review", root / "probe.py")
probe = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(probe)
spec = json.loads((root / "spec.json").read_text())
job = next(item for item in spec["jobs"] if item["id"] == "E-GO")
receipt = json.loads((root / "receipts/E-GO.json").read_text())
probe.validate_receipt(receipt, job, "N1")
state = json.loads((root / "state.json").read_text())
assert state["jobs"]["E-GO"]["status"] == "done"
print("native validate_receipt accepted E-GO identity, extraction outcome, and nonempty summary; packet is closed.")
