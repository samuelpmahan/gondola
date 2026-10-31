#!/usr/bin/env python3
"""Read-only independent evidence audit for E-ACCEPT-NATIVE."""
from __future__ import annotations
import hashlib, json, pathlib, stat
from collections import Counter

ROOT=pathlib.Path(__file__).resolve().parents[4]
LOCAL=ROOT/'compiled-capabilities/builds/attempts/attempt-20261031T103735751Z'
HOST=ROOT/'compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/primary-push-run-41193504188-extracted/compiled-capabilities/builds/attempts/attempt-20261031T103752934Z'
CI=ROOT/'compiled-capabilities/ci/2026-10-31/source-60b5aef'
PROVIDER=CI/'custody/provider'
RECEIPT=ROOT/'compiled-capabilities/coordination/receipts/E-ACCEPT-NATIVE.json'
REPORT=ROOT/'compiled-capabilities/coordination/reports/E-ACCEPT-NATIVE.md'
SOURCE='60b5aeff3172837ad7831c2b78b210454a3d81a2'
TREE='cc3a129b4372d00d5168135aa2e5687dfbf6788f'
PARENT='a2e1164d68abaf6d44d72f554a98f1b9ab0' # replaced below from packet
checks=[]
def digest(p):
    p=pathlib.Path(p); h=hashlib.sha256();n=0
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b);n+=len(b)
    return n,h.hexdigest()
def readj(p):return json.loads(pathlib.Path(p).read_bytes())
def check(name, ok, detail):
    if not ok: raise AssertionError(f'{name}: {detail}')
    checks.append({'check':name,'status':'passed','detail':detail})
def safe_rel(s):
    p=pathlib.PurePosixPath(s)
    if not s or s.startswith('/') or '\\' in s or '..' in p.parts: return False
    return True

receipt=readj(RECEIPT); report=REPORT
check('packet identity',receipt.get('job_id')=='E-ACCEPT-NATIVE' and receipt.get('worker')=='N2' and receipt.get('outcome')=='mixed_change','N2 packet binds exact native/direct sub-lane with local archive rejection')
rb,rsha=digest(report)
check('report binding',(rb,rsha)==(receipt['report']['bytes'],receipt['report']['sha256']),f'{rb} bytes sha256={rsha}')
source_id=receipt['sourceIdentity'];parent=source_id['parent']
check('source identity',source_id['commit']==SOURCE and source_id['tree']==TREE and source_id['parent']==parent and source_id['pullRequest']==15,'source commit/tree/PR identity matches report')
source_bad=[]
for rel,expected in receipt['source_sha256'].items():
    p=ROOT/rel
    if not p.is_file() or digest(p)[1]!=expected:source_bad.append(rel)
check('all packet source pins',not source_bad,f'{len(receipt["source_sha256"])} pinned paths; mismatches={source_bad[:3]}')

# Publication and terminal source cohort.
pub=ROOT/receipt['sourceIdentity']['publicationBinding']['path']; pb,ph=digest(pub)
check('publication binding',(pb,ph)==(receipt['sourceIdentity']['publicationBinding']['bytes'],receipt['sourceIdentity']['publicationBinding']['sha256']),f'{pb} bytes sha256={ph}')
bind=readj(pub)
check('published source identity',bind.get('local',{}).get('commit')==bind.get('remote',{}).get('commit')==SOURCE and bind.get('local',{}).get('tree')==bind.get('remote',{}).get('tree')==TREE and bind.get('local',{}).get('parents')==bind.get('remote',{}).get('parents')==[parent] and bind.get('remote',{}).get('refReadbackVerified') is True,'local and remote published commit/tree/parent agree and ref readback was verified')
catinfo=receipt['terminalCatalog'];catp=ROOT/catinfo['path'];cb,ch=digest(catp);cat=readj(catp)
check('terminal catalog pin',(cb,ch)==(catinfo['bytes'],catinfo['sha256']),f'{cb} bytes sha256={ch}')
check('terminal cohort summary',cat['source']['commit']==SOURCE and cat['source']['tree']==TREE and cat['source']['parent']==parent and cat['runCount']==cat['jobCount']==30 and cat['allRunsTerminal'] and cat['allRunsConcludedSuccess'] and cat['allJobsConcludedSuccess'] and cat['allRunHeadShasMatchSource'],'30 runs/jobs, all terminal-success and exact-source bound')
check('terminal event counts',cat['eventCounts']=={'push':15,'pull_request':15} and cat['runStatusCounts']=={'completed:success':30} and cat['jobStatusCounts']=={'completed:success':30},'15 push and 15 PR; all run/job statuses completed-success')
runlist=cat['runListResponse'];runlist_path=ROOT/runlist['path'];runlist_bytes,runlist_sha=digest(runlist_path);raw_runs=readj(runlist_path)
check('raw run list pin and cohort',(runlist_bytes,runlist_sha)==(runlist['bytes'],runlist['sha256']) and len(raw_runs.get('workflow_runs',[]))==30,'raw provider run-list response hash and 30 run IDs match catalog')
job_total=0
for run in cat['runs']:
    check(f"run {run['id']} head/status",run['headSha']==SOURCE and run['status']=='completed' and run['conclusion']=='success',"exact source head and successful terminal workflow")
    js=run['jobSnapshot'];jp=ROOT/js['path'];jb,jh=digest(jp);jobs=readj(jp)
    check(f"run {run['id']} job snapshot hash",(jb,jh)==(js['bytes'],js['sha256']) and len(jobs['jobs'])==js['jobCount'],f"{jb} bytes sha256={jh}")
    check(f"run {run['id']} all recorded jobs and steps",all(j['run_id']==run['id'] and j['status']=='completed' and j['conclusion']=='success' and all(st['status']=='completed' and st['conclusion']=='success' for st in j['steps']) for j in jobs['jobs']),"all job and step results are completed-success")
    job_total+=len(jobs['jobs'])
check('all 30 per-run job snapshots',job_total==30,'all 30 runs have one successful job snapshot each')

# Actual local/host execution records and the frozen literal scenario.
local_exec=readj(LOCAL/'execution.json');host_exec=readj(HOST/'execution.json')
check('local full execution',local_exec.get('status')=='passed' and local_exec.get('mode')=='full' and not local_exec.get('failures') and len(local_exec.get('commands',[]))==17 and local_exec.get('sourcePinsMatch') is True,'local full execution passed with 17 recorded commands and stable source pins')
check('hosted full execution',host_exec.get('status')=='passed' and host_exec.get('mode')=='full' and not host_exec.get('failures') and len(host_exec.get('commands',[]))==17 and host_exec.get('sourcePinsMatch') is True,'hosted full execution passed with 17 recorded commands and stable source pins')
local_exec_path=ROOT/'compiled-capabilities/builds/attempts/attempt-20261031T103735751Z/execution.json'
check('execution receipts',digest(local_exec_path)[1]==receipt['localExecution']['receipt']['sha256'] and digest(LOCAL/'execution.json')[1]==receipt['localExecution']['receipt']['sha256'],'local E-BUILD receipt and execution record share the cited digest')
fixture_path=ROOT/'fixtures/compiled/lifecycle/scenario.json'
fixture=readj(fixture_path)
check('frozen fixture source pin',digest(fixture_path)[1]==receipt['source_sha256']['fixtures/compiled/lifecycle/scenario.json'],'fixture bytes match the receipt source pin')
# Receipt has an explicit fixture digest; independently verify it and contents.
fixture_sha=hashlib.sha256(fixture_path.read_bytes()).hexdigest()
check('fixture identity and counts',fixture_sha==receipt['nativeAudit']['fixture']['sha256'] and len(fixture['events'])==26 and sum(1 for e in fixture['events'] if e.get('kind')=='click')==16,'frozen lifecycle fixture has 26 events and 16 physical clicks')

# Traces, ticks, views/states and request/cancel ordering.
local_native=readj(LOCAL/'matrix/capabilities.lifecycle.native.json')
local_direct=readj(LOCAL/'matrix/capabilities.lifecycle.direct.json')
host_native=readj(HOST/'matrix/capabilities.lifecycle.native.json')
host_direct=readj(HOST/'matrix/capabilities.lifecycle.direct.json')
local_check=readj(LOCAL/'matrix/capabilities.lifecycle.check.json')
host_check=readj(HOST/'matrix/capabilities.lifecycle.check.json')
check('local and hosted lifecycle bytes',all((LOCAL/'matrix'/n).read_bytes()==(HOST/'matrix'/n).read_bytes() for n in ('capabilities.lifecycle.native.json','capabilities.lifecycle.direct.json','capabilities.lifecycle.check.json')),'native/direct/check JSON bytes match between local and hosted attempts')
steps_n=local_native['steps'];steps_d=local_direct['steps'];events=fixture['events']
check('26 native/direct event steps',len(steps_n)==len(steps_d)==len(events)==26,'native, direct, and frozen fixture each have 26 steps/events')
check('event/message ordering',all(n['index']==i and d['eventIndex']==i and n['kind']==ev['kind'] and n['message']==ev.get('message')==d['message'] for i,(n,d,ev) in enumerate(zip(steps_n,steps_d,events))),'all 26 event/message positions match the frozen fixture')
check('state and view captured on every step',all(isinstance(s.get('state'),dict) and isinstance(s.get('view'),dict) for s in steps_n) and all(isinstance(s.get('state'),dict) and isinstance(s.get('view'),dict) for s in steps_d),'every native and direct step contains state and view evidence')
check('direct trace tick sequence',len(local_direct['trace']['ticks'])==26 and all(t['index']==i for i,t in enumerate(local_direct['trace']['ticks'])) and all(s['tickAfter']-s['tickBefore'] in (0,1) for s in steps_d) and sum(s['tickAfter']-s['tickBefore'] for s in steps_d)==25,'26 trace ticks include the initial state; 25 event updates and one no-op physical event are recorded')
expected_tokens=['parent:g1:r1','child:g1:r2','grandchild:g1:r3','sibling:g1:r4','parent:g2:r5','child:g2:r6','grandchild:g2:r7']
requests=[e['arg'] for s in steps_n for e in s.get('effects',[]) if e.get('kind')=='fixture.request']
check('native typed request effects',requests==expected_tokens,'seven typed request effects appear in expected dispatch order')
native_cancels=[e['arg'] for s in steps_n for e in s.get('effects',[]) if e.get('kind')=='lifecycle.cancel']
direct_cancels=[e['token'] for e in local_direct['effectRecords'] if e.get('kind')=='cancel']
order=['grandchild:g1:r3','child:g1:r2','parent:g1:r1']
check('child-first cancellation evidence',native_cancels==direct_cancels==order,'native and direct outputs both cancel grandchild, child, then parent')
direct_requests=[e['token'] for e in local_direct['effectRecords'] if e.get('kind')=='request']
check('direct request and cancellation counts',direct_requests==expected_tokens and len(direct_cancels)==3,'direct evidence records seven requests and three cancellations')
check('conformance oracle summary',local_check==host_check and local_check.get('status')=='matched' and local_check.get('events')==26 and local_check.get('ticks')==26 and local_check.get('clicks')==16 and local_check.get('requests')==7 and local_check.get('cancellations')==3 and local_check.get('cancellationOrder')==order and local_check.get('nativeTraceCheckedAgainstLiteralOracle') is True and local_check.get('directTraceCheckedAgainstLiteralOracle') is True,'frozen conformance record confirms native/direct trace, state, view, and effect checks matched the literal oracle')

# Recompute all four output inventories and cross-environment byte comparison.
expected_diff={'apps/lifecycle-7e6575d90707/gobi-compiled.mjs','forwarders/go.mod'}
local_pins={};host_pins={}; records={}
for backend,base in [('local',LOCAL),('hosted',HOST)]:
    for target in ('react','dom'):
        bdir=base/target;rec=readj(bdir/'build-record.json');pins=rec['outputPins']
        check(f'{backend} {target} output count',rec['backend']==target and rec['outputCount']==67 and len(pins)==67,'build record has exactly 67 outputs')
        pmap={}
        for row in pins:
            name=row['path'];check(f'{backend} {target} safe output path',safe_rel(name),name)
            f=bdir/'output'/name
            check(f'{backend} {target} physical output pin',f.is_file() and not f.is_symlink() and f.stat().st_size==row['bytes'] and digest(f)[1]==row['sha256'],name)
            check(f'{backend} {target} unique output path',name not in pmap,name)
            pmap[name]=row['sha256']
        physical={p.relative_to(bdir/'output').as_posix() for p in (bdir/'output').rglob('*') if p.is_file()}
        check(f'{backend} {target} exact physical inventory',physical==set(pmap) and len(physical)==67,f'{len(physical)} files exactly match build record')
        (local_pins if backend=='local' else host_pins)[target]=pmap
        records[(backend,target)]=rec
for target in ('react','dom'):
    lp=local_pins[target];hp=host_pins[target]
    diffs={p for p in lp if lp[p]!=hp.get(p)}
    check(f'{target} hosted path and byte comparison',set(lp)==set(hp) and diffs==expected_diff and len(lp)-len(diffs)==65,'67 paths; 65 exact bytes match; only module and forwarders/go.mod differ')
    for kind in ('appIR','encoder'):
        rel=records[('local',target)]['app']['paths'][kind]
        local_bytes=(LOCAL/target/'output'/rel).read_bytes()
        host_rel=records[('hosted',target)]['app']['paths'][kind]
        host_bytes=(HOST/target/'output'/host_rel).read_bytes()
        check(f'{target} {kind} local-hosted equality',local_bytes==host_bytes,f'{len(local_bytes)} bytes identical')
        for env,base in [('local',LOCAL),('hosted',HOST)]:
            reactrel=records[(env,'react')]['app']['paths'][kind]
            otherrel=records[(env,target)]['app']['paths'][kind]
            check(f'{env} React-{target} {kind} equality',(base/'react'/'output'/reactrel).read_bytes()==(base/target/'output'/otherrel).read_bytes(),'backend-independent AppIR/encoder bytes')
    lmod=(LOCAL/target/'output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs').read_text().splitlines()
    hmod=(HOST/target/'output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs').read_text().splitlines()
    check(f'{target} module source-comment normalization',[x for x in lmod if not x.startswith('// ')]==[x for x in hmod if not x.startswith('// ')],'module body matches after stripping path-bearing comments')
    lgo=(LOCAL/target/'output/forwarders/go.mod').read_text();hgo=(HOST/target/'output/forwarders/go.mod').read_text()
    localroot='/workspace/scratch/39a56936f173/gondola-capabilities';hostroot='/home/runner/work/gondola/gondola'
    check(f'{target} go.mod source-root normalization',localroot in lgo and hostroot in hgo and lgo.replace(localroot,'<repo-root>')==hgo.replace(hostroot,'<repo-root>'),'go.mod differs only by local/host repository root')

# React/DOM capability requirements, source-bound hosted archive, and toolchain facts.
reactir=readj(LOCAL/'react/output/apps/lifecycle-7e6575d90707/app-ir.json')
# Requirements are in app's generated IR; allow either top-level or app metadata shape.
reqs=set()
def collect_caps(obj):
    if isinstance(obj,dict):
        for k,v in obj.items():
            if k in ('requirements','requiredCapabilities','capabilities') and isinstance(v,list):
                reqs.update(x if isinstance(x,str) else x.get('id',x.get('name')) for x in v)
            collect_caps(v)
    elif isinstance(obj,list):
        for v in obj: collect_caps(v)
collect_caps(reactir)
expected_caps={'view.node','numeric.safe-integer','numeric.float64','effect.request-reply','effect.cancel'}
check('AppIR capability declaration',expected_caps.issubset(reqs),f'found required capabilities {sorted(expected_caps)}')
check('toolchain comparison',local_exec['versions']['node']==host_exec['versions']['node']=='v22.23.4' and local_exec['versions']['compiledGo']==host_exec['versions']['compiledGo']=='go version go1.27.3 linux/amd64' and local_exec['versions']['lockedDependencies']==host_exec['versions']['lockedDependencies'] and local_exec['versions']['npm']!=host_exec['versions']['npm'] and local_exec['versions']['rootGo']!=host_exec['versions']['rootGo'] and local_exec['versions']['chromium']!=host_exec['versions']['chromium'],'shared Node/compiler Go/locked dependencies; npm/root Go/browser versions reported separately')

# Authoritative hosted archive/custody records are separately pinned; no archive is rebuilt.
n4path=ROOT/'compiled-capabilities/coordination/receipts/E-ACCEPT-CUSTODY.json'; n4=readj(n4path)
check('N4 custody receipt citation',digest(n4path)[1]==receipt['hostedArtifact']['independentCustodyReceipt']['sha256'] and n4['job_id']=='E-ACCEPT-CUSTODY','N2 citation resolves to the preserved N4 custody packet; later custody amendment is handled separately')
zipmeta=receipt['hostedArtifact']['outerZip']; zip_path=ROOT/zipmeta['path']; zipbytes,zipsha=digest(zip_path)
check('authoritative ZIP bytes/hash',(zipbytes,zipsha)==(zipmeta['bytes'],zipmeta['sha256']),'primary source CI ZIP matches N2 and N4 recorded identity')
inner=receipt['hostedArtifact']['innerArchive']; innerpath=HOST/'capabilities-artifacts.tar.gz'; ib,ih=digest(innerpath)
check('hosted inner archive identity',(ib,ih)==(inner['bytes'],inner['sha256']),'hosted execution archive bytes/hash match receipt')
manifest_path=HOST/'archive-manifest.json'; mb,mh=digest(manifest_path); manifest=readj(manifest_path)
check('hosted archive manifest identity',(mb,mh)==(inner['manifestBytes'],inner['manifestSha256']) and len(manifest['members'])==inner['memberCount']==189,'189 manifested files match cited archive manifest')
inner_verify=readj(PROVIDER/'primary-push-run-41193504188-inner-verification.json')
check('authoritative archive complete verifier',inner_verify['receipt_status']=='passed' and inner_verify['receipt_mode']=='full' and inner_verify['receipt_failures']==0 and inner_verify['tar_members_match_manifest'] and inner_verify['gzip_consumed_to_eof_and_trailer_valid'] and inner_verify['archive_sha256']==ih,'independent verifier confirms complete source-pinned hosted archive')
snapshot=readj(PROVIDER/'primary-push-run-41193504188-execution-before-archive.json')
check('hosted provenance snapshot semantics',snapshot.get('status')=='archive_pending' and snapshot.get('archivePending') is True and snapshot.get('finalAcceptance') is False,'immutable pre-archive snapshot is pending/nonfinal; the final receipt binds the archive')

# Archive disposition is a distinct local failure and authoritative CI evidence remains pinned.
localarc=receipt['localArchive'];local_tar=LOCAL/'capabilities-artifacts.tar.gz';lab,lah=digest(local_tar)
check('local archive rejected separately',localarc['status']=='rejected' and localarc['cause']=='unknown' and (lab,lah)==(localarc['actualBytes'],localarc['actualSha256']) and lab!=localarc['expectedBytes'] and lah!=localarc['expectedSha256'],'local container differs from receipt; cause remains unknown')
scope=readj(ROOT/localarc['rootIntegrityRecord']['path'])
check('root archive scope record',scope.get('status')=='rejected' and scope.get('finalAcceptance') is False and scope.get('source')==SOURCE and scope.get('expected',{}).get('sha256')==localarc['expectedSha256'] and scope.get('actual',{}).get('sha256')==localarc['actualSha256'],'root policy retains local archive rejection with separate expected/actual hashes')
check('milestone scope kept open',receipt['scopeStatus']['globalMilestoneAcceptance'] is False and any('overall milestone' in x.lower() for x in receipt['limitations']),'native lane does not claim overall milestone closure')

out={"schema":"gobi.xr-accept-native-audit/v1","reviewer":"N5","subject":"E-ACCEPT-NATIVE","sourceCommit":SOURCE,"sourceTree":TREE,"status":"passed","checkCount":len(checks),"checks":checks,"limitations":["Read-only audit of captured bytes and manifests; no build, browser smoke, or full suite was rerun.","The local archive remains rejected with cause unknown.","This review accepts the native/direct and React/DOM evidence lane only, not overall milestone closure."]}
path=pathlib.Path(__file__).resolve().parent/'audit.json';path.write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({"status":out['status'],"checkCount":out['checkCount'],"output":str(path)},sort_keys=True))
