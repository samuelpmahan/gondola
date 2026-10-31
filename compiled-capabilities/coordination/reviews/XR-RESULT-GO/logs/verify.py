#!/usr/bin/env python3
"""Read-only cross-check for N1's partial E-RESULT-GO evidence."""
from __future__ import annotations

import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[5]
COORD = ROOT / "compiled-capabilities/coordination"
LANE = ROOT / "compiled-capabilities/ci/2026-10-31/lanes/go"


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check(test: str, condition: bool, detail: str) -> dict:
    if not condition:
        raise AssertionError(f"{test}: {detail}")
    return {"check": test, "passed": True, "detail": detail}


def main() -> None:
    lane_path = LANE / "completed-inherited-ci.json"
    lane = json.loads(lane_path.read_text())
    report_path = COORD / "reports/E-RESULT-GO.md"
    receipt_path = COORD / "receipts/E-RESULT-GO.json"
    report = report_path.read_text()
    receipt = json.loads(receipt_path.read_text())
    binding = json.loads((COORD / "publication-binding.json").read_text())
    ebuild_receipt = json.loads((COORD / "receipts/E-BUILD.json").read_text())
    checks = []

    checks.append(check(
        "receipt-source-pins",
        all(digest(ROOT / path) == expected for path, expected in receipt["source_sha256"].items()),
        "the report and completed-inherited-ci.json hashes match the N1 receipt",
    ))
    cited_values = [
        "a2e1164d68abaaa7d028bdaf6a20bea842a131ae",
        "d22b75e18c7bea70a743cc79d53461b287c7d045",
        "d6dc8b2201d79eeab1f21cbfe62a93235c9740889b511cdfee55493766ec3692",
        "7f76b8b7dd79bf68bed24295db2bc40760bed241e080c91daddf1241c4bd7bcd",
        "8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0",
        "639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2",
        "dd1b8445ef29a3f2e507acca7a4e64c27fe8d4bb7ce446cc22a54e373b11d57a",
        "ceb82b7e2bcbb5f42a4620c3a5076fbe2803aa637b20d622e01096b1de5c1df7",
        "3279277688f3bd8d475a2b6cd91291bfa4cc71dc579c5883ff747cf48673cccd",
        "b83a55b7130700310d67b01689b4d63e7aa495b669a88f23ad3be7226812e671",
        "20261030",
        "10:19:46Z",
    ]
    checks.append(check(
        "report-cited-identities-and-hashes",
        all(value in report for value in cited_values)
        and "status: failed" in report and "does not claim capability acceptance" in report,
        "the narrative contains the source IDs, all cited raw/M0/local hashes, seed, timestamp, and failed/full-status distinction",
    ))
    for job in lane["workflow"]["jobs"]:
        log_path = ROOT / job["log"]
        raw_hash = digest(log_path)
        receipt_hash = receipt["log_sha256"][job["log"]]
        checks.append(check(
            f"{job['event']}-log-hash",
            raw_hash == job["logSha256"] == receipt_hash,
            f"run {job['runId']} job {job['jobId']} log SHA-256 {raw_hash}",
        ))
        text = log_path.read_text(errors="replace")
        expected_identity = job.get("testedCommit", job.get("testedMergeCommit"))
        checks.append(check(
            f"{job['event']}-revision-and-success-metadata",
            job["status"] == "completed" and job["conclusion"] == "success"
            and (expected_identity in text)
            and (job["event"] != "pull_request" or job["pullRequestHead"] == lane["source"]["publishedHead"]),
            f"run metadata says completed/success; raw log contains tested revision {expected_identity}; PR head is bound by run metadata",
        ))
        required_lines = [
            "go version go1.24.13 linux/amd64",
            "v22.23.4",
            "npm: 10.9.9",
            "same over 5000 inputs",
            "receipt matches",
            "SHA256SUMS ok",
            "interaction parity matched 107 scripts over 4473 initial/action ticks (seed 20261030)",
            "native comparator: matched",
            "github.com/samuelpmahan/gondola/compilercontract",
            "github.com/samuelpmahan/gondola/gobi",
        ]
        missing = [line for line in required_lines if line not in text]
        checks.append(check(
            f"{job['event']}-log-content",
            not missing,
            "versions, tests, seeded comparator, M0 receipts/checksums, and interaction parity are present",
        ))

    source = lane["source"]
    checks.append(check(
        "publication-binding",
        binding["remote"]["commit"] == source["publishedHead"]
        and binding["remote"]["tree"] == source["sourceTree"]
        and binding["remote"]["parents"] == [source["base"]]
        and binding["local"]["tree"] == source["localTree"] == source["sourceTree"],
        "local and published heads are bound to the same source tree and direct base parent",
    ))
    run_sh = ROOT / "run.sh"
    run_text = run_sh.read_text()
    checks.append(check(
        "run-sh-source-and-set-e-sequence",
        digest(run_sh) == lane["sourceFiles"]["run.sh"]
        and "set -euo pipefail" in run_text
        and run_text.index("go vet ./...") < run_text.index("go test ./...")
        and "--cases 5000 --seed 20261030" in run_text,
        "the pinned CI script uses set-e, runs go vet before go test, and runs the recorded seeded comparator",
    ))

    rules_path = ROOT / "gobi/rules_test.go"
    rule_hash = digest(rules_path)
    rule_count = len(re.findall(r'^\s*\{"', rules_path.read_text(), re.MULTILINE))
    checks.append(check(
        "static-rule-count",
        rule_count == 59 and rule_hash == lane["checks"]["compatibilityRules"]["sourceSha256"],
        f"59 literal rule entries; SHA-256 {rule_hash}. The CI log does not print this static row count.",
    ))

    checksums = ROOT / "SHA256SUMS"
    expected = ROOT / "EXPECTED.json"
    checks.append(check(
        "m0-source-digests",
        digest(checksums) == lane["checks"]["m0Checks"]["checksumManifestSha256"]
        and digest(expected) == lane["checks"]["m0Checks"]["expectedJsonSha256"],
        "the checked-in checksum manifest and EXPECTED.json match the recorded hashes",
    ))

    full_path = ROOT / lane["localFullRunFinal"]["execution"]
    full_hash = digest(full_path)
    full = json.loads(full_path.read_text())
    canonical_before = hashlib.sha256(json.dumps(full["sourceBefore"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    canonical_after = hashlib.sha256(json.dumps(full["sourceAfter"], sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    lifecycle_path = ROOT / lane["localFullRunFinal"]["nestedLifecycle"]["execution"]
    methods_path = ROOT / lane["localFullRunFinal"]["nestedMethods"]["execution"]
    lifecycle = json.loads(lifecycle_path.read_text())
    methods = json.loads(methods_path.read_text())
    expected_failure = lane["localFullRunFinal"]["failedStage"]
    checks.append(check(
        "local-full-failure-and-source-pins",
        full_hash == lane["localFullRunFinal"]["executionSha256"]
        and full["status"] == "failed" and full["mode"] == "full"
        and ebuild_receipt["sourcePinsMatch"] is True
        and len(full["sourceBefore"]) == len(full["sourceAfter"]) == 161
        and canonical_before == canonical_after == lane["localFullRunFinal"]["canonicalSourceBeforeSha256"]
        and any(row.get("name", "").removeprefix("stage:") == expected_failure["name"] and row.get("error") == expected_failure["error"] for row in full["failures"]),
        f"local full receipt is failed at {expected_failure['name']} with 161/161 matching pins; SHA-256 {full_hash}",
    ))
    checks.append(check(
        "nested-lifecycle-and-methods-status",
        digest(lifecycle_path) == lane["localFullRunFinal"]["nestedLifecycle"]["executionSha256"]
        and lifecycle["status"] == "passed"
        and lifecycle["inheritedRun"]["status"] == "passed"
        and lifecycle["inheritedRun"]["finalOutputLine"] == "compiled-methods: passed (full)"
        and digest(methods_path) == lane["localFullRunFinal"]["nestedMethods"]["executionSha256"]
        and methods["status"] == "passed",
        "nested lifecycle and methods receipts passed; the outer failed gate's phrase mismatch is accurately separated",
    ))
    checks.append(check(
        "partial-not-final-acceptance",
        receipt["outcome"] == "insufficient_evidence"
        and "does not claim capability acceptance" in report
        and lane["localFullRunFinal"]["status"] == "failed"
        and all(row["status"] == "in_progress" for row in lane["workflow"]["primaryCapabilityRuns"]),
        "N1 distinguishes passed inherited CI from failed local full run and the hosted capability status as of 10:19:46Z",
    ))

    output = {
        "schema": "gobi.e-result-go-independent-review-checks/v1",
        "job_id": "XR-RESULT-GO",
        "reviewed_job": "E-RESULT-GO",
        "checks": checks,
        "all_passed": all(item["passed"] for item in checks),
        "captured_primary_capability_status_at": "2026-10-31T10:19:46Z",
        "no_suites_rerun": True,
    }
    out = pathlib.Path(__file__).resolve().parent / "verification.json"
    out.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"out": str(out.relative_to(ROOT)), "checkCount": len(checks), "allPassed": output["all_passed"]}, indent=2))


if __name__ == "__main__":
    main()
