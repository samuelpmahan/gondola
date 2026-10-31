#!/usr/bin/env python3
"""Read-only retry1 archive and cleanup-boundary audit; streams all archive members."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import stat
import tarfile

ROOT = Path.cwd().resolve()
ARCHIVE_REL = 'compiled-children/evidence-preflight/pre-repair-author-review-history.retry1.tar.gz'
INV_REL = 'compiled-children/evidence-preflight/archive-inventory.retry1.json'
ARCHIVE = ROOT / ARCHIVE_REL
INV_PATH = ROOT / INV_REL
CHUNK = 1024 * 1024
EXPECTED_BYTES = 167917858
EXPECTED_SHA256 = '954bad6b31df16f92c8297d64a53029c26159c3aeede1694d53a626a90c4f1a7'
EXPECTED_MEMBER_COUNT = 902
EXPECTED_UNCOMPRESSED = 2252949830


def sha_path(path: Path) -> dict:
    before = path.stat()
    h = hashlib.sha256()
    size = 0
    with path.open('rb') as f:
        while True:
            b = f.read(CHUNK)
            if not b: break
            size += len(b)
            h.update(b)
    after = path.stat()
    stable = (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns)
    return {'path': str(path), 'bytes': size, 'sha256': h.hexdigest(), 'stable_during_hash': stable}


def sha_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def read_json(rel: str) -> tuple[dict, bytes]:
    raw = (ROOT / rel).read_bytes()
    return json.loads(raw), raw

inventory, inventory_raw = read_json(INV_REL)
assert inventory.get('archive_member_count') == EXPECTED_MEMBER_COUNT
rows = inventory['members']
expected = {r['member']: r for r in rows}
assert len(expected) == len(rows) == EXPECTED_MEMBER_COUNT
assert sum(r['bytes'] for r in rows) == EXPECTED_UNCOMPRESSED
assert all(isinstance(r.get('sha256'), str) and len(r['sha256']) == 64 for r in rows)

archive_before = ARCHIVE.stat()
assert stat.S_ISREG(archive_before.st_mode)
outer = sha_path(ARCHIVE)
assert outer['stable_during_hash'] and outer['bytes'] == EXPECTED_BYTES and outer['sha256'] == EXPECTED_SHA256
seen = {}
member_bytes = 0
with ARCHIVE.open('rb') as source:
    with tarfile.open(fileobj=source, mode='r|gz') as tar:
        for entry in tar:
            name = entry.name.rstrip('/')
            if entry.isdir():
                continue
            assert entry.isfile(), f'non-regular member {name}'
            assert name in expected, f'unexpected archive member {name}'
            assert name not in seen, f'duplicate archive member {name}'
            member = tar.extractfile(entry)
            assert member is not None
            h = hashlib.sha256()
            size = 0
            with member:
                while True:
                    block = member.read(CHUNK)
                    if not block: break
                    size += len(block)
                    h.update(block)
            actual_sha = h.hexdigest()
            pin = expected[name]
            assert size == entry.size == pin['bytes'], (name, size, entry.size, pin['bytes'])
            assert actual_sha == pin['sha256'], (name, actual_sha, pin['sha256'])
            seen[name] = {'bytes': size, 'sha256': actual_sha}
            member_bytes += size
assert set(seen) == set(expected), {'missing': sorted(set(expected)-set(seen))[:20]}
archive_after = ARCHIVE.stat()
assert (archive_before.st_size, archive_before.st_mtime_ns) == (archive_after.st_size, archive_after.st_mtime_ns)
assert len(seen) == EXPECTED_MEMBER_COUNT and member_bytes == EXPECTED_UNCOMPRESSED

staging, staging_raw = read_json('compiled-children/coordination/cleanup-verified-staging.json')
final_cleanup, final_cleanup_raw = read_json('compiled-children/coordination/cleanup-verified-final-stage.json')
sup_cleanup, sup_cleanup_raw = read_json('compiled-children/coordination/cleanup-verified-superseded-stage.json')
sup_integrity, sup_integrity_raw = read_json('compiled-children/coordination/superseded-retry1-integrity.json')
final_inv_rel = 'compiled-children/evidence-preflight/archive-inventory.final.json'
final_inv, final_inv_raw = read_json(final_inv_rel)

assert staging['files'] == 903 and staging['bytes'] == 2282834246
assert staging['removedDuplicateStaging'] == 'compiled-children/evidence-preflight/archive-root'
assert not (ROOT / staging['removedDuplicateStaging']).exists()
assert staging['preservedArchive'] == ARCHIVE_REL.replace('retry1', 'final')
assert staging['correction']['superseded902'].startswith('Initial/retry1 inventories record902members2252949830bytes')
assert 'notproven' in staging['correction']['unrecordedRemovedEntryLimit']
assert staging['remainingStageRecoveryProbe']['meaning'].find('identity/equality') >= 0
known_archive_count = len(rows)
known_archive_bytes = sum(r['bytes'] for r in rows)
unknown_count_delta = staging['files'] - known_archive_count
unknown_bytes_delta = staging['bytes'] - known_archive_bytes
assert unknown_count_delta == 1 and unknown_bytes_delta == 29884416
candidate_record = staging['remainingStageRecoveryProbe']['unlistedCandidatesStillPreserved']
assert len(candidate_record) == 1
candidate = candidate_record[0]
candidate_path = Path(candidate['path'])
candidate_hash = sha_path(candidate_path)
assert candidate_hash['stable_during_hash']
assert candidate_hash['bytes'] == candidate['bytes'] == unknown_bytes_delta
assert candidate_hash['sha256'] == candidate['sha256'] == '5893d3aea92f4513b911cdfd08dcf41018720dd556a85a2be604d5ea172ee296'

# The v2 stage cleanup lists each removed row's source path and an explicit retained archive member.
sup_removed = sup_cleanup['removed']
assert len(sup_removed) == 874 and sup_cleanup['unverifiedRetained'] == []
sup_removed_total = sum(row['bytes'] for row in sup_removed)
assert sup_removed_total == 2252623803
sup_mismatches = []
covered_retry_members = set()
for row in sup_removed:
    preserved = row.get('preservedCopy', {})
    assert preserved.get('archive') == ARCHIVE_REL, (row['path'], preserved)
    member_name = preserved.get('member')
    archived = seen.get(member_name)
    if archived is None or archived['bytes'] != row['bytes'] or archived['sha256'] != row['sha256']:
        sup_mismatches.append({'path': row['path'], 'preserved_member': member_name, 'record': row, 'archive_actual': archived})
    else:
        covered_retry_members.add(member_name)
assert not sup_mismatches, sup_mismatches[:3]

# v3 cleanup is exactly the final selected archive inventory; the final archive was verified earlier.
final_rows = final_inv['members']
assert len(final_rows) == 875 and sum(row['bytes'] for row in final_rows) == EXPECTED_UNCOMPRESSED - (EXPECTED_UNCOMPRESSED - 2206776977)
assert final_cleanup['checkedAndRemovedFiles'] == len(final_rows) == 875
assert final_cleanup['bytes'] == sum(row['bytes'] for row in final_rows) == 2206776977
assert final_cleanup['archiveSHA256'] == 'a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0'
assert final_cleanup['inventory'] == final_inv_rel
assert final_cleanup['unlistedEntriesRetained'] == []

assert sup_integrity['status'] == 'passed'
assert sup_integrity['archive'] == ARCHIVE_REL
assert sup_integrity['bytes'] == EXPECTED_BYTES and sup_integrity['sha256'] == EXPECTED_SHA256
assert sup_integrity['members'] == EXPECTED_MEMBER_COUNT and sup_integrity['uncompressedBytes'] == EXPECTED_UNCOMPRESSED

# Previously accepted publication packets preserve the selected 875-member archive without re-streaming it here.
published_receipts=[]
for job in ('E-PUBLISHED-HISTORY-CUSTODY','XR-PUBLISHED-HISTORY-CUSTODY'):
    receipt_path=f'compiled-children/coordination/receipts/{job}.json'
    report_path=f'compiled-children/coordination/reports/{job}.md'
    receipt, receipt_raw=read_json(receipt_path)
    report_raw=(ROOT/report_path).read_bytes()
    report_pin=receipt['report']
    assert report_pin['path']==report_path and report_pin['bytes']==len(report_raw) and report_pin['sha256']==sha_bytes(report_raw)
    if job.startswith('E-'):
        hist=receipt['published_history']
        assert hist['archive_bytes']==164464000 and hist['archive_sha256']=='a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0'
        assert hist['file_count']==43
        decision=receipt['outcome']
    else:
        hist=receipt['published_history']
        assert hist['archive_bytes']==164464000 and hist['archive_sha256']=='a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0'
        decision=receipt['decision']
    published_receipts.append({
        'job_id':job,'decision_or_outcome':decision,
        'receipt_path':receipt_path,'receipt_bytes':len(receipt_raw),'receipt_sha256':sha_bytes(receipt_raw),
        'report_path':report_path,'report_bytes':len(report_raw),'report_sha256':sha_bytes(report_raw),
        'archive_sha256':hist['archive_sha256'],'archive_bytes':hist['archive_bytes']
    })

print(json.dumps({
    'result':'retry1_and_cleanup_boundary_verified',
    'archive':{'path':ARCHIVE_REL,'bytes':outer['bytes'],'sha256':outer['sha256'],'mode':oct(stat.S_IMODE(archive_before.st_mode)),
               'member_count':len(seen),'uncompressed_member_bytes':member_bytes,
               'inventory_path':INV_REL,'inventory_sha256':sha_bytes(inventory_raw),
               'members_match_inventory':True},
    'v2_cleanup':{'record_path':'compiled-children/coordination/cleanup-verified-superseded-stage.json',
                  'removed_rows':len(sup_removed),'removed_source_bytes':sup_removed_total,
                  'each_removed_row_matches_preserved_retry1_member':True,
                  'unique_retry1_members_covered':len(covered_retry_members),
                  'inventory_members_not_referenced_by_v2_rows':len(set(seen)-covered_retry_members),
                  'unverified_retained_entries':len(sup_cleanup['unverifiedRetained'])},
    'v3_cleanup':{'record_path':'compiled-children/coordination/cleanup-verified-final-stage.json',
                  'removed_files':final_cleanup['checkedAndRemovedFiles'],'bytes':final_cleanup['bytes'],
                  'matches_final_inventory_count_and_total':True},
    'mistaken_archive_root_cleanup_boundary':{
        'record_path':'compiled-children/coordination/cleanup-verified-staging.json',
        'recorded_removed_files':staging['files'],'recorded_removed_bytes':staging['bytes'],
        'retry1_inventory_known_files':known_archive_count,'retry1_inventory_known_bytes':known_archive_bytes,
        'aggregate_file_count_difference':unknown_count_delta,'aggregate_byte_difference':unknown_bytes_delta,
        'remaining_stage_candidate':{'path':candidate['path'],'bytes':candidate_hash['bytes'],'sha256':candidate_hash['sha256'],'exists':candidate_path.is_file()},
        'candidate_matches_aggregate_size':True,'candidate_identity_or_equality_to_deleted_extra_proven':False,
        'every_deleted_archive_root_extra_identity_proven':False,
        'interpretation':'902 retry1 members remain independently verified in the preserved archive. The removed staging directory had one extra file and 29,884,416 extra bytes by aggregate record. The matching-size candidate remains in another stage but is not proven identical to that deleted extra.'
    },
    'prior_selected_875_publication_packets':published_receipts,
    'history_only_boundary':'The selected 875-member published archive is preserved and previously accepted; the retry1 archive is superseded history, not runtime acceptance. No all-903-files recoverability claim.',
    'archive_copies_created':False,'git_or_state_writes':False
}, indent=2))
