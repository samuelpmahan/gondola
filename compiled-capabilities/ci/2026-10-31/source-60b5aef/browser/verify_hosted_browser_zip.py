#!/usr/bin/env python3
"""Verify provider digest plus browser-critical member bytes in N4's retained ZIP."""
from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
PROVIDER = ROOT / "compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider"
EXTRACTED = PROVIDER / "primary-push-run-41193504188-extracted"
ZIP_PATH = PROVIDER / "primary-push-run-41193504188-artifact.zip"
ATTEMPT = "compiled-capabilities/builds/attempts/attempt-20261031T103752934Z"


def require(ok: bool, message: str):
    if not ok:
        raise AssertionError(message)


def sha(data: bytes):
    return hashlib.sha256(data).hexdigest()


artifact_list = json.loads((PROVIDER / "primary-push-run-41193504188-artifacts-20261031T110351Z.json").read_text())["artifacts"]
matches = [item for item in artifact_list if item.get("id") == 13040129310]
require(len(matches) == 1, "provider artifact id is absent or duplicated")
artifact = matches[0]
zip_data = ZIP_PATH.read_bytes()
zip_hash = sha(zip_data)
require(len(zip_data) == artifact["size_in_bytes"] == 76786265, "ZIP size differs from provider metadata")
require(zip_hash == artifact["digest"].removeprefix("sha256:") == "3a54a53c81ac93ad1c5a8231b17ac289875ed57ad7bb12d7ae2b3609ff267de1", "ZIP SHA-256 differs from provider metadata")
require(artifact["workflow_run"]["id"] == 41193504188 and
        artifact["workflow_run"]["head_sha"] == "60b5aeff3172837ad7831c2b78b210454a3d81a2", "provider artifact source binding mismatch")

critical = [
    f"{ATTEMPT}/execution.json",
    f"{ATTEMPT}/matrix/capabilities.capability.browser.capture.json",
    f"{ATTEMPT}/matrix/capabilities.capability-check.json",
    f"{ATTEMPT}/matrix/capabilities.run.json",
    f"{ATTEMPT}/matrix/capabilities.lifecycle.run.json",
    f"{ATTEMPT}/matrix/capabilities.lifecycle.check.json",
    f"{ATTEMPT}/matrix/capabilities.lifecycle.browser.json",
    f"{ATTEMPT}/react/output/apps/lifecycle-7e6575d90707/app-ir.json",
    f"{ATTEMPT}/dom/output/apps/lifecycle-7e6575d90707/app-ir.json",
    "compiled-capabilities/coordination/receipts/E-BUILD.json",
    "compiled-capabilities/conformance/evidence/attempt-00/capabilities.capability.browser.bundle.mjs",
]
member_results = []
with zipfile.ZipFile(ZIP_PATH) as archive:
    infos = archive.infolist()
    require(len(infos) == 1476, "outer ZIP member count differs from N4 inventory")
    names = {item.filename for item in infos}
    for rel in critical:
        require(rel in names, f"browser-critical artifact member missing from ZIP: {rel}")
        data = archive.read(rel)
        extracted = (EXTRACTED / rel).read_bytes()
        require(data == extracted, f"ZIP member differs from N4 extracted bytes: {rel}")
        member_results.append({"path": rel, "bytes": len(data), "sha256": sha(data), "matchesExtraction": True})

result = {
    "schema": "gobi.current-browser-provider-zip-audit/v1",
    "status": "passed",
    "workflowRun": artifact["workflow_run"]["id"],
    "sourceCommit": artifact["workflow_run"]["head_sha"],
    "providerArtifactId": artifact["id"],
    "zipBytes": len(zip_data),
    "zipSha256": zip_hash,
    "zipMemberCount": len(infos),
    "browserCriticalMembersMatched": len(member_results),
    "members": member_results,
}
print(json.dumps(result, indent=2, sort_keys=True))
