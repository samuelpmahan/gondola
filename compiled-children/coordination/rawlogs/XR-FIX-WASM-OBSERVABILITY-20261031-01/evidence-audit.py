#!/usr/bin/env python3
import hashlib
import json
import subprocess
from pathlib import Path

root = Path.cwd()
base = "60b5aeff3172837ad7831c2b78b210454a3d81a2"

def bytes_and_sha(data):
    return len(data), hashlib.sha256(data).hexdigest()

def pin_path(value):
    return bytes_and_sha((root / value).read_bytes())

def git_blob(path):
    return subprocess.run(["git", "show", f"{base}:{path}"], cwd=root, check=False,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)

receipt_path = "compiled-children/coordination/receipts/E-FIX-WASM-OBSERVABILITY.json"
report_path = "compiled-children/coordination/reports/E-FIX-WASM-OBSERVABILITY.md"
receipt = json.loads((root / receipt_path).read_text())
manifest_path = receipt["repair"]["preservedOriginalManifest"]["path"]
manifest = json.loads((root / manifest_path).read_text())

for source, expected in receipt["repair"]["exclusive_source_sha256"].items():
    actual = hashlib.sha256((root / source).read_bytes()).hexdigest()
    assert actual == expected, f"frozen repair source pin mismatch: {source}"
    print(f"PASS frozen source {source} {actual}")

for item in manifest["files"]:
    preserved = root / item["preserved"]
    size, digest = bytes_and_sha(preserved.read_bytes())
    assert (size, digest) == (item["bytes"], item["sha256"]), f"preserved copy mismatch: {item['preserved']}"
    base_result = git_blob(item["source"])
    if base_result.returncode == 0:
        base_size, base_hash = bytes_and_sha(base_result.stdout)
        print(f"BASE {item['source']} bytes={base_size} sha256={base_hash}")
        if item["source"] == "compiled-frontend/conformance/no-wasm.mjs":
            assert (base_size, base_hash) == (size, digest), "base helper and preserved helper differ"
    else:
        print(f"BASE {item['source']} absent at commit {base}")
    print(f"PASS preserved {item['source']} -> {item['preserved']} bytes={size} sha256={digest}")

base_tests = git_blob("compiled-frontend/conformance/no-wasm.test.mjs")
assert base_tests.returncode == 0, "original two Chromium tests are absent from the base tree"
base_test_text = base_tests.stdout.decode()
current_test_text = (root / "compiled-frontend/conformance/no-wasm.test.mjs").read_text()
assert base_test_text.count("test(") == 2, "expected exactly two original Chromium tests"
assert "WebAssembly.compile(new Uint8Array" in base_test_text and "WebAssembly.compile(new Uint8Array" in current_test_text
assert 'fetch("https://gobi.invalid/attempt.wasm")' in base_test_text and 'fetch("https://gobi.invalid/attempt.wasm")' in current_test_text
assert "real Chromium guard blocks compilation" in current_test_text
assert "real Chromium guard rejects WASM asset requests" in current_test_text
assert current_test_text.count("test(") == 7, "expected the two browser tests and five VM cases"
print(f"BASE compiled-frontend/conformance/no-wasm.test.mjs bytes/hash={bytes_and_sha(base_tests.stdout)}; two Chromium checks retained semantically")
print("PASS current no-wasm.test.mjs contains seven tests: two live Chromium plus five VM-backed cases")

expected_entries = [
    {"name": f"WebAssembly.{name}", "kind": "function", "status": "installed"}
    for name in ["compile", "compileStreaming", "instantiate", "instantiateStreaming", "validate"]
] + [
    {"name": f"WebAssembly.{name}", "kind": "constructor", "status": "installed"}
    for name in ["Module", "Instance", "Memory", "Table", "Global"]
]

smoke_path = receipt["authorSmoke"]["result"]["path"]
smoke = json.loads((root / smoke_path).read_text())
coverage = smoke.get("wasmGuardCoverage")
assert smoke.get("status") == "passed" and len(smoke.get("checks", [])) == 32
assert all(check.get("passed") is True for check in smoke["checks"])
assert coverage == receipt["authorSmoke"]["wasmGuardCoverage"]
assert coverage == {"status": "complete", "entries": expected_entries, "failures": []}
assert smoke.get("webAssemblyRequests") == receipt["authorSmoke"]["webAssemblyRequests"] == 0
assert smoke.get("webAssemblyApiCalls") == receipt["authorSmoke"]["webAssemblyApiCalls"] == 0
assert all(item["status"] == 200 for item in smoke.get("http", []))
assert {"webAssemblyRequests", "webAssemblyApiCalls", "wasmGuardCoverage"}.issubset(smoke)
print("PASS author smoke 32/32; complete ten-entry ledger bound to smoke JSON; legacy counters retained at zero")

for item in [receipt["stableAuthorBuild"]["record"], receipt["stableAuthorBuild"]["bundle"]]:
    assert pin_path(item["path"]) == (item["bytes"], item["sha256"]), f"stable author build pin mismatch: {item['path']}"
print("PASS stable React build record and bundle hashes from E-FIX receipt")

helper = (root / "compiled-frontend/conformance/no-wasm.mjs").read_text()
demo = (root / "compiled-children/demo/smoke.mjs").read_text()
browser = (root / "compiled-children/conformance/browser.mjs").read_text()
checker = (root / "compiled-children/conformance/check.mjs").read_text()
runner = (root / "compiled-children/run.mjs").read_text()
for phrase in ["coverage is missing or unobservable", "coverage installation failed", "WebAssembly API attempt observation is missing"]:
    assert phrase in helper, f"missing fail-closed helper check: {phrase}"
for phrase in ['check("wasm-hook-coverage"', "wasmGuardCoverage", "webAssemblyRequests", "webAssemblyApiCalls"]:
    assert phrase in demo, f"missing demo coverage/count binding: {phrase}"
for phrase in ["guardCoverage: noWasm.guardCoverage", "for (const profile of Object.values(profiles)) profile.noWasm = noWasmEvidence"]:
    assert phrase in browser, f"missing browser coverage binding: {phrase}"
for phrase in ['assertNoWasmCoverage(browser.noWasm, "browser")', "coverage.entries", "NO_WASM_GUARD_ENTRIES"]:
    assert phrase in checker, f"missing checker coverage binding: {phrase}"
for phrase in ["hasObservableClearGuardCoverage(smoke.wasmGuardCoverage)", "hasObservableClearGuardCoverage(browserGuardCoverage)"]:
    assert phrase in runner, f"missing runner coverage requirement: {phrase}"
print("PASS demo/browser/runner carry coverage and legacy request/API fields; checker requires exact ten entries for overall and per-profile browser records")

for key, item in receipt["rawlogs"].items():
    size, digest = pin_path(item["path"])
    assert (size, digest) == (item["bytes"], item["sha256"]), f"N2 receipt rawlog pin mismatch: {key}"
report = receipt["report"]
assert pin_path(report["path"]) == (report["bytes"], report["sha256"]), "N2 report hash/size differs from receipt"
print(f"PASS N2 receipt report and {len(receipt['rawlogs'])} rawlog pins")
