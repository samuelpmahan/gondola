#!/usr/bin/env python3
"""Run archived Go source's fixed native scenario and compare captured bytes."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-root', required=True)
    parser.add_argument('--extraction-root', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--go', default='/tmp/gondola-go/go/bin/go')
    parser.add_argument('--log-dir', required=True)
    args = parser.parse_args()
    source = pathlib.Path(args.source_root).resolve(strict=True)
    extraction = pathlib.Path(args.extraction_root).resolve(strict=True)
    manifest = json.loads(pathlib.Path(args.manifest).read_text(encoding='utf-8'))
    logs = pathlib.Path(args.log_dir).resolve()
    logs.mkdir(parents=True, exist_ok=True)
    scenario = source / 'fixtures/compiled/moduleparent/scenario.json'
    raw_capture = extraction / 'logs/native-trace.stdout.bin'
    normalized_capture = extraction / 'native/native-trace.json'
    if not scenario.is_file() or not raw_capture.is_file() or not normalized_capture.is_file():
        raise SystemExit('archive is missing source scenario or both native trace captures')
    expected_source = manifest.get('sourceCommit')
    if not isinstance(expected_source, str) or not re.fullmatch(r'[0-9a-f]{40}', expected_source):
        raise SystemExit('manifest has invalid sourceCommit')
    before = {}
    for rel, pin in manifest['sourcePinsBefore'].items():
        path = source / pathlib.PurePosixPath(rel)
        data = path.read_bytes()
        if len(data) != pin['bytes'] or sha(data) != pin['sha256']:
            raise SystemExit(f'archived source pin mismatch before execution: {rel}')
        before[rel] = (len(data), sha(data))

    cache = pathlib.Path(tempfile.mkdtemp(prefix='gobi-econsumer-gocache-'))
    tmp = pathlib.Path(tempfile.mkdtemp(prefix='gobi-econsumer-gotmp-'))
    go = str(pathlib.Path(args.go).resolve(strict=True))
    command = [go, 'run', './cmd/compiled-modules-native', '--script', 'fixtures/compiled/moduleparent/scenario.json']
    env = {
        'PATH': f"{pathlib.Path(go).parent}:/usr/bin:/bin",
        'GOTOOLCHAIN': 'local',
        'GOENV': 'off',
        'GOFLAGS': '-buildvcs=false',
        'GOWORK': 'off',
        'GOPROXY': 'off',
        'GOSUMDB': 'off',
        'GOCACHE': str(cache),
        'GOTMPDIR': str(tmp),
    }
    try:
        go_version = subprocess.run([go, 'version'], cwd=source, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout.decode().strip()
        result = subprocess.run(command, cwd=source, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    finally:
        shutil.rmtree(cache, ignore_errors=True)
        shutil.rmtree(tmp, ignore_errors=True)
    out_path = logs / 'archived-native.stdout.bin'
    err_path = logs / 'archived-native.stderr.bin'
    out_path.write_bytes(result.stdout)
    err_path.write_bytes(result.stderr)
    command_path = logs / 'archived-native.command.json'
    command_record = {
        'argv': command,
        'cwd': str(source),
        'environment': env,
        'exitCode': result.returncode,
        'stdout': {'path': str(out_path), 'bytes': len(result.stdout), 'sha256': sha(result.stdout)},
        'stderr': {'path': str(err_path), 'bytes': len(result.stderr), 'sha256': sha(result.stderr)},
    }
    command_path.write_text(json.dumps(command_record, indent=2) + '\n')
    if result.returncode != 0:
        raise SystemExit(f'archived native command failed; see {err_path}')
    parsed = json.loads(result.stdout.decode('utf-8', 'strict'))
    raw_bytes = raw_capture.read_bytes()
    normalized_bytes = normalized_capture.read_bytes()
    after = {}
    for rel, pin in manifest['sourcePinsBefore'].items():
        data = (source / pathlib.PurePosixPath(rel)).read_bytes()
        after[rel] = (len(data), sha(data))
        if after[rel] != before[rel]:
            raise SystemExit(f'archived source changed during native execution: {rel}')
    if parsed.get('schema') != 'gobi.compiled-modules-native/v1' or parsed.get('name') != 'independent-module-pair-v1' or len(parsed.get('events', [])) != 24 or len(parsed.get('steps', [])) != 16:
        raise SystemExit('replayed native trace does not match the fixed scenario envelope')
    if result.stdout != raw_bytes:
        raise SystemExit('replayed Go stdout differs byte-for-byte from archived native command capture')
    if json.loads(normalized_bytes.decode('utf-8')) != parsed:
        raise SystemExit('replayed native trace differs semantically from normalized archive capture')
    summary = {
        'schema': 'gobi.compiled-modules-archived-native-replay/v1',
        'status': 'passed',
        'sourceCommit': expected_source,
        'goVersion': go_version,
        'scenarioPath': str(scenario),
        'scenarioSHA256': sha(scenario.read_bytes()),
        'command': command_record,
        'rawCapturedStdoutPath': str(raw_capture),
        'rawCapturedStdoutSHA256': sha(raw_bytes),
        'rawByteIdentical': True,
        'normalizedCapturePath': str(normalized_capture),
        'normalizedCaptureSHA256': sha(normalized_bytes),
        'normalizedJSONMatches': True,
        'sourcePinsBeforeAfterEqual': True,
        'sourcePinCount': len(before),
        'nativeEvents': len(parsed['events']),
        'nativeUpdates': len(parsed['steps']),
        'offlineGoEnvironment': {'GOPROXY': 'off', 'GOSUMDB': 'off', 'GOTOOLCHAIN': 'local'},
    }
    summary_path = logs / 'archived-native-replay.json'
    summary_path.write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, sort_keys=True))


if __name__ == '__main__':
    main()
