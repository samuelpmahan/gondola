from pathlib import Path
import hashlib
import json

PRIMARY = Path('/workspace/scratch/39a56936f173/gondola-next')
ACTIVE = Path('/workspace/scratch/39a56936f173/gondola-children-archive')
OUTER_REL = 'compiled-children/coordination/failed-full-source-978/E-DELIVERY.json'
REPORT_REL = 'compiled-children/coordination/failed-full-source-978/E-DELIVERY.md'
INNER_REL = 'compiled-children/coordination/failed-full-source-978/inherited-E-BUILD.json'
INNER_REPORT_REL = 'compiled-children/coordination/failed-full-source-978/inherited-E-BUILD.md'
ATTEMPT_REL = 'compiled-children/demo/output/attempts/attempt-20261031T143022891Z-7'
HARNESS_REL = ATTEMPT_REL + '/harness'

def pin(root, rel):
    data = (root / rel).read_bytes()
    return {'path': rel, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def read_json(root, rel):
    return json.loads((root / rel).read_text())

outer = read_json(PRIMARY, OUTER_REL)
report_pin = outer['report']
actual_report = pin(PRIMARY, REPORT_REL)
assert outer['status'] == 'failed' and outer['mode'] == 'full'
assert outer['mismatches'] == [] and len(outer['failures']) == 2
assert actual_report['bytes'] == report_pin['bytes'] and actual_report['sha256'] == report_pin['sha256']
stages = {item['name']: item['status'] for item in outer['stages']}
assert stages['fresh-full-inherited-capabilities-chain'] == 'failed'
new_stages = [name for name in stages if name != 'fresh-full-inherited-capabilities-chain']
assert all(stages[name] == 'passed' for name in new_stages)

inner = read_json(PRIMARY, INNER_REL)
inner_report = read_json(PRIMARY, INNER_REL)  # receipt identity is kept separate from its report below
inner_report_text = (PRIMARY / INNER_REPORT_REL).read_text()
assert inner['status'] == 'failed' and inner.get('sourcePinsMatch') is False
archive_tests = inner['archiveHelperTests']['tap']
assert archive_tests == {'tests': 5, 'pass': 5, 'fail': 0, 'cancelled': 0, 'skipped': 0, 'todo': 0}
assert 'three clean TAP passes' in inner_report_text
assert any('sourceBefore and pre-archive source pins differ' in item.get('error', '') for item in inner['failures'])

harness = read_json(ACTIVE, HARNESS_REL + '/run.check.json')
native = read_json(ACTIVE, HARNESS_REL + '/run.native.json')
seeded = read_json(ACTIVE, HARNESS_REL + '/run.seeded.json')
assert harness['status'] == 'matched'
assert (harness['events'], harness['goUpdates'], harness['stateCheckpoints']) == (42, 38, 39)
assert (harness['swaps'], harness['acceptedCompatibleSwaps'], harness['rejectedIncompatibleSwaps']) == (2, 1, 1)
assert harness['mutationControlsDetected'] == 12 and len(harness['mutationControls']) == 12
assert len(native['events']) == 42 and len(native['steps']) == 38
assert len(seeded['results']) == 3
for item, expected_seed in zip(seeded['results'], [20261031, 20261032, 20261033]):
    assert item['seed'] == expected_seed and item['events'] == 60 and item['goUpdates'] == 59
assert seeded['results'][0]['outputs']['browser'] is not None
assert seeded['results'][1]['outputs']['browser'] is None
assert seeded['results'][2]['outputs']['browser'] is None

archive = outer['archive']
archive_actual = pin(ACTIVE, archive['path'])
manifest_actual = pin(ACTIVE, archive['manifest']['path'])
consumer_pin = archive['independentConsumer']
consumer_actual = pin(ACTIVE, consumer_pin['path'])
consumer = read_json(ACTIVE, consumer_pin['path'])
assert archive_actual['bytes'] == archive['bytes'] and archive_actual['sha256'] == archive['sha256']
assert manifest_actual['bytes'] == archive['manifest']['bytes'] and manifest_actual['sha256'] == archive['manifest']['sha256']
assert archive['memberCount'] == 239 and archive['roundTripVerified'] is True
assert consumer['status'] == 'passed' and consumer['members'] == 239
assert consumer['archive']['sha256'] == archive['sha256'] and consumer['manifest']['sha256'] == archive['manifest']['sha256']

smoke = read_json(ACTIVE, ATTEMPT_REL + '/demo/smoke.json')
assert outer['demo']['status'] == 'passed' and len(outer['demo']['checks']) == 32
assert all(check.get('passed') is True for check in outer['demo']['checks'])
assert smoke['status'] == 'passed' and len(smoke['checks']) == 32

source_before = {item['path']: item for item in outer['sourceBefore']}
app_pin = source_before['fixtures/compiled/children/app.go']
assert app_pin['sha256'] == 'd265bbac54017ab366bdf86aa646fdad808f464c5d35cd106259c6943fc32c99'
assert pin(ACTIVE, 'fixtures/compiled/children/app.go')['sha256'] == app_pin['sha256']
old_cap_run = source_before['compiled-capabilities/run.mjs']['sha256']
current_cap_run = pin(ACTIVE, 'compiled-capabilities/run.mjs')
assert current_cap_run['sha256'] != old_cap_run
current_cap_text = (ACTIVE / 'compiled-capabilities/run.mjs').read_text()
assert 'tap.tests < 5' in current_cap_text and 'at least five clean TAP passes' in current_cap_text
prior_results = (ACTIVE / 'typed-composition/RESULTS.md').read_text()
assert 'Counter | 107 scripts /4,473 ticks' in prior_results

capture_files = []
harness_file_pins = {row['path']: row for row in outer['harness']['files']}
for rel in [
    HARNESS_REL + '/run.check.json',
    HARNESS_REL + '/run.native.json',
    HARNESS_REL + '/run.direct.react.json',
    HARNESS_REL + '/run.direct.dom.json',
    HARNESS_REL + '/run.browser.json',
    HARNESS_REL + '/run.seeded.json',
]:
    recorded = harness_file_pins[rel]
    actual = pin(ACTIVE, rel)
    assert actual['bytes'] == recorded['bytes'] and actual['sha256'] == recorded['sha256']
    capture_files.append(actual)

pins = {
    'outerReceipt': pin(PRIMARY, OUTER_REL),
    'outerReport': actual_report,
    'innerReceipt': pin(PRIMARY, INNER_REL),
    'innerReport': pin(PRIMARY, INNER_REPORT_REL),
    'runCheck': pin(ACTIVE, HARNESS_REL + '/run.check.json'),
    'nativeTrace': pin(ACTIVE, HARNESS_REL + '/run.native.json'),
    'directReact': pin(ACTIVE, HARNESS_REL + '/run.direct.react.json'),
    'directDom': pin(ACTIVE, HARNESS_REL + '/run.direct.dom.json'),
    'browserCapture': pin(ACTIVE, HARNESS_REL + '/run.browser.json'),
    'seededSummary': pin(ACTIVE, HARNESS_REL + '/run.seeded.json'),
    'demoSmoke': pin(ACTIVE, ATTEMPT_REL + '/demo/smoke.json'),
    'archive': archive_actual,
    'archiveManifest': manifest_actual,
    'archiveConsumer': consumer_actual,
    'contract': pin(ACTIVE, 'compiled-children/CONTRACT.md'),
    'readme': pin(ACTIVE, 'compiled-children/README.md'),
    'results': pin(ACTIVE, 'compiled-children/RESULTS.md'),
    'goState': pin(ACTIVE, 'fixtures/compiled/children/app.go'),
    'goView': pin(ACTIVE, 'fixtures/compiled/children/view.go'),
    'typedCompositionDesign': pin(ACTIVE, 'typed-composition/DESIGN.md'),
    'typedCompositionResults': pin(ACTIVE, 'typed-composition/RESULTS.md'),
    'priorCounterBaseline': pin(ACTIVE, 'interaction/evidence/summary.json'),
    'capabilitiesRunnerCurrent': current_cap_run,
}
summary = {
    'schema': 'gobi.release-contract-matrix-audit/v1',
    'status': 'passed',
    'source978': {
        'status': outer['status'], 'mode': outer['mode'], 'failureCount': len(outer['failures']),
        'semanticMismatchCount': len(outer['mismatches']), 'newStageCount': len(new_stages),
        'allNewStagesPassed': True, 'failedInheritedStage': 'fresh-full-inherited-capabilities-chain',
        'inheritedBuildStatus': inner['status'], 'archiveHelperGateActual': archive_tests,
        'inheritedSourcePinsMatch': inner['sourcePinsMatch'],
    },
    'fixedReplay': {
        'status': harness['status'], 'events': harness['events'], 'goUpdates': harness['goUpdates'],
        'stateCheckpoints': harness['stateCheckpoints'], 'swaps': harness['swaps'],
        'acceptedSwaps': harness['acceptedCompatibleSwaps'], 'rejectedSwaps': harness['rejectedIncompatibleSwaps'],
        'mutationsDetected': harness['mutationControlsDetected'],
    },
    'seededReplay': [{'seed':x['seed'],'events':x['events'],'goUpdates':x['goUpdates'],'browserMounted':x['outputs']['browser'] is not None} for x in seeded['results']],
    'httpSmoke': {'status':smoke['status'],'checks':len(smoke['checks'])},
    'archive': {'members':archive['memberCount'],'roundTripVerified':archive['roundTripVerified'],'consumerStatus':consumer['status'],'sha256':archive['sha256']},
    'baseline': {'historicalCounterScripts':107,'historicalCounterTicks':4473,'currentInheritedStatus':'not passed in source978; source462 full run reported in progress by root'},
    'source978AppGoSha256':app_pin['sha256'],
    'source978CapabilitiesRunnerSha256':old_cap_run,
    'currentCapabilitiesRunnerSha256':current_cap_run['sha256'],
    'evidencePins':pins,
    'fixedCapturePins':capture_files,
}
raw = PRIMARY / 'compiled-children/coordination/rawlogs'
(raw / 'E-RELEASE-CONTRACT-MATRIX-audit.json').write_text(json.dumps(summary, indent=2) + '\n')
lines = [
    'E-RELEASE-CONTRACT-MATRIX read-only audit: PASS',
    f"source978 E-DELIVERY={outer['status']}, failures={len(outer['failures'])}, semantic mismatches={len(outer['mismatches'])}; all {len(new_stages)} post-inherited stages passed",
    f"source978 inherited E-BUILD={inner['status']}; startup gate observed 5/5 passes, source pin check failed ({inner['sourcePinsMatch']})",
    'fixed replay: 42 events / 38 Go updates / 39 state checkpoints; swaps 1 accepted + 1 rejected; mutation controls 12/12',
    'seeded replay: 20261031, 20261032, 20261033; 60 events each; mounted browser only for 20261031',
    f"HTTP smoke: {len(smoke['checks'])}/{len(smoke['checks'])} passed; archive: {archive['memberCount']} members, independent consumer passed",
    f"current full source 462 status: reported in progress by root; this audit does not treat it as completed",
]
(raw / 'E-RELEASE-CONTRACT-MATRIX-audit.log').write_text('\n'.join(lines) + '\n')
(raw / 'E-RELEASE-CONTRACT-MATRIX-audit.exit-code').write_text('0\n')
print('\n'.join(lines))
