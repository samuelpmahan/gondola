#!/usr/bin/env python3
"""Hash frozen publications fixture and existing compiler dependency inputs."""
import hashlib
import json
from pathlib import Path
import sys
ROOT=Path.cwd()
if len(sys.argv)!=2:
    raise SystemExit('usage: python3 compiled-publications/compiler/source-pins.py <output.json>')
paths=[
 'fixtures/compiled/publications/app.go',
 'fixtures/compiled/publications/view.go',
 'fixtures/compiled/publications/app_test.go',
 'fixtures/compiled/publications/scenario.json',
 'compiled-publications/CONTRACT.md',
 'go.mod',
 'compiled-frontend/go.mod','compiled-frontend/go.sum',
 'compiled-frontend/package.json','compiled-frontend/package-lock.json',
 'compiled-frontend/cmd/gobi-build/main.go',
 'compiled-frontend/build/pipeline.go',
 'compiled-frontend/build/request.go',
 'compiled-frontend/analyze/analyze.go',
 'compiled-frontend/analyze/analyze_test.go',
 'compilercontract/contract.go',
 'compilercontract/value.go',
 'compilercontract/js_encoder.go',
 'compiled-publications/compiler/go.mod',
 'compiled-publications/compiler/source-pins.py',
 'compiled-publications/compiler/verify-builds.py',
 'compiled-publications/compiler/encoder-probe.mjs',
]
rows=[]
for rel in paths:
    path=ROOT/rel
    h=hashlib.sha256(); size=0
    with path.open('rb') as stream:
        while True:
            block=stream.read(1024*1024)
            if not block: break
            size+=len(block); h.update(block)
    rows.append({'path':rel,'bytes':size,'sha256':h.hexdigest()})
out={'schema':'gobi.publications-compiler-source-pins/v1','paths':rows}
target=ROOT/sys.argv[1]
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(out,indent=2)+'\n')
print(f'pinned {len(rows)} source/toolchain inputs to {sys.argv[1]}')
