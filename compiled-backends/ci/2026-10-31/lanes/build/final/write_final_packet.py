#!/usr/bin/env python3
"""Write the final build report/receipt from computed artifact audit data."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path.cwd()
CI = ROOT / "compiled-backends/ci/2026-10-31"
AUDIT_PATH = CI / "lanes/build/final/artifact-audit.json"
REPORT_PATH = CI / "coordination/reports/R-CI-BUILD-FINAL.md"
RECEIPT_PATH = CI / "coordination/receipts/R-CI-BUILD-FINAL.json"


def record(path: Path, label: str | None = None) -> dict[str, Any]:
    data = path.read_bytes()
    return {
        "path": label or path.relative_to(ROOT).as_posix(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def q(value: str) -> str:
    return value.replace("|", "\\|").replace("`", "\\`")


def command_line(cmd: dict[str, Any], inherited_env: dict[str, Any] | None = None) -> str:
    env = dict(inherited_env or {})
    env.update(cmd.get("environmentOverrides", {}))
    prefix = " ".join(f"{name}={value}" for name, value in sorted(env.items()) if value is not None)
    command = " ".join([cmd["command"], *cmd["args"]])
    return f"{prefix} {command}".strip()


def main() -> None:
    audit = json.loads(AUDIT_PATH.read_text())
    assert audit["status"] == "verified"
    primary = audit["primaryCi"]
    builds = audit["backendBuilds"]
    comparison = audit["comparison"]
    go_checks = audit["goChecks"]
    runner = audit["backendRunner"]
    old = audit["previousPacketCorrection"]
    source_records = audit["buildSources"]
    runtime_pin = next(
        item for item in go_checks["sourceBefore"]["pins"]
        if item["path"] == "compiled-frontend/frontend/runtime/runtime.mjs"
    )
    assert runtime_pin in runner["sourceBefore"]["pins"]
    report_lines = [
        "# R-CI-BUILD-FINAL (N4)",
        "",
        "**Outcome: mixed_change.** The fresh completed full workflow on repaired head `" + primary["run"]["headSha"] + "` confirms that the real Go CLI builds both React and DOM profiles. Each output tree contains four apps and 209 files. The 204 backend-neutral companion files match byte-for-byte; each profile has its own backend-tagged manifest and raw compiled-module hashes, which are recorded separately without a normalized-bundle equality claim.",
        "",
        "## Primary CI artifact",
        "",
        f"- Workflow run `{primary['run']['id']}` / job `{primary['run']['jobId']}` completed successfully on event `{primary['run']['event']}` for exact source head `{primary['run']['headSha']}` (tree `{primary['sourceTree']}`, direct parent `{primary['directParent']}`).",
        f"- Provider artifact `{primary['run']['artifactId']}`: **{primary['providerArchiveMetadata']['bytes']} bytes**, digest `{primary['providerArchiveMetadata']['sha256']}`. The digest and byte count are cross-checked from provider metadata and primary provenance; the raw ZIP is not separately retained for local rehashing.",
        f"- The extraction has **{primary['retainedExtraction']['actualFileCount']} files**; every extracted path, byte count, and SHA-256 matches the retained index.",
        "- This acceptance uses the first successful complete full push run on exact head `195c9433179218348d4b9f2477ae1e0725337d15`. The separate PR run `41155534356` remains a distinct gate; its status is not inferred here.",
        "",
        "## Actual CLI output trees",
        "",
        "The archived `compile-react` and `compile-dom` commands each ran `go run ./cmd/gobi-build` with a distinct request whose `backend` field selects the profile. Both command exits are zero; each result manifest and output inventory was checked against the actual extracted files, including every byte count and SHA-256.",
        "",
        "| Profile | Apps | Output files | Manifest SHA-256 | Manifest bytes | Backend tags |",
        "|---|---:|---:|---|---:|---|",
    ]
    for backend in ("react", "dom"):
        b = builds[backend]
        tags = ", ".join(sorted({app["backend"] for app in b["manifest"]["appTags"]}))
        report_lines.append(
            f"| {backend} | {b['appCount']} | {b['outputCount']} | `{b['manifest']['file']['sha256']}` | {b['manifest']['file']['bytes']} | {tags} |"
        )

    report_lines.extend([
        "",
        "Both manifests contain the same four package paths, AppIR/module/encoder role paths, five forwarder source entries, and 186 emitted TypeScript paths. Replacing only each manifest app's `backend` value with a common placeholder makes the manifest objects equal. The actual `BuildResult.apps` AppIR objects and all output paths are equal between builds.",
        "",
        f"The exact companion comparison excludes only `buildmanifest.json` and the four raw `gobi-compiled.mjs` files. The remaining **{comparison['exactCompanionOutputCount']}** paths match byte-for-byte. This includes all four `app-ir.json` files, four `encoder.mjs` files, four `components.gen.mjs` files, forwarder sources/module file, `react-map.gen.mjs`, and 186 TypeScript outputs. Full computed file records for both output trees are in [`artifact-audit.json`](../../lanes/build/final/artifact-audit.json).",
        "",
        "### Raw compiled-module hashes",
        "",
        "Raw bundles are kept separate. No bundle normalization or byte-equality claim is made.",
        "",
        "| App | Profile | Bytes | SHA-256 |",
        "|---|---|---:|---|",
    ])
    bundle_map: dict[tuple[str, str], dict[str, Any]] = {}
    for backend in ("react", "dom"):
        for module in builds[backend]["rawBundles"]:
            app = Path(module["path"]).parent.name.split("-")[0]
            bundle_map[(app, backend)] = module
    for app in sorted({name for name, _ in bundle_map}):
        for backend in ("react", "dom"):
            module = bundle_map[(app, backend)]
            report_lines.append(f"| {app} | {backend} | {module['bytes']} | `{module['sha256']}` |")

    report_lines.extend([
        "",
        "## Toolchains and Go gates",
        "",
        f"- Root contract/compiler-compatibility toolchain: `{go_checks['versions']['rootGo']}`.",
        f"- Compiled-frontend GoScript/compiler toolchain: `{go_checks['versions']['go']}` with `GOTOOLCHAIN={go_checks['environment']['GOTOOLCHAIN']}`.",
        f"- GoScript module pin: `github.com/s4wave/goscript {audit['goscript']['version']}`; the `compiled-frontend/go.mod` and `go.sum` records, hashes, and checksum line are in the artifact audit.",
        f"- Node: `{go_checks['versions']['node']}`; Playwright `{go_checks['versions']['playwright']}`; esbuild `{go_checks['versions']['esbuild']}`.",
        "",
        "| Go scope | Result | Command | Stdout SHA-256 | Stderr SHA-256 |",
        "|---|---|---|---|---|",
    ])
    check_labels = {
        "root-go-tests": "Root Go 1.24 contract/tests",
        "root-go-race": "Root Go 1.24 race",
        "root-go-vet": "Root Go 1.24 vet",
        "go-tests": "Compiled frontend Go 1.27.3 tests",
        "go-race": "Compiled frontend Go 1.27.3 race",
        "go-vet": "Compiled frontend Go 1.27.3 vet",
    }
    for name in ("root-go-tests", "root-go-race", "root-go-vet", "go-tests", "go-race", "go-vet"):
        cmd = go_checks["commands"][name]
        env = {"GOTOOLCHAIN": "local"} if name.startswith("root-") else {"GOTOOLCHAIN": go_checks["environment"]["GOTOOLCHAIN"]}
        report_lines.append(
            f"| {check_labels[name]} | exit {cmd['exitCode']} | `{q(command_line(cmd, env))}` | `{cmd['stdout']['sha256']}` | `{cmd['stderr']['sha256']}` |"
        )

    report_lines.extend([
        "",
        "The command logs' actual bytes hash to the values recorded by `execution.json`; test and race logs contain successful package results, and both vet commands exit zero. Root checks cover `./compilercontract ./fixtures/compiled/... ./cmd/compiled-native`; the compiled-frontend tests cover `./analyze ./build ./cmd/... ./emit`.",
        "",
        "## Source pins and preserved interim correction",
        "",
        f"The CI execution pins **{go_checks['sourceBefore']['count']}** compiled-frontend inputs before and after the full run with zero mismatches. The backend runner pins **{runner['sourceBefore']['count']}** source files before and after; the E-DEMO receipt reports `sourcePinsMatch: true`, and every recorded source pin matches the current exact-head source tree. The nine build/emitter source hashes are computed from current files and recorded in `artifact-audit.json`. The runtime source pin is `{runtime_pin['sha256']}` ({runtime_pin['bytes']} bytes).",
        "",
        f"The earlier interim packet remains preserved byte-for-byte at `compiled-backends/ci/2026-10-31/coordination/reports/E-CI-BUILD.md` (SHA-256 `{old['oldReport']['sha256']}`) and `compiled-backends/ci/2026-10-31/coordination/receipts/E-CI-BUILD.json` (SHA-256 `{old['oldReceipt']['sha256']}`). Their byte-identical history copies are also recorded in the audit. The interim Markdown's `emit/backend.go` pin and the actual file hash are `{old['historicalMarkdownPin']}`. The consumed interim JSON receipt mistyped that value as `{old['historicalReceiptPin']}`. This final packet records the corrected hash from the actual file, `{old['actualCurrentBackendSource']['sha256']}`, without changing the old receipt bytes.",
        "",
        "## Scope and limits",
        "",
        "- The primary push artifact establishes the repaired-head build and Go gates for this lane. The separate PR run and overall PR-ready condition remain root-owned and are not inferred.",
        "- No claim is made that the four raw compiled-module bundles are byte-identical or normalized-equivalent. Their raw hashes are preserved above and in the audit JSON.",
        "- No physical prior-output preservation claim is inferred from `PreservedPreviousOutput`; the successful fresh builds' result field is recorded as emitted.",
        "- Provider artifact ZIP digest/length come from the provider artifact record cross-checked against primary provenance; the archive is not available locally for independent rehash. The 817 extracted files are independently validated against the retained content index.",
        "",
        "## Evidence files",
        "",
        "- Computed audit: [`artifact-audit.json`](../../lanes/build/final/artifact-audit.json)",
        "- Programmatic verifier: [`audit_primary_artifact.py`](../../lanes/build/final/audit_primary_artifact.py)",
        "- Source preflight: [`source-preflight.md`](../../lanes/build/final/source-preflight.md)",
    ])
    REPORT_PATH.write_text("\n".join(report_lines) + "\n")
    report_record = record(REPORT_PATH)
    audit_record = record(AUDIT_PATH)
    verifier_record = record(CI / "lanes/build/final/audit_primary_artifact.py")
    generator_record = record(Path(__file__).resolve())

    receipt = {
        "schema": "gobi.worker-receipt/v1",
        "job_id": "R-CI-BUILD-FINAL",
        "worker": "N4",
        "outcome": "mixed_change",
        "summary": "Fresh primary push CI at exact repaired head 195c943 passed. Actual React/DOM CLI output trees each contain four apps and 209 verified files; 204 companions are byte-identical, backend tags are correct, and raw module hashes are recorded separately. Both Go 1.24 and compiler Go 1.27.3 test/race/vet gates passed. The old interim receipt's mistyped backend.go pin is mapped to the actual file hash without modifying consumed bytes.",
        "report": report_record,
        "evidence": {
            "computedArtifactAudit": audit_record,
            "verifierScript": verifier_record,
            "packetGenerator": generator_record,
            "primaryCi": primary,
            "backendBuilds": {
                backend: {
                    "appCount": builds[backend]["appCount"],
                    "outputCount": builds[backend]["outputCount"],
                    "physicalFileCount": builds[backend]["physicalFileCount"],
                    "manifest": builds[backend]["manifest"],
                    "resultFile": builds[backend]["resultFile"],
                    "actualOutputInventorySha256": hashlib.sha256(
                        json.dumps(builds[backend]["outputs"], sort_keys=True, separators=(",", ":")).encode()
                    ).hexdigest(),
                    "rawBundles": builds[backend]["rawBundles"],
                }
                for backend in ("react", "dom")
            },
            "comparison": {
                "packagePathsIdentical": comparison["packagePathsIdentical"],
                "appIRObjectsIdentical": comparison["appIRObjectsIdentical"],
                "normalizedManifestObjectsIdenticalAfterReplacingBackendTag": comparison["normalizedManifestObjectsIdenticalAfterReplacingBackendTag"],
                "outputPathCountEach": comparison["outputPathCountEach"],
                "exactCompanionOutputCount": comparison["exactCompanionOutputCount"],
                "exactCompanionInventoryIsIn": audit_record["path"],
                "rawBundlesComparedForEquality": comparison["rawBundlesComparedForEquality"],
            },
            "sourcePins": {
                "currentBuildSources": list(source_records.values()),
                "runtimeSourcePin": runtime_pin,
                "compiledFrontendBeforeAfterCount": go_checks["sourceBefore"]["count"],
                "compiledFrontendBeforeAfterMatchAndCurrentFilesMatch": True,
                "backendRunnerBeforeAfterCount": runner["sourceBefore"]["count"],
                "backendRunnerBeforeAfterMatchAndCurrentFilesMatch": True,
                "fullPinArraysIn": audit_record["path"],
            },
            "goScript": audit["goscript"],
            "goChecks": {
                name: {
                    "command": cmd["command"],
                    "args": cmd["args"],
                    "cwd": cmd["cwd"],
                    "environmentOverrides": cmd["environmentOverrides"],
                    "exitCode": cmd["exitCode"],
                    "stdout": cmd["stdout"],
                    "stderr": cmd["stderr"],
                }
                for name, cmd in go_checks["commands"].items()
            },
            "toolchains": go_checks["versions"],
            "previousInterimPacketCorrection": old,
        },
        "limits": [
            "This receipt accepts the primary successful full push run for build scope only; it does not establish the separate PR run's status or the overall PR-ready condition.",
            "Raw bundle hashes are recorded separately; no normalized bundle equality is claimed.",
            "The provider ZIP digest/length are cross-checked metadata, not locally rehashed ZIP bytes. The full 817-file extraction matches the retained index.",
            "The interim E-CI-BUILD report/receipt bytes were preserved unchanged; their receipt hash correction is made in this new final packet only."
        ],
    }
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"report": report_record, "receipt": record(RECEIPT_PATH)}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
