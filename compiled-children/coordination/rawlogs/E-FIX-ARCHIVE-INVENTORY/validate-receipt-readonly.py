import hashlib
import importlib.util
import json
import pathlib
import sys
import types

root = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
probe_path = root / 'compiled-children/coordination/probe.py'
state_path = root / 'compiled-children/coordination/state.json'
receipt_path = root / 'compiled-children/coordination/receipts/E-FIX-ARCHIVE-INVENTORY.json'
# probe.py imports ProblemSolver at module load, but validate_receipt does not use
# the solver. Stub that unused symbol to invoke the exact read-only validator
# without installing or invoking the scheduler dependency.
solver_stub = types.ModuleType('rebalancer')
solver_stub.ProblemSolver = object
sys.modules['rebalancer'] = solver_stub
spec = importlib.util.spec_from_file_location('compiled_children_probe_readonly', probe_path)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
state_bytes_before = state_path.read_bytes()
state = json.loads(state_bytes_before)
receipt = json.loads(receipt_path.read_text())
job = state['jobs']['E-FIX-ARCHIVE-INVENTORY']
assert state['workers']['N6']['job'] == job['id']
probe.validate_receipt(receipt, job, 'N6')
state_bytes_after = state_path.read_bytes()
assert state_bytes_after == state_bytes_before, 'scheduler state changed during validation'
print(json.dumps({
    'status': 'valid',
    'validator': 'compiled-children/coordination/probe.py::validate_receipt',
    'mode': 'read-only; unused ProblemSolver import stubbed; no solve/dispatch/finish call',
    'stateUnchanged': True,
    'job_id': job['id'],
    'worker': 'N6',
    'outcome': receipt['outcome'],
    'summaryNonempty': bool(receipt['summary'].strip()),
}, indent=2))
