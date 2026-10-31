#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
ROOT = Path.cwd()
COORD = ROOT / 'compiled-children/coordination'
audit_path = COORD / 'rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.json'
audit = json.loads(audit_path.read_text())
source_paths = [
  'compiled-children/coordination/receipts/E-AUTHOR-CUSTODY.json',
  'compiled-children/coordination/reports/E-AUTHOR-CUSTODY.md',
  'compiled-children/coordination/receipts/XR-AUTHOR-CUSTODY.json',
  'compiled-children/coordination/reports/XR-AUTHOR-CUSTODY.md',
]
source_artifacts=[]
for rel in source_paths:
    data=(ROOT/rel).read_bytes()
    source_artifacts.append({'path':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
source_sha={x['path']:x['sha256'] for x in source_artifacts}
rawlog_paths=[
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify.py',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify.command.txt',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify.json',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify.stderr.log',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify.exit-code',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.py',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.command.txt',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.json',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.stderr.log',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.exit-code',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.py',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.command.txt',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.json',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.stderr.log',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.exit-code',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-build.py',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation.py',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-final.command.txt',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-build.command.txt',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-initial.command.txt',
  'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-firstpass-builder-drift.command.txt',
]
for p in ['compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-firstpass-builder-drift.command.txt',
          'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-firstpass-builder-drift.exit-code',
          'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-firstpass-builder-drift.stderr.log',
          'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-final.exit-code',
          'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-confirmation.log',
          'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-confirmation.exit-code']:
    if (ROOT/p).is_file(): rawlog_paths.append(p)
rawlogs=[]
for rel in sorted(set(rawlog_paths)):
    data=(ROOT/rel).read_bytes()
    rawlogs.append({'path':rel,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
report_path='compiled-children/coordination/reports/E-PUBLISHED-HISTORY-CUSTODY.md'
report_bytes=(ROOT/report_path).read_bytes()
prior=audit['prior_custody_receipt']
receipt={
 'schema':'gobi.worker-receipt/v1',
 'job_id':'E-PUBLISHED-HISTORY-CUSTODY',
 'worker':'N2',
 'outcome':'confirmed_reuse',
 'summary':'Confirmed that published history commit 45317abb8d6f7c1153ea9999927727fa43203710 contains the exact frozen 164,464,000-byte archive: all 40 chunks pass Git-object, length, and SHA-256 checks and their ordered stream matches the full expected archive SHA-256. The commit changes only history artifacts. A malformed 63-character archive hash field in the closed XR-AUTHOR receipt is explicitly superseded by the correct E-AUTHOR receipt/report and independent stream hash.',
 'published_history':{
   'commit':audit['commit'],'tree':audit['tree'],'parent':audit['parent'],'head_at_review':audit['head_at_review'],
   'changed_path_count':len(audit['commit_changed_paths']),'changed_paths':audit['commit_changed_paths'],
   'subtree':'compiled-children/ci/2026-10-31/history/','file_count':len(audit['published_files']),
   'archive_bytes':audit['manifest']['archive_bytes'],'archive_sha256':audit['manifest']['archive_sha256'],
   'manifest_path':audit['manifest']['path'],'manifest_git_blob_sha1':audit['manifest']['git_blob_sha1'],
   'manifest_sha256':audit['manifest']['sha256'],'chunk_count':audit['manifest']['part_count'],
   'chunk_sizes':{'full_size_bytes':4194304,'full_size_count':39,'final_part_bytes':886144},
   'publishedGitObjects':audit['published_files'],
   'restore_program':{
     'path':'compiled-children/ci/2026-10-31/history/restore.py',
     'git_blob_sha1':audit['other_published_files']['restore.py']['git_blob_sha1'],
     'bytes':audit['other_published_files']['restore.py']['bytes'],
     'sha256':audit['other_published_files']['restore.py']['sha256'],
     'exclusive_create':True,'checks_each_chunk':True,'checks_final_stream':True,
     'executed_by_reviewer':False,
     'root_reported_local_restore_matches':True
   },
   'readme':{
     'path':'compiled-children/ci/2026-10-31/history/README.md',
     'git_blob_sha1':audit['other_published_files']['README.md']['git_blob_sha1'],
     'bytes':audit['other_published_files']['README.md']['bytes'],
     'sha256':audit['other_published_files']['README.md']['sha256'],
     'labels_history_not_final_runtime_acceptance':True
   },
   'lazy_fetch_disabled':True,'all_43_git_objects_available':True,'ordered_stream_hash_verified':True
 },
 'custody_continuity':{
   'cutoff_utc':'2026-10-31T12:52:30Z','included_rawlogs':235,'excluded_post_cut_rawlogs':23,
   'retry1_and_partials_and_unlisted_temps_excluded':True,
   'missing_7b_bytes_not_restored':True,
   'stale_three_XR_ORACLE_bytecounts_remain_disclosed':True,
   'no_unknown_origin_or_completion_cause_assigned':True,
   'e_author_receipt_archive_hash_matches_published_stream':True,
   'prior_xr_author_receipt':{
     'path':prior['xr_receipt_path'],'bytes':prior['xr_receipt_bytes'],'sha256':prior['xr_receipt_sha256'],
     'malformed_archive_sha256':prior['xr_receipt_archive_sha256_field'],
     'malformed_field_characters':prior['xr_receipt_archive_sha256_field_bytes'],
     'correct_full_archive_sha256':prior['expected_and_independently_reconstructed_sha256'],
     'report_path':prior['xr_report_path'],'report_sha256':prior['xr_report_sha256'],
     'report_has_correct_hash':prior['xr_report_contains_correct_archive_sha256'],
     'closed_receipt_modified':False
   },
   'e_author_receipt':{'path':prior['e_author_receipt_path'],'sha256':prior['e_author_receipt_sha256'],'archive_hash_matches':True},
   'e_author_report':{'path':prior['e_author_report_path'],'sha256':prior['e_author_report_sha256']}
 },
 'checks':[
   {'command':'GIT_NO_LAZY_FETCH=1 python3 compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.py > compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.json 2> compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.stderr.log',
    'exit_code':0,'result':'Read-only parent/tree/diff, all 43 path objects, every chunk Git blob SHA-1/length/SHA-256, manifest, and concatenated archive bytes/hash passed.',
    'stdout':'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.json',
    'stderr':'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.stderr.log',
    'exit_file':'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-final.exit-code'},
   {'command':'/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation.py',
    'exit_code':0,'result':'Native validate_receipt and all final source, rawlog, and report pins verified.',
    'script':'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation.py',
    'stdout_log':'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-confirmation.log',
    'exit_file':'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-receipt-validation-confirmation.exit-code'},
   {'command':'GIT_NO_LAZY_FETCH=1 python3 compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.py > compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.json 2> compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.stderr.log',
    'exit_code':1,'preserved_finding':'The closed XR receipt hash is 63 characters, missing the final 0; independent reconstructed stream and E-AUTHOR receipt both have the 64-character expected SHA.',
    'stderr':'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.stderr.log',
    'exit_file':'compiled-children/coordination/rawlogs/N2-E-PUBLISHED-HISTORY-CUSTODY-verify-prior-xr-pin-mismatch.exit-code'},
 ],
 'sourceArtifacts':source_artifacts,
 'sourceSha256':source_sha,
 'publishedGitObjects':audit['published_files'],
 'report':{'path':report_path,'bytes':len(report_bytes),'sha256':hashlib.sha256(report_bytes).hexdigest()},
 'rawlogs':rawlogs,
 'limitations':[
   'This confirms historical archive publication only; it is not a full runtime, browser parity, or CI acceptance result.',
   'The reviewer verified the restoration program bytes and checks by inspection and independently hashed the ordered stream without materializing a duplicate archive. Root reports a separate local restoration with the same hash.',
   'The closed XR-AUTHOR-CUSTODY receipt remains unchanged; its malformed 63-character digest field is superseded here by the correct full hash, E-AUTHOR receipt/report, and Git chunk proof.'
 ],
 'publication':'No Git refs/index, source files, scheduler state, archive files, full runtime, or CI were modified or run.'
}
path=COORD/'receipts/E-PUBLISHED-HISTORY-CUSTODY.json'
path.write_text(json.dumps(receipt,indent=2)+'\n')
print(f'wrote {path.relative_to(ROOT)}: {len(source_artifacts)} source pins, {len(audit["published_files"])} published Git object pins, {len(rawlogs)} rawlog pins')
