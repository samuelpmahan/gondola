#!/usr/bin/env python3
"""Compare native/direct and GoScript build evidence with verified CI extraction."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[5]
LOCAL = ROOT / "compiled-capabilities/builds/attempts/attempt-20261031T103735751Z"
HOST = ROOT / (
    "compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/"
    "primary-push-run-41193504188-extracted/compiled-capabilities/builds/"
    "attempts/attempt-20261031T103752934Z"
)
VERIFY = ROOT / (
    "compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/"
    "primary-push-run-41193504188-inner-verification.json"
)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def fail(message: str) -> None:
    raise RuntimeError(message)


def physical_files(directory: Path) -> set[str]:
    paths: set[str] = set()
    for path in directory.rglob("*"):
        if path.is_symlink():
            fail(f"symlink in output tree: {path}")
        if path.is_file():
            paths.add(path.relative_to(directory).as_posix())
        elif not path.is_dir():
            fail(f"unsupported output entry: {path}")
    return paths


def checked_outputs(root: Path, backend: str) -> tuple[dict[str, str], dict]:
    backend_root = root / backend
    record = read_json(backend_root / "build-record.json")
    if record.get("backend") != backend or record.get("outputCount") != 67:
        fail(f"{backend}: build-record identity/count mismatch")
    pins = record.get("outputPins")
    if not isinstance(pins, list) or len(pins) != 67:
        fail(f"{backend}: expected exactly 67 build pins")
    pin_map: dict[str, str] = {}
    for row in pins:
        name = row.get("path")
        if not isinstance(name, str) or name.startswith("/") or ".." in Path(name).parts:
            fail(f"{backend}: unsafe output path {name!r}")
        if name in pin_map:
            fail(f"{backend}: duplicate output path {name}")
        file = backend_root / "output" / name
        if not file.is_file() or file.is_symlink():
            fail(f"{backend}: missing/unsafe pinned output {name}")
        actual = sha(file)
        if actual != row.get("sha256") or file.stat().st_size != row.get("bytes"):
            fail(f"{backend}: physical output pin mismatch {name}")
        pin_map[name] = actual
    if physical_files(backend_root / "output") != set(pin_map):
        fail(f"{backend}: physical output inventory differs from build-record")
    return pin_map, record


def main() -> None:
    verification = read_json(VERIFY)
    if verification.get("receipt_status") != "passed" or verification.get("receipt_mode") != "full":
        fail("independently verified CI E-BUILD receipt is not passed/full")
    if verification.get("receipt_failures") != 0 or not verification.get("receipt_source_pins_match"):
        fail("independently verified CI E-BUILD receipt has failures or source-pin drift")
    if verification.get("tar_members_match_manifest") is not True or verification.get("gzip_consumed_to_eof_and_trailer_valid") is not True:
        fail("independently verified CI inner archive is not complete and manifest-matched")

    raw_pairs = {}
    for name in (
        "capabilities.lifecycle.native.json",
        "capabilities.lifecycle.direct.json",
        "capabilities.lifecycle.check.json",
    ):
        local_path = LOCAL / "matrix" / name
        host_path = HOST / "matrix" / name
        if local_path.read_bytes() != host_path.read_bytes():
            fail(f"local and CI bytes differ for {name}")
        raw_pairs[name] = {
            "bytes": local_path.stat().st_size,
            "sha256": sha(local_path),
            "localPath": local_path.relative_to(ROOT).as_posix(),
            "hostedPath": host_path.relative_to(ROOT).as_posix(),
        }

    check = read_json(HOST / "matrix/capabilities.lifecycle.check.json")
    expected_check = {
        "status": "matched",
        "events": 26,
        "ticks": 26,
        "requests": 7,
        "cancellations": 3,
        "cancellationOrder": ["grandchild:g1:r3", "child:g1:r2", "parent:g1:r1"],
    }
    if {key: check.get(key) for key in expected_check} != expected_check:
        fail("hosted lifecycle check does not match required literal summary")

    backend_results = {}
    expected_differences = {"apps/lifecycle-7e6575d90707/gobi-compiled.mjs", "forwarders/go.mod"}
    for backend in ("react", "dom"):
        local_pins, local_record = checked_outputs(LOCAL, backend)
        host_pins, host_record = checked_outputs(HOST, backend)
        if set(local_pins) != set(host_pins):
            fail(f"{backend}: local and hosted output path sets differ")
        differences = [
            {"path": name, "localSha256": local_pins[name], "hostedSha256": host_pins[name]}
            for name in sorted(local_pins)
            if local_pins[name] != host_pins[name]
        ]
        if {row["path"] for row in differences} != expected_differences or len(local_pins) - len(differences) != 65:
            fail(f"{backend}: unexpected local/hosted output differences")
        local_paths = local_record["app"]["paths"]
        host_paths = host_record["app"]["paths"]
        hashes = {}
        for kind in ("appIR", "encoder"):
            local_path = LOCAL / backend / "output" / local_paths[kind]
            host_path = HOST / backend / "output" / host_paths[kind]
            if local_path.read_bytes() != host_path.read_bytes():
                fail(f"{backend}: local and hosted {kind} bytes differ")
            hashes[kind] = {"bytes": local_path.stat().st_size, "sha256": sha(local_path)}
        for kind in ("appIR", "encoder"):
            path = local_paths[kind]
            if sha(LOCAL / backend / "output" / path) != sha(LOCAL / "react" / "output" / path):
                fail(f"local React/{backend} {kind} bytes differ")
            if sha(HOST / backend / "output" / host_paths[kind]) != sha(HOST / "react" / "output" / host_paths[kind]):
                fail(f"hosted React/{backend} {kind} bytes differ")
        hashes["localRawModuleSha256"] = sha(LOCAL / backend / "output" / local_paths["module"])
        hashes["hostedRawModuleSha256"] = sha(HOST / backend / "output" / host_paths["module"])
        local_module = (LOCAL / backend / "output" / local_paths["module"]).read_text(encoding="utf-8")
        host_module = (HOST / backend / "output" / host_paths["module"]).read_text(encoding="utf-8")
        local_module_body = [line for line in local_module.splitlines() if not line.startswith("// ")]
        host_module_body = [line for line in host_module.splitlines() if not line.startswith("// ")]
        if local_module_body != host_module_body:
            fail(f"{backend}: generated module differs beyond source-path comments")
        local_go_mod = (LOCAL / backend / "output/forwarders/go.mod").read_text(encoding="utf-8")
        host_go_mod = (HOST / backend / "output/forwarders/go.mod").read_text(encoding="utf-8")
        local_repo = "/workspace/scratch/39a56936f173/gondola-capabilities"
        host_repo = "/home/runner/work/gondola/gondola"
        if local_repo not in local_go_mod or host_repo not in host_go_mod:
            fail(f"{backend}: expected local/hosted forwarder module roots were not found")
        if local_go_mod.replace(local_repo, "<repo-root>") != host_go_mod.replace(host_repo, "<repo-root>"):
            fail(f"{backend}: forwarders/go.mod differs beyond the source-root replacement")
        hashes["rawModuleContentEqualAfterSourceCommentRemoval"] = True
        hashes["forwardersGoModEqualAfterRepoRootNormalization"] = True
        hashes["forwardersGoModLocalSha256"] = local_pins["forwarders/go.mod"]
        hashes["forwardersGoModHostedSha256"] = host_pins["forwarders/go.mod"]
        hashes["moduleBuildTempRoots"] = {
            "local": "/tmp/gobi-goscript-2078387630",
            "hosted": "/tmp/gobi-goscript-1100653630",
        }
        hashes["forwardersRepoRoots"] = {"local": local_repo, "hosted": host_repo}
        backend_results[backend] = {
            "outputCount": len(local_pins),
            "pathSetIdentical": True,
            "sameBytesCount": 65,
            "environmentSpecificDifferences": differences,
            "appIRAndEncoder": hashes,
        }

    local_exec = read_json(LOCAL / "execution.json")
    host_exec = read_json(HOST / "execution.json")
    result = {
        "schema": "gobi.compiled-capabilities-native-hosted-byte-comparison/v1",
        "status": "matched",
        "hostedArtifactVerification": {
            "path": VERIFY.relative_to(ROOT).as_posix(),
            "sha256": sha(VERIFY),
            "archiveSha256": verification["archive_sha256"],
            "archiveBytes": verification["archive_bytes"],
            "manifestSha256": verification["manifest_sha256"],
            "manifestFileCount": verification["manifest_file_count"],
        },
        "localExecution": {
            "path": (LOCAL / "execution.json").relative_to(ROOT).as_posix(),
            "sha256": sha(LOCAL / "execution.json"),
            "status": local_exec["status"],
            "startedAt": local_exec["startedAt"],
            "finishedAt": local_exec["finishedAt"],
        },
        "hostedExecution": {
            "path": (HOST / "execution.json").relative_to(ROOT).as_posix(),
            "sha256": sha(HOST / "execution.json"),
            "status": host_exec["status"],
            "startedAt": host_exec["startedAt"],
            "finishedAt": host_exec["finishedAt"],
        },
        "lifecycle": {
            "byteIdenticalLocalToHosted": raw_pairs,
            "events": check["events"],
            "ticks": check["ticks"],
            "requests": check["requests"],
            "cancellations": check["cancellations"],
            "cancellationOrder": check["cancellationOrder"],
        },
        "builds": backend_results,
        "toolchains": {
            "nodeEqual": local_exec["versions"]["node"] == host_exec["versions"]["node"],
            "compiledGoEqual": local_exec["versions"]["compiledGo"] == host_exec["versions"]["compiledGo"],
            "npm": {"local": local_exec["versions"]["npm"], "hosted": host_exec["versions"]["npm"]},
            "rootGo": {"local": local_exec["versions"]["rootGo"], "hosted": host_exec["versions"]["rootGo"]},
            "chromium": {"local": local_exec["versions"]["chromium"], "hosted": host_exec["versions"]["chromium"]},
            "lockedDependenciesEqual": local_exec["versions"]["lockedDependencies"] == host_exec["versions"]["lockedDependencies"],
        },
        "limitations": [
            "The local capability archive container was rejected and is not accepted by this comparison; hosted source-equivalent CI archive evidence is independently verified in the referenced verification record.",
            "Raw generated module hashes are recorded separately: their source-map comments embed different temporary build paths, while the non-comment module contents match. forwarders/go.mod differs only by the local/hosted repository-root replacement; its hashes are recorded separately.",
            "This sub-lane does not by itself establish complete milestone acceptance; the root-owned acceptance scope also requires independent review, native scheduling audit, and delivery reconstruction gates.",
        ],
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
