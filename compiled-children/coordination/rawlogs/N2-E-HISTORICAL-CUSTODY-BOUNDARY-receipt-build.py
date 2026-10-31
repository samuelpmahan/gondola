#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
ROOT=Path.cwd()
COORD=ROOT/'compiled-children/coordination'
AUDIT_REL='compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-verify-final.json'
audit=json.loads((ROOT/AUDIT_REL).read_text())
source_paths=[
 'compiled-children/evidence-preflight/pre-repair-author-review-history.retry1.tar.gz',
 'compiled-children/evidence-preflight/archive-inventory.retry1.json',
 'compiled-children/coordination/superseded-retry1-integrity.json',
 'compiled-children/evidence-preflight/archive-inventory.final.json',
 'compiled-children/coordination/cleanup-verified-staging.json',
 'compiled-children/coordination/cleanup-verified-superseded-stage.json',
 'compiled-children/coordination/cleanup-verified-final-stage.json',
 'compiled-children/coordination/receipts/E-AUTHOR-CUSTODY.json',
 'compiled-children/coordination/reports/E-AUTHOR-CUSTODY.md',
 'compiled-children/coordination/receipts/E-PUBLISHED-HISTORY-CUSTODY.json',
 'compiled-children/coordination/reports/E-PUBLISHED-HISTORY-CUSTODY.md',
 'compiled-children/coordination/receipts/XR-PUBLISHED-HISTORY-CUSTODY.json',
 'compiled-children/coordination/reports/XR-PUBLISHED-HISTORY-CUSTODY.md',
]
def pin_path(rel):
 p=ROOT/rel; h=hashlib.sha256(); n=0
 with p.open('rb') as f:
  while True:
   b=f.read(1024*1024)
   if not b: break
   n+=len(b);h.update(b)
 return {'path':rel,'bytes':n,'sha256':h.hexdigest()}
source_artifacts=[pin_path(p) for p in source_paths]
source_sha={x['path']:x['sha256'] for x in source_artifacts}
rawlog_paths=sorted(p for p in COORD.joinpath('rawlogs').glob('N2-E-HISTORICAL-CUSTODY-BOUNDARY-*') if p.is_file())
rawlogs=[pin_path(str(p.relative_to(ROOT))) for p in rawlog_paths]
report_path='compiled-children/coordination/reports/E-HISTORICAL-CUSTODY-BOUNDARY.md'
report_data=(ROOT/report_path).read_bytes()
prior=audit['prior_selected_875_publication_packets']
candidate=audit['mistaken_archive_root_cleanup_boundary']['remaining_stage_candidate']
receipt={
 'schema':'gobi.worker-receipt/v1','job_id':'E-HISTORICAL-CUSTODY-BOUNDARY','worker':'N2','outcome':'confirmed_reuse',
 'summary':'Independently streamed superseded retry1 and matched all 902 archive members to their inventory. Cleanup records confirm 874 v2 deletion rows map to preserved retry1 members and 875 v3 rows match the final selected inventory. The earlier 903-file staging cleanup had one un-inventoried extra; a retained 29,884,416-byte candidate matches aggregate size, but its identity/equality to the deleted extra is unproven. No all-903 recoverability claim.',
 'retry1':{
  'path':audit['archive']['path'],'bytes':audit['archive']['bytes'],'sha256':audit['archive']['sha256'],'mode':audit['archive']['mode'],
  'inventory_path':audit['archive']['inventory_path'],'inventory_sha256':audit['archive']['inventory_sha256'],
  'members':audit['archive']['member_count'],'uncompressed_bytes':audit['archive']['uncompressed_member_bytes'],
  'every_member_matches_inventory':True,'superseded_not_runtime_acceptance':True,
 },
 'cleanup_boundary':{
  'mistaken_root_cleanup':audit['mistaken_archive_root_cleanup_boundary'],
  'v2_superseded_stage_cleanup':audit['v2_cleanup'],
  'v3_final_stage_cleanup':audit['v3_cleanup'],
  'all_903_deleted_files_recoverable_claim':False,
  'known_902_retry1_members_recoverable_from_preserved_archive':True,
  'candidate_identity_proven':False,
 },
 'retainedCandidate':{'path':candidate['path'],'bytes':candidate['bytes'],'sha256':candidate['sha256']},
 'selected_875_boundary':{
   'prior_accepted_publication_packets':prior,
   'selected_archive_rehashed_by_this_job':False,
   'selected_archive_or_remote_chunks_copied':False,
   'selected_archive_remains_preserved':True,
 },
 'known_history_exceptions':{
   'retry1_is_superseded':True,
   'missing_7b_audit_bytes_restored':False,
   'partial_and_temp_completion_cause_assigned':False,
   'cutoff_and_exception_ledger_changed':False,
   'prior_63_character_XR_AUTHOR_hash_typo_already_superseded_by_E_XR_PUBLISHED':True,
 },
 'checks':[
  {'command':'/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-verify-final.py',
   'exit_code':0,'result':'Stream-verified retry1 outer bytes/SHA and all 902 tar members against retry1 inventory; checked every v2 removal mapping and cleanup totals.',
   'output':'compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-verify-final.json',
   'exit_file':'compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-verify-final.exit-code'},
  {'command':'/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-receipt-validation.py',
   'exit_code':0,'result':'Native validate_receipt and all source, cleanup, candidate, log, and report pins passed.',
   'script':'compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-receipt-validation.py',
   'output':'compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-receipt-validation-success.log'},
  {'command':'/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-verify-initial-cleanup-phrase-failure.py',
   'exit_code':1,'preserved_checker_failure':True,'reason':'Initial assertion used the wrong exact phrase for cleanup correction; final checker passed.',
   'stderr':'compiled-children/coordination/rawlogs/N2-E-HISTORICAL-CUSTODY-BOUNDARY-verify-initial-cleanup-phrase-failure.stderr.log'},
 ],
 'sourceArtifacts':source_artifacts,'sourceSha256':source_sha,'rawlogs':rawlogs,
 'report':{'path':report_path,'bytes':len(report_data),'sha256':hashlib.sha256(report_data).hexdigest()},
 'limitations':[
  'The v1 staging cleanup occurred before per-entry inventory. Aggregate counts and a retained matching-size candidate do not prove identity/equality to the deleted extra.',
  'No statement is made that all 903 deleted staging files are recoverable. This task verifies the preserved 902-member retry1 archive and the recorded 874/875 cleanup boundaries.',
  'This is historical custody only and makes no current source, full runtime, browser, or CI acceptance claim.'
 ],
 'publication':'No source/README edits, Git commands, native scheduler writes, npm, runtime, CI, or archive-copy/materialization.'
}
(COORD/'receipts/E-HISTORICAL-CUSTODY-BOUNDARY.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(f'wrote receipt: {len(source_artifacts)} source pins, {audit['archive']['member_count']} retry1 members, {len(rawlogs)} rawlogs')
