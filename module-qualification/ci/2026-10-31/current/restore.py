#!/usr/bin/env python3
"""Verify published segments and restore the executed Go verifier and demo."""
import argparse,hashlib,io,json,pathlib,tarfile
base=pathlib.Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
def matches(data,row):
 assert len(data)==row['bytes'] and sha(data)==row['sha256'],str(row.get('path',row.get('name','digest')))
def segmented(label):
 idx=json.loads((base/(label+'-parts.json')).read_text());chunks=[]
 for row in idx['parts']:
  b=(base/label/row['name']).read_bytes();matches(b,row);chunks.append(b)
 raw=b''.join(chunks);matches(raw,idx['archive']);return raw,idx
def readtar(raw):
 data={}
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tf:
  for item in tf:
   name=item.name;p=pathlib.PurePosixPath(name)
   assert item.isfile() and not p.is_absolute() and '..' not in p.parts and name==str(p) and name not in data,name
   data[name]=tf.extractfile(item).read()
 return data
def membercheck(data,rows):
 expected={r['path']:r for r in rows};assert len(expected)==len(rows) and set(data)==set(expected),'member inventory'
 for name,row in expected.items():matches(data[name],row)
def write(data,out):
 assert not out.exists(),'destination already exists: '+str(out)
 out.mkdir(parents=True)
 for name,b in data.items():
  target=out/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
p=argparse.ArgumentParser();p.add_argument('destination',type=pathlib.Path);p.add_argument('--audit',action='store_true');args=p.parse_args();out=args.destination.resolve()
if args.audit:
 raw,idx=segmented('audit');mb=(base/'audit-members.json').read_bytes();matches(mb,idx['manifest']);rows=json.loads(mb)['members'];data=readtar(raw);membercheck(data,rows);write(data,out);print(json.dumps({'status':'passed','auditMembers':len(data),'archiveSHA256':sha(raw)}));raise SystemExit(0)
raw,idx=segmented('bundle');mb=(base/'bundle.manifest.json').read_bytes();matches(mb,idx['manifest']);m=json.loads(mb);data=readtar(raw)
indexrow=m['index'];matches(data[indexrow['path']],indexrow);index=json.loads(data[indexrow['path']]);rows=index['members']+[indexrow,m['executionSnapshot']];membercheck(data,rows);assert len(data)==m['memberCount'] and sum(map(len,data.values()))==m['expandedBytes']
runtime=data['bundle/upstream/runtime.tar.gz'];matches(runtime,m['upstreamRuntimeArchive']);runtime_mb=data['bundle/upstream/runtime.manifest.json'];assert sha(runtime_mb)==m['upstreamRuntimeArchive']['manifestSHA256'];runtime_m=json.loads(runtime_mb);inner=readtar(runtime);membercheck(inner,runtime_m['members'])
write(data,out);write(inner,out/'runtime')
print(json.dumps({'status':'passed','sourceCommit':m['sourceCommit'],'bundleMembers':len(data),'runtimeMembers':len(inner),'archiveSHA256':sha(raw),'destination':str(out)}))
