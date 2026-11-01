import pathlib,json,subprocess,sys,hashlib
p=pathlib.Path(__file__).resolve().parent
base=['/tmp/rebalancer-env/bin/python',str(p.parent/'rebalancer-probe.py')]
names={'N1':'keyed_go','N2':'keyed_build','N3':'keyed_host','N4':'keyed_harness','N5':'keyed_oracle','N6':'keyed_delivery'}
for item in sys.argv[1:]:
 w,j=item.split(':');s=json.loads((p/'state.json').read_text());assert s['workers'][w]['job']==j
 d=p/'seals'/j;d.mkdir(parents=True,exist_ok=True)
 pins={}
 for folder,suffix in [('reports','md'),('receipts','json')]:
  f=p/folder/(j+'.'+suffix);data=f.read_bytes();dest=d/f.name
  if dest.exists():assert dest.read_bytes()==data
  else:dest.write_bytes(data)
  pins[f.name]=hashlib.sha256(data).hexdigest()
 if j.startswith('E-'):
  repo=p.parent/'gondola'
  scopes={'E-GO':['fixtures/compiled/keyedmoduleparent','fixtures/compiled/keyedmodulewire','cmd/keyed-module-native'],'E-BUILD':['compiled-keyed-modules/build'],'E-HOST':['compiled-keyed-modules/runtime'],'E-HARNESS':['compiled-keyed-modules/conformance'],'E-ORACLE':['compiled-keyed-modules/oracle'],'E-DELIVERY':['compiled-keyed-modules/demo','compiled-keyed-modules/run.mjs','compiled-keyed-modules/README.md','compiled-keyed-modules/RESULTS.md','compiled-keyed-modules/.gitignore','run-keyed-modules.sh','.github/workflows/gobi-keyed-modules.yml']}
  inventory=[]
  for scope in scopes.get(j,[]):
   f=repo/scope
   for q in (sorted(f.rglob('*')) if f.is_dir() else [f]):
    if not q.is_file() or set(q.relative_to(repo).parts)&{'output','node_modules','evidence'}:continue
    rel=q.relative_to(repo);data=q.read_bytes();dest=d/'source'/rel;dest.parent.mkdir(parents=True,exist_ok=True)
    if dest.exists():assert dest.read_bytes()==data
    else:dest.write_bytes(data)
    inventory.append({'path':str(rel),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
  (d/'source-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
 if j in {'E-RESTORE','E-RESTORE-SAFE'}:
  q=pathlib.Path('/tmp/keyed-module-publish/restore.py');data=q.read_bytes();dest=d/'source/restore.py';dest.parent.mkdir(parents=True,exist_ok=True)
  if dest.exists():assert dest.read_bytes()==data
  else:dest.write_bytes(data)
  (d/'restoration-source-inventory.json').write_text(json.dumps([{'path':str(q),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}],indent=2)+'\n')
 (d/'seal.json').write_text(json.dumps(pins,indent=2)+'\n')
 subprocess.run(base+['finish','--state',str(p/'state.json'),'--receipts-dir',str(p/'receipts'),w],check=True,stdout=subprocess.DEVNULL)
s=json.loads((p/'state.json').read_text());epoch=s['epoch']
with (p/('solve-%02d.log'%epoch)).open('w') as f:subprocess.run(base+['solve','--state',str(p/'state.json'),'--output-dir',str(p/'native')],check=True,stdout=f,stderr=subprocess.STDOUT)
r=json.loads((p/('native/epoch-%02d.json'%epoch)).read_text());assert r['native_score']==r['exact_score'] and not r['native_constraints']['brokenCount']
for w,j in r['dispatch'].items():subprocess.run(base+['start','--state',str(p/'state.json'),w,j,'/root/'+names[w]],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({k:r[k] for k in ['epoch','dispatch','native_score','exact_score']}))
