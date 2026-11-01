from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

PUBLISHER = Path(__file__).resolve().parent
sys.path.insert(0, str(PUBLISHER))

import pack_audit
import prepare_parts
import common
from common import PackageError, sha256


COMMIT = "a" * 40
GO_SUM_REASON = "the root go.mod contains no dependency requirements; the root module has no external Go dependencies"


def _tar_gz(path: Path, rows: list[tuple[str, bytes, int]]) -> None:
    with path.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=9) as compressed:
            with tarfile.open(fileobj=compressed, mode="w|") as archive:
                for name, data, mode in rows:
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    info.mode = mode
                    info.mtime = 0
                    info.uid = info.gid = 0
                    info.uname = info.gname = ""
                    archive.addfile(info, io.BytesIO(data))


def _source_fixture(base: Path, *, large_archive: bool = False) -> tuple[Path, Path, Path, dict]:
    source_root = base / "source"
    (source_root / "src").mkdir(parents=True)
    source_files = {
        "go.mod": b"module effects.fixture\n\ngo 1.24\n",
        "src/example_test.go": b"package example\n\nfunc TestFixture() {}\n",
    }
    for name, data in source_files.items():
        target = source_root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    large = random.Random(417).randbytes(1024 * 1024 + 31) if large_archive else b"demo"
    archive = base / "primary.tar.gz"
    members = [(f"source/{name}", data, 0o644) for name, data in source_files.items()]
    members.append(("demo/index.html", b"demo", 0o644))
    members.append(("demo/large.bin", large, 0o644))
    _tar_gz(archive, members)
    source_pins = {name: {"bytes": len(data), "sha256": sha256(data)} for name, data in source_files.items()}
    manifest_members = [{"path": name, "bytes": len(data), "sha256": sha256(data)} for name, data, _ in members]
    manifest = {
        "schema": "gobi.module-effects-archive-manifest/v1",
        "sourceCommit": COMMIT,
        "verifierGitHead": COMMIT,
        "verifierGitDirty": False,
        "verifierSourcePinsMatch": True,
        "sourcePinMismatches": [],
        "sourcePins": source_pins,
        "testSourceFilesPinned": ["src/example_test.go"],
        "sourceClosureScope": {
            "directories": ["src"],
            "explicitFiles": ["go.mod"],
            "excludedDirectoryNames": [".git", "node_modules"],
            "excludedFiles": [],
            "excludedCompilerLogs": False,
            "rootGoSum": {"path": "go.sum", "present": False, "evidencePath": "go.mod", "reason": GO_SUM_REASON},
        },
        "members": manifest_members,
        "excludedDuplicateLogs": [],
        "excludedRegenerableBundles": [],
        "archive": {"path": str(archive.resolve()), "bytes": archive.stat().st_size, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()},
        "archivedSnapshotVerified": True,
    }
    manifest_path = base / "bundle.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    return source_root, archive, manifest_path, manifest


class PrimaryPartsTests(unittest.TestCase):
    def test_effect_manifest_dynamic_counts_and_one_mib_git_blob_parts(self) -> None:
        with tempfile.TemporaryDirectory(prefix="effects-package-primary-") as temporary:
            root = Path(temporary)
            source_root, archive, manifest_path, manifest = _source_fixture(root, large_archive=True)
            output = root / "published"
            with patch.object(prepare_parts, "require_clean_commit", return_value=source_root.resolve()):
                result = prepare_parts.prepare_primary_parts(archive, manifest_path, source_root, output)
            index = json.loads((output / "bundle-parts.json").read_text())
            self.assertEqual(index["schema"], "gobi.module-effects-segments/v1")
            self.assertEqual(index["sourceCommit"], COMMIT)
            self.assertEqual(index["memberCount"], len(manifest["members"]))
            self.assertEqual(index["sourcePinCount"], len(manifest["sourcePins"]))
            self.assertEqual(result["memberCount"], 4)
            self.assertEqual(result["sourcePinCount"], 2)
            self.assertGreaterEqual(result["partCount"], 2)
            self.assertEqual(index["parts"][0]["bytes"], 1024 * 1024)
            self.assertTrue(all(0 < row["bytes"] <= 1024 * 1024 for row in index["parts"]))
            hashes = json.loads((output / "bundle-part-hashes.json").read_text())
            self.assertEqual(hashes["schema"], "gobi.module-effects-part-hashes/v1")
            self.assertEqual(len(hashes["parts"]), len(index["parts"]))
            for row in hashes["parts"]:
                part = (output / "bundle" / row["name"]).read_bytes()
                actual_blob = subprocess.run(["git", "hash-object", "--stdin"], input=part, stdout=subprocess.PIPE, check=True).stdout.decode().strip()
                self.assertEqual(row["gitBlobSHA1"], actual_blob)
                self.assertEqual(row["sha256"], hashlib.sha256(part).hexdigest())

    def test_manifest_commit_cleanliness_and_archive_member_pins_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory(prefix="effects-package-binding-") as temporary:
            root = Path(temporary)
            source_root, archive, manifest_path, manifest = _source_fixture(root)
            bad = dict(manifest)
            bad["verifierGitHead"] = "b" * 40
            bad_path = root / "bad-manifest.json"
            bad_path.write_text(json.dumps(bad))
            with self.assertRaisesRegex(PackageError, "verifierGitHead"):
                prepare_parts.validate_primary_binding(archive, bad_path, source_root, require_clean_git=False)
            (source_root / "src/example_test.go").write_bytes(b"tampered source\n")
            with patch.object(prepare_parts, "require_clean_commit", return_value=source_root.resolve()):
                with self.assertRaisesRegex(PackageError, "differs from clean manifest pin"):
                    prepare_parts.validate_primary_binding(archive, manifest_path, source_root, require_clean_git=True)
            (source_root / "src/example_test.go").write_bytes(b"package example\n\nfunc TestFixture() {}\n")
            (source_root / "src/extra.go").write_text("package example\n")
            with patch.object(prepare_parts, "require_clean_commit", return_value=source_root.resolve()):
                with self.assertRaisesRegex(PackageError, "source closure differs from sourcePins"):
                    prepare_parts.validate_primary_binding(archive, manifest_path, source_root, require_clean_git=True)
            (source_root / "src/extra.go").unlink()
            with patch.object(prepare_parts, "require_clean_commit", side_effect=PackageError("dirty")):
                with self.assertRaisesRegex(PackageError, "dirty"):
                    prepare_parts.prepare_primary_parts(archive, manifest_path, source_root, root / "no-output")
            self.assertFalse((root / "no-output").exists())
            tampered = archive.read_bytes() + b"x"
            bad_archive = root / "tampered.tar.gz"
            bad_archive.write_bytes(tampered)
            bad_manifest = dict(manifest)
            bad_manifest["archive"] = {**manifest["archive"], "path": str(bad_archive.resolve())}
            bad_manifest_path = root / "tampered.manifest.json"
            bad_manifest_path.write_text(json.dumps(bad_manifest))
            with self.assertRaisesRegex(PackageError, "archive byte length differs from the manifest pin"):
                prepare_parts.validate_primary_binding(bad_archive, bad_manifest_path, source_root, require_clean_git=False)

    def test_clean_commit_binding_rejects_dirty_or_different_head(self) -> None:
        with tempfile.TemporaryDirectory(prefix="effects-package-git-binding-") as temporary:
            root = Path(temporary)
            with patch.object(common, "git_state", return_value=(COMMIT, True, root.resolve())):
                with self.assertRaisesRegex(PackageError, "dirty"):
                    common.require_clean_commit(root, COMMIT)
            with patch.object(common, "git_state", return_value=("b" * 40, False, root.resolve())):
                with self.assertRaisesRegex(PackageError, "differs from sourceCommit"):
                    common.require_clean_commit(root, COMMIT)


class AuditPackagingTests(unittest.TestCase):
    def test_deterministic_audit_retains_authoritative_evidence_and_records_exclusions(self) -> None:
        with tempfile.TemporaryDirectory(prefix="effects-package-audit-") as temporary:
            base = Path(temporary)
            source_root, primary_archive, primary_manifest_path, primary_manifest = _source_fixture(base)
            coord = base / "coordination"
            for name, data in {
                "reports/E-RUN.md": b"accepted run report\n",
                "receipts/E-DELIVERY.json": b"{\"status\":\"preserved\"}\n",
                "seals/E-RUN/seal.json": b"{}\n",
                "native/epoch-22.bundle": b"solver witness\n",
                "protocol-addenda/receipt-normalization.json": b"{\"normalized\":true}\n",
                "rawlogs/failed-witness.log": b"preserved failure\n",
                "rawlogs/trace.json": b"{\"events\":[] }\n",
            }.items():
                target = coord / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            duplicate = coord / "primary-copy.tar.gz"
            duplicate.write_bytes(primary_archive.read_bytes())
            restored = coord / "rawlogs/restored"
            for row in primary_manifest["members"]:
                archive_member = row["path"]
                if archive_member.startswith("source/"):
                    data = (source_root / archive_member.removeprefix("source/")).read_bytes()
                elif archive_member == "demo/index.html":
                    data = b"demo"
                else:
                    data = b"demo"
                target = restored / archive_member
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            cache = coord / "rawlogs/__pycache__/ignored.pyc"
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(b"cache")
            index = coord / "rawlogs/attempt-index.json"
            index.write_text(json.dumps({"files": [
                {"path": "primary-copy.tar.gz", "bytes": duplicate.stat().st_size, "sha256": hashlib.sha256(duplicate.read_bytes()).hexdigest()},
                {"path": "trace.json", "bytes": (coord / "rawlogs/trace.json").stat().st_size, "sha256": hashlib.sha256((coord / "rawlogs/trace.json").read_bytes()).hexdigest()},
            ]}))
            outputs = []
            for label in ("audit-a", "audit-b"):
                out = base / label
                with patch.object(pack_audit, "git_state", return_value=(COMMIT, False, source_root.resolve())), \
                     patch.object(prepare_parts, "require_clean_commit", return_value=source_root.resolve()):
                    result = pack_audit.pack_audit(
                        coord, source_root, out, primary_manifest=primary_manifest_path,
                        primary_archive=primary_archive, require_clean_git=True,
                    )
                self.assertTrue(result["snapshotStable"])
                self.assertEqual(result["sourcePinCount"], 0)
                self.assertGreaterEqual(result["excludedFileCount"], 5)
                parts_index = json.loads((out / "audit-parts.json").read_text())
                member_manifest = json.loads((out / "audit-members.json").read_text())
                self.assertEqual(parts_index["schema"], "gobi.module-effects-segments/v1")
                self.assertEqual(parts_index["memberCount"], len(member_manifest["members"]))
                self.assertEqual(parts_index["sourcePinCount"], 0)
                self.assertEqual(member_manifest["schema"], "gobi.module-effects-audit-members/v1")
                with tarfile.open(out / "audit.tar.gz", "r:gz") as archive:
                    names = set(archive.getnames())
                    for required in (
                        "coordination/reports/E-RUN.md",
                        "coordination/receipts/E-DELIVERY.json",
                        "coordination/seals/E-RUN/seal.json",
                        "coordination/native/epoch-22.bundle",
                        "coordination/protocol-addenda/receipt-normalization.json",
                        "coordination/rawlogs/failed-witness.log",
                        "coordination/rawlogs/trace.json",
                    ):
                        self.assertIn(required, names)
                    self.assertNotIn("coordination/primary-copy.tar.gz", names)
                    self.assertNotIn("coordination/rawlogs/restored/source/go.mod", names)
                    exclusions = json.load(archive.extractfile("coordination/audit-exclusions.json"))
                    duplicate_row = next(row for row in exclusions["exclusions"] if row["path"] == "primary-copy.tar.gz")
                    self.assertEqual(duplicate_row["kind"], "duplicate-primary-archive")
                    self.assertTrue(any(ref["indexPath"] == "rawlogs/attempt-index.json" for ref in duplicate_row["indexedBy"]))
                outputs.append(hashlib.sha256((out / "audit.tar.gz").read_bytes()).hexdigest())
            self.assertEqual(outputs[0], outputs[1])

    def test_snapshot_guard_refuses_audit_if_source_changes_mid_pack(self) -> None:
        with tempfile.TemporaryDirectory(prefix="effects-package-snapshot-") as temporary:
            base = Path(temporary)
            source_root, archive, manifest_path, _ = _source_fixture(base)
            coord = base / "coordination"
            report = coord / "reports/E-RUN.md"
            report.parent.mkdir(parents=True)
            report.write_text("before\n")
            original = pack_audit._write_audit_tar

            def mutate_after_tar(*args, **kwargs):
                result = original(*args, **kwargs)
                report.write_text("changed during package\n")
                return result

            with patch.object(pack_audit, "git_state", return_value=(COMMIT, False, source_root.resolve())), \
                 patch.object(prepare_parts, "require_clean_commit", return_value=source_root.resolve()), \
                 patch.object(pack_audit, "_write_audit_tar", side_effect=mutate_after_tar):
                with self.assertRaisesRegex(PackageError, "snapshot changed"):
                    pack_audit.pack_audit(
                        coord, source_root, base / "out", primary_manifest=manifest_path,
                        primary_archive=archive, require_clean_git=True,
                    )
            self.assertFalse((base / "out").exists())

    def test_audit_rejects_symlinks_and_does_not_output_inside_input_tree(self) -> None:
        with tempfile.TemporaryDirectory(prefix="effects-package-paths-") as temporary:
            base = Path(temporary)
            coord = base / "coordination"
            coord.mkdir()
            (coord / "regular.txt").write_text("safe")
            link = coord / "linked.txt"
            link.symlink_to(coord / "regular.txt")
            with self.assertRaisesRegex(PackageError, "symlink"):
                pack_audit.scan_tree(coord)
            link.unlink()
            with patch.object(pack_audit, "git_state", return_value=(COMMIT, False, base.resolve())):
                with self.assertRaisesRegex(PackageError, "outside the coordination"):
                    pack_audit.pack_audit(coord, base, coord / "audit-out", require_clean_git=True)

    def test_pack_audit_rejects_symlink_root_and_accepts_regular_root(self) -> None:
        with tempfile.TemporaryDirectory(prefix="effects-package-root-alias-") as temporary:
            base = Path(temporary)
            source_root = base / "source"
            source_root.mkdir()
            coordination_root = base / "coordination"
            coordination_root.mkdir()
            (coordination_root / "marker.txt").write_text("regular root accepted\n")
            alias = base / "coordination-link"
            alias.symlink_to(coordination_root, target_is_directory=True)

            with self.assertRaisesRegex(PackageError, "real non-symlink coordination directory"):
                pack_audit.pack_audit(
                    alias, source_root, base / "alias-out",
                    require_clean_git=False, source_commit=COMMIT,
                )
            self.assertFalse((base / "alias-out").exists())

            result = pack_audit.pack_audit(
                coordination_root, source_root, base / "regular-out",
                require_clean_git=False, source_commit=COMMIT,
            )
            self.assertEqual(result["status"], "prepared-effects-audit-parts")
            self.assertTrue(result["snapshotStable"])
            with tarfile.open(base / "regular-out" / "audit.tar.gz", "r:gz") as archive:
                self.assertIn("coordination/marker.txt", archive.getnames())


if __name__ == "__main__":
    unittest.main()
