#!/usr/bin/env python3
"""Read-only cross-check of the checked-in GoScript ABI probe evidence."""

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RESULTS = ROOT / "toolchain/probe_counter/results"


def read_json(name):
    return json.loads((RESULTS / name).read_text())


def main():
    manifest = RESULTS / "SHA256SUMS"
    entries = {}
    for line in manifest.read_text().splitlines():
        digest, path = line.split(maxsplit=1)
        entries[path] = digest
        actual = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        if actual != digest:
            raise SystemExit(f"hash mismatch: {path}")

    runner = (ROOT / "toolchain/probe_counter/run.sh").read_text()
    block = runner.split("sha256sum \\\n", 1)[1].split('> "$results/SHA256SUMS"', 1)[0]
    runner_inputs = {
        line.strip().rstrip("\\").strip()
        for line in block.splitlines()
        if line.strip()
    }
    if runner_inputs != set(entries):
        raise SystemExit(
            f"manifest coverage mismatch: missing={sorted(runner_inputs - set(entries))}; "
            f"extra={sorted(set(entries) - runner_inputs)}"
        )

    node = read_json("node.stdout.json")
    native = read_json("native.json")
    snapshot = node["snapshot"]
    comparable = {
        "counter": {
            "inputCountAfterUpdate": node["inputCountAfterUpdate"],
            "nextCount": node["nextCount"],
            "effectsIsNil": node["effects"] is None,
            "initialResetDisabled": node["initialResetDisabled"],
        },
        "snapshot": {
            "scalarBitsAfterCall": snapshot["scalarBits"],
            "mutatedScalar": snapshot["updatedScalar"],
            "nestedOriginal": snapshot["originalNestedCountAfterMutation"],
            "nestedReturned": snapshot["nestedCountAfterMutation"],
            "fixedOriginal": snapshot["originalFixedFirstCountAfterMutation"],
            "fixedReturned": snapshot["fixedFirstCountAfterMutation"],
            "structSliceOriginalAfterMutation": snapshot["originalStructSliceFirstCountAfterMutation"],
            "structSliceReturnedAfterMutation": snapshot["structSliceFirstCountAfterMutation"],
            "valuesOriginalLengthAfterAppend": snapshot["originalLengthAfterAppend"],
            "valuesReturnedLengthAfterAppend": snapshot["updatedLengthAfterAppend"],
            "valuesFirstAfterSharedWrite": snapshot["firstValueAfterForwardedMutation"],
            "structBeforeAppendCount": snapshot["structSliceBeforeAppendFirstCount"],
            "structAfterAppendFirstCount": snapshot["structSliceAfterAppendFirstCount"],
            "structInputLengthAfterAppend": snapshot["structSliceInputLengthAfterAppend"],
            "structOutputLengthAfterAppend": snapshot["structSliceOutputLengthAfterAppend"],
            "structOutputSecondCount": snapshot["structSliceOutputSecondCount"],
            "nilFloatSlice": snapshot["nilIsNull"],
            "emptyFloatSliceIsNil": snapshot["emptyIsNull"],
            "emptyFloatSliceLength": snapshot["emptyLength"],
        },
        "format": node["format"],
        "nodeSetFork": snapshot["nodeSetForkAttrs"],
    }
    expected = {key: value for key, value in native.items() if key != "integerOverflow"}
    if comparable != expected:
        raise SystemExit("native/Node projection mismatch")

    overflow = node["integerWidths"]["overflowFromWidthMax"]
    mismatches = [
        name
        for name, value in native["integerOverflow"].items()
        if str(overflow[name]["value"]) != value
    ]
    if mismatches != ["Int64", "Uint64"]:
        raise SystemExit(f"unexpected integer overflow mismatches: {mismatches}")

    if not (
        node["rawInputCountAfterDirectUpdate"] == 1
        and node["rawSameInputAndNext"] is True
        and node["inputCountAfterUpdate"] == 0
        and node["sameInputAndNext"] is False
    ):
        raise SystemExit("raw/forwarded Update mutation observation changed")
    if not (snapshot["scalarNegativeZero"] and snapshot["scalarBits"] == "8000000000000000"):
        raise SystemExit("negative-zero float observation changed")

    slice_pairs = [
        ("values", "nilValues", "emptyValues"),
        ("ints", "nilInts", "emptyInts"),
        ("uints", "nilUints", "emptyUints"),
        ("strings", "nilStrings", "emptyStrings"),
        ("bools", "nilBools", "emptyBools"),
        ("structs", "nilStructs", "emptyStructs"),
    ]
    shapes = node["stateShape"]["slices"]
    for base, nil_name, empty_name in slice_pairs:
        if shapes[nil_name] != {"isNil": True}:
            raise SystemExit(f"nil {base} slice shape changed")
        if shapes[empty_name].get("isNil") is not False or shapes[empty_name].get("length") != 0:
            raise SystemExit(f"empty {base} slice shape changed")

    if not (
        snapshot["structSliceOutputShape"]["constructor"] == "GoSlice"
        and snapshot["structSliceOutputShape"]["backingConstructor"] == "Array"
        and snapshot["updatedFloatSliceShape"]["constructor"] == "GoSlice"
        and snapshot["updatedFloatSliceShape"]["backingConstructor"] == "Float64Array"
    ):
        raise SystemExit("post-append GoSlice backing observations changed")

    print(
        f"{len(entries)}/{len(entries)} manifest entries hash-match; "
        f"{len(runner_inputs)} runner inputs exactly covered; native/Node projection matches; "
        "overflow mismatches are Int64,Uint64; raw Update mutates but forwarding isolates; "
        "nil/empty slices, negative zero, and sampled GoSlice backing shapes match"
    )


if __name__ == "__main__":
    main()
