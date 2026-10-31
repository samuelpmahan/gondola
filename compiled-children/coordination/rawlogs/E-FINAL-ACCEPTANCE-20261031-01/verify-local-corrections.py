import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
SOURCE = pathlib.Path('/workspace/scratch/39a56936f173/gondola-children-archive')
COORD = ROOT / 'compiled-children/coordination'
LOCAL = COORD / 'current-full-source-462'
ATTEMPT = SOURCE / 'compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7'
OLD_RAW = COORD / 'rawlogs/E-ACCEPTANCE-20261031-01'
OLD_RECEIPT_PATH = COORD / 'receipts/E-ACCEPTANCE.json'
OLD_REPORT_PATH = COORD / 'reports/E-ACCEPTANCE.md'
XR_RECEIPT_PATH = COORD / 'receipts/XR-ACCEPTANCE.json'
XR_REPORT_PATH = COORD / 'reports/XR-ACCEPTANCE.md'
OUT = ROOT / 'compiled-children/coordination/rawlogs/E-FINAL-ACCEPTANCE-20261031-01/local-correction-verification.json'


def pin_bytes(data):
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def pin_path(path):
    return pin_bytes(path.read_bytes())

local = json.loads((LOCAL / 'E-DELIVERY.json').read_text())
assert local['status'] == 'passed' and local['mode'] == 'full'
assert len(local['stages']) == 10 and all(s['status'] == 'passed' for s in local['stages'])
assert local['failures'] == [] and local['mismatches'] == []
assert local['sourcePinsMatch'] and local['boundariesVerified']
assert len(local['sourceBefore']) == len(local['sourceAfter']) == 147
assert local['sourceBefore'] == local['sourceAfter']
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=SOURCE, text=True).strip()
assert head == '462a9827bfe1980600456b00d0a67843eaa9756d'
archive = local['archive']
archive_path = SOURCE / archive['path']
assert archive_path.name == 'attempt-20261031T144222262Z-7.tar.gz' and archive_path.exists()
assert pin_path(archive_path) == {'bytes': archive['bytes'], 'sha256': archive['sha256']}
manifest_path = SOURCE / archive['manifest']['path']
assert pin_path(manifest_path) == {'bytes': archive['manifest']['bytes'], 'sha256': archive['manifest']['sha256']}

check_path = ATTEMPT / 'harness/run.check.json'
check = json.loads(check_path.read_text())
assert check['status'] == 'matched'
assert check['events'] == 42 and check['goUpdates'] == 38 and check['stateCheckpoints'] == 39
native_path = ATTEMPT / 'oracle/native.json'
assert pin_path(native_path) == {'bytes': local['oracle']['nativeCapture']['bytes'], 'sha256': local['oracle']['nativeCapture']['sha256']}
assert local['harness']['summary']['events'] == 42 and local['harness']['summary']['ticks'] == 39
assert check['mutationControlsDetected'] == 12
seeded = json.loads((ATTEMPT / 'harness/run.seeded.json').read_text())
assert [x['seed'] for x in seeded['results']] == [20261031, 20261032, 20261033]
assert all(x['events'] == 60 and x['goUpdates'] == 59 for x in seeded['results'])
assert seeded['results'][0]['outputs']['browser'] is not None
assert seeded['results'][1]['outputs']['browser'] is None and seeded['results'][2]['outputs']['browser'] is None

consumer_path = OLD_RAW / 'independent-archive-consumer.json'
consumer = json.loads(consumer_path.read_text())
assert consumer['status'] == 'passed' and consumer['members'] == 417
assert consumer['archive']['sha256'] == archive['sha256']
assert consumer['manifest']['sha256'] == archive['manifest']['sha256']
consumer_command = next(c for c in local['commands'] if c['name'] == 'independent-post-command-archive-consumer')
assert consumer_command['exitCode'] == 0
args = consumer_command['args']
actual_expected_manifest_sha = args[args.index('--expected-manifest-sha256') + 1]
assert actual_expected_manifest_sha == archive['manifest']['sha256'] == 'ba2e35fc2841aaf250e5d21fdfd6b84fba02dd4f5853bd84b6e562d3f0f17f5a'
old_receipt = json.loads(OLD_RECEIPT_PATH.read_text())
wrong_archive_path = old_receipt['evidence']['archive']['path']
wrong_command_sha = 'ba2e35fc2841aaf250e5d21fdfd1b6d84fba02dd4f5853bd84b6e562d3f0f17f5a'
old_commands = (OLD_RAW / 'commands.txt').read_text()
assert 'ba2e35fc2841aaf250e5d21fdfd1b6d84fba02dd4f5853bd84b6e562d3f0f17f5a' in old_commands
assert not pathlib.Path(wrong_archive_path).exists()
assert old_receipt['evidence']['archive']['path'].endswith('.archive-manifest.tar.gz')
assert archive_path.name != pathlib.Path(wrong_archive_path).name

old_manifest = json.loads((OLD_RAW / 'manifest.json').read_text())
for item in old_manifest['rawlogs']:
    p = ROOT / item['path']
    assert pin_path(p) == {'bytes': item['bytes'], 'sha256': item['sha256']}, item['path']
assert pin_path(OLD_REPORT_PATH) == {'bytes': old_receipt['report']['bytes'], 'sha256': old_receipt['report']['sha256']}
assert pin_path(XR_REPORT_PATH) == {'bytes': json.loads(XR_RECEIPT_PATH.read_text())['report']['bytes'], 'sha256': json.loads(XR_RECEIPT_PATH.read_text())['report']['sha256']}

summary = {
    'schema':'gobi.compiled-children-local-packet-correction-check/v1',
    'status':'passed',
    'source':{'commit':head,'sourcePinCount':147,'sourceBeforeEqualsSourceAfter':True},
    'localFull':{'status':local['status'],'stages':10,'failures':0,'mismatches':0,'attempt':local['attempt']},
    'archive':{'actualPath':str(archive_path),'bytes':archive['bytes'],'sha256':archive['sha256'],'manifestPath':str(manifest_path),'manifestBytes':archive['manifest']['bytes'],'manifestSha256':archive['manifest']['sha256'],'members':417,'consumerExitCode':consumer_command['exitCode']},
    'fixedTrace':{'events':check['events'],'goUpdates':check['goUpdates'],'stateCheckpoints':check['stateCheckpoints'],'swaps':check['swaps'],'mutationControlsDetected':check['mutationControlsDetected']},
    'seededRuns':[{'seed':x['seed'],'events':x['events'],'goUpdates':x['goUpdates'],'mountedBrowser':x['outputs']['browser'] is not None} for x in seeded['results']],
    'corrections':{
        'oldPacketArchivePath':wrong_archive_path,'oldPacketPathExists':False,'actualArchivePath':str(archive_path),
        'oldCommandsManifestSha256':wrong_command_sha,'actualExecutedCommandExpectedManifestSha256':actual_expected_manifest_sha,'actualCommandExitCode':consumer_command['exitCode'],
        'oldPacketTraceWording':'42 events / 39 Go ticks','correctTraceWording':'42 events / 38 Go updates / 39 state checkpoints'
    },
    'closedPackets':{
        'EAcceptanceReceipt':{'bytes':pin_path(OLD_RECEIPT_PATH)['bytes'],'sha256':pin_path(OLD_RECEIPT_PATH)['sha256']},
        'EAcceptanceReport':{'bytes':pin_path(OLD_REPORT_PATH)['bytes'],'sha256':pin_path(OLD_REPORT_PATH)['sha256']},
        'XRAcceptanceReceipt':{'bytes':pin_path(XR_RECEIPT_PATH)['bytes'],'sha256':pin_path(XR_RECEIPT_PATH)['sha256']},
        'XRAcceptanceReport':{'bytes':pin_path(XR_REPORT_PATH)['bytes'],'sha256':pin_path(XR_REPORT_PATH)['sha256']},
        'allPriorRawlogsMatchManifest':True
    }
}
OUT.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
