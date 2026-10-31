#!/usr/bin/env python3
"""Read-only independent audit of E-ACCEPTANCE's pinned full-run evidence."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tarfile

PRIMARY = Path.cwd().resolve()
SOURCE = Path('/workspace/scratch/39a56936f173/gondola-children-archive')
COORD = PRIMARY / 'compiled-children/coordination'
ACCEPTANCE = json.loads((COORD / 'receipts/E-ACCEPTANCE.json').read_text())
REPORT_PATH = PRIMARY / ACCEPTANCE['report']['path']
RAWROOT = PRIMARY / 'compiled-children/coordination/rawlogs/E-ACCEPTANCE-20261031-01'
DELIVERY_PATH = PRIMARY / 'compiled-children/coordination/current-full-source-462/E-DELIVERY.json'
DELIVERY = json.loads(DELIVERY_PATH.read_text())

def digest_path(path):
    h = hashlib.sha256()
    size = 0
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
            size += len(block)
    return {'bytes': size, 'sha256': h.hexdigest()}

def pin(path, expected):
    actual = digest_path(path)
    assert actual == {'bytes': expected['bytes'], 'sha256': expected['sha256']}, (str(path), actual, expected)
    return actual

# Validate N6's report, all 27 rawlogs, and separate rawlog manifest.
pin(REPORT_PATH, ACCEPTANCE['report'])
assert len(ACCEPTANCE['rawlogs']) == 28
for item in ACCEPTANCE['rawlogs']:
    pin(PRIMARY / item['path'], item)
manifest_pin = ACCEPTANCE['rawlogManifest']
raw_manifest_path = PRIMARY / manifest_pin['path']
pin(raw_manifest_path, manifest_pin)
raw_manifest = json.loads(raw_manifest_path.read_text())
assert raw_manifest['rawlogCount'] == 27
receipt_logs = [x for x in ACCEPTANCE['rawlogs'] if x['path'] != manifest_pin['path']]
assert len(receipt_logs) == raw_manifest['rawlogCount'] == 27
assert [(x['path'], x['bytes'], x['sha256']) for x in raw_manifest['rawlogs']] == [
    (x['path'], x['bytes'], x['sha256']) for x in receipt_logs
]

# Bind N6 to the actual source462 full-run delivery evidence, not the original E-DELIVERY packet.
assert DELIVERY['schema'] == 'gobi.compiled-children-execution/v1'
assert DELIVERY['job_id'] == 'E-DELIVERY' and DELIVERY['worker'] == 'N6'
assert DELIVERY['mode'] == 'full' and DELIVERY['status'] == 'passed'
assert DELIVERY['failures'] == [] and DELIVERY['mismatches'] == []
assert DELIVERY['sourcePinsMatch'] is True and DELIVERY['boundariesVerified'] is True
assert len(DELIVERY['stages']) == 10 and all(s['status'] == 'passed' for s in DELIVERY['stages'])
assert pin(DELIVERY_PATH, ACCEPTANCE['evidence']['outerReceipt'])
outer_report_path = PRIMARY / ACCEPTANCE['evidence']['outerReport']['path']
pin(outer_report_path, ACCEPTANCE['evidence']['outerReport'])
console_path = PRIMARY / ACCEPTANCE['evidence']['outerConsole']['path']
pin(console_path, ACCEPTANCE['evidence']['outerConsole'])

# Rehash all 147 source files in the archived source tree against pre/post records.
before = DELIVERY['sourceBefore']
after = DELIVERY['sourceAfter']
assert len(before) == len(after) == 147
assert before == after
boundaries = DELIVERY['boundaries']
assert len(boundaries) == 2 and boundaries[0]['count'] == boundaries[1]['count'] == 147
assert boundaries[0]['sha256'] == boundaries[1]['sha256'] == ACCEPTANCE['source']['boundarySha256']
source_mismatches = []
for expected in before:
    rel = PurePosixPath(expected['path'])
    if rel.is_absolute() or '..' in rel.parts:
        source_mismatches.append({'path': expected['path'], 'error': 'unsafe source pin'})
        continue
    path = SOURCE.joinpath(*rel.parts)
    try:
        path.resolve().relative_to(SOURCE.resolve())
        actual = digest_path(path)
    except (OSError, ValueError) as exc:
        source_mismatches.append({'path': expected['path'], 'error': str(exc)})
        continue
    if actual != {'bytes': expected['bytes'], 'sha256': expected['sha256']}:
        source_mismatches.append({'path': expected['path'], 'expected': expected, 'actual': actual})
assert not source_mismatches, json.dumps(source_mismatches[:3])

# Stream-hash the actual archive and every member against its external manifest. No extraction/copy.
archive_meta = DELIVERY['archive']
archive_path = SOURCE / archive_meta['path']
manifest_path = SOURCE / archive_meta['manifest']['path']
archive_before = archive_path.stat()
manifest_before = manifest_path.stat()
outer_archive_hash = digest_path(archive_path)
manifest_hash = digest_path(manifest_path)
pin(archive_path, archive_meta)
pin(manifest_path, archive_meta['manifest'])
manifest = json.loads(manifest_path.read_text())
expected_members = {m['path']: m for m in manifest['members']}
assert len(expected_members) == len(manifest['members']) == 417
seen = set()
member_bytes = 0
with archive_path.open('rb') as archive_file:
    with tarfile.open(fileobj=archive_file, mode='r|gz') as tar:
        for entry in tar:
            name = entry.name.rstrip('/')
            if entry.isdir():
                continue
            assert entry.isfile(), f'non-regular member: {name}'
            assert name in expected_members and name not in seen, name
            stream = tar.extractfile(entry)
            assert stream is not None
            h = hashlib.sha256()
            size = 0
            with stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    size += len(block)
                    h.update(block)
            expected = expected_members[name]
            assert size == entry.size == expected['bytes'], (name, size, entry.size, expected['bytes'])
            assert h.hexdigest() == expected['sha256'], (name, h.hexdigest(), expected['sha256'])
            seen.add(name)
            member_bytes += size
assert seen == set(expected_members)
assert (archive_before.st_size, archive_before.st_mtime_ns) == (archive_path.stat().st_size, archive_path.stat().st_mtime_ns)
assert (manifest_before.st_size, manifest_before.st_mtime_ns) == (manifest_path.stat().st_size, manifest_path.stat().st_mtime_ns)
assert len(seen) == archive_meta['memberCount'] == 417
manifest_by_path = {m['path']: m for m in manifest['members']}
native_pin = DELIVERY['oracle']['nativeCapture']
native_member = manifest_by_path['oracle/native.json']
assert {'bytes': native_member['bytes'], 'sha256': native_member['sha256']} == {'bytes': native_pin['bytes'], 'sha256': native_pin['sha256']}

# Check the independently executed archive consumer result and exact manifest hash.
consumer = json.loads((RAWROOT / 'independent-archive-consumer.json').read_text())
assert consumer['status'] == 'passed' and consumer['members'] == 417
assert consumer['archive']['sha256'] == archive_meta['sha256']
assert consumer['manifest']['sha256'] == archive_meta['manifest']['sha256']
commands_text = (RAWROOT / 'commands.txt').read_text()
recorded_hash = commands_text.split('--expected-manifest-sha256 ', 1)[1].split()[0]
executed = next(c for c in DELIVERY['commands'] if c['name'] == 'independent-post-command-archive-consumer')
executed_args = executed['args']
executed_hash = executed_args[executed_args.index('--expected-manifest-sha256') + 1]
assert executed['exitCode'] == 0

# Check the actual fixed trace, seeded schedules, mutation coverage, and smoke checks.
attempt_id = Path(DELIVERY['attempt']).name
attempt_root = SOURCE / 'compiled-children/demo/output/attempts' / attempt_id
harness = attempt_root / 'harness'
check = json.loads((harness / 'run.check.json').read_text())
native = json.loads((harness / 'run.native.json').read_text())
seeded = json.loads((harness / 'run.seeded.json').read_text())
assert check['status'] == 'matched'
assert check['events'] == len(native['events']) == 42
assert check['goUpdates'] == len(native['steps']) == 38
assert check['stateCheckpoints'] == 39
assert check['swaps'] == 2 and check['mutationControlsDetected'] == 12
assert all(m['detected'] is True for m in check['mutationControls'])
assert check['nativeStateCheckedAgainstLiteralOracle'] is True
assert check['directTypedStateCheckedAgainstLiteralOracle'] is True
assert check['browserRawDOMCheckedAgainstLiteralOracle'] is True
assert check['rendererLifecycleChecked'] is True
seed_rows = seeded['results']
assert [row['seed'] for row in seed_rows] == [20261031, 20261032, 20261033]
assert all(row['events'] == 60 and row['goUpdates'] == 59 for row in seed_rows)
assert seed_rows[0]['outputs']['browser'] is not None
assert seed_rows[1]['outputs']['browser'] is None and seed_rows[2]['outputs']['browser'] is None
assert check['mutationControlsDetected'] == ACCEPTANCE['evidence']['fixedCapture']['mutationControlsDetected'] == 12
assert check['events'] == ACCEPTANCE['evidence']['fixedCapture']['events'] == 42
assert ACCEPTANCE['evidence']['fixedCapture']['goTicks'] == 39
assert DELIVERY['unitTests']['tap']['tests'] == DELIVERY['unitTests']['tap']['pass'] == 46
assert DELIVERY['unitTests']['tap']['fail'] == 0
assert DELIVERY['oracle']['tap']['tests'] == DELIVERY['oracle']['tap']['pass'] == 9
assert DELIVERY['oracle']['tap']['fail'] == 0
assert DELIVERY['demo']['status'] == 'passed' and len(DELIVERY['demo']['checks']) == 32
assert all(c['passed'] for c in DELIVERY['demo']['checks'])
assert DELIVERY['buildComparison']['appIRByteIdentical'] is True
assert DELIVERY['buildComparison']['encoderByteIdentical'] is True
assert DELIVERY['buildComparison']['outputPathsIdentical'] is True
assert DELIVERY['buildComparison']['reactOutputCount'] == DELIVERY['buildComparison']['domOutputCount'] == 67
git_head = subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip()
assert git_head == ACCEPTANCE['source']['commit'] == '462a9827bfe1980600456b00d0a67843eaa9756d'

# M0 and historical baseline are proven by the already-pinned v3 verification result.
static = json.loads((RAWROOT / 'static-history-verification-v3.stdout.json').read_text())
assert static['status'] == 'matched' and static['m0Preservation']['status'] == 'passed'
assert static['m0Preservation']['rulesTestRows'] == 59
assert static['m0Preservation']['checksumEntryCount'] == 24 and static['m0Preservation']['allActualFilesMatch'] is True
assert static['historicalCounterBaseline']['scripts'] == 107
assert static['historicalCounterBaseline']['ticks'] == 4473
assert static['historicalCounterBaseline']['status'] == 'historical prior-run evidence; not rerun in source462'

# Verify source978's stage ordinal against its actual failed full-run artifact and old packet pins.
old_evidence = json.loads((RAWROOT / 'prior-matrix-preservation.json').read_text())
for item in old_evidence['files']:
    pin(PRIMARY / item['path'], item)
failed_delivery_path = SOURCE / 'compiled-children/coordination/failed-full-source-978/E-DELIVERY.json'
failed_delivery = json.loads(failed_delivery_path.read_text())
assert len(failed_delivery['stages']) == 10
inherited_indices = [i for i, s in enumerate(failed_delivery['stages']) if 'inherited' in s['name'].lower()]
assert len(inherited_indices) == 1
inherited_index = inherited_indices[0]
assert failed_delivery['stages'][0]['status'] == 'passed'
assert failed_delivery['stages'][inherited_index]['status'] == 'failed'
post_inherited = failed_delivery['stages'][inherited_index + 1:]
assert len(post_inherited) == 8 and all(s['status'] == 'passed' for s in post_inherited)
assert sum(s['status'] == 'passed' for s in failed_delivery['stages']) == 9
assert failed_delivery['status'] == 'failed' or failed_delivery.get('outcome') == 'failed'

# Identify the two packet metadata mismatches and the non-runtime command-log typo.
wrong_acceptance_archive_path = Path(ACCEPTANCE['evidence']['archive']['path'])
wrong_archive_exists = wrong_acceptance_archive_path.exists()
correct_archive_path = SOURCE / archive_meta['path']
assert not wrong_archive_exists
assert correct_archive_path.is_file()
assert recorded_hash != executed_hash
assert executed_hash == archive_meta['manifest']['sha256']

print(json.dumps({
    'schema': 'gobi.compiled-children-acceptance-review-audit/v1',
    'status': 'verified_with_packet_metadata_discrepancies',
    'acceptanceReport': {'path': ACCEPTANCE['report']['path'], **digest_path(REPORT_PATH)},
    'acceptanceRawlogs': {'receiptEntriesIncludingManifest': len(ACCEPTANCE['rawlogs']), 'manifestRawlogCount': raw_manifest['rawlogCount'], 'manifestPath': manifest_pin['path'], 'manifestMatchesListedPins': True},
    'currentFullSourceDelivery': {'path': str(DELIVERY_PATH), 'status': DELIVERY['status'], 'stages': len(DELIVERY['stages']), 'allPassed': True},
    'sourcePins': {'count': len(before), 'sourceBeforeEqualsSourceAfter': True, 'allPhysicalFilesMatch': True, 'boundarySha256': boundaries[0]['sha256'], 'gitHead': git_head, 'mismatches': []},
    'archive': {'path': str(archive_path), **outer_archive_hash, 'manifest': {'path': str(manifest_path), **manifest_hash}, 'members': len(seen), 'uncompressedMemberBytes': member_bytes, 'allMembersMatchManifest': True, 'streamedWithoutExtractionOrCopy': True},
    'archivePathDiscrepancy': {'acceptanceReceiptPath': str(wrong_acceptance_archive_path), 'exists': False, 'actualFullDeliveryPath': str(correct_archive_path), 'actualSha256': archive_meta['sha256'], 'actualBytes': archive_meta['bytes']},
    'manifestCommandTranscript': {'commandsTxtExpectedManifestSha256': recorded_hash, 'actualDeliveryCommandExpectedManifestSha256': executed_hash, 'actualCommandExitCode': executed['exitCode'], 'actualExecutedCommandMatchesManifest': True},
    'applicationChecks': {'unitTestsPassed': DELIVERY['unitTests']['tap']['pass'], 'literalOraclePassed': DELIVERY['oracle']['tap']['pass'], 'reactDomOutputsEach': DELIVERY['buildComparison']['reactOutputCount'], 'appIREncoderPathsIdentical': True, 'httpSmokePassed': len(DELIVERY['demo']['checks'])},
    'fixedTrace': {'eventCount': check['events'], 'goUpdateCount': check['goUpdates'], 'checkpointCount': check['stateCheckpoints'], 'nativeSteps': len(native['steps']), 'swapCount': check['swaps'], 'mutationControlsDetected': check['mutationControlsDetected'], 'acceptanceGoTicksReported': ACCEPTANCE['evidence']['fixedCapture']['goTicks'], 'nativeCaptureMemberMatchesReceipt': True},
    'seededRuns': [{'seed': row['seed'], 'events': row['events'], 'goUpdates': row['goUpdates'], 'mountedBrowser': row['outputs']['browser'] is not None} for row in seed_rows],
    'm0': {'status': static['m0Preservation']['status'], 'ruleRows': static['m0Preservation']['rulesTestRows'], 'checksumEntries': static['m0Preservation']['checksumEntryCount'], 'allActualFilesMatch': static['m0Preservation']['allActualFilesMatch']},
    'historicalCounter': {'scripts': static['historicalCounterBaseline']['scripts'], 'ticks': static['historicalCounterBaseline']['ticks'], 'currentRunClaim': False},
    'source978': {'totalStages': len(failed_delivery['stages']), 'preInheritedPassed': failed_delivery['stages'][0]['status'] == 'passed', 'inheritedStatus': failed_delivery['stages'][inherited_index]['status'], 'postInheritedPassed': len(post_inherited), 'nonInheritedPassed': 9, 'overallFailed': True, 'oldMatrixFilesPreserved': True},
    'sourceEditsOrArchiveCopy': False
}, indent=2))
