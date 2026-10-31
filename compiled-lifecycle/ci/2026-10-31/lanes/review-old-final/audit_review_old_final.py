#!/usr/bin/env python3
"""Independent verification of the immutable terminal 49cc CI supplement."""
from __future__ import annotations
import hashlib, io, json, re, zipfile
from pathlib import Path, PurePosixPath

ROOT=Path(__file__).resolve().parents[5]
CI=ROOT/'compiled-lifecycle/ci/2026-10-31'
OLD=CI/'lanes/old-final'
EX=CI/'extracted'
checks=[]; inputs={}
def require(ok: bool, name: str, detail: str=''):
    if not ok: raise AssertionError(f'{name}: {detail}')
    checks.append({'check':name,'result':'pass','detail':detail})
def read(p:Path): return json.loads(p.read_text(encoding='utf-8'))
def hash_bytes(b:bytes): return hashlib.sha256(b).hexdigest()
def record(p:Path):
    b=p.read_bytes(); h=hash_bytes(b); inputs[p.relative_to(ROOT).as_posix()]={'bytes':len(b),'sha256':h}; return len(b),h,b
def safe_name(name:str):
    if not name or name.startswith('/') or '\\' in name: return False
    path=PurePosixPath(name.rstrip('/'))
    return all(x not in ('','.','..') for x in path.parts) and str(path)==name.rstrip('/')

def main():
    final_report=CI/'coordination/reports/E-49CC-FINAL.md'
    final_receipt=CI/'coordination/receipts/E-49CC-FINAL.json'
    report_n,report_sha,report_bytes=record(final_report)
    receipt_n,receipt_sha,receipt_bytes=record(final_receipt)
    receipt=json.loads(receipt_bytes)
    require(report_sha=='2f6f71aeb66404e3c2335d73f4cda73a5a45be7236c938d065d7244006292cf2'==receipt['report_sha256'], 'terminal report hash')
    require(receipt_sha=='d1f9ce4f0261de693bd56c1e6ac7e67baa33a5455e4a230233cb525c23dd4564', 'terminal receipt hash')
    require(receipt['job_id']=='E-49CC-FINAL' and receipt['worker']=='N6' and receipt['outcome']=='mixed_change' and receipt['status']=='completed', 'terminal supplement identity/outcome')
    require(hash_bytes(receipt['summary'].encode())==receipt['summary_sha256'], 'terminal receipt summary hash')

    pending_report=CI/'coordination/reports/E-CI-EVIDENCE.md'
    pending_receipt_path=CI/'coordination/receipts/E-CI-EVIDENCE.json'
    pr_n,pr_sha,_=record(pending_report); pre_n,pre_sha,_=record(pending_receipt_path)
    require(pr_sha=='dfbe352c0b381a818a376c972e3cde0bb7f3c76f4d7bf35bed1c631375cb93a9' and pre_sha=='f0f0f43e0d1121791422498cd26d732a671c8004bbbadc37f65f5d06f786110c', '07:26 E-CI-EVIDENCE bytes unchanged')
    require(receipt['prior_pending_packet']['report_sha256']==pr_sha and receipt['prior_pending_packet']['receipt_sha256']==pre_sha and receipt['prior_pending_packet']['unchanged'] is True, 'terminal receipt references unchanged prior packet')
    prior_audit=read(CI/'lanes/review-evidence/audit.json')
    prior_raw=CI/'lanes/evidence/runs-headsha-20261031T072645Z.json'
    prior_raw_n,prior_raw_sha,_=record(prior_raw)
    prior_expected=prior_audit['input_hashes']['compiled-lifecycle/ci/2026-10-31/lanes/evidence/runs-headsha-20261031T072645Z.json']
    require(prior_raw_n==prior_expected['bytes'] and prior_raw_sha==prior_expected['sha256'], '07:26 raw workflow snapshot remains byte-identical')

    final_raw_path=OLD/'runs-headsha-49cc-20261031T073540Z.json'
    final_summary_path=OLD/'runs-summary-49cc-20261031T073540Z.json'
    final_raw=read(final_raw_path); summary=read(final_summary_path)
    raw_n,raw_sha,_=record(final_raw_path); sum_n,sum_sha,_=record(final_summary_path)
    rows=final_raw['workflow_runs']
    require(final_raw['total_count']==28 and len(rows)==28, 'terminal raw API inventory count')
    require(all(r['head_sha']=='49cc2b96c8817a47319d5b7bd484184a22fa984b' for r in rows), 'terminal raw inventory pinned to historical 49cc head')
    events={e:[r for r in rows if r['event']==e] for e in ('push','pull_request')}
    require((len(events['push']),len(events['pull_request']))==(14,14), 'terminal event distribution')
    done=[r for r in rows if r['status']=='completed']
    succ=[r for r in done if r['conclusion']=='success']; fail=[r for r in done if r['conclusion']=='failure']
    require((len(done),len(succ),len(fail))==(28,26,2), 'terminal arithmetic', '28 terminal = 26 success + 2 failure')
    fail_ids={(r['event'],r['id']) for r in fail}
    require(fail_ids=={('push',41178420647),('pull_request',41178477290)}, 'only the two primary lifecycle workflows failed', str(fail_ids))
    require(summary['capturedAt']=='2026-10-31 07:35:40 UTC' and summary['headSha']=='49cc2b96c8817a47319d5b7bd484184a22fa984b' and summary['total']==28 and summary['completed']==28 and summary['conclusionCounts']=={'success':26,'failure':2} and summary['byEvent']=={'pull_request':14,'push':14}, 'normalized final summary')

    # The later snapshot only closes the one run that was in progress at 07:26:45Z.
    before=read(prior_raw)['workflow_runs']; before_map={r['id']:r for r in before}; final_map={r['id']:r for r in rows}
    require(set(before_map)==set(final_map), 'same 28 workflow identities across snapshots')
    changed=[]
    for run_id,old in before_map.items():
        new=final_map[run_id]
        keys=('event','head_sha','status','conclusion','updated_at')
        if any(old.get(k)!=new.get(k) for k in keys): changed.append(run_id)
    require(changed==[41178477290], 'only previously active PR run changed between captures', str(changed))
    old_pr=before_map[41178477290]; new_pr=final_map[41178477290]
    require(old_pr['status']=='in_progress' and old_pr['conclusion'] is None and new_pr['status']=='completed' and new_pr['conclusion']=='failure' and new_pr['updated_at']=='2026-10-31T07:29:18Z', 'active PR transition is captured as failure')
    require(receipt['capture']['captured_at']=='2026-10-31T07:35:40Z' and receipt['capture']['workflow_total']==28 and receipt['capture']['terminal_runs']==28 and receipt['capture']['success']==26 and receipt['capture']['failure']==2, 'terminal receipt capture arithmetic')
    require(receipt['capture']['head_sha']=='49cc2b96c8817a47319d5b7bd484184a22fa984b' and receipt['capture']['tree_sha']=='d49ca35b7eda23837c392bbe0d2363551e4c7bec' and receipt['capture']['source_parent']=='6b49cc0bd4c9512a041f723c86b632ec506afd9d', 'historical source identity preserved')

    run_path=OLD/'run-41178477290-20261031T073540Z.json'; jobs_path=OLD/'jobs-41178477290-20261031T073540Z.json'; artifacts_path=OLD/'artifacts-41178477290-20261031T073540Z.json'
    run=read(run_path); jobs=read(jobs_path); artifacts=read(artifacts_path)
    for p in [run_path,jobs_path,artifacts_path]: record(p)
    require(run['id']==41178477290 and run['event']=='pull_request' and run['status']=='completed' and run['conclusion']=='failure' and run['head_sha']=='49cc2b96c8817a47319d5b7bd484184a22fa984b', 'raw terminal PR run API record')
    require(run['created_at']=='2026-10-31T06:54:40Z' and run['updated_at']=='2026-10-31T07:29:18Z', 'terminal PR timestamps')
    pr=run['pull_requests'][0]
    require(pr['number']==14 and pr['head']['sha']==run['head_sha'] and pr['base']['sha']=='6b49cc0bd4c9512a041f723c86b632ec506afd9d', 'PR 14 head/base binding')
    job=jobs['jobs'][0]
    require(len(jobs['jobs'])==1 and job['id']==124470831563 and job['run_id']==41178477290 and job['status']=='completed' and job['conclusion']=='failure', 'raw terminal PR job API record')
    step7=next(s for s in job['steps'] if s['number']==7)
    require(step7['name']=='Run inherited gates and compiled lifecycle matrix' and step7['conclusion']=='failure', 'matrix step failed')
    step8=next(s for s in job['steps'] if s['number']==8)
    require(step8['name']=='Preserve build, matrix, demo, and inherited evidence' and step8['conclusion']=='success', 'artifact-preservation step completed')
    art=artifacts['artifacts'][0]
    require(artifacts['total_count']==1 and art['id']==13034662119 and art['name']=='gobi-compiled-lifecycle-artifacts' and art['size_in_bytes']==47017957 and art['digest']=='sha256:294ab76c6e0555e4b42f31b747673070ff4982739735eb7f4ad85fbc6a728128' and art['expired'] is False, 'raw PR artifact API metadata')
    require(art['workflow_run']['id']==41178477290 and art['workflow_run']['head_sha']=='49cc2b96c8817a47319d5b7bd484184a22fa984b', 'PR artifact run/head binding')
    require(receipt['pr_artifact']['id']==art['id'] and receipt['pr_artifact']['bytes']==art['size_in_bytes'] and receipt['pr_artifact']['sha256']==art['digest'].removeprefix('sha256:'), 'receipt artifact API cross-check')

    log_path=OLD/'pr-41178477290-job-124470831563-20261031T073540Z-exact.log'
    log_n,log_sha,log_bytes=record(log_path)
    log_text=log_bytes.decode('utf-8',errors='strict')
    require(log_n==49771 and log_sha=='13f5ed4e5ed71b81af498553592571d98d03e64a933856e2598db6086ab979ff', 'exact PR job log byte/hash')
    require(log_bytes.startswith(bytes.fromhex('efbbbf')), 'exact PR log BOM preserved in byte hash')
    require('--native-go go' in log_text, 'exact PR log contains failed native invocation')
    require('spawnSync /home/runner/work/gondola/gondola/go ENOENT' not in log_text, 'internal error absent from log; artifact provides the failure detail')
    require(receipt['pr_log']['bytes']==log_n and receipt['pr_log']['sha256']==log_sha and receipt['pr_log']['internal_error_in_log'] is False, 'receipt log metadata matches raw bytes')

    zip_path=OLD/'artifact-13034662119.zip'; zip_n,zip_sha,zip_bytes=record(zip_path)
    require(zip_n==47017957 and zip_sha=='294ab76c6e0555e4b42f31b747673070ff4982739735eb7f4ad85fbc6a728128', 'downloaded exact PR ZIP hash/size')
    with zipfile.ZipFile(io.BytesIO(zip_bytes),'r') as zf:
        infos=zf.infolist(); names=[x.filename for x in infos]
        require(len(infos)==1272 and len(set(names))==1272, 'PR ZIP member count/unique names')
        require(all(safe_name(n) for n in names), 'all PR ZIP member paths safe')
        crc=zf.testzip()
        require(crc is None, 'all PR ZIP member CRCs')
        selected=read(OLD/'artifact-review.json')['selectedArtifactMembers']
        require(len(selected)==3, 'selected archive custody set size')
        selected_audit=[]
        for entry in selected:
            member=entry['member']; raw=zf.read(member); saved=ROOT/entry['saved_path']
            n,h,_=record(saved)
            require(len(raw)==entry['bytes']==n and hash_bytes(raw)==entry['sha256']==h, 'selected saved artifact member exact match', member)
            selected_audit.append({'member':member,'bytes':n,'sha256':h})
        failed_member=next(x for x in selected if x['member'].endswith('/matrix/lifecycle.failed.json'))
        run_member=next(x for x in selected if x['member'].endswith('/matrix/lifecycle.run.json'))
        failed_doc=json.loads(zf.read(failed_member['member']))
        matrix= json.loads(zf.read(run_member['member']))
    require(receipt['pr_artifact']['members']==1272 and receipt['pr_artifact']['expired'] is False, 'artifact inventory receipt')
    require('contains 1,272 files' in report_bytes.decode('utf-8'), 'report records artifact member count')
    failure_messages=[e['message'] for e in failed_doc['errors']]
    expected_error='native Go lifecycle replay failed (exit spawn-error): spawnSync /home/runner/work/gondola/gondola/go ENOENT'
    require(expected_error in failure_messages, 'PR artifact records exact native path failure')
    require(any('full conformance check withheld because a required evidence stage failed' in e for e in failure_messages), 'PR artifact withholds final checker')
    require(matrix['status']=='rejected' and matrix['inputs']['nativeGo']=='/home/runner/work/gondola/gondola/go', 'matrix input resolved to checkout-relative Go path')
    require(matrix['nativeCommand'][0]=='/home/runner/work/gondola/gondola/go' and matrix['nativeCommand'][1:]==['run','./cmd/compiled-lifecycle-native','--script','/home/runner/work/gondola/gondola/fixtures/compiled/lifecycle/scenario.json'], 'native subprocess command uses nonexistent checkout/go')
    require(matrix['versions']['go']=={'command':'/home/runner/work/gondola/gondola/go','args':['version'],'exitCode':None,'output':''}, 'Go version probe failed at same path')
    require(any(s['name']=='native-go-script-cli-replay' and s['status']=='failed' for s in matrix['stages']) and all(s['status']=='completed' for s in matrix['stages'] if s['name'] in ('direct-emitted-module-replay','react-dom-and-alternating-swap-browser-profiles','source-and-build-output-pins','final-source-and-build-output-stability-check')), 'other matrix substeps complete while native stage fails')
    require(receipt['native_failure']['message']==expected_error and receipt['native_failure']['final_check']=='withheld because a required evidence stage failed', 'receipt failure detail')

    push_attempt=EX/'compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.failed.json'
    push_failed=read(push_attempt)
    push_error=' '.join(x['message'] for x in push_failed['errors'])
    require(expected_error in push_error, 'PR artifact failure matches primary push artifact')
    require(receipt['native_failure']['same_failure_as_primary_push'] is True, 'terminal receipt cross-reference to primary push')

    index=read(OLD/'supplement-index.json')
    index_n,index_sha,_=record(OLD/'supplement-index.json')
    require(index_sha=='75108efd9ba62be4e013633b0272b033b93060efd3ba5cf982ac9801b823c295' and receipt['supplement_index_sha256']==index_sha, 'supplement inventory hash')
    require(index['capturedAt']=='2026-10-31T07:35:40Z' and index['sourceHead']=='49cc2b96c8817a47319d5b7bd484184a22fa984b', 'supplement inventory capture/source')
    authoritative={entry['path']:entry for entry in index['authoritativeFiles']}
    for rel in ['lanes/old-final/runs-headsha-49cc-20261031T073540Z.json','lanes/old-final/runs-summary-49cc-20261031T073540Z.json','lanes/old-final/run-41178477290-20261031T073540Z.json','lanes/old-final/jobs-41178477290-20261031T073540Z.json','lanes/old-final/artifacts-41178477290-20261031T073540Z.json','lanes/old-final/pr-41178477290-job-124470831563-20261031T073540Z-exact.log','lanes/old-final/artifact-13034662119.zip','lanes/old-final/artifact-review.json']:
        entry=authoritative['compiled-lifecycle/ci/2026-10-31/'+rel]
        path=ROOT/entry['path']; n,h,_=record(path)
        require(n==entry['bytes'] and h==entry['sha256'], 'supplement index authoritative file hash', rel)
    require(index['supersededTransferLogs']['authoritative'] is False and 'exact complete log' in index['supersededTransferLogs']['note'], 'truncated transfer attempts remain superseded')

    # Confirm the old 07:26 pending evidence is a separate immutable epoch.
    prev_capture=receipt['prior_pending_packet']
    require(prev_capture['report']=='compiled-lifecycle/ci/2026-10-31/coordination/reports/E-CI-EVIDENCE.md' and prev_capture['receipt']=='compiled-lifecycle/ci/2026-10-31/coordination/receipts/E-CI-EVIDENCE.json', 'old pending packet preserved as separate receipt/report')
    require(prior_audit['capture']['at']=='2026-10-31T07:26:45Z' and prior_audit['capture']['runs']==28 and prior_audit['capture']['terminal']==27 and prior_audit['capture']['active']['run_id']==41178477290, 'prior audit remains pending at original time')
    require('27/28 workflows terminal' in prior_audit['summary'] and 'no terminal log' in prior_audit['summary'], 'prior packet still expresses pending state')
    require('not a full hosted lifecycle acceptance' in report_bytes.decode('utf-8') and 'later 28-of-28 terminal capture' in report_bytes.decode('utf-8') and 'new head' in report_bytes.decode('utf-8'), 'terminal report preserves claim boundary and separate future head')

    for rel in ['lanes/old-final/README.md','lanes/old-final/artifact-review.json','lanes/old-final/supplement-index.json','lanes/old-final/runs-headsha-49cc-20261031T073540Z.json','lanes/old-final/runs-summary-49cc-20261031T073540Z.json','lanes/old-final/run-41178477290-20261031T073540Z.json','lanes/old-final/jobs-41178477290-20261031T073540Z.json','lanes/old-final/artifacts-41178477290-20261031T073540Z.json','lanes/old-final/pr-41178477290-job-124470831563-20261031T073540Z-exact.log','lanes/old-final/artifact-13034662119.zip']:
        record(CI/rel)
    input_digest=hash_bytes(json.dumps(inputs,sort_keys=True,separators=(',',':')).encode())
    audit={'schema':'gobi.compiled-lifecycle-old-final-review/v1','job_id':'XR-49CC-FINAL','worker':'N3','decision':'accepted','outcome':'faithful_terminal_supplement','summary':'The E-49CC-FINAL supplement faithfully closes the earlier pending 49cc capture. Its exact API snapshot has 28/28 runs terminal (26 success, two lifecycle failures). The exact PR log, artifact metadata, full ZIP hash/CRC, selected member bytes, native Go ENOENT and withheld checker all match. The 07:26 pending report/receipt and raw snapshot remain unchanged. No new-head success or overall lifecycle acceptance is claimed.',
      'terminal_capture':{'at':'2026-10-31T07:35:40Z','head':'49cc2b96c8817a47319d5b7bd484184a22fa984b','runs':28,'terminal':28,'success':26,'failure':2,'failed_runs':[41178420647,41178477290]},
      'previous_capture':{'at':'2026-10-31T07:26:45Z','runs':28,'terminal':27,'success':26,'failure':1,'active_pr':41178477290,'report_sha256':pr_sha,'receipt_sha256':pre_sha,'raw_snapshot_sha256':prior_raw_sha,'unchanged':True},
      'pr_job':{'run_id':41178477290,'job_id':124470831563,'status':'completed','conclusion':'failure','log_bytes':log_n,'log_sha256':log_sha,'log_utf8':'strict decode passed','bom_preserved':True},
      'pr_artifact':{'id':art['id'],'bytes':zip_n,'sha256':zip_sha,'members':1272,'path_safe':True,'crc':'all passed','selected_members':selected_audit},
      'native_path_failure':{'error':expected_error,'native_go_input':'/home/runner/work/gondola/gondola/go','version_probe_exit_code':None,'final_checker':'withheld','same_as_primary_push':True},
      'superseded_transfer_logs_authoritative':False,
      'checks':checks,'input_hashes':inputs,'input_hash_manifest_sha256':input_digest,
      'claim_limit':'Historical 49cc terminal supplement only. The previous 07:26 snapshot remains separately preserved. This review makes no claim about a repaired/new head or any current CI.'}
    out=CI/'lanes/review-old-final/audit.json'; out.write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'decision':audit['decision'],'outcome':audit['outcome'],'checks':len(checks),'runs':len(rows),'terminal':len(done),'artifact_bytes':zip_n,'artifact_sha256':zip_sha,'log_sha256':log_sha,'audit':str(out)},sort_keys=True))
if __name__=='__main__': main()
