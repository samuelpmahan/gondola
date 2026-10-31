import gzip
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
COORD = ROOT / "compiled-children" / "coordination"
TASK_RAW = COORD / "rawlogs" / "E-FIX-HARNESS-LIVENESS-20261031-01"
sys.path.insert(0, str(COORD))
from probe import validate_receipt  # noqa: E402


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def resolve_repo(path: str) -> Path:
    candidate = Path(path)
    return candidate if candidate.is_absolute() else ROOT / candidate


def verify_pin(path: str, expected_sha: str, expected_bytes: int | None = None) -> None:
    data = resolve_repo(path).read_bytes()
    if expected_bytes is not None and len(data) != expected_bytes:
        raise SystemExit(f"byte count mismatch: {path}")
    if digest(data) != expected_sha:
        raise SystemExit(f"SHA-256 mismatch: {path}")


receipt_path = COORD / "receipts" / "E-FIX-HARNESS-LIVENESS.json"
receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
state_path = COORD / "state.json"
state_before = state_path.read_bytes()
state_hash = digest(state_before)
state = json.loads(state_before.decode("utf-8"))
validate_receipt(receipt, state["jobs"][receipt["job_id"]], "N6")

for path, expected in receipt["sourceSha256"].items():
    verify_pin(path, expected)
report = receipt["report"]
verify_pin(report["path"], report["sha256"], report["bytes"])
for item in receipt["rawlogs"]:
    verify_pin(item["path"], item["sha256"], item["bytes"])
for item in receipt["evidencePins"]:
    verify_pin(item["path"], item["sha256"], item["bytes"])
for item in receipt["buildLineagePins"]:
    verify_pin(item["path"], item["sha256"], item["bytes"])
for artifact in receipt["traceArtifacts"]:
    source = resolve_repo(artifact["source"]).read_bytes()
    compressed = resolve_repo(artifact["path"]).read_bytes()
    if len(source) != artifact["sourceBytes"] or digest(source) != artifact["sourceSha256"]:
        raise SystemExit(f"trace source mismatch: {artifact['source']}")
    if len(compressed) != artifact["archiveBytes"] or digest(compressed) != artifact["archiveSha256"]:
        raise SystemExit(f"trace archive mismatch: {artifact['path']}")
    expanded = gzip.decompress(compressed)
    if expanded != source:
        raise SystemExit(f"trace archive content mismatch: {artifact['path']}")

preserved = json.loads((COORD / "repairs" / "E-FIX-HARNESS-LIVENESS" / "originals" / "manifest.json").read_text(encoding="utf-8"))
for item in preserved["files"]:
    if item["source"].endswith(("reports/E-HARNESS.md", "receipts/E-HARNESS.json")):
        verify_pin(item["source"], item["sha256"], item["bytes"])

state_after = state_path.read_bytes()
if digest(state_after) != state_hash:
    raise SystemExit("coordination state changed during read-only validation")
message = f"receipt identity and tracked hashes passed; coordination state unchanged: {state_hash}\n"
expected_output = TASK_RAW / "receipt-validation.stdout.log"
if expected_output.read_text(encoding="utf-8") != message:
    raise SystemExit("receipt-validation stdout pin does not match deterministic validation result")
if (TASK_RAW / "receipt-validation.stderr.log").read_bytes() != b"":
    raise SystemExit("receipt-validation stderr pin is not empty")
sys.stdout.write(message)
