#!/usr/bin/env python3
"""Verify E-FIX-WASM-OBSERVABILITY source and smoke evidence pins."""
import hashlib
import json
from pathlib import Path

ROOT = Path.cwd()

def read(path):
    return (ROOT / path).read_bytes()

def sha(path):
    return hashlib.sha256(read(path)).hexdigest()

def check(condition, message):
    if not condition:
        raise AssertionError(message)

source_pins = {
    "compiled-frontend/conformance/no-wasm.mjs": "d4afe368a26c295c8bbdc8863a5109c7e3783e08d5e65ce08173387939c7cfa1",
    "compiled-frontend/conformance/no-wasm.test.mjs": "529149d9856254bacb049032716e9c978d18dd62de4dec77005495790f49ad5e",
    "compiled-children/demo/smoke.mjs": "5aa132962925b5c9c1a95ac6f81e4767648ff4e5c87984a5eab79ea5118fc8b0",
    "compiled-children/conformance/browser.mjs": "5f2a47999f0861e2ad3977066ed1903e265d48a4d169f07fab15bc6a45f22ab9",
}
for path, expected in source_pins.items():
    check(sha(path) == expected, f"source pin mismatch: {path}")

manifest_path = "compiled-children/coordination/repairs/E-FIX-WASM-OBSERVABILITY/originals/manifest.json"
manifest = json.loads(read(manifest_path))
for item in manifest["files"]:
    raw = read(item["preserved"])
    check(len(raw) == item["bytes"], f"preserved original length mismatch: {item['preserved']}")
    check(hashlib.sha256(raw).hexdigest() == item["sha256"], f"preserved original hash mismatch: {item['preserved']}")

build_root = "compiled-children/demo/output/author-smoke-20261031-rerun1/site"
build_record_path = f"{build_root}/demo-build.json"
build = json.loads(read(build_record_path))
check(build["backend"] == "react", "stable author build is not the React bundle")
check(build["output"]["sha256"] == "c2d5723c7c15a3bba3a59687a4f610682fe5d8cb387ed465118df79471a84ac9", "stable author bundle receipt hash mismatch")
bundle_path = f"{build_root}/{build['output']['path']}"
bundle = read(bundle_path)
check(len(bundle) == build["output"]["bytes"], "stable bundle length mismatch")
check(hashlib.sha256(bundle).hexdigest() == build["output"]["sha256"], "stable bundle bytes mismatch")
for path, expected in build["sourcePins"].items():
    check(sha(path) == expected, f"stable demo source pin mismatch: {path}")

smoke_path = "compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-smoke.json"
smoke = json.loads(read(smoke_path))
check(smoke["status"] == "passed", "HTTP smoke did not pass")
check(len(smoke["checks"]) == 32 and all(row["passed"] for row in smoke["checks"]), "HTTP smoke is not 32/32")
check(smoke["webAssemblyRequests"] == 0 and smoke["webAssemblyApiCalls"] == 0, "HTTP smoke observed WASM use")
coverage = smoke.get("wasmGuardCoverage")
expected_names = [
    "WebAssembly.compile", "WebAssembly.compileStreaming", "WebAssembly.instantiate",
    "WebAssembly.instantiateStreaming", "WebAssembly.validate", "WebAssembly.Module",
    "WebAssembly.Instance", "WebAssembly.Memory", "WebAssembly.Table", "WebAssembly.Global",
]
check(isinstance(coverage, dict) and coverage["status"] == "complete", "HTTP smoke guard coverage is not complete")
check([entry["name"] for entry in coverage["entries"]] == expected_names, "HTTP smoke hook coverage list changed")
check(all(entry["status"] == "installed" for entry in coverage["entries"]), "HTTP smoke has an uninstalled exposed hook")
check(coverage["failures"] == [], "HTTP smoke guard recorded hook failures")
check([(entry["path"], entry["status"]) for entry in smoke["http"]] == [
    ("/", 200), ("/demo.css", 200), ("/demo.bundle.mjs", 200)
], "HTTP endpoint results differ from the smoke claim")
check(smoke["browserErrors"] == [] and smoke["consoleErrors"] == [] and smoke["failedRequests"] == [], "HTTP smoke recorded browser/request errors")

for path in [
    "compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-node-version.exit.log",
    "compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-syntax.exit.log",
    "compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-tests.exit.log",
    "compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-smoke.exit.log",
]:
    check(read(path).strip() == b"0", f"command failed: {path}")
test_output = read("compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-tests.stdout.log").decode()
check("# tests 32" in test_output and "# pass 32" in test_output and "# fail 0" in test_output, "targeted Node tests did not pass 30/30")
check(read("compiled-children/coordination/rawlogs/N2-E-FIX-WASM-OBSERVABILITY-node-version.log").strip() == b"v22.23.4", "unexpected Node version")

print("source pins: 4/4 exact")
print(f"preserved original sources: {len(manifest['files'])}/{len(manifest['files'])} exact")
print(f"stable N2 React bundle: {len(bundle)} bytes; SHA-256 {hashlib.sha256(bundle).hexdigest()}")
print(f"author HTTP smoke: {len(smoke['checks'])}/32 checks; targeted Node suites: 32/32 passed")
print(f"guard coverage: {len(coverage['entries'])} hooks installed; no failures; zero observed API attempts/requests")
print("audit result: PASS")
