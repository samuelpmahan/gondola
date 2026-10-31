import pathlib,json,hashlib,tarfile,gzip,io
root=pathlib.Path('/workspace/scratch/39a56936f173')
out=pathlib.Path('/tmp/portable-publish');mapping={}
def add_tree(base,prefix):
    for p in base.rglob('*'):
        if p.is_file() and '__pycache__' not in p.parts and not p.name.endswith('.pyc'):
            mapping[prefix+'/'+p.relative_to(base).as_posix()]=p
add_tree(root/'portable-coordination','coordination')
add_tree(pathlib.Path('/tmp/xr-certificate-json-boundaries'),'qualified-before-counterexamples')
add_tree(pathlib.Path('/tmp/qualification-complete/hosted'),'supplemented-hosted-input')
mapping['hosted-original/artifact.zip']=pathlib.Path('/tmp/qualification-hosted/artifact.zip')
mapping['hosted-original/receipt.json']=pathlib.Path('/tmp/qualification-hosted/receipt.json')
for label in ['f7874237','a275d646']:
    add_tree(pathlib.Path('/tmp/gobi-portable-root-'+label),'portable-run-'+label)
add_tree(out/'reconstruction','member-exact-reconstruction')
for p in (root/'gondola/backend-qualification/evidence/attempts').rglob('*'):
    if p.is_file():mapping['producer-evidence/'+p.relative_to(root/'gondola/backend-qualification/evidence/attempts').as_posix()]=p
first=root/'gondola/backend-qualification/output/attempts/attempt-20261031T194647499Z-14'
add_tree(first,'first-sparse-checkout-current-files')
for p in (root/'gondola/backend-qualification/output/attempts').glob('*.archive-manifest.json'):
    mapping['producer-manifests/'+p.name]=p
for p in (root/'gondola/backend-qualification/output/attempts').glob('*.tar.gz'):
    if '200506490' not in p.name:mapping['damaged-originals/'+p.name]=p
mapping['counter/interaction-traces-seed-20261030.json']=root/'gondola/interaction/build/interaction-traces-seed-20261030.json'
rows=[];archive=out/'audit.tar.gz'
with archive.open('wb') as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0,compresslevel=6) as gz,tarfile.open(fileobj=gz,mode='w|',format=tarfile.GNU_FORMAT) as tar:
    for name,p in sorted(mapping.items()):
        data=p.read_bytes();header=tarfile.TarInfo(name);header.size=len(data);header.mode=0o444;header.mtime=0;tar.addfile(header,io.BytesIO(data))
        pin={'path':name,'sourcePath':str(p),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()};rows.append(pin)
        assert p.read_bytes()==data,f'input changed during audit packaging: {p}'
data=archive.read_bytes();parts=[]
for i,start in enumerate(range(0,len(data),1048576)):
    b=data[start:start+1048576];p=out/f'audit.part{i:03}';p.write_bytes(b);parts.append({'file':p.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'gitBlob':hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()})
manifest={'schema':'gobi.portable-qualification-audit/v1','sourceCommit':'a275d646b0d8ceed956b27b6b8f3099e17106857','members':rows,'rawBytes':sum(r['bytes'] for r in rows),'archive':{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},'parts':parts}
(out/'audit.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'members':len(rows),'rawBytes':manifest['rawBytes'],'archive':manifest['archive'],'parts':len(parts)}))
