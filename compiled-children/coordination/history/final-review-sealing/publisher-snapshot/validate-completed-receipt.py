#!/usr/bin/env python3
"""Run the pinned receipt protocol validator read-only after packet closure."""
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path('/workspace/scratch/39a56936f173/gondola-next')
COORD = ROOT / 'compiled-children/coordination'
STATE = COORD / 'state.json'
RECEIPT_PATH = COORD / 'receipts/E-FINAL-ACCEPTANCE.json'
PROBE_PATH = COORD / 'probe.py'


def pinned(path, expected_bytes, expected_sha):
    raw = path.read_bytes()
    if len(raw) != expected_bytes or hashlib.sha256(raw).hexdigest() != expected_sha:
        raise AssertionError(f'pin mismatch: {path}')


state_before = STATE.read_bytes()
state = json.loads(state_before)
receipt = json.loads(RECEIPT_PATH.read_text())
job = state['jobs']['E-FINAL-ACCEPTANCE']
if state['workers']['N6']['job'] is not None:
    raise AssertionError('closed N6 worker unexpectedly has an active job')
if (job['status'], job['worker']) != ('done', 'N6'):
    raise AssertionError(f'unexpected closed job state: {job}')
spec = importlib.util.spec_from_file_location('compiled_children_probe_xr_final_acceptance', PROBE_PATH)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
probe.validate_receipt(receipt, job, 'N6')
pinned(ROOT / receipt['report']['path'], receipt['report']['bytes'], receipt['report']['sha256'])
for item in receipt['rawlogs']:
    pinned(ROOT / item['path'], item['bytes'], item['sha256'])
manifest = receipt['rawlogManifest']
pinned(ROOT / manifest['path'], manifest['bytes'], manifest['sha256'])
state_after = STATE.read_bytes()
if state_before != state_after:
    raise AssertionError('scheduler state changed during read-only validation')
print(json.dumps({
    'schema': 'gobi.compiled-children-xr-final-receipt-validation/v1',
    'status': 'valid',
    'validator': 'compiled-children/coordination/probe.py::validate_receipt',
    'job_id': receipt['job_id'],
    'worker': receipt['worker'],
    'priorJobStatus': job['status'],
    'outcome': receipt['outcome'],
    'reportAndRawlogPinsMatch': True,
    'schedulerStateUnchanged': True,
    'mode': 'read-only; pinned rebalancer Python; no scheduler solve/dispatch/finish',
}, indent=2, sort_keys=True))
