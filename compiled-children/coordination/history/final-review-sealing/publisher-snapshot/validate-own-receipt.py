#!/usr/bin/env python3
"""Read-only validation of the final N5 review receipt and rawlog manifest."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path('/workspace/scratch/39a56936f173/gondola-next')
COORD = ROOT / 'compiled-children/coordination'
STATE = COORD / 'state.json'
RECEIPT_PATH = COORD / 'receipts/XR-FINAL-ACCEPTANCE.json'
PROBE_PATH = COORD / 'probe.py'


def check_pin(path, size, sha):
    raw = path.read_bytes()
    if len(raw) != size or hashlib.sha256(raw).hexdigest() != sha:
        raise AssertionError(f'pin mismatch: {path}')


state_before = STATE.read_bytes()
state = json.loads(state_before)
receipt = json.loads(RECEIPT_PATH.read_text())
job = state['jobs']['XR-FINAL-ACCEPTANCE']
if job.get('worker') != 'N5' or job.get('status') not in {'running', 'done'}:
    raise AssertionError(f'unexpected reviewer job state: {job}')
spec = importlib.util.spec_from_file_location('compiled_children_probe_xr_final_receipt', PROBE_PATH)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
probe.validate_receipt(receipt, job, 'N5')
check_pin(ROOT / receipt['report']['path'], receipt['report']['bytes'], receipt['report']['sha256'])
for item in receipt['rawlogs']:
    check_pin(ROOT / item['path'], item['bytes'], item['sha256'])
manifest_info = receipt['rawlogManifest']
manifest_path = ROOT / manifest_info['path']
check_pin(manifest_path, manifest_info['bytes'], manifest_info['sha256'])
manifest = json.loads(manifest_path.read_text())
pins = {x['path']: x for x in receipt['rawlogs']}
entries = {x['path']: x for x in manifest['rawlogs']}
if len(pins) != manifest['rawlogCount'] or pins != entries:
    raise AssertionError('receipt rawlog list and manifest entries differ')
if state_before != STATE.read_bytes():
    raise AssertionError('scheduler state changed during read-only review validation')
print(json.dumps({
    'schema': 'gobi.compiled-children-xr-final-receipt-validation/v1',
    'status': 'valid',
    'job_id': receipt['job_id'],
    'worker': receipt['worker'],
    'decision': receipt['decision'],
    'rawlogCount': len(pins),
    'reportAndRawlogPinsMatch': True,
    'schedulerStateUnchanged': True,
    'mode': 'read-only; pinned probe.py receipt validator; no scheduler transition',
}, indent=2, sort_keys=True))
