#!/usr/bin/env python3
"""Read-only independent audit of the N5 E-DEMO receipt and preserved outputs."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[4]
RECEIPT = ROOT / "compiled-backends/coordination/receipts/E-DEMO.json"
REPORT = ROOT / "compiled-backends/coordination/reports/E-DEMO.md"


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def pin_path(raw):
    p = Path(raw)
    return p if p.is_absolute() else ROOT / p


def check_pin(pin, label, base=None):
    p = pin_path(pin["path"]) if Path(pin["path"]).is_absolute() else ((base / pin["path"]) if base else pin_path(pin["path"]))
    assert p.is_file(), f"missing {label}: {p}"
    actual_hash = sha(p)
    actual_bytes = p.stat().st_size
    assert actual_hash == pin["sha256"], f"hash mismatch {label}: {p}"
    if "bytes" in pin:
        assert actual_bytes == pin["bytes"], f"size mismatch {label}: {p}"
    return {"path": str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p),
            "sha256": actual_hash, "bytes": actual_bytes}


def check_pin_lists(items, label, base=None):
    checked = [check_pin(x, label, base) for x in items]
    return checked


def archive_audit(name, expected_count):
    archive = ROOT / "compiled-backends/artifacts/failed-attempts" / name
    sums = json.loads((archive / "SHA256SUMS.json").read_text())
    entries = sums["files"]
    if isinstance(entries, list):
        expected = {x["path"]: (x["sha256"], x.get("bytes")) for x in entries}
    else:
        expected = {k: (v, None) for k, v in entries.items()}
    actual_files = {p.relative_to(archive).as_posix(): p for p in archive.rglob("*")
                    if p.is_file() and p.name != "SHA256SUMS.json"}
    verified = []
    failures = []
    for key, (expected_hash, expected_bytes) in expected.items():
        candidates = [key]
        if key.startswith("artifacts/"):
            candidates.append(key[len("artifacts/"):])
        found = next((actual_files[k] for k in candidates if k in actual_files), None)
        if found is None:
            failures.append({"path": key, "error": "missing"})
            continue
        actual_hash = sha(found)
        actual_bytes = found.stat().st_size
        if actual_hash != expected_hash or (expected_bytes is not None and actual_bytes != expected_bytes):
            failures.append({"path": key, "error": "mismatch", "actualHash": actual_hash,
                             "actualBytes": actual_bytes})
        else:
            verified.append(key)
    unpinned = sorted(set(actual_files) - {str(Path(k)) for k in expected})
    # Archives are immutable bundles; require exact coverage after the documented artifacts/ alias.
    expected_actual = set()
    for key in expected:
        expected_actual.add(key)
    unexpected = sorted(set(actual_files) - expected_actual)
    assert len(expected) == expected_count, f"{name} manifest count {len(expected)} != {expected_count}"
    assert not failures, f"{name} checksum failures: {failures[:3]}"
    assert not unexpected, f"{name} unexpected payloads: {unexpected[:3]}"
    return {"archive": str(archive.relative_to(ROOT)), "manifestCount": len(expected),
            "payloadCount": len(actual_files), "verifiedCount": len(verified),
            "failures": failures, "unexpectedPayloads": unexpected,
            "checksumManifestSha256": sha(archive / "SHA256SUMS.json")}


def main():
    receipt = json.loads(RECEIPT.read_text())
    report = REPORT.read_text()
    assert receipt["schema"] == "gobi.compiled-backends-execution/v1"
    assert receipt["mode"] == "backends-only" and receipt["status"] == "passed"
    assert receipt["outcome"] == "mixed_change" and not receipt["failures"]
    assert "Attempt 01 failed during module import before a complete attempt archive was captured" in report
    assert "No complete execution receipt, logs, source snapshot, build outputs, or traces remain" in report
    assert "--backends-only explicitly skipped the inherited frontend regression chain" in report

    before, after = receipt["sourceBefore"], receipt["sourceAfter"]
    assert before == after and receipt["sourcePinsMatch"] is True
    source_actual = check_pin_lists(before, "source")

    build_result = {}
    for backend in ("react", "dom"):
        outdir = ROOT / receipt["backendBuilds"][backend]["outputDir"]
        pins_before = receipt["outputPinsBefore"][backend]
        pins_after = receipt["outputPinsAfter"][backend]
        pins_build = receipt["backendBuilds"][backend]["outputPins"]
        assert len(pins_before) == len(pins_after) == len(pins_build) == 209
        assert len({x["path"] for x in pins_before}) == 209
        assert len({x["path"] for x in pins_after}) == 209
        assert len({x["path"] for x in pins_build}) == 209
        assert check_pin_lists(pins_before, f"{backend} build before", outdir)
        assert check_pin_lists(pins_after, f"{backend} build after")
        def normalized(p):
            prefix = f"compiled-backends/artifacts/compiled/{backend}/"
            return p["path"][len(prefix):] if p["path"].startswith(prefix) else p["path"]
        assert {normalized(x): x["sha256"] for x in pins_before} == {
            normalized(x): x["sha256"] for x in pins_after}
        for pin in pins_build:
            file = outdir / pin["path"]
            assert file.is_file() and sha(file) == pin["sha256"] and file.stat().st_size == pin["bytes"]
        manifest = json.loads((outdir / "buildmanifest.json").read_text())
        assert len(manifest["apps"]) == 4
        assert all(x.get("backend") == backend for x in manifest["apps"])
        build_result[backend] = {"outputDir": str(outdir.relative_to(ROOT)),
                                 "pinCount": len(pins_build), "manifestApps": len(manifest["apps"]),
                                 "manifestBackendTags": sorted({x["backend"] for x in manifest["apps"]})}

    reactpins = {x["path"]: x for x in receipt["backendBuilds"]["react"]["outputPins"]}
    dompins = {x["path"]: x for x in receipt["backendBuilds"]["dom"]["outputPins"]}
    assert set(reactpins) == set(dompins)
    changed = sorted(p for p in reactpins if reactpins[p]["sha256"] != dompins[p]["sha256"])
    changed_bundles = sorted(p for p in changed if p.endswith("/gobi-compiled.mjs"))
    changed_manifests = [p for p in changed if p == "buildmanifest.json"]
    assert len(changed_bundles) == 4 and changed_manifests == ["buildmanifest.json"]
    assert len(changed) == 5
    assert all(reactpins[p]["sha256"] != dompins[p]["sha256"] for p in changed_bundles)
    for p in reactpins:
        if p not in changed:
            assert reactpins[p]["sha256"] == dompins[p]["sha256"]
            assert reactpins[p]["bytes"] == dompins[p]["bytes"]

    conf_result = []
    totals = {"ticks": 0, "swaps": 0, "focusSwaps": 0, "mutationControls": 0}
    assert len(receipt["backendConformance"]) == 5
    for item in receipt["backendConformance"]:
        assert item["status"] == "matched" and item["sourceStable"] is True
        assert item["sourcePinsBefore"] == item["sourcePinsAfter"]
        check_pin_lists(item["sourcePinsBefore"], "conformance source")
        check_file = Path(item["files"]["check"])
        check_data = json.loads(check_file.read_text())
        assert check_data["status"] == "matched"
        assert check_data["backends"] == {"react": "matched", "dom": "matched", "alternatingSwap": "matched"}
        native = json.loads(Path(item["files"]["native"]).read_text())
        direct = json.loads(Path(item["files"]["direct"]).read_text())
        browser = json.loads(Path(item["files"]["browser"]).read_text())
        assert native == direct, f"native/direct traces diverged for {item['fixture']}"
        assert browser["pageErrors"] == []
        assert browser["noWasm"]["wasmRequests"] == []
        assert browser["noWasm"]["wasmAPIAttempts"] == []
        assert set(browser["profiles"]) == {"react", "dom", "swap"}
        assert all(len(profile["trace"]["ticks"]) == check_data["ticks"]
                   for profile in browser["profiles"].values())
        pins = item["outputPins"]
        check_pin_lists(pins, "conformance output")
        totals["ticks"] += check_data["ticks"]
        totals["swaps"] += check_data["swaps"]
        totals["focusSwaps"] += check_data["focusSwaps"]
        totals["mutationControls"] += check_data["mutationControlsDetected"]
        conf_result.append({"fixture": Path(item["fixture"]).name, "status": check_data["status"],
                            "ticks": check_data["ticks"], "swaps": check_data["swaps"],
                            "focusSwaps": check_data["focusSwaps"],
                            "mutationControlsDetected": check_data["mutationControlsDetected"],
                            "nativeDirectEqual": True, "browserProfiles": sorted(browser["profiles"]),
                            "browserErrors": 0, "wasmRequests": 0, "sourcePinCount": len(item["sourcePinsBefore"])})

    assert totals == {"ticks": 43, "swaps": 37, "focusSwaps": 9, "mutationControls": 45}
    assert receipt["demoSmoke"]["status"] == "passed"
    assert receipt["demoSmoke"]["errors"] == [] and receipt["demoSmoke"]["wasmRequests"] == []
    assert receipt["demoSmoke"]["failures"] == []
    check_pin_lists(receipt["demoOutputPinsBeforeSmoke"], "demo before smoke")
    check_pin_lists(receipt["demoOutputPinsAfterSmoke"], "demo after smoke")
    assert receipt["demoOutputPinsBeforeSmoke"] == receipt["demoOutputPinsAfterSmoke"]
    evidence_pins = check_pin_lists(receipt["demoEvidencePins"], "demo evidence")

    archives = [archive_audit("demo-attempt-02", 519), archive_audit("demo-attempt-03", 513)]
    result = {"decision": "accepted_with_limits", "receipt": str(RECEIPT.relative_to(ROOT)),
              "receiptSha256": sha(RECEIPT), "reportSha256": sha(REPORT),
              "mode": receipt["mode"], "status": receipt["status"],
              "sourcePinCount": len(source_actual), "sourcePinsEqualAndCurrent": True,
              "builds": build_result, "buildChangedPaths": changed,
              "conformance": conf_result, "conformanceTotals": totals, "demoSmoke": {"status": receipt["demoSmoke"]["status"],
                  "checks": len(receipt["demoSmoke"]["checks"]), "errors": 0, "wasmRequests": 0},
              "demoEvidencePins": evidence_pins, "failedArchives": archives,
              "attempt01": "unavailable as recorded; not reconstructed or claimed retained",
              "fullFreshCI": "not run by N5 backends-only; remains a separate pending gate"}
    out = ROOT / "compiled-backends/evidence/reviews/xr-demo/audit.json"
    out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"AUDIT FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise
