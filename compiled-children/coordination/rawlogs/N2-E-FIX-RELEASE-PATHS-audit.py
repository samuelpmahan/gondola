#!/usr/bin/env python3
"""Read-only audit of README delivery paths against the source runner."""
import hashlib
import json
from pathlib import Path

root = Path.cwd()
originals = root / "compiled-children/coordination/repairs/E-FIX-RELEASE-PATHS/originals"
manifest = json.loads((originals / "manifest.json").read_text())
for row in manifest["files"]:
    raw = (root / row["preserved"]).read_bytes()
    assert len(raw) == row["bytes"], f"preserved size mismatch: {row['preserved']}"
    assert hashlib.sha256(raw).hexdigest() == row["sha256"], f"preserved hash mismatch: {row['preserved']}"

old_readme = (originals / "README.md").read_text()
current_readme = (root / "compiled-children/README.md").read_text()
old = "The attempt's report, receipt, logs, raw captures, generated backend builds, demo, screenshot, and byte-checked archive are written beneath `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>/`. The canonical delivery receipt/report are `compiled-children/coordination/receipts/E-DELIVERY.json` and `compiled-children/coordination/reports/E-DELIVERY.md`. After a successful run, find the exact `attempt` in the receipt and serve its demo site:"
new = "Each run creates `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>/`. Logs, raw captures, generated React and DOM builds, and demo files (including `demo/site/` and `demo/screenshot.png`) are inside that directory. The canonical delivery report and receipt are `compiled-children/coordination/reports/E-DELIVERY.md` and `compiled-children/coordination/receipts/E-DELIVERY.json`. The byte-checked archive and external manifest are siblings of the attempt directory at `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>.tar.gz` and `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>.archive-manifest.json`. After a successful run, find the exact `attempt` in the receipt and serve its demo site:"
assert old_readme.count(old) == 1, "original paragraph location is ambiguous"
assert current_readme == old_readme.replace(old, new, 1), "more than the artifact-location paragraph changed"

runner = (root / "compiled-children/run.mjs").read_text()
required = [
    'const outputRoot = join(here, "demo/output/attempts");',
    'const reportPath = join(here, "coordination/reports/E-DELIVERY.md");',
    'const receiptPath = join(here, "coordination/receipts/E-DELIVERY.json");',
    'const attemptRoot = join(outputRoot, `attempt-${attemptId}`);',
    'const logRoot = join(attemptRoot, "logs");',
    '["logs", "react", "dom", "harness", "oracle", "demo", "inherited"]',
    'const site = join(attemptRoot, "demo/site");',
    'const screenshotPath = join(attemptRoot, "demo/screenshot.png");',
    'const manifestPath = join(dirname(attemptRoot), `${basename(attemptRoot)}.archive-manifest.json`);',
    'const archivePath = join(dirname(attemptRoot), `${basename(attemptRoot)}.tar.gz`);',
]
for source in required:
    assert source in runner, f"runner path evidence missing: {source}"
for path in [
    "compiled-children/coordination/reports/E-DELIVERY.md",
    "compiled-children/coordination/receipts/E-DELIVERY.json",
    "compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>.tar.gz",
    "compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>.archive-manifest.json",
    "compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>/",
]:
    assert path in current_readme, f"README missing actual path: {path}"

sha = lambda p: hashlib.sha256((root / p).read_bytes()).hexdigest()
print("preserved release-path originals: 3/3 match manifest")
print("README delta: exactly one artifact-location paragraph")
print("runner path definitions: canonical report/receipt, attempt contents, sibling archive/manifest, demo site/screenshot verified")
print(f"README SHA-256: {sha('compiled-children/README.md')}")
print(f"runner SHA-256: {sha('compiled-children/run.mjs')}")
print("read-only path audit: PASS")
