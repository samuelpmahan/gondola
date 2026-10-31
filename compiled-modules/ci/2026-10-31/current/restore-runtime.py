#!/usr/bin/env python3
"""Verify and restore the published runtime capture using only Python stdlib."""
import hashlib, io, json, pathlib, sys, tarfile
base=pathlib.Path(__file__).resolve().parent
out=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'restored-modules').resolve()
if out.exists(): raise SystemExit('destination must not already exist')
h=lambda b: hashlib.sha256(b).hexdigest()
index=json.loads((base/'runtime-parts.json').read_text())
chunks=[]
for row in index['parts']:
    data=(base/'runtime'/row['name']).read_bytes()
    assert len(data)==row['bytes'] and h(data)==row['sha256'], row['name']
    chunks.append(data)
raw=b''.join(chunks); meta=index['archive']
assert len(raw)==meta['bytes'] and h(raw)==meta['sha256'], 'archive digest'
manifest_bytes=(base/'runtime.manifest.json').read_bytes()
assert h(manifest_bytes)==meta['manifestSHA256'], 'manifest digest'
manifest=json.loads(manifest_bytes); expected={r['path']:r for r in manifest['members']}
assert len(expected)==len(manifest['members'])==529
verified=[]; seen=set()
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as archive:
    for item in archive:
        name=item.name; p=pathlib.PurePosixPath(name)
        assert item.isfile() and not p.is_absolute() and '..' not in p.parts and name==str(p) and name not in seen, name
        seen.add(name); row=expected[name]; data=archive.extractfile(item).read()
        assert len(data)==row['bytes'] and h(data)==row['sha256'], name
        verified.append((name,data))
assert seen==set(expected)
out.mkdir()
for name,data in verified:
    target=out/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
print(json.dumps({'status':'passed','members':len(seen),'archiveSHA256':h(raw),'destination':str(out)}))
