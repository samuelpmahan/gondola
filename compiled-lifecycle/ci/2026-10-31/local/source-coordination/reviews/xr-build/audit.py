#!/usr/bin/env python3
"""Independent, read-only verification of the E-BUILD lifecycle evidence."""
from __future__ import annotations

import hashlib
import json
import pathlib
import posixpath
import subprocess
import sys
import tarfile

ROOT = pathlib.Path(__file__).resolve().parents[4]
OUT = pathlib.Path(__file__).with_name("audit.json")


def read_json(path: str | pathlib.Path):
    return json.loads((ROOT / path).read_text())


def digest(path: str | pathlib.Path) -> str:
    h = hashlib.sha256()
    with (ROOT / path).open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def bytes_digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def checked_pins(pins: list[dict], commit: str) -> dict:
    missing, working_mismatch, commit_mismatch = [], [], []
    for item in pins:
        path = ROOT / item["path"]
        if not path.is_file():
            missing.append(item["path"])
            continue
        data = path.read_bytes()
        sha = bytes_digest(data)
        if sha != item["sha256"] or len(data) != item.get("bytes", len(data)):
            working_mismatch.append(item["path"])
        blob = subprocess.run(
            ["git", "cat-file", "blob", f"{commit}:{item['path']}"],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if blob.returncode or bytes_digest(blob.stdout) != item["sha256"] or len(blob.stdout) != item.get("bytes", len(blob.stdout)):
            commit_mismatch.append(item["path"])
    return {
        "count": len(pins),
        "missing_current": missing,
        "current_mismatches": working_mismatch,
        "published_commit_mismatches": commit_mismatch,
        "all_current_match": not missing and not working_mismatch,
        "all_match_published_commit": not commit_mismatch,
    }


def verify_archive(archive_path: str, manifest_path: str) -> dict:
    manifest = read_json(manifest_path)
    expected = {x["path"]: x for x in manifest["members"]}
    errors, unsafe, files, dirs, special = [], [], [], [], []
    seen = set()
    total = 0
    with tarfile.open(ROOT / archive_path, "r:gz") as tar:
        for item in tar.getmembers():
            name = item.name
            if name in seen:
                errors.append({"path": name, "error": "duplicate archive entry"})
            seen.add(name)
            normalized = posixpath.normpath(name.rstrip("/"))
            if (
                name.startswith("/")
                or normalized in ("", ".", "..")
                or normalized.startswith("../")
                or any(part in ("", ".", "..") for part in name.rstrip("/").split("/"))
            ):
                unsafe.append(name)
            if item.isdir():
                dirs.append(name)
                continue
            if not item.isfile():
                special.append({"path": name, "type": item.type.decode("ascii", "replace")})
                continue
            files.append(name)
            recorded = expected.get(name)
            if recorded is None:
                errors.append({"path": name, "error": "file absent from manifest"})
                continue
            stream = tar.extractfile(item)
            h = hashlib.sha256()
            size = 0
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                h.update(block)
                size += len(block)
            total += size
            if size != recorded["bytes"] or h.hexdigest() != recorded["sha256"]:
                errors.append({"path": name, "error": "manifest size or hash mismatch"})
    missing_manifest_members = sorted(set(expected) - set(files))
    return {
        "archive_path": archive_path,
        "archive_sha256": digest(archive_path),
        "archive_bytes": (ROOT / archive_path).stat().st_size,
        "manifest_path": manifest_path,
        "manifest_sha256": digest(manifest_path),
        "manifest_file_count": len(expected),
        "tar_regular_files": len(files),
        "tar_directories": len(dirs),
        "tar_special_entries": special,
        "file_member_names_match_manifest": set(files) == set(expected),
        "missing_manifest_members": missing_manifest_members,
        "member_names_unique": len(seen) == len(files) + len(dirs) + len(special),
        "uncompressed_file_bytes_verified": total,
        "unsafe_paths": unsafe,
        "content_errors": errors,
    }


def require(condition: bool, name: str):
    if not condition:
        raise AssertionError(name)


canonical_path = "compiled-lifecycle/coordination/receipts/E-BUILD.json"
canonical_report_path = "compiled-lifecycle/coordination/reports/E-BUILD.md"
canonical = read_json(canonical_path)
attempt = read_json(pathlib.Path(canonical["attempt"]) / "execution.json")
report_hash = digest(canonical_report_path)
require(canonical["mode"] == "lifecycle-only" and canonical["status"] == "passed", "canonical run status")
require(len(canonical["commands"]) == 18 and len(canonical["stages"]) == 13 and not canonical["failures"], "canonical command/stage counts")
require(canonical["sourcePinsMatch"] and canonical["sourceBefore"] == canonical["sourceAfter"], "canonical source pin equality")
require(attempt["sourceBefore"] == canonical["sourceBefore"] and attempt["sourceAfter"] == canonical["sourceAfter"], "canonical and immutable attempt pin snapshots")
require(canonical["report"]["sha256"] == report_hash, "canonical report digest")
require(canonical["promotion"]["sourceReceiptSha256"] == digest(pathlib.Path(canonical["attempt"]) / "execution.json"), "promoted attempt receipt digest")

publication = read_json("compiled-lifecycle/coordination/publication.json")
published_commit = publication["source"]
commit_tree = subprocess.run(
    ["git", "rev-parse", f"{published_commit}^{{tree}}"], cwd=ROOT,
    text=True, stdout=subprocess.PIPE, check=True,
).stdout.strip()
head_tree = subprocess.run(
    ["git", "rev-parse", "HEAD^{tree}"], cwd=ROOT,
    text=True, stdout=subprocess.PIPE, check=True,
).stdout.strip()
require(commit_tree == publication["sourceTree"] == head_tree, "published source tree identity")
lifecycle_pin_check = checked_pins(canonical["sourceBefore"], published_commit)
require(lifecycle_pin_check["all_current_match"] and lifecycle_pin_check["all_match_published_commit"], "lifecycle pins match working tree and published commit")

command_by_name = {x["name"]: x for x in attempt["commands"]}
react_build, dom_build = attempt["builds"]["react"], attempt["builds"]["dom"]
react_command, dom_command = command_by_name["compile-react"], command_by_name["compile-dom"]
runtime_command = command_by_name["lifecycle-compiled-runtime-tests"]
runtime_log = runtime_command["stdoutPath"]
runtime_text = (ROOT / runtime_log).read_text()
require(react_command["exitCode"] == dom_command["exitCode"] == runtime_command["exitCode"] == 0, "fresh build/runtime command exits")
require(react_command["finishedAt"] < dom_command["startedAt"] < dom_command["finishedAt"] < runtime_command["startedAt"], "fresh React and DOM builds precede runtime tests")
app_dir = react_build["outputDir"] + "/" + react_build["app"]["paths"]["appIR"].rsplit("/", 1)[0]
require(runtime_command["environmentOverrides"].get("GOBI_LIFECYCLE_APP_DIR") == str(ROOT / app_dir), "runtime tests use fresh React app directory")
require("# tests 10" in runtime_text and "# pass 10" in runtime_text and "# fail 0" in runtime_text, "fresh post-build runtime suite 10/10")
require(bytes_digest((ROOT / runtime_log).read_bytes()) == runtime_command["stdoutSha256"], "runtime test stdout pin")

build_checks = {}
for backend, build in (("react", react_build), ("dom", dom_build)):
    result = read_json(build["result"]["path"])
    output_checks = []
    for pin in build["outputPins"]:
        path = ROOT / build["outputDir"] / pin["path"]
        output_checks.append(path.is_file() and path.stat().st_size == pin["bytes"] and digest(path) == pin["sha256"])
    require(result["ok"] and len(result["outputs"]) == 67 and not result["diagnostics"], f"{backend} BuildResult")
    require(all(output_checks) and len(output_checks) == 67, f"{backend} output pins")
    require(build["appIRComponent"]["id"] == "github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle", f"{backend} component identity")
    build_checks[backend] = {
        "result_sha256": digest(build["result"]["path"]),
        "ok": result["ok"],
        "output_count": len(result["outputs"]),
        "diagnostics": len(result["diagnostics"]),
        "component_id": build["appIRComponent"]["id"],
        "app_ir_sha256": build["appIR"]["sha256"],
        "encoder_sha256": build["encoder"]["sha256"],
        "raw_module_sha256": build["rawModule"]["sha256"],
        "output_pin_count": len(build["outputPins"]),
        "all_outputs_match": all(output_checks),
    }

before_after_checks = {}
for backend in ("react", "dom"):
    before = attempt["outputPinsBefore"][backend]
    after = attempt["outputPinsAfter"][backend]
    current_match = all(
        (ROOT / item["path"]).is_file()
        and (ROOT / item["path"]).stat().st_size == item["bytes"]
        and digest(item["path"]) == item["sha256"]
        for item in after
    )
    require(before == after and current_match, f"{backend} output pin stability")
    before_after_checks[backend] = {
        "count": len(after),
        "stable_before_after": before == after,
        "current_match": current_match,
    }
require(attempt["buildComparison"]["appIRByteIdentical"] and attempt["buildComparison"]["encoderByteIdentical"], "cross-renderer AppIR/encoder identity")
require(attempt["buildComparison"]["exactNonManifestNonModuleOutputs"] == 65, "cross-renderer shared output count")
require(attempt["buildComparison"]["rawBundleEqualityClaimed"] is False, "raw renderer bundles kept distinct")

conf = attempt["conformance"]
counts = conf["checks"]
require(conf["status"] == counts["status"] == "matched", "lifecycle conformance status")
require(
    (counts["events"], counts["ticks"], counts["clicks"], counts["swaps"], counts["requests"], counts["cancellations"])
    == (26, 26, 16, 17, 7, 3),
    "lifecycle matrix counts",
)
require(counts["cancellationOrder"] == ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"], "child-first cancellation")
require(counts["stalePhysicalClicksAcrossProfiles"] == 18 and counts["retiredRendererFences"] == 32, "detached click and callback fence counts")
require(counts["callbackFenceEligibleSwaps"] == 16 and counts["callbackFenceIneligibleSwaps"] == 1, "swap callback eligibility accounting")
require(counts["mutationControlsDetected"] == 8 and all(x["detected"] for x in counts["mutationControls"]), "mutation controls")

smoke = attempt["demoSmoke"]
shot = smoke["screenshot"]
require(smoke["status"] == "passed" and not smoke["failures"] and not smoke["browserErrors"] and not smoke["consoleErrors"] and not smoke["failedRequests"], "HTTP smoke status")
require(all(x["status"] == 200 for x in smoke["requests"]) and len(smoke["requests"]) == 3, "HTTP asset requests")
require(not smoke["wasmRequests"] and not smoke["noWasm"]["wasmAPIAttempts"], "no WASM requests or API attempts")
require((ROOT / shot["path"]).is_file() and (ROOT / shot["path"]).stat().st_size == shot["bytes"] and digest(shot["path"]) == shot["sha256"], "HTTP screenshot pin")

accepted_archive = verify_archive(attempt["archive"]["path"], attempt["archive"]["manifest"]["path"])
require(accepted_archive["archive_sha256"] == attempt["archive"]["sha256"], "accepted archive recorded hash")
require(accepted_archive["manifest_sha256"] == attempt["archive"]["manifest"]["sha256"], "accepted archive manifest recorded hash")
require(
    accepted_archive["manifest_file_count"] == 719
    and accepted_archive["tar_regular_files"] == 719
    and accepted_archive["uncompressed_file_bytes_verified"] == 168198179
    and accepted_archive["file_member_names_match_manifest"]
    and accepted_archive["member_names_unique"]
    and not accepted_archive["unsafe_paths"]
    and not accepted_archive["tar_special_entries"]
    and not accepted_archive["content_errors"],
    "complete accepted lifecycle archive",
)

# The inherited full child is an independent receipt, not a full-parent pass.
inherited_path = "compiled-methods/coordination/receipts/E-DEMO.json"
inherited_report_path = "compiled-methods/coordination/reports/E-DEMO.md"
inherited = read_json(inherited_path)
compat_path = "compiled-lifecycle/coordination/root-checks/inherited-source-compatibility.json"
compat = read_json(compat_path)
inherited_pin_check = checked_pins(inherited["sourceBefore"], published_commit)
require(inherited["mode"] == "full" and inherited["status"] == "passed" and len(inherited["commands"]) == 17, "separate inherited full run")
require(inherited["sourcePinsMatch"] and inherited["sourceBefore"] == inherited["sourceAfter"], "inherited receipt pin stability")
require(inherited_pin_check["count"] == 137 and inherited_pin_check["all_current_match"] and inherited_pin_check["all_match_published_commit"], "inherited 137 pins match current and published commit")
require(digest(inherited_path) == "b610d5e3b37e8015815944db3ae0f119baebbafbcbdefd0f513110cb236d95bd", "inherited receipt pin")
require(canonical["separateInheritedFullRun"]["receipt"]["sha256"] == digest(inherited_path), "canonical inherited receipt link")
require(canonical["separateInheritedFullRun"]["report"]["sha256"] == digest(inherited_report_path), "canonical inherited report link")
require(digest(inherited_report_path) == inherited["report"]["sha256"], "inherited report pin")
require(
    compat["status"] == "passed"
    and compat["mode"] == "full"
    and compat["executionSha256"] == digest(inherited_path)
    and compat["sourcePinsChecked"] == 137
    and compat["sourcePinsMismatchedCurrent"] == [],
    "inherited source compatibility root check",
)

inherited_attempt = pathlib.Path(inherited["attempt"])
inherited_files = [p for p in (ROOT / inherited_attempt).rglob("*") if p.is_file()]
nested_build_files = [p for p in inherited_files if "builds" in p.relative_to(ROOT / inherited_attempt).parts]
old_parent_archive = read_json("compiled-lifecycle/builds/attempts/attempt-20261031T063606056Z/execution.json")["archive"]
old_parent_manifest_path = old_parent_archive["manifest"]["path"]
old_parent_manifest = read_json(old_parent_manifest_path)["members"]
subset = [x for x in old_parent_manifest if x["path"].startswith("inherited/attempt-20261031T063606561Z/")]
subset_errors = []
for item in subset:
    relative = item["path"].removeprefix("inherited/attempt-20261031T063606561Z/")
    source = ROOT / inherited_attempt / relative
    if not source.is_file() or source.stat().st_size != item["bytes"] or digest(source) != item["sha256"]:
        subset_errors.append(item["path"])
require(len(inherited_files) == 191 and len(nested_build_files) == 138, "complete inherited attempt file inventory")
require(len(subset) == 53 and sum(x["bytes"] for x in subset) == 10269094 and not subset_errors, "inherited copied subset byte identity")
require(not any("/builds/" in x["path"] for x in subset), "inherited copied subset omits nested build outputs")

# The old full parent is preserved as a failed, invalidated attempt.
old_path = "compiled-lifecycle/builds/attempts/attempt-20261031T063606056Z/execution.json"
old = read_json(old_path)
preserved_receipt_path = "compiled-lifecycle/coordination/before/full-invalidated/E-BUILD.json"
preserved_report_path = "compiled-lifecycle/coordination/before/full-invalidated/E-BUILD.md"
preserved_manifest = read_json("compiled-lifecycle/coordination/before/full-invalidated/manifest.json")
old_pin_before = {x["path"]: x for x in old["sourceBefore"]}
old_pin_after = {x["path"]: x for x in old["sourceAfter"]}
old_pin_drift = [k for k in sorted(set(old_pin_before) | set(old_pin_after)) if old_pin_before.get(k) != old_pin_after.get(k)]
old_commands = {x["name"]: x for x in old["commands"]}
old_test = old_commands["lifecycle-node-tests"]
old_react = old_commands["compile-react"]
old_dom = old_commands["compile-dom"]
require(old["mode"] == "full" and old["status"] == "failed" and not old["sourcePinsMatch"], "old full-parent invalidation status")
require((ROOT / preserved_receipt_path).read_bytes() == (ROOT / old_path).read_bytes(), "invalidated receipt preserved byte-for-byte")
require(digest(preserved_report_path) == old["report"]["sha256"], "invalidated report preserved hash")
require(preserved_manifest["files"]["receipt"]["sha256"] == digest(preserved_receipt_path) and preserved_manifest["files"]["report"]["sha256"] == digest(preserved_report_path), "invalidated preservation manifest")
require(old_pin_drift == [".github/workflows/gobi-compiled-lifecycle.yml", "compiled-lifecycle/run.mjs", "compiled-lifecycle/runtime/runtime.test.mjs"], "invalidated parent source drift scope")
require(old_test["startedAt"] < old_react["startedAt"] < old_dom["startedAt"] and "GOBI_LIFECYCLE_APP_DIR" not in old_test["environmentOverrides"], "old runtime test before fresh app build without appDir")
require(old["archive"]["memberCount"] == 701 and old["archive"]["roundTripVerified"], "old failed archive metadata")
old_archive_check = verify_archive(old["archive"]["path"], old["archive"]["manifest"]["path"])
require(old_archive_check["archive_sha256"] == old["archive"]["sha256"], "old failed archive recorded hash")
require(old_archive_check["manifest_sha256"] == old["archive"]["manifest"]["sha256"], "old failed archive manifest recorded hash")
require(old_archive_check["file_member_names_match_manifest"] and not old_archive_check["content_errors"], "old failed archive integrity")
require(canonical["priorInvalidatedFullAttempt"]["status"] == "failed" and canonical["separateInheritedFullRun"]["status"] == "passed", "partial/child/failed-parent boundary")

audit = {
    "schema": "gobi.compiled-lifecycle-xr-build-audit/v1",
    "job_id": "XR-BUILD",
    "reviewer": "N5",
    "decision": "accepted",
    "scope": "recorded E-BUILD lifecycle-only attempt and separate inherited E-DEMO/invalidated-parent provenance",
    "current_tree_accepted": False,
    "audit_toolchain": {"command": "python3 compiled-lifecycle/coordination/reviews/xr-build/audit.py", "python": sys.version.split()[0]},
    "canonical": {
        "receipt_path": canonical_path,
        "receipt_sha256": digest(canonical_path),
        "report_path": canonical_report_path,
        "report_sha256": report_hash,
        "attempt": canonical["attempt"],
        "attempt_execution_sha256": digest(pathlib.Path(canonical["attempt"]) / "execution.json"),
        "mode": canonical["mode"],
        "status": canonical["status"],
        "command_count": len(canonical["commands"]),
        "stage_count": len(canonical["stages"]),
        "all_stages_passed": all(x["status"] == "passed" for x in canonical["stages"]),
        "failure_count": len(canonical["failures"]),
        "source_pins": lifecycle_pin_check,
        "react_and_dom_builds": build_checks,
        "build_output_pin_stability": before_after_checks,
        "runtime_test": {
            "command": runtime_command["name"],
            "exit_code": runtime_command["exitCode"],
            "started_after_react_and_dom_builds": True,
            "app_dir": runtime_command["environmentOverrides"]["GOBI_LIFECYCLE_APP_DIR"],
            "stdout_sha256": runtime_command["stdoutSha256"],
            "passes": 10,
            "failures": 0,
        },
        "conformance": {
            "status": conf["status"],
            "events": counts["events"],
            "ticks": counts["ticks"],
            "clicks": counts["clicks"],
            "swaps": counts["swaps"],
            "requests": counts["requests"],
            "cancellations": counts["cancellations"],
            "cancellation_order": counts["cancellationOrder"],
            "stale_physical_clicks": counts["stalePhysicalClicksAcrossProfiles"],
            "callback_fences": counts["retiredRendererFences"],
            "eligible_swaps": counts["callbackFenceEligibleSwaps"],
            "ineligible_swaps": counts["callbackFenceIneligibleSwaps"],
            "mutation_controls_detected": counts["mutationControlsDetected"],
            "literal_oracle_checks": {
                "native": counts["nativeTraceCheckedAgainstLiteralOracle"],
                "direct": counts["directTraceCheckedAgainstLiteralOracle"],
                "browser": counts["browserTracesCheckedAgainstLiteralOracle"],
                "physical_dom": counts["physicalDOMCheckedAgainstLiteralOracle"],
            },
        },
        "http_demo": {
            "status": smoke["status"],
            "request_statuses": [x["status"] for x in smoke["requests"]],
            "browser_errors": len(smoke["browserErrors"]),
            "console_errors": len(smoke["consoleErrors"]),
            "wasm_requests": len(smoke["wasmRequests"]),
            "wasm_api_attempts": len(smoke["noWasm"]["wasmAPIAttempts"]),
            "screenshot": shot,
        },
        "archive": accepted_archive,
    },
    "published_source": {
        "source_commit": published_commit,
        "source_tree": commit_tree,
        "local_head": subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, stdout=subprocess.PIPE, check=True).stdout.strip(),
        "head_tree": head_tree,
        "lifecycle_pin_count": lifecycle_pin_check["count"],
        "lifecycle_pins_match_current_and_source_commit": True,
    },
    "separate_inherited_full_run": {
        "receipt_path": inherited_path,
        "receipt_sha256": digest(inherited_path),
        "report_path": inherited_report_path,
        "report_sha256": digest(inherited_report_path),
        "attempt": inherited["attempt"],
        "mode": inherited["mode"],
        "status": inherited["status"],
        "command_count": len(inherited["commands"]),
        "source_pin_check": inherited_pin_check,
        "root_compatibility_check_path": compat_path,
        "root_compatibility_check_sha256": digest(compat_path),
        "root_compatibility_status": compat["status"],
        "attempt_file_count": len(inherited_files),
        "nested_build_file_count": len(nested_build_files),
        "failed_parent_archive_subset": {
            "member_count": len(subset),
            "member_bytes": sum(x["bytes"] for x in subset),
            "all_members_match_complete_attempt": not subset_errors,
            "contains_nested_build_outputs": any("/builds/" in x["path"] for x in subset),
        },
    },
    "invalidated_full_parent": {
        "attempt": old["attempt"],
        "mode": old["mode"],
        "status": old["status"],
        "source_pins_match": old["sourcePinsMatch"],
        "source_pin_drift_paths": old_pin_drift,
        "preserved_receipt_path": preserved_receipt_path,
        "preserved_receipt_sha256": digest(preserved_receipt_path),
        "receipt_matches_original_execution_bytes": True,
        "preserved_report_path": preserved_report_path,
        "preserved_report_sha256": digest(preserved_report_path),
        "archive": old_archive_check,
        "runtime_test_ran_before_fresh_builds_without_app_dir": True,
    },
    "acceptance_boundary": {
        "single_full_parent_local_pass": False,
        "lifecycle_only_partial_pass": True,
        "separate_inherited_child_full_pass": True,
        "inherited_53_file_copy_is_incomplete": True,
        "hosted_full_ci_pending": "Current-head 28 CI workflows are pending per publication record; this review does not claim hosted CI acceptance.",
    },
}

OUT.write_text(json.dumps(audit, indent=2, sort_keys=True) + "\n")
print(json.dumps({"audit": str(OUT.relative_to(ROOT)), "sha256": digest(OUT.relative_to(ROOT)), "decision": audit["decision"], "checks": "passed"}, indent=2))
