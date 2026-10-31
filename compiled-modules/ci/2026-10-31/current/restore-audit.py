#!/usr/bin/env python3
"""Reassemble and verify the audit archive; does not extract it."""
import hashlib, importlib.util, json, pathlib
root=pathlib.Path(__file__).resolve().parent/'audit'
index=json.loads((root/'package-index.json').read_text()); chunks=[]
for row in index['parts']:
 data=(root/row['path']).read_bytes()
 assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256'],row['path']
 chunks.append(data)
archive=b''.join(chunks);meta=index['archive'];assert len(archive)==meta['bytes'] and hashlib.sha256(archive).hexdigest()==meta['sha256']
target=root/meta['path']
if target.exists(): assert target.read_bytes()==archive,'existing archive differs'
else: target.write_bytes(archive)
spec=importlib.util.spec_from_file_location('audit_verifier',root/'assemble_evidence.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
assert module.verify_package(root/'package-index.json')
print(json.dumps({'status':'passed','archive':str(target),'bytes':len(archive),'sha256':meta['sha256']}))
