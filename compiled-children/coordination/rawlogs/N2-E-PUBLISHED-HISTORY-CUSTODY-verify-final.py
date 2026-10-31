#!/usr/bin/env python3
"""Read-only verifier for the immutable chunked-history Git publication."""
import hashlib
import json
import os
import subprocess
from pathlib import Path

ROOT = Path.cwd().resolve()
COMMIT = '45317abb8d6f7c1153ea9999927727fa43203710'
EXPECTED_TREE = '375dda6c5ac7d3973a5b37d1e0deb6275a0c183d'
EXPECTED_PARENT = '9bd6c88a577f519d80b7be860f698363adcd1c05'
PREFIX = 'compiled-children/ci/2026-10-31/history/'
EXPECTED_ARCHIVE_BYTES = 164464000
EXPECTED_ARCHIVE_SHA256 = 'a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0'
ENV = os.environ.copy()
ENV['GIT_NO_LAZY_FETCH'] = '1'


def git(args, *, input_bytes=None):
    p = subprocess.run(['git', *args], cwd=ROOT, env=ENV, input=input_bytes,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if p.returncode:
        raise RuntimeError(f"git {' '.join(args)} exited {p.returncode}: {p.stderr.decode('utf-8', 'replace')}")
    return p.stdout


def git_blob(oid):
    return git(['cat-file', 'blob', oid])


def git_object_sha1(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode('ascii') + b'\0' + data).hexdigest()

commit_text = git(['cat-file', '-p', COMMIT]).decode('utf-8')
headers = dict(line.split(' ', 1) for line in commit_text.splitlines() if line.startswith(('tree ', 'parent ')))
assert headers.get('tree') == EXPECTED_TREE, headers
assert headers.get('parent') == EXPECTED_PARENT, headers
head = git(['rev-parse', 'HEAD']).decode().strip()
assert head == EXPECTED_PARENT, {'head': head, 'expected_parent': EXPECTED_PARENT}
object_format = git(['rev-parse', '--show-object-format']).decode().strip()
assert object_format == 'sha1', object_format

# The exact published subtree must contain the manifest, README, restore program, and 40 chunks.
tree_rows = []
for line in git(['ls-tree', '-r', '--long', COMMIT, PREFIX[:-1]]).decode().splitlines():
    meta, path = line.split('\t', 1)
    mode, kind, oid, size = meta.split()
    assert kind == 'blob' and mode == '100644', (path, meta)
    tree_rows.append({'path': path, 'oid': oid, 'bytes': int(size)})
tree_by_path = {row['path']: row for row in tree_rows}
assert len(tree_by_path) == len(tree_rows), 'duplicate subtree path'
manifest_path = PREFIX + 'manifest.json'
manifest_row = tree_by_path[manifest_path]
manifest_bytes = git_blob(manifest_row['oid'])
assert len(manifest_bytes) == manifest_row['bytes']
assert git_object_sha1(manifest_bytes) == manifest_row['oid']
manifest_sha256 = hashlib.sha256(manifest_bytes).hexdigest()
manifest = json.loads(manifest_bytes)
assert manifest['schema'] == 'gobi.chunked-evidence/v1'
assert manifest['source_commit'] == EXPECTED_PARENT
assert manifest['meaning'] == 'Pre-repair author/review history; not final runtime acceptance'
assert manifest['bytes'] == EXPECTED_ARCHIVE_BYTES
assert manifest['sha256'] == EXPECTED_ARCHIVE_SHA256
assert len(manifest['parts']) == 40
expected_paths = {manifest_path, PREFIX + 'README.md', PREFIX + 'restore.py'}
expected_paths.update(PREFIX + row['file'] for row in manifest['parts'])
assert set(tree_by_path) == expected_paths, {
    'missing': sorted(expected_paths - set(tree_by_path)),
    'unexpected': sorted(set(tree_by_path) - expected_paths),
}
changed_paths = git(['diff-tree', '--no-commit-id', '--name-only', '-r', COMMIT]).decode().splitlines()
assert set(changed_paths) == expected_paths, {
    'missing_from_commit_diff': sorted(expected_paths - set(changed_paths)),
    'unexpected_commit_paths': sorted(set(changed_paths) - expected_paths),
}

whole = hashlib.sha256()
total = 0
part_rows = []
for i, part in enumerate(manifest['parts']):
    path = PREFIX + part['file']
    row = tree_by_path[path]
    assert part['file'] == f'part-{i:03d}.bin', part
    assert row['oid'] == part['blob_sha'], (path, row['oid'], part['blob_sha'])
    data = git_blob(row['oid'])
    n = len(data)
    sha256 = hashlib.sha256(data).hexdigest()
    git_sha1 = git_object_sha1(data)
    assert n == row['bytes'] == part['bytes'], (path, n, row['bytes'], part['bytes'])
    assert sha256 == part['sha256'], (path, sha256, part['sha256'])
    assert git_sha1 == row['oid'], (path, git_sha1, row['oid'])
    whole.update(data)
    total += n
    part_rows.append({
        'path': path,
        'bytes': n,
        'git_blob_sha1': git_sha1,
        'manifest_blob_sha1': part['blob_sha'],
        'sha256': sha256,
        'manifest_sha256': part['sha256'],
        'checks': {'git_object': True, 'length': True, 'sha256': True},
    })

archive_sha = whole.hexdigest()
assert total == manifest['bytes'] == EXPECTED_ARCHIVE_BYTES, total
assert archive_sha == manifest['sha256'] == EXPECTED_ARCHIVE_SHA256, archive_sha

small_files = {}
for name in ('README.md', 'restore.py'):
    path = PREFIX + name
    row = tree_by_path[path]
    data = git_blob(row['oid'])
    assert len(data) == row['bytes']
    assert git_object_sha1(data) == row['oid']
    small_files[name] = {'bytes': len(data), 'git_blob_sha1': row['oid'], 'sha256': hashlib.sha256(data).hexdigest()}
readme = git_blob(tree_by_path[PREFIX + 'README.md']['oid']).decode('utf-8')
restore = git_blob(tree_by_path[PREFIX + 'restore.py']['oid']).decode('utf-8')
assert 'not final runtime acceptance' in readme
assert 'with out.open("xb") as target:' in restore
assert 'hashlib.sha256(data).hexdigest()==part["sha256"]' in restore
assert 'total.hexdigest()==manifest["sha256"]' in restore

# Recheck custody continuity from E-AUTHOR and XR-AUTHOR records without modifying the closed packet.
prior_receipt_path = ROOT / 'compiled-children/coordination/receipts/XR-AUTHOR-CUSTODY.json'
prior_report_path = ROOT / 'compiled-children/coordination/reports/XR-AUTHOR-CUSTODY.md'
e_author_receipt_path = ROOT / 'compiled-children/coordination/receipts/E-AUTHOR-CUSTODY.json'
e_author_report_path = ROOT / 'compiled-children/coordination/reports/E-AUTHOR-CUSTODY.md'
prior_receipt_bytes = prior_receipt_path.read_bytes()
prior_report_bytes = prior_report_path.read_bytes()
e_author_receipt_bytes = e_author_receipt_path.read_bytes()
e_author_report_bytes = e_author_report_path.read_bytes()
prior_receipt = json.loads(prior_receipt_bytes)
e_author_receipt = json.loads(e_author_receipt_bytes)
# The closed XR receipt has a malformed 63-character archive.sha256 field (missing trailing zero).
prior_xr_sha = prior_receipt['archive']['sha256']
assert len(prior_xr_sha) == 63 and prior_xr_sha == archive_sha[:-1], {'prior_sha256': prior_xr_sha, 'stream_sha256': archive_sha}
assert archive_sha in prior_report_bytes.decode('utf-8')
assert prior_receipt['archive']['bytes'] == total
assert prior_receipt['cutoff']['included'] == 235 and prior_receipt['cutoff']['excluded_after_cutoff'] == 23
assert prior_receipt['preservation']['unavailable_E_ORACLE_source']['present'] is False
assert prior_receipt['preservation']['unknown_origin_or_completion_cause_assigned'] is False
assert prior_receipt['report']['bytes'] == len(prior_report_bytes)
assert prior_receipt['report']['sha256'] == hashlib.sha256(prior_report_bytes).hexdigest()
assert e_author_receipt['archive']['sha256'] == archive_sha and e_author_receipt['archive']['bytes'] == total
assert e_author_receipt['cut']['rawlogs_included'] == 235 and e_author_receipt['cut']['rawlogs_excluded_post_cut']['count'] == 23
assert e_author_receipt['historical_audit_helper']['closed_expected_sha256'] == '7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e'
assert e_author_receipt['historical_audit_helper']['no_recovery_or_restoration_claim'] is True
assert len(e_author_receipt['historical_xr_oracle_byte_ledger']) == 3
assert len(e_author_receipt['anomalies']['ambient_archive_named_partials']['entries']) == 5
assert len(e_author_receipt['anomalies']['unlisted_temp_captures']['entries']) == 2
assert e_author_receipt['report']['bytes'] == len(e_author_report_bytes)
assert e_author_receipt['report']['sha256'] == hashlib.sha256(e_author_report_bytes).hexdigest()
assert archive_sha in e_author_report_bytes.decode('utf-8')
prior_custody = {
    'xr_receipt_path': 'compiled-children/coordination/receipts/XR-AUTHOR-CUSTODY.json',
    'xr_receipt_bytes': len(prior_receipt_bytes),
    'xr_receipt_sha256': hashlib.sha256(prior_receipt_bytes).hexdigest(),
    'xr_receipt_archive_sha256_field': prior_xr_sha,
    'xr_receipt_archive_sha256_field_bytes': len(prior_xr_sha),
    'xr_receipt_archive_sha256_field_malformed': True,
    'expected_and_independently_reconstructed_sha256': archive_sha,
    'xr_report_path': 'compiled-children/coordination/reports/XR-AUTHOR-CUSTODY.md',
    'xr_report_bytes': len(prior_report_bytes),
    'xr_report_sha256': hashlib.sha256(prior_report_bytes).hexdigest(),
    'xr_report_contains_correct_archive_sha256': True,
    'e_author_receipt_path': 'compiled-children/coordination/receipts/E-AUTHOR-CUSTODY.json',
    'e_author_receipt_sha256': hashlib.sha256(e_author_receipt_bytes).hexdigest(),
    'e_author_receipt_archive_sha256_matches': True,
    'e_author_report_path': 'compiled-children/coordination/reports/E-AUTHOR-CUSTODY.md',
    'e_author_report_sha256': hashlib.sha256(e_author_report_bytes).hexdigest(),
    'cutoff_235_in_23_out_matches': True,
    'known_exceptions_preserved': True,
    'closed_xr_receipt_modified': False,
}

published_files = [
    {'path': manifest_path, 'bytes': len(manifest_bytes), 'git_blob_sha1': manifest_row['oid'], 'sha256': manifest_sha256},
    {'path': PREFIX + 'README.md', **small_files['README.md']},
    {'path': PREFIX + 'restore.py', **small_files['restore.py']},
] + [
    {'path': row['path'], 'bytes': row['bytes'], 'git_blob_sha1': row['git_blob_sha1'], 'sha256': row['sha256']}
    for row in part_rows
]

print(json.dumps({
    'result': 'published_history_chunk_verification_passed',
    'git_no_lazy_fetch': ENV['GIT_NO_LAZY_FETCH'],
    'object_format': object_format,
    'commit': COMMIT,
    'tree': headers['tree'],
    'parent': headers['parent'],
    'head_at_review': head,
    'history_subtree_file_count': len(tree_rows),
    'published_files': published_files,
    'prior_custody_receipt': prior_custody,
    'commit_changed_paths': changed_paths,
    'source_vs_history_boundary': 'The publication commit changes only the 43 paths under compiled-children/ci/2026-10-31/history; parent is the current source commit 9bd6c88a577f519d80b7be860f698363adcd1c05.',
    'manifest': {
        'path': manifest_path,
        'git_blob_sha1': manifest_row['oid'],
        'sha256': manifest_sha256,
        'bytes': len(manifest_bytes),
        'archive_bytes': total,
        'archive_sha256': archive_sha,
        'part_count': len(part_rows),
        'part_rows': part_rows,
    },
    'other_published_files': small_files,
    'restore_program_checks': {
        'exclusive_create': True,
        'per_chunk_sha256': True,
        'whole_stream_sha256': True,
        'executed': False,
        'root_prior_local_restore_note': 'Root reports a prior local restore with the same archive SHA; this review independently validated the Git objects and concatenated stream hash without writing a duplicate archive.'
    },
    'historical_boundary': 'Pre-repair author/review history only; no full runtime or CI acceptance claim.',
    'git_mutations': False,
}, indent=2))
