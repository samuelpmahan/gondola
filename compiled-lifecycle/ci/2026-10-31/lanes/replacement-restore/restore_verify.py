#!/usr/bin/env python3
"""Reassemble the accepted lifecycle archive, verify every member, and restore safely."""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import posixpath
import subprocess
import tarfile
import tempfile


ROOT = pathlib.Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
BASE = ROOT / "compiled-lifecycle/ci/2026-10-31"
LANE = BASE / "lanes/replacement-restore"
EXPECTED_COMMIT = "00da54ad0f5a4006b13a5cded18ce291845978bc"
EXPECTED_ARCHIVE_BYTES = 14_757_771
EXPECTED_ARCHIVE_SHA = "f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf"
EXPECTED_MANIFEST_SHA = "27e0ade2164813d3fba831cc44f19b9f9bf56ef862ee68d8f6942dd0e7064c46"
EXPECTED_AUTHOR_REPORT_SHA = "e8e81c1db9e3f949ab1ee8788299ed90e060c81518497c471877b30d4f0d1100"
EXPECTED_AUTHOR_RECEIPT_SHA = "9dcc5282ccc30d4ab8fba0ff4ec52ab01567bc60a2a870dc2dcad27308abd24f"
EXPECTED_RFINAL_SHA = "a6c99407c97e2d6634de14a0a431293309e40d5fcf691a14b6bacaf16791d810"


def sha_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def safe_member_path(name: str) -> pathlib.PurePosixPath:
    normalized = posixpath.normpath(name.rstrip("/"))
    require(not name.startswith("/"), f"absolute archive member: {name}")
    require(normalized not in ("", ".", "..") and not normalized.startswith("../"), f"traversing archive member: {name}")
    require(all(part not in ("", ".", "..") for part in name.rstrip("/").split("/")), f"unsafe archive path component: {name}")
    return pathlib.PurePosixPath(name)


def check_loss_catalog() -> dict:
    catalog_path = BASE / "lanes/restore-custody/catalog/catalog.json"
    catalog = read_json(catalog_path)
    require(catalog["job_id"] == "R-RESTORE-CUSTODY", "loss catalog job identity")
    require(catalog["disposition"].startswith("insufficient_evidence"), "catalog must preserve prior insufficiency")

    # Verify every retained quarantined raw file against the catalog's captured bytes.
    retained_checks = []
    for row in catalog["quarantined_inventory"]:
        path = BASE / row["path"]
        require(path.is_file(), f"quarantined file missing: {row['path']}")
        size, digest = path.stat().st_size, sha_file(path)
        require(size == row["bytes"] and digest == row["sha256"], f"quarantined file drift: {row['path']}")
        retained_checks.append({"path": row["path"], "bytes": size, "sha256": digest, "catalog_status": row["status"], "matched": True})

    # Four earlier bytes are explicitly unavailable. Confirm the named paths now hold
    # the later quarantined capture, not the old frozen hashes; do not reconstruct them.
    later_by_path = {row["path"]: row for row in catalog["newer_quarantined_capture"]}
    unavailable_checks = []
    for old in catalog["prior_bytes_unavailable"]:
        later = later_by_path.get(old["path"])
        require(later is not None, f"no later capture listed for unavailable bytes: {old['path']}")
        current = BASE / old["path"]
        require(current.is_file(), f"current quarantined replacement missing: {old['path']}")
        current_size, current_hash = current.stat().st_size, sha_file(current)
        require(current_size == later["bytes"] and current_hash == later["sha256"], f"later capture mismatch: {old['path']}")
        require(current_size != old["bytes"] or current_hash != old["sha256"], f"unavailable historical bytes appear at current path: {old['path']}")
        unavailable_checks.append({"path": old["path"], "old_bytes": old["bytes"], "old_sha256": old["sha256"], "old_bytes_available": False, "current_capture_bytes": current_size, "current_capture_sha256": current_hash, "current_capture_is_later_version": True})

    # Bind author packet and invalidated XR packet independently. XR is retained only
    # as history; its recorded acceptance is not reused as current acceptance.
    references = []
    pin_checks = [
        ("E-RESTORE report", ROOT / "compiled-lifecycle/ci/2026-10-31/coordination/reports/E-RESTORE.md", EXPECTED_AUTHOR_REPORT_SHA),
        ("E-RESTORE receipt", ROOT / "compiled-lifecycle/ci/2026-10-31/coordination/receipts/E-RESTORE.json", EXPECTED_AUTHOR_RECEIPT_SHA),
        ("invalidated XR-RESTORE report", ROOT / catalog["frozen_xr_restore"]["quarantined_report"], catalog["frozen_xr_restore"]["report_sha256"]),
        ("invalidated XR-RESTORE receipt", ROOT / catalog["frozen_xr_restore"]["quarantined_receipt"], catalog["frozen_xr_restore"]["receipt_sha256"]),
    ]
    for label, path, expected in pin_checks:
        require(path.is_file(), f"pinned reference missing: {label}")
        digest = sha_file(path)
        require(digest == expected, f"pinned reference mismatch: {label}")
        references.append({"label": label, "path": str(path.relative_to(ROOT)), "sha256": digest, "matched": True})

    # The old smoke audit and its exact supporting verifier remain pinned, but its
    # embedded old restore record cannot be revalidated because those bytes are lost.
    for row in catalog["references_that_still_match"]:
        ref = row["reference"]
        if ref == "E-RESTORE author report" or ref == "E-RESTORE author receipt" or ref.startswith("frozen XR-RESTORE"):
            continue
        path = None
        if ref == "smoke-audit.json":
            path = BASE / "lanes/review-restore/smoke-audit.json"
        elif ref == "verify_smoke.py":
            path = BASE / "lanes/review-restore/verify_smoke.py"
        elif ref == "smoke.stderr.log":
            path = BASE / "lanes/review-restore/smoke.stderr.log"
        elif ref == "smoke.png":
            path = BASE / "lanes/review-restore/smoke.png"
        require(path is not None and path.is_file(), f"catalog reference missing: {ref}")
        digest = sha_file(path)
        require(digest == row["sha256"], f"catalog reference mismatch: {ref}")
        references.append({"label": ref, "path": str(path.relative_to(ROOT)), "sha256": digest, "matched": True})

    snapshot_path = BASE / "lanes/restore-custody/before-repair/snapshot.json"
    snapshot = read_json(snapshot_path)
    require(isinstance(snapshot, dict), "quarantine snapshot JSON shape")
    return {
        "catalog": {"path": str(catalog_path.relative_to(ROOT)), "bytes": catalog_path.stat().st_size, "sha256": sha_file(catalog_path), "sequence": catalog["sequence_and_limit"]["sequence"], "limitation": catalog["sequence_and_limit"]["limitation"]},
        "quarantine_snapshot": {"path": str(snapshot_path.relative_to(ROOT)), "bytes": snapshot_path.stat().st_size, "sha256": sha_file(snapshot_path)},
        "retained_capture_checks": retained_checks,
        "prior_unavailable_checks": unavailable_checks,
        "reference_checks": references,
        "claim_limit": "The four old verifier/restore/smoke/stdout bytes remain unavailable. The frozen XR-RESTORE acceptance is invalidated and excluded; later quarantined captures are verified as later versions, not represented as recovered originals."
    }


def restore_archive() -> dict:
    current_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    require(current_commit == EXPECTED_COMMIT, f"source commit changed: {current_commit}")

    author_report = ROOT / "compiled-lifecycle/ci/2026-10-31/coordination/reports/E-RESTORE.md"
    author_receipt_path = ROOT / "compiled-lifecycle/ci/2026-10-31/coordination/receipts/E-RESTORE.json"
    author_receipt = read_json(author_receipt_path)
    require(sha_file(author_report) == EXPECTED_AUTHOR_REPORT_SHA, "E-RESTORE author report pin")
    require(sha_file(author_receipt_path) == EXPECTED_AUTHOR_RECEIPT_SHA, "E-RESTORE author receipt pin")
    require(author_receipt["job_id"] == "E-RESTORE" and author_receipt["worker"] == "N2", "author receipt identity")

    retention_path = BASE / "local/accepted-repair/retention.json"
    retention = read_json(retention_path)
    require(retention["bytes"] == EXPECTED_ARCHIVE_BYTES and retention["sha256"] == EXPECTED_ARCHIVE_SHA, "archive retention pin")
    require(len(retention["chunks"]) == 4, "archive chunk count")

    restore_root = pathlib.Path(tempfile.mkdtemp(prefix="gobi-lifecycle-xr-restore-custody-"))
    archive_path = restore_root / "artifacts.tar.gz"
    chunk_rows = []
    aggregate = hashlib.sha256()
    total = 0
    with archive_path.open("xb") as out:
        for row in retention["chunks"]:
            chunk_path = ROOT / row["path"]
            data = chunk_path.read_bytes()
            digest = sha_bytes(data)
            require(len(data) == row["bytes"] and digest == row["sha256"], f"archive chunk mismatch: {row['path']}")
            out.write(data)
            aggregate.update(data)
            total += len(data)
            chunk_rows.append({"path": row["path"], "bytes": len(data), "sha256": digest, "gitBlob": row.get("gitBlob"), "matched": True})
    require(total == EXPECTED_ARCHIVE_BYTES and aggregate.hexdigest() == EXPECTED_ARCHIVE_SHA, "assembled archive pin")

    manifest_path = BASE / "local/repair-manifest.json"
    manifest_bytes = manifest_path.read_bytes()
    require(sha_bytes(manifest_bytes) == EXPECTED_MANIFEST_SHA, "archive manifest pin")
    manifest = json.loads(manifest_bytes)
    rows = manifest["members"]
    expected = {row["path"]: row for row in rows}
    require(manifest["schema"] == "gobi.compiled-lifecycle-archive/v1", "manifest schema")
    require(len(rows) == 719 and len(expected) == len(rows), "manifest uniqueness/count")

    restored = restore_root / "restored"
    restored.mkdir()
    seen, member_checks, unsafe = set(), [], []
    total_uncompressed = 0
    with tarfile.open(archive_path, "r:gz") as archive:
        for info in archive.getmembers():
            name = info.name
            require(name not in seen, f"duplicate tar member: {name}")
            seen.add(name)
            rel = safe_member_path(name)
            destination = restored.joinpath(*rel.parts)
            try:
                destination.resolve().relative_to(restored.resolve())
            except ValueError:
                unsafe.append(name)
                raise AssertionError(f"archive member escapes restore root: {name}")
            if info.isdir():
                destination.mkdir(parents=True, exist_ok=True)
                continue
            require(info.isfile(), f"unsupported tar member type: {name}")
            row = expected.get(name)
            require(row is not None, f"unexpected tar member: {name}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            digest = hashlib.sha256()
            size = 0
            member = archive.extractfile(info)
            require(member is not None, f"tar member unreadable: {name}")
            with member, destination.open("xb") as out:
                for block in iter(lambda: member.read(1024 * 1024), b""):
                    out.write(block)
                    digest.update(block)
                    size += len(block)
            total_uncompressed += size
            actual = digest.hexdigest()
            require(size == row["bytes"] and actual == row["sha256"], f"member pin mismatch: {name}")
            os.chmod(destination, info.mode & 0o777)
            member_checks.append({"path": name, "bytes": size, "sha256": actual, "matched": True})
    require(set(expected) == seen.intersection(expected), "manifest member set mismatch")
    require(len(member_checks) == 719 and set(expected) == {row["path"] for row in member_checks}, "manifest member count mismatch")
    require(total_uncompressed == 168_200_217, "uncompressed archive size mismatch")
    require(not unsafe, "unsafe archive entries")

    final_receipt_path = BASE / "lanes/repair-native-path/green/final-run-receipt.json"
    require(sha_file(final_receipt_path) == EXPECTED_RFINAL_SHA, "R-FINAL receipt pin")
    final_receipt = read_json(final_receipt_path)
    require(final_receipt["status"] == "passed" and final_receipt["archive"]["sha256"] == EXPECTED_ARCHIVE_SHA, "R-FINAL archive binding")
    require(final_receipt["archive"]["manifest"]["sha256"] == EXPECTED_MANIFEST_SHA, "R-FINAL manifest binding")
    require(final_receipt["archive"]["memberCount"] == len(member_checks) and final_receipt["archive"]["memberBytes"] == total_uncompressed, "R-FINAL archive member binding")

    # Verify archived AppIR/modules and the site-level build identity against R-FINAL.
    attempt_prefix = final_receipt["attempt"].rstrip("/") + "/"

    def archived_attempt_path(relative: str) -> pathlib.Path:
        require(relative.startswith(attempt_prefix), "build path outside R-FINAL attempt")
        return restored / relative[len(attempt_prefix):]

    package_id = "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle"
    build_identities = {}
    for backend in ("react", "dom"):
        build = final_receipt["builds"][backend]
        module = archived_attempt_path(build["rawModule"]["path"])
        app_ir = archived_attempt_path(build["appIR"]["path"])
        require(build["app"]["paths"]["componentId"] == package_id and build["app"]["packagePath"] == package_id, f"{backend} component identity")
        for path, pin, label in ((module, build["rawModule"], "module"), (app_ir, build["appIR"], "AppIR")):
            require(path.is_file() and path.stat().st_size == pin["bytes"] and sha_file(path) == pin["sha256"], f"{backend} {label} pin")
        app_obj = read_json(app_ir)
        component = next(row for row in app_obj["components"] if row["packagePath"] == package_id)
        require(component["id"] == package_id and "effect.request-reply" in component["capabilities"], f"{backend} AppIR component/capability")
        build_identities[backend] = {"component_id": package_id, "app_ir_sha256": sha_file(app_ir), "module_path": build["app"]["paths"]["module"], "module_bytes": module.stat().st_size, "module_sha256": sha_file(module)}
    require(build_identities["react"]["app_ir_sha256"] == build_identities["dom"]["app_ir_sha256"], "React/DOM AppIR identity")

    site = restored / "demo/site"
    require(site.is_dir(), "restored site absent")
    demo_build_path = site / "demo-build.json"
    demo_build = read_json(demo_build_path)
    require(demo_build["componentId"] == package_id and demo_build["packagePath"] == package_id and demo_build["backend"] == "react", "demo build component identity")
    react_build = final_receipt["builds"]["react"]
    for demo_key, receipt_key in (("appIR", "appIR"), ("module", "rawModule"), ("encoder", "encoder")):
        demo_pin = demo_build[demo_key]
        receipt_pin = react_build[receipt_key]
        require(demo_pin["bytes"] == receipt_pin["bytes"] and demo_pin["sha256"] == receipt_pin["sha256"], f"demo {demo_key} identity vs R-FINAL")
        archive_file = archived_attempt_path(receipt_pin["path"])
        require(archive_file.is_file() and archive_file.stat().st_size == demo_pin["bytes"] and sha_file(archive_file) == demo_pin["sha256"], f"archived React {demo_key} pin")

    source_pins = {row["path"]: row for row in final_receipt["sourceBefore"]}
    source_checks = []
    for rel in ("compiled-lifecycle/demo/app.mjs", "compiled-lifecycle/demo/build.mjs", "compiled-lifecycle/demo/smoke.mjs", "fixtures/compiled/lifecycle/scenario.json"):
        pin = source_pins[rel]
        path = ROOT / rel
        require(path.is_file() and path.stat().st_size == pin["bytes"] and sha_file(path) == pin["sha256"], f"source pin mismatch: {rel}")
        source_checks.append({"path": rel, "bytes": pin["bytes"], "sha256": pin["sha256"], "matched": True})
    demo_source_pins = demo_build["sourcePins"]
    for rel in ("compiled-lifecycle/demo/app.mjs", "compiled-lifecycle/demo/build.mjs", "compiled-lifecycle/demo/demo.css", "compiled-lifecycle/demo/index.html"):
        require(demo_source_pins[rel] == source_pins[rel]["sha256"], f"demo build source pin: {rel}")

    scenario = read_json(ROOT / "fixtures/compiled/lifecycle/scenario.json")
    fixture_last = scenario["expectedStates"][-1]
    final_state = final_receipt["demoSmoke"]["finalState"]
    field_map = {"generation": "generations", "requestId": "requestIDs", "alive": "alive", "requested": "requested", "pending": "pending", "token": "tokens", "reply": "replies", "count": "counts"}
    for index, name in enumerate(("parent", "child", "grandchild", "sibling")):
        for dest, source in field_map.items():
            expected_value = fixture_last[source][index]
            if dest in ("generation", "requestId"):
                expected_value = str(expected_value)
            require(final_state[name][dest] == expected_value, f"R-FINAL state differs from fixture: {name}.{dest}")
    require(final_state["nextRequestId"] == str(fixture_last["nextRequestID"]), "R-FINAL next request id vs fixture")

    site_names = ("demo-build.json", "demo.bundle.mjs", "demo.css", "entry.mjs", "index.html")
    site_pins = {}
    for name in site_names:
        path = site / name
        data = path.read_bytes()
        site_pins[f"demo/site/{name}"] = {"bytes": len(data), "sha256": sha_bytes(data)}
    require(site_pins["demo/site/demo-build.json"]["sha256"] == "9c8cca47d0d256e59f51c52dd03966909060e1c6925269b5fcb66ca842744b0f", "demo-build site pin")
    require(site_pins["demo/site/demo.bundle.mjs"]["sha256"] == "651d8034a0f0a85ae5f2a67e9a212d51bdd1ec1321500dcc6067e92f81b95af1", "bundle site pin")
    require(site_pins["demo/site/demo.css"]["sha256"] == "dacf230c424e95182a62f73253d30894c30b67171e6035c3f13bef4a32994f7a", "CSS site pin")
    require(site_pins["demo/site/entry.mjs"]["sha256"] == "07ee6454e704400a3bfa74ee85da6eb9a9453dc8136c606ed8f7d2266c2b7b01", "entry site pin")
    require(site_pins["demo/site/index.html"]["sha256"] == "fa1643df35179cb2f80c120c61811499c07ad8df8525aca1943515cc810a9412", "index site pin")

    loss_catalog = check_loss_catalog()
    result = {
        "schema": "gobi.compiled-lifecycle-replacement-restore/v1",
        "status": "restored_and_verified",
        "source_commit": current_commit,
        "archive": {"path": str(archive_path), "bytes": total, "sha256": aggregate.hexdigest(), "chunks": chunk_rows, "manifest_path": str(manifest_path.relative_to(ROOT)), "manifest_sha256": sha_bytes(manifest_bytes), "member_count": len(member_checks), "member_bytes": total_uncompressed, "unsafe_entries": unsafe, "member_errors": [], "members": member_checks},
        "restore_root": str(restore_root),
        "restored_site": str(site),
        "site_pins_before_smoke": site_pins,
        "r_final_receipt": {"path": str(final_receipt_path.relative_to(ROOT)), "bytes": final_receipt_path.stat().st_size, "sha256": sha_file(final_receipt_path), "matched_expected_pin": True},
        "build_identity": {"package_id": package_id, "backends": build_identities, "demo_build": demo_build, "demo_source_pins_match": True},
        "source_pin_checks": source_checks,
        "headless_fixture": {"path": "fixtures/compiled/lifecycle/scenario.json", "sha256": sha_file(ROOT / "fixtures/compiled/lifecycle/scenario.json"), "events": len(scenario["events"]), "expected_state_count": len(scenario["expectedStates"]), "final_state_matches_r_final": True},
        "loss_catalog_review": loss_catalog,
        "limitations": ["No Go compilation, npm install/ci, or rebuild was run.", "Local Node and Chromium smoke only; no hosted CI or hosted browser claim.", "The four pre-rerun review/restore/smoke/stdout byte sequences remain unavailable and were not reconstructed."]
    }
    out = LANE / "restore.json"
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"restore_json": str(out.relative_to(ROOT)), "restore_root": str(restore_root), "archive_sha256": aggregate.hexdigest(), "members_verified": len(member_checks), "uncompressed_bytes": total_uncompressed, "site_asset_count": len(site_pins), "source_commit": current_commit}, indent=2))


if __name__ == "__main__":
    restore_archive()
