import hashlib
import json
from pathlib import Path

root = Path('/workspace/scratch/39a56936f173/gondola-next')
files = [
    'compiled-children/evidence-preflight/pre-repair-author-review-history.final.tar.gz',
    'compiled-children/evidence-preflight/pre-repair-author-review-history.retry1.tar.gz',
    'compiled-children/evidence-preflight/archive-inventory.final.json',
    'compiled-children/evidence-preflight/archive-inventory.retry1.json',
    'compiled-children/coordination/receipts/E-PUBLISHED-HISTORY-CUSTODY.json',
    'compiled-children/coordination/reports/E-PUBLISHED-HISTORY-CUSTODY.md',
    'compiled-children/coordination/receipts/XR-PUBLISHED-HISTORY-CUSTODY.json',
    'compiled-children/coordination/reports/XR-PUBLISHED-HISTORY-CUSTODY.md',
    'compiled-children/coordination/receipts/XR-HISTORICAL-CUSTODY-BOUNDARY.json',
    'compiled-children/coordination/reports/XR-HISTORICAL-CUSTODY-BOUNDARY.md',
]
items = []
for rel in files:
    path = root / rel
    digest = hashlib.sha256()
    size = 0
    with path.open('rb') as f:
        while True:
            block = f.read(1024 * 1024)
            if not block:
                break
            size += len(block)
            digest.update(block)
    items.append({'path': rel, 'bytes': size, 'sha256': digest.hexdigest()})
assert items[0]['bytes'] == 164464000
assert items[0]['sha256'] == 'a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0'
assert items[1]['bytes'] == 167917858
assert items[1]['sha256'] == '954bad6b31df16f92c8297d64a53029c26159c3aeede1694d53a626a90c4f1a7'
record = {
    'schema': 'gobi.compiled-children-historical-custody-pin-check/v1',
    'status': 'matched',
    'selectedPublished': {'members': 875, **items[0]},
    'retry1Superseded': {'members': 902, **items[1]},
    'inventoryAndPacketPins': items[2:],
    'unresolvedCleanupBoundary': {
        'removedFiles': 903,
        'unverifiedExtraBytes': 29884416,
        'identityProven': False,
        'all903RecoveryClaim': False,
        'source': 'XR-HISTORICAL-CUSTODY-BOUNDARY receipt and report',
    },
}
out = root / 'compiled-children/coordination/rawlogs/E-FINAL-ACCEPTANCE-20261031-01/historical-custody-pin-verification.json'
out.write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2))
