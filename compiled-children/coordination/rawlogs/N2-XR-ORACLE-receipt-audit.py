import hashlib
import importlib.util
import json
from pathlib import Path

root = Path("compiled-children/coordination")
receipt_path = root / "receipts/XR-ORACLE.json"
receipt = json.loads(receipt_path.read_text())
problems = []
def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def check(path, expected, label):
    actual = sha(path)
    if actual != expected:
        problems.append(f"{label} {path}: expected {expected}, got {actual}")
for path, expected in receipt["reviewed_source_sha256"].items():
    check(path, expected, "source")
for check_record in receipt["checks"]:
    for path_key, hash_key in (("rawlog", "rawlog_sha256"), ("stdout", "stdout_sha256"), ("stderr", "stderr_sha256"), ("script", "script_sha256"), ("scenario", "scenario_sha256")):
        if path_key in check_record and hash_key in check_record:
            check(check_record[path_key], check_record[hash_key], "check evidence")
report = receipt["report"]
check(report["path"], report["sha256"], "report")
if Path(report["path"]).stat().st_size != report["bytes"]:
    problems.append(f"report byte count mismatch: {report['path']}")
if receipt["author_pin_audit"]["original_pinned_bytes_available"] is not False:
    problems.append("expected original author-audit bytes to be marked unavailable")
if problems:
    raise SystemExit("\n".join(problems))
module_spec = importlib.util.spec_from_file_location("compiled_children_probe_review", root / "probe.py")
probe = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(probe)
state = json.loads((root / "state.json").read_text())
job = state["jobs"]["XR-ORACLE"]
probe.validate_receipt(receipt, job, "N2")
print("XR-ORACLE receipt parses and matches the active N2 review packet.")
print("All reviewed-source, report, and referenced command-log hashes and report byte count match.")
print("The E-ORACLE audit source mismatch is separately recorded as the amend finding.")
