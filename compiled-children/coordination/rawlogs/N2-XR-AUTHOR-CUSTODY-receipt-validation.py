#!/usr/bin/env python3
import hashlib
import json
import sys
from pathlib import Path
ROOT = Path.cwd()
COORD = ROOT / 'compiled-children/coordination'
sys.path.insert(0, str(COORD))
from probe import load_state, validate_receipt
receipt = json.loads((COORD / 'receipts/XR-AUTHOR-CUSTODY.json').read_text())
state = load_state(COORD / 'state.json')
validate_receipt(receipt, state['jobs'][receipt['job_id']], receipt['worker'])
def verify(pin):
    data = (ROOT / pin['path']).read_bytes()
    assert len(data) == pin['bytes'], f"byte count mismatch: {pin['path']}"
    assert hashlib.sha256(data).hexdigest() == pin['sha256'], f"SHA-256 mismatch: {pin['path']}"
for pin in receipt['sourceArtifacts']:
    verify(pin)
assert receipt['sourceSha256'] == {pin['path']: pin['sha256'] for pin in receipt['sourceArtifacts']}
for pin in receipt['rawlogs']:
    verify(pin)
verify(receipt['report'])
print('XR-AUTHOR-CUSTODY/N2 receipt identity, decision, source pins, rawlog pins, and report pin verified')
