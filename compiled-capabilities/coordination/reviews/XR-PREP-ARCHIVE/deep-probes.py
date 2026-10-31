#!/usr/bin/env python3
"""In-memory adversarial probes for N5's archive verifier; writes no fixtures."""
from __future__ import annotations

import copy
import hashlib
import io
import json
import sys
import tarfile
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path.cwd() / "compiled-capabilities/coordination/acceptance/archive"))
import verify_archive as verifier  # noqa: E402


Fixture = tuple[dict[str, Any], dict[str, Any], bytes, bytes]
Mutation = Callable[[dict[str, Any]], None]


def build_fixture(
    *,
    snapshot: Mutation | None = None,
    receipt: Mutation | None = None,
    add_extra: bool = False,
    directory_collision: bool = False,
    special_type: bytes | None = None,
    omit_member: str | None = None,
) -> Fixture:
    outer, manifest, archive_bytes, _manifest_bytes = verifier.make_fixture()
    outer, manifest = copy.deepcopy(outer), copy.deepcopy(manifest)
    members: list[tuple[tarfile.TarInfo, bytes | None]] = []
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as tar:
        for info in tar.getmembers():
            if info.name == omit_member:
                continue
            if info.isdir():
                members.append((info, None))
            elif info.isreg():
                members.append((info, tar.extractfile(info).read()))

    for index, (info, data) in enumerate(members):
        if info.name == verifier.SNAPSHOT_MEMBER and snapshot:
            value = json.loads(data)
            snapshot(value)
            data = (json.dumps(value, sort_keys=True, indent=2) + "\n").encode()
            info.size = len(data)
            members[index] = (info, data)

    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w:gz") as tar:
        for info, data in members:
            tar.addfile(info, io.BytesIO(data) if data is not None else None)
        if add_extra or directory_collision:
            name = "extra.bin" if add_extra else "react"
            content = b"x"
            info = tarfile.TarInfo(name)
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
        if special_type is not None:
            info = tarfile.TarInfo("react/linked")
            info.type = special_type
            info.linkname = "build-result.json"
            tar.addfile(info)
    archive_bytes = stream.getvalue()

    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as tar:
        files = {
            info.name: tar.extractfile(info).read()
            for info in tar.getmembers()
            if info.isreg()
        }
    for row in manifest["members"]:
        content = files.get(row["path"])
        if content is not None:
            row["bytes"] = len(content)
            row["sha256"] = hashlib.sha256(content).hexdigest()
    if directory_collision:
        manifest["members"].append({
            "path": "react",
            "bytes": 1,
            "sha256": hashlib.sha256(b"x").hexdigest(),
        })

    manifest_bytes = (json.dumps(manifest, sort_keys=True, indent=2) + "\n").encode()
    archive_meta = outer["archive"]
    archive_meta["members"] = copy.deepcopy(manifest["members"])
    archive_meta["memberCount"] = len(archive_meta["members"])
    archive_meta["memberBytes"] = sum(row["bytes"] for row in archive_meta["members"])
    archive_meta["bytes"] = len(archive_bytes)
    archive_meta["sha256"] = hashlib.sha256(archive_bytes).hexdigest()
    archive_meta["manifest"]["bytes"] = len(manifest_bytes)
    archive_meta["manifest"]["sha256"] = hashlib.sha256(manifest_bytes).hexdigest()
    snapshot_bytes = files.get(verifier.SNAPSHOT_MEMBER)
    if snapshot_bytes is not None:
        archive_meta["executionSnapshot"]["bytes"] = len(snapshot_bytes)
        archive_meta["executionSnapshot"]["sha256"] = hashlib.sha256(snapshot_bytes).hexdigest()
    if receipt:
        receipt(outer)
    return outer, manifest, archive_bytes, manifest_bytes


def expect(name: str, fixture: Fixture, *, rejected: bool) -> None:
    try:
        result = verifier.verify_objects(*fixture, require_complete=True)
    except verifier.VerificationError as exc:
        if not rejected:
            raise AssertionError(f"{name} was rejected unexpectedly: {exc}") from exc
        print(f"REJECTED {name}: {exc}")
    else:
        if rejected:
            raise AssertionError(f"{name} was accepted unexpectedly")
        print(f"ACCEPTED {name}: completeAcceptance={result['completeAcceptance']}")


def main() -> None:
    expect("wrong React version", build_fixture(
        snapshot=lambda s: (
            s["toolchainAndDependencies"]["versions"]["dependencies"].update(react="18.0.0"),
            s["executionReceiptBeforeArchive"]["versions"]["dependencies"].update(react="18.0.0"),
        ),
        receipt=lambda r: r["versions"]["dependencies"].update(react="18.0.0"),
    ), rejected=True)
    expect("consistent Node 18", build_fixture(
        snapshot=lambda s: (
            s["toolchainAndDependencies"]["versions"].update(node="v18.0.0"),
            s["executionReceiptBeforeArchive"]["versions"].update(node="v18.0.0"),
        ),
        receipt=lambda r: r["versions"].update(node="v18.0.0"),
    ), rejected=False)
    expect("inconsistent locked React version", build_fixture(
        snapshot=lambda s: (
            s["toolchainAndDependencies"]["versions"]["lockedDependencies"].update(react="18.0.0"),
            s["executionReceiptBeforeArchive"]["versions"]["lockedDependencies"].update(react="18.0.0"),
        ),
        receipt=lambda r: r["versions"]["lockedDependencies"].update(react="18.0.0"),
    ), rejected=False)
    expect("nonzero pre-archive command", build_fixture(
        snapshot=lambda s: (
            s["commandLedger"][0].update(exitCode=23),
            s["executionReceiptBeforeArchive"]["commands"][0].update(exitCode=23),
        ),
        receipt=lambda r: r["commands"][0].update(exitCode=23),
    ), rejected=False)
    expect("nonzero final archive command", build_fixture(
        receipt=lambda r: r["commands"][-3].update(exitCode=17),
    ), rejected=False)
    expect("snapshot status says passed", build_fixture(
        snapshot=lambda s: s.update(status="passed"),
    ), rejected=False)
    expect("outer snapshot status says passed", build_fixture(
        receipt=lambda r: r["archive"]["executionSnapshot"].update(status="passed"),
    ), rejected=False)
    expect("file/directory path collision", build_fixture(directory_collision=True), rejected=False)
    expect("symlink member", build_fixture(special_type=tarfile.SYMTYPE), rejected=True)
    expect("hardlink member", build_fixture(special_type=tarfile.LNKTYPE), rejected=True)
    expect("unmanifested extra member", build_fixture(add_extra=True), rejected=True)
    expect("missing listed member", build_fixture(omit_member="react/build-result.json"), rejected=True)
    expect("post-run source pin mismatch", build_fixture(
        receipt=lambda r: r.update(sourceAfter=[{
            "path": "src/main.go", "bytes": 3, "sha256": "b" * 64,
        }]),
    ), rejected=True)
    print("deep probes passed; accepted cases are recorded verifier gaps")


if __name__ == "__main__":
    main()
