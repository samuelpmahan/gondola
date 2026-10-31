from pathlib import Path
import hashlib,json,tarfile,gzip,io,sys
root=Path('/workspace/scratch/39a56936f173/gondola-publications')
out=Path('/tmp/gondola-publications-publish')
s=json.loads((root/'compiled-publications/coordination/state.json').read_text())
assert all(j['status']=='done' for j in s['jobs'].values()), 'native packets still open'
rows=[]
for sub in ['compiled-publications/coordination','compiled-publications/compiler','compiled-publications/evidence/attempts']:
 for p in sorted((root/sub).rglob('*')):
  if p.is_file() and '__pycache__' not in p.parts:rows.append((p,str(p.relative_to(root))))
for pattern in ['attempt-20261031T165233358Z-35.tar.gz','attempt-20261031T165233358Z-35.archive-manifest.json']:
 p=root/'compiled-publications/demo/output/attempts'/pattern;rows.append((p,str(p.relative_to(root))))
rows.append((Path('/workspace/scratch/39a56936f173/gondola-publications-clean/interaction/build/interaction-traces-seed-20261030.json'),'compiled-publications/ci/2026-10-31/current/counter/trace.json'))
assert len({n for p,n in rows})==len(rows)
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(1024*1024):h.update(b)
 return h.hexdigest()
manifest={'schema':'gobi.supplementary-audit-manifest/v1','scope':'All regular coordination/compiler/evidence files, original C3 archive, and original-counter trace; historical partial/failed files are custody bytes, not passing results','members':[]}
arc=out/'supplementary-audit.tar.gz'
with arc.open('wb') as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0,compresslevel=6) as gz,tarfile.open(fileobj=gz,mode='w|') as tar:
 for p,name in sorted(rows,key=lambda x:x[1]):
  size=p.stat().st_size;sha=digest(p);info=tarfile.TarInfo(name);info.size=size;info.mode=0o644;info.mtime=0
  with p.open('rb') as f:tar.addfile(info,f)
  assert p.stat().st_size==size and digest(p)==sha,name
  manifest['members'].append({'path':name,'bytes':size,'sha256':sha})
expected={r['path']:r for r in manifest['members']};seen=set()
with tarfile.open(arc,'r|gz') as tar:
 for entry in tar:
  assert entry.isfile() and entry.name in expected and entry.name not in seen,entry.name
  f=tar.extractfile(entry);h=hashlib.sha256();count=0
  while b:=f.read(1024*1024):h.update(b);count+=len(b)
  assert count==expected[entry.name]['bytes'] and h.hexdigest()==expected[entry.name]['sha256'],entry.name
  seen.add(entry.name)
assert len(seen)==len(expected)
manifest.update({'archiveBytes':arc.stat().st_size,'archiveSha256':digest(arc),'roundTripMembersVerified':len(seen),'uncompressedMemberBytes':sum(r['bytes'] for r in manifest['members'])})
(out/'supplementary-audit-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
parts=[]
with arc.open('rb') as f:
 i=0
 while b:=f.read(4*1024*1024):
  p=out/('audit.part%03d'%i);p.write_bytes(b);parts.append({'local':str(p),'path':'compiled-publications/ci/2026-10-31/current/audit.tar.gz.part%03d'%i,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'gitSha':hashlib.sha1(('blob '+str(len(b))+'\0').encode()+b).hexdigest()});i+=1
(out/'audit-parts.json').write_text(json.dumps(parts,indent=2)+'\n')
print(json.dumps({k:v for k,v in manifest.items() if k!='members'},indent=2));print('parts',len(parts))
