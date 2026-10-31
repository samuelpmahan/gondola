#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[4]
evidence_old = ROOT / "compiled-lifecycle/coordination/ci-readiness/evidence/workflow-before.yml"
root_check_old = ROOT / "compiled-lifecycle/coordination/root-checks/workflow-before.yml.txt"
proof_path = ROOT / "compiled-lifecycle/coordination/ci-readiness/evidence/workflow-before-proof.json"
prior_pin_path = ROOT / "compiled-lifecycle/coordination/root-checks/workflow-portability.json"
current_path = ROOT / ".github/workflows/gobi-compiled-lifecycle.yml"

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

old = evidence_old.read_bytes()
proof = json.loads(proof_path.read_text())
prior_pin = json.loads(prior_pin_path.read_text())
assert old == root_check_old.read_bytes(), "recovered old workflow differs from root-check source copy"
old_hash = hashlib.sha256(old).hexdigest()
assert old_hash == proof["oldRecordedPin"]["sha256"]
assert old_hash == prior_pin["oldRecordedPin"]["sha256"]
assert len(old) == proof["oldRecordedPin"]["bytes"]

try:
    yaml.load(old.decode("utf-8"), Loader=yaml.BaseLoader)
except yaml.YAMLError as error:
    old_error = str(error)
else:
    raise AssertionError("recovered pre-fix workflow unexpectedly parsed")
assert "line 48" in old_error and "line 60" in old_error
assert "could not find expected ':'" in old_error

current_bytes = current_path.read_bytes()
workflow = yaml.load(current_bytes.decode("utf-8"), Loader=yaml.BaseLoader)
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
assert "playwright install --with-deps chromium" in next(
    step["run"] for step in steps if step.get("name") == "Install Playwright Chromium"
)
run_step = next(step for step in job["steps"] if step.get("name") == "Run inherited gates and compiled lifecycle matrix")
upload = next(step for step in job["steps"] if step.get("uses") == "actions/upload-artifact@v4")
assert run_step["run"] == "bash run-compiled-lifecycle.sh"
assert run_step.get("env", {}).get("GONDOLA_SKIP_NPM_CI") == "1"
assert run_step.get("env", {}).get("GONDOLA_SKIP_BROWSER_INSTALL") == "1"
assert upload["if"] == "always()"
artifact_paths = upload["with"]["path"].splitlines()
for required in [
    "compiled-lifecycle/builds/attempts/**",
    "compiled-lifecycle/builds/feasibility/**",
    "compiled-lifecycle/conformance/evidence/**",
    "compiled-lifecycle/demo/evidence/**",
    "compiled-methods/artifacts/attempts/**",
    "compiled-frontend/artifacts/**",
]:
    assert required in artifact_paths, f"missing artifact path {required}"

print(json.dumps({
    "yamlParser": f"PyYAML {yaml.__version__} BaseLoader",
    "oldWorkflow": {
        "sha256": old_hash,
        "bytes": len(old),
        "matchesRecoveredCopy": True,
        "matchesPriorRecordedPin": True,
        "parseError": old_error,
    },
    "currentWorkflow": {
        "sha256": digest(current_path),
        "bytes": len(current_bytes),
        "parse": "passed",
        "triggers": ["push", "pull_request"],
        "runner": job["runs-on"],
        "setupGo": "1.24.x",
        "setupNode": "22",
        "command": run_step["run"],
        "artifactUploadIf": upload["if"],
        "artifactPaths": artifact_paths,
    },
}, indent=2))
