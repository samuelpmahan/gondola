#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / "compiled-lifecycle/coordination/ci-readiness/evidence"
MIRROR_RECORD = json.loads((EVIDENCE / "isolated-mirror.json").read_text())
MIRROR = Path(MIRROR_RECORD["mirror"])
APP_DIR = Path("/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/portability/attempt-00/react/output/apps/lifecycle-7e6575d90707")
BUILD_ROOT = ROOT / "compiled-lifecycle/builds/portability/attempt-00/react"
PACKAGE = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check_file(path, size, digest):
    assert path.is_file(), f"missing {path}"
    assert path.stat().st_size == size, f"byte length mismatch: {path}"
    assert sha(path) == digest, f"SHA-256 mismatch: {path}"

assert MIRROR_RECORD["feasibilityDirectoryPresent"] is False
assert not (MIRROR / "compiled-lifecycle/builds/feasibility").exists()
mirror_file_hashes = {}
for item in MIRROR_RECORD["files"]:
    path = MIRROR / item["path"]
    check_file(path, item["bytes"], item["sha256"])
    mirror_file_hashes[item["path"]] = item["sha256"]
assert mirror_file_hashes["compiled-lifecycle/runtime/runtime.test.mjs"] == "a07ec74fe85995e7ac18fd0d03a789e3d722f3507b6a24b5d03f410bef58e59d"
assert mirror_file_hashes["compiled-lifecycle/runtime/runtime.mjs"] == "9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed"

isolated_command = json.loads((EVIDENCE / "isolated-suite.command.json").read_text())
missing_command = json.loads((EVIDENCE / "missing-env-regression.command.json").read_text())
assert Path(isolated_command["actualCwd"]) == MIRROR
assert isolated_command["feasibilityDirectoryPresent"] is False
assert isolated_command["env"]["GOBI_LIFECYCLE_APP_DIR"] == str(APP_DIR)
assert isolated_command["exitCode"] == 0
assert missing_command["actualCwd"] == str(MIRROR)
assert missing_command["GOBI_LIFECYCLE_APP_DIR"] == "unset"
assert missing_command["exitCode"] == 0

n5_isolated_stdout = EVIDENCE / "isolated-suite.stdout.log"
n5_missing_stdout = EVIDENCE / "missing-env-regression.stdout.log"
assert "# tests 10" in n5_isolated_stdout.read_text()
assert "# pass 10" in n5_isolated_stdout.read_text()
assert "# fail 0" in n5_isolated_stdout.read_text()
assert "# tests 1" in n5_missing_stdout.read_text()
assert "# pass 1" in n5_missing_stdout.read_text()
assert "# fail 0" in n5_missing_stdout.read_text()

build_record_path = BUILD_ROOT / "build-record.json"
build_record = json.loads(build_record_path.read_text())
assert build_record["exitCode"] == 0
assert build_record["versions"]["go"] == "go1.27.3"
assert build_record["acceptanceClaim"] is False
assert build_record["outputCount"] == 67
request_path = ROOT / "compiled-lifecycle/builds/portability/attempt-00/react/request.json"
result_path = ROOT / "compiled-lifecycle/builds/portability/attempt-00/react/result.json"
check_file(request_path, build_record["request"]["bytes"], build_record["request"]["sha256"])
check_file(result_path, build_record["result"]["bytes"], build_record["result"]["sha256"])
request = json.loads(request_path.read_text())
result = json.loads(result_path.read_text())
assert request["entryPackages"] == [PACKAGE]
assert request["backend"] == "react"
assert request["sourceRoot"] == str(ROOT)
assert result["ok"] is True and result["diagnostics"] == [] and len(result["outputs"]) == 67

output_root = BUILD_ROOT / "output"
verified_outputs = 0
for output in build_record["outputs"]:
    check_file(output_root / output["path"], output["bytes"], output["sha256"])
    verified_outputs += 1
assert verified_outputs == 67

app_ir_path = APP_DIR / "app-ir.json"
module_path = APP_DIR / "gobi-compiled.mjs"
encoder_path = APP_DIR / "encoder.mjs"
app_ir = json.loads(app_ir_path.read_text())
manifest = json.loads((output_root / "buildmanifest.json").read_text())
assert app_ir["packagePath"] == PACKAGE
assert app_ir["components"][0]["id"] == PACKAGE
assert manifest["apps"][0]["componentId"] == PACKAGE
assert manifest["apps"][0]["packagePath"] == PACKAGE
assert str(APP_DIR) == build_record["appDir"]

print(json.dumps({
    "isolatedMirror": str(MIRROR),
    "mirrorFilesVerified": len(mirror_file_hashes),
    "fallbackPathPresent": False,
    "reportedMirrorSuitePassed": 10,
    "reportedMirrorMissingEnvPassed": 1,
    "freshCLIBuild": str(BUILD_ROOT),
    "freshBuildGo": build_record["versions"]["go"],
    "freshBuildOutputsVerified": verified_outputs,
    "acceptanceClaim": build_record["acceptanceClaim"],
    "appDir": str(APP_DIR),
    "packagePath": app_ir["packagePath"],
    "appIRSha256": sha(app_ir_path),
    "moduleSha256": sha(module_path),
    "encoderSha256": sha(encoder_path),
    "n5IsolatedStdoutSha256": sha(n5_isolated_stdout),
    "n5MissingEnvStdoutSha256": sha(n5_missing_stdout),
}, indent=2))
