#!/usr/bin/env python3
"""Independent read-only streaming audit of the E-AUTHOR-CUSTODY archive."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tarfile
import zlib

ROOT = Path.cwd().resolve()
BASE = ROOT / "compiled-children/evidence-preflight"
ARCHIVE = BASE / "pre-repair-author-review-history.final.tar.gz"
INVENTORY_PATH = BASE / "archive-inventory.final.json"
SELECTION_PATH = BASE / "selection-rawlogs-235.json"
EXCLUDED_PATH = BASE / "rawlogs/excluded-rawlogs-after-cut.json"
AUTHOR_RECEIPT_PATH = ROOT / "compiled-children/coordination/receipts/E-AUTHOR-CUSTODY.json"
AUTHOR_REPORT_PATH = ROOT / "compiled-children/coordination/reports/E-AUTHOR-CUSTODY.md"
CHUNK = 1024 * 1024
MISSING_ORACLE_SHA = "7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e"


def sha_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hash_file(path: Path) -> dict:
    before = path.stat()
    h = hashlib.sha256()
    count = 0
    with path.open("rb") as stream:
        while True:
            block = stream.read(CHUNK)
            if not block:
                break
            h.update(block)
            count += len(block)
    after = path.stat()
    stable = (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns)
    return {"path": str(path), "bytes": count, "sha256": h.hexdigest(), "stable": stable}


class GzipAudit:
    def __init__(self) -> None:
        self.decoder = None
        self.streams = 0
        self.output_bytes = 0

    def feed(self, block: bytes) -> None:
        pending = block
        while pending:
            if self.decoder is None:
                self.decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
            output = self.decoder.decompress(pending)
            self.output_bytes += len(output)
            if self.decoder.eof:
                pending = self.decoder.unused_data
                self.decoder = None
                self.streams += 1
            else:
                pending = self.decoder.unconsumed_tail
                if pending:
                    raise ValueError("nested gzip decoder left unconsumed input")
                break

    def finish(self) -> None:
        if self.decoder is None:
            return
        self.output_bytes += len(self.decoder.flush())
        if not self.decoder.eof:
            raise ValueError("truncated nested gzip member")
        if self.decoder.unused_data:
            raise ValueError("unparsed trailing nested gzip bytes")
        self.decoder = None
        self.streams += 1


def regular_files(root: dict, key: str) -> list[dict]:
    value = root.get(key)
    if not isinstance(value, list):
        raise ValueError(f"expected list at {key}")
    return value


def find_pin(row: dict, member: str) -> dict:
    return row[member]


def recursive_records(value):
    if isinstance(value, dict):
        if isinstance(value.get("path"), str) and isinstance(value.get("sha256"), str):
            yield value
        for child in value.values():
            yield from recursive_records(child)
    elif isinstance(value, list):
        for child in value:
            yield from recursive_records(child)


def main() -> None:
    inventory_bytes = INVENTORY_PATH.read_bytes()
    inventory = json.loads(inventory_bytes)
    author = json.loads(AUTHOR_RECEIPT_PATH.read_text(encoding="utf-8"))
    selection_external_bytes = SELECTION_PATH.read_bytes()
    selection_external = json.loads(selection_external_bytes)
    excluded_external = json.loads(EXCLUDED_PATH.read_text(encoding="utf-8"))
    expected_rows = inventory["members"]
    expected = {row["member"]: row for row in expected_rows}
    if len(expected) != len(expected_rows):
        raise ValueError("duplicate path in external inventory")
    inventory_pin = author["archive"]["archive_inventory"]
    if (len(inventory_bytes), sha_bytes(inventory_bytes)) != (inventory_pin["bytes"], inventory_pin["sha256"]):
        raise ValueError("external archive inventory differs from the author receipt pin")
    archive_before = ARCHIVE.stat()
    if not stat.S_ISREG(archive_before.st_mode) or stat.S_IMODE(archive_before.st_mode) != 0o444:
        raise ValueError("final archive is not a read-only regular file")

    metadata_names = {
        "CONTENT-INVENTORY.json",
        "CUSTODY-CUT.json",
        "CUSTODY-RAWLOG-SELECTION.json",
        "RECEIPT-ARTIFACT-MAP.json",
        "REPAIR-MANIFEST-AUDIT.json",
        "native-state-snapshot/compiled-children/coordination/state.json",
        "native-state-snapshot/snapshot-time.txt",
        "project/compiled-children/coordination/receipts/E-ORACLE.json",
        "project/compiled-children/coordination/receipts/XR-ORACLE.json",
        "project/compiled-children/coordination/rawlogs/N2-XR-ORACLE-receipt-audit.py",
        "project/compiled-children/coordination/rawlogs/N2-XR-ORACLE-receipt-audit.log",
        "project/compiled-children/coordination/rawlogs/N2-XR-ORACLE-receipt-audit-exit.log",
        "project/compiled-children/oracle/audit-native-protocol.mjs",
        "project/compiled-children/oracle/custody/audit-native-protocol.f814c0ae.mjs",
    }
    captured: dict[str, bytes] = {}
    seen: dict[str, dict] = {}
    nested_gzip_members = 0
    nested_gzip_count = 0
    nested_gzip_output_bytes = 0
    member_total = 0

    # tarfile's r|gz mode streams the outer gzip/tar once; each member is read
    # sequentially and hashed, with nested gzip members also decompressed in place.
    with ARCHIVE.open("rb") as raw:
        with tarfile.open(fileobj=raw, mode="r|gz") as tar:
            for entry in tar:
                name = entry.name.rstrip("/")
                if entry.isdir():
                    continue
                if not entry.isfile():
                    raise ValueError(f"non-regular archive entry: {name}")
                if name in seen:
                    raise ValueError(f"duplicate archive entry: {name}")
                if name not in expected:
                    raise ValueError(f"unexpected archive entry: {name}")
                member = tar.extractfile(entry)
                if member is None:
                    raise ValueError(f"unreadable archive entry: {name}")
                h = hashlib.sha256()
                size = 0
                capture = bytearray() if name in metadata_names or ("/repairs/" in name and name.endswith("/originals/manifest.json")) else None
                gzip_audit = GzipAudit() if name.endswith(".gz") else None
                with member:
                    while True:
                        block = member.read(CHUNK)
                        if not block:
                            break
                        size += len(block)
                        h.update(block)
                        if capture is not None:
                            if len(capture) + len(block) > 2 * 1024 * 1024:
                                raise ValueError(f"unexpected oversized metadata member: {name}")
                            capture.extend(block)
                        if gzip_audit is not None:
                            gzip_audit.feed(block)
                if size != entry.size:
                    raise ValueError(f"tar member size mismatch: {name}")
                digest = h.hexdigest()
                row = expected[name]
                if size != row["bytes"] or digest != row["sha256"]:
                    raise ValueError(f"archive member differs from inventory: {name}")
                seen[name] = {"bytes": size, "sha256": digest}
                member_total += size
                if capture is not None:
                    captured[name] = bytes(capture)
                if gzip_audit is not None:
                    gzip_audit.finish()
                    if gzip_audit.streams < 1:
                        raise ValueError(f"nested gzip had no complete stream: {name}")
                    nested_gzip_members += 1
                    nested_gzip_count += gzip_audit.streams
                    nested_gzip_output_bytes += gzip_audit.output_bytes

    missing_members = sorted(set(expected) - set(seen))
    if missing_members:
        raise ValueError(f"archive is missing inventory members: {missing_members[:10]}")
    archive_after = ARCHIVE.stat()
    if (archive_before.st_size, archive_before.st_mtime_ns) != (archive_after.st_size, archive_after.st_mtime_ns):
        raise ValueError("archive changed during streaming verification")
    outer_hash = hash_file(ARCHIVE)
    if not outer_hash["stable"]:
        raise ValueError("archive changed while outer SHA-256 was streamed")

    # Bind the archived source inventory and frozen selection to the final tar.
    content_raw = captured["CONTENT-INVENTORY.json"]
    final_content = json.loads(content_raw)
    stage_content_raw = (BASE / "archive-root/CONTENT-INVENTORY.json").read_bytes()
    stage_content = json.loads(stage_content_raw)
    retry_inventory = json.loads((BASE / "archive-inventory.retry1.json").read_text(encoding="utf-8"))
    retry_content_pin = next(row for row in retry_inventory["members"] if row["member"] == "CONTENT-INVENTORY.json")
    if (len(stage_content_raw), sha_bytes(stage_content_raw)) != (retry_content_pin["bytes"], retry_content_pin["sha256"]):
        raise ValueError("source cutoff inventory differs from the superseded retry1 inventory pin")
    archived_selection_raw = captured["CUSTODY-RAWLOG-SELECTION.json"]
    selection = json.loads(archived_selection_raw)
    if archived_selection_raw != selection_external_bytes:
        raise ValueError("archived frozen rawlog selection differs from external selection file")
    cut = json.loads(captured["CUSTODY-CUT.json"])
    repair_audit = json.loads(captured["REPAIR-MANIFEST-AUDIT.json"])
    receipt_map = json.loads(captured["RECEIPT-ARTIFACT-MAP.json"])
    mapped_receipts = receipt_map["receipts"]
    if len(mapped_receipts) != author["receipt_artifact_mapping"]["receipts_mapped"]:
        raise ValueError("receipt/report mapping count differs from author receipt")
    archived_receipts = {name for name in seen if name.startswith("project/compiled-children/coordination/receipts/") and name.endswith(".json")}
    archived_reports = {name for name in seen if name.startswith("project/compiled-children/coordination/reports/") and name.endswith(".md")}
    mapped_receipt_paths = {row["receipt_member"] for row in mapped_receipts}
    mapped_report_paths = {row["report_member"] for row in mapped_receipts}
    if (len(archived_receipts), len(archived_reports)) != (author["cut"]["receipts_at_cut"], author["cut"]["reports_at_cut"]):
        raise ValueError("archived receipt/report count differs from historical cutoff")
    if archived_receipts != mapped_receipt_paths or archived_reports != mapped_report_paths:
        raise ValueError("receipt/report artifact map differs from exact archived cutoff paths")
    for mapped in mapped_receipts:
        if mapped["receipt_member"] not in seen or mapped["report_member"] not in seen:
            raise ValueError("receipt/report artifact map names a missing archived member")
        for artifact_group in mapped["artifacts"]:
            prefix = artifact_group["member_prefix"]
            names = sorted(name for name in seen if name.startswith(prefix))
            if names != artifact_group["members"] or len(names) != artifact_group["member_count"]:
                raise ValueError(f"receipt artifact path map differs from archived members: {prefix}")
    cutoff_dt = datetime.strptime(selection["cutoff_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    cutoff_ns = int(cutoff_dt.timestamp()) * 1_000_000_000
    fields = ("member", "source", "source_bytes", "source_mtime_ns", "sha256", "role")
    rawlog_rows = [r for r in stage_content["files"] if r["member"].startswith("project/compiled-children/coordination/rawlogs/")]
    before_cut = [r for r in rawlog_rows if r["source_mtime_ns"] <= cutoff_ns]
    after_cut = [r for r in rawlog_rows if r["source_mtime_ns"] > cutoff_ns]
    before_cut.sort(key=lambda r: r["member"])
    after_cut.sort(key=lambda r: r["member"])
    expected_selection = [{k: r[k] for k in fields} for r in before_cut]
    expected_excluded = [{k: r[k] for k in fields} for r in after_cut]
    if expected_selection != selection["entries"] or len(expected_selection) != 235:
        raise ValueError("235-entry selection does not equal an independent cutoff recomputation")
    if selection.get("count") != 235:
        raise ValueError("frozen selection declared count differs from its 235 entries")
    if expected_excluded != excluded_external["excluded_entries"] or len(expected_excluded) != 23:
        raise ValueError("post-cut rawlog ledger does not equal source-inventory entries after cutoff")
    selected_paths = {row["member"] for row in selection["entries"]}
    archived_rawlogs = {name for name in seen if name.startswith("project/compiled-children/coordination/rawlogs/")}
    if selected_paths != archived_rawlogs:
        raise ValueError("archive rawlog member set differs from the exact frozen 235-entry selection")
    final_content_rawlogs = {row["member"] for row in final_content["files"] if row["member"].startswith("project/compiled-children/coordination/rawlogs/")}
    if final_content_rawlogs != selected_paths:
        raise ValueError("final archive source inventory contains post-cut or missing rawlog entries")
    for row in final_content["files"]:
        member_row = expected.get(row["member"])
        if not member_row or member_row["bytes"] != row["source_bytes"] or member_row["sha256"] != row["sha256"]:
            raise ValueError(f"final archived source inventory row does not match archive member: {row['member']}")
    n4_attempt_members = sorted(name for name in seen if name.startswith("external-tmp/gobi-children-n4-attempt"))
    if len(n4_attempt_members) != author["cut"]["n4_attempt_files"] or len(n4_attempt_members) != 251:
        raise ValueError("archived N4 attempt file count differs from the historical cutoff")
    if any(not re.match(r"^external-tmp/gobi-children-n4-attempt(0[1-9]|1[0-2])(?:\.|$)", name) for name in n4_attempt_members):
        raise ValueError("a post-attempt-12 N4 temp path slipped into the final archive")
    output_prefix = "project/compiled-children/demo/output/"
    archived_demo_dirs = sorted({name[len(output_prefix):].split("/", 1)[0] for name in seen if name.startswith(output_prefix) and "/" in name[len(output_prefix):]})
    if archived_demo_dirs != sorted(author["cut"]["demo_output_dirs"]):
        raise ValueError("archived demo output directories differ from the frozen cutoff")
    if cut.get("coordination_rawlog_cutoff_utc") != selection["cutoff_utc"]:
        raise ValueError("internal custody cut and frozen selection cutoff disagree")
    if cut.get("excluded_after_cut_rawlogs") != len(expected_excluded) or cut.get("coordination_rawlog_count") != len(expected_selection):
        raise ValueError("internal custody cut counts differ from the rawlog cutoff ledgers")
    for row in selection["entries"]:
        source_rel = row["member"][len("project/"):]
        source_path = Path(row["source"]).resolve()
        if source_path != (ROOT / source_rel).resolve():
            raise ValueError(f"rawlog physical source/member mapping mismatch: {row['member']}")
        archived = seen[row["member"]]
        if archived["bytes"] != row["source_bytes"] or archived["sha256"] != row["sha256"]:
            raise ValueError(f"selected rawlog member does not match frozen source record: {row['member']}")

    # Audit whether live selected paths changed after the historical inventory cut.
    live_selected = {"same": 0, "changed": [], "missing": []}
    for row in selection["entries"]:
        path = Path(row["source"])
        if not path.is_file():
            live_selected["missing"].append(row["member"])
            continue
        pin = hash_file(path)
        if not pin["stable"]:
            raise ValueError(f"selected live rawlog changed while hashing: {row['member']}")
        if pin["bytes"] == row["source_bytes"] and pin["sha256"] == row["sha256"]:
            live_selected["same"] += 1
        else:
            live_selected["changed"].append({"member": row["member"], "cut_bytes": row["source_bytes"], "live_bytes": pin["bytes"], "cut_sha256": row["sha256"], "live_sha256": pin["sha256"]})

    # Validate the frozen native snapshot independently of the final live state.
    snapshot_state_raw = captured["native-state-snapshot/compiled-children/coordination/state.json"]
    snapshot_state = json.loads(snapshot_state_raw)
    snapshot_time = captured["native-state-snapshot/snapshot-time.txt"].decode("utf-8").strip()
    current_state_path = ROOT / "compiled-children/coordination/state.json"
    current_state_raw = current_state_path.read_bytes()
    current_state = json.loads(current_state_raw)
    native_rows = [r for r in expected_rows if r["member"].startswith("native-state-snapshot/")]
    author_snapshot_rows = author["native_snapshot"]["members"]
    if sorted(native_rows, key=lambda r: r["member"]) != sorted(author_snapshot_rows, key=lambda r: r["member"]):
        raise ValueError("archived native snapshot members differ from the author receipt pin list")
    if snapshot_time != author["cut"]["native_state_snapshot_utc"]:
        raise ValueError("archived snapshot-time does not match author receipt")
    frozen_snapshot_root = BASE / "frozen/native-state"
    for row in native_rows:
        relative = row["member"][len("native-state-snapshot/"):]
        frozen_path = frozen_snapshot_root / relative
        observed = hash_file(frozen_path)
        if not observed["stable"] or (observed["bytes"], observed["sha256"]) != (row["bytes"], row["sha256"]):
            raise ValueError(f"frozen native snapshot file differs from archive member: {relative}")

    # Verify all preserved repair originals against their archived manifests and audit ledger.
    original_audit = repair_audit["entries"]
    if len(original_audit) != 15 or author["repair_original_manifest_audit"]["entries"] != 15:
        raise ValueError("repair original audit count is not the recorded 15")
    audit_by_preserved = {row["preserved_member"]: row for row in original_audit}
    if len(audit_by_preserved) != len(original_audit):
        raise ValueError("duplicate preserved original in manifest audit")
    manifest_names = sorted(name for name in captured if "/repairs/" in name and name.endswith("/originals/manifest.json"))
    manifest_entries = {}
    live_source_not_archived = []
    for name in manifest_names:
        manifest = json.loads(captured[name])
        if manifest.get("schema") not in {
            "gobi.preserved-pre-repair/v1",
            "gobi.preserved-delivery-pre-repair/v1",
            "gobi.preserved-pre-release-docs/v1",
        }:
            raise ValueError(f"unexpected repair manifest schema: {name}")
        for item in manifest.get("files", []):
            preserved_member = "project/" + item["preserved"]
            source_member = "project/" + item["source"]
            inv_preserved = expected.get(preserved_member)
            inv_source = expected.get(source_member)
            if not inv_preserved:
                raise ValueError(f"preserved repair original missing from final archive: {preserved_member}")
            if (item["bytes"], item["sha256"]) != (inv_preserved["bytes"], inv_preserved["sha256"]):
                raise ValueError(f"preserved repair original does not match its manifest: {preserved_member}")
            audit = audit_by_preserved.get(preserved_member)
            if not audit or audit["manifest_member"] != name or audit["source_as_named_in_original_manifest"] != item["source"]:
                raise ValueError(f"repair audit does not map to original manifest: {preserved_member}")
            if audit["expected_original"] != {"bytes": item["bytes"], "sha256": item["sha256"]}:
                raise ValueError(f"repair audit expected hash differs from original manifest: {preserved_member}")
            if audit["observed_preserved"] != {"bytes": inv_preserved["bytes"], "sha256": inv_preserved["sha256"]}:
                raise ValueError(f"repair audit observed hash differs from final archive: {preserved_member}")
            if audit["live_source_member"] is not None:
                if audit["live_source_member"] != source_member or not inv_source:
                    raise ValueError(f"live source path mapping differs from archive member: {preserved_member}")
                if audit["live_source_at_cut"] != {"bytes": inv_source["bytes"], "sha256": inv_source["sha256"]}:
                    raise ValueError(f"live-at-cut source hash differs from archived source member: {source_member}")
            elif source_member in expected:
                raise ValueError(f"audit omits an archived live source member: {source_member}")
            else:
                live_source_not_archived.append({"preserved_member": preserved_member, "source_member": source_member, "live_source_at_cut": audit["live_source_at_cut"]})
            manifest_entries[preserved_member] = item
    if set(manifest_entries) != set(audit_by_preserved) or len(manifest_names) != 5:
        raise ValueError("repair manifests do not account for all 15 preserved originals")

    # Compare the closed XR-ORACLE byte claims with actual final archive members
    # and with the superseding author's byte ledger.
    old_xr = json.loads(captured["project/compiled-children/coordination/receipts/XR-ORACLE.json"])
    targets = {
        "compiled-children/coordination/rawlogs/N2-XR-ORACLE-receipt-audit.py",
        "compiled-children/coordination/rawlogs/N2-XR-ORACLE-receipt-audit.log",
        "compiled-children/coordination/rawlogs/N2-XR-ORACLE-receipt-audit-exit.log",
    }
    old_rows = {row["path"]: row for row in old_xr["reviewer_rawlogs"] if row["path"] in targets}
    actual_ledger = {row["path"]: row for row in author["historical_xr_oracle_byte_ledger"]}
    stale_differences = []
    for path in sorted(targets):
        member_name = "project/" + path
        actual = expected[member_name]
        old = old_rows[path]
        ledger = actual_ledger[path]
        if old["sha256"] != actual["sha256"] or ledger["actualSha256"] != actual["sha256"]:
            raise ValueError(f"historical/superseding SHA mismatch: {path}")
        if ledger["actualBytes"] != actual["bytes"] or ledger["supersedingLedgerBytes"] != actual["bytes"]:
            raise ValueError(f"superseding byte ledger differs from archive: {path}")
        if old["bytes"] != actual["bytes"]:
            stale_differences.append({"path": path, "old_bytes": old["bytes"], "actual_bytes": actual["bytes"], "sha256": actual["sha256"]})
    if len(stale_differences) != 3:
        raise ValueError(f"expected three stale old byte counts, got {len(stale_differences)}")

    # The old 7b hash must remain unavailable; record only the actual f814 copies.
    hash_hits = sorted(name for name, row in expected.items() if row["sha256"] == MISSING_ORACLE_SHA)
    current_oracle = ROOT / "compiled-children/oracle/audit-native-protocol.mjs"
    current_copy = ROOT / "compiled-children/oracle/custody/audit-native-protocol.f814c0ae.mjs"
    if hash_file(current_oracle)["sha256"] != "f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853":
        raise ValueError("current oracle audit source is not the documented f814 reconstruction")
    if hash_file(current_copy)["sha256"] != "f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853":
        raise ValueError("preserved current oracle custody copy differs from its documented f814 hash")
    oracle_members = {
        name: seen[name]
        for name in (
            "project/compiled-children/oracle/audit-native-protocol.mjs",
            "project/compiled-children/oracle/custody/audit-native-protocol.f814c0ae.mjs",
        )
    }

    # The final archive excludes known partials, retry1, and unlisted temp captures.
    excluded_names = {row["member"] for row in expected_rows}
    ambient = json.loads((BASE / "rawlogs/ambient-partials-readonly.json").read_text(encoding="utf-8"))
    partial_results = []
    for item in ambient["entries"]:
        path = ROOT / item["path"]
        observed = hash_file(path)
        if (not observed["stable"] or observed["bytes"] != item["size_after"] or observed["sha256"] != item["sha256"] or
                path.stat().st_mtime_ns != item["mtime_ns_after"]):
            raise ValueError(f"ambient partial differs from read-only ledger: {item['path']}")
        basename = Path(item["path"]).name
        if any(name == basename or name.endswith("/" + basename) for name in excluded_names):
            raise ValueError(f"ambient partial was included in final archive: {basename}")
        partial_results.append({"path": item["path"], "bytes": observed["bytes"], "sha256": observed["sha256"], "stable": observed["stable"], "included": False})
    retry = author["superseded_retry1"]
    retry_path = ROOT / retry["path"]
    retry_observed = hash_file(retry_path)
    if retry_observed["bytes"] != retry["bytes"] or retry_observed["sha256"] != retry["sha256"]:
        raise ValueError("superseded retry1 archive bytes/hash differ from author ledger")
    if any("retry1" in name or name.endswith(".partial") or ".ntqwij" in name or ".4FaGrn" in name for name in excluded_names):
        raise ValueError("superseded retry1 or ambient partial appeared in final archive inventory")
    unlisted = json.loads((BASE / "rawlogs/unlisted-temp-captures.json").read_text(encoding="utf-8"))
    temp_results = []
    for item in unlisted["entries"]:
        path = ROOT / item["workspace_path"]
        observed = hash_file(path)
        if not observed["stable"] or observed["bytes"] != item["bytes"] or observed["sha256"] != item["sha256"]:
            raise ValueError(f"unlisted temp capture differs from read-only ledger: {item['workspace_path']}")
        basename = Path(item["workspace_path"]).name
        if any(name == basename or name.endswith("/" + basename) for name in excluded_names):
            raise ValueError(f"unlisted temp capture was included in final archive: {basename}")
        temp_results.append({"path": item["workspace_path"], "bytes": observed["bytes"], "sha256": observed["sha256"], "included": False})

    expected_archive = author["archive"]
    report_bytes = AUTHOR_REPORT_PATH.read_bytes()
    report_pin = author["report"]
    report_observed = {"bytes": len(report_bytes), "sha256": sha_bytes(report_bytes)}
    if report_observed != {"bytes": report_pin["bytes"], "sha256": report_pin["sha256"]}:
        raise ValueError("author report differs from its structured report pin")
    if (outer_hash["bytes"], outer_hash["sha256"]) != (expected_archive["bytes"], expected_archive["sha256"]):
        raise ValueError("final archive bytes/hash differ from the author receipt")
    if (inventory.get("archive_member_count"), len(expected_rows)) != (len(seen), len(seen)):
        raise ValueError("external inventory declared member count differs from streamed archive")
    if (len(seen), member_total) != (expected_archive["members"], expected_archive["uncompressed_member_bytes"]):
        raise ValueError("final archive member count/total bytes differ from the author receipt")
    if nested_gzip_members != author["verification"]["nested_gzip_members"] or nested_gzip_members != 40:
        raise ValueError("independent nested gzip member count differs from the author verification record")

    output = {
        "result": "independent_stream_audit_passed",
        "archive": {
            "path": str(ARCHIVE.relative_to(ROOT)),
            "bytes": outer_hash["bytes"],
            "sha256": outer_hash["sha256"],
            "mode": oct(stat.S_IMODE(archive_after.st_mode)),
            "members": len(seen),
            "uncompressed_member_bytes": member_total,
            "nested_gzip_members": nested_gzip_members,
            "nested_gzip_streams": nested_gzip_count,
            "nested_gzip_uncompressed_bytes": nested_gzip_output_bytes,
            "external_inventory_bytes": len(inventory_bytes),
            "external_inventory_sha256": sha_bytes(inventory_bytes),
            "inventory_exact_match": True,
        },
        "rawlog_cut": {
            "cutoff_utc": selection["cutoff_utc"],
        "cut_source_inventory_rawlog_records": len(rawlog_rows),
        "final_content_inventory_rawlog_records": len(final_content_rawlogs),
            "independently_selected_at_or_before_cutoff": len(expected_selection),
            "ledger_after_cutoff": len(expected_excluded),
            "archived_rawlog_members": len(archived_rawlogs),
            "selection_and_archive_member_sets_match": True,
            "source_member_mapping_exact": True,
            "current_selected_sources_same": live_selected["same"],
            "current_selected_sources_changed_after_cut": live_selected["changed"],
            "current_selected_sources_missing": live_selected["missing"],
            "post_cut_members_absent": True,
            "archived_receipts": len(archived_receipts),
            "archived_reports": len(archived_reports),
            "archived_n4_attempt_files": len(n4_attempt_members),
            "archived_demo_output_dirs": archived_demo_dirs,
        },
        "native_snapshot": {
            "snapshot_time_utc": snapshot_time,
            "snapshot_epoch": snapshot_state["epoch"],
            "snapshot_state_bytes": len(snapshot_state_raw),
            "snapshot_state_sha256": sha_bytes(snapshot_state_raw),
            "frozen_snapshot_directory_matches_all_members": True,
            "frozen_snapshot_member_count": len(native_rows),
            "current_state_epoch_at_review": current_state["epoch"],
            "current_state_sha256_at_review": sha_bytes(current_state_raw),
            "historical_snapshot_differs_from_current": snapshot_state_raw != current_state_raw,
            "live_frozen_directory_present": (BASE / "frozen/native-state").is_dir(),
        },
        "repair_originals": {
            "manifest_count": len(manifest_names),
            "preserved_files": len(manifest_entries),
            "audit_rows": len(original_audit),
            "all_original_manifest_hashes_and_lengths_match": True,
            "live_source_at_cut_bound_separately": True,
            "live_source_paths_not_archived": live_source_not_archived,
        },
        "legacy_oracle_custody": {
            "closed_expected_missing_sha256": MISSING_ORACLE_SHA,
            "archive_members_with_expected_missing_sha256": hash_hits,
            "archive_actual_audit_source": oracle_members["project/compiled-children/oracle/audit-native-protocol.mjs"],
            "archive_current_custody_copy": oracle_members["project/compiled-children/oracle/custody/audit-native-protocol.f814c0ae.mjs"],
            "workspace_current_audit_sha256": hash_file(current_oracle)["sha256"],
            "workspace_f814_copy_sha256": hash_file(current_copy)["sha256"],
            "restoration_claim": False,
        },
        "stale_old_rawlog_bytecounts": stale_differences,
        "excluded_partial_and_retry_evidence": {
            "ambient_partial_count": len(partial_results),
            "ambient_partials_hashed_and_excluded": partial_results,
            "retry1": {"path": retry["path"], "bytes": retry_observed["bytes"], "sha256": retry_observed["sha256"], "excluded_from_final": True, "superseded": True},
            "unlisted_temp_captures": temp_results,
            "origin_or_completion_cause_assigned": False,
        },
        "author_boundary": {
            "outcome": author["outcome"],
            "full_runtime_acceptance_claimed": False,
            "ci_claimed": False,
            "report_says_archive_is_custody_not_acceptance": "not final acceptance" in AUTHOR_REPORT_PATH.read_text(encoding="utf-8").lower(),
            "later_author_receipt_in_archive": "project/compiled-children/coordination/receipts/E-AUTHOR-CUSTODY.json" in seen,
        },
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
