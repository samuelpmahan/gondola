import pathlib,json,tarfile,gzip,io,hashlib,subprocess
root=pathlib.Path('/workspace/scratch/39a56936f173/gondola')
base=pathlib.Path('/tmp/qualification-complete')
for label,old in [('local',pathlib.Path('/tmp/qualification-baseline')),('hosted',pathlib.Path('/tmp/qualification-hosted'))]:
    out=base/label;out.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((old/'runtime.manifest.json').read_text())
    with tarfile.open(old/'runtime.tar.gz') as tar:
        members={t.name:tar.extractfile(t).read() for t in tar.getmembers() if t.isfile()}
    snapshot=json.loads(members['execution-before-archive.json'])
    added=[]
    for name,pin in snapshot['sourceBefore'].items():
        target='source/'+name
        if target in members:continue
        assert name.startswith('compiled-frontend/frontend/react/review-evidence/')
        data=subprocess.check_output(['git','show',manifest['sourceCommit']+':'+name],cwd=root)
        assert len(data)==pin['bytes'] and hashlib.sha256(data).hexdigest()==pin['sha256']
        members[target]=data;added.append({'path':target,**pin,'gitBlob':hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()})
    assert len(added)==8 and len(members)==405
    for pin in manifest['members']:
        data=members[pin['path']];assert len(data)==pin['bytes'] and hashlib.sha256(data).hexdigest()==pin['sha256']
    with (out/'runtime.tar.gz').open('wb') as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0,compresslevel=6) as zipped,tarfile.open(fileobj=zipped,mode='w|') as tar:
        for name,data in sorted(members.items()):
            item=tarfile.TarInfo(name);item.size=len(data);item.mode=0o444;item.mtime=0;tar.addfile(item,io.BytesIO(data))
    manifest['members']=[{'path':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()} for name,data in sorted(members.items())]
    (out/'runtime.manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    pins={}
    for tag,directory in [('original',old),('complete',out)]:
        pins[tag]={f:{'bytes':len((directory/f).read_bytes()),'sha256':hashlib.sha256((directory/f).read_bytes()).hexdigest()} for f in ['runtime.tar.gz','runtime.manifest.json']}
    record={'schema':'gobi.qualification-source-supplement/v1','label':label,'sourceCommit':manifest['sourceCommit'],'originalMembers':397,'completeMembers':405,'added':added,'originalMemberBytesChanged':False,'freshBrowserExecution':False,'reason':'strict Go verification found eight pinned compiler-support inputs absent from historical runtime archive','pins':pins}
    (out/'augmentation.json').write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'label':label,'directory':str(out),'pins':pins['complete']}))
