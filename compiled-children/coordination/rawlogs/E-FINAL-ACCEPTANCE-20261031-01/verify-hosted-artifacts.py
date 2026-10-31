import hashlib
import json
import pathlib
import subprocess
import tarfile
import zipfile

ROOT = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
HOSTED = ROOT / 'compiled-children/coordination/hosted-source-462'
CI = pathlib.Path('/tmp/gondola-source462-ci')
SOURCE = pathlib.Path('/workspace/scratch/39a56936f173/gondola-children-archive')
OUTPUT = ROOT / 'compiled-children/coordination/rawlogs/E-FINAL-ACCEPTANCE-20261031-01/hosted-artifact-verification.json'


def file_pin(path):
    h = hashlib.sha256()
    n = 0
    with path.open('rb') as f:
        while True:
            block = f.read(1024 * 1024)
            if not block:
                break
            n += len(block)
            h.update(block)
    return {'bytes': n, 'sha256': h.hexdigest()}


def stream_pin(f):
    h = hashlib.sha256()
    n = 0
    while True:
        block = f.read(1024 * 1024)
        if not block:
            break
        n += len(block)
        h.update(block)
    return {'bytes': n, 'sha256': h.hexdigest()}

children_ci = json.loads((HOSTED / 'children-ci.json').read_text())
children = json.loads((HOSTED / 'children-E-DELIVERY.json').read_text())
independent = json.loads((HOSTED / 'children-independent-verification.json').read_text())
assert children_ci['conclusion'] == 'success'
assert children_ci['run'] == 41211302195 and children_ci['jobs']['jobs'][0]['id'] == 124566695902
artifact = children_ci['artifact']
assert artifact['id'] == 13046728760 and artifact['size_in_bytes'] == 153482729
assert artifact['digest'] == 'sha256:0c0ae308fa6089525c77192bf5cb17a0b9ee49325cb778b33b11d7544e6886ad'
assert artifact['workflow_run']['head_sha'] == '462a9827bfe1980600456b00d0a67843eaa9756d'
assert children['status'] == 'passed' and not children['failures'] and not children['mismatches']
assert len(children['stages']) == 10 and all(s['status'] == 'passed' for s in children['stages'])
assert children['sourcePinsMatch'] and children['boundariesVerified']
assert len(children['sourceBefore']) == len(children['sourceAfter']) == 147
assert children['sourceBefore'] == children['sourceAfter']
assert children['harness']['status'] == 'matched'
assert children['demo']['status'] == 'passed' and len(children['demo']['checks']) == 32
assert all(item['passed'] for item in children['demo']['checks'])

children_zip = CI / 'children.zip'
zip_pin = file_pin(children_zip)
assert zip_pin == {'bytes': artifact['size_in_bytes'], 'sha256': artifact['digest'].removeprefix('sha256:')}
with zipfile.ZipFile(children_zip, 'r') as z:
    assert z.testzip() is None
    assert len(z.infolist()) == independent['zip']['members'] == 1893
    outer_receipt_path = 'compiled-children/coordination/receipts/E-DELIVERY.json'
    raw_receipt = z.read(outer_receipt_path)
    outer_receipt_pin = {'bytes': len(raw_receipt), 'sha256': hashlib.sha256(raw_receipt).hexdigest()}
    copied_receipt = (HOSTED / 'children-E-DELIVERY.json').read_bytes()
    assert raw_receipt == copied_receipt
    assert outer_receipt_pin == independent['receipt']
    zipped_delivery = json.loads(raw_receipt)
    assert zipped_delivery['archive']['memberCount'] == 417
    manifest_path = zipped_delivery['archive']['manifest']['path']
    manifest_bytes = z.read(manifest_path)
    manifest_pin = {'bytes': len(manifest_bytes), 'sha256': hashlib.sha256(manifest_bytes).hexdigest()}
    assert manifest_pin == {'bytes': zipped_delivery['archive']['manifest']['bytes'], 'sha256': zipped_delivery['archive']['manifest']['sha256']}
    assert manifest_bytes == (HOSTED / 'children-archive-inventory.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    assert len(manifest['members']) == 417 and len({x['path'] for x in manifest['members']}) == 417
    embedded_archive_path = zipped_delivery['archive']['path']
    with z.open(embedded_archive_path, 'r') as f:
        embedded_archive_pin = stream_pin(f)
    assert embedded_archive_pin == {'bytes': zipped_delivery['archive']['bytes'], 'sha256': zipped_delivery['archive']['sha256']}

children_tar = CI / 'children-final.tar.gz'
assert file_pin(children_tar) == embedded_archive_pin
expected = {item['path']: item for item in manifest['members']}
seen = set()
uncompressed_bytes = 0
with tarfile.open(children_tar, mode='r|gz') as tar:
    for member in tar:
        assert member.isfile() and member.name in expected and member.name not in seen, member.name
        f = tar.extractfile(member)
        assert f is not None
        actual = stream_pin(f)
        wanted = expected[member.name]
        assert actual == {'bytes': wanted['bytes'], 'sha256': wanted['sha256']}, member.name
        seen.add(member.name)
        uncompressed_bytes += actual['bytes']
assert seen == set(expected)
assert len(seen) == 417
assert independent['archive']['allMemberBytesVerified'] is True
assert independent['sourcePins']['count'] == 147 and independent['sourcePins']['allMatchExactGitCommit']

head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=SOURCE, text=True).strip()
assert head == '462a9827bfe1980600456b00d0a67843eaa9756d'
verified_git_pins = 0
for pin in children['sourceBefore']:
    rel = pathlib.PurePosixPath(pin['path'])
    assert not rel.is_absolute() and '..' not in rel.parts
    data = subprocess.check_output(['git', 'show', f'{head}:{pin["path"]}'], cwd=SOURCE)
    assert len(data) == pin['bytes'] and hashlib.sha256(data).hexdigest() == pin['sha256'], pin['path']
    verified_git_pins += 1
assert verified_git_pins == 147

counter_ci = json.loads((HOSTED / 'counter-ci.json').read_text())
counter_header = json.loads((HOSTED / 'counter-trace-header.json').read_text())
assert counter_ci['conclusion'] == 'success'
assert counter_ci['run'] == 41211304774 and counter_ci['job'] == 124566703068
assert counter_ci['artifact']['id'] == 13046685411
assert counter_ci['artifact']['workflow_run']['head_sha'] == head
counter_zip = CI / 'counter.zip'
counter_zip_pin = file_pin(counter_zip)
assert counter_zip_pin == {'bytes': counter_ci['artifact']['size_in_bytes'], 'sha256': counter_ci['artifact']['digest'].removeprefix('sha256:')}
assert counter_header['zipBytes'] == counter_zip_pin['bytes'] and counter_header['zipSHA256'] == counter_zip_pin['sha256']
assert counter_header['source'] == head and counter_header['run'] == counter_ci['run'] and counter_header['artifact'] == counter_ci['artifact']['id']
assert counter_header['seed'] == 20261030
assert counter_header['scenarioCount'] == counter_header['nativeMatched'] == 107
assert counter_header['ticks'] == 4473 and counter_header['mismatches'] == []
assert counter_header['browser']['version'] == '156.0.8078.4'
with zipfile.ZipFile(counter_zip, 'r') as z:
    assert z.testzip() is None
    trace_member = 'build/interaction-traces-seed-20261030.json'
    with z.open(trace_member, 'r') as f:
        counter_trace_pin = stream_pin(f)
assert counter_trace_pin == {'bytes': counter_header['traceBytes'], 'sha256': counter_header['traceSHA256']}

for name in ['children-ci.json','children-E-DELIVERY.json','children-archive-inventory.json','children-independent-verification.json','children-independent-verification.log','children-job.log','counter-ci.json','counter-trace-header.json','counter-job.log','verify-children-artifact.py']:
    assert (HOSTED / name).read_bytes() == (CI / name).read_bytes(), name

summary = {
    'schema':'gobi.compiled-children-hosted-final-evidence-check/v1',
    'status':'passed',
    'source':head,
    'children':{
        'run':children_ci['run'],'job':children_ci['jobs']['jobs'][0]['id'],'artifact':artifact['id'],'conclusion':children_ci['conclusion'],
        'zip':zip_pin,'zipMembers':1893,'zipCrcPassed':True,
        'receipt':outer_receipt_pin,'stages':10,'allStagesPassed':True,'failures':[],'mismatches':[],
        'sourcePins':{'count':verified_git_pins,'allMatchExactCommit':True,'beforeAfterEqual':True},
        'innerArchive':{'path':embedded_archive_path,**embedded_archive_pin,'members':len(seen),'uncompressedBytes':uncompressed_bytes,'allManifestHashesMatch':True},
        'manifest':{'path':manifest_path,**manifest_pin},
        'fixedTrace':{'events':42,'goUpdates':38,'stateCheckpoints':39,'swaps':2,'mutationControls':12},
        'seededBrowserCoverage':{'seeds':[20261031,20261032,20261033],'mountedBrowserSeeds':[20261031]},
        'httpChecks':32,'versions':children['versions']
    },
    'counter':{
        'run':counter_ci['run'],'job':counter_ci['job'],'artifact':counter_ci['artifact']['id'],'conclusion':counter_ci['conclusion'],
        'zip':counter_zip_pin,'zipCrcPassed':True,'trace':counter_trace_pin,'seed':counter_header['seed'],
        'scripts':counter_header['scenarioCount'],'ticks':counter_header['ticks'],'nativeMatched':counter_header['nativeMatched'],
        'mismatches':counter_header['mismatches'],'chromium':counter_header['browser']['version']
    },
    'sourceHostedCopyPins':{name:file_pin(HOSTED/name) for name in ['children-ci.json','children-E-DELIVERY.json','children-archive-inventory.json','children-independent-verification.json','children-independent-verification.log','children-job.log','counter-ci.json','counter-trace-header.json','counter-job.log','verify-children-artifact.py']}
}
OUTPUT.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'status':summary['status'],'children':summary['children'],'counter':summary['counter']},indent=2))
