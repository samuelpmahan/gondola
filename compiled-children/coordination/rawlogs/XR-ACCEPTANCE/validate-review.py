#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
import sys
ROOT = Path.cwd().resolve()
COORD = ROOT / 'compiled-children/coordination'
sys.path.insert(0, str(COORD))
from probe import load_state, validate_receipt
state_path = COORD / 'state.json'
state_before = state_path.read_bytes()
state = json.loads(state_before)
acceptance = json.loads((COORD / 'receipts/E-ACCEPTANCE.json').read_text())
validate_receipt(acceptance, state['jobs']['E-ACCEPTANCE'], 'N6')
receipt_path = COORD / 'receipts/XR-ACCEPTANCE.json'
receipt = json.loads(receipt_path.read_text())
validate_receipt(receipt, state['jobs']['XR-ACCEPTANCE'], 'N1')
def verify(pin):
    path = Path(pin['path'])
    if not path.is_absolute(): path = ROOT / path
    h = hashlib.sha256(); size = 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            size += len(block); h.update(block)
    assert size == pin['bytes'], f"byte count mismatch: {pin['path']}"
    assert h.hexdigest() == pin['sha256'], f"SHA-256 mismatch: {pin['path']}"
for pin in receipt['reviewed_evidence']: verify(pin)
for pin in receipt['rawlogs']: verify(pin)
verify(receipt['report'])
assert state_path.read_bytes() == state_before, 'scheduler state changed during validation'
print('XR-ACCEPTANCE/N1 native receipt validation passed; author receipt, reviewer evidence, report and rawlogs are pinned; scheduler state unchanged')
