import argparse,hashlib,json,pathlib,subprocess,sys
ap=argparse.ArgumentParser();ap.add_argument('commit');ap.add_argument('--git',default='/tmp/keyed-module-publish/readback.git');ap.add_argument('--expected',default='/tmp/keyed-module-publish/expected-publication.json');ap.add_argument('--output',default='/tmp/keyed-module-publish/readback-files');ap.add_argument('--proof',default='/tmp/keyed-module-publish/github-readback.json');args=ap.parse_args()
prefix='compiled-keyed-modules/ci/2026-11-01/current';source='f4c8f70199a8ca896c13e225a85901abe658d0de';sha=lambda b:hashlib.sha256(b).hexdigest()
def git(*xs):return subprocess.check_output(['git','-C',args.git,*xs])
expected=json.loads(pathlib.Path(args.expected).read_text());names=git('ls-tree','-r','--name-only',args.commit,'--',prefix).decode().splitlines();actual={x[len(prefix)+1:]:x for x in names};assert set(actual)==set(expected),{'missing':sorted(set(expected)-set(actual)),'extra':sorted(set(actual)-set(expected))}
out=pathlib.Path(args.output);assert not out.exists();out.mkdir(parents=True)
for name,full in actual.items():
 b=git('show',args.commit+':'+full);row=expected[name];assert len(b)==row['bytes'] and sha(b)==row['sha256'],name
 f=out/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(b)
for mode,dest in [('primary',out/'runtime'),('audit',out/'audit-restored')]:
 command=[sys.executable,str(out/'restore.py'),str(dest)]
 if mode=='audit':command.append('--audit')
 r=subprocess.run(command,check=True,capture_output=True,text=True);d=json.loads(r.stdout);assert d['status']=='passed';expected_members=600 if mode=='primary' else 965;assert d['memberCount']==expected_members;(out/(mode+'-restore-result.json')).write_text(r.stdout)
m=json.loads((out/'bundle.manifest.json').read_text());pins=m['sourcePins'];assert len(pins)==157
for name,row in pins.items():
 b=git('show',args.commit+':'+name);assert len(b)==row['bytes'] and sha(b)==row['sha256'],name
 b2=(out/'runtime/source'/name).read_bytes();assert b2==b,name
changes=git('diff','--name-only',source,args.commit).decode().splitlines();assert all(x.startswith(prefix+'/') for x in changes),changes
assert sha((out/'restore.py').read_bytes())=='0dac505c5e9949a2b6168dac955e40c7af805847f73ef27652e1962d603d3f68'
acceptance=json.loads((out/'coordination/final-acceptance.json').read_text());assert acceptance['jobsClosed']==18 and acceptance['independentPairs']==9 and acceptance['allNativeBrokenConstraints']==0
proof={'schema':'gobi.keyed-module-git-readback/v1','status':'passed','evidenceCommit':args.commit,'sourceCommit':source,'publishedFiles':len(actual),'primaryMembers':600,'auditMembers':965,'sourcePinsMatchedToGitAndArchive':157,'testSourcePins':45,'primarySegments':25,'auditSegments':111,'restoreUtilitySHA256':sha((out/'restore.py').read_bytes()),'archiveSHA256':m['archive']['sha256'],'auditArchiveSHA256':json.loads((out/'audit-parts.json').read_text())['archive']['sha256'],'sourceChangesOutsideEvidencePrefix':False,'inventory':expected}
pathlib.Path(args.proof).write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:v for k,v in proof.items() if k!='inventory'}))
