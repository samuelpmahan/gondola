import pathlib,json,subprocess,sys,hashlib
p=pathlib.Path(__file__).resolve().parent
base=['/tmp/rebalancer-env/bin/python',str(p.parent/'rebalancer-probe.py')]
names={'N1':'effects_go','N2':'effects_build','N3':'effects_host','N4':'effects_harness','N5':'effects_oracle','N6':'effects_delivery'}
for item in sys.argv[1:]:
 w,j=item.split(':');s=json.loads((p/'state.json').read_text());assert s['workers'][w]['job']==j
 d=p/'seals'/j;d.mkdir(parents=True,exist_ok=True)
 pins={}
 for folder,suffix in [('reports','md'),('receipts','json')]:
  f=p/folder/(j+'.'+suffix);data=f.read_bytes();dest=d/f.name
  if dest.exists():assert dest.read_bytes()==data
  else:dest.write_bytes(data)
  pins[f.name]=hashlib.sha256(data).hexdigest()
 raw_index=p/'rawlogs'/j/'index.json'
 if raw_index.is_file():
  data=raw_index.read_bytes();dest=d/'rawlogs-index.json'
  if dest.exists():assert dest.read_bytes()==data
  else:dest.write_bytes(data)
  pins['rawlogs-index.json']=hashlib.sha256(data).hexdigest()
 if j.startswith('E-'):
  repo=p.parent/'gondola'
  scopes={'E-RELOCATE':['compiled-module-effects/build'],'E-GO':['fixtures/compiled/effectmodulechild','cmd/module-effects-native'],'E-GOCOMPILE':['fixtures/compiled/effectmodulechild','cmd/module-effects-native','compiled-frontend/analyze/load.go','compiled-frontend/analyze/load_dependencies_test.go','compiled-frontend/analyze/analyze.go','compiled-frontend/analyze/parse_uint_test.go'],'E-BUILD':['compiled-module-effects/build','compiled-frontend/build/pipeline.go','compiled-frontend/build/module_effects_stage_test.go','moduleabi/descriptor.go','moduleabi/module_effects_test.go'],'E-BUILDPATH':['compiled-module-effects/build'],'E-HOST':['compiled-module-effects/runtime'],'E-HARNESS':['compiled-module-effects/conformance'],'E-HARNESSCONTROLS':['compiled-module-effects/conformance'],'E-ORACLE':['compiled-module-effects/oracle'],'E-ORACLELINK':['compiled-module-effects/oracle'],'E-DELIVERYCONTRACT':['compiled-module-effects/run.mjs','compiled-module-effects/delivery-contract.mjs','compiled-module-effects/delivery-contract.test.mjs','compiled-module-effects/demo','compiled-module-effects/README.md'],'E-DELIVERY':['compiled-module-effects/demo','compiled-module-effects/run.mjs','compiled-module-effects/README.md','compiled-module-effects/RESULTS.md','compiled-module-effects/.gitignore','run-module-effects.sh','.github/workflows/gobi-keyed-module-effects.yml']}
  inventory=[]
  for scope in scopes.get(j,[]):
   f=repo/scope
   for q in (sorted(f.rglob('*')) if f.is_dir() else [f]):
    if not q.is_file() or set(q.relative_to(repo).parts)&{'output','node_modules','evidence'}:continue
    rel=q.relative_to(repo);data=q.read_bytes();dest=d/'source'/rel;dest.parent.mkdir(parents=True,exist_ok=True)
    if dest.exists():assert dest.read_bytes()==data
    else:dest.write_bytes(data)
    inventory.append({'path':str(rel),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
  external={'E-SOURCEAUDIT':['/tmp/module-effects-publish/source-audit/rawlogs/bind-source-commit.py'],'E-PACKAGEROOT':['/tmp/module-effects-publish/publisher/pack_audit.py','/tmp/module-effects-publish/publisher/test_publisher.py'],'E-PACKAGE':['/tmp/module-effects-publish/publisher/'+n for n in ['common.py','prepare_parts.py','pack_audit.py','test_publisher.py','README-PUBLISHER-TEMPLATE.md']],'E-RESTORE':['/tmp/module-effects-publish/restore.py'],'E-CONSUME':['/tmp/module-effects-publish/consume.py','/tmp/module-effects-publish/consume-browser.mjs']}
  for absolute in external.get(j,[]):
   f=pathlib.Path(absolute);data=f.read_bytes();rel='external/'+f.name;dest=d/'source'/rel;dest.parent.mkdir(parents=True,exist_ok=True)
   if dest.exists():assert dest.read_bytes()==data
   else:dest.write_bytes(data)
   inventory.append({'path':rel,'sourcePath':absolute,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
  (d/'source-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
 (d/'seal.json').write_text(json.dumps(pins,indent=2)+'\n')
 subprocess.run(base+['finish','--state',str(p/'state.json'),'--receipts-dir',str(p/'receipts'),w],check=True,stdout=subprocess.DEVNULL)
s=json.loads((p/'state.json').read_text());epoch=s['epoch']
with (p/('solve-%02d.log'%epoch)).open('w') as f:subprocess.run(base+['solve','--state',str(p/'state.json'),'--output-dir',str(p/'native')],check=True,stdout=f,stderr=subprocess.STDOUT)
r=json.loads((p/('native/epoch-%02d.json'%epoch)).read_text());assert r['native_score']==r['exact_score'] and not r['native_constraints']['brokenCount']
for w,j in r['dispatch'].items():subprocess.run(base+['start','--state',str(p/'state.json'),w,j,'/root/'+names[w]],check=True,stdout=subprocess.DEVNULL)
print(json.dumps({k:r[k] for k in ['epoch','dispatch','native_score','exact_score']}))
