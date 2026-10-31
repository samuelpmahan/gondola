#!/usr/bin/env python3
import hashlib
import json
import sys
from pathlib import Path
ROOT = Path.cwd()
COORD = ROOT / 'compiled-children/coordination'
sys.path.insert(0, str(COORD))
from probe import load_state, validate_receipt
receipt = json.loads((COORD / 'receipts/E-HISTORICAL-CUSTODY-BOUNDARY.json').read_text())
state = load_state(COORD / 'state.json')
validate_receipt(receipt, state['jobs'][receipt['job_id']], receipt['worker'])
def sha_file(path):
    h = hashlib.sha256(); size=0
    with path.open('rb') as f:
        while True:
            block=f.read(1024*1024)
            if not block: break
            size+=len(block); h.update(block)
    return size,h.hexdigest()
def verify(pin):
    path=Path(pin['path'])
    if not path.is_absolute(): path=ROOT/path
    size,digest=sha_file(path)
    assert size==pin['bytes'],f"byte count mismatch: {pin['path']}"
    assert digest==pin['sha256'],f"SHA-256 mismatch: {pin['path']}"
for pin in receipt['sourceArtifacts']:
    verify(pin)
assert receipt['sourceSha256']=={x['path']:x['sha256'] for x in receipt['sourceArtifacts']}
for pin in receipt['rawlogs']:
    verify(pin)
verify(receipt['report'])
verify(receipt['retainedCandidate'])
audit=json.loads((COORD/'rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-verify-final.json').read_text())
assert audit['result']=='retry1_and_cleanup_boundary_verified'
assert audit['archive']['sha256']==receipt['retry1']['sha256']
assert audit['archive']['member_count']==receipt['retry1']['members']
assert audit['mistaken_archive_root_cleanup_boundary']['candidate_identity_or_equality_to_deleted_extra_proven'] is False
print('E-HISTORICAL-CUSTODY-BOUNDARY/N2 receipt, retry1 member stream, cleanup records, candidate, sources, and logs verified')
