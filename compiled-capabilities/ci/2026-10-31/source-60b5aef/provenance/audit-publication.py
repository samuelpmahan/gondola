#!/usr/bin/env python3
"""Read-only checks for the frozen 60b5aeff source publication binding."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
BASE = "00da54ad0f5a4006b13a5cded18ce291845978bc"
PRIOR = "a2e1164d68abaaa7d028bdaf6a20bea842a131ae"
SOURCE = "60b5aeff3172837ad7831c2b78b210454a3d81a2"
TREE = "cc3a129b4372d00d5168135aa2e5687dfbf6788f"
MERGE = "07fc827212889af17524eadfe8c5c9da75d26850"
BINDING_PATH = ROOT / "compiled-capabilities/coordination/publication-binding-followup.json"


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout.strip()


def commit_info(commit: str) -> dict[str, object]:
    fields = git("show", "-s", "--format=%H %T %P", commit).split()
    return {"commit": fields[0], "tree": fields[1], "parents": fields[2:]}


def main() -> int:
    binding = json.loads(BINDING_PATH.read_text())
    actual_head = git("rev-parse", "HEAD^{commit}")
    base = commit_info(BASE)
    prior = commit_info(PRIOR)
    source = commit_info(SOURCE)
    synthetic_merge = commit_info(MERGE)
    errors: list[str] = []
    if actual_head != SOURCE:
        errors.append("checked-out HEAD differs from the frozen follow-up source commit")
    if source != {"commit": SOURCE, "tree": TREE, "parents": [PRIOR]}:
        errors.append("source commit/tree/direct parent differs from the frozen follow-up identity")
    if binding.get("schema") != "gobi.source-publication-binding/v1":
        errors.append("follow-up publication binding has an unexpected schema")
    if binding.get("base") != {"commit": BASE, "tree": base["tree"]}:
        errors.append("follow-up publication binding differs from the frozen base object")
    expected_side = {"commit": SOURCE, "tree": TREE, "parents": [PRIOR]}
    for side in ("local", "remote"):
        record = binding.get(side)
        if not isinstance(record, dict) or any(record.get(key) != value for key, value in expected_side.items()):
            errors.append(f"follow-up binding.{side} differs from the source commit/tree/parent")
    remote = binding.get("remote", {})
    if remote.get("refReadbackVerified") is not True or remote.get("branch") != "codex/gobi-backend-capabilities-20261031":
        errors.append("follow-up remote branch/ref readback is not confirmed in the binding")
    if synthetic_merge != {"commit": MERGE, "tree": TREE, "parents": [BASE, SOURCE]}:
        errors.append("hosted PR synthetic merge commit/tree/parents differ from the expected checkout identity")
    if git("cat-file", "-t", SOURCE) != "commit" or git("cat-file", "-t", MERGE) != "commit":
        errors.append("source or hosted merge object is not a commit")
    ancestry = subprocess.run(["git", "merge-base", "--is-ancestor", BASE, SOURCE], cwd=ROOT).returncode == 0
    if not ancestry:
        errors.append("frozen base is not an ancestor of the follow-up source commit")
    checks = [
        f"HEAD equals source {SOURCE}",
        f"source tree is {TREE}; direct parent is prior published commit {PRIOR}",
        "follow-up publication binding records matching local/remote source identities and verified branch ref readback",
        f"PR 15 synthetic merge {MERGE} has tree {TREE} and ordered parents [{BASE}, {SOURCE}]",
        f"frozen base {BASE} is an ancestor of the follow-up source commit",
    ] if not errors else []
    report = {
        "schema": "gobi.followup-publication-audit/v1",
        "status": "passed" if not errors else "failed",
        "finalAcceptance": False,
        "base": base,
        "priorSource": prior,
        "source": source,
        "checkedOutHead": actual_head,
        "hostedPrSyntheticMerge": synthetic_merge,
        "bindingPath": str(BINDING_PATH.relative_to(ROOT)),
        "checks": checks,
        "failures": errors,
        "limitation": "This audit covers Git object identity and publication binding only; it does not certify E-BUILD execution, archive completeness, or hosted CI.",
    }
    print(json.dumps(report, sort_keys=True, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
