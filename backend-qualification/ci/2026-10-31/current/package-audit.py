import gzip,hashlib,io,json,pathlib,tarfile

root=pathlib.Path('/workspace/scratch/39a56936f173/gondola-qualification')
stage=pathlib.Path('/tmp/gondola-qualification-publish')
mapping={}
coord=root/'backend-qualification/coordination'
for p in coord.rglob('*'):
    if p.is_file() and '__pycache__' not in p.parts:
        mapping[p.relative_to(root).as_posix()]=p
for p in (root/'interaction/coordination').rglob('*'):
    if p.is_file() and 'E-COUNTER-REGRESSION' in str(p):
        mapping[p.relative_to(root).as_posix()]=p
trace=root/'interaction/build/interaction-traces-seed-20261030.json'
mapping[trace.relative_to(root).as_posix()]=trace
parent=root.parent/'gondola-publications'
for base in ['compiled-publications/evidence/attempts/attempt-20261031T181141849Z-6','compiled-publications/demo/output/attempts']:
    directory=parent/base
    for p in directory.iterdir():
        if p.is_file() and (p.name in ['receipt.json','report.md'] or p.name=='attempt-20261031T181141849Z-6.archive-manifest.json'):
            mapping['parent-publications/'+p.relative_to(parent).as_posix()]=p
rows=[]
out=stage/'audit.tar.gz'
with out.open('wb') as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0,compresslevel=6) as zipped,tarfile.open(fileobj=zipped,mode='w|') as tar:
    for name,p in sorted(mapping.items()):
        data=p.read_bytes()
        info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o444;info.mtime=0
        tar.addfile(info,io.BytesIO(data))
        rows.append({'path':name,'sourcePath':str(p),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        assert p.read_bytes()==data, f'input changed: {p}'
data=out.read_bytes()
manifest={'schema':'gobi.qualification-coordination-audit/v1','sourceCommit':'77f7ce36439f1ae457a397269ea5a8c6d2db1cb2','archive':{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},'members':rows,'rawBytes':sum(x['bytes'] for x in rows)}
(stage/'audit.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
parts=[]
for i,start in enumerate(range(0,len(data),4000000)):
    b=data[start:start+4000000];p=stage/f'audit.part{i:03}';p.write_bytes(b)
    parts.append({'path':str(p),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'gitBlob':hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()})
(stage/'audit-parts.json').write_text(json.dumps(parts,indent=2)+'\n')
print(json.dumps({'members':len(rows),'rawBytes':manifest['rawBytes'],'archive':manifest['archive'],'parts':parts}))
