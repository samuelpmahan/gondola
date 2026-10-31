#!/usr/bin/env python3
import hashlib
import json
import sys
from pathlib import Path
ROOT = Path.cwd()
COORD = ROOT / 'compiled-children/coordination'
sys.path.insert(0, str(COORD))
from probe import load_state, validate_receipt
receipt = json.loads((COORD / 'receipts/E-PUBLISHED-HISTORY-CUSTODY.json').read_text())
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
audit = json.loads((COORD / 'rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.json').read_text())
assert audit['commit'] == receipt['published_history']['commit']
assert audit['tree'] == receipt['published_history']['tree']
assert audit['parent'] == receipt['published_history']['parent']
assert audit['manifest']['archive_sha256'] == receipt['published_history']['archive_sha256']
assert audit['published_files'] == receipt['publishedGitObjects']
print('E-PUBLISHED-HISTORY-CUSTODY/N2 receipt identity, published objects, source pins, rawlogs, and report verified')
