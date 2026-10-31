#!/usr/bin/env python3
"""Read-only independent review of the native executable path repair."""

from __future__ import annotations

import hashlib
import json
import tarfile
from pathlib import Path, PurePosixPath


CI_REPO = Path("/workspace/scratch/39a56936f173/gondola-lifecycle-ci")
SRC = Path("/workspace/scratch/39a56936f173/gondola")
CI = CI_REPO / "compiled-lifecycle/ci/2026-10-31"
SRC_CI = SRC / "compiled-lifecycle/ci/2026-10-31"
LANE = CI / "lanes/review-native-path"
N1 = CI / "lanes/repair-native-path"
SRC_N1 = SRC_CI / "lanes/repair-native-path"
ATTEMPT_REL = "compiled-lifecycle/builds/attempts/attempt-20261031T073203120Z"
ATTEMPT = SRC / ATTEMPT_REL
MATRIX = LANE / "matrix"
EXPECTED_REPORT = "734f1b10f5957ddb047e38b2a194d8eda1e55ae207d6415e275bcaea2f2ef3eb"
EXPECTED_RECEIPT = "93246f5b6cf12d9681bcc26fb0419553ed14069b426646464aa2545d30fc2b3a"
EXPECTED_ZIP = "f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def file_pin(path: Path) -> dict:
    h = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        while block := stream.read(1024 * 1024):
            h.update(block)
            size += len(block)
    return {"bytes": size, "sha256": h.hexdigest()}


def require(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def main() -> None:
    author_report = SRC_CI / "coordination/reports/R-NATIVE-PATH.md"
    author_receipt_path = SRC_CI / "coordination/receipts/R-NATIVE-PATH.json"
    author_receipt = read_json(author_receipt_path)
    report_pin = file_pin(author_report)
    receipt_pin = file_pin(author_receipt_path)
    require(report_pin["sha256"] == EXPECTED_REPORT == author_receipt["report_sha256"],
            "frozen N1 report pin")
    require(receipt_pin["sha256"] == EXPECTED_RECEIPT, "frozen N1 receipt pin")
    require(author_receipt["job_id"] == "R-NATIVE-PATH" and author_receipt["worker"] == "N1" and
            author_receipt["status"] == "ready_for_review", "author packet identity/status")
    require((CI / "coordination/reports/R-NATIVE-PATH.md").read_bytes() == author_report.read_bytes() and
            (CI / "coordination/receipts/R-NATIVE-PATH.json").read_bytes() == author_receipt_path.read_bytes(),
            "dated author report and receipt exact copies")

    custody = read_json(N1 / "copy-custody.json")
    require(Path(custody["originalRoot"]) == SRC_CI, "copy custody points to source evidence root")
    copied_pins = []
    for entry in custody["files"]:
        original = SRC_CI / entry["path"]
        copied = CI / entry["path"]
        original_pin = file_pin(original)
        copied_pin = file_pin(copied)
        expected = {"bytes": entry["bytes"], "sha256": entry["sha256"]}
        require(original_pin == expected and copied_pin == expected, f"source/copy custody: {entry['path']}")
        copied_pins.append({"path": entry["path"], **expected})
    require(len(copied_pins) >= 30, "custody inventory retained RED and GREEN evidence")

    source_run = SRC / "compiled-lifecycle/conformance/run.mjs"
    source_test = SRC / "compiled-lifecycle/conformance/native-path.test.mjs"
    run_pin, test_pin = file_pin(source_run), file_pin(source_test)
    require(run_pin["sha256"] == "751d04d6aa73662d63295bc09cc74875011700c096c2749ae5196e3e116d753f",
            "frozen resolver source hash")
    require(test_pin["sha256"] == "1b1519883e9e9d7dbe7a2b4814af2f674477b413cf01df015dc778c3dd4c5623",
            "frozen test source hash")
    source_code = source_run.read_text(encoding="utf-8")
    require("process.env.GOBI_GO_BIN ?? \"go\"" in source_code and
            "if (isAbsolute(value)) return resolve(value)" in source_code and
            "if (value.includes(\"/\") || value.includes(\"\\\\\")) return resolve(value)" in source_code and
            "return value;" in source_code, "bare/default/explicit executable path policy present")

    red = N1 / "red"
    red_reproduction = read_json(red / "reproduction.json")
    red_failure = read_json(red / "lifecycle.failed.json")
    red_test_text = (red / "regression-test.stdout.log").read_text(encoding="utf-8")
    red_exit = int((red / "regression-test.exit-code.txt").read_text().strip())
    require(red_exit == 1 and "# tests 3" in red_test_text and "# pass 1" in red_test_text and
            "# fail 2" in red_test_text, "pre-fix RED test retained as 2 of 3 failures")
    require("/workspace/scratch/39a56936f173/gondola/go" in red_test_text and
            "spawnSync /workspace/scratch/39a56936f173/gondola/go ENOENT" in
            red_reproduction["nativeFailure"]["message"], "pre-fix bare go path regression reproduced")
    require(any("full conformance check withheld" in item["message"] for item in red_failure["errors"]),
            "pre-fix withheld conformance boundary preserved")

    final_receipt_path = N1 / "green/final-run-receipt.json"
    final_receipt = read_json(final_receipt_path)
    require(final_receipt["status"] == "passed" and final_receipt["mode"] == "lifecycle-only" and
            final_receipt["sourcePinsMatch"] is True and final_receipt["sourceBefore"] == final_receipt["sourceAfter"],
            "N1 lifecycle-only outcome/source stability")
    require(len(final_receipt["stages"]) == 13 and all(x["status"] == "passed" for x in final_receipt["stages"]),
            "N1 lifecycle-only thirteen-stage record")
    current_source_pins = []
    for pin in final_receipt["sourceBefore"]:
        actual = file_pin(SRC / pin["path"])
        require(actual == {"bytes": pin["bytes"], "sha256": pin["sha256"]},
                f"current N1 source pin {pin['path']}")
        current_source_pins.append({"path": pin["path"], **actual})
    require(len(current_source_pins) == 123, "N1 full source-pin count")

    initial_postfix = read_json(N1 / "green/full-run-receipt.json")
    require(initial_postfix["status"] == "failed" and initial_postfix["attempt"] ==
            "compiled-lifecycle/builds/attempts/attempt-20261031T072932858Z", "initial post-fix attempt retained")
    initial_failures = [item for item in initial_postfix["failures"] if item.get("name") == "version-npm"]
    require(len(initial_failures) == 1 and initial_failures[0]["error"] == "spawnSync npm ENOENT",
            "initial post-fix attempt failed because npm was absent from its minimal PATH")
    require(all(stage["status"] == "passed" for stage in initial_postfix["stages"]
                if stage["name"] != "toolchain-inventory") and
            next(stage for stage in initial_postfix["stages"] if stage["name"] == "toolchain-inventory")["status"] ==
            "failed", "initial attempt's lifecycle stages passed but harness inventory failed")
    require(final_receipt["outputPinsBefore"] == final_receipt["outputPinsAfter"],
            "N1 React/DOM build outputs remained stable")
    profile_output_pins = {}
    for backend, pins in final_receipt["outputPinsBefore"].items():
        require(len(pins) == 67, f"N1 {backend} full build output inventory")
        for pin in pins:
            actual = file_pin(SRC / pin["path"])
            require(actual == {"bytes": pin["bytes"], "sha256": pin["sha256"]},
                    f"N1 current {backend} build output {pin['path']}")
        profile_output_pins[backend] = {"count": len(pins), "sha256": hashlib.sha256(
            json.dumps(pins, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}

    archive = ATTEMPT / "lifecycle-artifacts.tar.gz"
    manifest_path = ATTEMPT / "archive-manifest.json"
    manifest = read_json(manifest_path)
    archive_pin = file_pin(archive)
    require(archive_pin["bytes"] == 14_757_771 and archive_pin["sha256"] == EXPECTED_ZIP ==
            final_receipt["archive"]["sha256"], "original source-worktree attempt archive pin")
    require(file_pin(manifest_path)["sha256"] == "27e0ade2164813d3fba831cc44f19b9f9bf56ef862ee68d8f6942dd0e7064c46",
            "attempt archive manifest pin")
    manifest_members = {item["path"]: item for item in manifest["members"]}
    with tarfile.open(archive, "r:gz") as tf:
        infos = tf.getmembers()
        regular = [item for item in infos if item.isfile()]
        require(len(regular) == len(manifest_members) == 719 and len({item.name for item in infos}) == len(infos),
                "attempt archive unique member inventory")
        require(sum(item.size for item in regular) == 168_200_217, "attempt archive uncompressed bytes")
        require(all(not item.name.startswith("/") and ".." not in PurePosixPath(item.name).parts
                    for item in infos), "attempt archive member path safety")
        for item in regular:
            expected = manifest_members[item.name]
            stream = tf.extractfile(item)
            require(stream is not None, f"archive member readable: {item.name}")
            digest = hashlib.sha256()
            size = 0
            while block := stream.read(1024 * 1024):
                digest.update(block)
                size += len(block)
            require(size == expected["bytes"] == item.size and digest.hexdigest() == expected["sha256"],
                    f"archive member manifest match: {item.name}")

    target_log = LANE / "targeted-tests"
    targeted_stdout = (target_log / "stdout.log").read_text(encoding="utf-8")
    targeted_stderr = (target_log / "stderr.log").read_text(encoding="utf-8")
    targeted_exit = int((target_log / "exit-code.txt").read_text().strip())
    require(targeted_exit == 0 and "# tests 4" in targeted_stdout and "# pass 4" in targeted_stdout and
            "# fail 0" in targeted_stdout, "independent four-test resolver suite")
    test_cases = [line.removeprefix("# Subtest: ") for line in targeted_stdout.splitlines()
                  if line.startswith("# Subtest: ")]
    require(len(test_cases) == 4, "four native path test cases recorded")

    matrix_run = read_json(MATRIX / "lifecycle.run.json")
    matrix_check = read_json(MATRIX / "lifecycle.check.json")
    matrix_manifest = read_json(MATRIX / "lifecycle.manifest.json")
    require(matrix_run["status"] == matrix_check["status"] == matrix_manifest["status"] == "matched",
            "independent fresh matrix result")
    require(matrix_run["nativeCommand"][0] == "go" and matrix_run["nativeGoStderr"] == "",
            "fresh matrix used bare PATH command without native Go errors")
    require(all(stage["status"] == "completed" for stage in matrix_run["stages"]),
            "fresh matrix native/direct/browser/check stages completed")
    summary = matrix_check
    require(summary["ticks"] == 26 and summary["swaps"] == 17 and summary["mutationControlsDetected"] == 8,
            "fresh matrix literal oracle/swap/mutation counts")
    require(summary["nativeTraceCheckedAgainstLiteralOracle"] is True and
            summary["directTraceCheckedAgainstLiteralOracle"] is True and
            summary["browserTracesCheckedAgainstLiteralOracle"] is True and
            summary["physicalDOMCheckedAgainstLiteralOracle"] is True,
            "fresh matrix literal oracle checks")
    require(summary["pendingSurvivedFixedSwap"], "pending effect survived renderer replacement")
    require(matrix_run["sourcePinsBefore"] == matrix_run["sourcePinsAfter"] == matrix_run["sourcePinsFinal"] and
            matrix_run["sourceStableThroughCheck"] is True, "fresh matrix source pins stable")
    require(matrix_run["buildOutputPinsBeforeCheck"] == matrix_run["buildOutputPinsAfterCheck"] and
            matrix_run["buildOutputsStableThroughCheck"] is True, "fresh matrix final build outputs stable")
    for pin in matrix_run["sourcePinsBefore"]:
        actual = file_pin(SRC / pin["path"])
        require(actual == {"bytes": pin["bytes"], "sha256": pin["sha256"]},
                f"fresh matrix current source pin {pin['path']}")
    for pin in matrix_run["buildOutputPinsBeforeCheck"]:
        actual = file_pin(SRC / pin["path"])
        require(actual == {"bytes": pin["bytes"], "sha256": pin["sha256"]},
                f"fresh matrix final output pin {pin['path']}")

    evidence = {}
    for name in ("lifecycle.native.json", "lifecycle.direct.json", "lifecycle.browser.json",
                 "lifecycle.browser.capture.json", "lifecycle.check.json", "lifecycle.manifest.json",
                 "lifecycle.run.json", "stdout.log", "stderr.log", "command.json", "exit-code.txt"):
        evidence[name] = file_pin(MATRIX / name)
    test_evidence = {name: file_pin(target_log / name) for name in ("stdout.log", "stderr.log", "exit-code.txt")}

    result = {
        "schema": "gobi.compiled-lifecycle-native-path-review/v1",
        "job_id": "XR-NATIVE-PATH",
        "worker": "N5",
        "decision": "accepted",
        "outcome": "confirmed_reuse",
        "source_head": "49cc2b96c8817a47319d5b7bd484184a22fa984b",
        "review_scope": "native executable resolver repair and independent fresh lifecycle matrix against the final React/DOM builds",
        "author_packet": {"report_sha256": report_pin["sha256"], "receipt_sha256": receipt_pin["sha256"],
                          "copy_custody_entries_verified": len(copied_pins)},
        "red_reproduction": {"test_exit": red_exit, "tests": 3, "passed": 1, "failed": 2,
                             "native_failure": red_reproduction["nativeFailure"]["message"],
                             "full_check_withheld": True},
        "resolver_source": {"path": str(source_run.relative_to(SRC)), **run_pin,
                            "default": "GOBI_GO_BIN ?? bare 'go'", "bare_cli_name": "preserved for PATH",
                            "explicit_relative_path": "resolved against invoking CWD before child CWD switches to repository root",
                            "test_path": str(source_test.relative_to(SRC)), **test_pin},
        "n1_lifecycle_only": {"status": final_receipt["status"], "mode": final_receipt["mode"],
                              "stages_passed": len(final_receipt["stages"]), "source_pin_count": len(current_source_pins),
                              "build_outputs": profile_output_pins,
                              "conformance_status": final_receipt["conformance"]["status"],
                              "ticks": final_receipt["conformance"]["summary"]["ticks"],
                              "swaps": final_receipt["conformance"]["summary"]["swaps"],
                              "mutations_detected": final_receipt["conformance"]["summary"]["mutationControlsDetected"],
                              "demo_checks": len(final_receipt["demoSmoke"]["checks"]),
                              "archive": {**archive_pin, "manifest_sha256": file_pin(manifest_path)["sha256"],
                                          "members": len(manifest_members), "member_bytes": 168200217,
                                          "round_trip_verified": True}},
        "initial_postfix_attempt": {"attempt": initial_postfix["attempt"], "status": initial_postfix["status"],
                                    "harness_failure": "spawnSync npm ENOENT", "acceptance": "not counted as a pass"},
        "independent_rerun": {
            "targeted_tests": {"command": "node --test compiled-lifecycle/conformance/native-path.test.mjs",
                                "cwd": str(SRC), "exit": targeted_exit, "passed": 4, "failed": 0,
                                "cases": test_cases, "stderr_sha256": hashlib.sha256(targeted_stderr.encode()).hexdigest(),
                                "evidence": test_evidence},
            "matrix": {"command": str((MATRIX / "command.json")), "cwd": str(SRC),
                       "status": matrix_check["status"], "ticks": summary["ticks"], "swaps": summary["swaps"],
                       "mutation_controls_detected": summary["mutationControlsDetected"],
                       "native_command": matrix_run["nativeCommand"], "native_stderr": matrix_run["nativeGoStderr"],
                       "stage_count": len(matrix_run["stages"]), "stages_completed": True,
                       "source_pins_count": len(matrix_run["sourcePinsBefore"]),
                       "build_outputs_checked": len(matrix_run["buildOutputPinsBeforeCheck"]),
                       "evidence": evidence},
        },
        "tool_versions": {"node": "v22.23.4", "npm": "11.9.0", "go_on_PATH": "go1.24.0 linux/amd64",
                           "chromium": "153.0.8010.0", "python": "3.12.14"},
        "limitations": [
            "The independent rerun used the final existing React and DOM builds; it did not rebuild them.",
            "The fresh native/direct/browser matrix is a local lifecycle conformance rerun, not a hosted CI result.",
            "The preceding hosted full workflow remains failed and is not rewritten as a pass by this repair review.",
        ],
    }
    output = LANE / "audit.json"
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"decision": result["decision"], "source_pin_count": len(current_source_pins),
                      "custody_entries": len(copied_pins), "archive_members": len(manifest_members),
                      "targeted_tests": "4/4", "fresh_matrix": matrix_check["status"],
                      "ticks": summary["ticks"], "swaps": summary["swaps"],
                      "mutations": summary["mutationControlsDetected"]}, sort_keys=True))


if __name__ == "__main__":
    main()
