#!/usr/bin/env python3
"""Independent read-only cross-review of E-CI-BUILD's retained primary artifact."""
from __future__ import annotations
import hashlib, json, pathlib, subprocess, zipfile
from collections import Counter

ROOT=pathlib.Path.cwd()
DATE=ROOT/'compiled-methods/ci/2026-10-31'
ART=DATE/'extracted'
ATT=ART/'compiled-methods/artifacts/attempts/attempt-20261031T044100445Z'
REVIEW=DATE/'lanes/evidence/review-build'
SOURCE='6b49cc0bd4c9512a041f723c86b632ec506afd9d'
TREE='b28b10ccefd78f7a90d6d66f2b6769b426ed6a81'
APP='github.com/samuelpmahan/gondola/fixtures/compiled/methods'
STATE=f'{APP}.State'
COUNTER='github.com/samuelpmahan/gondola/counter'
EFFECT='[]github.com/samuelpmahan/gondola/gobi.Effect'

def sha_bytes(data:bytes)->str: return hashlib.sha256(data).hexdigest()
def sha(path:pathlib.Path)->str: return sha_bytes(path.read_bytes())
def readjson(path:pathlib.Path): return json.loads(path.read_text(encoding='utf-8'))
def pin_rows(rows, root:pathlib.Path, prefix=''):
    out=[]; bad=[]
    for row in rows:
        p=root/(prefix+row['path'])
        if not p.is_file():
            bad.append({'path':row['path'],'reason':'missing'}); continue
        rec={'path':row['path'],'bytes':p.stat().st_size,'sha256':sha(p)}
        out.append(rec)
        if (row.get('bytes') is not None and rec['bytes']!=row['bytes']) or rec['sha256']!=row['sha256']:
            bad.append({'path':row['path'],'expected_bytes':row.get('bytes'),'actual_bytes':rec['bytes'],'expected_sha256':row['sha256'],'actual_sha256':rec['sha256']})
    return out,bad

pub=readjson(DATE/'publication-current.json')
metadata=readjson(DATE/'primary-artifact-metadata.json')
retention=readjson(DATE/'artifact-retention.json')
assert pub['sourceCommit']==SOURCE and pub['sourceTree']==TREE
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==SOURCE
assert subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,text=True).strip()==TREE
assert metadata['workflow_run']['head_sha']==SOURCE and metadata['id']==retention['artifactId']
zip_path=DATE/'original.zip'
assert zip_path.stat().st_size==retention['providerZipBytes']==metadata['size_in_bytes']
assert sha(zip_path)==retention['providerZipSha256']==metadata['digest'].removeprefix('sha256:')
with zipfile.ZipFile(zip_path) as z:
    assert z.testzip() is None
    archive_files=[i for i in z.infolist() if not i.is_dir()]
manifest={x['path']:x for x in retention['members']}
assert len(archive_files)==len(manifest)==968
archive_bad=[]
for info in archive_files:
    pin=manifest.get(info.filename); extracted=ART/info.filename
    if pin is None or not extracted.is_file():
        archive_bad.append({'path':info.filename,'reason':'retention-or-extracted-file-missing'}); continue
    if info.file_size!=pin['bytes'] or extracted.stat().st_size!=pin['bytes'] or sha(extracted)!=pin['sha256']:
        archive_bad.append({'path':info.filename,'reason':'archive-member-retention-extracted-mismatch'})
assert not archive_bad
# Reconstruct from separately retained exact chunks and compare to provider ZIP.
chunk_paths=[DATE/'primary-artifact.zip.part-000',DATE/'primary-artifact.zip.part-001',DATE/'primary-artifact.zip.part-002']
chunk_bytes=b''.join(p.read_bytes() for p in chunk_paths)
assert chunk_bytes==zip_path.read_bytes()

execution=readjson(ATT/'execution.json')
assert execution['status']=='passed' and execution['mode']=='full' and not execution['failures']
assert len(execution['commands'])==17 and all(c['exitCode']==0 for c in execution['commands'])
assert execution['outputPinsBefore']==execution['outputPinsAfter']
for backend, rows in execution['outputPinsBefore'].items():
    assert len(rows)==67
    for row in rows:
        p=ART/row['path']
        assert p.is_file() and p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],row['path']
source_rows=execution['sourceBefore']
assert len(source_rows)==137 and source_rows==execution['sourceAfter']
source_actual,source_bad=pin_rows(source_rows,ROOT)
assert not source_bad
# Verify all captured methods command streams against their recorded command digests.
method_log_records=[]
for command in execution['commands']:
    for stream in ['stdout','stderr']:
        rel=command.get(stream+'Path')
        if not rel: continue
        path=ART/rel
        raw=path.read_bytes()
        digest=sha_bytes(raw)
        assert digest==command[stream+'Sha256']
        method_log_records.append({'name':command['name'],'stream':stream,'path':rel,'bytes':len(raw),'sha256':digest})
assert len(method_log_records)==34

# Cross-check the conformance driver's own 188 source pins and the 149 output pins
# recorded at the browser-check boundary, resolving CI absolute paths explicitly.
matrix_dir=ATT/'matrix'
matrix_manifest=readjson(matrix_dir/'methods.manifest.json')
matrix_run=readjson(matrix_dir/'methods.run.json')
matrix_check=readjson(matrix_dir/'methods.check.json')
assert matrix_manifest['status']=='matched' and matrix_check['status']=='matched'
matrix_sources=matrix_manifest['sourcePins']
assert matrix_sources['before']==matrix_sources['after']==matrix_run['sourcePinsBefore']==matrix_run['sourcePinsAfter']==matrix_run['sourcePinsFinal']
assert len(matrix_sources['before'])==len(matrix_run['sourcePinsBefore'])==188
source_kind=Counter()
for row in matrix_sources['before']:
    # The source record combines checked-in files and the per-attempt native/build outputs.
    p=ROOT/row['path']
    kind='checkout'
    if not p.is_file():
        p=ART/row['path']; kind='attempt'
    assert p.is_file() and p.stat().st_size==row['bytes'] and sha(p)==row['sha256'], row['path']
    source_kind[kind]+=1
assert source_kind==Counter({'checkout':51,'attempt':137})
assert matrix_manifest['outputPins']==matrix_run['outputPinsBeforeCheck']==matrix_run['outputPinsAfterCheck']
assert len(matrix_manifest['outputPins'])==149
runner_prefix='/home/runner/work/gondola/gondola/'
output_kind=Counter()
for row in matrix_manifest['outputPins']:
    assert row['path'].startswith(runner_prefix), row['path']
    rel=row['path'][len(runner_prefix):]
    p=ROOT/rel
    kind='checkout'
    if not p.is_file():
        p=ART/rel; kind='attempt'
    assert p.is_file() and p.stat().st_size==row['bytes'] and sha(p)==row['sha256'], row['path']
    output_kind[kind]+=1
assert output_kind==Counter({'attempt':145,'checkout':4})
assert matrix_manifest['evidencePins']==matrix_run['evidencePins'] and len(matrix_manifest['evidencePins'])==7
for row in matrix_manifest['evidencePins']:
    assert row['path'].startswith(runner_prefix), row['path']
    p=ART/row['path'][len(runner_prefix):]
    assert p.is_file() and p.stat().st_size==row['bytes'] and sha(p)==row['sha256'], row['path']
assert matrix_run['sourceStable'] is True and matrix_run['sourceStableThroughCheck'] is True and matrix_run['outputsStableThroughCheck'] is True
matrix_file_records=execution['methodMatrix']['files']
assert len(matrix_file_records)==9
for row in matrix_file_records:
    p=ART/row['path']
    assert p.is_file() and p.stat().st_size==row['bytes'] and sha(p)==row['sha256'],row['path']

# Read actual frontend/backend execution records and verify scoped test logs + output trees.
legacy=[]
def verify_execution(rel, output_prefixes):
    doc=readjson(ART/rel)
    assert doc['status']=='passed' and len(doc['commands']) in (18,33)
    assert all(c.get('exitCode')==0 for c in doc['commands'])
    assert doc['sourceBefore']==doc['sourceAfter']
    actual_source,bad_source=pin_rows(doc['sourceBefore'],ROOT)
    assert not bad_source
    lane_root=pathlib.Path(rel).parts[0]
    log_dir=ART/lane_root/'artifacts/logs'
    log_records=[]
    for c in doc['commands']:
        for stream in ('stdout','stderr'):
            path=log_dir/f'{c["name"]}.{stream}.log'
            raw=path.read_bytes()
            digest=sha_bytes(raw)
            assert digest==c[stream+'Sha256']
            log_records.append({'name':c['name'],'stream':stream,'bytes':len(raw),'sha256':digest})
    if lane_root=='compiled-frontend':
        assert len(doc['outputPinsBefore'])==len(doc['outputPinsAfter'])==209
        assert doc['outputPinsBefore']==doc['outputPinsAfter']
        rows=doc['outputPinsBefore']
        root=ART/'compiled-frontend/artifacts/compiled'
        actual,bad=pin_rows(rows,root)
        assert not bad
        app_results=[{'appId':a['appId'],'status':a['status'],'ticks':a['ticks']} for a in doc['apps']]
        assert len(app_results)==5 and all(x['status']=='matched' for x in app_results)
        output_counts={'compiled':len(rows)}
    else:
        assert set(doc['outputPinsBefore'])=={'react','dom'} and set(doc['outputPinsAfter'])=={'react','dom'}
        output_counts={}
        for backend in ('react','dom'):
            before=doc['outputPinsBefore'][backend]
            after=doc['outputPinsAfter'][backend]
            # Compare inventories after removing the leading prefix added in the final pin capture.
            after_norm=[{**row,'path':row['path'].removeprefix(f'compiled-backends/artifacts/compiled/{backend}/')} for row in after]
            assert len(before)==len(after_norm)==209
            # The pre-run inventory includes byte counts; the final capture records path+SHA only.
            before_keys=sorted((row['path'],row['sha256']) for row in before)
            after_keys=sorted((row['path'],row['sha256']) for row in after_norm)
            assert before_keys==after_keys
            actual,bad=pin_rows(before,ART/f'compiled-backends/artifacts/compiled/{backend}')
            assert not bad
            output_counts[backend]=len(before)
        app_results=[{'appId':a.get('appId'),'status':a.get('status')} for a in doc['backendConformance']]
        assert len(app_results)==5 and all(x['status']=='matched' for x in app_results)
    return {'path':rel,'status':doc['status'],'commands':len(doc['commands']),'source_pins':len(doc['sourceBefore']),
        'source_pins_match_checkout':True,'captured_log_streams':len(log_records),'all_log_streams_match':True,
        'output_counts':output_counts,'matched_apps':app_results}
front=readjson(ART/'compiled-frontend/artifacts/execution.json')
# Verify the two frontend and backend command trees via lane-specific helper.
front_result=verify_execution('compiled-frontend/artifacts/execution.json',None)
back_result=verify_execution('compiled-backends/artifacts/execution.json',None)
assert front_result['commands']==33 and back_result['commands']==18

builds={}
for backend in ('react','dom'):
    base=ATT/f'builds/{backend}'
    request=readjson(base/'request.json')
    result=readjson(base/'result.json')
    assert request['schema']=='gobi.build-request/v1'
    assert request['backend']==backend and request['entryPackages']==[APP]
    assert result['schema']=='gobi.build-result/v1' and result['ok'] is True
    assert len(result['apps'])==1 and result['diagnostics']==[] and len(result['outputs'])==67
    assert result['apps'][0]['schema']=='gobi.app-ir/v1' and result['apps'][0]['packagePath']==APP
    outdir=base/'output'
    actual=[]
    for p in sorted(x for x in outdir.rglob('*') if x.is_file()):
        rel=p.relative_to(outdir).as_posix()
        actual.append({'path':rel,'bytes':p.stat().st_size,'sha256':sha(p)})
    declared=sorted([{'path':x['path'],'bytes':x['bytes'],'sha256':x['sha256']} for x in result['outputs']],key=lambda x:x['path'])
    actual=sorted(actual,key=lambda x:x['path'])
    assert len(actual)==67 and actual==declared
    assert result['apps'][0]==readjson(outdir/'apps/methods-0cac42b0a982/app-ir.json')
    assert execution['methodBuilds'][backend]['backend']==backend
    assert execution['methodBuilds'][backend]['outputCount']==67
    assert execution['methodBuilds'][backend]['request']['sha256']==sha(base/'request.json')
    compile_command=next(c for c in execution['commands'] if c['name']==f'compile-{backend}')
    assert execution['methodBuilds'][backend]['result']['sha256']==compile_command['stdoutSha256']
    assert sha(ART/compile_command['stdoutPath'])==compile_command['stdoutSha256']
    assert execution['methodBuilds'][backend]['manifest']['sha256']==sha(outdir/'buildmanifest.json')
    assert execution['methodBuilds'][backend]['outputPins']==sorted(actual,key=lambda x:x['path'])
    manifest_doc=readjson(outdir/'buildmanifest.json')
    assert len(manifest_doc['apps'])==1
    app_entry=manifest_doc['apps'][0]
    assert app_entry['backend']==backend and app_entry['packagePath']==APP
    assert app_entry['appIR']=='apps/methods-0cac42b0a982/app-ir.json'
    assert app_entry['module']=='apps/methods-0cac42b0a982/gobi-compiled.mjs'
    assert app_entry['encoder']=='apps/methods-0cac42b0a982/encoder.mjs'
    builds[backend]={'request':request,'result_summary':{'ok':result['ok'],'app_count':len(result['apps']),'diagnostics':result['diagnostics'],'output_count':len(result['outputs'])},
       'request_pin':{'bytes':(base/'request.json').stat().st_size,'sha256':sha(base/'request.json')},
       'result_pin':{'bytes':(base/'result.json').stat().st_size,'sha256':sha(base/'result.json')},
       'actual_inventory':actual}
    pinned_before=execution['outputPinsBefore'][backend]
    pinned_after=execution['outputPinsAfter'][backend]
    assert pinned_before==pinned_after and len(pinned_before)==67
    expected_prefix=f'{execution["attempt"]}/builds/{backend}/output/'
    pin_actual=[]
    for row in pinned_before:
        assert row['path'].startswith(expected_prefix),row['path']
        rel=row['path'][len(expected_prefix):]
        pin_actual.append({'path':rel,'bytes':row['bytes'],'sha256':row['sha256']})
    assert sorted(pin_actual,key=lambda x:x['path'])==actual
# Compare backend output inventories from bytes, not the author summary.
r=builds['react']['actual_inventory']; d=builds['dom']['actual_inventory']
assert [x['path'] for x in r]==[x['path'] for x in d]
diffs=[{'path':a['path'],'react':a,'dom':b} for a,b in zip(r,d) if a!=b]
assert [x['path'] for x in diffs]==['apps/methods-0cac42b0a982/gobi-compiled.mjs','buildmanifest.json']
react_out=ATT/'builds/react/output'; dom_out=ATT/'builds/dom/output'
react_ir=(react_out/'apps/methods-0cac42b0a982/app-ir.json').read_bytes()
dom_ir=(dom_out/'apps/methods-0cac42b0a982/app-ir.json').read_bytes()
assert react_ir==dom_ir
react_manifest=readjson(react_out/'buildmanifest.json')
dom_manifest=readjson(dom_out/'buildmanifest.json')
for manifest_doc in (react_manifest,dom_manifest):
    assert len(manifest_doc['apps'])==1 and manifest_doc['apps'][0]['backend'] in ('react','dom')
react_manifest['apps'][0].pop('backend')
dom_manifest['apps'][0].pop('backend')
assert react_manifest==dom_manifest
react_enc=(react_out/'apps/methods-0cac42b0a982/encoder.mjs').read_bytes()
dom_enc=(dom_out/'apps/methods-0cac42b0a982/encoder.mjs').read_bytes()
assert react_enc==dom_enc
react_fwd=(react_out/'forwarders/facades/methods-0cac42b0a982/forwarder.go').read_bytes()
dom_fwd=(dom_out/'forwarders/facades/methods-0cac42b0a982/forwarder.go').read_bytes()
assert react_fwd==dom_fwd
forwarder=react_fwd.decode()
for expected in ['return gobiApp.Init()','return gobiApp.Update(state, message)','return gobiApp.View(state)']:
    assert expected in forwarder
assert 'GobiCompiledInit() gobiApp.State' in forwarder
assert 'GobiCompiledUpdate(state gobiApp.State, message gobiType0.Message) (gobiApp.State, []gobiType0.Effect)' in forwarder
assert 'GobiCompiledView(state gobiApp.State) gobiType0.Node' in forwarder

ir=readjson(react_out/'apps/methods-0cac42b0a982/app-ir.json')
assert ir['schema']=='gobi.app-ir/v1' and ir['packagePath']==APP and len(ir['components'])==1
sym={x['id']:x for x in ir['symbols']}
roles={f'{APP}.Init',f'{APP}.Update',f'{APP}.View'}
methods={f'{STATE}.{name}' for name in ['Initialize','Reduce','AddParent','ResetParent','AddChild','ResetChild','ToggleReadOnly','CaptureChild','PublishSaved','ComposeView']}
deps={f'{COUNTER}.Init',f'{COUNTER}.Update'}
assert set(sym)==roles|methods|deps
# Independently assert value receiver as first parameter, signatures, and full call graph.
for name in ['Initialize','AddParent','ResetParent','AddChild','ResetChild','ToggleReadOnly','CaptureChild','PublishSaved','ComposeView']:
    assert sym[f'{STATE}.{name}']['signature']['params'][0]==STATE
assert sym[f'{STATE}.Reduce']['signature']['params']==[STATE,'github.com/samuelpmahan/gondola/gobi.Message']
assert sym[f'{STATE}.Initialize']['signature']['results']==[STATE]
for name in ['Reduce','AddParent','ResetParent','AddChild','ResetChild','ToggleReadOnly','CaptureChild','PublishSaved']:
    assert sym[f'{STATE}.{name}']['signature']['results']==[STATE,EFFECT]
assert sym[f'{STATE}.ComposeView']['signature']['results']==['github.com/samuelpmahan/gondola/gobi.Node']
expected_calls={
 f'{APP}.Init':[f'{STATE}.Initialize'],
 f'{STATE}.Initialize':[f'{COUNTER}.Init'],
 f'{APP}.Update':[f'{STATE}.Reduce'],
 f'{STATE}.Reduce':[f'{STATE}.{x}' for x in ['AddParent','ResetParent','AddChild','ResetChild','ToggleReadOnly','CaptureChild','PublishSaved']],
 f'{STATE}.AddParent':[f'{COUNTER}.Update'],f'{STATE}.ResetParent':[f'{COUNTER}.Update'],
 f'{STATE}.AddChild':[f'{COUNTER}.Update'],f'{STATE}.ResetChild':[f'{COUNTER}.Update'],
 f'{APP}.View':[f'{STATE}.ComposeView'],
}
for key, calls in expected_calls.items(): assert sym[key]['calls']==calls
for key in [f'{STATE}.ToggleReadOnly',f'{STATE}.CaptureChild',f'{STATE}.PublishSaved',f'{STATE}.ComposeView']:
    assert sym[key]['calls']==[]

# The GoScript version/checksum and origin are bound to current source, while execution log pins the compiler version.
go_mod=(ROOT/'compiled-frontend/go.mod').read_text()
go_sum=(ROOT/'compiled-frontend/go.sum').read_text()
assert 'github.com/s4wave/goscript v0.6.2' in go_mod
assert 'github.com/s4wave/goscript v0.6.2 h1:GucUqQ+xvaBzAH6W4U9Ec62T4ytUBDbmGojJbWrVEKc=' in go_sum
assert 'github.com/s4wave/goscript v0.6.2/go.mod h1:g2psiTXAhkiM7vtr8YEgkq/xUlYHLSghruODJL8VpAU=' in go_sum
origin=readjson(ROOT/'compiled-frontend/toolchain/probe_counter/results/module-origin.json')
assert origin['Version']=='v0.6.2' and origin['Origin']['Hash']=='d8f58a091947cff26a9171be7bd130892b0afad3'
module_report=readjson(DATE/'lanes/build/go-list-goscript.json')
assert module_report['Version']=='v0.6.2' and module_report['GoVersion']=='1.27.0'
assert module_report['Sum']=='h1:GucUqQ+xvaBzAH6W4U9Ec62T4ytUBDbmGojJbWrVEKc='
assert module_report['GoModSum']=='h1:g2psiTXAhkiM7vtr8YEgkq/xUlYHLSghruODJL8VpAU='

result={'schema':'gobi.xr-ci-build-independent-audit/v1','job_id':'XR-CI-BUILD','worker':'N3','decision':'accepted','status':'passed',
 'source':{'commit':SOURCE,'tree':TREE,'parent':pub['parent'],'git_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'git_tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,text=True).strip()},
 'artifact':{'run_id':retention['run'],'job_id':retention['job'],'artifact_id':retention['artifactId'],'provider_zip_sha256':sha(zip_path),'provider_zip_bytes':zip_path.stat().st_size,'zip_crc':'passed','members':len(archive_files),'uncompressed_bytes':sum(i.file_size for i in archive_files),'chunk_reconstruction_match':True,'all_member_hashes_match':True},
 'method_execution':{'status':execution['status'],'mode':execution['mode'],'commands':len(execution['commands']),'all_exit_zero':True,'source_pin_count':len(source_rows),'source_pins_match_checkout':True,'command_log_streams':len(method_log_records),'all_command_logs_match':True,'versions':execution['versions']},
 'conformance_pins':{'source_pin_count':len(matrix_sources['before']),'source_checkout_count':source_kind['checkout'],'source_attempt_output_count':source_kind['attempt'],'source_before_after_identical':True,'browser_check_output_pin_count':len(matrix_manifest['outputPins']),'matrix_evidence_pin_count':len(matrix_manifest['evidencePins']),'matrix_files_count':len(matrix_file_records),'all_matrix_and_check_pins_match':True},
 'builds':builds,
 'build_comparison':{'output_count_per_backend':67,'same_paths':True,'byte_identical_paths':65,'differing_paths':diffs,'manifest_equal_after_backend_tag_removal':True,'app_ir_byte_identical':True,'app_ir_sha256':sha_bytes(react_ir),'encoder_byte_identical':True,'encoder_sha256':sha_bytes(react_enc),'forwarder_byte_identical':True,'forwarder_sha256':sha_bytes(react_fwd)},
 'app_ir':{'schema':ir['schema'],'component_count':len(ir['components']),'symbol_count':len(sym),'role_symbols':sorted(roles),'value_receiver_methods':sorted(methods),'dependency_symbols':sorted(deps),'receiver_first_signatures_valid':True,'tuple_return_signatures_valid':True,'expected_call_graph_valid':True},
 'forwarder':{'direct_typed_role_calls_valid':True,'sha256':sha_bytes(react_fwd)},
 'goscript_provenance':{'module':'github.com/s4wave/goscript','version':'v0.6.2','module_go_version':'1.27.0','module_sum':module_report['Sum'],'go_mod_sum':module_report['GoModSum'],'origin_commit':origin['Origin']['Hash'],'go_mod_sha256':sha(ROOT/'compiled-frontend/go.mod'),'go_sum_sha256':sha(ROOT/'compiled-frontend/go.sum'),'module_origin_sha256':sha(ROOT/'compiled-frontend/toolchain/probe_counter/results/module-origin.json'),'go_list_record_sha256':sha(DATE/'lanes/build/go-list-goscript.json'),'origin_metadata_is_source_checkout_not_provider_zip':True},
 'inherited':{'compiled_frontend':front_result,'compiled_backends':back_result,
  'go_test_race_vet_commands':[{"lane":"compiled-frontend","name":c['name'],"args":c['args'],"exitCode":c['exitCode'],"stdoutSha256":c['stdoutSha256'],"stderrSha256":c['stderrSha256']} for c in front['commands']+readjson(ART/'compiled-backends/artifacts/execution.json')['commands'] if c['name'] in {'root-go-tests','root-go-race','root-go-vet','go-tests','go-race','go-vet'}]},
 'review_limits':['No build, test, race, vet, or browser command was rerun; this is an independent read-only audit of retained outputs and their pins.','The GoScript module-origin and go-list records are in the checkout/review evidence rather than the provider ZIP; the current source commit, go.mod/go.sum and CI source pins were checked.','This review accepts the primary push build artifact; it does not make a separate PR merge or all-workflow status claim.']}
(REVIEW/'independent-build-audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'decision':result['decision'],'zip':result['artifact'],'builds':{k:{'outputs':v['result_summary']['output_count'],'backend':v['request']['backend']} for k,v in builds.items()},'build_comparison':result['build_comparison'],'app_ir':result['app_ir'],'execution':result['method_execution']},indent=2))
