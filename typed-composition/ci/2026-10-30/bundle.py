#!/usr/bin/env python3
"""Package and verify the already-executed CI bytes; does not execute tests."""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import tarfile


def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--root', type=pathlib.Path, required=True)
    args = p.parse_args()
    root = args.root.resolve()
    ready = json.loads((root / 'artifact-ready.json').read_text())
    source = pathlib.Path(ready['extractedRoot'])
    files = sorted(p for p in (source / 'typed-composition/build').rglob('*') if p.is_file())
    assert len(files) == 75
    output = root / 'ci-executed-assets-and-traces.tar.xz'
    manifest = {'schema': 'gondola.pr10-ci-executed-bundle/v1',
                'sourceCommit': '42df6883337605d901a23e9fed874768c7ce1824',
                'sourceTree': ready['sourceTree'],
                'sourceZipSHA256': ready['zipSHA256'],
                'reportSHA256': ready['reportSHA256'], 'entries': []}
    started = dt.datetime.now(dt.timezone.utc).isoformat()
    with tarfile.open(output, 'w:xz', preset=1, format=tarfile.USTAR_FORMAT) as archive:
        for file in files:
            name = file.relative_to(source).as_posix()
            mode = 0o755 if file.name == 'composition-replay' else 0o644
            entry = {'path': name, 'bytes': file.stat().st_size,
                     'sha256': sha(file), 'mode': oct(mode)}
            manifest['entries'].append(entry)
            info = tarfile.TarInfo(name)
            info.size = entry['bytes']
            info.mode = mode
            info.mtime = info.uid = info.gid = 0
            with file.open('rb') as f:
                archive.addfile(info, f)
    expected = {x['path']: x for x in manifest['entries']}
    seen = set()
    with tarfile.open(output, 'r|xz') as archive:
        for info in archive:
            assert info.isfile() and info.name in expected and info.name not in seen
            entry = expected[info.name]
            assert info.size == entry['bytes'] and info.mode == int(entry['mode'], 8)
            with archive.extractfile(info) as f:
                assert hashlib.file_digest(f, 'sha256').hexdigest() == entry['sha256']
            seen.add(info.name)
    assert seen == set(expected)
    manifest.update(archive=output.name, archiveBytes=output.stat().st_size,
                    archiveSHA256=sha(output), verifiedEntries=len(seen))
    manifest_path = root / 'ci-executed-assets-and-traces.manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    execution = {'schema': 'gondola.pr10-ci-bundle-execution/v1',
                 'command': 'python bundle.py --root /tmp/gondola-pr10-ci-acceptance',
                 'startedUTC': started,
                 'finishedUTC': dt.datetime.now(dt.timezone.utc).isoformat(),
                 'status': 'verified', 'verifiedEntries': len(seen),
                 'archiveSHA256': manifest['archiveSHA256'],
                 'manifestSHA256': sha(manifest_path),
                 'notes': ['Packages existing executed bytes only; no source/build/test mutation.',
                           'Tar metadata is fixed; native replay receives executable mode.']}
    (root / 'bundle-execution.json').write_text(json.dumps(execution, indent=2) + '\n')
    print(json.dumps(execution))


if __name__ == '__main__':
    main()
