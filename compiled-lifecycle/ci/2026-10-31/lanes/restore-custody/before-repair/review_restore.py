#!/usr/bin/env python3
"""Independent chunk, archive-member, and fresh restore audit for XR-RESTORE."""
import hashlib
import io
import json
import os
import pathlib
import posixpath
import subprocess
import tarfile
import tempfile

ROOT = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
BASE = ROOT / "compiled-lifecycle/ci/2026-10-31"
ARCHIVE_DIR = BASE / "local/accepted-repair"
MANIFEST_PATH = BASE / "local/repair-manifest.json"
FINAL_PATH = BASE / "lanes/repair-native-path/green/final-run-receipt.json"
REVIEW_DIR = BASE / "lanes/review-restore"


def require(ok, reason):
    if not ok:
        raise AssertionError(reason)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def sha_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def safe_parts(name):
    require(not name.startswith("/"), f"absolute member path: {name}")
    require("\\" not in name, f"backslash in member path: {name}")
    normalized = posixpath.normpath(name.rstrip("/"))
    require(normalized not in ("", ".", "..") and not normalized.startswith("../"), f"traversal path: {name}")
    require(normalized == name.rstrip("/"), f"noncanonical member path: {name}")
    parts = pathlib.PurePosixPath(name.rstrip("/")).parts
    require(parts and all(part not in ("", ".", "..") for part in parts), f"unsafe path component: {name}")
    return parts


retention = json.loads((ARCHIVE_DIR / "retention.json").read_text())
manifest_bytes = MANIFEST_PATH.read_bytes()
manifest = json.loads(manifest_bytes)
final_bytes = FINAL_PATH.read_bytes()
final_receipt = json.loads(final_bytes)
expected_archive_sha = "f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf"
require(retention["sha256"] == expected_archive_sha and retention["bytes"] == 14_757_771, "retention archive pins")
require(manifest["schema"] == "gobi.compiled-lifecycle-archive/v1", "archive manifest schema")
expected_rows = {row["path"]: row for row in manifest["members"]}
require(len(expected_rows) == 719 and len(expected_rows) == len(manifest["members"]), "manifest uniqueness/count")

# Verify each retained object both by its declared SHA-256 and Git blob identity.
archive_bytes = bytearray()
chunk_evidence = []
for row in retention["chunks"]:
    chunk = (ROOT / row["path"]).read_bytes()
    git_blob_sha1 = hashlib.sha1(f"blob {len(chunk)}\0".encode() + chunk).hexdigest()
    require(len(chunk) == row["bytes"] and sha(chunk) == row["sha256"], f"chunk SHA/size mismatch: {row['path']}")
    require(git_blob_sha1 == row["gitBlob"], f"chunk Git blob mismatch: {row['path']}")
    archive_bytes.extend(chunk)
    chunk_evidence.append({"path": row["path"], "bytes": len(chunk), "sha256": sha(chunk), "git_blob_sha1": git_blob_sha1})
require(len(archive_bytes) == retention["bytes"] and sha(archive_bytes) == expected_archive_sha, "concatenated archive pin")
require(sha(manifest_bytes) == final_receipt["archive"]["manifest"]["sha256"], "manifest hash vs final receipt")
require(sha(final_bytes) == "a6c99407c97e2d6634de14a0a431293309e40d5fcf691a14b6bacaf16791d810", "R-FINAL receipt pin")
require(final_receipt["archive"]["sha256"] == expected_archive_sha and final_receipt["archive"]["bytes"] == len(archive_bytes), "R-FINAL archive identity")

restore_root = pathlib.Path(tempfile.mkdtemp(prefix="gobi-lifecycle-xr-restore-"))
seen_names = set()
seen_canonical_paths = set()
file_names = set()
directory_names = set()
member_rows = []
uncompressed_bytes = 0
with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as archive:
    for info in archive.getmembers():
        name = info.name
        require(name not in seen_names, f"duplicate archive member: {name}")
        seen_names.add(name)
        parts = safe_parts(name)
        canonical_path = "/".join(parts)
        require(canonical_path not in seen_canonical_paths, f"duplicate normalized archive path: {name}")
        seen_canonical_paths.add(canonical_path)
        target = restore_root.joinpath(*parts)
        try:
            target.resolve().relative_to(restore_root.resolve())
        except ValueError as exc:
            raise AssertionError(f"member escaped restore root: {name}") from exc
        if info.isdir():
            directory_names.add(name.rstrip("/"))
            target.mkdir(parents=True, exist_ok=True)
            continue
        require(info.isfile(), f"archive has unsupported link/special member: {name}")
        require(name not in file_names, f"duplicate file member: {name}")
        file_names.add(name)
        expected = expected_rows.get(name)
        require(expected is not None, f"member absent from manifest: {name}")
        source = archive.extractfile(info)
        require(source is not None, f"cannot stream member: {name}")
        target.parent.mkdir(parents=True, exist_ok=True)
        h = hashlib.sha256()
        size = 0
        with source, target.open("wb") as out:
            while True:
                block = source.read(1024 * 1024)
                if not block:
                    break
                size += len(block)
                h.update(block)
                out.write(block)
        require(size == expected["bytes"] and h.hexdigest() == expected["sha256"], f"member pin mismatch: {name}")
        os.chmod(target, info.mode & 0o777)
        uncompressed_bytes += size
        member_rows.append({"path": name, "bytes": size, "sha256": h.hexdigest()})

require(file_names == set(expected_rows), f"archive file/member set differs: missing={len(set(expected_rows)-file_names)} extra={len(file_names-set(expected_rows))}")
require(len(file_names) == 719 and uncompressed_bytes == 168_200_217, "archive member total bytes/count")
require(final_receipt["archive"]["memberCount"] == len(file_names) and final_receipt["archive"]["memberBytes"] == uncompressed_bytes, "member totals vs R-FINAL")

# Bind the restored browser demo to the final receipt's React output and component identity.
package = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
site = restore_root / "demo/site"
demo_build = json.loads((site / "demo-build.json").read_text())
require(demo_build["componentId"] == package and demo_build["packagePath"] == package and demo_build["backend"] == "react", "demo component identity")
react = final_receipt["builds"]["react"]
for field, source_key in (("appIR", "appIR"), ("module", "rawModule"), ("encoder", "encoder")):
    actual = demo_build[field]
    expected = react[source_key]
    require(actual["bytes"] == expected["bytes"] and actual["sha256"] == expected["sha256"], f"demo build {field} mismatch")
    archived = restore_root / expected["path"].removeprefix(final_receipt["attempt"].rstrip("/") + "/")
    require(archived.is_file() and archived.stat().st_size == actual["bytes"] and sha_file(archived) == actual["sha256"], f"archived {field} mismatch")

site_pins = {}
for row in manifest["members"]:
    path = row["path"]
    if path.startswith("demo/site/"):
        local = restore_root / path
        require(local.is_file() and local.stat().st_size == row["bytes"] and sha_file(local) == row["sha256"], f"restored site file mismatch: {path}")
        site_pins[path] = {"bytes": row["bytes"], "sha256": row["sha256"]}
require(len(site_pins) == 5, "site asset inventory")

source_pin_map = {row["path"]: row for row in final_receipt["sourceBefore"]}
source_checks = {}
for relative in ("compiled-lifecycle/demo/smoke.mjs", "compiled-lifecycle/demo/app.mjs", "compiled-lifecycle/demo/build.mjs", "fixtures/compiled/lifecycle/scenario.json"):
    local = ROOT / relative
    expected = source_pin_map[relative]
    require(local.is_file() and local.stat().st_size == expected["bytes"] and sha_file(local) == expected["sha256"], f"current source pin mismatch: {relative}")
    source_checks[relative] = {"bytes": local.stat().st_size, "sha256": sha_file(local)}

record = {
    "schema": "gobi.xr-restore-review/v1",
    "archive": {"bytes": len(archive_bytes), "sha256": sha(archive_bytes), "chunks": chunk_evidence, "manifest_sha256": sha(manifest_bytes), "members": len(file_names), "uncompressed_bytes": uncompressed_bytes, "directories": len(directory_names)},
    "restore_root": str(restore_root),
    "demo_site": str(site),
    "demo_site_pins_before_smoke": site_pins,
    "demo_build": {"component_id": package, "appIR": demo_build["appIR"], "module": demo_build["module"], "encoder": demo_build["encoder"]},
    "source_pins_vs_r_final": source_checks,
    "r_final_receipt_sha256": sha(final_bytes),
    "r_final_member_totals_match": True,
    "status": "restored_and_verified",
}
out = REVIEW_DIR / "restore-audit.json"
out.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
print(json.dumps({"status": record["status"], "restore_record": str(out.relative_to(ROOT)), "restore_root": str(restore_root), "archive_sha256": record["archive"]["sha256"], "members": len(file_names), "uncompressed_bytes": uncompressed_bytes, "site_assets": len(site_pins)}, indent=2))
