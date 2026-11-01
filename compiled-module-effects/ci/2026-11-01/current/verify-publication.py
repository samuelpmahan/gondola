#!/usr/bin/env python3
"""Verify the immutable payload; Git operations are read-only. No dependencies."""
import argparse,hashlib,json,pathlib,subprocess
ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('--git-dir',required=True)
ap.add_argument('--commit',default='3df075a3cee25498b144e0d166c71e841cda50af')
ap.add_argument('--expected',type=pathlib.Path,default=pathlib.Path(__file__).with_name('expected-publication.json'))
a=ap.parse_args();prefix='compiled-module-effects/ci/2026-11-01/current/'
def git(*xs):return subprocess.check_output(['git',f'--git-dir={a.git_dir}',*xs])
rows=json.loads(a.expected.read_bytes())['files'];expected={}
for r in rows:
 n=r['path'];p=pathlib.PurePosixPath(n)
 assert not p.is_absolute() and str(p)==n and '..' not in p.parts,n
 assert n not in expected,n
 expected[n]=r
actual={}
for record in git('ls-tree','-r','-z',a.commit,'--',prefix).split(b'\0'):
 if not record:continue
 header,name=record.split(b'\t',1);mode,kind,oid=header.decode().split();name=name.decode()
 assert kind=='blob' and mode in ('100644','100755') and name.startswith(prefix),name
 actual[name[len(prefix):]]=oid
assert set(actual)==set(expected),'Published payload file set differs from the closed expected inventory'
for n,r in expected.items():
 b=git('show',f'{a.commit}:{prefix}{n}')
 assert len(b)==r['bytes'] and hashlib.sha256(b).hexdigest()==r['sha256'],n
manifest=json.loads(git('show',f'{a.commit}:{prefix}bundle.manifest.json'))
source=manifest['sourceCommit'];pins=manifest['sourcePins']
for n,r in pins.items():
 b=git('show',f'{source}:{n}');assert len(b)==r['bytes'] and hashlib.sha256(b).hexdigest()==r['sha256'],n
assert subprocess.run(['git',f'--git-dir={a.git_dir}','merge-base','--is-ancestor',source,a.commit],check=False).returncode==0
changes=git('diff-tree','--no-commit-id','--name-only','-r','-z',source,a.commit).split(b'\0')
assert all(not n or n.decode().startswith(prefix) for n in changes),'Changes outside evidence prefix'
print(json.dumps({'status':'passed','payloadCommit':a.commit,'sourceCommit':source,'payloadFiles':len(expected),'sourcePins':len(pins),'gitOperationsReadOnly':True}))
