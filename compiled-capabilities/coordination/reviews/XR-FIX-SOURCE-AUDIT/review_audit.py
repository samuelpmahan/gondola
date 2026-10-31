from pathlib import Path
import hashlib, importlib.util, json, subprocess, sys
root = Path.cwd()
prov = root/'compiled-capabilities/coordination/acceptance/provenance'
sched = root/'compiled-capabilities/coordination/acceptance/scheduler'
spec = importlib.util.spec_from_file_location('scheduler_audit_review', sched/'audit.py')
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
require = lambda condition, message: (_ for _ in ()).throw(AssertionError(message)) if not condition else None
# N1's finalized receipt pins are the accepted bytes for this review.
receipt_path = root/'compiled-capabilities/coordination/receipts/E-FIX-SOURCE-AUDIT.json'
receipt = json.loads(receipt_path.read_text())
report_path = root/'compiled-capabilities/coordination/reports/E-FIX-SOURCE-AUDIT.md'
final_receipt_sha = sha(receipt_path)
require(final_receipt_sha == '4aa73c491f97452eac101c051f132d9fbb3f790f54191c09a46dcbae883aed05', 'N1 final receipt hash changed')
require(receipt['outcome'] == 'mixed_change' and receipt['status'] == 'repair_verified_against_historical_failed_run', 'unexpected author receipt disposition')
source_mismatches = []
for p, expected in receipt['source_sha256'].items():
    actual = sha(root/p) if (root/p).is_file() else None
    if actual != expected: source_mismatches.append({'path':p,'expected':expected,'actual':actual})
for p, expected in receipt['log_sha256'].items():
    actual = sha(root/p) if (root/p).is_file() else None
    if actual != expected: source_mismatches.append({'path':p,'expected':expected,'actual':actual})
require(not source_mismatches, 'N1 author pin mismatch')
report_sha = sha(report_path)
require(report_sha == receipt['source_sha256']['compiled-capabilities/coordination/reports/E-FIX-SOURCE-AUDIT.md'], 'N1 author report hash mismatch')
# Actual historical E-BUILD bytes and signed map fixtures.
fixture = prov/'fixtures/e-build-031c-161-pins.json'
historical = root/'compiled-capabilities/builds/attempts/attempt-20261031T095356051Z/execution.json'
fixture_bytes = fixture.read_bytes(); historical_bytes = historical.read_bytes()
fixture_json = json.loads(fixture_bytes)
require(fixture_bytes == historical_bytes and sha(fixture) == 'ceb82b7e2bcbb5f42a4620c3a5076fbe2803aa637b20d622e01096b1de5c1df7', '161-pin fixture differs from historical receipt')
require(fixture_json['status'] == 'failed' and len(fixture_json['sourceBefore']) == len(fixture_json['sourceAfter']) == 161 and fixture_json['sourcePinsMatch'] is True, 'historical failed receipt/source pin counts mismatch')
require(len(fixture_json['failures']) == 1 and fixture_json['failures'][0]['name'] == 'stage:inherited-static-and-interaction-lifecycle', 'failed source gate differs')
map_path = prov/'fixtures/react-map.gen.mjs'
require(sha(map_path) == '9cb7fa3ff84042c36b9ac211dfe2b97a69169e4fb880283e8f000495a8216a54', 'signed generated M0 map differs')
# Root go.sum: the pinned producer declares it, but it is absent and producer pinning stats/skips ENOENT.
source_commit = '031c462bcd72c0ae0bee2dc05a0972b3902ca40c'
show = subprocess.run(['git','show',f'{source_commit}:compiled-capabilities/run.mjs'],cwd=root,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
pinned_run = show.stdout.decode()
require('  "go.sum",' in pinned_run and 'const sourceFiles = [' in pinned_run, 'pinned producer does not declare root go.sum candidate')
blob = subprocess.run(['git','cat-file','-e',f'{source_commit}:go.sum'],cwd=root,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
require(blob.returncode != 0 and not (root/'go.sum').exists(), 'root go.sum unexpectedly exists in source/worktree')
source_audit = (prov/'audit.mjs').read_text()
require('if (!entry && path === "go.sum") continue;' in source_audit, 'provenance auditor does not narrowly skip missing root go.sum')
# Current scheduler state and exact second pinned failed-run extension.
coord = root/'compiled-capabilities/coordination'
snapshot = mod.load_snapshot(coord)
live = mod.audit(snapshot)
require(live['status'] == 'INCOMPLETE' and live['errors'] == [], 'live scheduler structural audit not clean/incomplete')
require(len(live['incomplete']) == 1 and live['incomplete'][0].startswith('open_jobs:'), 'live audit has a non-open-job incomplete finding')
open_jobs = [job_id for job_id, job in snapshot.state['jobs'].items() if job.get('status') != 'done']
require(all(snapshot.state['jobs'][job_id].get('status') in {'pending','running'} for job_id in open_jobs), 'non-done packet is not pending or running')
reported_open_jobs = live['incomplete'][0].rsplit(': ',1)[1].split(', ')
require(reported_open_jobs == open_jobs, 'live audit open-job list differs from state statuses')
(root/'compiled-capabilities/coordination/reviews/XR-FIX-SOURCE-AUDIT/scheduler-current-audit.json').write_text(json.dumps(live,indent=2,sort_keys=True)+'\n')
second = next(e for e in snapshot.state['events'] if e.get('type') == 'extend-after-executed-failure' and e.get('source') == mod.RUNNER_ACCEPTANCE_FAILURE_EVIDENCE['source'])
evidence = mod.RUNNER_ACCEPTANCE_FAILURE_EVIDENCE
for field in ('source','source_remote','failed_command','failure','log','log_sha256','observed_cli_exit_code','new_jobs'):
    require(second.get(field) == evidence[field], f'second failure extension {field} differs from pinned constant')
log_path = root/second['log']
require(log_path.is_file() and sha(log_path) == evidence['log_sha256'] and b'compiled-capabilities: failed (full)' in log_path.read_bytes(), 'second failure log hash/marker mismatch')
for repair_id, review_id, repair_of in evidence['pairs']:
    repair = snapshot.state['jobs'][repair_id]; review = snapshot.state['jobs'][review_id]
    require(repair['kind'] == 'extract' and repair['repair_of'] == repair_of, f'{repair_id} repair link mismatch')
    require(review['kind'] == 'review' and review['depends_on'] == repair_id, f'{review_id} dependency mismatch')
first = next(e for e in snapshot.state['events'] if e.get('type') == 'extend-after-executed-failure' and e.get('source') == mod.STARTUP_FAILURE_EVIDENCE['source'])
for field in ('source','failed_command','failure','log','log_sha256','new_jobs'):
    require(first.get(field) == mod.STARTUP_FAILURE_EVIDENCE[field], f'original startup failure {field} changed')
# Verify mutation negatives in memory; actual state/evidence remain untouched.
mutations = []
bad = mod.clone_snapshot(snapshot)
bad_second = next(e for e in bad.state['events'] if e.get('type') == 'extend-after-executed-failure' and e.get('source') == evidence['source'])
bad_second['log_sha256'] = '0'*64
bad_result = mod.audit(bad)
require(any(x.startswith('executed_failure_log_hash:') for x in bad_result['errors']), 'follow-up log hash mutation was not rejected')
mutations.append('follow-up log SHA-256 mutation rejected')
bad = mod.clone_snapshot(snapshot)
bad_second = next(e for e in bad.state['events'] if e.get('type') == 'extend-after-executed-failure' and e.get('source') == evidence['source'])
bad_second['source_remote'] = '0'*40
bad_result = mod.audit(bad)
require(any(x.startswith('executed_failure_evidence:') and 'source_remote' in x for x in bad_result['errors']), 'follow-up remote-source mutation was not rejected')
mutations.append('follow-up remote source mutation rejected')
bad = mod.clone_snapshot(snapshot)
bad.state['jobs']['XR-FIX-SOURCE-AUDIT']['depends_on'] = 'E-FIX-RUNNER-ACCEPTANCE'
bad_result = mod.audit(bad)
require(any(x.startswith('executed_failure_review_link:') and 'XR-FIX-SOURCE-AUDIT' in x for x in bad_result['errors']), 'source-audit review dependency mutation was not rejected')
mutations.append('source-audit review dependency mutation rejected')
bad = mod.clone_snapshot(snapshot)
amend = next(e for e in bad.state['events'] if e.get('type') == 'extend-after-review-amend' and 'E-FIX-BUILD' in e.get('new_jobs', []))
completion = next(i for i,e in enumerate(bad.state['events']) if e.get('type') == 'complete' and e.get('job') == 'XR-BUILD')
bad.state['events'].remove(amend); bad.state['events'].insert(completion, amend)
bad_result = mod.audit(bad)
require(any(x.startswith('amend_extension_before_review:') for x in bad_result['errors']), 'pre-completion AMEND extension mutation was not rejected')
mutations.append('AMEND extension before completed review rejected')
# The author’s focused suite logs are also bound by its receipt; current review run logs are recorded separately.
result = {
 'schema':'gobi.source-audit-independent-review/v1',
 'authorReceipt':{'path':'compiled-capabilities/coordination/receipts/E-FIX-SOURCE-AUDIT.json','sha256':final_receipt_sha,'reportSha256':report_sha,'sourceAndAuthorLogPins':len(receipt['source_sha256'])+len(receipt['log_sha256']),'allPinsMatch':True},
 'provenance':{'actualHistoricalReceiptSha256':sha(fixture),'beforePins':161,'afterPins':161,'sourcePinsMatch':True,'status':'failed','failedStage':'inherited-static-and-interaction-lifecycle','signedM0Rows':24,'trackedM0Rows':23,'generatedMapSha256':sha(map_path),'actualSetSourceAuditRegressionIncluded':True,'followupCommitsParentedByPublishedA2eCovered':True,'sameLocalRemoteShaCovered':True,'sameOrderedParentsAndBaseAncestryCovered':True,'rootGoSumCandidateDeclared':True,'rootGoSumMissingFromPinnedGitTreeAndWorktree':True,'onlyMissingGitCandidateOptional':'go.sum'},
 'scheduler':{'status':live['status'],'acceptedEpochCount':live['accepted_epoch_count'],'packetCount':live['packet_count'],'initialSpawnCount':live['initial_spawn_count'],'workerCount':live['worker_count'],'errors':live['errors'],'openJobIDs':open_jobs,'incomplete':live['incomplete'],'secondFailureEvent':second,'secondFailureLogSha256':sha(log_path),'secondFailurePairs':evidence['pairs'],'originalStartupEventStillPinned':True,'mutationControls':mutations},
 'reviewTests':{'node':{'command':'/tmp/gondola-node22/node_modules/node/bin/node --test compiled-capabilities/coordination/acceptance/provenance/audit.test.mjs','exitCode':0,'tests':7,'failures':0,'ranAgainstFinalTestSourceSha256':sha(prov/'audit.test.mjs')},'python':{'command':'PYTHONDONTWRITEBYTECODE=1 python3 -m unittest -v test_audit.py','workdir':'compiled-capabilities/coordination/acceptance/scheduler','exitCode':0,'tests':16,'failures':0}},
 'scope':'Bounded review of N1 source/provenance and scheduler audit fix only. Historical full E-BUILD remains failed; live scheduler is structurally valid but incomplete while XR-FIX-SOURCE-AUDIT is running.'
}
out=root/'compiled-capabilities/coordination/reviews/XR-FIX-SOURCE-AUDIT/audit.json'
out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
print(json.dumps({'status':'passed','authorReceiptSha256':final_receipt_sha,'nodeTests':7,'pythonTests':16,'liveScheduler':live['status'],'schedulerErrors':len(live['errors']),'schedulerIncomplete':live['incomplete'],'mutationNegatives':mutations},indent=2))
