import hashlib
import json
import pathlib

paths = [
    (pathlib.Path('/workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6.tar.gz'), 52324311, '57b2b63e5549e6e2a944c1f9658f165606847e701f809782c8d64f1759bcef4d'),
    (pathlib.Path('/workspace/scratch/39a56936f173/gondola-next/compiled-children/demo/output/attempts/attempt-20261031T133620538Z-6.archive-manifest.json'), 86400, '6a5822c0cfbd90f8327b7bc274cebd15509e13e3e29affa344d9210a2fd0b0c4'),
]
result=[]
for path, expected_bytes, expected_sha in paths:
    raw=path.read_bytes()
    actual_sha=hashlib.sha256(raw).hexdigest()
    assert len(raw)==expected_bytes and actual_sha==expected_sha, path
    result.append({'path':str(path),'bytes':len(raw),'sha256':actual_sha,'matchesRootPreservedPin':True})
print(json.dumps({'status':'matched','artifacts':result},indent=2))
