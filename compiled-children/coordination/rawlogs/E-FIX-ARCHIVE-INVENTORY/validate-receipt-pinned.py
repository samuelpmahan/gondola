import hashlib
import importlib.util
import json
import pathlib

root = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
probe_path = root / 'compiled-children/coordination/probe.py'
state_path = root / 'compiled-children/coordination/state.json'
receipt_path = root / 'compiled-children/coordination/receipts/E-FIX-ARCHIVE-INVENTORY.json'
spec = importlib.util.spec_from_file_location('compiled_children_probe_readonly', probe_path)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
state_bytes_before = state_path.read_bytes()
state = json.loads(state_bytes_before)
receipt = json.loads(receipt_path.read_text())
job = state['jobs']['E-FIX-ARCHIVE-INVENTORY']
assert state['workers']['N6']['job'] == job['id']
probe.validate_receipt(receipt, job, 'N6')
assert state_path.read_bytes() == state_bytes_before, 'scheduler state changed during validation'
print(json.dumps({
    'status': 'valid',
    'validator': 'compiled-children/coordination/probe.py::validate_receipt',
    'mode': 'read-only; actual pinned rebalancer interpreter; no solve/dispatch/finish call',
    'stateUnchanged': True,
    'job_id': job['id'],
    'worker': 'N6',
    'outcome': receipt['outcome'],
    'summaryNonempty': bool(receipt['summary'].strip()),
}, indent=2))
