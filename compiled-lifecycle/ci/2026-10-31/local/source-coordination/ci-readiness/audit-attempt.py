#!/usr/bin/env python3
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[3]
attempt_rel = Path("compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z")
attempt = root / attempt_rel
execution_path = attempt / "execution.json"
execution = json.loads(execution_path.read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def check_pins(records, label):
    mismatches = []
    for row in records:
        path = root / row["path"]
        if not path.is_file():
            mismatches.append({"path": row["path"], "error": "missing"})
            continue
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if len(data) != row["bytes"] or digest != row["sha256"]:
            mismatches.append({"path": row["path"], "expected": row["sha256"], "actual": digest})
    assert not mismatches, f"{label} pin mismatches: {mismatches[:4]}"
    return len(records)

assert execution["mode"] == "lifecycle-only"
assert execution["status"] == "passed"
assert execution["failures"] == []
assert execution["sourcePinsMatch"] is True
assert execution["sourceBefore"] == execution["sourceAfter"]
source_count = check_pins(execution["sourceAfter"], "source")

commands = {row["name"]: row for row in execution["commands"]}
react_build = commands["compile-react"]
dom_build = commands["compile-dom"]
integration = commands["lifecycle-compiled-runtime-tests"]
assert react_build["exitCode"] == dom_build["exitCode"] == integration["exitCode"] == 0
assert react_build["finishedAt"] <= integration["startedAt"]
assert dom_build["finishedAt"] <= integration["startedAt"]
assert integration["environmentOverrides"].get("GOBI_LIFECYCLE_APP_DIR") == str(
    (root / execution["nodeTests"]["compiledLifecycleRuntime"]["appDir"]).resolve()
)
app_dir = root / execution["nodeTests"]["compiledLifecycleRuntime"]["appDir"]
assert all((app_dir / name).is_file() for name in ["app-ir.json", "gobi-compiled.mjs", "encoder.mjs"])

test_file = root / "compiled-lifecycle/runtime/runtime.test.mjs"
test_pin = next(row for row in execution["nodeTests"]["files"] if row["path"] == "compiled-lifecycle/runtime/runtime.test.mjs")
assert sha(test_file) == test_pin["sha256"]
assert test_pin["sha256"] == "a07ec74fe85995e7ac18fd0d03a789e3d722f3507b6a24b5d03f410bef58e59d"
test_stdout = root / integration["stdoutPath"]
test_stderr = root / integration["stderrPath"]
assert sha(test_stdout) == integration["stdoutSha256"]
assert sha(test_stderr) == integration["stderrSha256"]
test_log = test_stdout.read_text()
assert re.search(r"# tests 10\s+# suites 0\s+# pass 10\s+# fail 0", test_log)

builds = execution["builds"]
build_validation = {}
for backend in ["react", "dom"]:
    build = builds[backend]
    assert build["outputCount"] == 67
    assert build["appIRComponent"]["id"] == "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
    assert build["appIRComponent"]["packagePath"] == build["appIRComponent"]["id"]
    assert build["appIRComponent"]["requestEffectCapability"] is True
    result_path = root / build["result"]["path"]
    result = json.loads(result_path.read_text())
    assert result["ok"] is True and result["diagnostics"] == [] and len(result["outputs"]) == 67
    manifest_path = root / build["manifest"]["path"]
    manifest = json.loads(manifest_path.read_text())
    app = manifest["apps"][0]
    assert app["backend"] == backend
    assert app["componentId"] == app["packagePath"] == build["appIRComponent"]["id"]
    app_ir_path = root / build["appIR"]["path"]
    app_ir = json.loads(app_ir_path.read_text())
    assert app_ir["packagePath"] == app["packagePath"]
    assert app_ir["components"][0]["id"] == app["componentId"]
    assert build["request"]["sha256"] == sha(root / build["request"]["path"])
    assert build["result"]["sha256"] == sha(result_path)
    assert build["manifest"]["sha256"] == sha(manifest_path)
    output_pins = build["outputPins"]
    build_validation[backend] = {
        "request": build["request"],
        "result": build["result"],
        "outputDir": build["outputDir"],
        "outputCount": build["outputCount"],
        "appIRComponent": build["appIRComponent"],
        "appIR": build["appIR"],
        "encoder": build["encoder"],
        "rawModule": build["rawModule"],
        "outputPinCount": check_pins(
            [{**row, "path": str(Path(build["outputDir"]) / row["path"])} for row in output_pins],
            f"{backend} build output",
        ),
    }

assert execution["outputPinsBefore"] == execution["outputPinsAfter"]
output_pin_count = sum(len(execution["outputPinsAfter"][backend]) for backend in ["react", "dom"])
for backend in ["react", "dom"]:
    output_pin_count_current = check_pins(execution["outputPinsAfter"][backend], f"{backend} stability")
    assert output_pin_count_current == 67

workflow = root / ".github/workflows/gobi-compiled-lifecycle.yml"
workflow_pin = next(row for row in execution["sourceAfter"] if row["path"] == ".github/workflows/gobi-compiled-lifecycle.yml")
assert sha(workflow) == workflow_pin["sha256"]

archive = execution["archive"]
assert archive["roundTripVerified"] is True and archive["memberCount"] == 719

print(json.dumps({
    "schema": "gobi.compiled-lifecycle-ci-partial-attempt-audit/v1",
    "status": "passed",
    "attempt": str(attempt_rel),
    "execution": {"path": str(execution_path.relative_to(root)), "sha256": sha(execution_path), "mode": execution["mode"], "status": execution["status"], "outcome": execution["outcome"], "failures": len(execution["failures"])},
    "stages": execution["stages"],
    "sourcePins": {"count": source_count, "beforeEqualsAfter": True, "currentAllMatch": True},
    "commands": {
        "count": len(execution["commands"]),
        "reactBuild": {"finishedAt": react_build["finishedAt"], "exitCode": react_build["exitCode"]},
        "domBuild": {"finishedAt": dom_build["finishedAt"], "exitCode": dom_build["exitCode"]},
        "compiledRuntimeTest": {
            "startedAt": integration["startedAt"],
            "finishedAt": integration["finishedAt"],
            "exitCode": integration["exitCode"],
            "environmentOverrides": integration["environmentOverrides"],
            "stdoutSha256": integration["stdoutSha256"],
            "stderrSha256": integration["stderrSha256"],
            "tests": 10,
            "passed": 10,
            "failed": 0,
        },
    },
    "builds": build_validation,
    "buildOutputPins": {"count": output_pin_count, "beforeEqualsAfter": True, "currentAllMatch": True},
    "archive": {"path": archive["path"], "sha256": archive["sha256"], "members": archive["memberCount"], "roundTripVerified": archive["roundTripVerified"]},
    "runnerModeLimit": "lifecycle-only skips the inherited compiled-methods regression chain; workflow invokes the no-argument full mode",
}, indent=2))
