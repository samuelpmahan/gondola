#!/usr/bin/env python3
"""Verify the primary CI artifact provenance and DOM-scoped matrix inputs."""

import hashlib
import json
import zipfile
from pathlib import Path


BASE = Path("compiled-methods/ci/2026-10-31")
ARCHIVE = BASE / "original.zip"
METADATA = json.loads((BASE / "primary-artifact-metadata.json").read_text())
RETENTION = json.loads((BASE / "artifact-retention.json").read_text())
ORACLE_RESULT_PATH = BASE / "lanes/dom/final/dom-oracle-primary.json"
ORACLE_RESULT = json.loads(ORACLE_RESULT_PATH.read_text())
ATTEMPT = Path("compiled-methods/artifacts/attempts/attempt-20261031T044100445Z")
EXTRACTED = BASE / "extracted" / ATTEMPT
PREFIX = ATTEMPT.as_posix() + "/"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


archive_bytes = ARCHIVE.read_bytes()
archive_hash = sha256(archive_bytes)
assert archive_hash == RETENTION["providerZipSha256"]
assert archive_hash == METADATA["digest"].removeprefix("sha256:")
assert len(archive_bytes) == RETENTION["providerZipBytes"] == METADATA["size_in_bytes"]
assert METADATA["workflow_run"]["id"] == RETENTION["run"] == 41169518187
assert METADATA["workflow_run"]["head_sha"] == RETENTION["source"] == "6b49cc0bd4c9512a041f723c86b632ec506afd9d"
assert RETENTION["sourceTree"] == "b28b10ccefd78f7a90d6d66f2b6769b426ed6a81"
assert RETENTION["job"] == 124444234335
assert RETENTION["workflowOutcome"] == "success"

retained = {member["path"]: member for member in RETENTION["members"]}
selected = [
    "execution.json",
    "matrix/methods.browser.json",
    "matrix/methods.browser.capture.json",
    "matrix/methods.native.json",
    "matrix/methods.direct.json",
    "matrix/methods.run.json",
    "matrix/methods.manifest.json",
    "matrix/methods.check.json",
]
file_pins = {}
with zipfile.ZipFile(ARCHIVE) as archive:
    assert archive.testzip() is None
    assert len(archive.infolist()) == len(RETENTION["members"]) == 968
    for suffix in selected:
        member_path = PREFIX + suffix
        data = archive.read(member_path)
        extracted = (EXTRACTED / suffix).read_bytes()
        digest = sha256(data)
        record = retained[member_path]
        assert data == extracted
        assert len(data) == record["bytes"]
        assert digest == record["sha256"]
        file_pins[suffix] = {"bytes": len(data), "sha256": digest, "retention_match": True, "extracted_copy_match": True}

execution = json.loads((EXTRACTED / "execution.json").read_text())
browser = json.loads((EXTRACTED / "matrix/methods.browser.json").read_text())
capture = json.loads((EXTRACTED / "matrix/methods.browser.capture.json").read_text())
native = json.loads((EXTRACTED / "matrix/methods.native.json").read_text())
direct = json.loads((EXTRACTED / "matrix/methods.direct.json").read_text())
conformance_run = json.loads((EXTRACTED / "matrix/methods.run.json").read_text())
manifest = json.loads((EXTRACTED / "matrix/methods.manifest.json").read_text())
check = json.loads((EXTRACTED / "matrix/methods.check.json").read_text())

assert execution["mode"] == "full" and execution["status"] == "passed"
assert execution["sourcePinsMatch"] is True
assert len(execution["sourceBefore"]) == len(execution["sourceAfter"]) == 137
assert execution["sourceBefore"] == execution["sourceAfter"]
assert conformance_run["status"] == "matched"
assert conformance_run["sourceStable"] is True
assert conformance_run["sourceStableThroughCheck"] is True
assert conformance_run["outputsStableThroughCheck"] is True
assert manifest["status"] == check["status"] == "matched"
assert capture["schema"] == browser["schema"] == "gobi.methods-browser-conformance/v1"
assert capture["browser"] == conformance_run["versions"]["chromium"] == manifest["browser"]["version"]
assert capture["pageErrors"] == []
assert len(capture["swapTransitions"]) == 18
assert native["schema"] == direct["schema"] == "gobi.trace/v1"

expected_browser_hashes = {
    "browser": file_pins["matrix/methods.browser.json"]["sha256"],
    "native": file_pins["matrix/methods.native.json"]["sha256"],
    "direct": file_pins["matrix/methods.direct.json"]["sha256"],
}
assert ORACLE_RESULT["status"] == "passed"
assert ORACLE_RESULT["stage"] == "ci-primary-fresh-head"
assert ORACLE_RESULT["inputSha256"] == expected_browser_hashes

result = {
    "schema": "gobi.ci-dom-primary-artifact-audit/v1",
    "status": "passed",
    "primaryArtifact": {
        "artifactId": METADATA["id"],
        "workflowRunId": RETENTION["run"],
        "jobId": RETENTION["job"],
        "sourceCommit": RETENTION["source"],
        "sourceTree": RETENTION["sourceTree"],
        "workflowOutcome": RETENTION["workflowOutcome"],
        "providerZipPath": str(ARCHIVE),
        "providerZipBytes": len(archive_bytes),
        "providerZipSha256": archive_hash,
        "zipIntegrityCheck": "passed",
        "memberCount": len(RETENTION["members"]),
    },
    "attempt": execution["attempt"],
    "execution": {
        "mode": execution["mode"],
        "status": execution["status"],
        "sourcePinsMatch": execution["sourcePinsMatch"],
        "sourcePinCount": len(execution["sourceBefore"]),
        "versions": execution["versions"],
        "failures": execution["failures"],
    },
    "methodsMatrix": {
        "status": conformance_run["status"],
        "ticks": conformance_run["summary"]["ticks"],
        "actions": conformance_run["summary"]["actions"],
        "suppressedActions": conformance_run["summary"]["suppressedActions"],
        "profiles": conformance_run["summary"]["browserProfiles"],
        "swaps": conformance_run["summary"]["swaps"],
        "chromium": capture["browser"],
        "pageErrors": capture["pageErrors"],
        "traceSha256": capture["traceSha256"],
    },
    "domOracle": {
        "path": str(ORACLE_RESULT_PATH),
        "sha256": sha256(ORACLE_RESULT_PATH.read_bytes()),
        "status": ORACLE_RESULT["status"],
        "inputSha256": expected_browser_hashes,
        "stateSnapshots": ORACLE_RESULT["stateSnapshots"],
        "profiles": ORACLE_RESULT["profiles"],
        "swapPhysicalSnapshots": ORACLE_RESULT["swapPhysicalSnapshots"],
    },
    "verifiedArtifactFiles": file_pins,
    "scope": "DOM serialization, live controls, literal Go state/View expectations, disabled browser intents, empty effects, and swap physical snapshots; callback/dispatch/lifetime claims belong to N6.",
}

out_path = BASE / "lanes/dom/final/primary-dom-audit.json"
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
