#!/usr/bin/env python3
"""Read-only native protocol and evidence-pin validator for E-FIX-RELEASE-PATHS."""
import hashlib
import json
from pathlib import Path
import sys

root=Path.cwd()
receipt=json.loads((root/'compiled-children/coordination/receipts/E-FIX-RELEASE-PATHS.json').read_text())
sys.path.insert(0,str(root/'compiled-children/coordination'))
from probe import load_state, validate_receipt  # noqa: E402
state=load_state(root/'compiled-children/coordination/state.json')
validate_receipt(receipt,state['jobs']['E-FIX-RELEASE-PATHS'],'N2')
skip={
 'compiled-children/coordination/rawlogs/N2-E-FIX-RELEASE-PATHS-receipt-validation.log',
 'compiled-children/coordination/rawlogs/N2-E-FIX-RELEASE-PATHS-receipt-validation.exit.log',
}
def verify(path,expected,size=None):
 if path in skip: return
 f=root/path
 if not f.is_file(): raise AssertionError(f'missing pinned file: {path}')
 b=f.read_bytes()
 if hashlib.sha256(b).hexdigest()!=expected: raise AssertionError(f'SHA mismatch: {path}')
 if size is not None and len(b)!=size: raise AssertionError(f'byte-count mismatch: {path}')
def walk(value):
 if isinstance(value,dict):
  if isinstance(value.get('path'),str) and isinstance(value.get('sha256'),str):
   verify(value['path'],value['sha256'],value.get('bytes'))
  for child in value.values(): walk(child)
 elif isinstance(value,list):
  for child in value: walk(child)
walk(receipt)
for path,expected in receipt['sourceSha256'].items():
 verify(path,expected)
report=receipt['report']
print('native probe identity/outcome validation: PASS (E-FIX-RELEASE-PATHS/N2)')
print('current README/runner and referenced preservation/rawlog pins: PASS')
print(f'report bytes: {report["bytes"]}; SHA-256: {report["sha256"]}')
