#!/usr/bin/env python3
"""Independent bounded audit of the exact primary E-CI-BUILD artifact."""
import hashlib, json, pathlib, posixpath, subprocess, tarfile, zipfile, zlib

ROOT = pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'], text=True).strip())
BASE = ROOT / 'compiled-lifecycle/ci/2026-10-31'
EX = BASE / 'extracted'
ATT = EX / 'compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z'
ZIP = pathlib.Path('/tmp/gobi-compiled-lifecycle-41178420647.zip')
COMMIT = '49cc2b96c8817a47319d5b7bd484184a22fa984b'
TREE = 'd49ca35b7eda23837c392bbe0d2363551e4c7bec'
PACKAGE = 'github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle'

def sha(b): return hashlib.sha256(b).hexdigest()
def sha_file(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1<<20),b''): h.update(b)
    return h.hexdigest()
def readj(p): return json.loads(pathlib.Path(p).read_text())
def require(cond, msg):
    if not cond: raise AssertionError(msg)

download=readj(BASE/'provider-download.json')
retention=readj(BASE/'provider/failed-41178420647/retention.json')
inventory=readj(BASE/'provider/failed-41178420647/members.json')
run=readj(BASE/'lanes/evidence/run-push-41178420647-current.json')
require(download['artifactId']==13034915662 and download['run']==41178420647, 'provider identity')
require(download['sha256']=='6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4', 'provider zip pin')
require(run['head_sha']==COMMIT and run['event']=='push' and run['path']=='.github/workflows/gobi-compiled-lifecycle.yml', 'run identity')
require(run['status']=='in_progress' and download['providerRunConclusion']=='failure', 'captured run status vs provider conclusion')
# Verify retained chunks individually, and concatenation.
chunk_records=[]; concat=hashlib.sha256(); chunk_bytes=0
for row in retention['chunks']:
    p=ROOT/row['path']; data=p.read_bytes(); actual=sha(data)
    require(len(data)==row['bytes'] and actual==row['sha256'], 'chunk pin '+row['path'])
    chunk_records.append({'path':row['path'],'bytes':len(data),'sha256':actual})
    concat.update(data); chunk_bytes+=len(data)
require(len(chunk_records)==12 and chunk_bytes==47035803 and concat.hexdigest()==download['sha256'], 'chunk concatenation')
# Independently stream the archive, checking path safety, CRC, inventory, and extracted bytes.
expected={row['path']:row for row in inventory['members']}; names=[]; errors=[]; unsafe=[]; extracted_errors=[]; uncompressed=0
with zipfile.ZipFile(ZIP) as z:
    infos=[i for i in z.infolist() if not i.is_dir()]
    for info in infos:
        name=info.filename; names.append(name); norm=posixpath.normpath(name.rstrip('/'))
        if name.startswith('/') or norm in ('','.','..') or norm.startswith('../') or any(x in ('','.','..') for x in name.rstrip('/').split('/')): unsafe.append(name)
        record=expected.get(name); h=hashlib.sha256(); size=0
        with z.open(info) as src:
            for block in iter(lambda:src.read(1<<20),b''):
                h.update(block); size+=len(block)
        uncompressed+=size
        if record is None or size!=record['bytes'] or h.hexdigest()!=record['sha256'] or f'{info.CRC:08x}'!=record['crc32'].lower(): errors.append(name)
        out=EX/name
        if not out.is_file() or out.stat().st_size!=size or sha_file(out)!=h.hexdigest(): extracted_errors.append(name)
    require(z.testzip() is None, 'ZIP testzip/CRC')
require(ZIP.stat().st_size==47035803 and sha_file(ZIP)==download['sha256'], 'original ZIP hash/size')
require(len(names)==1272 and len(set(names))==1272 and set(names)==set(expected), 'outer member count/unique inventory')
require(uncompressed==412381547 and not errors and not unsafe and not extracted_errors, 'outer member or extraction verification')
# Bind all uploaded sources to the pinned Git tree, never the mutable worktree.
execution=readj(ATT/'execution.json'); pins=execution['sourceBefore']; source_mismatches=[]
source_pin_count=len(pins)
for row in pins:
    p=subprocess.run(['git','cat-file','blob',f"{COMMIT}:{row['path']}"],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if p.returncode or len(p.stdout)!=row['bytes'] or sha(p.stdout)!=row['sha256']:
        source_mismatches.append(row['path'])
require(len(pins)==122 and execution['sourceBefore']==execution['sourceAfter'] and not source_mismatches, 'published source pins')
require(subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==COMMIT, 'checkout commit')
require(subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,text=True).strip()==TREE, 'checkout tree')
# Verify both build records and every pinned output file from the uploaded extracted artifact.
builds={}; appirs=[]; encoders=[]
for backend in ('react','dom'):
    b=execution['builds'][backend]; outroot=EX/b['outputDir']; result=readj(EX/b['result']['path']); manifest=readj(EX/b['manifest']['path'])
    record=readj(ATT/backend/'build-record.json')
    pins=b['outputPins']; errors=[]
    for row in pins:
        f=outroot/row['path']
        if not f.is_file() or f.stat().st_size!=row['bytes'] or sha_file(f)!=row['sha256']: errors.append(row['path'])
    result_rows={r['path']:(r['bytes'],r['sha256']) for r in result['outputs']}
    pin_rows={r['path']:(r['bytes'],r['sha256']) for r in pins}
    require(result['ok'] and not result['diagnostics'] and len(result['outputs'])==67 and len(pins)==67, backend+' BuildResult count/status')
    require(record['outputPins']==pins and result_rows==pin_rows and not errors, backend+' output records/files')
    app=manifest['apps'][0]; appir=readj(outroot/app['appIR']); component=next(c for c in appir['components'] if c.get('packagePath')==PACKAGE)
    update=next(s for s in appir['symbols'] if s['id']==component['update'])
    require(component['id']==PACKAGE and 'effect.request-reply' in component['capabilities'], backend+' AppIR identity/capability')
    require(update['signature']['results']==[component['stateType'],'[]github.com/samuelpmahan/gondola/gobi.Effect'],backend+' Update result ABI')
    enc=outroot/app['encoder']; et=enc.read_text(); line=next(x for x in et.splitlines() if x.startswith('const TYPES = ')); types=json.loads(line[len('const TYPES = '):-1])
    slice_type=next(t for t in types if t['id']=='[]github.com/samuelpmahan/gondola/gobi.Effect')
    effect_type=next(t for t in types if t['id']=='github.com/samuelpmahan/gondola/gobi.Effect')
    require(slice_type=={'id':'[]github.com/samuelpmahan/gondola/gobi.Effect','kind':'slice','elemType':'github.com/samuelpmahan/gondola/gobi.Effect','jsRepresentation':'array-or-goscript-slice'},backend+' encoded slice ABI')
    require(effect_type['kind']=='struct' and effect_type['jsRepresentation']=='class' and effect_type['fields']==[{'name':'Kind','type':'string'},{'name':'Name','type':'string'},{'name':'Arg','type':'string'},{'name':'Reply','type':'string'}],backend+' Effect fields')
    appirs.append(sha_file(outroot/app['appIR'])); encoders.append(sha_file(enc))
    builds[backend]={'output_count':len(pins),'outputs_match':not errors,'BuildResult_sha256':sha_file(EX/b['result']['path']),'manifest_sha256':sha_file(EX/b['manifest']['path']),'appIR_sha256':sha_file(outroot/app['appIR']),'encoder_sha256':sha_file(enc),'raw_module_sha256':sha_file(outroot/app['module'])}
require(appirs[0]==appirs[1] and encoders[0]==encoders[1], 'cross backend AppIR/encoder equality')
react_pins={r['path']:r['sha256'] for r in execution['builds']['react']['outputPins']}
dom_pins={r['path']:r['sha256'] for r in execution['builds']['dom']['outputPins']}
require(set(react_pins)==set(dom_pins),'cross backend output path sets')
module_rel='apps/lifecycle-7e6575d90707/gobi-compiled.mjs'
manifest_rel='buildmanifest.json'
equal_shared=[p for p in react_pins if p not in (module_rel,manifest_rel) and react_pins[p]==dom_pins[p]]
require(len(equal_shared)==65 and all(react_pins[p]==dom_pins[p] for p in set(react_pins)-{module_rel,manifest_rel}),'65 shared outputs')
mr=readj(EX/execution['builds']['react']['manifest']['path']); md=readj(EX/execution['builds']['dom']['manifest']['path'])
for obj in (mr,md):
    for app in obj.get('apps',[]): app.pop('backend',None)
require(mr==md,'manifest equality excluding backend tag')
pin_stability={}
for backend in ('react','dom'):
    before=execution['outputPinsBefore'][backend]; after=execution['outputPinsAfter'][backend]
    require(len(before)==67 and len(after)==67 and before==after,'stable '+backend+' output pins before/after')
    pin_stability[backend]={'count':len(before),'stable_before_after':True}
# Fresh post-build runtime test and explicit native replay failure boundary.
test=execution['commands']; runtime=next(x for x in test if x['name']=='lifecycle-compiled-runtime-tests')
rtlog=EX/runtime['stdoutPath']; rt=rtlog.read_text()
require(runtime['exitCode']==0 and 'tests 10' in rt and 'pass 10' in rt and 'fail 0' in rt,'fresh appdir runtime test 10/10')
require(runtime['environmentOverrides'].get('GOBI_LIFECYCLE_APP_DIR') or 'GOBI_LIFECYCLE_APP_DIR' in runtime.get('args',[]), 'runtime app directory env recorded')
conf=next(x for x in test if x['name']=='lifecycle-conformance'); stderr=(EX/conf['stderrPath']).read_text(); stdout=(EX/conf['stdoutPath']).read_text()
require(conf['exitCode']==1 and '--native-go' in ' '.join(conf['args']) and conf['args'][conf['args'].index('--native-go')+1]=='go','native replay invocation')
failure=readj(EX/'compiled-lifecycle/conformance/evidence/attempt-00/lifecycle.failed.json')
run_record=readj(EX/'compiled-lifecycle/conformance/evidence/attempt-00/lifecycle.run.json')
all_failure_text=json.dumps([failure,run_record])+'\n'+stderr+'\n'+stdout
require('spawnSync /home/runner/work/gondola/gondola/go ENOENT' in all_failure_text,'native replay ENOENT')
check=EX/'compiled-lifecycle/conformance/evidence/attempt-00/lifecycle.check.json'
require(not check.exists(),'final checker withheld')
# Inner archive verified independently against the uploaded manifest.
archive_record=execution['archive']; tarpath=EX/archive_record['path']; manifestpath=EX/archive_record['manifest']['path']; inner=readj(manifestpath)['members']; expected_inner={r['path']:r for r in inner}
seen=set(); actual=[]; inner_errors=[]; inner_unsafe=[]; special=[]; inner_bytes=0
with tarfile.open(tarpath,'r:gz') as tar:
    for info in tar.getmembers():
        if info.name in seen: inner_errors.append('duplicate:'+info.name)
        seen.add(info.name); norm=posixpath.normpath(info.name.rstrip('/'))
        if info.name.startswith('/') or norm in ('','.','..') or norm.startswith('../') or any(x in ('','.','..') for x in info.name.rstrip('/').split('/')): inner_unsafe.append(info.name)
        if info.isdir(): continue
        if not info.isfile(): special.append(info.name); continue
        actual.append(info.name); h=hashlib.sha256(); size=0; stream=tar.extractfile(info)
        for block in iter(lambda:stream.read(1<<20),b''): h.update(block);size+=len(block)
        inner_bytes+=size; row=expected_inner.get(info.name)
        if row is None or size!=row['bytes'] or h.hexdigest()!=row['sha256']: inner_errors.append(info.name)
require(len(actual)==241 and set(actual)==set(expected_inner) and inner_bytes==158843470 and not inner_errors and not inner_unsafe and not special,'inner archive verification')
# Confirm failure claim: uploaded receipt and report agree; preserve captured status nuance.
receipt=readj(EX/'compiled-lifecycle/coordination/receipts/E-BUILD.json')
report=EX/'compiled-lifecycle/coordination/reports/E-BUILD.md'
require(receipt==execution and receipt['status']=='failed' and receipt['mode']=='full','uploaded execution receipt/status')
require(sha_file(report)==execution['report']['sha256'],'uploaded report pin')
summary={
 'artifact':{'id':download['artifactId'],'run':download['run'],'commit':run['head_sha'],'tree':TREE,'zip_bytes':ZIP.stat().st_size,'zip_sha256':sha_file(ZIP),'chunks':len(chunk_records),'members':len(names),'uncompressed_bytes':uncompressed,'member_errors':len(errors),'extraction_errors':len(extracted_errors)},
 'source':{'count':source_pin_count,'pinned_commit':COMMIT,'tree':TREE,'mismatches':source_mismatches},
 'builds':builds,'output_pin_stability':pin_stability,'cross_backend_appIR_equal':appirs[0]==appirs[1],'cross_backend_encoder_equal':encoders[0]==encoders[1],'cross_backend_shared_outputs_equal':len(equal_shared),'manifest_equal_after_backend_tag_removed':True,
 'runtime_test':{'exit_code':runtime['exitCode'],'pass_10':True,'app_dir':runtime['environmentOverrides']['GOBI_LIFECYCLE_APP_DIR']},
 'inner_archive':{'regular_files':len(actual),'bytes_verified':inner_bytes,'errors':len(inner_errors)},
 'failed_boundary':{'conformance_exit_code':conf['exitCode'],'native_go':conf['args'][conf['args'].index('--native-go')+1],'error':'ENOENT','final_check_present':check.exists(),'receipt_status':receipt['status'],'provider_run_status':run['status'],'provider_conclusion':download['providerRunConclusion']},
 'limits':['The full hosted run failed; successful compile/runtime subchecks do not make CI accepted.','The final conformance checker is absent because native replay attempted a repository-local go executable and failed ENOENT.','The source comparison used Git object 49cc and its tree d49, not mutable tracked file contents.']
}
print(json.dumps(summary,indent=2,sort_keys=True))
