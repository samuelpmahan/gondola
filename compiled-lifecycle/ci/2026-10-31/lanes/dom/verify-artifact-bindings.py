#!/usr/bin/env python3
"""Read-only verification of the primary Actions ZIP, extracted members, and nested build archive."""

import hashlib
import json
import pathlib
import tarfile

ROOT = pathlib.Path.cwd()
PROVIDER = pathlib.Path("compiled-lifecycle/ci/2026-10-31/provider/failed-41178420647")
EXTRACTED = pathlib.Path("compiled-lifecycle/ci/2026-10-31/extracted")
ATTEMPT = EXTRACTED / "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z"
ZIP_MEMBER_MANIFEST = json.loads((PROVIDER / "members.json").read_text())
RETENTION = json.loads((PROVIDER / "retention.json").read_text())
ARCHIVE_MANIFEST = json.loads((ATTEMPT / "archive-manifest.json").read_text())


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


assert RETENTION["artifactId"] == 13034915662
assert RETENTION["runId"] == 41178420647
parts = sorted(PROVIDER.glob("artifact.zip.part-*"))
assert len(parts) == len(RETENTION["chunks"]) == 12
zip_hasher = hashlib.sha256()
zip_bytes = 0
for path, metadata in zip(parts, RETENTION["chunks"], strict=True):
    payload = path.read_bytes()
    assert path.as_posix() == metadata["path"]
    assert len(payload) == metadata["bytes"]
    assert sha_bytes(payload) == metadata["sha256"]
    zip_bytes += len(payload)
    zip_hasher.update(payload)
assert zip_bytes == RETENTION["bytes"] == 47035803
assert zip_hasher.hexdigest() == RETENTION["sha256"] == "6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4"

zip_members = {entry["path"]: entry for entry in ZIP_MEMBER_MANIFEST["members"]}
expected_zip_files = [
    "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.browser.capture.json",
    "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.browser.bundle.mjs",
    "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.direct.json",
    "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.run.json",
    "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.failed.json",
    "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/lifecycle-artifacts.tar.gz",
]
checked_zip_members = {}
for member_path in expected_zip_files:
    record = zip_members[member_path]
    extracted_path = EXTRACTED / member_path
    actual_bytes = extracted_path.read_bytes()
    assert len(actual_bytes) == record["bytes"]
    assert sha_bytes(actual_bytes) == record["sha256"]
    checked_zip_members[member_path] = {"bytes": len(actual_bytes), "sha256": record["sha256"]}

tar_path = ATTEMPT / "lifecycle-artifacts.tar.gz"
archive_entries = {entry["path"]: entry for entry in ARCHIVE_MANIFEST["members"]}
selected_paths = [
    "react/output/apps/lifecycle-7e6575d90707/app-ir.json",
    "react/output/apps/lifecycle-7e6575d90707/encoder.mjs",
    "react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs",
    "react/output/buildmanifest.json",
    "dom/output/apps/lifecycle-7e6575d90707/app-ir.json",
    "dom/output/apps/lifecycle-7e6575d90707/encoder.mjs",
    "dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs",
    "dom/output/buildmanifest.json",
    "matrix/lifecycle.browser.capture.json",
    "matrix/lifecycle.browser.bundle.mjs",
    "matrix/lifecycle.direct.json",
    "matrix/lifecycle.run.json",
]
checked_tar_members = {}
with tarfile.open(tar_path, "r:gz") as archive:
    archive_members = {member.name: member for member in archive.getmembers() if member.isfile()}
    for member_path in selected_paths:
        record = archive_entries[member_path]
        member = archive_members[member_path]
        with archive.extractfile(member) as stream:
            payload = stream.read()
        assert len(payload) == record["bytes"]
        assert sha_bytes(payload) == record["sha256"]
        checked_tar_members[member_path] = {"bytes": len(payload), "sha256": record["sha256"]}

assert checked_tar_members["react/output/apps/lifecycle-7e6575d90707/app-ir.json"]["sha256"] == \
    checked_tar_members["dom/output/apps/lifecycle-7e6575d90707/app-ir.json"]["sha256"] == \
    "341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d"
assert checked_tar_members["react/output/apps/lifecycle-7e6575d90707/encoder.mjs"]["sha256"] == \
    checked_tar_members["dom/output/apps/lifecycle-7e6575d90707/encoder.mjs"]["sha256"] == \
    "521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4"
assert checked_tar_members["react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs"]["sha256"] == \
    "23c9e2d09877eba8ace78cdf352596860463bdc3857961c5ba3274b146b5cb0e"
assert checked_tar_members["dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs"]["sha256"] == \
    "04ca83c08229035dd856ea94abcd7603ec1d333eca0e2aa9f6e64f4f2f86f1fb"
assert checked_tar_members["matrix/lifecycle.browser.capture.json"]["sha256"] == \
    checked_zip_members[expected_zip_files[0]]["sha256"]

result = {
    "schema": "gobi.compiled-lifecycle-artifact-binding-review/v1",
    "providerArtifactId": RETENTION["artifactId"],
    "runId": RETENTION["runId"],
    "providerConclusion": RETENTION["providerConclusion"],
    "artifactZip": {"bytes": zip_bytes, "sha256": zip_hasher.hexdigest(), "chunksVerified": len(parts)},
    "verifiedActionArtifactMembers": checked_zip_members,
    "nestedLifecycleArchive": {
        "bytes": tar_path.stat().st_size,
        "sha256": sha_file(tar_path),
        "archiveManifestSha256": sha_file(ATTEMPT / "archive-manifest.json"),
        "verifiedMembers": checked_tar_members,
    },
}
print(json.dumps(result, indent=2))
