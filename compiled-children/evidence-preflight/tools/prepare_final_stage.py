#!/usr/bin/env python3
"""Create a corrected custody stage without altering frozen retry1 payload."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tarfile

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))
import prepare_archive  # noqa: E402

OWN = prepare_archive.OWN
FROZEN_ARCHIVE = OWN / "pre-repair-author-review-history.retry1.tar.gz"
FROZEN_INVENTORY = OWN / "archive-inventory.retry1.json"
SELECTION = OWN / "selection-rawlogs-235.json"
FINAL = Path("/tmp/gobi-author-custody-final-stage-20261031-cut-125230-v3")
CUTOFF_NS = 1793451150 * 1_000_000_000
KEEP_OUTPUTS = {
    "author-smoke-20261031",
    "author-smoke-20261031-rerun1",
}
EXPECTED_RECEIPTS = [
    "E-CHECKER-TESTS", "E-COMPILER", "E-DELIVERY", "E-FIX-ORACLE-CUSTODY",
    "E-FIX-SEEDED-ASSERTIONS", "E-GO", "E-HARNESS", "E-HOST", "E-ORACLE",
    "XR-CHECKER-TESTS", "XR-COMPILER", "XR-DELIVERY", "XR-FIX-ORACLE-CUSTODY",
    "XR-GO", "XR-HARNESS", "XR-HOST", "XR-ORACLE",
]


def digest(path: Path) -> tuple[int, str]:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as f:
        while True:
            b = f.read(1024 * 1024)
            if not b:
                break
            size += len(b)
            h.update(b)
    return size, h.hexdigest()


def write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def extract_verified_archive() -> list[dict]:
    expected_doc = json.loads(FROZEN_INVENTORY.read_text(encoding="utf-8"))
    expected = {row["member"]: row for row in expected_doc["members"]}
    generated_metadata = {
        "CONTENT-INVENTORY.json",
        "CUSTODY-README.md",
        "RECEIPT-PATH-MAP.json",
        "REPAIR-MANIFEST-AUDIT.json",
    }
    content_doc = None
    with tarfile.open(FROZEN_ARCHIVE, mode="r|gz") as archive:
        for entry in archive:
            name = entry.name
            while name.startswith("./"):
                name = name[2:]
            name = name.rstrip("/")
            if name == "CONTENT-INVENTORY.json":
                stream = archive.extractfile(entry)
                if stream is None:
                    raise SystemExit("could not read internal content inventory")
                with stream:
                    content_doc = json.loads(stream.read().decode("utf-8"))
                break
    if content_doc is None:
        raise SystemExit("retry1 archive has no internal content inventory")
    allowed = {row["member"] for row in content_doc["files"]} | generated_metadata
    missing = sorted(allowed - set(expected))
    if missing:
        raise SystemExit("retry1 archive is missing listed content: " + ", ".join(missing[:10]))
    unlisted = [expected[name] for name in sorted(set(expected) - allowed)]
    seen = set()
    FINAL.mkdir(parents=True)
    with tarfile.open(FROZEN_ARCHIVE, mode="r|gz") as archive:
        for entry in archive:
            name = entry.name
            while name.startswith("./"):
                name = name[2:]
            name = name.rstrip("/")
            if entry.isdir():
                continue
            if not entry.isfile() or name in seen:
                raise SystemExit(f"unexpected frozen archive member: {name!r}")
            if name not in allowed:
                stream = archive.extractfile(entry)
                if stream is not None:
                    with stream:
                        while stream.read(1024 * 1024):
                            pass
                continue
            target = FINAL / name
            target.parent.mkdir(parents=True, exist_ok=True)
            stream = archive.extractfile(entry)
            if stream is None:
                raise SystemExit(f"unreadable frozen archive member: {name}")
            h = hashlib.sha256()
            size = 0
            with target.open("xb") as dst, stream:
                while True:
                    block = stream.read(1024 * 1024)
                    if not block:
                        break
                    dst.write(block)
                    h.update(block)
                    size += len(block)
            if size != expected[name]["bytes"] or h.hexdigest() != expected[name]["sha256"]:
                raise SystemExit(f"frozen archive extraction checksum mismatch: {name}")
            seen.add(name)
    missing = sorted(allowed - seen)
    if missing:
        raise SystemExit("frozen archive is missing members: " + ", ".join(missing[:10]))
    return unlisted


def main() -> int:
    if FINAL.exists():
        raise SystemExit(f"refusing to overwrite final temp stage: {FINAL}")
    if not FROZEN_ARCHIVE.is_file() or not FROZEN_INVENTORY.is_file() or not SELECTION.is_file():
        raise SystemExit("verified retry1 archive/inventory and rawlog selection are required")

    selection = json.loads(SELECTION.read_text(encoding="utf-8"))
    if selection.get("count") != 235 or len(selection.get("entries", [])) != 235:
        raise SystemExit("frozen rawlog selection count is not exactly 235")
    keep_rawlogs = {entry["member"] for entry in selection["entries"]}
    unlisted_retry1_members = extract_verified_archive()
    initial = json.loads((FINAL / "CONTENT-INVENTORY.json").read_text(encoding="utf-8"))
    initial_records = {entry["member"]: entry for entry in initial["files"]}
    removed_rawlogs = []
    raw_root = FINAL / "project/compiled-children/coordination/rawlogs"
    for path in sorted(raw_root.rglob("*")):
        if path.is_file():
            member = path.relative_to(FINAL).as_posix()
            if member not in keep_rawlogs:
                removed_rawlogs.append(member)
                path.unlink()

    # Keep the exact two author smoke outputs named in the assignment.
    output_root = FINAL / "project/compiled-children/demo/output"
    removed_outputs = []
    if output_root.exists():
        for path in sorted(output_root.iterdir()):
            if path.is_dir() and path.name not in KEEP_OUTPUTS:
                for file in path.rglob("*"):
                    if file.is_file():
                        removed_outputs.append(file.relative_to(FINAL).as_posix())
                import shutil
                shutil.rmtree(path)
            elif path.is_file():
                removed_outputs.append(path.relative_to(FINAL).as_posix())
                path.unlink()

    # The report created after the selected cutoff is outside this packet.
    # Receipt/report files at or before the cutoff are selected by the frozen
    # source-mtime records, not by their current live worktree versions.
    removed_records = []
    for kind in ("receipts", "reports"):
        folder = FINAL / f"project/compiled-children/coordination/{kind}"
        for path in sorted(folder.glob("*")):
            if not path.is_file():
                continue
            member = path.relative_to(FINAL).as_posix()
            record = initial_records.get(member)
            if record is None or record["source_mtime_ns"] > CUTOFF_NS:
                removed_records.append(member)
                path.unlink()

    # Selection-time source list: every original closed E-/XR- receipt must
    # have an exact receipt and report member. The copied E-HARNESS pair was
    # frozen before its later update; repair originals remain separately.
    receipts_dir = FINAL / "project/compiled-children/coordination/receipts"
    reports_dir = FINAL / "project/compiled-children/coordination/reports"
    missing = []
    for job in EXPECTED_RECEIPTS:
        receipt = receipts_dir / f"{job}.json"
        report = reports_dir / f"{job}.md"
        if not receipt.is_file():
            missing.append(str(receipt.relative_to(FINAL)))
        if not report.is_file():
            missing.append(str(report.relative_to(FINAL)))
    if missing:
        raise SystemExit("selected closed receipt/report members missing: " + ", ".join(missing))

    # Verify every retained copied source against the frozen retry1 inventory.
    retained = []
    for path in sorted(FINAL.rglob("*")):
        if not path.is_file() or path.name in {
            "CONTENT-INVENTORY.json", "RECEIPT-PATH-MAP.json",
            "REPAIR-MANIFEST-AUDIT.json", "CUSTODY-README.md",
        }:
            continue
        member = path.relative_to(FINAL).as_posix()
        prior = initial_records.get(member)
        if prior is None:
            raise SystemExit(f"unlisted payload member appeared during staging: {member}")
        size, sha = digest(path)
        if size != prior["source_bytes"] or sha != prior["sha256"]:
            raise SystemExit(f"frozen copied member differs from retry1 inventory: {member}")
        retained.append(prior)

    selection_member = FINAL / "CUSTODY-RAWLOG-SELECTION.json"
    shutil.copyfile(SELECTION, selection_member)
    retained.append({
        "member": "CUSTODY-RAWLOG-SELECTION.json",
        "source": str(SELECTION),
        "source_bytes": selection_member.stat().st_size,
        "source_mtime_ns": SELECTION.stat().st_mtime_ns,
        "sha256": digest(selection_member)[1],
        "role": "immutable-at-cut-rawlog-member-selection",
    })
    retained.sort(key=lambda item: item["member"])

    receipt_count = len(list(receipts_dir.glob("*.json")))
    report_count = len(list(reports_dir.glob("*.md")))
    if (receipt_count, report_count) != (17, 17):
        raise SystemExit(f"receipt/report cutoff counts unexpected: {receipt_count}/{report_count}, expected 17/17")

    member_set = {item["member"] for item in retained}
    def prefix_members(prefix: str) -> list[str]:
        return sorted(member for member in member_set if member.startswith(prefix))

    # A receipt-to-artifact guide that resolves the closed packet's principal
    # evidence roots to concrete members in this archive.
    mapping = {
        "E-COMPILER": ["project/compiled-children/compiler-evidence/"],
        "XR-COMPILER": ["project/compiled-children/compiler-evidence/"],
        "E-GO": ["project/fixtures/compiled/children/evidence/", "project/fixtures/compiled/children/scenario.json", "project/fixtures/compiled/children/app.go"],
        "E-ORACLE": ["project/compiled-children/oracle/evidence/", "project/compiled-children/oracle/scenario.json", "project/compiled-children/oracle/expectations.json", "project/fixtures/compiled/children/evidence/"],
        "XR-ORACLE": ["project/compiled-children/oracle/custody/", "project/compiled-children/coordination/rawlogs/N2-XR-ORACLE-", "project/compiled-children/coordination/rawlogs/XR-ORACLE-"],
        "E-CHECKER-TESTS": ["project/compiled-children/conformance/", "project/compiled-children/oracle/evidence/", "project/compiled-children/coordination/rawlogs/E-CHECKER-TESTS-"],
        "XR-CHECKER-TESTS": ["project/compiled-children/coordination/rawlogs/XR-CHECKER-TESTS-", "project/compiled-children/conformance/"],
        "E-HARNESS": ["project/compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/"],
        "XR-HARNESS": ["project/compiled-children/coordination/rawlogs/XR-HARNESS-20261031-01/", "project/compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/"],
        "E-DELIVERY": ["project/compiled-children/demo/output/author-smoke-20261031/", "project/compiled-children/demo/output/author-smoke-20261031-rerun1/"],
        "XR-DELIVERY": ["project/compiled-children/demo/output/author-smoke-20261031/", "project/compiled-children/demo/output/author-smoke-20261031-rerun1/"],
        "E-FIX-ORACLE-CUSTODY": ["project/compiled-children/oracle/custody/", "project/compiled-children/coordination/rawlogs/E-FIX-ORACLE-CUSTODY-"],
        "XR-FIX-ORACLE-CUSTODY": ["project/compiled-children/oracle/custody/", "project/compiled-children/coordination/rawlogs/XR-FIX-ORACLE-CUSTODY-", "project/compiled-children/coordination/rawlogs/N2-XR-ORACLE-"],
        "E-FIX-SEEDED-ASSERTIONS": ["project/compiled-children/coordination/repairs/E-FIX-SEEDED-ASSERTIONS/originals/", "project/compiled-children/coordination/rawlogs/E-FIX-SEEDED-ASSERTIONS-"],
    }
    artifact_map = {"schema": "gobi.author-custody-receipt-artifact-map/v1", "receipts": []}
    for job in EXPECTED_RECEIPTS:
        prefixes = mapping.get(job, [f"project/compiled-children/coordination/rawlogs/{job}-"])
        artifacts = []
        for prefix in prefixes:
            members = [m for m in sorted(member_set) if m.startswith(prefix)]
            artifacts.append({"member_prefix": prefix, "members": members, "member_count": len(members)})
        artifact_map["receipts"].append({
            "receipt_member": f"project/compiled-children/coordination/receipts/{job}.json",
            "report_member": f"project/compiled-children/coordination/reports/{job}.md",
            "artifacts": artifacts,
        })

    custody_cut = {
        "schema": "gobi.author-custody-cut/v1",
        "native_state_snapshot_time_utc": "2026-10-31T12:51:44Z",
        "coordination_rawlog_cutoff_utc": "2026-10-31T12:52:30Z",
        "coordination_rawlog_count": 235,
        "receipt_count": receipt_count,
        "report_count": report_count,
        "n4_attempt_file_count": sum(1 for x in retained if x["member"].startswith("external-tmp/gobi-children-n4-attempt")),
        "included_demo_outputs": sorted(KEEP_OUTPUTS),
        "excluded_after_cut_rawlogs": len(removed_rawlogs),
        "excluded_after_cut_receipt_report_members": removed_records,
        "excluded_unselected_demo_output_members": removed_outputs,
        "unlisted_retry1_archive_members_excluded_from_final": unlisted_retry1_members,
        "retry1_archive_superseded": {
            "member": "pre-repair-author-review-history.retry1.tar.gz",
            "reason": "It passed byte verification but contained later rawlog paths beyond the frozen 235-entry selection; retained separately and not represented as accepted.",
        },
    }
    write_json(FINAL / "CUSTODY-CUT.json", custody_cut)
    write_json(FINAL / "CONTENT-INVENTORY.json", {
        "schema": "gobi.author-custody-content-inventory/v1",
        "meaning": "Frozen source/evidence payload copied from retry1 stage, pruned to the selected 235 coordination rawlogs and receipt/report cutoff; excludes itself and generated custody metadata.",
        "native_snapshot_time_utc": "2026-10-31T12:51:44Z",
        "coordination_rawlog_cutoff_utc": "2026-10-31T12:52:30Z",
        "files": retained,
    })
    write_json(FINAL / "RECEIPT-ARTIFACT-MAP.json", artifact_map)
    (FINAL / "CUSTODY-README.md").write_text(
        "# Frozen author and review evidence\n\n"
        "This archive preserves the selected author/review packet through 2026-10-31 12:52:30 UTC. "
        "The one-time native state/spec snapshot was copied at 12:51:44 UTC. Exactly 235 coordination rawlog "
        "members are admitted by `CUSTODY-RAWLOG-SELECTION.json`; later N2/N6 and fresh harness outputs are excluded. "
        "Seventeen original E-/XR- receipts and reports are preserved, with repair originals retained under "
        "`project/compiled-children/coordination/repairs/*/originals/`. Current source trees captured during packet "
        "preparation are separately identified in `CONTENT-INVENTORY.json`; they may reflect later separately reviewed "
        "source changes, which remain mapped to their preserved originals.\n\n"
        "The original audit helper SHA pinned by E-ORACLE, `7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e`, "
        "was reported unavailable in the superseding custody receipt. The accepted current custody copy with SHA "
        "`f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853` is preserved; no recovery/restoration "
        "of the unavailable original is claimed. Historical XR-ORACLE rawlog byte-count metadata is preserved as written; "
        "the superseding XR-FIX custody receipt records the three actual-size discrepancies.\n\n"
        "This is a preservation packet, not a final acceptance result. The first verified archive is retained as "
        "a superseded artifact because its rawlog selection was broader than this cutoff.\n",
        encoding="utf-8",
    )
    # The old generic receipt map was generated before selection and included
    # non-filesystem JSON paths. Replace it with the explicit artifact map.
    (FINAL / "RECEIPT-PATH-MAP.json").unlink(missing_ok=True)

    print(f"stage={FINAL}")
    print(f"selected_rawlogs={len(keep_rawlogs)}")
    print(f"removed_rawlogs={len(removed_rawlogs)}")
    print(f"receipts={receipt_count} reports={report_count}")
    print(f"removed_receipt_report_members={len(removed_records)}")
    print(f"removed_unselected_demo_files={len(removed_outputs)}")
    print(f"retained_source_files={len(retained)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
