import hashlib
import json
import pathlib

PRIMARY = pathlib.Path('/workspace/scratch/39a56936f173/gondola-next')
SOURCE = pathlib.Path('/workspace/scratch/39a56936f173/gondola-children-archive')
PACKET = PRIMARY / 'compiled-children/coordination/current-full-source-462'
RAW = PRIMARY / 'compiled-children/coordination/rawlogs/E-ACCEPTANCE-20261031-01'

def pin(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def assert_pin(path, expected):
    actual = pin(path)
    assert actual == {'bytes': expected['bytes'], 'sha256': expected['sha256']}, (str(path), actual, expected)
    return actual

receipt_path = PACKET / 'E-DELIVERY.json'
receipt = json.loads(receipt_path.read_text())
assert receipt['schema'] == 'gobi.compiled-children-execution/v1'
assert receipt['job_id'] == 'E-DELIVERY' and receipt['worker'] == 'N6'
assert receipt['mode'] == 'full' and receipt['status'] == 'passed'
assert receipt['outcome'] in ('mixed_change', 'confirmed_reuse')
assert receipt['failures'] == [] and receipt['mismatches'] == []
assert len(receipt['stages']) == 10 and all(stage['status'] == 'passed' for stage in receipt['stages'])
assert receipt['sourcePinsMatch'] is True and receipt['boundariesVerified'] is True
report_pin = assert_pin(PACKET / 'E-DELIVERY.md', receipt['report'])
console_path = PACKET / 'full-console.log'
console_pin = pin(console_path)
source_pins = json.loads((RAW / 'source-pin-verification.stdout.json').read_text())
assert source_pins['status'] == 'matched' and source_pins['allPhysicalFilesMatchReceipt']
assert source_pins['sourceBeforeEqualsSourceAfter'] and source_pins['mismatches'] == []
assert source_pins['sourcePinCount'] == len(receipt['sourceBefore']) == len(receipt['sourceAfter']) == 147
assert source_pins['boundaryRecords'][0]['sha256'] == source_pins['boundaryRecords'][1]['sha256']
assert source_pins['boundaryRecords'][0]['sha256'] == receipt['boundaries'][0]['sha256']

archive = receipt['archive']
archive_path = SOURCE / archive['path']
manifest_path = SOURCE / archive['manifest']['path']
consumer = json.loads((RAW / 'independent-archive-consumer.json').read_text())
assert consumer['status'] == 'passed'
assert consumer['archive']['sha256'] == archive['sha256'] and consumer['archive']['bytes'] == archive['bytes']
assert consumer['manifest']['sha256'] == archive['manifest']['sha256'] and consumer['manifest']['bytes'] == archive['manifest']['bytes']
assert consumer['members'] == archive['memberCount'] == 417
assert pin(archive_path) == {'bytes': archive['bytes'], 'sha256': archive['sha256']}
assert pin(manifest_path) == {'bytes': archive['manifest']['bytes'], 'sha256': archive['manifest']['sha256']}
manifest = json.loads(manifest_path.read_text())
assert len(manifest['members']) == 417
assert len({m['path'] for m in manifest['members']}) == 417

static = json.loads((RAW / 'static-history-verification-v3.stdout.json').read_text())
assert static['status'] == 'matched'
assert static['m0Preservation']['status'] == 'passed'
assert static['m0Preservation']['rulesTestRows'] == 59
assert static['m0Preservation']['checksumEntryCount'] == 24 and static['m0Preservation']['allActualFilesMatch']
assert static['historicalCounterBaseline']['scripts'] == 107
assert static['historicalCounterBaseline']['ticks'] == 4473
assert static['historicalCounterBaseline']['status'] == 'historical prior-run evidence; not rerun in source462'

unit = receipt['unitTests']
assert unit['status'] == 'passed' and unit['tap'] == {'tests': 46, 'pass': 46, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
assert receipt['oracle']['tap'] == {'tests': 9, 'pass': 9, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
assert receipt['harness']['status'] == 'matched'
hs = receipt['harness']['summary']
assert hs['status'] == 'matched' and hs['events'] == 42 and hs['ticks'] == 39 and hs['swaps'] == 2
assert hs['mutationControlsDetected'] == 12
assert hs['seededRuns'] == {'count': 3, 'seeds': [20261031, 20261032, 20261033]}
assert receipt['harness']['browserNoWasmGuardCoverage']['status'] == 'complete'
assert len(receipt['harness']['browserNoWasmGuardCoverage']['entries']) == 10
assert receipt['harness']['browserNoWasmGuardCoverage']['failures'] == []
native = receipt['oracle']['nativeCapture']
assert native['sha256'] == '8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb'
manifest_by_path = {item['path']: item for item in manifest['members']}
native_member = manifest_by_path['oracle/native.json']
assert {'bytes': native_member['bytes'], 'sha256': native_member['sha256']} == {'bytes': native['bytes'], 'sha256': native['sha256']}
assert manifest_by_path['harness/run.native.json']['sha256'] == native['sha256']

assert receipt['demo']['status'] == 'passed'
assert len(receipt['demo']['checks']) == 32 and all(check['passed'] for check in receipt['demo']['checks'])
assert any(check['id'] == 'pending-buttons-disabled' and check['passed'] for check in receipt['demo']['checks'])
assert receipt['buildComparison']['appIRByteIdentical'] and receipt['buildComparison']['encoderByteIdentical']
assert receipt['buildComparison']['outputPathsIdentical']
assert receipt['buildComparison']['reactOutputCount'] == receipt['buildComparison']['domOutputCount'] == 67
assert receipt['versions']['node'] == 'v22.23.4'
assert receipt['versions']['rootGo'] == 'go version go1.24.0 linux/amd64'
assert receipt['versions']['compilerGo'] == 'go version go1.27.3 linux/amd64'
assert receipt['versions']['chromium'] == 'Chromium 153.0.8010.0'

seeded_path = pathlib.Path(hs['outputPaths']['seeded'])
seeded = json.loads(seeded_path.read_text())
seed_results = seeded['results']
assert [r['seed'] for r in seed_results] == [20261031, 20261032, 20261033]
assert all(r['events'] == 60 and r['goUpdates'] == 59 for r in seed_results)
assert seed_results[0]['outputs']['browser'] is not None
assert seed_results[1]['outputs']['browser'] is None and seed_results[2]['outputs']['browser'] is None
assert seed_results[0]['stateTreeDomParity'] is True
assert seed_results[1]['stateTreeDomParity'] is False and seed_results[2]['stateTreeDomParity'] is False

print(json.dumps({
    'schema': 'gobi.compiled-children-acceptance-independent-check/v1',
    'status': 'matched',
    'execution': {
        'job_id': receipt['job_id'], 'worker': receipt['worker'], 'mode': receipt['mode'],
        'status': receipt['status'], 'summary': receipt['summary'], 'stageCount': len(receipt['stages']),
        'stageNames': [stage['name'] for stage in receipt['stages']],
        'allStagesPassed': True, 'failureCount': len(receipt['failures']),
        'mismatchCount': len(receipt['mismatches']), 'attempt': receipt['attempt'],
        'startedAt': receipt['startedAt'], 'finishedAt': receipt['stages'][-1]['finishedAt'],
        'sourcePinCount': source_pins['sourcePinCount'], 'sourcePinsMatchPhysical': True,
        'sourceBoundarySha256': source_pins['boundaryRecords'][0]['sha256'],
        'outerReceipt': {'path': str(receipt_path), **pin(receipt_path)},
        'outerReport': {'path': str(PACKET / 'E-DELIVERY.md'), **report_pin},
        'outerConsole': {'path': str(console_path), **console_pin},
    },
    'archive': {
        'path': str(archive_path), 'bytes': archive['bytes'], 'sha256': archive['sha256'],
        'manifest': {'path': str(manifest_path), 'bytes': archive['manifest']['bytes'], 'sha256': archive['manifest']['sha256']},
        'memberCount': len(manifest_by_path), 'independentConsumerPassed': True,
    },
    'applicationEvidence': {
        'unitTests': unit['tap'], 'literalOracle': receipt['oracle']['tap'],
        'nativeCapture': {'path': native['path'], 'bytes': native['bytes'], 'sha256': native['sha256']},
        'events': hs['events'], 'goTicks': hs['ticks'], 'swaps': hs['swaps'],
        'mutationControlsDetected': hs['mutationControlsDetected'],
        'seededRuns': [{'seed': r['seed'], 'events': r['events'], 'goUpdates': r['goUpdates'], 'mountedBrowser': r['outputs']['browser'] is not None, 'browserParity': r['stateTreeDomParity'] if r['outputs']['browser'] is not None else None} for r in seed_results],
        'httpSmoke': {'checks': len(receipt['demo']['checks']), 'allPassed': True, 'disabledPendingControlCheck': True},
        'wasmGuardCoverage': {'status': receipt['harness']['browserNoWasmGuardCoverage']['status'], 'entries': len(receipt['harness']['browserNoWasmGuardCoverage']['entries']), 'failures': receipt['harness']['browserNoWasmGuardCoverage']['failures']},
        'reactDom': {'appIRByteIdentical': True, 'encoderByteIdentical': True, 'outputPathsIdentical': True, 'eachOutputCount': 67},
    },
    'inheritedPreservation': static['m0Preservation'],
    'historicalCounterBaseline': static['historicalCounterBaseline'],
}, indent=2))
