from datetime import datetime, timezone
from pathlib import Path

source = Path("compiled-children/run.mjs").read_text()
start = source.index("async function verifyInheritedRun() {")
end = source.index("async function preserveFreshInheritedFailure()", start)
verify = source[start:end]
assert "const current = Date.parse(receipt.startedAt);" in verify
assert "started < current" in verify
assert "inheritedInvocationStartedAt" not in verify
assert "reportBytes.length === 0" in verify
assert "inherited.report?.sha256 === hash(reportBytes)" not in verify
assert "inherited.archive.sha256.length !== 64" in verify
assert "inherited.archive.path" not in verify
assert "inherited.archive.manifest" not in verify

# Synthetic witness for the exact positive freshness comparison in verifyInheritedRun.
parse = lambda value: datetime.fromisoformat(value.replace("Z", "+00:00"))
runner_started = parse("2026-10-31T12:00:00Z")
invocation_started = parse("2026-10-31T12:05:00Z")
inherited_started = parse("2026-10-31T12:02:00Z")
current_positive_gate_accepts = inherited_started >= runner_started
invocation_relative_gate_accepts = inherited_started >= invocation_started
assert current_positive_gate_accepts is True
assert invocation_relative_gate_accepts is False

# The current structural gate accepts any nonempty report and a 64-character
# archive hash/positive byte count; no file-content digest comparison exists.
expected_report_sha = "1" * 64
actual_report_sha = "2" * 64
nonempty_report_bytes = b"tampered but nonempty"
archive = {"sha256": "a" * 64, "bytes": 1, "path": "missing/archive.tar.gz"}
current_shape_gate_accepts = bool(nonempty_report_bytes) and len(archive["sha256"]) == 64 and archive["bytes"] > 0
assert current_shape_gate_accepts is True and expected_report_sha != actual_report_sha

print("static source check: positive gate uses receipt.startedAt, not inheritedInvocationStartedAt")
print(f"synthetic timestamps: runner={runner_started.isoformat()} invocation={invocation_started.isoformat()} inherited={inherited_started.isoformat()}")
print(f"current freshness gate accepts stale pre-invocation receipt: {current_positive_gate_accepts}")
print(f"invocation-relative freshness should accept: {invocation_relative_gate_accepts}")
print(f"nonempty tampered report + 64-char hash + positive bytes pass current shape-only conditions: {current_shape_gate_accepts}")
print("witness is read-only/static; it did not invoke the full inherited chain or modify production files")
