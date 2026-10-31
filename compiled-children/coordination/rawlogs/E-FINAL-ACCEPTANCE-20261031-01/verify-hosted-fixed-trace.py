import hashlib
import json
import pathlib
import tarfile

root = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
ci = pathlib.Path('/tmp/gondola-source462-ci')
hosted = root / 'compiled-children/coordination/hosted-source-462'
archive = ci / 'children-final.tar.gz'
manifest = json.loads((hosted / 'children-archive-inventory.json').read_text())
entry = next(x for x in manifest['members'] if x['path'] == 'harness/run.check.json')
with tarfile.open(archive, mode='r:gz') as tar:
    member = tar.getmember('harness/run.check.json')
    assert member.isfile()
    data = tar.extractfile(member).read()
assert len(data) == entry['bytes']
assert hashlib.sha256(data).hexdigest() == entry['sha256']
check = json.loads(data)
assert check['status'] == 'matched'
assert check['events'] == 42 and check['goUpdates'] == 38 and check['stateCheckpoints'] == 39
assert check['swaps'] == 2 and check['mutationControlsDetected'] == 12
record = {
  'schema':'gobi.compiled-children-hosted-fixed-trace-verification/v1',
  'status':'matched',
  'pathInArchive':'harness/run.check.json',
  'bytes':len(data),
  'sha256':hashlib.sha256(data).hexdigest(),
  'manifestPin':{'bytes':entry['bytes'],'sha256':entry['sha256']},
  'events':check['events'],'goUpdates':check['goUpdates'],'stateCheckpoints':check['stateCheckpoints'],
  'swaps':check['swaps'],'mutationControlsDetected':check['mutationControlsDetected'],
  'method':'Read only the small listed member from the already-verified tar stream; no extraction or archive copy.'
}
out=root/'compiled-children/coordination/rawlogs/E-FINAL-ACCEPTANCE-20261031-01/hosted-fixed-trace-verification.json'
out.write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
