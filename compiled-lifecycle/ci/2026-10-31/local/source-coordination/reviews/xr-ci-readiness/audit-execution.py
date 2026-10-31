#!/usr/bin/env python3
import hashlib
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
ATTEMPT = ROOT / "compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z"
EXECUTION = ATTEMPT / "execution.json"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def record_path(relative_path):
    path = ROOT / relative_path
    if not path.is_file():
        raise AssertionError(f"missing pinned file: {relative_path}")
    return path

execution_bytes = EXECUTION.read_bytes()
assert hashlib.sha256(execution_bytes).hexdigest() == "b0b181c5044b829e4e6d305f8507c447a5e6d2addb29d05c6a1b528ed496976b"
execution = json.loads(execution_bytes)
assert execution["mode"] == "lifecycle-only"
assert execution["status"] == "passed"
assert execution["failures"] == []
assert len(execution["stages"]) == 13
assert all(stage["status"] == "passed" for stage in execution["stages"])
assert len(execution["commands"]) == 18

runner = record_path("compiled-lifecycle/run.mjs")
assert sha(runner) == "ac79d5038946e9ff0f69a26acc992c132279bcce2dcba0469f1ea77a2e7826b5"
runner_source = runner.read_text()
main_source = runner_source[runner_source.index("async function main()") :]
react_index = main_source.index('const react = await attemptStage("react-goscript-build"')
dom_index = main_source.index('const dom = await attemptStage("dom-goscript-build"')
runtime_index = main_source.index('await attemptStage("compiled-lifecycle-runtime-tests"')
assert react_index < dom_index < runtime_index
assert 'const mode = args.includes("--lifecycle-only") ? "lifecycle-only" : "full"' in runner_source
assert "await recordInheritedRun();" in main_source
assert "GOBI_LIFECYCLE_APP_DIR: appDir" in runner_source

commands = {command["name"]: command for command in execution["commands"]}
react_command = commands["compile-react"]
dom_command = commands["compile-dom"]
runtime_command = commands["lifecycle-compiled-runtime-tests"]
assert react_command["exitCode"] == dom_command["exitCode"] == runtime_command["exitCode"] == 0
to_time = lambda value: datetime.fromisoformat(value.replace("Z", "+00:00"))
assert to_time(react_command["finishedAt"]) < to_time(runtime_command["startedAt"])
assert to_time(dom_command["finishedAt"]) < to_time(runtime_command["startedAt"])

react_build = execution["builds"]["react"]
dom_build = execution["builds"]["dom"]
assert react_build["outputCount"] == dom_build["outputCount"] == 67
react_app_dir = str(Path(react_build["appIR"]["path"]).parent)
assert runtime_command["environmentOverrides"]["GOBI_LIFECYCLE_APP_DIR"] == str(ROOT / react_app_dir)
assert execution["nodeTests"]["compiledLifecycleRuntime"]["environmentVariable"] == "GOBI_LIFECYCLE_APP_DIR"
assert execution["nodeTests"]["compiledLifecycleRuntime"]["appDir"] == react_app_dir

app_ir_path = record_path(react_build["appIR"]["path"])
manifest_path = record_path(react_build["manifest"]["path"])
module_path = record_path(react_build["rawModule"]["path"])
encoder_path = record_path(react_build["encoder"]["path"])
app_ir = json.loads(app_ir_path.read_text())
manifest = json.loads(manifest_path.read_text())
package_path = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
assert app_ir["packagePath"] == package_path
assert app_ir["components"][0]["id"] == package_path
assert manifest["apps"][0]["componentId"] == package_path
assert manifest["apps"][0]["packagePath"] == package_path
for key, path in [("appIR", app_ir_path), ("rawModule", module_path), ("encoder", encoder_path)]:
    assert sha(path) == react_build[key]["sha256"]

runtime_stdout = ATTEMPT / "logs/lifecycle-compiled-runtime-tests.stdout.log"
runtime_stderr = ATTEMPT / "logs/lifecycle-compiled-runtime-tests.stderr.log"
assert sha(runtime_stdout) == runtime_command["stdoutSha256"]
assert sha(runtime_stderr) == runtime_command["stderrSha256"]
stdout = runtime_stdout.read_text()
assert "# tests 10" in stdout and "# pass 10" in stdout and "# fail 0" in stdout

before = execution["sourceBefore"]
after = execution["sourceAfter"]
assert len(before) == len(after) == 122
assert before == after
for item in before:
    path = record_path(item["path"])
    assert path.stat().st_size == item["bytes"]
    assert sha(path) == item["sha256"], item["path"]

before_outputs = execution["outputPinsBefore"]
after_outputs = execution["outputPinsAfter"]
assert len(before_outputs["react"]) + len(before_outputs["dom"]) == 134
assert before_outputs == after_outputs
for backend in ("react", "dom"):
    for item in before_outputs[backend]:
        path = record_path(item["path"])
        assert path.stat().st_size == item["bytes"]
        assert sha(path) == item["sha256"], item["path"]

archive = execution["archive"]
assert archive["roundTripVerified"] is True
assert archive["memberCount"] == 719

print(json.dumps({
    "executionSha256": hashlib.sha256(execution_bytes).hexdigest(),
    "mode": execution["mode"],
    "status": execution["status"],
    "stageCount": len(execution["stages"]),
    "commandCount": len(execution["commands"]),
    "reactAndDomFinishedBeforeTest": True,
    "runtimeTestsPassed": 10,
    "runtimeTestAppDir": execution["nodeTests"]["compiledLifecycleRuntime"]["appDir"],
    "componentId": app_ir["components"][0]["id"],
    "sourcePinsCurrent": len(before),
    "outputPinsCurrent": 134,
    "archiveRoundTripMembers": archive["memberCount"],
    "inheritedFullAcceptanceClaimed": False,
}, indent=2))
