#!/usr/bin/env python3
"""Validate both real CLI outputs against their manifests and on-disk hashes."""
import hashlib
import json
from pathlib import Path
import sys
ROOT=Path.cwd()
PACKAGE='github.com/samuelpmahan/gondola/fixtures/compiled/publications'
BUILD=ROOT/'compiled-publications/compiler/build'
VARIANT=sys.argv[1] if len(sys.argv)>1 else 'proof'
if VARIANT not in ('initial','repaired','proof'):
    raise SystemExit('usage: python3 compiled-publications/compiler/verify-builds.py [initial|repaired|proof]')
def digest(path):
    h=hashlib.sha256(); size=0
    with path.open('rb') as f:
        while True:
            block=f.read(1024*1024)
            if not block: break
            size+=len(block);h.update(block)
    return size,h.hexdigest()
results={}
for backend in ('react','dom'):
    suffix='' if VARIANT=='initial' else f'-{VARIANT}'
    root=BUILD/(backend if VARIANT=='initial' else f'{backend}-{VARIANT}')
    result=json.loads((BUILD/f'{backend}{suffix}.stdout.json').read_text())
    assert result.get('schema')=='gobi.build-result/v1', (backend,result.get('schema'))
    assert result.get('ok') is True, (backend,result.get('diagnostics'))
    assert result.get('diagnostics')==[], (backend,result.get('diagnostics'))
    assert len(result.get('apps',[]))==1 and result['apps'][0]['packagePath']==PACKAGE
    manifest_path=root/'buildmanifest.json'
    manifest=json.loads(manifest_path.read_text())
    assert manifest['schema']=='gobi.build-manifest/v1' and len(manifest['apps'])==1
    app=manifest['apps'][0]
    assert app['backend']==backend and app['packagePath']==PACKAGE
    assert [binding['role'] for binding in app['roleBindings']]==['init','update','view']
    expected_outputs={row['path']:row for row in result['outputs']}
    assert len(expected_outputs)==len(result['outputs'])
    actual_outputs={}
    for rel in expected_outputs:
        size,sha=digest(root/rel)
        actual_outputs[rel]={'bytes':size,'sha256':sha}
        assert size==expected_outputs[rel]['bytes'], (backend,rel,'bytes')
        assert sha==expected_outputs[rel]['sha256'], (backend,rel,'sha256')
    assert set(expected_outputs)==set(actual_outputs)
    app_ir=json.loads((root/app['appIR']).read_text())
    assert len(app_ir['components'])==1 and app_ir['components'][0]['packagePath']==PACKAGE
    assert app_ir['components'][0]['stateType']
    assert {'numeric.safe-integer','numeric.float64'}.issubset(set(app_ir['components'][0]['capabilities']))
    for name in ('Parent','Children','NextGeneration','Input','Publications','NextPublication','LastDecision'):
        assert any(field['name']==name for field in next(t for t in app_ir['types'] if t['id']==app_ir['components'][0]['stateType'])['fields']), name
    results[backend]={
       'outputRoot':str(root.relative_to(ROOT)),
       'manifestPath':str((root/'buildmanifest.json').relative_to(ROOT)),
       'manifestBytes':(root/'buildmanifest.json').stat().st_size,
       'manifestSha256':digest(root/'buildmanifest.json')[1],
       'app':app,
       'appIRSha256':digest(root/app['appIR'])[1],
       'encoderSha256':digest(root/app['encoder'])[1],
       'moduleSha256':digest(root/app['module'])[1],
       'componentsSha256':digest(root/app['components'])[1],
       'outputCount':len(expected_outputs),
       'outputsMatchCLIResult':True,
    }
assert results['react']['appIRSha256']==results['dom']['appIRSha256']
assert results['react']['encoderSha256']==results['dom']['encoderSha256']
summary={'schema':'gobi.publications-compiler-build-validation/v1','packagePath':PACKAGE,'backends':results,'sharedAppIRAndEncoderIdentical':True}
out=BUILD/f'resolved-builds-{VARIANT}.json'
out.write_text(json.dumps(summary,indent=2)+'\n')
print(f"both GoScript CLI builds validated; resolved AppIR/module/encoder paths in {out.relative_to(ROOT)}")
