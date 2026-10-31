#!/usr/bin/env python3
"""Prepare the frozen E-AUTHOR-CUSTODY evidence archive.

This script copies allowlisted evidence/source trees without rewriting inputs,
streams SHA-256 while copying, maps receipt references, and creates a
metadata-normalized tar.gz. It deliberately refuses an existing stage/archive.
"""
from __future__ import annotations

import csv
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time


REPO = Path(__file__).resolve().parents[3]
OWN = REPO / "compiled-children/evidence-preflight"
STAGE = OWN / "archive-root"
ARCHIVE = OWN / "pre-repair-author-review-history.tar.gz"
INVENTORY = OWN / "archive-inventory.json"

CHUNK = 1024 * 1024


def digest_path(path: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while True:
            block = stream.read(CHUNK)
            if not block:
                break
            size += len(block)
            h.update(block)
    return size, h.hexdigest()


def role_for(source: str) -> str:
    if source.startswith("project/"):
        source = source[len("project/"):]
    if source.startswith("compiled-children/coordination/repairs/"):
        return "preserved-pre-repair-original-or-manifest"
    if source.startswith("compiled-children/coordination/rawlogs/"):
        return "closed-run-or-review-rawlog"
    if source.startswith("compiled-children/coordination/receipts/"):
        return "closed-job-receipt-at-cut"
    if source.startswith("compiled-children/coordination/reports/"):
        return "closed-job-report-at-cut"
    if source.startswith("compiled-children/compiler-evidence/"):
        return "compiler-investigation-evidence-at-cut"
    if source.startswith("fixtures/compiled/children/"):
        return "fixture-source-and-native-evidence-at-cut"
    if source.startswith("compiled-children/oracle/"):
        return "oracle-source-evidence-and-custody-at-cut"
    if source.startswith("compiled-children/conformance/"):
        return "conformance-source-at-cut-current-may-include-later-repairs"
    if source.startswith("compiled-children/demo/"):
        return "demo-source-and-smoke-output-at-cut"
    if source.startswith("compiled-children/runtime/"):
        return "runtime-source-at-cut"
    if source.startswith("compiled-children/"):
        return "project-plan-contract-or-release-document-at-cut"
    if source.startswith("native-state-snapshot/"):
        return "one-time-native-state-spec-snapshot-at-task-start"
    if source.startswith("external-tmp/"):
        return "n4-attempt-capture-or-log-preserved-from-tmp"
    return "custody-metadata"


def copied_member(source: Path, member: str, records: list[dict]) -> None:
    if not source.is_file() or source.is_symlink():
        raise RuntimeError(f"not a regular file: {source}")
    target = STAGE / member
    target.parent.mkdir(parents=True, exist_ok=True)
    before = source.stat()
    h = hashlib.sha256()
    size = 0
    with source.open("rb") as src, target.open("xb") as dst:
        while True:
            block = src.read(CHUNK)
            if not block:
                break
            dst.write(block)
            h.update(block)
            size += len(block)
        dst.flush()
        os.fsync(dst.fileno())
    after = source.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError(f"source changed while copying: {source}")
    if size != before.st_size:
        raise RuntimeError(f"copied size differs from start stat: {source}")
    records.append({
        "member": member,
        "source": str(source),
        "source_bytes": size,
        "source_mtime_ns": before.st_mtime_ns,
        "sha256": h.hexdigest(),
        "role": role_for(member),
    })


def collect_tree(path: str, records: list[dict]) -> None:
    source_root = REPO / path
    if not source_root.is_dir():
        raise FileNotFoundError(source_root)
    for source in sorted(source_root.rglob("*")):
        if source.is_symlink():
            raise RuntimeError(f"symlink in input tree: {source}")
        if source.is_file():
            rel = source.relative_to(REPO).as_posix()
            copied_member(source, f"project/{rel}", records)


def collect_exact(path: str, member: str, records: list[dict]) -> None:
    copied_member(REPO / path, member, records)


def receipt_references(records: list[dict]) -> list[dict]:
    records_by_source = {r["source"]: r for r in records}
    references: list[dict] = []
    for receipt in sorted((STAGE / "project/compiled-children/coordination/receipts").glob("*.json")):
        try:
            data = json.loads(receipt.read_text(encoding="utf-8"))
        except Exception as exc:
            references.append({"receipt_member": receipt.relative_to(STAGE).as_posix(), "error": str(exc)})
            continue

        def walk(value, key=""):
            if isinstance(value, dict):
                for k, v in value.items():
                    walk(v, k)
            elif isinstance(value, list):
                for v in value:
                    walk(v, key)
            elif isinstance(value, str) and ("path" in key.lower() or key.lower() in {"source", "preserved", "file", "archive", "input", "output"}):
                raw = value
                if raw.startswith("/"):
                    candidate = Path(raw)
                else:
                    candidate = REPO / raw
                exists = candidate.is_file()
                info = None
                if exists:
                    size, digest = digest_path(candidate)
                    info = {"bytes": size, "sha256": digest}
                if str(candidate).startswith("/tmp/gobi-children-n4-attempt") and exists:
                    member = "external-tmp/" + candidate.name
                elif str(candidate).startswith(str(REPO) + os.sep) and exists:
                    rel = candidate.relative_to(REPO).as_posix()
                    member = "project/" + rel if str(candidate) in records_by_source else None
                else:
                    member = None
                references.append({
                    "receipt_member": receipt.relative_to(STAGE).as_posix(),
                    "field": key,
                    "reference": raw,
                    "exists_at_cut": exists,
                    "archive_member": member,
                    "observed": info,
                })
        walk(data)
    return references


def audit_repair_manifests(records: list[dict]) -> list[dict]:
    out = []
    root = STAGE / "project/compiled-children/coordination/repairs"
    for manifest in sorted(root.glob("*/originals/manifest.json")):
        data = json.loads(manifest.read_text(encoding="utf-8"))
        for item in data.get("files", []):
            original_member = "project/" + item["preserved"]
            original = STAGE / original_member
            observed = None
            if original.is_file():
                b, h = digest_path(original)
                observed = {"bytes": b, "sha256": h}
            matches = None
            if observed and "bytes" in item and "sha256" in item:
                matches = observed["bytes"] == item["bytes"] and observed["sha256"] == item["sha256"]
            live_source_path = REPO / item["source"]
            live_source = None
            if live_source_path.is_file():
                b, h = digest_path(live_source_path)
                live_source = {"bytes": b, "sha256": h}
            out.append({
                "manifest_member": manifest.relative_to(STAGE).as_posix(),
                "source_as_named_in_original_manifest": item["source"],
                "preserved_member": original_member,
                "expected_original": {"bytes": item.get("bytes"), "sha256": item.get("sha256")},
                "observed_preserved": observed,
                "preserved_matches_original_manifest": matches,
                "live_source_at_cut": live_source,
                "live_source_member": "project/" + item["source"] if live_source and str(live_source_path) in {r["source"] for r in records} else None,
            })
    return out


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def create_archive(
    archive_target: Path = ARCHIVE,
    stage_path: Path = STAGE,
    inventory_path: Path = INVENTORY,
) -> None:
    partial = archive_target.with_suffix(archive_target.suffix + ".partial")
    if archive_target.exists() or partial.exists():
        raise RuntimeError(f"refusing to overwrite archive output: {archive_target}")
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    file_list = OWN / "rawlogs" / f"tar-input-{archive_target.stem}.nul"
    if file_list.exists():
        raise RuntimeError(f"refusing to overwrite tar file list: {file_list}")
    file_list.parent.mkdir(parents=True, exist_ok=True)
    with file_list.open("xb") as stream:
        for row in inventory["members"]:
            stream.write(row["member"].encode("utf-8") + b"\0")
    tar_cmd = [
        "tar", "--sort=name", "--mtime=@0", "--owner=0", "--group=0",
        "--numeric-owner", "--format=posix", "--no-recursion", "-cf", "-",
        "-C", str(stage_path), "--null", "-T", str(file_list),
    ]
    gzip_cmd = ["gzip", "-n", "-1"]
    with partial.open("xb") as out:
        tar = subprocess.Popen(tar_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        assert tar.stdout is not None
        gz = subprocess.Popen(gzip_cmd, stdin=tar.stdout, stdout=out, stderr=subprocess.PIPE)
        tar.stdout.close()
        gz_err = gz.communicate()[1]
        tar_err = tar.stderr.read() if tar.stderr else b""
        tar_rc = tar.wait()
        if gz.returncode != 0 or tar_rc != 0:
            raise RuntimeError(f"archive pipeline failed tar={tar_rc} gzip={gz.returncode}; tar={tar_err!r}; gzip={gz_err!r}")
        out.flush()
        os.fsync(out.fileno())
    os.replace(partial, archive_target)
    archive_target.chmod(0o444)


def main() -> None:
    if STAGE.exists() or ARCHIVE.exists() or INVENTORY.exists():
        raise RuntimeError("refusing to overwrite an existing stage, archive, or archive inventory")
    STAGE.mkdir(parents=True)
    records: list[dict] = []

    # Snapshot bytes captured once at 2026-10-31T12:51:44Z; do not reread live
    # coordination state/spec as substitutes.
    snapshot_root = OWN / "frozen/native-state"
    if not snapshot_root.is_dir():
        raise FileNotFoundError(snapshot_root)
    for source in sorted(snapshot_root.rglob("*")):
        if source.is_file():
            member = "native-state-snapshot/" + source.relative_to(snapshot_root).as_posix()
            copied_member(source, member, records)

    for path in [
        "compiled-children/compiler-evidence",
        "compiled-children/conformance",
        "compiled-children/coordination/receipts",
        "compiled-children/coordination/reports",
        "compiled-children/coordination/rawlogs",
        "compiled-children/coordination/repairs",
        "compiled-children/demo",
        "compiled-children/oracle",
        "compiled-children/runtime",
        "fixtures/compiled/children",
    ]:
        collect_tree(path, records)
    for path in [
        "compiled-children/CONTRACT.md",
        "compiled-children/PLAN.md",
        "compiled-children/README.md",
        "compiled-children/RESULTS.md",
        "compiled-children/run.mjs",
    ]:
        collect_exact(path, "project/" + path, records)

    # Attempt 12 is the last closed author capture available when this packet
    # was assigned. Later attempt names are deliberately excluded.
    attempt_name = re.compile(r"^gobi-children-n4-attempt(0[1-9]|1[0-2])(?:\.|$)")
    temp_files = sorted(
        p for p in Path("/tmp").glob("gobi-children-n4-attempt*")
        if p.is_file() and attempt_name.match(p.name)
    )
    for source in temp_files:
        if source.is_file():
            copied_member(source, "external-tmp/" + source.name, records)
    if not temp_files:
        raise RuntimeError("no /tmp/gobi-children-n4-attempt* captures found")

    records.sort(key=lambda x: x["member"])
    member_names = [r["member"] for r in records]
    if len(member_names) != len(set(member_names)):
        raise RuntimeError("duplicate archive member names")
    references = receipt_references(records)
    repair_audit = audit_repair_manifests(records)

    write_json(STAGE / "CONTENT-INVENTORY.json", {
        "schema": "gobi.author-custody-content-inventory/v1",
        "snapshot_time_utc": "2026-10-31T12:51:44Z",
        "meaning": "Source files and evidence copied into this archive. Inventory omits itself and the generated reference/audit/README metadata; external archive-inventory.json inventories every archived file.",
        "files": records,
    })
    write_json(STAGE / "RECEIPT-PATH-MAP.json", {
        "schema": "gobi.author-custody-receipt-path-map/v1",
        "meaning": "Receipt path-like references resolved against the workspace at the preparation cut; exists_at_cut does not imply receipt hash metadata matched.",
        "references": references,
    })
    write_json(STAGE / "REPAIR-MANIFEST-AUDIT.json", {
        "schema": "gobi.author-custody-repair-manifest-audit/v1",
        "meaning": "Compares preserved originals to each original repair manifest and records live-source hashes at the preparation cut separately.",
        "entries": repair_audit,
    })
    (STAGE / "CUSTODY-README.md").write_text(
        "# Frozen author and review evidence\n\n"
        "Prepared by E-AUTHOR-CUSTODY at the native snapshot cutoff 2026-10-31T12:51:44Z. "
        "This archive is a preservation packet for pre-repair author/review history, not final acceptance. "
        "`project/compiled-children/coordination/repairs/*/originals/` contains exact preserved copies; "
        "current source trees are labeled as live-at-cut and may include later separately reviewed repairs. "
        "The original audit helper SHA pinned by closed E-ORACLE, `7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e`, "
        "was reported unavailable by the superseding custody receipt. The accepted current custody copy "
        "with SHA `f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853` is preserved; "
        "no recovery or restoration of the unavailable original is claimed. Historical XR-ORACLE byte-count "
        "ledger values are preserved as written; the superseding XR-FIX custody receipt records three "
        "byte-count discrepancies and their recalculated sizes/hashes.\n\n"
        "All attempt files matching `/tmp/gobi-children-n4-attempt*` present at the copy cut are included under "
        "`external-tmp/`; the coordination rawlogs include E-HARNESS attempt12 gzip captures.\n",
        encoding="utf-8",
    )

    # Inventory includes every file that will be placed in tar, including the
    # metadata generated above, and is retained outside the archive for the
    # independent consumer to validate every member.
    staged = []
    for source in sorted(STAGE.rglob("*")):
        if source.is_file():
            size, digest = digest_path(source)
            staged.append({"member": source.relative_to(STAGE).as_posix(), "bytes": size, "sha256": digest})
    write_json(INVENTORY, {
        "schema": "gobi.author-custody-archive-inventory/v1",
        "snapshot_time_utc": "2026-10-31T12:51:44Z",
        "archive_member_count": len(staged),
        "members": staged,
    })
    create_archive()
    print(json.dumps({
        "source_file_count": len(records),
        "tmp_attempt_file_count": len(temp_files),
        "receipt_reference_count": len(references),
        "repair_manifest_entry_count": len(repair_audit),
        "archive_member_count": len(staged),
        "archive_path": str(ARCHIVE),
        "archive_bytes": ARCHIVE.stat().st_size,
        "archive_sha256": digest_path(ARCHIVE)[1],
        "inventory_path": str(INVENTORY),
    }, indent=2))


if __name__ == "__main__":
    main()
