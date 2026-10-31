#!/usr/bin/env python3
"""Materialize immutable relevant CI files from one downloaded workflow ZIP."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("archive", type=Path)
parser.add_argument("destination", type=Path)
parser.add_argument("--expected-sha256", required=True)
args = parser.parse_args()
with args.archive.open("rb") as stream:
    digest = hashlib.file_digest(stream, "sha256").hexdigest()
if digest != args.expected_sha256.removeprefix("sha256:"):
    raise SystemExit("download ZIP digest mismatch")
if args.destination.exists():
    raise SystemExit("immutable extraction destination already exists")
args.destination.parent.mkdir(parents=True, exist_ok=True)
stage = Path(tempfile.mkdtemp(prefix=".extract-", dir=args.destination.parent))
records = []
legacy = []
try:
    with zipfile.ZipFile(args.archive) as archive:
        for member in archive.infolist():
            path = PurePosixPath(member.filename)
            if path.is_absolute() or ".." in path.parts or "\\" in member.filename:
                raise ValueError("unsafe artifact member")
            if member.is_dir():
                continue
            compiler = member.filename.startswith("compiled-frontend/artifacts/")
            inherited_report = member.filename.endswith(".json") and "/build/" in member.filename and "/report" in member.filename and "/raw/" not in member.filename
            # All ZIP members retain identities even when large inherited shards
            # are not copied into the compiler evidence subset.
            if not compiler and not (inherited_report and member.file_size < 1000000):
                continue
            target = stage.joinpath(*path.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            data = archive.read(member)
            target.write_bytes(data)
            record = {"path": member.filename, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "zipCRC32": f"{member.CRC:08x}"}
            (records if compiler else legacy).append(record)
    if not records or not any(p["path"].endswith("/execution.json") for p in records):
        raise ValueError("compiled execution receipt missing from artifact")
    manifest = {"schema": "gobi.ci-extraction/v1", "archiveSha256": digest, "selection": "complete compiled-frontend/artifacts plus selected inherited JSON reports under1MB", "compilerFiles": sorted(records, key=lambda x: x["path"]), "inheritedReports": sorted(legacy, key=lambda x: x["path"]), "limits": "Remaining inherited shards stay in the original GitHub artifact; no CI execution claim follows from extraction alone."}
    (stage / "extraction-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    os.rename(stage, args.destination)
    print(json.dumps({"destination": str(args.destination), "archiveSha256": digest, "compilerFiles": len(records), "inheritedReports": len(legacy)}))
except BaseException:
    shutil.rmtree(stage, ignore_errors=True)
    raise
