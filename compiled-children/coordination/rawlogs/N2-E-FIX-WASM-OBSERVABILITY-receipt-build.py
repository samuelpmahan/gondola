#!/usr/bin/env python3
"""Build the E-FIX-WASM-OBSERVABILITY author receipt from pinned evidence."""
import hashlib
import json
from pathlib import Path

ROOT = Path.cwd()
RAW = "compiled-children/coordination/rawlogs"

def meta(path):
    raw = (ROOT / path).read_bytes()
    return {"path": path, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

source_paths = [
    "compiled-frontend/conformance/no-wasm.mjs",
    "compiled-frontend/conformance/no-wasm.test.mjs",
    "compiled-children/demo/smoke.mjs",
    "compiled-children/conformance/browser.mjs",
]
source_sha = {path: meta(path)["sha256"] for path in source_paths}
manifest_path = "compiled-children/coordination/repairs/E-FIX-WASM-OBSERVABILITY/originals/manifest.json"
manifest_meta = meta(manifest_path)
manifest = json.loads((ROOT / manifest_path).read_text())
preserved = []
for row in manifest["files"]:
    original = meta(row["preserved"])
    if original["bytes"] != row["bytes"] or original["sha256"] != row["sha256"]:
        raise SystemExit(f"preserved original mismatch: {row['preserved']}")
    preserved.append({**original, "source": row["source"]})

build_root = "compiled-children/demo/output/author-smoke-20261031-rerun1/site"
build = json.loads((ROOT / f"{build_root}/demo-build.json").read_text())
bundle_path = f"{build_root}/{build['output']['path']}"
build_evidence = {
    "record": meta(f"{build_root}/demo-build.json"),
    "backend": build["backend"],
    "sourcePins": build["sourcePins"],
    "bundle": {**meta(bundle_path), "manifestSha256": build["manifest"]["sha256"]},
}
smoke_path = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-smoke.json"
smoke = json.loads((ROOT / smoke_path).read_text())
screenshot_path = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-smoke.png"
smoke_evidence = {
    "result": meta(smoke_path),
    "status": smoke["status"],
    "checkCount": len(smoke["checks"]),
    "passedChecks": sum(bool(row["passed"]) for row in smoke["checks"]),
    "failedChecks": [row["id"] for row in smoke["checks"] if not row["passed"]],
    "browser": smoke["browser"],
    "url": smoke["url"],
    "port": smoke["port"],
    "http": smoke["http"],
    "webAssemblyRequests": smoke["webAssemblyRequests"],
    "webAssemblyApiCalls": smoke["webAssemblyApiCalls"],
    "wasmGuardCoverage": smoke["wasmGuardCoverage"],
    "browserErrors": smoke["browserErrors"],
    "consoleErrors": smoke["consoleErrors"],
    "failedRequests": smoke["failedRequests"],
    "screenshot": meta(screenshot_path),
}

node_version = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-node-version.log"
syntax_stdout = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-syntax.stdout.log"
syntax_stderr = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-syntax.stderr.log"
test_stdout = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-tests.stdout.log"
test_stderr = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-tests.stderr.log"
smoke_stdout = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-smoke.stdout.log"
smoke_stderr = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-smoke.stderr.log"
audit_script = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-audit.py"
audit_stdout = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-audit.log"
audit_stderr = f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-audit.stderr.log"
rawlog_names = [
    "N2-E-FIX-WASM-OBSERVABILITY-node-version.log",
    "N2-E-FIX-WASM-OBSERVABILITY-node-version.exit.log",
    "N2-E-FIX-WASM-OBSERVABILITY-syntax.stdout.log",
    "N2-E-FIX-WASM-OBSERVABILITY-syntax.stderr.log",
    "N2-E-FIX-WASM-OBSERVABILITY-syntax.exit.log",
    "N2-E-FIX-WASM-OBSERVABILITY-tests.stdout.log",
    "N2-E-FIX-WASM-OBSERVABILITY-tests.stderr.log",
    "N2-E-FIX-WASM-OBSERVABILITY-tests.exit.log",
    "N2-E-FIX-WASM-OBSERVABILITY-smoke.json",
    "N2-E-FIX-WASM-OBSERVABILITY-smoke.png",
    "N2-E-FIX-WASM-OBSERVABILITY-smoke.stdout.log",
    "N2-E-FIX-WASM-OBSERVABILITY-smoke.stderr.log",
    "N2-E-FIX-WASM-OBSERVABILITY-smoke.exit.log",
    "N2-E-FIX-WASM-OBSERVABILITY-audit.py",
    "N2-E-FIX-WASM-OBSERVABILITY-audit.log",
    "N2-E-FIX-WASM-OBSERVABILITY-audit.stderr.log",
    "N2-E-FIX-WASM-OBSERVABILITY-audit.exit.log",
    "N2-E-FIX-WASM-OBSERVABILITY-receipt-build.py",
]
rawlogs = {name: meta(f"{RAW}/{name}") for name in rawlog_names}

checks = [
    {
        "name": "Node 22 version",
        "command": "/tmp/gondola-node22/node_modules/node/bin/node --version",
        "exitCode": 0,
        "stdout": meta(node_version),
        "exitCodeFile": meta(f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-node-version.exit.log"),
    },
    {
        "name": "syntax checks",
        "command": "/tmp/gondola-node22/node_modules/node/bin/node --check compiled-frontend/conformance/no-wasm.mjs && /tmp/gondola-node22/node_modules/node/bin/node --check compiled-frontend/conformance/no-wasm.test.mjs && /tmp/gondola-node22/node_modules/node/bin/node --check compiled-children/demo/smoke.mjs && /tmp/gondola-node22/node_modules/node/bin/node --check compiled-children/conformance/browser.mjs",
        "exitCode": 0,
        "stdout": meta(syntax_stdout),
        "stderr": meta(syntax_stderr),
        "exitCodeFile": meta(f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-syntax.exit.log"),
    },
    {
        "name": "targeted Node regression suite",
        "command": "CHROMIUM_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/conformance/no-wasm.test.mjs compiled-children/runtime/runtime.test.mjs compiled-children/conformance/check.test.mjs compiled-children/conformance/seeded.test.mjs compiled-children/oracle/oracle.test.mjs",
        "exitCode": 0,
        "result": "32 passed, 0 failed; includes two live Chromium guard tests and five VM coverage/descriptor cases",
        "stdout": meta(test_stdout),
        "stderr": meta(test_stderr),
        "exitCodeFile": meta(f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-tests.exit.log"),
    },
    {
        "name": "standalone author HTTP smoke against stable N2 React build",
        "command": "/tmp/gondola-node22/node_modules/node/bin/node compiled-children/demo/smoke.mjs --demo compiled-children/demo/output/author-smoke-20261031-rerun1/site --output compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-smoke.json --screenshot compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-smoke.png --chromium /tmp/chromium --port 0",
        "exitCode": 0,
        "result": "32/32 checks passed; endpoints /, /demo.css, /demo.bundle.mjs returned HTTP 200; ten listed hooks installed; zero covered API calls or .wasm requests",
        "stdout": meta(smoke_stdout),
        "stderr": meta(smoke_stderr),
        "exitCodeFile": meta(f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-smoke.exit.log"),
        "smoke": smoke_evidence,
    },
    {
        "name": "source/original/evidence pin audit",
        "command": "/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-audit.py",
        "exitCode": 0,
        "result": "Four current source pins, three preserved originals, stable bundle, 32/32 smoke checks, 32/32 Node tests, and complete guard coverage match recorded pins.",
        "script": meta(audit_script),
        "stdout": meta(audit_stdout),
        "stderr": meta(audit_stderr),
        "exitCodeFile": meta(f"{RAW}/N2-E-FIX-WASM-OBSERVABILITY-audit.exit.log"),
    },
]

report_path = "compiled-children/coordination/reports/E-FIX-WASM-OBSERVABILITY.md"
report = meta(report_path)
receipt = {
    "schema": "gobi.worker-receipt/v1",
    "job_id": "E-FIX-WASM-OBSERVABILITY",
    "worker": "N2",
    "outcome": "mixed_change",
    "summary": "Repaired WebAssembly guard observability to record per-hook coverage and fail closed for failed or missing observation; preserved existing evidence fields, added coverage to demo and browser captures, and verified unit plus live Chromium behavior.",
    "repair": {
        "exclusive_source_sha256": source_sha,
        "guardCoverageShape": {
            "status": ["complete", "absent"],
            "entries": ["name", "kind", "status", "optional reason"],
            "entryStatuses": ["installed", "absent"],
            "failures": [],
            "statusFailed": "assertClear throws",
        },
        "observedFunctions": ["WebAssembly.compile", "WebAssembly.compileStreaming", "WebAssembly.instantiate", "WebAssembly.instantiateStreaming", "WebAssembly.validate"],
        "observedConstructors": ["WebAssembly.Module", "WebAssembly.Instance", "WebAssembly.Memory", "WebAssembly.Table", "WebAssembly.Global"],
        "requestScope": "Existing .wasm URL suffix route pattern; attempts are blocked and recorded.",
        "preservedFields": ["wasmRequests", "wasmAPIAttempts", "browser noWasm.apiAttempts", "browser noWasm.wasmRequests"],
        "demoCoveragePath": "wasmGuardCoverage",
        "browserCoveragePaths": ["noWasm.guardCoverage", "profiles[*].noWasm.guardCoverage"],
        "preservedOriginalManifest": manifest_meta,
        "preservedOriginals": preserved,
    },
    "stableAuthorBuild": build_evidence,
    "authorSmoke": smoke_evidence,
    "toolchains": {
        "node": "v22.23.4",
        "chromium": smoke["browser"],
        "chromiumExecutable": "/tmp/chromium",
    },
    "checks": checks,
    "rawlogs": rawlogs,
    "report": report,
    "limitations": [
        "The observation scope is finite: the listed functions/constructors and .wasm URL suffix requests; it does not cover every conceivable engine path.",
        "No full inherited compiled-capabilities/delivery chain was run.",
        "Independent N6 checker/harness and the source-frozen overall pipeline remain required for broader acceptance.",
    ],
    "integration": "Awaiting independent N6 fresh harness/checker and root-owned source-frozen full pipeline.",
    "publication": "No Git commit, merge, deployment, or scheduler-state edit.",
}
receipt_path = ROOT / "compiled-children/coordination/receipts/E-FIX-WASM-OBSERVABILITY.json"
receipt_path.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {receipt_path}")
print(f"report: {report['bytes']} bytes; SHA-256 {report['sha256']}")
print(f"pinned current source paths: {len(source_sha)}")
print(f"pinned reviewer rawlogs: {len(rawlogs)}")
