import hashlib
import json
from pathlib import Path

receipt_path = Path("compiled-children/coordination/receipts/E-ORACLE.json")
receipt = json.loads(receipt_path.read_text())
problems = []

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def check(path, expected, label):
    actual = sha(path)
    status = "MATCH" if actual == expected else "MISMATCH"
    print(f"{status} {label} {path} expected={expected} actual={actual}")
    if actual != expected:
        problems.append(path)

for path, expected in receipt.get("sourceSha256", {}).items():
    check(path, expected, "source")
report = receipt["report"]
check(report["path"], report["sha256"], "report")
actual_report_bytes = Path(report["path"]).stat().st_size
print(f"report bytes expected={report['bytes']} actual={actual_report_bytes}")
if actual_report_bytes != report["bytes"]:
    problems.append(report["path"] + " byte count")
for check_record in receipt.get("checks", []):
    if "rawlog" in check_record and "rawlog_sha256" in check_record:
        check(check_record["rawlog"], check_record["rawlog_sha256"], "rawlog")
    elif "rawlog" in check_record and "sha256" in check_record:
        check(check_record["rawlog"], check_record["sha256"], "rawlog")
    if "audit_sha256" in check_record:
        check("compiled-children/oracle/evidence/native-protocol-audit.json", check_record["audit_sha256"], "audit output")
print(f"mismatches={len(problems)}")
raise SystemExit(1 if problems else 0)
