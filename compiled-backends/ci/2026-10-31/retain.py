#!/usr/bin/env python3
"""Verify one provider ZIP and retain bounded raw compiler/backend evidence."""
import argparse, hashlib, json, pathlib, stat, tarfile, zipfile

parser = argparse.ArgumentParser()
parser.add_argument("zip", type=pathlib.Path)
parser.add_argument("--sha256", required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent
actual = hashlib.sha256(args.zip.read_bytes()).hexdigest()
assert actual == args.sha256.removeprefix("sha256:"), "provider ZIP digest differs"
selected, inventory = [], []
with zipfile.ZipFile(args.zip) as source:
    total = 0
    for item in source.infolist():
        inventory.append({"path": item.filename, "bytes": item.file_size, "compressedBytes": item.compress_size, "crc32": item.CRC})
        name = pathlib.PurePosixPath(item.filename)
        assert not name.is_absolute() and ".." not in name.parts, "unsafe ZIP member"
        assert not stat.S_ISLNK(item.external_attr >> 16), "symlink ZIP member"
        if item.is_dir():
            continue
        allowed = item.filename.startswith(("compiled-backends/artifacts/", "compiled-frontend/artifacts/")) or item.filename in {
            "compiled-backends/coordination/reports/E-DEMO.md", "compiled-backends/coordination/receipts/E-DEMO.json"
        }
        if not allowed:
            continue
        total += item.file_size
        assert total <= 2_000_000_000, "bounded extraction exceeds 2GB"
        data = source.read(item)
        destination = root / "extracted" / item.filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        selected.append({"path": item.filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
assert selected, "no selected evidence"
(root / "zip-inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
(root / "retained-index.json").write_text(json.dumps(selected, indent=2) + "\n")
archive = root / "ci-artifacts.tar.xz"
with tarfile.open(archive, "w:xz", preset=9) as target:
    for entry in selected:
        target.add(root / "extracted" / entry["path"], arcname=entry["path"], recursive=False)
with tarfile.open(archive, "r:xz") as retained:
    assert len(retained.getmembers()) == len(selected)
    for entry in selected:
        data = retained.extractfile(entry["path"]).read()
        assert len(data) == entry["bytes"] and hashlib.sha256(data).hexdigest() == entry["sha256"]
proof = {"schema": "gobi.ci-retention/v1", "providerZipSha256": actual, "providerZipBytes": args.zip.stat().st_size,
    "providerMembers": len(inventory), "retainedMembers": len(selected), "retainedBytes": total,
    "archive": archive.name, "archiveBytes": archive.stat().st_size,
    "archiveSha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "allRetainedMembersVerified": True,
    "limits": "Selected full compiler/backend artifact directories and fresh E-DEMO packet only; provider ZIP inventory and whole-ZIP SHA retained. Other inherited build intermediates require reproduction from logged commands/seeds."}
(root / "retention.json").write_text(json.dumps(proof, indent=2) + "\n")
print(json.dumps(proof))
