import hashlib
import json
import pathlib

PRIMARY = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
SOURCE_ROOT = pathlib.Path('/workspace/scratch/39a56936f173/gondola-children-archive')
DELIVERY = PRIMARY / 'compiled-children/coordination/current-full-source-462/E-DELIVERY.json'

def pin(path):
    digest = hashlib.sha256()
    size = 0
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
            size += len(chunk)
    return {'bytes': size, 'sha256': digest.hexdigest()}

receipt = json.loads(DELIVERY.read_text())
assert receipt['job_id'] == 'E-DELIVERY' and receipt['status'] == 'passed' and receipt['mode'] == 'full'
assert receipt['failures'] == [] and receipt['mismatches'] == []
assert receipt['sourcePinsMatch'] is True and receipt['boundariesVerified'] is True
before = receipt['sourceBefore']
after = receipt['sourceAfter']
assert before == after, 'source-before and source-after pin records differ'
assert len(before) == len(after) == receipt['boundaries'][0]['count'] == receipt['boundaries'][1]['count']
seen = set()
mismatches = []
for expected in before:
    rel = pathlib.PurePosixPath(expected['path'])
    if rel.is_absolute() or '..' in rel.parts or expected['path'] in seen:
        mismatches.append({'path': expected['path'], 'error': 'unsafe or duplicate source path'})
        continue
    seen.add(expected['path'])
    path = SOURCE_ROOT.joinpath(*rel.parts)
    try:
        path.resolve().relative_to(SOURCE_ROOT.resolve())
        actual = pin(path)
    except (OSError, ValueError) as error:
        mismatches.append({'path': expected['path'], 'error': str(error)})
        continue
    if actual != {'bytes': expected['bytes'], 'sha256': expected['sha256']}:
        mismatches.append({'path': expected['path'], 'expected': expected, 'actual': actual})
assert not mismatches, json.dumps(mismatches[:5], indent=2)
print(json.dumps({
    'schema': 'gobi.compiled-children-source-boundary-independent-check/v1',
    'status': 'matched',
    'sourceRoot': str(SOURCE_ROOT),
    'sourcePinCount': len(before),
    'sourceBeforeEqualsSourceAfter': True,
    'allPhysicalFilesMatchReceipt': True,
    'mismatches': mismatches,
    'boundaryRecords': receipt['boundaries'],
}, indent=2))
