import hashlib, json, os, re, tarfile
from pathlib import Path
base = Path('/tmp/modules-publish/audit/packages/final-audit-root-release')
index_path = base / 'package-index.json'
index_bytes = index_path.read_bytes()
index = json.loads(index_bytes)
archive_path = base / index['archive']['path']
manifest_path = base / index['memberManifest']['path']
inventory_path = base / index['snapshotInventory']['path']
manifest_bytes = manifest_path.read_bytes()
inventory_bytes = inventory_path.read_bytes()
manifest = json.loads(manifest_bytes)
inventory = json.loads(inventory_bytes)
sha = lambda b: hashlib.sha256(b).hexdigest()
checks = {}
checks['index_sha'] = sha(index_bytes) == '91febd22c18cc4ca3d55c1deb5435eaa9f8ce444d554287447d9b40edce8b442'
checks['manifest_ref'] = len(manifest_bytes) == index['memberManifest']['bytes'] and sha(manifest_bytes) == index['memberManifest']['sha256']
checks['inventory_ref'] = len(inventory_bytes) == index['snapshotInventory']['bytes'] and sha(inventory_bytes) == index['snapshotInventory']['sha256']
checks['manifest_schema_snapshot'] = manifest.get('schema') == 'gobi.module-evidence-members/v1' and manifest.get('snapshotId') == index['snapshotId'] == inventory.get('snapshotId')
checks['manifest_count'] = manifest.get('memberCount') == len(manifest.get('members', [])) == 3583
checks['inventory_stable'] = inventory.get('stable') is True and inventory.get('payload_file_count') == len(inventory.get('payload_files', [])) == manifest['memberCount']
expected_parts = index.get('parts', [])
part_total = 0
part_hasher = hashlib.sha256()
for number, part in enumerate(expected_parts, 1):
    path = base / part['path']
    h = hashlib.sha256(); n = 0
    with path.open('rb') as f:
        while True:
            block = f.read(1024 * 1024)
            if not block: break
            h.update(block); part_hasher.update(block); n += len(block)
    part_total += n
    if n != part['bytes'] or h.hexdigest() != part['sha256'] or n > index['partLimitBytes']:
        raise SystemExit(f'part mismatch {number}: {path.name}')
archive_bytes = archive_path.stat().st_size
checks['parts_total_and_archive'] = len(expected_parts) == 27 and part_total == archive_bytes == index['archive']['bytes'] and part_hasher.hexdigest() == index['archive']['sha256'] and sha(archive_path.read_bytes()) == index['archive']['sha256']
rows = manifest['members']
paths = [row['path'] for row in rows]
checks['manifest_sorted_unique'] = paths == sorted(paths) and len(paths) == len(set(paths))
expected = {r['path']: r for r in rows}
inventory_map = {r['path']: r for r in inventory['payload_files']}
checks['inventory_matches_member_manifest'] = len(inventory_map) == len(expected) and all(p in inventory_map and inventory_map[p].get('bytes') == r['bytes'] and inventory_map[p].get('sha256') == r['sha256'] for p, r in expected.items())
source_records = inventory.get('sources', [])
source_status = []
for source in source_records:
    before = source.get('files_before') or source.get('files') or []
    after = source.get('files_after') or []
    source_status.append({
      'label': source.get('label'),
      'stableDuringCopy': source.get('stable_during_copy'),
      'beforeCount': len(before),
      'afterCount': len(after),
      'beforeAfterEqual': before == after if after else None,
    })
checks['all_sources_stable'] = bool(source_records) and all(s['stableDuringCopy'] is True and (s['beforeAfterEqual'] is True if s['beforeCount'] else True) for s in source_status)
# Verify every archive header and byte stream against the external member manifest.
archive_members = []
verified_bytes = 0
with tarfile.open(archive_path, 'r:gz') as tf:
    seen = set()
    for member in tf:
        name = member.name.removeprefix('./')
        if name in seen: raise SystemExit(f'duplicate archive path: {name}')
        seen.add(name)
        if not member.isfile(): raise SystemExit(f'non-regular archive member: {name}')
        if (not name or name.startswith('/') or '\\' in name or '\x00' in name or any(p in ('', '.', '..') for p in name.split('/'))):
            raise SystemExit(f'unsafe archive path: {name}')
        row = expected.get(name)
        if row is None: raise SystemExit(f'archive member absent from manifest: {name}')
        stream = tf.extractfile(member)
        if stream is None: raise SystemExit(f'cannot read archive member: {name}')
        h = hashlib.sha256(); n = 0
        while True:
            block = stream.read(1024 * 1024)
            if not block: break
            h.update(block); n += len(block)
        if n != row['bytes'] or h.hexdigest() != row['sha256']:
            raise SystemExit(f'archive member mismatch: {name}')
        verified_bytes += n
        archive_members.append(name)
checks['archive_manifest_exact'] = len(archive_members) == len(rows) and archive_members == sorted(paths)
checks['verified_bytes'] = verified_bytes == inventory['payload_bytes'] == sum(r['bytes'] for r in rows)
archive_names = set(archive_members)
checks['external_no_cycle'] = all(p not in archive_names for p in ['package-index.json','members.json','source-snapshot-inventory.json','module-coordination/reports/E-PACKAGE.md','module-coordination/receipts/E-PACKAGE.json'])
notes = inventory.get('custody_notes', {})
notes_row = expected.get(notes.get('path'))
checks['custody_notes_member'] = bool(notes_row) and notes_row.get('sha256') == notes.get('sha256') and notes_row.get('bytes') == notes.get('bytes')
failed_ids = inventory.get('failed_producer_attempt_ids', [])
failed_custody = {}
for attempt_id in failed_ids:
    hits = [p for p in paths if attempt_id in p]
    failed_custody[attempt_id] = {'memberPaths': len(hits), 'hasEvidence': bool(hits)}
checks['all_failed_attempts_present'] = len(failed_ids) == 5 and all(x['hasEvidence'] for x in failed_custody.values())
# Non-archived package-local assembler is intentionally extra and must not be mistaken for a package member.
extra_assembler = base / 'assemble_evidence.py'
checks['assembler_outside_inventory'] = extra_assembler.exists() and not any(Path(r['path']).name == 'assemble_evidence.py' for r in rows)
# Sealed receipt/report and copied coordination bytes have exact equality.
external_report = Path('/tmp/modules-publish/audit/E-PACKAGE-report.md').read_bytes()
external_receipt = Path('/tmp/modules-publish/audit/E-PACKAGE-receipt.json').read_bytes()
seal = Path('/workspace/scratch/39a56936f173/module-coordination/seals/E-PACKAGE')
coord = Path('/workspace/scratch/39a56936f173/module-coordination')
checks['report_custody_equal'] = external_report == (seal/'E-PACKAGE.md').read_bytes() == (coord/'reports/E-PACKAGE.md').read_bytes()
checks['receipt_custody_equal'] = external_receipt == (seal/'E-PACKAGE.json').read_bytes() == (coord/'receipts/E-PACKAGE.json').read_bytes()
result = {
  'schema': 'gobi.xr-package-independent-review/v1',
  'status': 'passed' if all(checks.values()) else 'failed',
  'checks': checks,
  'archive': {'bytes': archive_bytes, 'sha256': index['archive']['sha256'], 'members': len(archive_members), 'uncompressedBytes': verified_bytes},
  'parts': {'count': len(expected_parts), 'totalBytes': part_total, 'limitBytes': index['partLimitBytes'], 'largestBytes': max(p['bytes'] for p in expected_parts)},
  'manifest': {'bytes': len(rows), 'sha256': sha(manifest_bytes), 'memberSetMatchesSnapshotInventory': checks['inventory_matches_member_manifest']},
  'snapshot': {'id': inventory['snapshotId'], 'createdUTC': inventory['created_utc'], 'payloadFileCount': inventory['payload_file_count'], 'payloadBytes': inventory['payload_bytes'], 'stable': inventory['stable'], 'sourceCount': len(source_records), 'sources': source_status},
  'custody': {'failedAttempts': failed_custody, 'notesPath': notes.get('path'), 'notesSHA256': notes.get('sha256'), 'reportSHA256': sha(external_report), 'receiptSHA256': sha(external_receipt)},
  'packageIndexSHA256': sha(index_bytes),
  'externalFiles': {'membersJSONIncludedInArchive': 'members.json' in archive_names, 'packageIndexIncludedInArchive': 'package-index.json' in archive_names, 'snapshotInventoryIncludedInArchive': 'source-snapshot-inventory.json' in archive_names, 'assemblerBytesSHA256': sha(extra_assembler.read_bytes()) if extra_assembler.exists() else None},
}
print(json.dumps(result, indent=2))
if not all(checks.values()): raise SystemExit(1)
