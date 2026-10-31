#!/usr/bin/env python3
"""Verify retained CI ZIPs, terminal workflow evidence and closed review packets."""
import hashlib
import io
import json
from pathlib import Path
import zipfile

HERE = Path(__file__).resolve().parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

def load(path):
    return json.loads(path.read_text())

def verify_zip(root):
    manifest = load(root / 'artifact-retention.json')
    raw = bytearray()
    for chunk in manifest['chunks']:
        data = (root / chunk['path']).read_bytes()
        assert len(data) == chunk['bytes'] and digest(data) == chunk['sha256'], chunk['path']
        raw.extend(data)
    assert len(raw) == manifest['providerZipBytes']
    assert digest(raw) == manifest['providerZipSha256']
    archive = zipfile.ZipFile(io.BytesIO(raw))
    assert archive.testzip() is None
    files = {x.filename for x in archive.infolist() if not x.is_dir()}
    assert files == {x['path'] for x in manifest['members']}
    for entry in manifest['members']:
        data = archive.read(entry['path'])
        assert len(data) == entry['bytes'] and digest(data) == entry['sha256'], entry['path']
    return {'files': len(files), 'bytes': len(raw), 'sha256': digest(raw)}

primary = verify_zip(HERE)
initial = verify_zip(HERE / 'initial-source8ed')
snapshot = load(HERE / 'lanes/evidence/snapshots/jobs-2026-10-31T050732-682Z-6b49cc0-terminal.json')
assert snapshot['sourceSha'] == '6b49cc0bd4c9512a041f723c86b632ec506afd9d'
assert snapshot['sourceTree'] == 'b28b10ccefd78f7a90d6d66f2b6769b426ed6a81'
assert len(snapshot['runs']) == 26
merge = load(HERE / 'merge-test-object.json')['commit']
assert merge['tree']['sha'] == snapshot['sourceTree']
assert [parent['sha'] for parent in merge['parents']] == ['195c9433179218348d4b9f2477ae1e0725337d15', snapshot['sourceSha']]
m0 = load(HERE / 'milestone0-preservation.json')
assert m0['manifestByteIdentical'] and m0['entries'] == 24 and m0['trackedSourceEntries'] == 23
assert m0['changedReceiptedSourcePaths'] == []
jobs = [job for run in snapshot['runs'] for job in run['structuredContent']['jobs']]
assert len(jobs) == 26 and all(x['status'] == 'completed' and x['conclusion'] == 'success' for x in jobs)
state = load(HERE / 'coordination/state.json')
assert len(state['jobs']) == 16
assert all(record['job'] is None for record in state['workers'].values())
for job_id, job in state['jobs'].items():
    assert job['status'] == 'done', job_id
    receipt = load(HERE / 'coordination/receipts' / (job_id + '.json'))
    assert receipt['job_id'] == job_id and receipt['worker'] == job['worker']
    assert receipt['summary'].strip()
    if job['kind'] == 'review':
        if receipt['decision'] == 'amend':
            assert job_id in ('XR-CI-GO', 'XR-CI-DEMO')
            repair_review = job_id.replace('XR-', 'XR-R-', 1)
            assert state['jobs'][repair_review]['status'] == 'done'
            assert load(HERE / 'coordination/receipts' / (repair_review + '.json'))['decision'] == 'accepted'
        else:
            assert receipt['decision'] == 'accepted', job_id
        assert job['worker'] != state['jobs'][job['depends_on']]['worker']
    else:
        assert receipt['outcome'] != 'insufficient_evidence', job_id
for event in state['events']:
    if event['type'] == 'solve':
        assert event['exact_score'] == event['native_score']
        assert event['native_constraints']['brokenCount'] == 0
print(json.dumps({'status': 'passed', 'source': snapshot['sourceSha'], 'workflows': 26, 'ciPacketsClosed': 16, 'primary': primary, 'initialRejectedRun': initial}, indent=2))
