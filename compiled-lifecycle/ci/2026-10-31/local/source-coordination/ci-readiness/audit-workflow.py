#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

import yaml

root = Path(__file__).resolve().parents[3]
current_path = root / ".github/workflows/gobi-compiled-lifecycle.yml"
old_path = root / "compiled-lifecycle/coordination/root-checks/workflow-before.yml.txt"
old_proof_path = root / "compiled-lifecycle/coordination/root-checks/workflow-portability.json"
runner_path = root / "compiled-lifecycle/run.mjs"
shell_path = root / "run-compiled-lifecycle.sh"
test_path = root / "compiled-lifecycle/runtime/runtime.test.mjs"

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

old_bytes = old_path.read_bytes()
old_error = None
try:
    yaml.load(old_bytes.decode(), Loader=yaml.BaseLoader)
except yaml.YAMLError as error:
    old_error = str(error)
assert old_error is not None, "retained pre-fix workflow should fail YAML parsing"

current_bytes = current_path.read_bytes()
workflow = yaml.load(current_bytes.decode(), Loader=yaml.BaseLoader)
assert workflow["name"] == "Gobi compiled Go lifecycle"
assert set(workflow["on"]) == {"push", "pull_request"}
job = workflow["jobs"]["compiled-lifecycle"]
assert job["runs-on"] == "ubuntu-latest"
steps = job["steps"]
assert any(step.get("uses") == "actions/checkout@v4" for step in steps)
assert any(step.get("uses") == "actions/setup-go@v5" and step.get("with", {}).get("go-version") == "1.24.x" for step in steps)
assert any(step.get("uses") == "actions/setup-node@v4" and step.get("with", {}).get("node-version") == "22" for step in steps)
install = next(step for step in steps if step.get("name") == "Install locked JavaScript dependencies")
assert "npm ci --no-audit --no-fund" in install["run"]
assert "npm ci --prefix interaction --no-audit --no-fund" in install["run"]
assert "npm ci --prefix compiled-frontend --no-audit --no-fund" in install["run"]
assert "interaction/node_modules/.bin/playwright install --with-deps chromium" in next(
    step["run"] for step in steps if step.get("name") == "Install Playwright Chromium"
)
run_step = next(step for step in steps if step.get("name") == "Run inherited gates and compiled lifecycle matrix")
assert run_step["run"] == "bash run-compiled-lifecycle.sh"
assert run_step["env"]["GONDOLA_SKIP_NPM_CI"] == "1"
assert run_step["env"]["GONDOLA_SKIP_BROWSER_INSTALL"] == "1"
artifact_step = next(step for step in steps if step.get("uses") == "actions/upload-artifact@v4")
assert artifact_step["if"] == "always()"
artifact_paths = artifact_step["with"]["path"].splitlines()
for required in [
    "compiled-lifecycle/builds/attempts/**",
    "compiled-lifecycle/builds/feasibility/**",
    "compiled-lifecycle/conformance/evidence/**",
    "compiled-lifecycle/demo/evidence/**",
    "compiled-methods/artifacts/attempts/**",
    "compiled-frontend/artifacts/**",
]:
    assert required in artifact_paths, f"artifact upload is missing {required}"

runner = runner_path.read_text()
shell = shell_path.read_text()
runtime_test = test_path.read_text()
main = runner[runner.index("async function main()") :]
react_build = main.index('const react = await attemptStage("react-goscript-build"')
compiled_test = main.index('await attemptStage("compiled-lifecycle-runtime-tests"')
assert react_build < compiled_test, "compiled lifecycle test must follow fresh React build"
assert 'const react = await attemptStage("react-goscript-build"' in main
assert 'const dom = await attemptStage("dom-goscript-build"' in main
assert "const appDir = dirname(react.appPaths.appIR)" in runner
assert "GOBI_LIFECYCLE_APP_DIR: appDir" in runner
assert "process.env.GOBI_LIFECYCLE_APP_DIR" in runtime_test
assert "GOBI_LIFECYCLE_APP_DIR is required" in runtime_test
assert "builds/feasibility/final/react/output/apps" not in runtime_test
assert 'const mode = args.includes("--lifecycle-only") ? "lifecycle-only" : "full"' in runner
assert "run-compiled-methods.sh" in runner
assert 'await recordInheritedRun();' in main
assert 'await runTests();' in main
assert 'exec node "$ROOT/compiled-lifecycle/run.mjs" "$@"' in shell

old_proof = json.loads(old_proof_path.read_text())
assert old_proof["oldRecordedPin"]["sha256"] == sha(old_path)
assert old_proof["currentParse"] == "passed"

print(json.dumps({
    "schema": "gobi.compiled-lifecycle-ci-workflow-audit/v1",
    "status": "passed",
    "yamlParser": f"PyYAML {yaml.__version__} BaseLoader",
    "oldWorkflow": {
        "path": str(old_path.relative_to(root)),
        "bytes": len(old_bytes),
        "sha256": sha(old_path),
        "parseError": old_error,
    },
    "currentWorkflow": {
        "path": str(current_path.relative_to(root)),
        "bytes": len(current_bytes),
        "sha256": sha(current_path),
        "parse": "passed",
        "triggers": ["push", "pull_request"],
        "runner": job["runs-on"],
        "runCommand": run_step["run"],
        "artifactUploadIf": artifact_step["if"],
        "artifactPaths": artifact_paths,
    },
    "runner": {
        "path": str(runner_path.relative_to(root)),
        "sha256": sha(runner_path),
        "defaultMode": "full",
        "partialMode": "--lifecycle-only",
        "postReactBuildCompiledTest": True,
        "inheritedFullCommand": "bash run-compiled-methods.sh",
        "sha256RuntimeTest": sha(test_path),
        "testAppDirectoryEnv": "GOBI_LIFECYCLE_APP_DIR",
        "testRequiresExplicitAppDir": True,
        "oldFeasibilityFallbackAbsent": True,
    },
    "shellEntrypoint": {"path": str(shell_path.relative_to(root)), "sha256": sha(shell_path)},
    "oldYamlProof": str(old_proof_path.relative_to(root)),
}, indent=2))
