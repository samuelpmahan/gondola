import importlib.util
import json
import pathlib

root = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
probe_path = root / 'compiled-children/coordination/probe.py'
spec = importlib.util.spec_from_file_location('compiled_children_probe_readonly', probe_path)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
state_path = root / 'compiled-children/coordination/state.json'
receipt_path = root / 'compiled-children/coordination/receipts/E-FIX-ARCHIVE-INVENTORY.json'
state = json.loads(state_path.read_text())
receipt = json.loads(receipt_path.read_text())
job = state['jobs']['E-FIX-ARCHIVE-INVENTORY']
assert state['workers']['N6']['job'] == job['id']
probe.validate_receipt(receipt, job, 'N6')
print(json.dumps({
    'status': 'valid',
    'mode': 'read-only validate_receipt; no state mutation',
    'job_id': job['id'],
    'worker': 'N6',
    'outcome': receipt['outcome'],
    'summaryNonempty': bool(receipt['summary'].strip()),
}, indent=2))
