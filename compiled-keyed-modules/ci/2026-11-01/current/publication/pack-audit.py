import hashlib,json,pathlib,tarfile,io,gzip,os
p=pathlib.Path('/workspace/scratch/39a56936f173/keyed-module-coordination');out=pathlib.Path('/tmp/keyed-module-publish')
sha=lambda b:hashlib.sha256(b).hexdigest()
manifest=json.loads((out/'bundle.manifest.json').read_text());excluded=[]
root=p/'rawlogs/XR-RUN/restored'
if root.exists():
 expected={r['path']:r for r in manifest['members']};actual={str(f.relative_to(root)):f for f in root.rglob('*') if f.is_file()};assert set(actual)==set(expected)
 for name,f in actual.items():
  b=f.read_bytes();row=expected[name];assert len(b)==row['bytes'] and sha(b)==row['sha256'],name
 excluded.append({'path':str(root.relative_to(p)),'reason':'Exact duplicate extraction of the separately published primary archive; all600member paths/bytes/hashes independently verified before omission. Restore the primary archive to this path to recreate it.','members':len(actual),'archiveSHA256':manifest['archive']['sha256'] if isinstance(manifest.get('archive'),dict) and 'sha256' in manifest['archive'] else '1921ef063cd8f62f56384c72c65a0f87b26a6cabb015d3aff42040c96b6453d7'})
else:
 excluded.append({'path':'rawlogs/XR-RUN/restored','reason':'Worker removed its verified duplicate600member extract before packet freeze; exact bytes remain in the separately published primary archive. Verification is in rawlogs/XR-RUN/archive-verification.json.','members':600,'archiveSHA256':'1921ef063cd8f62f56384c72c65a0f87b26a6cabb015d3aff42040c96b6453d7','presentAtPackaging':False})
cache=p/'rawlogs/XR-RUN/native-replay/gocache'
if cache.exists():excluded.append({'path':str(cache.relative_to(p)),'reason':'Ephemeral Go build cache, not an execution result or source input; native binary, commands, source, and fresh replay outputs are retained.'})
else:
 excluded.append({'path':'rawlogs/XR-RUN/native-replay/gocache','reason':'Ephemeral Go cache cleaned before worker freeze; native binary, source, commands and all replay output retained.','presentAtPackaging':False})
(p/'audit-exclusions.json').write_text(json.dumps({'schema':'gobi.keyed-module-audit-exclusions/v1','excluded':excluded},indent=2)+'\n')
prefixes=[r['path']+'/' for r in excluded]
def files():
 return sorted(f for f in p.rglob('*') if f.is_file() and not any((str(f.relative_to(p))+'/').startswith(s) for s in prefixes))
fs=files();rows=[]
for f in fs:
 assert not f.is_symlink(),f
 b=f.read_bytes();rows.append({'path':'coordination/'+str(f.relative_to(p)),'bytes':len(b),'sha256':sha(b)})
archive=out/'audit.tar.gz'
with archive.open('wb') as raw:
 with gzip.GzipFile(filename='',mode='wb',fileobj=raw,compresslevel=9,mtime=0) as gz:
  with tarfile.open(fileobj=gz,mode='w|') as tf:
   for f,row in zip(fs,rows):
    b=f.read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'],f
    info=tarfile.TarInfo(row['path']);info.size=len(b);info.mtime=0;info.mode=0o644;tf.addfile(info,io.BytesIO(b))
assert files()==fs
for f,row in zip(fs,rows):
 b=f.read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'],f
mb=(json.dumps({'schema':'gobi.keyed-module-audit-members/v1','members':rows},indent=2)+'\n').encode();(out/'audit-members.json').write_bytes(mb)
b=archive.read_bytes();d=out/'audit';d.mkdir(exist_ok=True);parts=[]
for i,n in enumerate(range(0,len(b),1048576)):
 c=b[n:n+1048576];name='audit.part-%03d'%i;(d/name).write_bytes(c);parts.append({'name':name,'bytes':len(c),'sha256':sha(c)})
idx={'schema':'gobi.keyed-module-segments/v1','sourceCommit':'f4c8f70199a8ca896c13e225a85901abe658d0de','archive':{'bytes':len(b),'sha256':sha(b)},'manifest':{'bytes':len(mb),'sha256':sha(mb)},'parts':parts}
(out/'audit-parts.json').write_text(json.dumps(idx,indent=2)+'\n');print(json.dumps({'members':len(rows),'expandedBytes':sum(x['bytes'] for x in rows),'archive':idx['archive'],'parts':len(parts),'manifestSHA256':sha(mb),'sourceSnapshotStable':True,'excludedDuplicateMembers':600 if root.exists() else 0}))
