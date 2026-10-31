#!/usr/bin/env python3
"""Verify fresh React/DOM compiler outputs and old-gate preservation."""
import hashlib
import json
import os
import subprocess
from pathlib import Path

ROOT = Path.cwd()
EVIDENCE = ROOT / 'compiled-methods/evidence/repairs/r-compiler'
ARTIFACTS = ROOT / 'compiled-methods/artifacts/repaired-compiler-gate'
PACKAGE = 'github.com/samuelpmahan/gondola/fixtures/compiled/methods'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def file_sha(path):
    return sha(Path(path).read_bytes())

def load(path):
    return json.loads(Path(path).read_text())

def command(args, cwd):
    env = {**os.environ, 'GOTOOLCHAIN':'go1.27.3', 'GOFLAGS':'-buildvcs=false'}
    completed = subprocess.run(args, cwd=cwd, text=True, capture_output=True, check=True, env=env)
    return completed.stdout.strip()

def inventory(output_dir):
    paths = sorted(p.relative_to(output_dir).as_posix() for p in output_dir.rglob('*') if p.is_file())
    return [{'path': rel, 'bytes': (output_dir / rel).stat().st_size, 'sha256': file_sha(output_dir / rel)} for rel in paths]

# Pin the exact compiler environment used to issue real CLI builds.
go_version = command(['/tmp/gondola-go/bin/go', 'version'], ROOT / 'compiled-frontend')
node_version = command(['/tmp/gondola-node22/node_modules/node/bin/node', '--version'], ROOT)
goscript = json.loads(command(['/tmp/gondola-go/bin/go', 'list', '-m', '-json', 'github.com/s4wave/goscript'], ROOT / 'compiled-frontend'))
if 'go1.27.3' not in go_version or node_version != 'v22.23.4' or goscript.get('Version') != 'v0.6.2':
    raise SystemExit(f'unexpected compiler toolchain: {go_version}; {node_version}; {goscript.get("Version")}')

backend_records = {}
for backend in ('react', 'dom'):
    evidence_dir = EVIDENCE / 'builds' / backend
    request_path = evidence_dir / 'request.json'
    result_path = evidence_dir / 'build-result.json'
    stderr_path = evidence_dir / 'stderr.log'
    request = load(request_path)
    result = load(result_path)
    output_dir = ARTIFACTS / backend / 'output'
    manifest = load(output_dir / 'buildmanifest.json')
    if request['backend'] != backend or request['outputDir'] != str(output_dir):
        raise SystemExit(f'{backend}: request metadata does not point to its isolated output')
    if result.get('ok') is not True or len(result.get('apps', [])) != 1 or result.get('diagnostics') != []:
        raise SystemExit(f'{backend}: Go CLI result is not a clean one-app success')
    if len(result['outputs']) != 67:
        raise SystemExit(f'{backend}: Go CLI reported {len(result["outputs"])} outputs, expected 67')
    app = result['apps'][0]
    if app['packagePath'] != PACKAGE or manifest['apps'][0]['packagePath'] != PACKAGE:
        raise SystemExit(f'{backend}: methods package was not built')
    if manifest['apps'][0]['backend'] != backend:
        raise SystemExit(f'{backend}: buildmanifest backend metadata mismatch')
    inv = inventory(output_dir)
    if len(inv) != len(result['outputs']):
        raise SystemExit(f'{backend}: actual file count differs from Go CLI output inventory')
    actual_by_path = {item['path']: item for item in inv}
    cli_by_path = {item['path']: item for item in result['outputs']}
    if set(actual_by_path) != set(cli_by_path):
        raise SystemExit(f'{backend}: actual and CLI output paths differ')
    for rel, item in actual_by_path.items():
        if item['sha256'] != cli_by_path[rel]['sha256'] or item['bytes'] != cli_by_path[rel]['bytes']:
            raise SystemExit(f'{backend}: CLI output hash/size mismatch at {rel}')
    expected_paths = {
        'appIR': f'apps/methods-0cac42b0a982/app-ir.json',
        'module': f'apps/methods-0cac42b0a982/gobi-compiled.mjs',
        'encoder': f'apps/methods-0cac42b0a982/encoder.mjs',
        'components': f'apps/methods-0cac42b0a982/components.gen.mjs',
    }
    if any(manifest['apps'][0][key] != path for key, path in expected_paths.items()):
        raise SystemExit(f'{backend}: manifest module/encoder/AppIR paths changed')
    inv_file = evidence_dir / 'output-inventory.json'
    inv_file.write_text(json.dumps({'schema':'gobi.r-compiler-output-inventory/v1','backend':backend,'files':inv},indent=2)+'\n')
    backend_records[backend] = {
        'request': {'path': request_path.relative_to(ROOT).as_posix(), 'sha256': file_sha(request_path), 'bytes': request_path.stat().st_size},
        'build_result': {'path': result_path.relative_to(ROOT).as_posix(), 'sha256': file_sha(result_path), 'bytes': result_path.stat().st_size, 'ok': result['ok'], 'app_count': len(result['apps']), 'output_count': len(result['outputs']), 'diagnostics': result['diagnostics']},
        'stderr_log': {'path': stderr_path.relative_to(ROOT).as_posix(), 'sha256': file_sha(stderr_path), 'bytes': stderr_path.stat().st_size},
        'manifest': {'path': (output_dir/'buildmanifest.json').relative_to(ROOT).as_posix(), 'sha256': file_sha(output_dir/'buildmanifest.json'), 'backend': manifest['apps'][0]['backend'], 'package_path': manifest['apps'][0]['packagePath'], 'module': manifest['apps'][0]['module'], 'encoder': manifest['apps'][0]['encoder'], 'app_ir': manifest['apps'][0]['appIR'], 'role_bindings': manifest['apps'][0]['roleBindings']},
        'output_inventory': {'path': inv_file.relative_to(ROOT).as_posix(), 'sha256': file_sha(inv_file), 'file_count': len(inv), 'raw_bundle_sha256': actual_by_path[expected_paths['module']]['sha256'], 'files': inv},
        'app_ir_sha256': actual_by_path[expected_paths['appIR']]['sha256'],
        'encoder_sha256': actual_by_path[expected_paths['encoder']]['sha256'],
        'components_sha256': actual_by_path[expected_paths['components']]['sha256'],
    }

react = ARTIFACTS / 'react' / 'output'
dom = ARTIFACTS / 'dom' / 'output'
react_files = {item['path']: item for item in backend_records['react']['output_inventory']['files']}
dom_files = {item['path']: item for item in backend_records['dom']['output_inventory']['files']}
if set(react_files) != set(dom_files):
    raise SystemExit('React/DOM output paths do not match')
allowed_differences = {'buildmanifest.json', 'apps/methods-0cac42b0a982/gobi-compiled.mjs'}
different = [rel for rel in sorted(react_files) if react_files[rel]['sha256'] != dom_files[rel]['sha256']]
if set(different) - allowed_differences:
    raise SystemExit(f'backend-neutral output bytes differ unexpectedly: {sorted(set(different)-allowed_differences)}')
if backend_records['react']['app_ir_sha256'] != backend_records['dom']['app_ir_sha256']:
    raise SystemExit('AppIR differs between backend requests')
if backend_records['react']['encoder_sha256'] != backend_records['dom']['encoder_sha256']:
    raise SystemExit('typed encoder differs between backend requests')
if backend_records['react']['components_sha256'] != backend_records['dom']['components_sha256']:
    raise SystemExit('generated role binding metadata differs between backend requests')

# Verify the original 138-file archive and every current pre-repair gate member remain untouched.
original_meta = load(ROOT / 'compiled-methods/evidence/builds/original-compiler-gate.json')
archive_path = ROOT / 'compiled-methods/evidence/builds' / original_meta['archive']
if archive_path.stat().st_size != original_meta['archiveBytes'] or file_sha(archive_path) != original_meta['archiveSha256']:
    raise SystemExit('original compiler-gate archive changed')
for member in original_meta['members']:
    path = ROOT / member['path']
    if path.stat().st_size != member['bytes'] or file_sha(path) != member['sha256']:
        raise SystemExit(f'original compiler-gate member changed: {member["path"]}')

source_paths = [
    'compiled-frontend/analyze/project.go',
    'compiled-frontend/analyze/method_selection_test.go',
    'compiled-frontend/go.mod',
    'compiled-frontend/go.sum',
    'fixtures/compiled/methods/app.go',
    'fixtures/compiled/methods/view.go',
]
source_pins = {path:{'sha256':file_sha(ROOT/path),'bytes':(ROOT/path).stat().st_size} for path in source_paths}
result = {
    'schema':'gobi.r-compiler-build-audit/v1',
    'toolchain':{'go':go_version,'node':node_version,'goscript_module':goscript},
    'builds':backend_records,
    'backend_neutral_comparison':{
        'same_output_path_set':True,
        'exactly_allowed_differences':sorted(different),
        'app_ir_byte_identical':True,
        'encoder_byte_identical':True,
        'components_role_metadata_byte_identical':True,
        'forwarders_and_emitted_typescript_byte_identical':all(react_files[p]['sha256']==dom_files[p]['sha256'] for p in react_files if p.startswith('forwarders/') or p.startswith('emitted-ts/')),
        'raw_bundle_hashes_separate':True,
        'bundle_normalization_claim':False,
    },
    'original_gate_preservation':{
        'archive_sha256':file_sha(archive_path),
        'archive_bytes':archive_path.stat().st_size,
        'current_members_match':True,
        'member_count':len(original_meta['members']),
    },
    'source_pins':source_pins,
    'limits':[
        'This is a fresh CLI build check for the methods fixture after the analyzer change, not a browser/runtime run.',
        'Raw React and DOM GoScript bundle hashes are kept separate; no normalized or cross-directory bundle-byte claim is made.',
        'Compatibility evidence is the targeted compiled-frontend analyzer/build/cmd/emit package set; no root-wide ./... claim is made.',
    ],
}
if not result['backend_neutral_comparison']['forwarders_and_emitted_typescript_byte_identical']:
    raise SystemExit('forwarder/TypeScript bytes differ between backend requests')
output=EVIDENCE/'build-inventory.json'
output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({
    'schema':result['schema'],
    'go':go_version,
    'node':node_version,
    'goscript':goscript.get('Version'),
    'react_outputs':backend_records['react']['output_inventory']['file_count'],
    'dom_outputs':backend_records['dom']['output_inventory']['file_count'],
    'backend_neutral_differences':different,
    'react_raw_bundle_sha256':backend_records['react']['output_inventory']['raw_bundle_sha256'],
    'dom_raw_bundle_sha256':backend_records['dom']['output_inventory']['raw_bundle_sha256'],
    'app_ir_sha256':backend_records['react']['app_ir_sha256'],
    'encoder_sha256':backend_records['react']['encoder_sha256'],
    'original_archive_preserved':True,
    'build_inventory':output.relative_to(ROOT).as_posix(),
},indent=2))
