import hashlib, json, os, shutil, tarfile
from pathlib import Path

coord = Path('/workspace/scratch/39a56936f173/native-module-coordination')
repo = Path('/workspace/scratch/39a56936f173/gondola')
attempt = repo / 'module-qualification/output/attempts/attempt-20261031T230513555Z-8'
out = coord / 'rawlogs/E-RUN/finalization'
manifest_path = attempt / 'module-qualification-evidence.manifest.json'
manifest_bytes = manifest_path.read_bytes()
manifest = json.loads(manifest_bytes)
archive_path = attempt / manifest['archive']['path']
archive_bytes = archive_path.read_bytes()
archive_sha = hashlib.sha256(archive_bytes).hexdigest()
assert archive_sha == manifest['archive']['sha256']
assert len(archive_bytes) == manifest['archive']['bytes']

with tarfile.open(archive_path, 'r:gz') as tf:
    names = tf.getnames()
    assert len(names) == manifest['memberCount']
    assert len(set(names)) == len(names)
    archived_command_paths = sorted(n for n in names if n.startswith('bundle/commands/') and n.endswith('.command.json'))
    archived_commands = [json.load(tf.extractfile(name)) for name in archived_command_paths]
    archive_summary = json.load(tf.extractfile('bundle/summary.json'))

assert len(archived_commands) == manifest['commandCount'] == archive_summary['commandCount'] == 18
assert all(x.get('exitCode') == 0 for x in archived_commands)
archived_names = sorted(Path(x).name.removesuffix('.command.json') for x in archived_command_paths)

live_dir = attempt / 'bundle/commands'
live_paths = sorted(live_dir.glob('*.command.json'))
live_rows = [json.loads(p.read_bytes()) for p in live_paths]
assert len(live_rows) == 20
assert all(x.get('exitCode') == 0 for x in live_rows)
live_names = sorted(p.name.removesuffix('.command.json') for p in live_paths)
post_names = sorted(set(live_names) - set(archived_names))
assert post_names == ['git-final-head', 'git-final-status']
assert set(archived_names).issubset(live_names)

copied = []
copy_root = out / 'postarchive-git-checks'
for name in post_names:
    for suffix in ('.command.json', '.stdout.bin', '.stderr.bin'):
        src = live_dir / f'{name}{suffix}'
        dst = copy_root / src.name
        shutil.copyfile(src, dst)
        data = dst.read_bytes()
        copied.append({'path': f'postarchive-git-checks/{dst.name}', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})

result = {
  'schema': 'gobi.module-qualification-command-scope-check/v1',
  'status': 'passed',
  'sourceCommit': manifest['sourceCommit'],
  'attempt': manifest['attempt'],
  'outerArchive': {'path': str(archive_path), 'bytes': len(archive_bytes), 'sha256': archive_sha, 'members': len(names)},
  'manifest': {'path': str(manifest_path), 'bytes': len(manifest_bytes), 'sha256': hashlib.sha256(manifest_bytes).hexdigest()},
  'archivedCommandCount': len(archived_commands),
  'archivedCommandNames': archived_names,
  'archivedAllExitCodeZero': True,
  'workingAttemptCommandCount': len(live_rows),
  'postArchiveCommandNames': post_names,
  'postArchiveCommandsAllExitCodeZero': True,
  'postArchiveCommandCopies': copied,
  'interpretation': 'The immutable archive and its summary both contain 18 commands. Two successful final Git checks were recorded in the attempt directory after archive creation and are copied beside this check.'
}
(out / 'command-inventory.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
