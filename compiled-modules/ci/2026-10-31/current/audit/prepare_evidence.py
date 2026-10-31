#!/usr/bin/env python3
"""Create a byte-verified private snapshot for module qualification evidence.

This only reads source evidence. It refuses to overwrite an existing snapshot.
The snapshot may be incomplete if a live source changes while it is copied; the
external status file makes that visible and the final pack must be freshly
prepared after the release gate.
"""
from __future__ import annotations
import hashlib
import json
import os
import shutil
import stat
import sys
from pathlib import Path

WORK = Path('/workspace/scratch/39a56936f173/gondola')
COORD = Path('/workspace/scratch/39a56936f173/module-coordination')
AUDIT = Path('/tmp/modules-publish/audit')
SNAPSHOT_ID = sys.argv[1] if len(sys.argv) > 1 else 'snapshot-preseal-001'
DEST = AUDIT / 'snapshots' / SNAPSHOT_ID
PAYLOAD = DEST / 'payload'

BUILD_ROOTS = [
    Path('/tmp/gobi-module-gate1-react-moduleparent-20261031'),
    Path('/tmp/gobi-module-gate1-dom-moduleparent-20261031'),
    Path('/tmp/gobi-module-gate1-react-modulechild-20261031'),
    Path('/tmp/gobi-module-gate1-dom-modulechild-20261031'),
    Path('/tmp/gobi-module-gate1-numeric-react-modulechild-20261031'),
    Path('/tmp/gobi-module-gate1-numeric-dom-modulechild-20261031'),
    Path('/tmp/gobi-module-postutf8-1793480293941773629'),
]
M0_TRACE = WORK / 'interaction/build/interaction-traces-seed-20261030.json'
PRODUCER_OUTPUT_ATTEMPTS = WORK / 'compiled-modules/output/attempts'
PRODUCER_EVIDENCE_ATTEMPTS = WORK / 'compiled-modules/evidence/attempts'

CUSTODY_NOTES = {
    'schema': 'gobi.module-evidence-custody-notes/v1',
    'scope': 'Known unavailable evidence at snapshot preparation; no bytes reconstructed.',
    'items': [
        {
            'evidence': 'pre-fix moduleabi/descriptor.go source hash for the unsafe Artifact.Bytes acceptance witness',
            'status': 'unavailable',
            'detail': 'E-GO/XR-ABI report the original pre-fix source hash was not captured. The accepted descriptor bytes, accepted output, and reproducer are preserved. The post-fix source hash is not attributed to the earlier acceptance.',
        },
        {
            'evidence': 'XR-REBUILDS follow-on pin-validation transient stderr',
            'status': 'unavailable',
            'detail': 'XR-REBUILDS report states transient stderr was overwritten by final passing output at the same rawlog path. Exact failed bytes are unavailable and were not reconstructed. The preceding traceback and final passing output are preserved.',
        },
        {
            'evidence': 'any coordination payload created after this snapshot timestamp',
            'status': 'outside_snapshot',
            'detail': 'This is a pre-seal snapshot. Final packaging must rerun the inventory after root releases the package gate so later receipts, reviews, and logs are included.',
        },
    ],
}


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def file_inventory(root: Path):
    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f'missing source directory: {root}')
    records = []
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            raise RuntimeError(f'symlink in evidence source: {p}')
        if p.is_dir():
            continue
        st = p.lstat()
        if not stat.S_ISREG(st.st_mode):
            raise RuntimeError(f'non-regular evidence source: {p}')
        rel = p.relative_to(root).as_posix()
        records.append({'path': rel, 'bytes': st.st_size, 'sha256': digest(p), 'mode': stat.S_IMODE(st.st_mode)})
    return records


def copy_tree_verified(src: Path, dest: Path, label: str):
    before = file_inventory(src)
    dest.mkdir(parents=True, exist_ok=False)
    for row in before:
        source_file = src / row['path']
        target_file = dest / row['path']
        target_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_file, target_file)
        os.chmod(target_file, row['mode'])
        if target_file.stat().st_size != row['bytes'] or digest(target_file) != row['sha256']:
            raise RuntimeError(f'copy verification failed: {label}/{row["path"]}')
    after = file_inventory(src)
    stable = before == after
    return {'label': label, 'source': str(src), 'files_before': before, 'files_after': after, 'stable_during_copy': stable}


def copy_selected_verified(src_root: Path, dest_root: Path, label: str, selected_relpaths):
    """Copy a frozen set of regular files while checking its source before/after."""
    relpaths = sorted(set(Path(x).as_posix() for x in selected_relpaths))
    before = []
    for rel in relpaths:
        p = src_root / rel
        if p.is_symlink() or not p.is_file():
            raise RuntimeError(f'missing or non-regular selected evidence: {p}')
        st = p.lstat()
        before.append({'path': rel, 'bytes': st.st_size, 'sha256': digest(p), 'mode': stat.S_IMODE(st.st_mode)})
    dest_root.mkdir(parents=True, exist_ok=False)
    for row in before:
        source_file = src_root / row['path']
        target_file = dest_root / row['path']
        target_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_file, target_file)
        os.chmod(target_file, row['mode'])
        if target_file.stat().st_size != row['bytes'] or digest(target_file) != row['sha256']:
            raise RuntimeError(f'selected evidence copy verification failed: {label}/{row["path"]}')
    after = []
    for rel in relpaths:
        p = src_root / rel
        st = p.lstat()
        after.append({'path': rel, 'bytes': st.st_size, 'sha256': digest(p), 'mode': stat.S_IMODE(st.st_mode)})
    return {'label': label, 'source': str(src_root), 'files_before': before, 'files_after': after, 'stable_during_copy': before == after}


def failed_producer_attempts():
    evidence_rows = []
    for attempt_dir in sorted(PRODUCER_EVIDENCE_ATTEMPTS.iterdir()):
        if not attempt_dir.is_dir():
            continue
        receipt = next((p for p in (attempt_dir / 'failure-receipt.json', attempt_dir / 'failure.json') if p.is_file()), None)
        if receipt is None:
            continue
        data = json.loads(receipt.read_text(encoding='utf-8'))
        if data.get('status') != 'failed':
            continue
        evidence_rows.append((attempt_dir.name, attempt_dir))
    if not evidence_rows:
        raise RuntimeError('no failed producer attempt evidence receipts found')
    ids = [name for name, _ in evidence_rows]
    output_rel = []
    for attempt_id in ids:
        attempt_path = PRODUCER_OUTPUT_ATTEMPTS / attempt_id
        if not attempt_path.is_dir():
            raise RuntimeError(f'failed evidence receipt has no output attempt directory: {attempt_id}')
        for p in sorted(attempt_path.rglob('*')):
            if p.is_symlink():
                raise RuntimeError(f'symlink in failed producer attempt: {p}')
            if p.is_file():
                output_rel.append(p.relative_to(PRODUCER_OUTPUT_ATTEMPTS).as_posix())
        # Preserve any sibling archive/manifest or interrupted archive staging bytes
        # belonging to this failed attempt, when present.
        for p in sorted(PRODUCER_OUTPUT_ATTEMPTS.iterdir()):
            if not p.is_file():
                continue
            n = p.name
            if n.startswith(attempt_id + '.') or n.startswith('.' + attempt_id + '.'):
                output_rel.append(p.relative_to(PRODUCER_OUTPUT_ATTEMPTS).as_posix())
    evidence_rel = []
    for attempt_id in ids:
        root = PRODUCER_EVIDENCE_ATTEMPTS / attempt_id
        for p in sorted(root.rglob('*')):
            if p.is_symlink():
                raise RuntimeError(f'symlink in failed producer evidence: {p}')
            if p.is_file():
                evidence_rel.append(p.relative_to(PRODUCER_EVIDENCE_ATTEMPTS).as_posix())
    return ids, output_rel, evidence_rel


def main():
    if DEST.exists():
        raise FileExistsError(f'refusing to overwrite snapshot: {DEST}')
    DEST.mkdir(parents=True)
    PAYLOAD.mkdir()
    status = {'schema': 'gobi.module-evidence-snapshot/v1', 'snapshotId': SNAPSHOT_ID, 'stable': True, 'sources': []}
    # Capture the complete coordination tree byte-for-byte, including all current
    # author/reviewer packets and raw failures. Do not prune or rewrite it.
    status['sources'].append(copy_tree_verified(COORD, PAYLOAD / 'module-coordination', 'module-coordination'))
    # Keep a second path for the repository's duplicate M0 trace as separate custody evidence.
    trace_dest = PAYLOAD / 'm0-source-copy' / M0_TRACE.name
    trace_dest.parent.mkdir(parents=True)
    trace_before = {'bytes': M0_TRACE.stat().st_size, 'sha256': digest(M0_TRACE)}
    shutil.copyfile(M0_TRACE, trace_dest)
    trace_after = {'bytes': trace_dest.stat().st_size, 'sha256': digest(trace_dest)}
    if trace_before != trace_after:
        raise RuntimeError('M0 trace copy verification failed')
    status['sources'].append({'label': 'm0-source-trace', 'source': str(M0_TRACE), 'files_before': [{'path': M0_TRACE.name, **trace_before}], 'files_after': [{'path': M0_TRACE.name, **trace_before}], 'stable_during_copy': True})
    attempt_ids, output_files, evidence_files = failed_producer_attempts()
    failed_root = PAYLOAD / 'failed-producer-attempts'
    status['failed_producer_attempt_ids'] = attempt_ids
    status['sources'].append(copy_selected_verified(PRODUCER_OUTPUT_ATTEMPTS, failed_root / 'compiled-modules/output/attempts', 'failed-producer-output-attempts', output_files))
    status['sources'].append(copy_selected_verified(PRODUCER_EVIDENCE_ATTEMPTS, failed_root / 'compiled-modules/evidence/attempts', 'failed-producer-evidence-attempts', evidence_files))
    builds_root = PAYLOAD / 'build-artifacts'
    builds_root.mkdir()
    for src in BUILD_ROOTS:
        dst = builds_root / src.name
        status['sources'].append(copy_tree_verified(src, dst, f'build-artifacts/{src.name}'))
    custody = PAYLOAD / 'custody-notes.json'
    custody.write_text(json.dumps(CUSTODY_NOTES, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    status['custody_notes'] = {'path': 'custody-notes.json', 'bytes': custody.stat().st_size, 'sha256': digest(custody)}
    status['stable'] = all(x['stable_during_copy'] for x in status['sources'])
    status['payload_files'] = file_inventory(PAYLOAD)
    status['payload_bytes'] = sum(x['bytes'] for x in status['payload_files'])
    status['payload_file_count'] = len(status['payload_files'])
    status['created_utc'] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
    status_path = DEST / 'snapshot-inventory.json'
    status_path.write_text(json.dumps(status, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'snapshot': str(DEST), 'stable': status['stable'], 'files': status['payload_file_count'], 'bytes': status['payload_bytes'], 'inventory': str(status_path)}, sort_keys=True))
    if not status['stable']:
        raise SystemExit(3)

if __name__ == '__main__':
    main()
