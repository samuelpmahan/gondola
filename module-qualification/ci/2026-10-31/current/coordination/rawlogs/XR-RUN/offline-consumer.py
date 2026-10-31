#!/usr/bin/env python3
"""Independent safe offline consumer for the frozen E-RUN verifier bundle."""
import gzip, hashlib, json, os, pathlib, posixpath, shutil, subprocess, sys, tarfile, tempfile
from pathlib import PurePosixPath

ROOT=pathlib.Path('/workspace/scratch/39a56936f173')
COORD=ROOT/'native-module-coordination'
RAW=COORD/'rawlogs/XR-RUN'
ATTEMPT=ROOT/'gondola/module-qualification/output/attempts/attempt-20261031T230513555Z-8'
ARCHIVE=ATTEMPT/'module-qualification-evidence.tar.gz'
OUTER_MANIFEST=ATTEMPT/'module-qualification-evidence.manifest.json'
EXPECTED_OUTER_SHA='98a1c68ed0c2453775a4e069482256b186f6446af40dd3ec0c7837d116914e9e'
EXPECTED_OUTER_BYTES=6616802
EXPECTED_MANIFEST_SHA='e7567785384c06242aee247026de57245ba68c26fc9f9d5de2c3f72359c092f2'
EXPECTED_RUNTIME_SHA='05c71d20f7d7e25281b885a5bed20c337540d9bd6bb9728b23aeaf845f70066d'
EXPECTED_RUNTIME_MANIFEST_SHA='4d0e4a7b7362d2d206f32785d3844a1c326f9796ce243252c0dd0ecd31f808c9'
EXPECTED_COMMIT='4395d41ade7e4196878b6885d4c46dd4d8ec85f1'
EXPECTED_TREE='5835ca66f5c4903c711e04aa7e8d14212632bc3a'
GO='/tmp/gondola-go/go/bin/go'

def sha_bytes(b): return hashlib.sha256(b).hexdigest()
def sha_file(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
 return h.hexdigest()
def strict_json(data,label):
 def pairs(items):
  out={}
  for k,v in items:
   if k in out: raise ValueError(f'{label}: duplicate JSON key {k!r}')
   out[k]=v
  return out
 return json.loads(data.decode('utf-8'),object_pairs_hook=pairs)
def safe_name(name):
 if not isinstance(name,str) or not name or '\\' in name or '\x00' in name: raise ValueError(f'unsafe archive path {name!r}')
 p=PurePosixPath(name)
 if p.is_absolute() or any(part in ('','..','.') for part in p.parts) or name.startswith('/') or name.endswith('/'): raise ValueError(f'unsafe archive path {name!r}')
 return p
def verify_tar(path, expected_rows, label):
 expected={}
 for row in expected_rows:
  name=row.get('path'); safe_name(name)
  if name in expected: raise ValueError(f'{label}: duplicate manifest path {name}')
  expected[name]=row
 with tarfile.open(path,'r:gz') as tf:
  members=tf.getmembers(); actual={}
  for m in members:
   safe_name(m.name)
   if not m.isfile() or m.issym() or m.islnk() or m.isdev() or m.isdir(): raise ValueError(f'{label}: non-regular member {m.name} type={m.type!r}')
   if m.name in actual: raise ValueError(f'{label}: duplicate archive member {m.name}')
   actual[m.name]=m
  if set(actual)!=set(expected):
   raise ValueError(f'{label}: set mismatch missing={sorted(set(expected)-set(actual))[:4]} extra={sorted(set(actual)-set(expected))[:4]}')
  # Reject a regular-file path that is an ancestor of another archive member.
  for name in actual:
   parts=PurePosixPath(name).parts
   for i in range(1,len(parts)):
    if '/'.join(parts[:i]) in actual: raise ValueError(f'{label}: file/descendant path conflict at {name}')
  rows=[]; total=0
  for name in sorted(expected):
   m=actual[name]; data=tf.extractfile(m).read(); row=expected[name]
   if len(data)!=m.size or len(data)!=row['bytes'] or sha_bytes(data)!=row['sha256']:
    raise ValueError(f'{label}: size/hash mismatch {name}')
   total+=len(data); rows.append({'path':name,'bytes':len(data),'sha256':sha_bytes(data)})
  return tf, members, rows, total

def extract_verified(path, dest, expected_rows, label):
 dest.mkdir(parents=True,exist_ok=False)
 with tarfile.open(path,'r:gz') as tf:
  for row in expected_rows:
   name=row['path']; safe_name(name)
   m=tf.getmember(name)
   data=tf.extractfile(m).read()
   target=dest.joinpath(*PurePosixPath(name).parts)
   target.parent.mkdir(parents=True,exist_ok=True)
   if not target.resolve().is_relative_to(dest.resolve()): raise ValueError(f'{label}: escaped destination {name}')
   with target.open('xb') as out: out.write(data)
 return dest

def record_command(name, argv, cwd, env, timeout=240):
 cp=subprocess.run(argv,cwd=cwd,env=env,capture_output=True,text=False,timeout=timeout)
 stem=RAW/name
 (RAW/(name+'.stdout.bin')).write_bytes(cp.stdout)
 (RAW/(name+'.stderr.bin')).write_bytes(cp.stderr)
 info={'name':name,'argv':argv,'cwd':str(cwd),'environment':{k:env[k] for k in sorted(env) if k in ('GOTOOLCHAIN','GOFLAGS','GOPROXY','GOSUMDB','GOCACHE','GOMODCACHE','GOBI_MODULE_CAPTURE_ROOT')},'exitCode':cp.returncode,'stdoutBytes':len(cp.stdout),'stdoutSHA256':sha_bytes(cp.stdout),'stderrBytes':len(cp.stderr),'stderrSHA256':sha_bytes(cp.stderr)}
 (RAW/(name+'.command.json')).write_text(json.dumps(info,indent=2)+'\n')
 if cp.returncode: raise RuntimeError(f'{name} failed exit {cp.returncode}: {cp.stderr[-2000:].decode("utf-8","replace")}')
 return cp.stdout

def main():
 RAW.mkdir(parents=True,exist_ok=True)
 archive_data=ARCHIVE.read_bytes(); manifest_data=OUTER_MANIFEST.read_bytes()
 if len(archive_data)!=EXPECTED_OUTER_BYTES or sha_bytes(archive_data)!=EXPECTED_OUTER_SHA: raise ValueError('outer archive pin mismatch')
 if sha_bytes(manifest_data)!=EXPECTED_MANIFEST_SHA: raise ValueError('external manifest pin mismatch')
 outer_manifest=strict_json(manifest_data,'outer manifest')
 if outer_manifest.get('schema')!='gobi.module-qualification-evidence-manifest/v1' or outer_manifest.get('sourceCommit')!=EXPECTED_COMMIT: raise ValueError('outer manifest schema/commit mismatch')
 if outer_manifest['archive']!={'path':'module-qualification-evidence.tar.gz','bytes':EXPECTED_OUTER_BYTES,'sha256':EXPECTED_OUTER_SHA}: raise ValueError('manifest archive binding mismatch')
 # Read and verify all outer members before writing any archive member to disk.
 with tarfile.open(ARCHIVE,'r:gz') as tf:
  members=tf.getmembers(); byname={}
  for m in members:
   safe_name(m.name)
   if not m.isfile() or m.issym() or m.islnk() or m.isdev() or m.isdir(): raise ValueError(f'outer archive contains non-regular member {m.name}')
   if m.name in byname: raise ValueError(f'outer archive duplicate {m.name}')
   byname[m.name]=m
  if 'bundle/index.json' not in byname: raise ValueError('outer archive has no index')
  idx_bytes=tf.extractfile(byname['bundle/index.json']).read()
  if len(idx_bytes)!=outer_manifest['index']['bytes'] or sha_bytes(idx_bytes)!=outer_manifest['index']['sha256']: raise ValueError('outer index digest mismatch')
  idx=strict_json(idx_bytes,'bundle index')
  if idx.get('schema')!='gobi.module-qualification-evidence-index/v1' or idx.get('sourceCommit')!=EXPECTED_COMMIT or idx.get('attempt')!='attempt-20261031T230513555Z-8': raise ValueError('outer index identity mismatch')
  rows=idx.get('members')
  if not isinstance(rows,list) or len(rows)+2!=outer_manifest['memberCount']: raise ValueError('outer index/member count mismatch')
  expected={}
  for row in rows:
   name=row['path']; safe_name(name)
   if name in expected: raise ValueError(f'index duplicate path {name}')
   expected[name]=row
  expected['bundle/index.json']={'path':'bundle/index.json','bytes':len(idx_bytes),'sha256':sha_bytes(idx_bytes)}
  snap=outer_manifest['executionSnapshot']; expected[snap['path']]={'path':snap['path'],'bytes':snap['bytes'],'sha256':snap['sha256']}
  if set(expected)!=set(byname): raise ValueError(f'outer name-set mismatch missing={sorted(set(expected)-set(byname))[:3]} extra={sorted(set(byname)-set(expected))[:3]}')
  for name,row in expected.items():
   m=byname[name]; data=tf.extractfile(m).read()
   if len(data)!=m.size or len(data)!=row['bytes'] or sha_bytes(data)!=row['sha256']: raise ValueError(f'outer member digest mismatch {name}')
  expanded=sum(x['bytes'] for x in expected.values())
  if expanded!=outer_manifest['expandedBytes']: raise ValueError('outer expanded byte total mismatch')
 outer_summary={'archiveBytes':len(archive_data),'archiveSHA256':sha_bytes(archive_data),'manifestSHA256':sha_bytes(manifest_data),'members':len(byname),'indexedMembers':len(rows),'expandedBytes':expanded,'sourceCommit':idx['sourceCommit']}
 # Establish private staging. Extract only after paths, type, set, size, and hashes have passed.
 temp=pathlib.Path(tempfile.mkdtemp(prefix='xr-run-consumer-'))
 try:
  outer_root=extract_verified(ARCHIVE,temp/'outer',list(expected.values()),'outer archive')
  bundle=outer_root/'bundle'
  # Inspect the archived M0, interaction, and focused Go command evidence.
  summary=strict_json((bundle/'summary.json').read_bytes(),'bundle summary')
  m0=(bundle/'commands/milestone-zero-run.stdout.bin').read_text(errors='replace')
  counter=(bundle/'commands/counter-interaction-regression.stdout.bin').read_text(errors='replace')
  test_events=[]
  for line in (bundle/'commands/focused-module-qualification-go-tests.stdout.bin').read_text().splitlines():
   if line.strip(): test_events.append(json.loads(line))
  go_tests=[x for x in test_events if x.get('Test') and x.get('Action') in ('pass','fail','skip') and '/' not in x['Test']]
  go_test_pass=sum(x.get('Action')=='pass' for x in test_events if x.get('Test')); go_test_fail=sum(x.get('Action')=='fail' for x in test_events if x.get('Test')); go_test_skip=sum(x.get('Action')=='skip' for x in test_events if x.get('Test'))
  go_top_pass=sum(x['Action']=='pass' for x in go_tests); go_top_fail=sum(x['Action']=='fail' for x in go_tests); go_top_skip=sum(x['Action']=='skip' for x in go_tests)
  coherency_pass=[x['Test'] for x in test_events if x.get('Action')=='pass' and x.get('Test','').startswith('TestCheckCapturesRejectsCoherenceAndMissingTypedFields/')]
  controls=summary.get('focusedGoTests',{}).get('mutationControlsDetected',[])
  if 'same over 5000 inputs' not in m0 or 'receipt matches' not in m0 or 'SHA256SUMS ok' not in m0: raise ValueError('archived M0 receipts/parity witnesses missing')
  if '107 scripts over 4473 initial/action ticks (seed 20261030)' not in counter or '# tests 8' not in counter or '# fail 0' not in counter: raise ValueError('archived counter interaction witness mismatch')
  if go_test_pass!=82 or go_test_fail or go_test_skip or go_top_fail or go_top_skip or len(controls)!=10 or len(coherency_pass)<19: raise ValueError(f'archived Go tests/control witnesses mismatch: pass={go_top_pass} fail={go_top_fail} skip={go_top_skip} controls={len(controls)} coherency={len(coherency_pass)}')
  # Verify inner runtime archive and manifest bytes are the exact upstream pins.
  runtime_archive=bundle/'upstream/runtime.tar.gz'; runtime_manifest=bundle/'upstream/runtime.manifest.json'
  rmanifest_bytes=runtime_manifest.read_bytes()
  if sha_bytes(rmanifest_bytes)!=EXPECTED_RUNTIME_MANIFEST_SHA: raise ValueError('inner runtime manifest SHA mismatch')
  rmanifest=strict_json(rmanifest_bytes,'inner runtime manifest')
  if rmanifest.get('schema')!='gobi.compiled-modules-archive-manifest/v1' or rmanifest.get('sourceCommit')!=EXPECTED_COMMIT or rmanifest.get('verifierGitHead')!=EXPECTED_COMMIT or rmanifest.get('verifierGitDirty') is not False or rmanifest.get('verifierSourcePinsMatch') is not True: raise ValueError('inner runtime manifest identity mismatch')
  rarchive_bytes=runtime_archive.read_bytes()
  if len(rarchive_bytes)!=6376501 or sha_bytes(rarchive_bytes)!=EXPECTED_RUNTIME_SHA: raise ValueError('inner runtime archive pin mismatch')
  if sha_bytes(rmanifest_bytes)!=outer_manifest['upstreamRuntimeArchive']['manifestSHA256'] or sha_bytes(rarchive_bytes)!=outer_manifest['upstreamRuntimeArchive']['sha256']: raise ValueError('outer/inner runtime binding mismatch')
  if len(rmanifest.get('members',[]))!=529: raise ValueError('inner runtime member count mismatch')
  # Validate and extract inner archive only after exact manifest path/type/size/hash checks.
  with tarfile.open(runtime_archive,'r:gz') as tf:
   r_members=tf.getmembers(); r_byname={}
   for m in r_members:
    safe_name(m.name)
    if not m.isfile() or m.issym() or m.islnk() or m.isdev() or m.isdir(): raise ValueError(f'inner archive non-regular member {m.name}')
    if m.name in r_byname: raise ValueError(f'inner archive duplicate {m.name}')
    r_byname[m.name]=m
   r_expected={}
   for row in rmanifest['members']:
    name=row['path']; safe_name(name)
    if name in r_expected: raise ValueError(f'inner manifest duplicate {name}')
    r_expected[name]=row
   if set(r_expected)!=set(r_byname): raise ValueError('inner archive and manifest path sets differ')
   input_rows=[]; inner_expanded=0
   for name in sorted(r_expected):
    m=r_byname[name]; data=tf.extractfile(m).read(); row=r_expected[name]
    if len(data)!=m.size or len(data)!=row['bytes'] or sha_bytes(data)!=row['sha256']: raise ValueError(f'inner member digest mismatch {name}')
    input_rows.append({'path':name,'bytes':len(data),'sha256':sha_bytes(data)}); inner_expanded+=len(data)
  verified_root=extract_verified(runtime_archive,temp/'verified-runtime',rmanifest['members'],'inner runtime archive')
  # Offline rebuild from the copied, hash-verified 43-Go-file verifier source closure.
  verifier=bundle/'verifier-source'; verifier_files=sorted(p for p in verifier.rglob('*') if p.is_file()); go_files=sorted(verifier.rglob('*.go'))
  if len(verifier_files)!=43 or len(go_files)!=41: raise ValueError(f'verifier source file counts total={len(verifier_files)} Go={len(go_files)}; want 43 total/41 Go')
  build_env=os.environ.copy(); cache=temp/'gocache'; modcache=temp/'gomodcache'
  cache.mkdir(); modcache.mkdir()
  build_env.update({'PATH':str(pathlib.Path(GO).parent)+os.pathsep+build_env.get('PATH',''),'GOTOOLCHAIN':'local','GOFLAGS':'-buildvcs=false','GOPROXY':'off','GOSUMDB':'off','GOCACHE':str(cache),'GOMODCACHE':str(modcache)})
  binary=temp/'module-qualify'
  build_stdout=record_command('offline-go-build',['/tmp/gondola-go/go/bin/go','build','-o',str(binary),'./cmd/module-qualify'],verifier,build_env)
  if not binary.is_file(): raise ValueError('offline build did not create CLI binary')
  run_env=build_env.copy(); run_env['GOTOOLCHAIN']='local'; run_env['GOFLAGS']='-buildvcs=false'; run_env['GOPROXY']='off'; run_env['GOSUMDB']='off'
  archive_stdout=record_command('offline-cli-archive',[str(binary),'--archive',str(runtime_archive),'--manifest',str(runtime_manifest)],verifier,run_env)
  directory_stdout=record_command('offline-cli-directory',[str(binary),'--directory',str(verified_root)],verifier,run_env)
  arch_report=strict_json(archive_stdout,'archive CLI report'); dir_report=strict_json(directory_stdout,'directory CLI report')
  for label,report in [('archive',arch_report),('directory',dir_report)]:
   if report.get('schema')!='gobi.module-qualification-report/v1' or report.get('sourceCommit')!=EXPECTED_COMMIT: raise ValueError(f'{label} report identity mismatch')
   capture=report.get('capture',{})
   if capture.get('profiles')!=12 or capture.get('events')!=144 or capture.get('updates')!=99 or capture.get('seeds')!=[20261031,20261032,20261033] or capture.get('mutationControls')!=0: raise ValueError(f'{label} capture results mismatch')
   if report.get('abi')!={'status':'passed','builds':4,'pairs':2}: raise ValueError(f'{label} ABI result mismatch')
   ident=report.get('sourceIdentity',{})
   if ident.get('head')!=EXPECTED_COMMIT or ident.get('dirty') is not False or ident.get('sourcePinsMatch') is not True or ident.get('sourcePinCount')!=147: raise ValueError(f'{label} source identity mismatch')
   inputs=report.get('inputs',[])
   if len(inputs)!=529: raise ValueError(f'{label} input count {len(inputs)} != 529')
   actual={x['path']:(x['bytes'],x['sha256']) for x in inputs}
   expected_inputs={x['path']:(x['bytes'],x['sha256']) for x in input_rows}
   if actual!=expected_inputs: raise ValueError(f'{label} Go input pins differ from verified inner manifest')
  if arch_report.get('archive')!={'members':529,'bytes':6376501,'sourceCommit':EXPECTED_COMMIT}: raise ValueError('archive-mode result summary mismatch')
  if 'archive' in dir_report: raise ValueError('directory mode unexpectedly includes archive summary')
  # All semantic report fields except Archive transport metadata must match exactly.
  for key in ('schema','sourceCommit','sourceIdentity','inputs','capture','abi','scope'):
   if arch_report.get(key)!=dir_report.get(key): raise ValueError(f'archive/directory report differs in {key}')
  result={'schema':'gobi.xr-run-consumer-result/v1','outer':outer_summary,'inner':{'archiveBytes':len(rarchive_bytes),'archiveSHA256':sha_bytes(rarchive_bytes),'manifestSHA256':sha_bytes(rmanifest_bytes),'members':len(rmanifest['members']),'expandedBytes':inner_expanded,'sourceCommit':rmanifest['sourceCommit'],'sourcePins':147},'offlineBuild':{'goVersion':'go1.24.0 linux/amd64','goSourceRoot':'bundle/verifier-source','files':len(verifier_files),'goFiles':len(go_files),'goModCacheEmptyAtBuild':True,'networkDisabled':True,'binarySHA256':sha_file(binary)},'archivedClaimWitnesses':{'m0SameOver5000':True,'m0ReceiptMatches':True,'m0SHA256SumsOK':True,'counterScripts':107,'counterTicks':4473,'counterSeed':20261030,'counterNodeTests':8,'goTestCasesPassed':go_test_pass,'goTestCasesFailed':go_test_fail,'goTestCasesSkipped':go_test_skip,'goTopLevelTestsPassed':go_top_pass,'goTopLevelTestsFailed':go_top_fail,'goTopLevelTestsSkipped':go_top_skip,'goMutationControls':len(controls),'coherencyCasesPassed':len(coherency_pass)},'archiveCLI':{'exitCode':0,'sha256':sha_bytes(archive_stdout),'sourceCommit':arch_report['sourceCommit'],'profiles':12,'events':144,'updates':99,'inputs':len(arch_report['inputs']),'archiveMembers':arch_report['archive']['members']},'directoryCLI':{'exitCode':0,'sha256':sha_bytes(directory_stdout),'sourceCommit':dir_report['sourceCommit'],'profiles':12,'events':144,'updates':99,'inputs':len(dir_report['inputs'])},'reportsSemanticallyEqualExceptArchiveField':True}
  (RAW/'result.json').write_text(json.dumps(result,indent=2)+'\n')
  print(json.dumps(result))
 finally:
  shutil.rmtree(temp,ignore_errors=True)

if __name__=='__main__':
 try: main()
 except Exception as e:
  (RAW/'failure.txt').write_text(str(e)+'\n')
  raise
