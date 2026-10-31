#!/usr/bin/env python3
"""Verify and safely restore the accepted repair artifact into a new /tmp tree."""
import argparse, hashlib, json, os, pathlib, posixpath, subprocess, tarfile, tempfile

ROOT=pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
BASE=ROOT/'compiled-lifecycle/ci/2026-10-31'
ARCHIVE_DIR=BASE/'local/accepted-repair'
MANIFEST_PATH=BASE/'local/repair-manifest.json'
FINAL_RECEIPT_PATH=BASE/'lanes/repair-native-path/green/final-run-receipt.json'
EXPECTED_ARCHIVE_BYTES=14757771
EXPECTED_ARCHIVE_SHA='f6c5d09ad0f15b9590e02aedf6ab53b2fc85b2d9e9f00647630708f1364dd9bf'

def sha_bytes(data): return hashlib.sha256(data).hexdigest()
def sha_file(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()
def readj(path): return json.loads(pathlib.Path(path).read_text())
def require(ok,msg):
    if not ok: raise AssertionError(msg)

def safe_relative(name):
    norm=posixpath.normpath(name.rstrip('/'))
    require(not name.startswith('/'),'absolute archive path: '+name)
    require(norm not in ('','.','..') and not norm.startswith('../'),'traversing archive path: '+name)
    require(all(x not in ('','.','..') for x in name.rstrip('/').split('/')),'unsafe path element: '+name)
    return pathlib.PurePosixPath(name)

parser=argparse.ArgumentParser()
parser.add_argument('--restore-root',default=None)
args=parser.parse_args()
restore_root=pathlib.Path(args.restore_root) if args.restore_root else pathlib.Path(tempfile.mkdtemp(prefix='gobi-lifecycle-restore-'))
require(not restore_root.exists() or not any(restore_root.iterdir()),'restore target must be fresh and empty')
restore_root.mkdir(parents=True,exist_ok=True)
# Reassemble the retained chunks in manifest order, verifying each one before writing.
retention=readj(ARCHIVE_DIR/'retention.json')
require(retention['bytes']==EXPECTED_ARCHIVE_BYTES and retention['sha256']==EXPECTED_ARCHIVE_SHA,'retention pin')
archive_path=restore_root/'artifacts.tar.gz'
h=hashlib.sha256(); total=0; chunks=[]
with archive_path.open('wb') as out:
    for row in retention['chunks']:
        part=ROOT/row['path']; data=part.read_bytes(); digest=sha_bytes(data)
        require(len(data)==row['bytes'] and digest==row['sha256'],'chunk pin mismatch: '+row['path'])
        out.write(data); h.update(data); total+=len(data)
        chunks.append({'path':row['path'],'bytes':len(data),'sha256':digest})
require(total==EXPECTED_ARCHIVE_BYTES and h.hexdigest()==EXPECTED_ARCHIVE_SHA,'reassembled archive pin')
manifest=readj(MANIFEST_PATH); expected_rows=manifest['members']; expected={row['path']:row for row in expected_rows}
require(len(expected)==719 and len(expected_rows)==len(expected),'manifest member uniqueness/count')
require(manifest['schema']=='gobi.compiled-lifecycle-archive/v1','manifest schema')
seen=set(); files=[]; dirs=[]; errors=[]; unsafe=[]; uncompressed=0
with tarfile.open(archive_path,'r:gz') as archive:
    for info in archive.getmembers():
        name=info.name
        if name in seen: errors.append('duplicate:'+name)
        seen.add(name)
        rel=safe_relative(name)
        target=restore_root.joinpath(*rel.parts)
        try: target.resolve().relative_to(restore_root.resolve())
        except ValueError: unsafe.append(name); continue
        if info.isdir():
            dirs.append(name); target.mkdir(parents=True,exist_ok=True); continue
        if not info.isfile():
            unsafe.append('unsupported:'+name); continue
        files.append(name)
        row=expected.get(name)
        if row is None: errors.append('unexpected:'+name)
        hasher=hashlib.sha256(); size=0
        source=archive.extractfile(info)
        require(source is not None,'cannot read tar member '+name)
        target.parent.mkdir(parents=True,exist_ok=True)
        with source, target.open('wb') as out:
            for block in iter(lambda:source.read(1024*1024),b''):
                size+=len(block); hasher.update(block); out.write(block)
        uncompressed+=size
        if row is None or size!=row['bytes'] or hasher.hexdigest()!=row['sha256']:
            errors.append('hash-or-size:'+name)
        os.chmod(target,info.mode & 0o777)
missing=sorted(set(expected)-set(files))
require(len(files)==719 and set(files)==set(expected) and not missing and not errors and not unsafe,'archive member verification')
require(not any((restore_root.joinpath(*safe_relative(p).parts)).is_symlink() for p in files),'restored symlink')
site_root=restore_root/'demo/site'
require(site_root.is_dir(),'restored demo/site missing')
# Hash all static demo assets before browser smoke for a before/after immutability check.
site_pins={}
for path,row in expected.items():
    if path.startswith('demo/site/'):
        local=restore_root/path
        require(local.is_file() and local.stat().st_size==row['bytes'] and sha_file(local)==row['sha256'],'demo site pin mismatch '+path)
        site_pins[path]={'bytes':row['bytes'],'sha256':row['sha256']}
require({'demo/site/index.html','demo/site/demo.css','demo/site/demo.bundle.mjs','demo/site/demo-build.json'}<=set(site_pins),'required static assets missing')
# The retained final receipt is byte-identical to the execution record inside this archive.
receipt=readj(FINAL_RECEIPT_PATH)
require(receipt['archive']['bytes']==EXPECTED_ARCHIVE_BYTES and receipt['archive']['sha256']==EXPECTED_ARCHIVE_SHA,'R-FINAL archive identity')
require(receipt['archive']['manifest']['sha256']==sha_file(MANIFEST_PATH),'R-FINAL archive manifest identity')
require(receipt['archive']['memberCount']==len(files) and receipt['archive']['memberBytes']==uncompressed,'R-FINAL archive member count/bytes')
source_pin_map={row['path']:row for row in receipt['sourceBefore']}
checked_source_paths=['compiled-lifecycle/demo/smoke.mjs','compiled-lifecycle/demo/app.mjs','compiled-lifecycle/demo/build.mjs','fixtures/compiled/lifecycle/scenario.json']
source_pins={}
for relative in checked_source_paths:
    row=source_pin_map[relative]; local=ROOT/relative
    require(local.is_file() and local.stat().st_size==row['bytes'] and sha_file(local)==row['sha256'],'source pin differs from R-FINAL: '+relative)
    source_pins[relative]={'bytes':row['bytes'],'sha256':row['sha256']}
package='github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle'
attempt_prefix=receipt['attempt'].rstrip('/')+'/'
def archived_attempt_file(path):
    require(path.startswith(attempt_prefix),'R-FINAL build path outside attempt')
    return restore_root/path[len(attempt_prefix):]
identity={}
for backend in ('react','dom'):
    build=receipt['builds'][backend]; app=build['app']; module=archived_attempt_file(build['rawModule']['path']); appir=archived_attempt_file(build['appIR']['path'])
    require(app['paths']['componentId']==package and app['packagePath']==package,'component identity '+backend)
    require(app['paths']['appIR']==f"apps/lifecycle-7e6575d90707/app-ir.json",'AppIR path '+backend)
    require(app['paths']['module']==f"apps/lifecycle-7e6575d90707/gobi-compiled.mjs",'compiled module path '+backend)
    require(module.is_file() and module.stat().st_size==build['rawModule']['bytes'] and sha_file(module)==build['rawModule']['sha256'],'compiled module pin '+backend)
    require(appir.is_file() and appir.stat().st_size==build['appIR']['bytes'] and sha_file(appir)==build['appIR']['sha256'],'AppIR pin '+backend)
    appir_obj=readj(appir); comp=next(c for c in appir_obj['components'] if c['packagePath']==package)
    require(comp['id']==package and 'effect.request-reply' in comp['capabilities'],'AppIR identity/capability '+backend)
    identity[backend]={'component_id':app['paths']['componentId'],'app_ir_sha256':sha_file(appir),'module_path':app['paths']['module'],'module_bytes':module.stat().st_size,'module_sha256':sha_file(module)}
# Check archived site build metadata binds the R-FINAL React AppIR, raw module, encoder, package, and source pins.
demo_build=readj(site_root/'demo-build.json')
react_build=receipt['builds']['react']
require(demo_build['componentId']==package and demo_build['packagePath']==package and demo_build['backend']=='react','demo build component identity')
for key, build_key in [('appIR','appIR'),('module','rawModule'),('encoder','encoder')]:
    record=demo_build[key]; expected_build=react_build[build_key]
    require(record['sha256']==expected_build['sha256'] and record['bytes']==expected_build['bytes'],'demo site '+key+' identity vs R-FINAL')
    archive_file=archived_attempt_file(expected_build['path'])
    require(archive_file.is_file() and archive_file.stat().st_size==record['bytes'] and sha_file(archive_file)==record['sha256'],'archived '+key+' file pin')
demo_source_pins=demo_build['sourcePins']
for relative in ('compiled-lifecycle/demo/app.mjs','compiled-lifecycle/demo/build.mjs','compiled-lifecycle/demo/demo.css','compiled-lifecycle/demo/index.html'):
    require(demo_source_pins[relative]==source_pin_map[relative]['sha256'],'demo build source pin '+relative)
site_identity={'schema':demo_build['schema'],'backend':demo_build['backend'],'component_id':demo_build['componentId'],'package_path':demo_build['packagePath'],'appIR':demo_build['appIR'],'module':demo_build['module'],'encoder':demo_build['encoder'],'sourcePins':demo_source_pins}
scenario=readj(ROOT/'fixtures/compiled/lifecycle/scenario.json')
fixture_final=scenario['expectedStates'][-1]
node_names=['parent','child','grandchild','sibling']
receipt_final=receipt['demoSmoke']['finalState']
require(receipt_final['nextRequestId']==str(fixture_final['nextRequestID']),'R-FINAL final nextRequestID vs fixture')
fixture_final_fields={'generation':'generations','requestId':'requestIDs','alive':'alive','requested':'requested','pending':'pending','token':'tokens','reply':'replies','count':'counts'}
for idx,name in enumerate(node_names):
    for target,field in fixture_final_fields.items():
        expected_value=fixture_final[field][idx]
        actual_value=receipt_final[name][target]
        if target in ('generation','requestId'): expected_value=str(expected_value)
        require(actual_value==expected_value,f'R-FINAL state vs headless fixture {name}.{target}')
result={
 'archive':{'bytes':total,'sha256':h.hexdigest(),'chunk_count':len(chunks),'chunks':chunks,'member_count':len(files),'uncompressed_bytes':uncompressed,'manifest_sha256':sha_file(MANIFEST_PATH),'member_errors':errors,'unsafe_entries':unsafe},
 'restore_root':str(restore_root),'demo_site':str(site_root),'demo_site_pins':site_pins,
 'r_final_receipt_sha256':sha_file(FINAL_RECEIPT_PATH),'receipt_archive_identity_matches':True,'source_pin_checks':source_pins,
 'build_identity':identity,'demo_build_metadata':site_identity,
 'headless_fixture':{'path':'fixtures/compiled/lifecycle/scenario.json','sha256':sha_file(ROOT/'fixtures/compiled/lifecycle/scenario.json'),'component_id':scenario['componentID'],'events':len(scenario['events']),'expected_state_count':len(scenario['expectedStates']),'final_state_matches_r_final_receipt':True},
 'final_receipt_expected_demo':{'status':receipt['demoSmoke']['status'],'check_count':len(receipt['demoSmoke']['checks']),'renderer_swaps':receipt['demoSmoke']['rendererSwaps'],'ticks':receipt['demoSmoke']['finalTicks'],'browser_version':receipt['demoSmoke']['browserVersion'],'requests':receipt['demoSmoke']['requests'],'final_state':receipt['demoSmoke']['finalState']},
}
out=BASE/'lanes/restore/restore.json'; out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
print(json.dumps({'restore_record':str(out.relative_to(ROOT)),'restore_root':str(restore_root),'demo_site':str(site_root),'archive_sha256':h.hexdigest(),'archive_members':len(files),'site_asset_count':len(site_pins),'receipt_archive_identity_matches':True},indent=2))
