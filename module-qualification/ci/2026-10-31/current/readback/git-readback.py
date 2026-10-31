import pathlib,subprocess,json,hashlib,io,tarfile,sys
root=pathlib.Path('/tmp/native-qual-publish');repo=root/'readback.git';commit=sys.argv[1];prefix='module-qualification/ci/2026-10-31/current/'
def git(*a):return subprocess.check_output(['git','-C',str(repo),*a])
def sha(b):return hashlib.sha256(b).hexdigest()
expected=json.loads((root/'expected-publication.json').read_text());actual={};out=root/'readback';out.mkdir(exist_ok=False)
for line in git('ls-tree','-rz',commit,'--',prefix).split(b'\0'):
 if not line:continue
 meta,path=line.split(b'\t');mode,kind,oid=meta.split();assert kind==b'blob';rel=path.decode()[len(prefix):];b=git('cat-file','blob',oid.decode());f=out/rel;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(b);actual[rel]={'bytes':len(b),'sha256':sha(b),'gitsha':oid.decode()}
assert set(actual)==set(expected),{'extra':list(set(actual)-set(expected)),'missing':list(set(expected)-set(actual))}
for name,pin in expected.items():assert all(actual[name][k]==pin[k] for k in ['bytes','sha256']),name
archives={}
for label in ['bundle','audit']:
 idx=json.loads((out/(label+'-parts.json')).read_text());chunks=[]
 for row in idx['parts']:
  b=(out/label/row['name']).read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'];chunks.append(b)
 raw=b''.join(chunks);assert len(raw)==idx['archive']['bytes'] and sha(raw)==idx['archive']['sha256'];archives[label]={'parts':len(chunks),'bytes':len(raw),'sha256':sha(raw)}
# Restore/verify every outer/inner archive member from the fetched evidence bytes.
subprocess.run([sys.executable,str(out/'restore.py'),str(root/'readback-restored')],check=True,capture_output=True)
subprocess.run([sys.executable,str(out/'restore.py'),'--audit',str(root/'readback-audit')],check=True,capture_output=True)
restored=root/'readback-restored';runtime_manifest=json.loads((restored/'bundle/upstream/runtime.manifest.json').read_text());sourcepins=runtime_manifest['sourcePinsBefore'];go_manifest=json.loads((restored/'bundle/metadata/verifier-go-list.json').read_text())['files']
for path,pin in sourcepins.items():
 b=git('show',commit+':'+path);assert len(b)==pin['bytes'] and sha(b)==pin['sha256'],path
for pin in go_manifest:
 b=git('show',commit+':'+pin['path']);assert len(b)==pin['bytes'] and sha(b)==pin['sha256'],pin['path']
work='/workspace/scratch/39a56936f173/gondola';source=subprocess.check_output(['git','-C',work,'rev-parse','HEAD'],text=True).strip();status=subprocess.check_output(['git','-C',work,'status','--porcelain'],text=True);assert source=='4395d41ade7e4196878b6885d4c46dd4d8ec85f1' and not status
proof={'schema':'gobi.native-module-qualification-git-readback/v1','status':'passed','evidenceCommit':commit,'sourceCommit':source,'publishedFiles':len(actual),'runtimeSourcePins':len(sourcepins),'GoVerifierSourcePins':len(go_manifest),'archives':archives,'workingTree':'clean','inventory':actual};(root/'github-readback.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k!='inventory'}))
