import importlib.util
import json
from pathlib import Path

root = Path("compiled-children/coordination")
spec_module = importlib.util.spec_from_file_location("compiled_children_probe_xr_review", root / "probe.py")
probe = importlib.util.module_from_spec(spec_module)
spec_module.loader.exec_module(probe)
state = json.loads((root / "state.json").read_text())
receipt = json.loads((root / "receipts/XR-CHECKER-TESTS.json").read_text())
job = state["jobs"]["XR-CHECKER-TESTS"]
active = job
assert active["status"] == "running" and active["worker"] == "N6", "review packet must remain in flight"
probe.validate_receipt(receipt, job, "N6")
print("native read-only validate_receipt accepted XR-CHECKER-TESTS identity, reviewer, decision, and nonempty summary from the in-flight state entry; scheduler state was read only.")
