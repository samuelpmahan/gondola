#!/usr/bin/env python3
"""Independent provider artifact and selected source/build binding check."""
import hashlib
import io
import json
import pathlib
import tarfile
import zipfile

ROOT = pathlib.Path.cwd()
DATE = pathlib.Path("compiled-lifecycle/ci/2026-10-31")
PROVIDER = DATE / "provider/failed-41178420647"
EXTRACTED = DATE / "extracted"
ATTEMPT = EXTRACTED / "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z"
retention = json.loads((PROVIDER / "retention.json").read_text())
zip_manifest = json.loads((PROVIDER / "members.json").read_text())
audit = json.loads((DATE / "lanes/dom/audit.json").read_text())

sha = lambda b: hashlib.sha256(b).hexdigest()
parts = sorted(PROVIDER.glob("artifact.zip.part-*"))
assert len(parts) == 12 == len(retention["chunks"])
for p, record in zip(parts, retention["chunks"], strict=True):
    data = p.read_bytes()
    assert p.as_posix() == record["path"]
    assert len(data) == record["bytes"]
    assert sha(data) == record["sha256"]
archive_bytes = b"".join(p.read_bytes() for p in parts)
assert len(archive_bytes) == retention["bytes"] == 47_035_803
assert sha(archive_bytes) == retention["sha256"] == "6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4"

verified_zip = {}
with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
    assert zf.testzip() is None
    expected = {row["path"]: row for row in zip_manifest["members"]}
    file_infos = {row.filename: row for row in zf.infolist() if not row.is_dir()}
    assert set(file_infos) == set(expected)
    for name, info in file_infos.items():
        digest = hashlib.sha256()
        length = 0
        with zf.open(info) as stream:
            while chunk := stream.read(1024 * 1024):
                length += len(chunk)
                digest.update(chunk)
        row = expected[name]
        assert length == row["bytes"], name
        assert digest.hexdigest() == row["sha256"], name
    selected = [
        "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.browser.capture.json",
        "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.browser.bundle.mjs",
        "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.direct.json",
        "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.run.json",
        "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.failed.json",
        "compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/lifecycle-artifacts.tar.gz",
    ]
    for name in selected:
        row = expected[name]
        extracted = (EXTRACTED / name).read_bytes()
        assert len(extracted) == row["bytes"] and sha(extracted) == row["sha256"], name
        verified_zip[name] = {"bytes": row["bytes"], "sha256": row["sha256"]}
    nested = zf.read(selected[-1])

nested_manifest = json.loads((ATTEMPT / "archive-manifest.json").read_text())
expected_tar = {row["path"]: row for row in nested_manifest["members"]}
tar_selected = [
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
verified_tar = {}
with tarfile.open(fileobj=io.BytesIO(nested), mode="r:gz") as tf:
    for name in tar_selected:
        member = tf.getmember(name)
        stream = tf.extractfile(member)
        payload = stream.read()
        row = expected_tar[name]
        assert len(payload) == row["bytes"] and sha(payload) == row["sha256"], name
        verified_tar[name] = {"bytes": len(payload), "sha256": row["sha256"]}

capture_path = ATTEMPT / "matrix/lifecycle.browser.capture.json"
capture = json.loads(capture_path.read_text())
capture_hash = sha(capture_path.read_bytes())
assert capture_hash == "a663d77ba16c43adfb3f4b12666845b82047b3e1b9c7ed68ffea8c98ac304ad6"
assert capture_hash == verified_zip[selected[0]]["sha256"] == verified_tar["matrix/lifecycle.browser.capture.json"]["sha256"]

source_record = json.loads((DATE / "lanes/evidence/commit-source-49cc-current.json").read_text())
assert source_record["sha"] == "49cc2b96c8817a47319d5b7bd484184a22fa984b"
assert source_record["commit"]["tree"]["sha"] == "d49ca35b7eda23837c392bbe0d2363551e4c7bec"
source_paths = list(audit["sourcePins"])
for relative, expected_hash in audit["sourcePins"].items():
    actual = sha((ROOT / relative).read_bytes())
    assert actual == expected_hash, relative

result = {
    "schema": "gobi.compiled-lifecycle-independent-artifact-recheck/v1",
    "artifactId": retention["artifactId"],
    "runId": retention["runId"],
    "sourceSha": source_record["sha"],
    "sourceTree": source_record["commit"]["tree"]["sha"],
    "zipBytes": len(archive_bytes),
    "zipSha256": sha(archive_bytes),
    "providerChunksVerified": len(parts),
    "zipMembersVerified": len(file_infos),
    "selectedProviderMembersVerified": len(verified_zip),
    "nestedSelectedMembersVerified": len(verified_tar),
    "sourcePinsRechecked": len(source_paths),
    "captureSha256": capture_hash,
    "captureProfileNames": sorted(capture["profiles"]),
    "captureBinding": "provider ZIP member = extracted member = nested archive member",
}
print(json.dumps(result, indent=2))
