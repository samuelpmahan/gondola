#!/usr/bin/env python3
"""Independent E-BUILD source-pin audit for the captured 031c462 invocation.

This read-only audit is scoped to the frozen source receipt and Git binding.
It exists because the prepared N1 auditor cannot parse the runner's Set([...])
declaration form. It does not turn a failed full execution into acceptance.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
RECEIPT = ROOT / "compiled-capabilities/ci/2026-10-31/lanes/provenance/full-run-031c462-failed-receipt.json"
RUNNER = ROOT / "compiled-capabilities/run.mjs"
BASE = "00da54ad0f5a4006b13a5cded18ce291845978bc"
LOCAL = "031c462bcd72c0ae0bee2dc05a0972b3902ca40c"
REMOTE = "a2e1164d68abaaa7d028bdaf6a20bea842a131ae"
MERGE = "b717449a8844ee695a8f1facd20d41a6b4bcf097"
TREE = "d22b75e18c7bea70a743cc79d53461b287c7d045"
GENERATED = "react-map.gen.mjs"
BINDING = ROOT / "compiled-capabilities/coordination/publication-binding.json"


def git(*args: str) -> bytes:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def git_text(*args: str) -> str:
    return git(*args).decode().strip()


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def declaration(source: str, name: str, is_set: bool = False) -> list[str]:
    prefix = f"const {name} = " + ("new Set(" if is_set else "")
    start = source.find(prefix)
    if start < 0:
        raise ValueError(f"missing runner declaration {name}")
    tail = source[start + len(prefix):]
    match = re.match(r"\s*(\[[\s\S]*?\])\s*\)?\s*;", tail)
    if not match:
        raise ValueError(f"could not parse runner declaration {name}")
    return [json.loads(literal) for literal in re.findall(r'"(?:\\.|[^"\\])*"', match.group(1))]


def tracked_files(commit: str) -> set[str]:
    rows = git("ls-tree", "-r", "--name-only", "--full-tree", commit).decode().splitlines()
    return set(rows)


def sum_rows(data: bytes) -> dict[str, str]:
    rows: dict[str, str] = {}
    for line in data.decode().splitlines():
        if not line.strip():
            continue
        match = re.fullmatch(r"([a-f0-9]{64})\s+\*?(.+)", line)
        if not match:
            raise ValueError(f"invalid SHA256SUMS row: {line}")
        digest, path = match.group(1), match.group(2).strip()
        if path in rows:
            raise ValueError(f"duplicate SHA256SUMS path: {path}")
        rows[path] = digest
    return rows


def source_paths(runner: str, git_files: set[str], sums: dict[str, str], mode: str) -> set[str]:
    files = declaration(runner, "sourceFiles")
    directories = declaration(runner, "sourceDirectories")
    ignored = set(declaration(runner, "ignoredSourceDirectories", is_set=True))
    paths: set[str] = set()
    for path in files:
        if path in git_files or path in sums:
            paths.add(path)
    for path in git_files:
        root = next((candidate for candidate in directories if path.startswith(candidate + "/")), None)
        if root is None:
            continue
        tail = path[len(root) + 1:]
        if any(part in ignored for part in tail.split("/")) or re.search(r"\.(?:log|png)$", path, re.I):
            continue
        paths.add(path)
    paths.update(sums)
    return paths


def main() -> int:
    errors: list[str] = []
    checks: list[str] = []
    receipt = json.loads(RECEIPT.read_text())
    runner = RUNNER.read_text()
    before = receipt.get("sourceBefore")
    after = receipt.get("sourceAfter")
    if not isinstance(before, list) or not isinstance(after, list):
        raise ValueError("captured receipt must have sourceBefore/sourceAfter arrays")
    def pins(rows: list[dict]) -> dict[str, dict]:
        result: dict[str, dict] = {}
        for row in rows:
            path = row.get("path")
            if not isinstance(path, str) or path in result:
                raise ValueError("source pin rows contain invalid or duplicate paths")
            result[path] = row
        return result
    before_map = pins(before)
    after_map = pins(after)
    if before_map != after_map:
        errors.append("sourceAfter differs from sourceBefore")
    else:
        checks.append(f"sourceBefore and sourceAfter contain the same {len(before_map)} unique path/size/SHA-256 pins")

    base_info = git_text("show", "-s", "--format=%H %T %P", BASE).split()
    local_info = git_text("show", "-s", "--format=%H %T %P", LOCAL).split()
    remote_info = git_text("show", "-s", "--format=%H %T %P", REMOTE).split()
    merge_info = git_text("show", "-s", "--format=%H %T %P", MERGE).split()
    if base_info[1] != "51b64a89b5f7e0edd4792becbed9adad6a27a698":
        errors.append("frozen base tree differs from publication binding")
    for label, info, commit in (("local", local_info, LOCAL), ("published", remote_info, REMOTE)):
        if info[0] != commit or info[1] != TREE or info[2:] != [BASE]:
            errors.append(f"{label} source commit/tree/direct parent differs from publication binding")
    if merge_info[0] != MERGE or merge_info[1] != TREE or merge_info[2:] != [BASE, REMOTE]:
        errors.append("hosted PR synthetic merge commit/tree/parent order differs from expected checkout identity")
    binding = json.loads(BINDING.read_text())
    expected_binding = {
        "schema": "gobi.source-publication-binding/v1",
        "base": {"commit": BASE, "tree": "51b64a89b5f7e0edd4792becbed9adad6a27a698"},
        "local": {"commit": LOCAL, "tree": TREE, "parents": [BASE]},
        "remote": {"commit": REMOTE, "tree": TREE, "parents": [BASE], "branch": "codex/gobi-backend-capabilities-20261031", "refReadbackVerified": True},
        "pr": 15,
        "url": "https://github.com/samuelpmahan/gondola/pull/15",
    }
    if binding != expected_binding:
        errors.append("publication-binding.json differs from the expected local/published source identity")
    else:
        checks.append("publication binding exactly records PR 15, local/published commits and trees, direct base parents, remote branch, and verified ref readback")
    checks.append("local source, published source, and hosted PR synthetic merge all resolve to tree d22b75e18c7bea70a743cc79d53461b287c7d045; local/published parent 00da54…, merge parents 00da54… then a2e1164…")

    base_tree = tracked_files(BASE)
    local_tree = tracked_files(LOCAL)
    remote_tree = tracked_files(REMOTE)
    source_sums = sum_rows(git("show", f"{LOCAL}:SHA256SUMS"))
    base_sums_bytes = git("show", f"{BASE}:SHA256SUMS")
    local_sums_bytes = git("show", f"{LOCAL}:SHA256SUMS")
    work_sums_bytes = (ROOT / "SHA256SUMS").read_bytes()
    if base_sums_bytes != local_sums_bytes or base_sums_bytes != work_sums_bytes:
        errors.append("M0 SHA256SUMS differs among base, source, and worktree")
    if len(source_sums) != 24 or GENERATED not in source_sums:
        errors.append("M0 checksum manifest does not contain the expected 24 rows including generated map")
    if len([path for path in source_sums if path != GENERATED]) != 23:
        errors.append("M0 checksum manifest does not contain 23 tracked inputs")

    git_expected = source_paths(runner, local_tree, source_sums, "git")
    work_expected = set()
    # This mirrors run.mjs's source walk over the current worktree.
    files = declaration(runner, "sourceFiles")
    directories = declaration(runner, "sourceDirectories")
    ignored = set(declaration(runner, "ignoredSourceDirectories", is_set=True))
    for path in files:
        if (ROOT / path).is_file():
            work_expected.add(path)
    for directory in directories:
        base_path = ROOT / directory
        if not base_path.exists():
            continue
        for path in base_path.rglob("*"):
            if not path.is_file():
                continue
            rel = path.relative_to(ROOT).as_posix()
            tail = rel[len(directory) + 1:]
            if any(part in ignored for part in tail.split("/")) or re.search(r"\.(?:log|png)$", path.name, re.I):
                continue
            work_expected.add(rel)
    work_expected.update(path for path in source_sums if (ROOT / path).is_file())
    if set(before_map) != git_expected:
        errors.append(f"source pin path set differs from declared Git source set ({len(before_map)} vs {len(git_expected)})")
    else:
        checks.append(f"the captured {len(before_map)} pins exactly cover runner-declared source directories/files, ignored directories, and SHA256SUMS entries in Git")
    if set(before_map) != work_expected:
        missing = sorted(set(before_map) - work_expected)[:4]
        extra = sorted(work_expected - set(before_map))[:4]
        errors.append(f"source pin path set differs from current worktree walk (missing={missing}, extra={extra})")
    else:
        checks.append("captured source pin paths exactly match the runner's current source-only worktree walk")

    for path, row in before_map.items():
        try:
            data = (ROOT / path).read_bytes()
            if len(data) != row.get("bytes") or sha(data) != row.get("sha256"):
                errors.append(f"working input differs from sourceBefore: {path}")
                continue
            if path == GENERATED:
                if path in base_tree or path in local_tree or path in remote_tree:
                    errors.append("generated react map unexpectedly appears in a Git tree")
                if source_sums.get(path) != row.get("sha256"):
                    errors.append("generated react map differs from the signed M0 hash")
                continue
            for label, tree, commit in (("local", local_tree, LOCAL), ("published", remote_tree, REMOTE)):
                if path not in tree:
                    errors.append(f"{path} is absent from {label} Git tree")
                    continue
                blob = git("show", f"{commit}:{path}")
                if len(blob) != row.get("bytes") or sha(blob) != row.get("sha256"):
                    errors.append(f"{path} differs from {label} Git blob")
        except (OSError, subprocess.CalledProcessError) as error:
            errors.append(f"could not verify {path}: {error}")
    if not errors:
        checks.append("every captured file pin matches the worktree and local/published Git blobs; generated map matches the signed M0 exception")

    m0_rows = 0
    for path, digest in source_sums.items():
        data = (ROOT / path).read_bytes()
        if sha(data) != digest:
            errors.append(f"M0 checksum mismatch for {path}")
        if path != GENERATED:
            for commit in (BASE, LOCAL, REMOTE):
                blob = git("show", f"{commit}:{path}")
                if sha(blob) != digest:
                    errors.append(f"M0 tracked input {path} differs from original hash in {commit[:8]}")
        m0_rows += 1
    if "EXPECTED.json" not in source_sums:
        errors.append("EXPECTED.json is absent from original M0 sums")
    if not errors:
        checks.append("all 24 original M0 SHA256SUMS entries verify, including 23 tracked inputs and the generated-map exception")

    output = {
        "schema": "gobi.source-git-worktree-receipt-audit/v1",
        "status": "passed" if not errors else "failed",
        "executionStatus": receipt.get("status"),
        "finalAcceptance": False,
        "sourceCommit": LOCAL,
        "publishedCommit": REMOTE,
        "prSyntheticMergeCommit": MERGE,
        "sourceTree": TREE,
        "baseCommit": BASE,
        "sourcePinCount": len(before_map),
        "m0Rows": m0_rows,
        "checks": checks,
        "failures": errors,
        "limitation": "This audit verifies provenance only. The captured E-BUILD invocation failed its inherited lifecycle gate, so milestone acceptance remains false.",
    }
    print(json.dumps(output, sort_keys=True, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
