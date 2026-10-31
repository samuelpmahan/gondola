#!/usr/bin/env python3
"""Deterministic tar.gz packer with <=1 MiB parts and an explicit release gate.

No archive is created by default. `--seal` requires the externally supplied
RELEASE-EVIDENCE-PACKAGE marker. `--verify` validates an already-created pack.
"""
from __future__ import annotations
import argparse
import gzip
import hashlib
import io
import json
import os
import shutil
import stat
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

AUDIT = Path('/tmp/modules-publish/audit')
GATE = AUDIT / 'RELEASE-EVIDENCE-PACKAGE'
MAX_PART = 1024 * 1024


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def inventory(root: Path):
    rows = []
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            raise ValueError(f'symlink forbidden in package payload: {p}')
        if p.is_dir():
            continue
        st = p.lstat()
        if not stat.S_ISREG(st.st_mode):
            raise ValueError(f'non-regular file forbidden: {p}')
        rows.append({'path': p.relative_to(root).as_posix(), 'bytes': st.st_size, 'sha256': sha_file(p), 'mode': stat.S_IMODE(st.st_mode)})
    return rows


def check_snapshot(snapshot: Path):
    payload = snapshot / 'payload'
    inv_path = snapshot / 'snapshot-inventory.json'
    if not payload.is_dir() or not inv_path.is_file():
        raise ValueError('snapshot must contain payload/ and snapshot-inventory.json')
    inv = json.loads(inv_path.read_text(encoding='utf-8'))
    if inv.get('stable') is not True:
        raise ValueError('snapshot was not stable during source copy')
    actual = inventory(payload)
    recorded = inv.get('payload_files')
    if actual != recorded:
        raise ValueError('snapshot payload differs from its recorded byte inventory')
    if len(actual) != inv.get('payload_file_count') or sum(x['bytes'] for x in actual) != inv.get('payload_bytes'):
        raise ValueError('snapshot aggregate inventory mismatch')
    return payload, inv, actual


def make_tar(payload: Path, rows):
    raw = io.BytesIO()
    with tarfile.open(fileobj=raw, mode='w', format=tarfile.PAX_FORMAT) as tf:
        for row in rows:
            rel = row['path']
            p = payload / rel
            ti = tarfile.TarInfo(name=rel)
            ti.size = row['bytes']
            ti.mode = row['mode']
            ti.mtime = 0
            ti.uid = 0
            ti.gid = 0
            ti.uname = ''
            ti.gname = ''
            ti.type = tarfile.REGTYPE
            with p.open('rb') as f:
                tf.addfile(ti, f)
    compressed = io.BytesIO()
    with gzip.GzipFile(filename='', mode='wb', compresslevel=9, fileobj=compressed, mtime=0) as gz:
        gz.write(raw.getvalue())
    return compressed.getvalue()


def write_package(snapshot: Path, outdir: Path):
    if not GATE.is_file() or GATE.read_text(encoding='utf-8').strip() != 'root-authorized':
        raise PermissionError(f'final evidence package is gated; expected {GATE} containing root-authorized')
    inventory_path = snapshot / 'snapshot-inventory.json'
    if inventory_path.stat().st_mtime_ns <= GATE.stat().st_mtime_ns:
        raise PermissionError('snapshot predates the release marker; prepare a fresh snapshot after root releases the gate')
    payload, inv, rows = check_snapshot(snapshot)
    if outdir.exists() and any(outdir.iterdir()):
        raise FileExistsError(f'refusing to overwrite non-empty package output: {outdir}')
    outdir.mkdir(parents=True, exist_ok=True)
    archive = make_tar(payload, rows)
    archive_name = 'module-qualification-evidence.tar.gz'
    archive_path = outdir / archive_name
    archive_path.write_bytes(archive)
    parts = []
    for offset in range(0, len(archive), MAX_PART):
        chunk = archive[offset:offset + MAX_PART]
        name = f'{archive_name}.part{offset // MAX_PART + 1:04d}'
        (outdir / name).write_bytes(chunk)
        parts.append({'path': name, 'bytes': len(chunk), 'sha256': sha(chunk)})
    members = {
        'schema': 'gobi.module-evidence-members/v1',
        'snapshotId': inv['snapshotId'],
        'memberCount': len(rows),
        'members': rows,
        'manifestIsExternal': True,
    }
    members_path = outdir / 'members.json'
    members_bytes = (json.dumps(members, sort_keys=True, indent=2) + '\n').encode()
    members_path.write_bytes(members_bytes)
    snapshot_copy = outdir / 'source-snapshot-inventory.json'
    shutil.copyfile(snapshot / 'snapshot-inventory.json', snapshot_copy)
    index = {
        'schema': 'gobi.module-evidence-package/v1',
        'snapshotId': inv['snapshotId'],
        'archive': {'path': archive_name, 'bytes': len(archive), 'sha256': sha(archive)},
        'partLimitBytes': MAX_PART,
        'parts': parts,
        'memberManifest': {'path': 'members.json', 'bytes': len(members_bytes), 'sha256': sha(members_bytes)},
        'snapshotInventory': {'path': snapshot_copy.name, 'bytes': snapshot_copy.stat().st_size, 'sha256': sha_file(snapshot_copy)},
    }
    (outdir / 'package-index.json').write_text(json.dumps(index, sort_keys=True, indent=2) + '\n', encoding='utf-8')
    verify_package(outdir / 'package-index.json')
    print(json.dumps({'sealed': True, 'outdir': str(outdir), 'archive_bytes': len(archive), 'archive_sha256': sha(archive), 'members': len(rows), 'parts': len(parts)}, sort_keys=True))


def verify_package(index_path: Path):
    outdir = index_path.parent
    idx = json.loads(index_path.read_text(encoding='utf-8'))
    archive_meta = idx['archive']
    chunks = []
    for part in idx['parts']:
        p = outdir / part['path']
        data = p.read_bytes()
        if len(data) != part['bytes'] or len(data) > idx['partLimitBytes'] or sha(data) != part['sha256']:
            raise ValueError(f'part verification failed: {part["path"]}')
        chunks.append(data)
    archive = b''.join(chunks)
    if len(archive) != archive_meta['bytes'] or sha(archive) != archive_meta['sha256']:
        raise ValueError('reassembled archive hash/length mismatch')
    if sha_file(outdir / archive_meta['path']) != archive_meta['sha256']:
        raise ValueError('whole archive copy mismatch')
    manifest_path = outdir / idx['memberManifest']['path']
    manifest_bytes = manifest_path.read_bytes()
    if len(manifest_bytes) != idx['memberManifest']['bytes'] or sha(manifest_bytes) != idx['memberManifest']['sha256']:
        raise ValueError('member manifest hash/length mismatch')
    manifest = json.loads(manifest_bytes)
    rows = manifest['members']
    if len(rows) != manifest['memberCount']:
        raise ValueError('member count mismatch')
    snapshot_meta = idx['snapshotInventory']
    snapshot_path = outdir / snapshot_meta['path']
    snapshot_bytes = snapshot_path.read_bytes()
    if len(snapshot_bytes) != snapshot_meta['bytes'] or sha(snapshot_bytes) != snapshot_meta['sha256']:
        raise ValueError('source snapshot inventory hash/length mismatch')
    snapshot_inv = json.loads(snapshot_bytes)
    if snapshot_inv.get('stable') is not True or snapshot_inv.get('payload_files') != rows:
        raise ValueError('member manifest does not match the stable source snapshot inventory')
    seen = set()
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tf:
        actual_names = []
        for member in tf:
            name = member.name
            path = PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or name in seen:
                raise ValueError(f'unsafe or duplicate archive member: {name}')
            seen.add(name)
            if not member.isfile():
                raise ValueError(f'non-regular archive member: {name}')
            f = tf.extractfile(member)
            data = f.read() if f else b''
            actual_names.append(name)
            row = next((x for x in rows if x['path'] == name), None)
            if row is None or len(data) != row['bytes'] or sha(data) != row['sha256']:
                raise ValueError(f'member content differs from manifest: {name}')
        expected_names = [r['path'] for r in rows]
        if actual_names != expected_names:
            raise ValueError('archive member sequence differs from sorted manifest')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--snapshot', type=Path)
    ap.add_argument('--outdir', type=Path)
    ap.add_argument('--inspect', action='store_true')
    ap.add_argument('--seal', action='store_true')
    ap.add_argument('--verify', type=Path)
    args = ap.parse_args()
    if args.verify:
        verify_package(args.verify)
        print('verified')
        return
    if not args.snapshot:
        ap.error('--snapshot is required unless --verify is used')
    payload, inv, rows = check_snapshot(args.snapshot)
    if args.inspect:
        print(json.dumps({'snapshotId': inv['snapshotId'], 'files': len(rows), 'bytes': sum(r['bytes'] for r in rows), 'stable': inv['stable']}, sort_keys=True))
        return
    if args.seal:
        if not args.outdir:
            ap.error('--outdir is required with --seal')
        write_package(args.snapshot, args.outdir)
        return
    ap.error('choose --inspect or --seal; sealing is release-gated')

if __name__ == '__main__':
    main()
