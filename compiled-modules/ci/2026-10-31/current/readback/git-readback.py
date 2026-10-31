import subprocess,pathlib,json,hashlib,sys,tarfile,io
repo=pathlib.Path('/workspace/scratch/39a56936f173/gondola'); prefix='compiled-modules/ci/2026-10-31/current/'
branch='codex/gobi-independent-modules-acceptance-20261031'; commit=sys.argv[1]
def git(*a,input=None):
 r=subprocess.run(['git','-C',str(repo),*a],input=input,capture_output=True)
 if r.returncode: raise RuntimeError(r.stderr.decode(errors='replace')[:4000])
 return r.stdout
fetch=git('fetch','--no-tags','--filter=blob:none','origin',branch)
assert git('rev-parse','FETCH_HEAD').decode().strip()==commit
rows=[]
for line in git('ls-tree','-r','-z',commit,'--',prefix).split(b'\0'):
 if not line:continue
 meta,path=line.split(b'\t');mode,kind,sha=meta.split();assert kind==b'blob';rows.append({'path':path.decode()[len(prefix):],'gitsha':sha.decode()})
# Explicitly request all new evidence blobs together; avoid one lazy fetch per object.
for i in range(0,len(rows),150):git('fetch','--no-tags','origin',*[r['gitsha'] for r in rows[i:i+150]])
out=pathlib.Path('/tmp/modules-publish/git-readback');out.mkdir(exist_ok=False)
inv=[]
for row in rows:
 data=git('cat-file','blob',row['gitsha']);f=out/row['path'];f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(data)
 inv.append({**row,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
expected=json.loads(pathlib.Path('/tmp/modules-publish/expected-publication.json').read_text()); actual={r['path']:r for r in inv}
assert set(actual)==set(expected), {'missing':list(set(expected)-set(actual)),'extra':list(set(actual)-set(expected))}
for path,pin in expected.items():assert all(actual[path][k]==pin[k] for k in ['bytes','sha256']),path
# Reassemble independent runtime and audit artifacts from fetched Git blobs.
results={}
for label,idxpath,partfolder in [('runtime','runtime-parts.json','runtime'),('audit','audit/package-index.json','audit')]:
 idx=json.loads((out/idxpath).read_text());chunks=[]
 for row in idx['parts']:
  name=row.get('name',row.get('path'));data=(out/partfolder/name).read_bytes();assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'];chunks.append(data)
 archive=b''.join(chunks);assert len(archive)==idx['archive']['bytes'] and hashlib.sha256(archive).hexdigest()==idx['archive']['sha256']
 if label=='runtime': manifest=json.loads((out/'runtime.manifest.json').read_text())
 else:manifest=json.loads((out/'audit'/idx['memberManifest']['path']).read_text())
 members=manifest['members']; expectedMembers={r['path']:r for r in members};seen=set()
 with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as tf:
  for item in tf:
   assert item.isfile() and item.name not in seen;seen.add(item.name); data=tf.extractfile(item).read();p=expectedMembers[item.name]
   assert len(data)==p['bytes'] and hashlib.sha256(data).hexdigest()==p['sha256']
 assert seen==set(expectedMembers)
 results[label]={'parts':len(chunks),'archiveBytes':len(archive),'archiveSHA256':hashlib.sha256(archive).hexdigest(),'members':len(seen)}
receipt=json.loads((out/'receipt.json').read_text());source=receipt['sourceCommit'];pins=receipt['sourcePins']
for path,p in pins.items():
 data=git('show',source+':'+path);assert len(data)==p['bytes'] and hashlib.sha256(data).hexdigest()==p['sha256'],path
proof={'schema':'gobi.independent-modules-github-readback/v1','status':'passed','evidenceCommit':commit,'sourceCommit':source,'sourcePinsMatched':len(pins),'filesMatched':len(inv),'archives':results,'inventory':inv,'workingTreeStatus':git('status','--porcelain').decode(),'sourceHead':git('rev-parse','HEAD').decode().strip()}
assert not proof['workingTreeStatus'] and proof['sourceHead']==source
pathlib.Path('/tmp/modules-publish/github-readback.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k!='inventory'}))
