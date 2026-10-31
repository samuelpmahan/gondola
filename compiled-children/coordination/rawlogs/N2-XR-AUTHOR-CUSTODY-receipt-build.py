#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path

ROOT = Path.cwd()
COORD = ROOT / 'compiled-children/coordination'
BASE = ROOT / 'compiled-children/evidence-preflight'
archive_root = BASE / 'archive-root'

def paths_from_glob(pattern):
    return sorted(p for p in ROOT.glob(pattern) if p.is_file())

source_paths = {
    'compiled-children/evidence-preflight/pre-repair-author-review-history.final.tar.gz',
    'compiled-children/evidence-preflight/archive-inventory.final.json',
    'compiled-children/evidence-preflight/selection-rawlogs-235.json',
    'compiled-children/evidence-preflight/rawlogs/excluded-rawlogs-after-cut.json',
    'compiled-children/evidence-preflight/archive-root/CONTENT-INVENTORY.json',
    'compiled-children/evidence-preflight/archive-inventory.retry1.json',
    'compiled-children/evidence-preflight/pre-repair-author-review-history.retry1.tar.gz',
    'compiled-children/coordination/receipts/E-AUTHOR-CUSTODY.json',
    'compiled-children/coordination/reports/E-AUTHOR-CUSTODY.md',
}
for p in paths_from_glob('compiled-children/evidence-preflight/tools/*.py'):
    source_paths.add(str(p.relative_to(ROOT)))
for name in [
    'ambient-partials-readonly.json', 'archive-final.log', 'archive-retry1.log',
    'excluded-rawlogs-after-cut.json', 'final-stage-prep-v2.log', 'final-stage-prep-v3.log',
    'final-stage-prep.log', 'inner-gzip-integrity.log', 'prepare.stdout.log',
    'tar-input-pre-repair-author-review-history.final.tar.nul',
    'tar-input-pre-repair-author-review-history.retry1.tar.nul', 'tool-versions.json',
    'unlisted-temp-captures.json', 'verify-final.log', 'verify-retry1.log',
]:
    source_paths.add(f'compiled-children/evidence-preflight/rawlogs/{name}')
# Historical source artifacts copied into the cutoff stage, including exact report/receipt pairs
# and the five repair manifests plus their 15 preserved original bytes.
for p in paths_from_glob('compiled-children/evidence-preflight/archive-root/project/compiled-children/coordination/reports/*'):
    source_paths.add(str(p.relative_to(ROOT)))
for p in paths_from_glob('compiled-children/evidence-preflight/archive-root/project/compiled-children/coordination/receipts/*'):
    source_paths.add(str(p.relative_to(ROOT)))
for p in paths_from_glob('compiled-children/evidence-preflight/archive-root/project/compiled-children/coordination/repairs/*/originals/*'):
    source_paths.add(str(p.relative_to(ROOT)))
for p in paths_from_glob('compiled-children/evidence-preflight/frozen/native-state/**/*'):
    source_paths.add(str(p.relative_to(ROOT)))
# Native-state snapshot frozen before later epoch changes.
source_paths.add('compiled-children/evidence-preflight/archive-root/native-state-snapshot/compiled-children/coordination/state.json')
source_paths.add('compiled-children/evidence-preflight/archive-root/native-state-snapshot/snapshot-time.txt')

source_artifacts = []
for rel in sorted(source_paths):
    data = (ROOT / rel).read_bytes()
    source_artifacts.append({'path': rel, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})

rawlogs = []
for p in sorted(COORD.joinpath('rawlogs').glob('N2-XR-AUTHOR-CUSTODY-stream-audit*')):
    if p.is_file():
        data = p.read_bytes()
        rawlogs.append({'path': str(p.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
for p in [
    COORD / 'rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-build.py',
    COORD / 'rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation.py',
    COORD / 'rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation-self-overwrite.command.txt',
    COORD / 'rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation-self-overwrite.exit-code',
    COORD / 'rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation-self-overwrite-failure.log',
    COORD / 'rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation-final.command.txt',
    COORD / 'rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation-final.exit-code',
]:
    if p.is_file():
        data = p.read_bytes()
        rawlogs.append({'path': str(p.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
# Stable successful validation output is included after its first successful generation.
validation_log = COORD / 'rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation-success.log'
if validation_log.is_file():
    data = validation_log.read_bytes()
    rawlogs.append({'path': str(validation_log.relative_to(ROOT)), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
rawlogs.sort(key=lambda row: row['path'])

report_path = 'compiled-children/coordination/reports/XR-AUTHOR-CUSTODY.md'
report_data = (ROOT / report_path).read_bytes()
source_sha = {row['path']: row['sha256'] for row in source_artifacts}
receipt = {
  'schema': 'gobi.worker-receipt/v1',
  'job_id': 'XR-AUTHOR-CUSTODY',
  'worker': 'N2',
  'decision': 'accepted',
  'summary': 'Accepted the historical author/review archive as bounded custody: independently streamed all 875 members and 40 nested gzip members; recomputed the 235/258 rawlog cutoff, checked current selected-source equality, snapshot and preserved originals, and verified exclusion ledgers. This does not accept later full runtime or CI.',
  'reviewed_job': {'job_id': 'E-AUTHOR-CUSTODY', 'worker': 'N5', 'outcome': 'mixed_change'},
  'archive': {
    'path': 'compiled-children/evidence-preflight/pre-repair-author-review-history.final.tar.gz',
    'bytes': 164464000,
    'sha256': 'a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e',
    'mode': '0444',
    'members': 875,
    'uncompressed_member_bytes': 2206776977,
    'nested_gzip_members': 40,
    'nested_gzip_streams': 40,
    'nested_gzip_uncompressed_bytes': 328628073,
    'external_inventory': {
      'path': 'compiled-children/evidence-preflight/archive-inventory.final.json',
      'bytes': 189820,
      'sha256': 'e48e7cd189dc1038dc3f964937b07edaa73459d104554b5a2f619877ae960470'
    }
  },
  'cutoff': {
    'utc': '2026-10-31T12:52:30Z',
    'source_rawlog_records': 258,
    'included': 235,
    'excluded_after_cutoff': 23,
    'selected_current_sources_equal': 235,
    'selected_current_sources_changed': 0,
    'selected_current_sources_missing': 0,
    'receipt_report_pairs': 17,
    'n4_attempt_files': 251,
    'n4_attempt_range': '01-12',
    'demo_output_dirs': ['author-smoke-20261031', 'author-smoke-20261031-rerun1'],
    'selection_path': 'compiled-children/evidence-preflight/selection-rawlogs-235.json',
    'excluded_ledger_path': 'compiled-children/evidence-preflight/rawlogs/excluded-rawlogs-after-cut.json'
  },
  'historical_snapshot': {
    'utc': '2026-10-31T12:51:44Z',
    'epoch': 11,
    'state_bytes': 50171,
    'state_sha256': 'ee3bfa067e027a16d6efb8cc9c189da77066a9240a342fdd45a109dcf12e7611',
    'member_count': 10,
    'all_members_match_archive': True,
    'live_at_review_epoch': 18,
    'live_at_review_sha256': 'f7c48085f5808ebd26e7c3d4eeb73bf94ff3aa12a9b128535c61dba965d35a37',
    'differs_from_live_at_review': True,
    'interpretation': 'Historical snapshot claims apply to epoch 11 only; review-time mutable state is separate.'
  },
  'preservation': {
    'repair_manifest_count': 5,
    'original_file_count': 15,
    'all_original_hashes_and_lengths_match': True,
    'no_wasm_live_path_not_second_archive_copy': {
      'source_path': 'compiled-frontend/conformance/no-wasm.mjs',
      'preserved_original_member': 'project/compiled-children/coordination/repairs/E-FIX-WASM-OBSERVABILITY/originals/no-wasm.mjs',
      'live_source_bytes_at_cut': 5498,
      'live_source_sha256_at_cut': 'd4afe368a26c295c8bbdc8863a5109c7e3783e08d5e65ce08173387939c7cfa1',
      'preserved_original_bytes': 2772,
      'preserved_original_sha256': '512d3debbcb8c8bb1f9edd01cb6b930a6364bcd680d7a6580c2096c5dc37ed29'
    },
    'unavailable_E_ORACLE_source': {
      'receipt_pinned_sha256': '7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e',
      'present': False,
      'current_and_custody_copy_sha256': 'f814c0aea342736b9227b85614d87285110912898e55f92f60a1b38412cd8853',
      'current_and_custody_copy_bytes': 7470,
      'restoration_claim': False
    },
    'old_XR_ORACLE_rawlog_bytecounts': [
      {'path': 'compiled-children/coordination/rawlogs/N2-XR-ORACLE-receipt-audit.py', 'historical': 1497, 'actual': 1958, 'sha256': 'eff4958928028b670df9a59623e55da4278fe53dbef5ba7b3ed3410fe7f38304'},
      {'path': 'compiled-children/coordination/rawlogs/N2-XR-ORACLE-receipt-audit.log', 'historical': 224, 'actual': 238, 'sha256': '63064f499064af9e68aa1809c630b30213d56663687cdf924bb9abf2be4f650a'},
      {'path': 'compiled-children/coordination/rawlogs/N2-XR-ORACLE-receipt-audit-exit.log', 'historical': 20, 'actual': 21, 'sha256': '91188f5648886a2f3d710ba5ead1fd361ff21ffa82e15ecb2bdbb7f9431a7888'}
    ],
    'retry1': {'bytes': 167917858, 'sha256': '954bad6b31df16f92c8297d64a53029c26159c3aeede1694d53a626a90c4f1a7', 'included_in_final': False},
    'ambient_partials': 5,
    'unlisted_temp_captures': [
      {'bytes': 45875200, 'sha256': '4a37a3cb6ec5f94c36773cc54027f0ef821bf9be97cec101a655b0b65e53e36e', 'in_retry1_only': True, 'included_in_final': False},
      {'bytes': 29884416, 'sha256': '5893d3aea92f4513b911cdfd08dcf41018720dd556a85a2be604d5ea172ee296', 'included_in_final': False}
    ],
    'unknown_origin_or_completion_cause_assigned': False
  },
  'independent_audit': {
    'result': 'independent_stream_audit_passed',
    'command': '/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-stream-audit.py',
    'success_output': 'compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-stream-audit-rerun6.json',
    'success_exit_code': 0,
    'extraction_or_second_archive_copy': False,
    'cutoff_recomputed_from': 'archive-root/CONTENT-INVENTORY.json',
    'failed_checker_iterations_are_preserved': True,
    'known_false_checker_assumptions': [
      'The final archive content inventory is pruned and cannot be used as the source inventory for recomputing post-cut paths.',
      'A live source file path need not also appear as a second archive member when its original bytes are explicitly preserved under the repair-original path.'
    ]
  },
  'checks': [
    {
      'command': '/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-stream-audit.py > compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-stream-audit-rerun6.json 2> compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-stream-audit-rerun6.stderr.log',
      'exit_code': 0,
      'result': 'Independent streaming archive, nested gzip, cutoff, snapshot, and preservation audit passed.',
      'stdout': 'compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-stream-audit-rerun6.json',
      'stderr': 'compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-stream-audit-rerun6.stderr.log',
      'exit_log': 'compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-stream-audit-rerun6.exit-code'
    },
    {
      'command': '/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation.py',
      'exit_code': 0,
      'result': 'Native validate_receipt and all final source, rawlog, and report pins passed.',
      'script': 'compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation.py',
      'stdout_capture': 'compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation-success.log',
      'exit_log': 'compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation-final.exit-code'
    },
    {
      'command': '/tmp/gondola-rebalancer-env/bin/python compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation.py > compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation.log 2>&1',
      'exit_code': 1,
      'preserved_first_pass_failure': True,
      'reason': 'The wrapper overwrote the success log before checking its pinned hash; it was rerun after separating stable output and failure records.',
      'stderr_log': 'compiled-children/coordination/rawlogs/N2-XR-AUTHOR-CUSTODY-receipt-validation-self-overwrite-failure.log'
    }
  ],
  'sourceArtifacts': source_artifacts,
  'sourceSha256': source_sha,
  'report': {'path': report_path, 'bytes': len(report_data), 'sha256': hashlib.sha256(report_data).hexdigest()},
  'rawlogs': rawlogs,
  'limitations': [
    'This accepts historical archive custody only. It is not a full-run, final runtime, browser-parity, or CI acceptance decision.',
    'The unavailable 7b124f… E-ORACLE audit-script bytes remain unavailable; the f814c0… copy is not represented as recovered original bytes.',
    'This read-only review did not modify source, archive, Git, or native scheduler state.'
  ],
  'publication': 'No source changes, Git operations, scheduler writes, full runtime run, CI run, merge, deployment, or publication.'
}
path = COORD / 'receipts/XR-AUTHOR-CUSTODY.json'
path.write_text(json.dumps(receipt, indent=2) + '\n')
print(f'wrote {path.relative_to(ROOT)}: {len(source_artifacts)} source pins, {len(rawlogs)} rawlog pins')
