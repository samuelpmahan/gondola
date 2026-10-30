#!/usr/bin/env python3
"""Capture an authorized local test command and its terminal outcome."""
import datetime
import hashlib
import json
import os
import pathlib
import signal
import subprocess
import sys

log_path, receipt_path, *command = sys.argv[1:]
if not command:
    raise SystemExit("usage: capture-run.py LOG RECEIPT COMMAND [ARG ...]")
log = pathlib.Path(log_path)
receipt = pathlib.Path(receipt_path)
log.parent.mkdir(parents=True, exist_ok=True)
receipt.parent.mkdir(parents=True, exist_ok=True)
record = {"schema": "gondola.command-execution/v1", "command": command,
          "cwd": str(pathlib.Path.cwd()), "startedUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "supervisorPID": os.getpid(), "status": "running", "exitCode": None,
          "environment": {k: os.environ.get(k) for k in ["GOTOOLCHAIN", "CHROMIUM_EXECUTABLE_PATH", "GONDOLA_SKIP_NPM_CI", "GONDOLA_SKIP_BROWSER_INSTALL"]}}

def save():
    temporary = receipt.with_suffix(receipt.suffix + ".tmp")
    temporary.write_text(json.dumps(record, indent=2) + "\n")
    temporary.replace(receipt)

child = None
def interrupted(number, _frame):
    record["interruptionSignal"] = number
    if child is not None:
        child.send_signal(number)

signal.signal(signal.SIGTERM, interrupted)
signal.signal(signal.SIGINT, interrupted)
save()
try:
    with log.open("w") as output:
        child = subprocess.Popen(command, stdout=output, stderr=subprocess.STDOUT)
        record["childPID"] = child.pid
        save()
        record["exitCode"] = child.wait()
    record["status"] = "passed" if record["exitCode"] == 0 else "failed"
except BaseException as error:
    record["status"] = "capture-error"
    record["error"] = repr(error)
    raise
finally:
    record["finishedUTC"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    record["logSHA256"] = hashlib.sha256(log.read_bytes()).hexdigest() if log.exists() else None
    save()
raise SystemExit(record["exitCode"] or 0)
