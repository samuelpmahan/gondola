#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path.cwd().resolve()
COORD = ROOT / 'compiled-children/coordination'
sys.path.insert(0, str(COORD))
from probe import load_state, validate_receipt
receipt_path = COORD / 'receipts/XR-HISTORICAL-CUSTODY-BOUNDARY.json'
receipt = json.loads(receipt_path.read_text())
state = load_state(COORD / 'state.json')
validate_receipt(receipt, state['jobs'][receipt['job_id']], receipt['worker'])
def verify(pin):
    path = Path(pin['path'])
    if not path.is_absolute():
        path = ROOT / path
    h = hashlib.sha256()
    size = 0
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            size += len(block)
            h.update(block)
    assert size == pin['bytes'], f"byte count mismatch: {pin['path']}"
    assert h.hexdigest() == pin['sha256'], f"SHA-256 mismatch: {pin['path']}"
for pin in receipt['reviewed_evidence']:
    verify(pin)
for pin in receipt['rawlogs']:
    verify(pin)
verify(receipt['report'])
assert receipt['decision'] == 'accepted'
print('XR-HISTORICAL-CUSTODY-BOUNDARY/N1 receipt, report, evidence, and rawlogs verified')
