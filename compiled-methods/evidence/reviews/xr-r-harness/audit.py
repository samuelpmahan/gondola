#!/usr/bin/env python3
"""Read-only independent audit of N2's R-HARNESS repair and retained run."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
REPAIR = ROOT / "compiled-methods/evidence/repairs/r-harness"
REVIEW = ROOT / "compiled-methods/evidence/reviews/xr-r-harness"

def read_json(path):
    return json.loads(path.read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify_pin_list(pins, resolver):
    rows = []
    for pin in pins:
        path = resolver(pin["path"])
        raw = path.read_bytes()
        actual = hashlib.sha256(raw).hexdigest()
        bytes_ok = "bytes" not in pin or len(raw) == pin["bytes"]
        rows.append({
            "path": pin["path"],
            "expected_sha256": pin["sha256"],
            "actual_sha256": actual,
            "expected_bytes": pin.get("bytes"),
            "actual_bytes": len(raw),
            "match": actual == pin["sha256"] and bytes_ok,
        })
    return rows

run = read_json(REPAIR / "methods.run.json")
check = read_json(REPAIR / "methods.check.json")
native = read_json(REPAIR / "methods.native.json")
direct = read_json(REPAIR / "methods.direct.json")
browser = read_json(REPAIR / "methods.browser.json")
fixture = read_json(ROOT / "compiled-methods/conformance/fixtures/methods.json")
contract = read_json(ROOT / "compiled-methods/conformance/method-contract.json")
report = ROOT / "compiled-methods/coordination/reports/R-HARNESS.md"
receipt = read_json(ROOT / "compiled-methods/coordination/receipts/R-HARNESS.json")
check_source = (ROOT / "compiled-methods/conformance/check.mjs").read_text()
test_source = (ROOT / "compiled-methods/conformance/check.test.mjs").read_text()

source_rows = verify_pin_list(run["sourcePinsFinal"], lambda p: ROOT / p)
output_rows = verify_pin_list(run["outputPinsAfterCheck"], lambda p: Path(p))
evidence_rows = verify_pin_list(run["evidencePins"], lambda p: Path(p))
protected = []
for line in (REPAIR / "preserved-before.sha256").read_text().splitlines():
    digest, rel = line.split("  ", 1)
    protected.append({"path": rel, "sha256": digest})
preserved_rows = verify_pin_list(protected, lambda p: ROOT / p)

checks = {}
checks["run_and_checker_matched"] = run["status"] == "matched" and check["status"] == "matched"
checks["source_pin_snapshots_equal"] = (
    run["sourcePinsBefore"] == run["sourcePinsAfter"] == run["sourcePinsFinal"]
    and run["sourceStable"] is True and run["sourceStableThroughCheck"] is True
)
checks["output_pin_snapshots_equal"] = (
    run["outputPinsBeforeCheck"] == run["outputPinsAfterCheck"]
    and run["outputsStableThroughCheck"] is True
)
checks["all_188_source_pins_match"] = len(source_rows) == 188 and all(row["match"] for row in source_rows)
checks["all_149_build_native_pins_match"] = len(output_rows) == 149 and all(row["match"] for row in output_rows)
checks["all_7_run_evidence_pins_match"] = len(evidence_rows) == 7 and all(row["match"] for row in evidence_rows)
checks["all_11_prior_artifacts_match"] = len(preserved_rows) == 11 and all(row["match"] for row in preserved_rows)

expected_first = {"name": "childAdd", "arg": ""}
mutated_first = {"name": "parentAdd", "arg": ""}
checks["actual_first_message_is_lowercase_child_add"] = native["ticks"][1]["message"] == expected_first
checks["native_and_direct_raw_trace_hashes_match"] = sha(REPAIR / "methods.native.json") == sha(REPAIR / "methods.direct.json")
checks["checker_mutates_only_lowercase_message_value"] = (
    'wrongMessageValue.ticks[1].message = { name: "parentAdd", arg: "" };' in check_source
    and 'wrong-message-value' in test_source
    and r'message\.name: value differs; expected "childAdd", got "parentAdd"' in test_source
    and "object field set differs" in test_source
)
message_outcome = next(item for item in check["mutationControls"]["outcomes"] if item["name"] == "wrong-message-value")
checks["message_control_rejects_value_not_shape"] = (
    message_outcome["rejected"] is True
    and 'message.name: value differs; expected "childAdd", got "parentAdd"' in message_outcome["reason"]
    and "object field set differs" not in message_outcome["reason"]
)
mutation_names = [item["name"] for item in check["mutationControls"]["outcomes"]]
checks["all_four_mutation_vectors_rejected"] = (
    check["mutationControls"]["detected"] == 4
    and mutation_names == ["wrong-method-state", "wrong-callee-provenance", "wrong-message-value", "wrong-dom"]
    and all(item["rejected"] for item in check["mutationControls"]["outcomes"])
)

core_fields = ("index", "action", "message", "dispatchId", "state", "requestedEffects", "completedEffects")
def core(trace):
    return {
        "schema": trace["schema"],
        "appId": trace["appId"],
        "ticks": [{key: tick.get(key) for key in core_fields} for tick in trace["ticks"]],
    }
expected_core = core(native)
profile_rows = {}
for name, profile in browser["profiles"].items():
    profile_rows[name] = {
        "trace_ticks": len(profile["trace"]["ticks"]),
        "oracle_snapshots": len(profile["domOracle"]),
        "physical_snapshots": len(profile["physicalDOMSnapshots"]),
        "swaps": len(profile.get("swaps", [])),
        "trace_matches_native": core(profile["trace"]) == expected_core,
    }
checks["all_browser_profiles_match_native_core"] = all(row["trace_matches_native"] for row in profile_rows.values())
checks["browser_snapshot_and_swap_counts_match"] = profile_rows == {
    "react": {"trace_ticks": 19, "oracle_snapshots": 19, "physical_snapshots": 19, "swaps": 0, "trace_matches_native": True},
    "dom": {"trace_ticks": 19, "oracle_snapshots": 19, "physical_snapshots": 19, "swaps": 0, "trace_matches_native": True},
    "swap": {"trace_ticks": 19, "oracle_snapshots": 19, "physical_snapshots": 19, "swaps": 18, "trace_matches_native": True},
}
checks["native_trace_counts_match"] = (
    len(native["ticks"]) == 19
    and len(fixture["actions"]) == 18
    and sum(tick.get("dispatchId") is not None for tick in native["ticks"]) == 14
    and [index for index, tick in enumerate(native["ticks"]) if index and tick.get("message") is None] == [7, 10, 11, 18]
)
state_id = contract["stateType"]
package_path = contract["packagePath"]
counter_package = contract["counterUpdateId"].rsplit(".", 1)[0]
symbol_ids = [symbol["id"] for symbol in contract["symbols"]]
counts = {
    "receiver_methods": sum(identifier.startswith(state_id + ".") for identifier in symbol_ids),
    "methods_package_symbols_including_roles": sum(identifier.startswith(package_path + ".") for identifier in symbol_ids),
    "counter_dependency_functions": sum(identifier.startswith(counter_package + ".") for identifier in symbol_ids),
    "total_symbols": len(symbol_ids),
}
checks["symbol_counts_match_corrected_report"] = counts == {
    "receiver_methods": 10,
    "methods_package_symbols_including_roles": 13,
    "counter_dependency_functions": 2,
    "total_symbols": 15,
}
checks["author_report_hash_matches_receipt"] = sha(report) == receipt["report_sha256"]
checks["changed_harness_source_hashes_match_receipt"] = all(
    sha(ROOT / path) == digest for path, digest in receipt["verification"]["source_sha256"].items()
)
checks["recorded_node_unit_log_passes_10"] = (
    "# tests 10" in (REPAIR / "node22-units.log").read_text()
    and "# pass 10" in (REPAIR / "node22-units.log").read_text()
    and "# fail 0" in (REPAIR / "node22-units.log").read_text()
)

failed = [name for name, passed in checks.items() if not passed]
result = {
    "schema": "gobi.xr-r-harness-audit/v1",
    "decision": "accepted" if not failed else "amend",
    "worker": "N3",
    "author_job": "R-HARNESS",
    "author_worker": "N2",
    "checks": checks,
    "failed_checks": failed,
    "mutation": {
        "expected_message": expected_first,
        "mutated_message": mutated_first,
        "rejection_reason": message_outcome["reason"],
        "field_shape_preserved": True,
        "other_controls": mutation_names,
    },
    "matrix": {
        "status": run["status"],
        "ticks": len(native["ticks"]),
        "actions": len(fixture["actions"]),
        "active_dispatches": 14,
        "suppressed_ticks": [7, 10, 11, 18],
        "profiles": profile_rows,
        "native_sha256": sha(REPAIR / "methods.native.json"),
        "direct_sha256": sha(REPAIR / "methods.direct.json"),
        "browser_record_sha256": sha(REPAIR / "methods.browser.json"),
        "check_record_sha256": sha(REPAIR / "methods.check.json"),
    },
    "pins": {
        "source_count": len(source_rows),
        "build_native_count": len(output_rows),
        "run_evidence_count": len(evidence_rows),
        "preserved_prior_count": len(preserved_rows),
        "preserved_before_sha256": sha(REPAIR / "preserved-before.sha256"),
        "source_hashes_recomputed": all(row["match"] for row in source_rows),
        "build_hashes_recomputed": all(row["match"] for row in output_rows),
        "evidence_hashes_recomputed": all(row["match"] for row in evidence_rows),
        "prior_hashes_recomputed": all(row["match"] for row in preserved_rows),
    },
    "symbol_counts": counts,
    "versions": {"node": "v22.23.4", "go": "go1.24.0 linux/amd64", "chromium": "153.0.8010.0 at /tmp/chromium"},
    "limits": [
        "Read-only review; no source tests, builds, or runner executions performed by N3.",
        "Local Chromium evidence, not managed CI.",
        "Acceptance covers the R-HARNESS mutation-control repair and its bounded fixed-fixture matrix; no broader runtime or composition claims."
    ],
}
(REVIEW / "audit.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"decision": result["decision"], "failed_checks": failed, "counts": counts, "pins": result["pins"]}, indent=2))
if failed:
    raise SystemExit(1)
