#!/usr/bin/env python3
"""Verify the immutable N4 terminal current-source run/job catalog and primary artifact bindings."""

import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path.cwd()
CATALOG_REL = pathlib.Path("compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/source-60b5aeff-terminal-runs-jobs-20261031T111444Z-v2.json")
SOURCE_COMMIT = "60b5aeff3172837ad7831c2b78b210454a3d81a2"
SOURCE_TREE = "cc3a129b4372d00d5168135aa2e5687dfbf6788f"
PRIMARY_RUN = 41193504188
PRIMARY_JOB = 124514913013


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: pathlib.Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(data, dict), f"not an object: {path}"
    return data


def main() -> None:
    catalog_path = ROOT / CATALOG_REL
    catalog_bytes = catalog_path.read_bytes()
    catalog = json.loads(catalog_bytes)
    assert catalog.get("schema") == "gobi.compiled-capabilities-terminal-provider-catalog/v1"
    assert catalog.get("repository") == "samuelpmahan/gondola"
    assert catalog.get("source", {}).get("commit") == SOURCE_COMMIT
    assert catalog.get("source", {}).get("tree") == SOURCE_TREE
    assert catalog.get("source", {}).get("parent") == "a2e1164d68abaaa7d028bdaf6a20bea842a131ae"
    assert catalog.get("runCount") == 30 and catalog.get("jobCount") == 30
    assert catalog.get("eventCounts") == {"pull_request": 15, "push": 15}
    assert catalog.get("runStatusCounts") == {"completed:success": 30}
    assert catalog.get("jobStatusCounts") == {"completed:success": 30}
    for flag in ("allRunHeadShasMatchSource", "allRunsTerminal", "allRunsConcludedSuccess", "allJobsConcludedSuccess", "sourceCohortGreen"):
        assert catalog.get(flag) is True, f"catalog gate false: {flag}"

    run_list_pin = catalog["runListResponse"]
    run_list_path = ROOT / run_list_pin["path"]
    assert run_list_path.stat().st_size == run_list_pin["bytes"]
    assert sha(run_list_path) == run_list_pin["sha256"]

    rows = catalog.get("runs", [])
    assert len(rows) == 30
    primary = None
    for row in rows:
        assert row.get("headSha") == SOURCE_COMMIT
        assert row.get("status") == "completed" and row.get("conclusion") == "success"
        assert row.get("event") in ("push", "pull_request")
        job_pin = row["jobSnapshot"]
        job_path = ROOT / job_pin["path"]
        assert job_path.stat().st_size == job_pin["bytes"]
        assert sha(job_path) == job_pin["sha256"]
        jobs_obj = load(job_path)
        jobs = jobs_obj.get("jobs", [])
        assert len(jobs) == job_pin["jobCount"] == 1
        assert all(job.get("status") == "completed" and job.get("conclusion") == "success" for job in jobs)
        assert all(step.get("status") == "completed" and step.get("conclusion") == "success"
                   for job in jobs for step in job.get("steps", []))
        if row.get("id") == PRIMARY_RUN:
            primary = row
    assert primary is not None
    assert primary.get("event") == "push" and primary.get("runNumber") == 3
    assert primary.get("headSha") == SOURCE_COMMIT
    primary_job = primary["jobSnapshot"]["jobs"][0]
    assert primary_job.get("id") == PRIMARY_JOB and primary_job.get("runId") == PRIMARY_RUN
    assert primary_job.get("name") == "compiled-capabilities"

    provider = ROOT / "compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider"
    artifact_meta_path = provider / "primary-push-run-41193504188-artifacts-20261031T110351Z.json"
    artifact_meta = load(artifact_meta_path)
    artifacts = artifact_meta.get("artifacts", [])
    assert len(artifacts) == 1
    artifact = artifacts[0]
    assert artifact.get("id") == 13040129310
    assert artifact.get("name") == "gobi-compiled-capabilities-artifacts"
    assert artifact.get("workflow_run", {}).get("id") == PRIMARY_RUN
    assert artifact.get("workflow_run", {}).get("head_sha") == SOURCE_COMMIT

    outer_path = provider / "primary-push-run-41193504188-outer-verification.json"
    outer = load(outer_path)
    zip_path = provider / "primary-push-run-41193504188-artifact.zip"
    assert outer.get("artifact_id") == artifact["id"] and outer.get("run_id") == PRIMARY_RUN
    assert outer.get("provider_expected_bytes") == artifact.get("size_in_bytes") == zip_path.stat().st_size
    expected_zip_sha = artifact.get("digest", "").removeprefix("sha256:")
    assert outer.get("provider_expected_sha256") == expected_zip_sha == sha(zip_path)
    assert outer.get("observed_bytes") == zip_path.stat().st_size
    assert outer.get("observed_sha256") == sha(zip_path)
    assert outer.get("all_members_crc_and_sha_verified") is True
    assert outer.get("safe_paths_and_regular_types_only") is True

    inner_path = provider / "primary-push-run-41193504188-inner-verification.json"
    inner = load(inner_path)
    assert inner.get("receipt_status") == "passed" and inner.get("receipt_mode") == "full"
    assert inner.get("receipt_failures") == 0 and inner.get("receipt_source_pins_match") is True
    assert inner.get("tar_verified_file_count") == inner.get("manifest_file_count") == 189
    assert inner.get("tar_members_match_manifest") is True
    assert inner.get("gzip_consumed_to_eof_and_trailer_valid") is True
    assert inner.get("source_pin_sets_identical") is True
    assert inner.get("archive_sha256") == "ba17805387c8204ef2624caec0af35641771bc8af48d4f03b82c1a6609586d8f"
    assert inner.get("archive_bytes") == 14960460
    assert inner.get("receipt_sha256") == "f091b4814b377210bafd54ca1922bf7f129c160b5393f6ef0957e3018efb59c4"
    assert inner.get("attempt") == "compiled-capabilities/builds/attempts/attempt-20261031T103752934Z"

    primary_verification_path = ROOT / "compiled-capabilities/ci/2026-10-31/source-60b5aef/demo/primary-archive-verification/stdout.json"
    primary_verification = load(primary_verification_path)
    assert primary_verification.get("status") == "verified" and primary_verification.get("completeAcceptance") is True
    assert primary_verification.get("archive", {}).get("sha256") == inner.get("archive_sha256")
    assert primary_verification.get("memberCount") == 189 and primary_verification.get("sourcePinCount") == 163

    result = {
        "schema": "gobi.current-source-terminal-ci-audit/v1",
        "status": "passed",
        "source": catalog["source"],
        "catalog": {"path": str(CATALOG_REL), "bytes": len(catalog_bytes), "sha256": sha256_bytes(catalog_bytes),
                    "retrievedAt": catalog.get("retrievedAt"), "runCount": catalog["runCount"],
                    "jobCount": catalog["jobCount"], "pushRuns": 15, "pullRequestRuns": 15,
                    "allTerminalSuccess": True},
        "primary": {"run": PRIMARY_RUN, "job": PRIMARY_JOB, "event": "push", "conclusion": "success",
                    "artifact": artifact["id"], "zipBytes": zip_path.stat().st_size,
                    "zipSha256": sha(zip_path), "outerArtifactVerified": True,
                    "innerArchiveVerified": True, "eBuildReceiptSha256": inner["receipt_sha256"],
                    "innerArchiveSha256": inner["archive_sha256"], "innerArchiveBytes": inner["archive_bytes"],
                    "memberCount": 189, "sourcePinCount": 163, "completeModePassed": True},
        "evidence": {
            "runListResponse": {"path": run_list_pin["path"], "bytes": run_list_pin["bytes"], "sha256": run_list_pin["sha256"]},
            "outerVerification": {"path": str(outer_path.relative_to(ROOT)), "sha256": sha(outer_path)},
            "innerVerification": {"path": str(inner_path.relative_to(ROOT)), "sha256": sha(inner_path)},
            "completeArchiveVerification": {"path": str(primary_verification_path.relative_to(ROOT)), "sha256": sha(primary_verification_path)},
        },
        "limitations": [
            "This audit validates the current-source terminal catalog and authoritative primary archive; local-container integrity is reported separately.",
            "This is demo acceptance evidence only; other independent reviews and root-owned native/delivery gates remain separate.",
        ],
    }
    out = ROOT / "compiled-capabilities/ci/2026-10-31/source-60b5aef/demo/terminal-catalog-audit.json"
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"status": "passed", "catalogSha256": result["catalog"]["sha256"], "runs": 30, "jobs": 30,
                      "primaryRun": PRIMARY_RUN, "artifact": artifact["id"], "output": str(out.relative_to(ROOT))}, indent=2))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - bounded evidence CLI.
        print(json.dumps({"status": "failed", "error": f"{type(exc).__name__}: {exc}"}, sort_keys=True), file=sys.stderr)
        raise
