import pathlib,json,tarfile,gzip,hashlib,io,shutil
root=pathlib.Path('/workspace/scratch/39a56936f173/gondola')
attempt=root/'backend-qualification/output/attempts/attempt-20261031T194915268Z-5'
archive=attempt.with_name(attempt.name+'.tar.gz')
manifestPath=attempt.with_name(attempt.name+'.archive-manifest.json')
manifest=json.loads(manifestPath.read_text())
out=pathlib.Path('/tmp/portable-publish/reconstruction');out.mkdir(parents=True,exist_ok=True)
damaged=archive.read_bytes();(out/'damaged-original.tar.gz').write_bytes(damaged)
prefix={}
try:
    with tarfile.open(archive,'r|gz') as tar:
        for member in tar:
            data=tar.extractfile(member).read()
            prefix[member.name]=data
except (EOFError,tarfile.TarError,OSError) as error:
    stopped=str(error)
members={};fromPrefix=[];fromLive=[]
for pin in manifest['members']:
    name=pin['path'];expected=(pin['bytes'],pin['sha256'])
    def valid(b):return (len(b),hashlib.sha256(b).hexdigest())==expected
    if name in prefix and valid(prefix[name]):data=prefix[name];fromPrefix.append(name)
    else:
        data=(attempt/name).read_bytes()
        assert valid(data),f'original member bytes unavailable: {name}'
        fromLive.append(name)
    members[name]=data
repacked=out/'member-exact.tar.gz'
with repacked.open('wb') as raw,gzip.GzipFile(fileobj=raw,mode='wb',mtime=0,compresslevel=6) as gz,tarfile.open(fileobj=gz,mode='w|',format=tarfile.GNU_FORMAT) as tar:
    for name,data in sorted(members.items()):
        header=tarfile.TarInfo(name);header.size=len(data);header.mode=0o444;header.mtime=0;tar.addfile(header,io.BytesIO(data))
shutil.copyfile(manifestPath,out/'member-exact.manifest.json')
data=repacked.read_bytes()
parts=[]
for i,start in enumerate(range(0,len(data),1048576)):
    b=data[start:start+1048576];p=out/f'member-exact.part{i:03}';p.write_bytes(b);parts.append({'file':p.name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
report={'schema':'gobi.primary-member-exact-reconstruction/v1','sourceCommit':manifest['sourceCommit'],'originalExpectedArchive':{'bytes':2484521,'sha256':'4bc54d8464753d6e39040f977eb42889cfaa958dc27fe440c3a83bef478f999f'},'damagedObservedArchive':{'bytes':len(damaged),'sha256':hashlib.sha256(damaged).hexdigest()},'streamError':stopped,'reconstructedArchive':{'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'members':len(members)},'exactOriginalMemberBytes':True,'exactOriginalCompressedBytesRecovered':False,'prefixMembers':fromPrefix,'originalRawMembers':fromLive,'parts':parts,'cause':'unknown; observed only after producer and independent consumer completed; damaged files preserved and excluded'}
(out/'reconstruction.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k not in ['prefixMembers','originalRawMembers']}))
