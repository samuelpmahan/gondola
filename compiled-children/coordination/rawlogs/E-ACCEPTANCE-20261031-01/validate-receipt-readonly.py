import hashlib
import importlib.util
import json
import pathlib

ROOT = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
COORD = ROOT / 'compiled-children/coordination'
STATE = COORD / 'state.json'
RECEIPT_PATH = COORD / 'receipts/E-ACCEPTANCE.json'
PROBE_PATH = COORD / 'probe.py'
state_before = STATE.read_bytes()
state = json.loads(state_before)
receipt = json.loads(RECEIPT_PATH.read_text())
job = state['jobs']['E-ACCEPTANCE']
assert state['workers']['N6']['job'] == 'E-ACCEPTANCE'
assert job['status'] == 'running' and job['worker'] == 'N6'
spec = importlib.util.spec_from_file_location('compiled_children_probe_readonly', PROBE_PATH)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
probe.validate_receipt(receipt, job, 'N6')
report = receipt['report']
report_bytes = (ROOT / report['path']).read_bytes()
assert len(report_bytes) == report['bytes']
assert hashlib.sha256(report_bytes).hexdigest() == report['sha256']
for item in receipt['rawlogs']:
    data = (ROOT / item['path']).read_bytes()
    assert len(data) == item['bytes'], item['path']
    assert hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
assert STATE.read_bytes() == state_before, 'scheduler state changed during validation'
print(json.dumps({
    'schema': 'gobi.compiled-children-receipt-validation/v1',
    'status': 'valid',
    'validator': 'compiled-children/coordination/probe.py::validate_receipt',
    'mode': 'read-only; pinned rebalancer interpreter; no solve/dispatch/finish call',
    'job_id': receipt['job_id'],
    'worker': receipt['worker'],
    'outcome': receipt['outcome'],
    'summaryNonempty': bool(receipt['summary'].strip()),
    'reportAndRawlogPinsMatch': True,
    'schedulerStateUnchanged': True,
}, indent=2))
