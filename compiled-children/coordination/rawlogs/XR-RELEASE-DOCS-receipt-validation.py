import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
COORD = ROOT / 'compiled-children' / 'coordination'
sys.path.insert(0, str(COORD))
from probe import validate_receipt  # noqa: E402

receipt = json.loads((COORD / 'receipts' / 'XR-RELEASE-DOCS.json').read_text())
state = json.loads((COORD / 'state.json').read_text())
validate_receipt(receipt, state['jobs'][receipt['job_id']], receipt['worker'])

def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()

for path, expected in receipt['sourceSha256'].items():
    if sha(path) != expected:
        raise SystemExit(f'source pin mismatch: {path}')
report = receipt['report']
if sha(report['path']) != report['sha256'] or (ROOT / report['path']).stat().st_size != report['bytes']:
    raise SystemExit('report pin mismatch')
for check in receipt['checks']:
    for field in ('rawlog', 'script'):
        record = check.get(field)
        if isinstance(record, dict) and 'path' in record:
            path = record['path']
            if sha(path) != record['sha256'] or (ROOT / path).stat().st_size != record['bytes']:
                raise SystemExit(f'{field} pin mismatch: {path}')
for record in receipt.get('rawlogs', []):
    path = record['path']
    if sha(path) != record['sha256'] or (ROOT / path).stat().st_size != record['bytes']:
        raise SystemExit(f'rawlog pin mismatch: {path}')
print('receipt identity/decision and all pinned source, report, and check evidence: passed')
