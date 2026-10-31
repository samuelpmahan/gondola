#!/usr/bin/env python3
"""Independently verify the recorded root startup-failure extension."""
import hashlib
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[5]
COORD = ROOT / "compiled-capabilities/coordination"
EXPECTED = {
    "type": "extend-after-executed-failure",
    "source": "232406843678f46c569e1c54b34b268c84e7764e",
    "failed_command": "GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 CHROMIUM_PATH=/tmp/chromium CHROMIUM_EXECUTABLE_PATH=/tmp/chromium bash run-compiled-capabilities.sh",
    "failure": "ENOENT creating attemptRoot before its parent; no test stage executed",
    "new_jobs": ["E-FIX-STARTUP", "XR-FIX-STARTUP"],
    "log": "compiled-capabilities/coordination/root-checks/startup-failed-2324068/command.log",
    "log_sha256": "8d37cd1446f90513077746c8ebb309851421ae1d30ee8b7483d02170f8e285db",
}


def main() -> None:
    state = json.loads((COORD / "state.json").read_text())
    event = next(e for e in state["events"] if e.get("type") == "extend-after-executed-failure")
    path = (ROOT / event["log"]).resolve(strict=True)
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert all(event.get(key) == value for key, value in EXPECTED.items())
    assert path.is_relative_to(ROOT)
    assert digest == event["log_sha256"]
    assert b"ENOENT: no such file or directory, mkdir" in raw
    assert b"compiled-capabilities/run.mjs:160:1" in raw
    assert state["jobs"]["E-FIX-STARTUP"]["repair_of"] == "E-BUILD"
    assert state["jobs"]["XR-FIX-STARTUP"]["depends_on"] == "E-FIX-STARTUP"
    result = {
        "event_index": state["events"].index(event),
        "state_epoch": state.get("epoch"),
        "exact_recorded_fields_match": True,
        "path_contained_in_repository": True,
        "actual_log_sha256": digest,
        "diagnostic_content_match": True,
        "repair_review_links_match": True,
        "startup_extension_has_amend_review_gate": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
