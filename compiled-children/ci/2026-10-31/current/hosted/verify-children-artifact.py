import pathlib,json,zipfile,hashlib,tarfile,subprocess,datetime,sys
p=pathlib.Path(__file__).resolve().parent
repo=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path.cwd()
sha=lambda b:hashlib.sha256(b).hexdigest()
zb=(p/'children.zip').read_bytes()
assert len(zb)==153482729 and sha(zb)=='0c0ae308fa6089525c77192bf5cb17a0b9ee49325cb778b33b11d7544e6886ad'
del zb
z=zipfile.ZipFile(p/'children.zip')
assert z.testzip() is None
raw=z.read('compiled-children/coordination/receipts/E-DELIVERY.json');r=json.loads(raw)
assert r['status']=='passed' and not r['failures'] and not r['mismatches']
assert len(r['stages'])==10 and all(x['status']=='passed' for x in r['stages'])
assert r['sourceBefore']==r['sourceAfter'] and r['sourcePinsMatch']
source='462a9827bfe1980600456b00d0a67843eaa9756d';pins=[]
for pin in r['sourceBefore']:
 b=subprocess.check_output(['git','show',source+':'+pin['path']],cwd=repo)
 assert len(b)==pin['bytes'] and sha(b)==pin['sha256'],pin['path']
 pins.append(pin['path'])
a=r['archive'];mb=z.read(a['manifest']['path']);assert len(mb)==a['manifest']['bytes'] and sha(mb)==a['manifest']['sha256'];m=json.loads(mb)
ab=z.read(a['path']);assert len(ab)==a['bytes'] and sha(ab)==a['sha256'];ap=p/'children-final.tar.gz';ap.write_bytes(ab)
expected={x['path']:x for x in m['members']};assert len(expected)==417 and len(expected)==len(m['members'])
seen=set();n=0
with tarfile.open(ap,'r|gz') as t:
 for member in t:
  assert member.isfile() and member.name in expected and member.name not in seen,member.name
  e=expected[member.name];h=hashlib.sha256();size=0;f=t.extractfile(member)
  while True:
   b=f.read(1024*1024)
   if not b:break
   h.update(b);size+=len(b)
  assert size==e['bytes'] and h.hexdigest()==e['sha256'],member.name
  seen.add(member.name);n+=size
assert seen==set(expected)
for name,b in [('children-E-DELIVERY.json',raw),('children-archive-inventory.json',mb)]:p.joinpath(name).write_bytes(b)
summary={'schema':'gobi.children-hosted-artifact-independent-check/v1','verifiedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':source,'run':41211302195,'job':124566695902,'artifact':13046728760,'status':'passed','versions':r['versions'],'zip':{'bytes':153482729,'sha256':'0c0ae308fa6089525c77192bf5cb17a0b9ee49325cb778b33b11d7544e6886ad','members':len(z.infolist()),'CRCVerified':True},'receipt':{'bytes':len(raw),'sha256':sha(raw)},'archive':{'bytes':len(ab),'sha256':sha(ab),'members':len(seen),'uncompressedBytes':n,'allMemberBytesVerified':True},'manifest':{'bytes':len(mb),'sha256':sha(mb)},'sourcePins':{'count':len(pins),'allMatchExactGitCommit':True,'beforeAfterIdentical':True},'stages':r['stages'],'failures':r['failures'],'mismatches':r['mismatches'],'coverage':'Fixed42events/38updates/39checkpoints; seeds20261031/32/33 direct/native, only20261031mounted;12mutationcontrols;32HTTPchecks. See complete receipt and pinned archive for traces.'}
p.joinpath('children-independent-verification.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:summary[k] for k in ['status','source','archive','manifest','sourcePins','versions']},indent=2))
