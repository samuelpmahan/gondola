#!/usr/bin/env python3
"""Independently verify the archive-retention metadata supplement."""
from __future__ import annotations

import hashlib
import json
import subprocess
import tarfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
REPO = ROOT.parents[2]
LANE = Path(__file__).resolve().parent
OUT = LANE / "independent-audit.json"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def file_pin(relative: str) -> dict:
    data = (ROOT / relative).read_bytes()
    return {"path": f"compiled-backends/ci/2026-10-31/{relative}",
            "bytes": len(data), "sha256": sha(data)}


def main() -> None:
    author_report = ROOT / "coordination/reports/R-CI-BUILD-RETENTION.md"
    author_receipt = ROOT / "coordination/receipts/R-CI-BUILD-RETENTION.json"
    author_audit = ROOT / "lanes/build/retention/archive-retention-audit.json"
    author_script = ROOT / "lanes/build/retention/verify_archive_retention.py"
    receipt = read_json(author_receipt)
    audit = read_json(author_audit)
    require(receipt["job_id"] == "R-CI-BUILD-RETENTION" and
            receipt["worker"] == "N4" and receipt["outcome"] == "mixed_change",
            "author receipt identity or outcome differs")
    report_data = author_report.read_bytes()
    script_data = author_script.read_bytes()
    audit_data = author_audit.read_bytes()
    receipt_data = author_receipt.read_bytes()
    require(sha(report_data) == receipt["report"]["sha256"] and
            sha(script_data) == receipt["evidence"]["audit_script"]["sha256"] and
            sha(audit_data) == receipt["evidence"]["audit_result"]["sha256"],
            "author report/script/audit pins differ from the receipt")

    primary = read_json(ROOT / "primary-provenance.json")
    provider = read_json(ROOT / "artifact.json")["artifacts"][0]
    retention = read_json(ROOT / "retention.json")
    retained = read_json(ROOT / "retained-index.json")
    index = {row["path"]: row for row in retained}
    require(len(retained) == len(index) == 817 and
            sum(row["bytes"] for row in retained) == 87153279 and
            sha((ROOT / "retained-index.json").read_bytes()) ==
            "7b621030d9d9576db534905af653c62b7a518b344c0dfd0e16f1a96a64e03826",
            "retained index count, unique paths, or byte total differs")

    zip_path = ROOT / "original.zip"
    zip_bytes = zip_path.read_bytes()
    zip_hash = sha(zip_bytes)
    zip_member_errors = []
    with zipfile.ZipFile(zip_path) as archive:
        zip_names = archive.namelist()
        if len(zip_names) != 817 or len(set(zip_names)) != 817 or set(zip_names) != set(index):
            zip_member_errors.append("member_names_or_count")
        for name, expected in index.items():
            if name not in set(zip_names):
                zip_member_errors.append(name)
                continue
            member_data = archive.read(name)
            extracted = ROOT / "extracted" / name
            if (len(member_data) != expected["bytes"] or sha(member_data) != expected["sha256"] or
                    not extracted.is_file() or extracted.read_bytes() != member_data):
                zip_member_errors.append(name)
    zip_matches = (len(zip_bytes) == 14931201 == primary["artifactZipBytes"] ==
                   provider["size_in_bytes"] == retention["providerZipBytes"] and
                   zip_hash == "646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa" ==
                   primary["artifactZipSha256"] == retention["providerZipSha256"] and
                   provider["digest"] == f"sha256:{zip_hash}" and
                   provider["id"] == primary["artifact"] == 13025112465 and
                   provider["workflow_run"]["id"] == primary["run"] == 41155530877)
    require(zip_matches and not zip_member_errors,
            f"provider ZIP or extracted-member verification differs: {zip_member_errors[:3]}")

    tar_path = ROOT / "ci-artifacts.tar.xz"
    tar_bytes = tar_path.read_bytes()
    tar_hash = sha(tar_bytes)
    tar_names = []
    tar_nonfiles = []
    tar_member_errors = []
    tar_member_bytes = 0
    with tarfile.open(tar_path, "r:xz") as archive:
        for member in archive.getmembers():
            if not member.isfile():
                tar_nonfiles.append(member.name)
                continue
            tar_names.append(member.name)
            stream = archive.extractfile(member)
            member_data = stream.read() if stream else b""
            tar_member_bytes += len(member_data)
            expected = index.get(member.name)
            if expected is None or len(member_data) != expected["bytes"] or sha(member_data) != expected["sha256"]:
                tar_member_errors.append(member.name)
    tar_matches = (len(tar_bytes) == 5217080 == retention["archiveBytes"] and
                   tar_hash == "91b781500ff5379cf118918f545b6593969cb28d5495014b68c9a3ea6ca9218d" ==
                   retention["archiveSha256"] and retention["archive"] == "ci-artifacts.tar.xz" and
                   retention["providerMembers"] == retention["retainedMembers"] == 817 and
                   retention["retainedBytes"] == tar_member_bytes == 87153279 and
                   len(tar_names) == len(set(tar_names)) == 817 and set(tar_names) == set(index) and
                   not tar_nonfiles and not tar_member_errors)
    require(tar_matches, "readable tar archive differs from its separately verified index")

    ignored = subprocess.run(
        ["git", "check-ignore", "-v", "--", "compiled-backends/ci/2026-10-31/original.zip"],
        cwd=REPO, capture_output=True, text=True, check=False)
    tracked = subprocess.run(
        ["git", "ls-files", "--", "compiled-backends/ci/2026-10-31/original.zip",
         "compiled-backends/ci/2026-10-31/ci-artifacts.tar.xz"],
        cwd=REPO, capture_output=True, text=True, check=False)
    tar_status = subprocess.run(
        ["git", "status", "--short", "--untracked-files=all", "--",
         "compiled-backends/ci/2026-10-31/ci-artifacts.tar.xz"],
        cwd=REPO, capture_output=True, text=True, check=False)
    zip_ignored = ignored.returncode == 0 and "original.zip" in ignored.stdout
    tracked_paths = tracked.stdout.splitlines()
    require(zip_ignored and "original.zip" in ignored.stdout and not tracked_paths and
            tar_status.stdout.strip() == "?? compiled-backends/ci/2026-10-31/ci-artifacts.tar.xz",
            "current ZIP ignore / archive tracked-status evidence differs")

    preserved = audit["preservedConsumedPacketPins"]
    preserved_now = {}
    for key, expected in preserved.items():
        current = file_pin(expected["path"].removeprefix("compiled-backends/ci/2026-10-31/"))
        require(current["bytes"] == expected["bytes"] and current["sha256"] == expected["sha256"],
                f"consumed packet changed since author audit: {key}")
        preserved_now[key] = current
    require(len(preserved_now) == 5, "expected five preserved consumed build packets")

    require(audit["status"] == "passed" and
            audit["providerZip"]["sha256"] == zip_hash and
            audit["readableTarCopy"]["sha256"] == tar_hash and
            audit["readableTarCopy"]["gitTracked"] is False and
            audit["oldContraryStatement"]["reportLines"] == [8, 69],
            "author machine audit does not align with independent recomputation")

    result = {
        "schema": "gobi.archive-retention-review/v1",
        "decision": "accepted",
        "authorPacket": {
            "worker": "N4", "job": "R-CI-BUILD-RETENTION", "outcome": "mixed_change",
            "report": {"path": "compiled-backends/ci/2026-10-31/coordination/reports/R-CI-BUILD-RETENTION.md",
                       "bytes": len(report_data), "sha256": sha(report_data)},
            "receipt": {"path": "compiled-backends/ci/2026-10-31/coordination/receipts/R-CI-BUILD-RETENTION.json",
                        "bytes": len(receipt_data), "sha256": sha(receipt_data)},
            "auditScript": {"path": "compiled-backends/ci/2026-10-31/lanes/build/retention/verify_archive_retention.py",
                            "bytes": len(script_data), "sha256": sha(script_data)},
            "auditResult": {"path": "compiled-backends/ci/2026-10-31/lanes/build/retention/archive-retention-audit.json",
                            "bytes": len(audit_data), "sha256": sha(audit_data), "status": audit["status"]}},
        "source": {"head": primary["sourceHead"], "tree": primary["sourceTree"],
                   "run": primary["run"], "job": primary["job"], "artifact": primary["artifact"]},
        "providerZip": {"path": "compiled-backends/ci/2026-10-31/original.zip",
                        "bytes": len(zip_bytes), "sha256": zip_hash, "uniqueMembers": len(zip_names),
                        "allMembersMatchIndex": not zip_member_errors,
                        "extractedFilesMatchZip": True, "gitIgnored": True, "gitTracked": False},
        "readableTar": {"path": "compiled-backends/ci/2026-10-31/ci-artifacts.tar.xz",
                        "bytes": len(tar_bytes), "sha256": tar_hash, "regularMembers": len(tar_names),
                        "nonregularMembers": len(tar_nonfiles), "memberBytes": tar_member_bytes,
                        "allMembersMatchIndex": not tar_member_errors, "gitTracked": False,
                        "gitStatus": tar_status.stdout.strip()},
        "retainedIndex": {"entries": len(index), "bytes": sum(row["bytes"] for row in retained),
                          "sha256": sha((ROOT / "retained-index.json").read_bytes())},
        "unchangedConsumedPackets": preserved_now,
        "limits": ["ZIP and tar containers were checked independently against the member index; container byte identity is not claimed.",
                   "The ZIP is Git-ignored/untracked; the tar is present but untracked at review time; root publication is pending.",
                   "No source, CI, build, or test rerun occurred; no changes were made outside this review lane and its report/receipt."],
    }
    OUT.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"decision": result["decision"], "zipBytes": len(zip_bytes), "tarBytes": len(tar_bytes),
                      "zipMembers": len(zip_names), "tarMembers": len(tar_names),
                      "tarMemberBytes": tar_member_bytes, "untrackedTar": tar_status.stdout.strip(),
                      "result": str(OUT)}, sort_keys=True))


if __name__ == "__main__":
    main()
