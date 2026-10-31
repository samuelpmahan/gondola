#!/usr/bin/env python3
"""Read-only cross-checks for the frozen source462 final acceptance packet."""
import hashlib
import json
import os
import subprocess
import tarfile
import zipfile
from pathlib import Path

PRIMARY = Path('/workspace/scratch/39a56936f173/gondola-next')
SOURCE = Path('/workspace/scratch/39a56936f173/gondola-children-archive')
ATTEMPT = 'attempt-20261031T144222262Z-7'
ATTEMPT_ROOT = SOURCE / 'compiled-children/demo/output/attempts' / ATTEMPT
LOCAL_TAR = ATTEMPT_ROOT.with_suffix('.tar.gz')
LOCAL_MANIFEST = ATTEMPT_ROOT.with_suffix('.archive-manifest.json')
HOSTED_DIR = Path('/tmp/gondola-source462-ci')
CI_ZIP = HOSTED_DIR / 'children.zip'
CI_TAR = HOSTED_DIR / 'children-final.tar.gz'
COUNTER_ZIP = HOSTED_DIR / 'counter.zip'
N6_RECEIPT_PATH = PRIMARY / 'compiled-children/coordination/receipts/E-FINAL-ACCEPTANCE.json'
N6_REPORT_PATH = PRIMARY / 'compiled-children/coordination/reports/E-FINAL-ACCEPTANCE.md'
EDELIVERY_PATH = PRIMARY / 'compiled-children/coordination/current-full-source-462/E-DELIVERY.json'
RAWLOG_DIR = PRIMARY / 'compiled-children/coordination/rawlogs/E-FINAL-ACCEPTANCE-20261031-01'
COUNTER_TRACE_MEMBER = 'build/interaction-traces-seed-20261030.json'


def digest_file(path):
    h = hashlib.sha256()
    size = 0
    with open(path, 'rb') as f:
        while True:
            block = f.read(1024 * 1024)
            if not block:
                break
            size += len(block)
            h.update(block)
    return size, h.hexdigest()


def digest_stream(stream):
    h = hashlib.sha256()
    size = 0
    chunks = []
    while True:
        block = stream.read(1024 * 1024)
        if not block:
            break
        size += len(block)
        h.update(block)
        if size <= 2 * 1024 * 1024:
            chunks.append(block)
    return size, h.hexdigest(), b''.join(chunks) if size <= 2 * 1024 * 1024 else None


def load_json(path):
    return json.loads(Path(path).read_text())


def source_path(path):
    p = Path(path)
    return p if p.is_absolute() else SOURCE / p


def verify_tar_stream(stream, expected_members):
    expected = {m['path']: m for m in expected_members}
    observed = {}
    parsed = {}
    total_bytes = 0
    with tarfile.open(fileobj=stream, mode='r|gz') as tf:
        for ti in tf:
            if not ti.isfile():
                raise AssertionError(f'non-regular tar member: {ti.name}')
            if ti.name in observed:
                raise AssertionError(f'duplicate tar path: {ti.name}')
            h = hashlib.sha256()
            size = 0
            capture = bytearray() if ti.name in {
                'harness/run.check.json', 'harness/run.seeded.json',
                'demo/smoke.json', 'harness/run.native.json',
            } else None
            src = tf.extractfile(ti)
            if src is None:
                raise AssertionError(f'unreadable tar member: {ti.name}')
            while True:
                block = src.read(1024 * 1024)
                if not block:
                    break
                size += len(block)
                h.update(block)
                if capture is not None:
                    capture.extend(block)
            actual = {'path': ti.name, 'bytes': size, 'sha256': h.hexdigest()}
            observed[ti.name] = actual
            total_bytes += size
            if ti.name in expected and actual != expected[ti.name]:
                raise AssertionError(f'tar member mismatch: {ti.name}')
            if ti.name not in expected:
                raise AssertionError(f'unmanifested tar member: {ti.name}')
            if capture is not None:
                parsed[ti.name] = json.loads(bytes(capture))
    if set(observed) != set(expected):
        raise AssertionError(f'tar member set mismatch; expected={len(expected)} actual={len(observed)}')
    return {'members': len(observed), 'uncompressedBytes': total_bytes, 'captured': parsed}


def verify_zip_tar(zip_path, archive_member, manifest_member, expected_archive, expected_manifest):
    with zipfile.ZipFile(zip_path) as zf:
        bad_member = zf.testzip()
        if bad_member is not None:
            raise AssertionError(f'ZIP CRC failure: {bad_member}')
        archive_info = zf.getinfo(archive_member)
        with zf.open(archive_member) as raw:
            size, sha, _ = digest_stream(raw)
        if {'bytes': size, 'sha256': sha} != {'bytes': expected_archive['bytes'], 'sha256': expected_archive['sha256']}:
            raise AssertionError('embedded archive hash/size mismatch')
        manifest_bytes = zf.read(manifest_member)
        manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
        if {'bytes': len(manifest_bytes), 'sha256': manifest_sha} != {'bytes': expected_manifest['bytes'], 'sha256': expected_manifest['sha256']}:
            raise AssertionError('embedded manifest hash/size mismatch')
        manifest = json.loads(manifest_bytes)
        with zf.open(archive_member) as raw:
            tar_result = verify_tar_stream(raw, manifest['members'])
        return {
            'zipMembers': len(zf.infolist()),
            'zipCrcPassed': True,
            'embeddedArchiveBytes': size,
            'embeddedArchiveSha256': sha,
            'embeddedManifestBytes': len(manifest_bytes),
            'embeddedManifestSha256': manifest_sha,
            'tar': {k: v for k, v in tar_result.items() if k != 'captured'},
            'captured': tar_result['captured'],
            'zipArchiveMemberBytes': archive_info.file_size,
        }


def main():
    receipt = load_json(N6_RECEIPT_PATH)
    edelivery = load_json(EDELIVERY_PATH)
    report_bytes = N6_REPORT_PATH.read_bytes()
    checks = {}
    if edelivery['status'] != 'passed' or edelivery.get('failures') or edelivery.get('mismatches') or len(edelivery['stages']) != 10 or not all(s['status'] == 'passed' for s in edelivery['stages']):
        raise AssertionError('local E-DELIVERY stage/failure status mismatch')
    if receipt['localFullRun']['exitCode'] != 0 or receipt['localFullRun']['allStagesPassed'] is not True or receipt['localFullRun']['failures'] != 0 or receipt['localFullRun']['mismatches'] != 0:
        raise AssertionError('N6 local E-DELIVERY summary mismatch')

    # Frozen N6 packet identity and its own evidence manifest.
    checks['n6Packet'] = {
        'reportBytes': len(report_bytes),
        'reportSha256': hashlib.sha256(report_bytes).hexdigest(),
        'receiptBytes': N6_RECEIPT_PATH.stat().st_size,
        'receiptSha256': digest_file(N6_RECEIPT_PATH)[1],
    }
    if checks['n6Packet'] != {
        'reportBytes': 6973,
        'reportSha256': '9bb8fa642415fa117a037815000b45873b0b228342bd3ac38dd237a1e37a0677',
        'receiptBytes': 25408,
        'receiptSha256': 'a44b0287e9bc2fcffe8e13b0d46f477fd551df5ab3d23359237ba63aecd20bce',
    }:
        raise AssertionError('frozen N6 packet identity mismatch')
    outer_receipt_pin = receipt['localFullRun']['outerReceipt']
    outer_report_pin = receipt['localFullRun']['outerReport']
    for item in (outer_receipt_pin, outer_report_pin, receipt['localFullRun']['outerConsole']):
        size, sha = digest_file(PRIMARY / item['path'])
        if size != item['bytes'] or sha != item['sha256']:
            raise AssertionError(f'local E-DELIVERY evidence pin mismatch: {item["path"]}')
    fixed_trace_pin = receipt['localFullRun']['fixedTraceCapture']
    size, sha = digest_file(source_path(fixed_trace_pin['path']))
    if size != fixed_trace_pin['bytes'] or sha != fixed_trace_pin['sha256']:
        raise AssertionError(f'local E-DELIVERY evidence pin mismatch: {fixed_trace_pin["path"]}')
    manifest_path = PRIMARY / receipt['rawlogManifest']['path']
    manifest_size, manifest_sha = digest_file(manifest_path)
    if (manifest_size, manifest_sha) != (receipt['rawlogManifest']['bytes'], receipt['rawlogManifest']['sha256']):
        raise AssertionError('N6 rawlog manifest pin mismatch')
    manifest = load_json(manifest_path)
    raw_entries = manifest.get('files', manifest.get('rawlogs', manifest.get('members')))
    if raw_entries is None:
        raise AssertionError(f'unknown rawlog manifest schema: {list(manifest)}')
    rawlog_pins = {item['path']: item for item in receipt['rawlogs']}
    manifest_pins = {item['path']: item for item in raw_entries}
    if len(rawlog_pins) != 37 or len(manifest_pins) != 36:
        raise AssertionError('unexpected N6 rawlog inventory size')
    if set(manifest_pins) != set(rawlog_pins) - {receipt['rawlogManifest']['path']}:
        raise AssertionError('rawlog manifest does not enumerate N6 rawlogs')
    for item in receipt['rawlogs']:
        path = PRIMARY / item['path']
        size, sha = digest_file(path)
        if size != item['bytes'] or sha != item['sha256']:
            raise AssertionError(f'N6 rawlog mismatch: {item["path"]}')
    checks['n6Rawlogs'] = {'receiptEntries': len(rawlog_pins), 'manifestEntries': len(manifest_pins), 'allPinsMatch': True}

    # Prior closed acceptance/review packet bytes remain as pinned.
    packet_results = []
    for item in receipt['closedPacketPins']:
        size, sha = digest_file(PRIMARY / item['path'])
        if size != item['bytes'] or sha != item['sha256']:
            raise AssertionError(f'closed packet pin mismatch: {item["path"]}')
        packet_results.append(item['path'])
    checks['closedPriorPackets'] = {'count': len(packet_results), 'allPinsMatch': True}

    # Compare local source462 run pins against the correct physical checkout.
    commit = subprocess.check_output(['git', '-C', str(SOURCE), 'rev-parse', 'HEAD'], text=True).strip()
    if commit != '462a9827bfe1980600456b00d0a67843eaa9756d':
        raise AssertionError(f'wrong physical source commit: {commit}')
    before, after = edelivery['sourceBefore'], edelivery['sourceAfter']
    if before != after or len(before) != 147:
        raise AssertionError('local 147-pin before/after list changed')
    for item in before:
        size, sha = digest_file(SOURCE / item['path'])
        if size != item['bytes'] or sha != item['sha256']:
            raise AssertionError(f'source462 pin mismatch: {item["path"]}')
    checks['localSourcePins'] = {'commit': commit, 'count': len(before), 'beforeAfterEqual': True, 'allPhysicalFilesMatch': True}

    # Validate exact local archive, external manifest, and the prior correction.
    local_archive = edelivery['archive']
    local_manifest = edelivery['archive']['manifest']
    local_archive_path = source_path(local_archive['path'])
    local_manifest_path = source_path(local_manifest['path'])
    local_archive_size, local_archive_sha = digest_file(local_archive_path)
    local_manifest_size, local_manifest_sha = digest_file(local_manifest_path)
    if {'bytes': local_archive_size, 'sha256': local_archive_sha} != {'bytes': local_archive['bytes'], 'sha256': local_archive['sha256']}:
        raise AssertionError('local archive outer hash/size mismatch')
    if {'bytes': local_manifest_size, 'sha256': local_manifest_sha} != {'bytes': local_manifest['bytes'], 'sha256': local_manifest['sha256']}:
        raise AssertionError('local manifest hash/size mismatch')
    local_manifest_data = load_json(local_manifest_path)
    if local_manifest_data['members'] != local_archive['members'] or len(local_archive['members']) != 417:
        raise AssertionError('local receipt and external manifest member inventory differs')
    with open(local_archive_path, 'rb') as raw:
        local_tar = verify_tar_stream(raw, local_manifest_data['members'])
    fixed = local_tar['captured']['harness/run.check.json']
    fixed_native = local_tar['captured']['harness/run.native.json']
    seeded = local_tar['captured']['harness/run.seeded.json']
    smoke = local_tar['captured']['demo/smoke.json']
    local_checks = edelivery['harness']['summary']
    if (local_checks['events'], local_checks['ticks'], local_checks['mutationControlsDetected']) != (42, 39, 12):
        raise AssertionError('local fixed conformance summary counts mismatch')
    if fixed.get('status') != 'matched' or (fixed.get('events'), fixed.get('goUpdates'), fixed.get('stateCheckpoints')) != (42, 38, 39):
        raise AssertionError('archived fixed checker summary mismatch')
    if (fixed.get('physicalClicksPerProfile'), fixed.get('swaps'), fixed.get('acceptedCompatibleSwaps'), fixed.get('rejectedIncompatibleSwaps'), fixed.get('requests'), fixed.get('cancellations'), fixed.get('staleGenerationHostRepliesRejected'), fixed.get('disabledActionsFenced')) != (27, 2, 1, 1, 12, 6, 1, 1):
        raise AssertionError('archived fixed interaction/lifecycle coverage mismatch')
    if not all(fixed.get(k) is True for k in ['nativeStateCheckedAgainstLiteralOracle', 'directTypedStateCheckedAgainstLiteralOracle', 'browserRawDOMCheckedAgainstLiteralOracle', 'rendererLifecycleChecked']):
        raise AssertionError('archived fixed state/renderer parity checks are not all true')
    if fixed.get('browserProfiles') != ['react', 'dom', 'swap'] or fixed.get('noWasmGuardCoverage', {}).get('status') != 'complete' or fixed.get('noWasmGuardCoverage', {}).get('failures') != 0:
        raise AssertionError('archived fixed browser profile/No-WASM coverage mismatch')
    if len(fixed.get('mutationControls', [])) != 12 or not all(x.get('detected') for x in fixed['mutationControls']):
        raise AssertionError('fixed mutation control evidence is incomplete')
    if not all(x.get('passed') for x in smoke.get('checks', [])) or len(smoke.get('checks', [])) != 32:
        raise AssertionError('local HTTP demo smoke check evidence mismatch')
    native_member = next(x for x in local_manifest_data['members'] if x['path'] == 'harness/run.native.json')
    oracle_capture = edelivery['oracle']['nativeCapture']
    if (oracle_capture['bytes'], oracle_capture['sha256']) != (native_member['bytes'], native_member['sha256']):
        raise AssertionError('literal oracle capture does not match archived fresh native output')
    if (edelivery['oracle']['tap']['tests'], edelivery['oracle']['tap']['pass'], edelivery['oracle']['tap']['fail']) != (9, 9, 0):
        raise AssertionError('literal oracle TAP counters mismatch')
    if (edelivery['unitTests']['status'], edelivery['unitTests']['tap']['tests'], edelivery['unitTests']['tap']['pass'], edelivery['unitTests']['tap']['fail']) != ('passed', 46, 46, 0):
        raise AssertionError('unit test count mismatch')
    seeded_results = seeded.get('results', [])
    if len(seeded_results) != 3:
        raise AssertionError('seeded run count mismatch')
    seeded_rows = []
    for run in seeded_results:
        mounted = run.get('outputs', {}).get('browser') is not None
        seeded_rows.append({'seed': run.get('seed'), 'events': run.get('events'), 'goUpdates': run.get('goUpdates'), 'mountedBrowser': mounted})
    if [(x['seed'], x['events'], x['goUpdates'], x['mountedBrowser']) for x in seeded_rows] != [
        (20261031, 60, 59, True), (20261032, 60, 59, False), (20261033, 60, 59, False),
    ]:
        raise AssertionError(f'seeded browser/run coverage mismatch: {seeded_rows}')
    if edelivery['oracle']['nativeCapture']['args'] != ['run', './cmd/compiled-children-native', '--script', 'fixtures/compiled/children/scenario.json']:
        raise AssertionError('literal oracle did not identify fresh native CLI capture')
    consumer = next(x for x in edelivery['commands'] if x['name'] == 'independent-post-command-archive-consumer')
    consumer_args = consumer['args']
    expected_sha = local_manifest['sha256']
    if consumer['exitCode'] != 0 or consumer_args[consumer_args.index('--expected-manifest-sha256') + 1] != expected_sha:
        raise AssertionError('actual archive consumer command/hash mismatch')
    if Path(consumer_args[consumer_args.index('--archive') + 1]).name != 'attempt-20261031T144222262Z-7.tar.gz':
        raise AssertionError('actual executed consumer archive path mismatch')
    checks['localArchive'] = {
        'archiveBytes': local_archive_size, 'archiveSha256': local_archive_sha,
        'manifestBytes': local_manifest_size, 'manifestSha256': local_manifest_sha,
        'tarMembers': local_tar['members'], 'uncompressedBytes': local_tar['uncompressedBytes'],
        'fixedTrace': {'events': 42, 'goUpdates': 38, 'stateCheckpoints': 39, 'swaps': 2, 'mutationControls': 12},
        'literalOracleUsesFreshNativeCapture': True,
        'actualConsumerExitCode': consumer['exitCode'], 'actualConsumerExpectedManifestSha256': expected_sha,
        'literalOracle': {'tests': 9, 'pass': 9, 'fail': 0}, 'unitTests': {'tests': 46, 'pass': 46, 'fail': 0},
        'seededRuns': seeded_rows, 'smokeChecks': {'count': len(smoke.get('checks', [])), 'allPassed': True},
    }
    # Cross-check events/update count directly from native trace, preserving original distinction.
    if len(fixed_native['steps']) != 38 or len(fixed_native['events']) != 42:
        raise AssertionError(f'fixed native trace shape mismatch: steps={len(fixed_native["steps"])} events={len(fixed_native["events"])}')
    # Verify the actual hosted source462 child artifact (no extraction/copy).
    hosted = receipt['hostedChildrenCI']
    ci_zip_size, ci_zip_sha = digest_file(CI_ZIP)
    if {'bytes': ci_zip_size, 'sha256': ci_zip_sha} != hosted['zip']:
        raise AssertionError('hosted child ZIP hash/size mismatch')
    child_archive_member = hosted['innerArchive']['path']
    child_manifest_member = child_archive_member.replace('.tar.gz', '.archive-manifest.json')
    hosted_tar_file_size, hosted_tar_file_sha = digest_file(CI_TAR)
    if {'bytes': hosted_tar_file_size, 'sha256': hosted_tar_file_sha} != {'bytes': hosted['innerArchive']['bytes'], 'sha256': hosted['innerArchive']['sha256']}:
        raise AssertionError('standalone hosted final tar hash/size mismatch')
    child_zip_result = verify_zip_tar(CI_ZIP, child_archive_member, child_manifest_member,
                                      hosted['innerArchive'], hosted['manifest'])
    if child_zip_result['zipMembers'] != 1893 or child_zip_result['tar']['members'] != 417:
        raise AssertionError('hosted child ZIP/tar inventory mismatch')
    for name, pin in hosted['proofFilePins'].items():
        path = HOSTED_DIR / name
        size, sha = digest_file(path)
        if size != pin['bytes'] or sha != pin['sha256']:
            raise AssertionError(f'hosted artifact proof file pin mismatch: {name}')
    child_hosted_receipt = load_json(HOSTED_DIR / 'children-E-DELIVERY.json')
    if child_hosted_receipt['sourceBefore'] != child_hosted_receipt['sourceAfter'] or len(child_hosted_receipt['sourceBefore']) != 147:
        raise AssertionError('hosted child source pins not stable/count 147')
    child_ci = load_json(HOSTED_DIR / 'children-ci.json')
    if child_ci['artifact']['workflow_run']['head_sha'] != commit or child_ci['conclusion'] != 'success':
        raise AssertionError('hosted child receipt commit mismatch')
    if not child_hosted_receipt['sourcePinsMatch'] or child_hosted_receipt['status'] != 'passed' or child_hosted_receipt.get('failures') or child_hosted_receipt.get('mismatches') or len(child_hosted_receipt['stages']) != 10 or not all(s['status'] == 'passed' for s in child_hosted_receipt['stages']):
        raise AssertionError('hosted child receipt status/source pin mismatch')
    checks['hostedChildren'] = {
        'run': hosted['run'], 'zipBytes': ci_zip_size, 'zipSha256': ci_zip_sha,
        'zipMembers': child_zip_result['zipMembers'], 'zipCrcPassed': True,
        'innerTarMembers': child_zip_result['tar']['members'],
        'innerTarUncompressedBytes': child_zip_result['tar']['uncompressedBytes'],
        'standaloneFinalTarMatches': True,
        'manifestHashesMatch': True, 'proofFilePinsMatch': True,
        'sourcePins': 147, 'sourceBeforeAfterEqual': True, 'sourceCommit': commit,
    }

    # Verify separate hosted Counter artifact and trace header, without treating it as local.
    counter = receipt['hostedCounterCI']
    counter_zip_size, counter_zip_sha = digest_file(COUNTER_ZIP)
    if {'bytes': counter_zip_size, 'sha256': counter_zip_sha} != counter['zip']:
        raise AssertionError('Counter ZIP hash/size mismatch')
    with zipfile.ZipFile(COUNTER_ZIP) as zf:
        if zf.testzip() is not None:
            raise AssertionError('Counter ZIP CRC error')
        info = zf.getinfo(COUNTER_TRACE_MEMBER)
        with zf.open(COUNTER_TRACE_MEMBER) as stream:
            counter_trace_size, counter_trace_sha, _ = digest_stream(stream)
    if {'bytes': counter_trace_size, 'sha256': counter_trace_sha} != counter['trace']:
        raise AssertionError('Counter trace hash/size mismatch')
    header = load_json(HOSTED_DIR / 'counter-trace-header.json')
    if (header['seed'], header['scenarioCount'], header['ticks'], header['nativeMatched'], len(header['mismatches'])) != (20261030, 107, 4473, 107, 0):
        raise AssertionError('Counter trace header mismatch')
    counter_meta = load_json(HOSTED_DIR / 'counter-ci.json')
    if counter_meta['artifact']['workflow_run']['head_sha'] != commit or counter_meta['conclusion'] != 'success':
        raise AssertionError('Counter CI run source/conclusion mismatch')
    checks['hostedCounter'] = {
        'run': counter['run'], 'zipBytes': counter_zip_size, 'zipSha256': counter_zip_sha,
        'zipCrcPassed': True, 'traceMember': COUNTER_TRACE_MEMBER,
        'traceBytes': counter_trace_size, 'traceSha256': counter_trace_sha,
        'traceHeader': {'seed': header['seed'], 'scenarios': header['scenarioCount'], 'ticks': header['ticks'], 'nativeMatched': header['nativeMatched'], 'mismatches': len(header['mismatches'])},
        'sourceCommit': commit,
    }

    # Verify the two historical containers' identity/count only; do not widen the 903-file claim.
    history = receipt['historicalCustody']
    historical = []
    for label, meta in [('selectedPublished', history['selectedPublished']), ('retry1Superseded', history['retry1Superseded'])]:
        path = PRIMARY / meta['path']
        size, sha = digest_file(path)
        if size != meta['bytes'] or sha != meta['sha256']:
            raise AssertionError(f'historical container pin mismatch: {label}')
        with tarfile.open(path, 'r:gz') as tf:
            count = sum(1 for ti in tf if ti.isfile())
        if count != meta['members']:
            raise AssertionError(f'historical member count mismatch: {label}')
        historical.append({'label': label, 'bytes': size, 'sha256': sha, 'members': count})
    boundary = history['unresolvedCleanupBoundary']
    if boundary['identityProven'] or boundary['all903RecoveryClaim'] or boundary['unverifiedExtraBytes'] != 29884416:
        raise AssertionError('historical 903-file boundary was changed/overstated')
    checks['historicalCustody'] = {'verifiedContainers': historical, 'removedFiles': boundary['removedFiles'], 'unverifiedExtraBytes': boundary['unverifiedExtraBytes'], 'identityProven': False, 'all903RecoveryClaim': False}

    checks['broaderMatrixAsCaptured'] = receipt['relatedHostedStatus']['broaderMatrixLatest']
    # Later root-supplied current status is a separate observation, not a rewrite of packet history.
    matrix_path = PRIMARY / 'compiled-children/coordination/ci-final-matrix-source462.json'
    if matrix_path.exists():
        matrix = load_json(matrix_path)
        rows = matrix.get('entries', [])
        current = {
            'path': str(matrix_path), 'bytes': matrix_path.stat().st_size, 'sha256': digest_file(matrix_path)[1],
            'schema': matrix.get('schema'), 'observedAt': matrix.get('observedAt'), 'available': True,
            'source': matrix.get('source'), 'status': matrix.get('status'), 'runs': matrix.get('runs'),
            'distinctWorkflows': matrix.get('distinctWorkflows'),
            'allCompletedSuccess': bool(rows) and all(r.get('status') == 'completed' and r.get('conclusion') == 'success' for r in rows),
            'allExactSource': bool(rows) and all(r.get('head_sha') == commit for r in rows),
            'events': sorted({r.get('event') for r in rows}),
            'uniqueWorkflowNames': len({r.get('name') for r in rows}),
        }
        if (current['source'], current['runs'], current['distinctWorkflows'], current['allCompletedSuccess'], current['allExactSource'], current['events'], current['uniqueWorkflowNames']) != (commit, 32, 16, True, True, ['pull_request', 'push'], 16):
            raise AssertionError(f'current final CI matrix mismatch: {current}')
        checks['broaderMatrixCurrent'] = current
    else:
        checks['broaderMatrixCurrent'] = {'available': False}

    validator_path = PRIMARY / 'compiled-children/coordination/rawlogs/XR-FINAL-ACCEPTANCE-20261031-01/receipt-validation.stdout.json'
    validator = load_json(validator_path)
    if validator.get('status') != 'valid' or not validator.get('schedulerStateUnchanged'):
        raise AssertionError('completed E-FINAL-ACCEPTANCE receipt validation did not pass')
    checks['closedReceiptProtocol'] = validator

    result = {
        'schema': 'gobi.compiled-children-xr-final-review/v1',
        'reviewer': 'N5',
        'decision': 'accepted',
        'scope': 'frozen E-FINAL-ACCEPTANCE source462 local/hosted evidence only; no full rerun; no source or scheduler edits',
        'checks': checks,
    }
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
