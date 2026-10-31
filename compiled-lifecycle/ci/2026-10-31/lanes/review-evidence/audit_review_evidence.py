#!/usr/bin/env python3
"""Independent audit of the immutable E-CI-EVIDENCE packet at 07:26:45Z."""
from __future__ import annotations
import hashlib, json, re, subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[5]
CI=ROOT/'compiled-lifecycle/ci/2026-10-31'
EX=CI/'extracted'
ATT=EX/'compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z'
EVID=CI/'lanes/evidence'
checks=[]
inputs={}
def require(ok: bool, name: str, detail: str=''):
    if not ok: raise AssertionError(f'{name}: {detail}')
    checks.append({'check':name,'result':'pass','detail':detail})
def read(path: Path): return json.loads(path.read_text(encoding='utf-8'))
def sha(path: Path):
    h=hashlib.sha256(); n=0
    with path.open('rb') as f:
        while True:
            b=f.read(1<<20)
            if not b: break
            n+=len(b); h.update(b)
    return n,h.hexdigest()
def record(path: Path):
    n,h=sha(path); inputs[path.relative_to(ROOT).as_posix()]={'bytes':n,'sha256':h}; return n,h

def main():
    report=CI/'coordination/reports/E-CI-EVIDENCE.md'
    receipt=read(CI/'coordination/receipts/E-CI-EVIDENCE.json')
    report_n,report_sha=record(report)
    require(report_sha=='dfbe352c0b381a818a376c972e3cde0bb7f3c76f4d7bf35bed1c631375cb93a9'==receipt['report_sha256'], 'frozen report hash', report_sha)
    require(receipt['job_id']=='E-CI-EVIDENCE' and receipt['worker']=='N6', 'packet identity')
    require(hashlib.sha256(receipt['summary'].encode()).hexdigest()==receipt['summary_sha256'], 'receipt summary hash')

    raw=read(EVID/'runs-headsha-20261031T072645Z.json')
    normalized=read(EVID/'runs-summary-20261031T072645Z.json')
    require(raw['total_count']==28 and len(raw['workflow_runs'])==28, 'raw workflow snapshot size')
    runs=raw['workflow_runs']
    require(all(r['head_sha']=='49cc2b96c8817a47319d5b7bd484184a22fa984b' for r in runs), 'raw workflow snapshot head binding')
    split={event:[r for r in runs if r['event']==event] for event in ('push','pull_request')}
    require([len(split['push']),len(split['pull_request'])]==[14,14], 'event split', str({k:len(v) for k,v in split.items()}))
    terminal=[r for r in runs if r['status']=='completed']
    successes=[r for r in terminal if r['conclusion']=='success']
    failures=[r for r in terminal if r['conclusion']=='failure']
    active=[r for r in runs if r['status']=='in_progress']
    require((len(terminal),len(successes),len(failures),len(active))==(27,26,1,1), 'terminal/active arithmetic', '27 terminal = 26 success + 1 failure; one active')
    require(normalized['capturedAt']=='2026-10-31 07:26:45 UTC' and normalized['total']==28 and normalized['completed']==27, 'snapshot timestamp and normalized counts')
    active_pr=[r for r in active if r['event']=='pull_request' and r['id']==41178477290 and r['conclusion'] is None]
    require(len(active_pr)==1 and active_pr[0]['name']=='Gobi compiled Go lifecycle', 'active primary PR run left unresolved')
    status=read(EVID/'pr-job-statuses-20261031T072645Z.json')
    active_status=[r for r in status['runs'] if r['run_id']==41178477290]
    require(len(active_status)==1 and active_status[0]['status']=='in_progress', 'active PR job status record')
    jobs=active_status[0]['jobs']
    require(len(jobs)==1 and jobs[0]['id']==124470831563 and jobs[0]['status']=='in_progress', 'active job identity/status')
    active_step=next(s for s in jobs[0]['steps'] if s['number']==7)
    require(active_step['name']=='Run inherited gates and compiled lifecycle matrix' and active_step['status']=='in_progress', 'active step identity')
    log_index=read(EVID/'logs/job-log-index.json')
    require(log_index['capturedAt']=='2026-10-31 07:26:45 UTC' and log_index['headSha']=='49cc2b96c8817a47319d5b7bd484184a22fa984b', 'job-log index snapshot binding')
    recs=log_index['records']
    prs=[r for r in recs if r['event']=='pull_request']; pushes=[r for r in recs if r['event']=='push']
    require(len(recs)==14 and len(prs)==13 and len(pushes)==1, 'terminal decoded log inventory')
    require(all(r['run_status']=='completed' and r['run_conclusion']=='success' and r['job_status']=='completed' and r['job_conclusion']=='success' for r in prs), '13 PR logs are terminal successful logs')
    status_by_id={r['run_id']:r for r in status['runs']}
    require(set(r['run_id'] for r in prs)|{41178477290}==set(r['run_id'] for r in status['runs']), 'PR status inventory equals 13 terminal logs plus active PR')
    for entry in prs:
        sr=status_by_id[entry['run_id']]
        sj=next((j for j in sr['jobs'] if j['id']==entry['job_id']),None)
        require(sj is not None and sr['status']==entry['run_status'] and sr['conclusion']==entry['run_conclusion'] and sj['status']==entry['job_status'] and sj['conclusion']==entry['job_conclusion'], 'indexed PR log agrees with raw provider job-status snapshot', str(entry['run_id']))
    require(pushes[0]['run_id']==41178420647, 'primary push log identity')
    require(log_index['pending']==[{'run_id':41178477290,'status':'in_progress','conclusion':None,'note':'No terminal decoded job log is available yet.'}], 'active PR absent from terminal log inventory')
    require(len({(r['run_id'],r['job_id']) for r in recs})==14, 'unique indexed log identities')
    m0_logs=[]
    log_audit=[]
    for r in recs:
        p=EVID/r['path']; data=p.read_bytes()
        data.decode('utf-8',errors='strict')
        n,h=len(data),hashlib.sha256(data).hexdigest()
        require(n==r['bytes'] and h==r['sha256'], 'indexed raw log bytes/hash', r['path'])
        inputs[p.relative_to(ROOT).as_posix()]={'bytes':n,'sha256':h}
        if all(t in data.decode('utf-8') for t in ('same over 5000 inputs','receipt matches','SHA256SUMS ok')):
            m0_logs.append(r['path'])
        log_audit.append({'event':r['event'],'run_id':r['run_id'],'job_id':r['job_id'],'path':r['path'],'bytes':n,'sha256':h,'utf8':'strict decode passed','conclusion':r.get('run_conclusion')})
    require(bool(m0_logs), 'hosted M0 raw log result evidence', str(m0_logs))
    require(len(m0_logs)>=10, 'M0 evidence appears across hosted terminal logs', str(len(m0_logs)))

    run=read(EVID/'run-push-41178420647-final.json')
    jobs_push=read(EVID/'jobs-push-41178420647-final.json')
    artifacts=read(EVID/'artifacts-push-41178420647.json')
    dl=read(CI/'provider-download.json')
    retention=read(CI/'provider/failed-41178420647/retention.json')
    cust=read(CI/'provider/failed-41178420647/selected-custody.json')
    require(run['id']==41178420647 and run['event']=='push' and run['status']=='completed' and run['conclusion']=='failure' and run['head_sha']=='49cc2b96c8817a47319d5b7bd484184a22fa984b', 'primary push raw provider run')
    require(run['pull_requests'][0]['number']==14 and run['pull_requests'][0]['head']['sha']==run['head_sha'] and run['pull_requests'][0]['base']['sha']=='6b49cc0bd4c9512a041f723c86b632ec506afd9d', 'provider PR/head/base binding')
    job=jobs_push['jobs'][0]
    require(job['id']==124470665705 and job['run_id']==41178420647 and job['conclusion']=='failure', 'primary provider job status')
    art=next(a for a in artifacts['artifacts'] if a['id']==13034915662)
    require(art['size_in_bytes']==47035803 and art['digest']=='sha256:6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4', 'raw provider artifact digest/size')
    require(art['workflow_run']['id']==41178420647 and art['workflow_run']['head_sha']==run['head_sha'], 'raw artifact run/head binding')
    require(dl['artifactId']==13034915662 and dl['run']==41178420647 and dl['bytes']==47035803 and dl['sha256']==art['digest'].removeprefix('sha256:') and dl['providerRunConclusion']=='failure', 'download metadata binds to provider API')
    require(retention['artifactId']==13034915662 and retention['runId']==41178420647 and retention['bytes']==47035803 and retention['sha256']==dl['sha256'] and len(retention['chunks'])==12, 'retained chunk manifest binds artifact')
    h=hashlib.sha256(); total=0; chunk_results=[]
    for c in retention['chunks']:
        p=ROOT/c['path']; n,d=record(p)
        require(n==c['bytes'] and d==c['sha256'], 'retained raw artifact chunk hash', c['path'])
        with p.open('rb') as f:
            for part in iter(lambda:f.read(1<<20),b''): h.update(part)
        total+=n; chunk_results.append({'path':c['path'],'bytes':n,'sha256':d})
    require(total==47035803 and h.hexdigest()==dl['sha256'], 'reassembled raw provider artifact hash')
    require(dl['members']==1272 and dl['uncompressedBytes']==412381547 and dl['CRC']=='all passed', 'provider extraction size/member/CRC metadata')
    for c in cust:
        p=CI/'provider/failed-41178420647'/c['retained']; n,d=record(p)
        require(n==c['bytes'] and d==c['sha256'], 'selected retained custody hash', c['retained'])
    require((EX/'compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.check.json').exists() is False, 'final matrix check withheld; no fabricated success artifact')

    lineage=read(EVID/'source-merge-lineage.json')
    source_api=read(EVID/'commit-source-49cc-current.json'); merge_api=read(EVID/'commit-merge-d6fe-current.json')
    summary=read(EVID/'hosted-primary-summary.json')
    src='49cc2b96c8817a47319d5b7bd484184a22fa984b'; tree='d49ca35b7eda23837c392bbe0d2363551e4c7bec'; base='6b49cc0bd4c9512a041f723c86b632ec506afd9d'; merge='d6fe98cd11cb8eb5ba673a449099b170e222b3fa'
    require(lineage['source']=={'sha':src,'tree':tree,'parents':[base],'branch':'codex/gobi-compiled-lifecycle-20261031'}, 'lineage source identity')
    require(lineage['pullRequest']['number']==14 and lineage['pullRequest']['headSha']==src and lineage['pullRequest']['baseSha']==base and lineage['pullRequest']['mergeSha']==merge, 'lineage PR identity')
    require(lineage['merge']=={'sha':merge,'tree':tree,'parents':[base,src]}, 'lineage synthetic merge identity')
    require(source_api['sha']==src and source_api['commit']['tree']['sha']==tree and source_api['parents'][0]['sha']==base, 'raw source commit metadata')
    require(merge_api['sha']==merge and merge_api['commit']['tree']['sha']==tree and [p['sha'] for p in merge_api['parents']]==[base,src], 'raw merge commit metadata')
    require(summary['source']=={'commit':src,'tree':tree,'parent':base,'pullRequest':14,'mergeCommit':merge,'mergeTree':tree,'mergeParents':[base,src]}, 'primary summary lineage')
    git_src=subprocess.check_output(['git','show','-s','--format=%T%n%P',src],cwd=ROOT,text=True).splitlines()
    git_merge=subprocess.check_output(['git','show','-s','--format=%T%n%P',merge],cwd=ROOT,text=True).splitlines()
    require(git_src==[tree,base], 'git object source tree/parent', str(git_src))
    require(git_merge==[tree,f'{base} {src}'], 'git object merge tree/parents', str(git_merge))
    require(subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==src, 'review checkout is source checkpoint')

    attempt=read(ATT/'execution.json')
    failed=read(ATT/'matrix/lifecycle.failed.json'); lifecycle_run=read(ATT/'matrix/lifecycle.run.json')
    require(attempt['mode']=='full' and attempt['status']=='failed' and attempt['sourcePinsMatch'] is True and attempt['sourceBefore']==attempt['sourceAfter'], 'primary attempt status and source pins')
    error=' '.join(e['message'] for e in failed['errors'])
    require('spawnSync /home/runner/work/gondola/gondola/go ENOENT' in error, 'native PATH failure recorded', error)
    args=lifecycle_run['command']
    require(args[args.index('--native-go')+1]=='go' and lifecycle_run['status']=='rejected', 'raw conformance invocation used bare native-go and was rejected')
    require(any(s['name']=='native-direct-browser-matrix' and s['status']=='failed' for s in attempt['stages']) and any(s['name']=='http-demo' and s['status']=='passed' for s in attempt['stages']), 'matrix failed while HTTP demo passed')
    require('full conformance check withheld because a required evidence stage failed' in error, 'no final matrix acceptance claim')
    require(summary['primaryPush']['runId']==41178420647 and summary['primaryPush']['conclusion']=='failure' and summary['primaryPush']['failure']['stage']=='native-direct-browser-matrix', 'primary summary failure stage')

    versions=attempt['versions']; expected_versions={'node':'v22.23.4','npm':'10.9.9','rootGo':'go version go1.24.13 linux/amd64','compiledGo':'go version go1.27.3 linux/amd64'}
    require(all(versions.get(k)==v for k,v in expected_versions.items()), 'primary run core toolchain', json.dumps(versions))
    require(versions['dependencies']=={'react':'19.3.1','reactDOM':'19.3.1','playwright':'1.64.1','esbuild':'0.28.2','frontendEsbuild':'0.28.2'}, 'primary run frontend dependencies')
    for rel,expected in [('version-npm.stdout.log','10.9.9\n'),('version-root-go.stdout.log','go version go1.24.13 linux/amd64\n'),('version-compiled-go.stdout.log','go version go1.27.3 linux/amd64\n')]:
        require((ATT/'logs'/rel).read_text(encoding='utf-8')==expected, 'toolchain command output', rel)
    smoke=read(ATT/'demo/demo-smoke.json')
    require(smoke['browserVersion']=='156.0.8078.4', 'managed browser version')
    require(summary['hostedToolchains']['node']=='v22.23.4' and summary['hostedToolchains']['rootGo']=='go1.24.13 linux/amd64' and summary['hostedToolchains']['compiledGo']=='go1.27.3 linux/amd64' and summary['hostedToolchains']['react']=='19.3.1' and summary['hostedToolchains']['reactDOM']=='19.3.1' and summary['hostedToolchains']['playwright']=='1.64.1' and summary['hostedToolchains']['esbuild']=='0.28.2', 'hosted summary toolchain match')

    suite99=(EX/'compiled-frontend/artifacts/logs/node-tests.stdout.log').read_text(encoding='utf-8')
    suite67=(ATT/'logs/lifecycle-node-tests-before-build.stdout.log').read_text(encoding='utf-8')
    suite10=(ATT/'logs/lifecycle-compiled-runtime-tests.stdout.log').read_text(encoding='utf-8')
    methods10=(ATT/'inherited/attempt-20261031T065420655Z/logs/method-owned-node-tests.stdout.log').read_text(encoding='utf-8')
    require('# tests 99\n# suites 0\n# pass 99\n# fail 0' in suite99, 'compiled frontend Node suite 99')
    require('# tests 67\n# suites 0\n# pass 67\n# fail 0' in suite67, 'lifecycle pre-build Node suite 67')
    require('# tests 10\n# suites 0\n# pass 10\n# fail 0' in suite10, 'lifecycle runtime Node suite 10')
    require('# tests 10\n# suites 0\n# pass 10\n# fail 0' in methods10, 'compiled methods owned Node suite 10')
    require(summary['currentHostedTestSuites']==[
       {'suite':'compiled-frontend Node suite','passed':99,'failed':0},
       {'suite':'lifecycle pre-build shared-host/browser/oracle/conformance Node suite','passed':67,'failed':0},
       {'suite':'compiled lifecycle runtime integration Node suite','passed':10,'failed':0},
       {'suite':'compiled methods owned Node suite','passed':10,'failed':0}], 'hosted suite summary counts')

    expected=read(ROOT/'EXPECTED.json')
    sums=(ROOT/'SHA256SUMS').read_text(encoding='utf-8').splitlines()
    rule_bytes=(ROOT/'gobi/rules_test.go').read_bytes()
    rule_text=rule_bytes.decode('utf-8')
    rule_block=rule_text[rule_text.index('func rules() []rule {'):rule_text.index('\nfunc TestRulesGo')]
    source_rows=len(re.findall(r'^\s*\{"',rule_block,re.M))
    sum_map={line.split('  ',1)[1]:line.split('  ',1)[0] for line in sums}
    require(expected['seed']==20261030 and expected['cases']==5000 and expected['verdict']=='same over 5000 inputs', 'M0 source expectation seed/cases')
    require(expected['casesSha256']=='36be8659504a42e3d50c224323d9117a1cb9fa858e4d02bc2a03b0077ab42260' and expected['verdictSha256']=='180297809767b3d65c35b64abeb23ad53775d961128d9a235cb273bbc955ec23', 'M0 signed expectation digests')
    require(hashlib.sha256((ROOT/'EXPECTED.json').read_bytes()).hexdigest()==sum_map['EXPECTED.json'], 'M0 Expected file covered by SHA256SUMS')
    require(hashlib.sha256(rule_bytes).hexdigest()==sum_map['gobi/rules_test.go']==summary['milestoneZero']['rulesTestSha256'], 'source table file hash and manifest')
    require(source_rows==59==summary['milestoneZero']['compatibilityRuleRows'], 'M0 React compatibility source table row count', str(source_rows))
    require(summary['milestoneZero']['seed']==expected['seed'] and summary['milestoneZero']['resultFromHostedRawLog']=='same over 5000 inputs; receipt matches; SHA256SUMS ok', 'M0 hosted summary claims match source expectation')
    source_raw=subprocess.check_output(['git','show',f'{src}:gobi/rules_test.go'],cwd=ROOT)
    require(hashlib.sha256(source_raw).hexdigest()==summary['milestoneZero']['rulesTestSha256'], '59-row source table belongs to pinned head')
    require(hashlib.sha256(subprocess.check_output(['git','show',f'{src}:EXPECTED.json'],cwd=ROOT)).hexdigest()==hashlib.sha256((ROOT/'EXPECTED.json').read_bytes()).hexdigest(), 'M0 expectation belongs to pinned head')
    m0_evidence={'expected_seed':expected['seed'],'expected_cases':expected['cases'],'raw_hosted_logs_with_all_three_M0_lines':len(m0_logs),'sample_log':m0_logs[0],'source_table_rows':source_rows,'source_table_sha256':hashlib.sha256(rule_bytes).hexdigest()}

    demo_audit=read(CI/'lanes/demo/audit.json')
    require(demo_audit['outcome']=='confirmed_reuse' and demo_audit['managed_run']['id']==41178420647 and demo_audit['http_demo']['checks']==12, 'independent E-CI-DEMO evidence agreement')
    require(demo_audit['global_lifecycle_status']['run_status']=='failed', 'demo packet preserves overall failure')
    require(demo_audit['artifact']['sha256']==dl['sha256'] and demo_audit['artifact']['members']==dl['members'] and demo_audit['artifact']['uncompressed_bytes']==dl['uncompressedBytes'], 'independent artifact audit agrees with provider metadata')
    require('not a full hosted lifecycle acceptance' in report.read_text(encoding='utf-8') and '27 were terminal' in report.read_text(encoding='utf-8') and 'all-28-run completion' in report.read_text(encoding='utf-8'), 'N6 report claim boundary present')

    for rel in ['lanes/evidence/runs-headsha-20261031T072645Z.json','lanes/evidence/runs-summary-20261031T072645Z.json','lanes/evidence/pr-job-statuses-20261031T072645Z.json','lanes/evidence/logs/job-log-index.json','lanes/evidence/run-push-41178420647-final.json','lanes/evidence/jobs-push-41178420647-final.json','lanes/evidence/artifacts-push-41178420647.json','lanes/evidence/source-merge-lineage.json','lanes/evidence/commit-source-49cc-current.json','lanes/evidence/commit-merge-d6fe-current.json','lanes/evidence/hosted-primary-summary.json','provider-download.json','provider/failed-41178420647/retention.json','provider/failed-41178420647/selected-custody.json','lanes/demo/audit.json']:
        record(CI/rel)
    for rel in ['EXPECTED.json','SHA256SUMS','gobi/rules_test.go']:
        record(ROOT/rel)
    input_digest=hashlib.sha256(json.dumps(inputs,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    audit={'schema':'gobi.compiled-lifecycle-ci-evidence-review/v1','job_id':'XR-CI-EVIDENCE','worker':'N3','decision':'accepted','outcome':'faithful_snapshot','summary':'The N6 packet faithfully records the fixed 2026-10-31T07:26:45Z snapshot: 27/28 workflows terminal (26 success, one primary push failure), with the primary lifecycle PR still active and no terminal log. Provider/artifact, lineage, 14 archived UTF-8 logs and hashes, suite counts, toolchain, M0 baseline, and failed native PATH gate are corroborated. Acceptance is limited to this evidence snapshot; there is no overall CI pass.',
      'capture':{'at':'2026-10-31T07:26:45Z','runs':28,'terminal':27,'success':26,'failure':1,'active':{'run_id':41178477290,'job_id':124470831563,'status':'in_progress','terminal_log_available':False}},
      'source':{'head':'49cc2b96c8817a47319d5b7bd484184a22fa984b','tree':'d49ca35b7eda23837c392bbe0d2363551e4c7bec','parent':'6b49cc0bd4c9512a041f723c86b632ec506afd9d','merge':'d6fe98cd11cb8eb5ba673a449099b170e222b3fa','merge_tree':'d49ca35b7eda23837c392bbe0d2363551e4c7bec','merge_parents':['6b49cc0bd4c9512a041f723c86b632ec506afd9d','49cc2b96c8817a47319d5b7bd484184a22fa984b']},
      'primary_push':{'run':41178420647,'job':124470665705,'conclusion':'failure','artifact':13034915662,'artifact_sha256':dl['sha256'],'artifact_bytes':total,'artifact_members':dl['members'],'artifact_uncompressed_bytes':dl['uncompressedBytes'],'native_error':error},
      'logs':{'terminal_pr_logs':len(prs),'primary_push_logs':len(pushes),'all_utf8':True,'all_indexed_bytes_and_hashes_match':True,'records':log_audit,'active_run_pending_record':log_index['pending']},
      'toolchain':versions,'suite_counts':{'compiled_frontend':99,'lifecycle_prebuild':67,'lifecycle_runtime':10,'compiled_methods_owned':10,'counts_are_overlapping_and_not_summed':True},
      'm0':m0_evidence,
      'checks':checks,
      'input_hashes':inputs,'input_hash_manifest_sha256':input_digest,
      'claim_limit':'Accepted the evidence packet as a faithful pending/failed checkpoint only. It does not show a full hosted lifecycle CI pass, final matrix conformance, or a terminal result for the active lifecycle PR.'}
    out=CI/'lanes/review-evidence/audit.json'; out.write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'decision':audit['decision'],'outcome':audit['outcome'],'checks':len(checks),'log_records':len(log_audit),'active_run':41178477290,'provider_sha256':dl['sha256'],'report_sha256':report_sha,'audit_path':str(out)},sort_keys=True))
if __name__=='__main__': main()
