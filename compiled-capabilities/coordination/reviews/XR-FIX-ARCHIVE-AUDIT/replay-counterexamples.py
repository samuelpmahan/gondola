from __future__ import annotations
import importlib.util
import sys
from pathlib import Path

root = Path.cwd()
archive_dir = root / 'compiled-capabilities/coordination/acceptance/archive'
sys.path.insert(0, str(archive_dir))
spec = importlib.util.spec_from_file_location('old_deep_probes', root / 'compiled-capabilities/coordination/reviews/XR-PREP-ARCHIVE/deep-probes.py')
old = importlib.util.module_from_spec(spec)
spec.loader.exec_module(old)
verifier = old.verifier

def checked(label, fixture, expected):
    try:
        verifier.verify_objects(*fixture, require_complete=True)
    except verifier.VerificationError as exc:
        if expected not in str(exc):
            raise AssertionError(f'{label}: rejected for unexpected reason: {exc}') from exc
        print(f'REJECTED {label}: {exc}')
    else:
        raise AssertionError(f'{label}: unexpectedly accepted')

checked('wrong React version', old.build_fixture(
    snapshot=lambda s: (
        s['toolchainAndDependencies']['versions']['dependencies'].update(react='18.0.0'),
        s['executionReceiptBeforeArchive']['versions']['dependencies'].update(react='18.0.0'),
    ), receipt=lambda r: r['versions']['dependencies'].update(react='18.0.0')),
    'react 19.3.1')
checked('consistent Node 18', old.build_fixture(
    snapshot=lambda s: (
        s['toolchainAndDependencies']['versions'].update(node='v18.0.0'),
        s['executionReceiptBeforeArchive']['versions'].update(node='v18.0.0')),
    receipt=lambda r: r['versions'].update(node='v18.0.0')),
    'Node 22.x')
checked('inconsistent locked React', old.build_fixture(
    snapshot=lambda s: (
        s['toolchainAndDependencies']['versions']['lockedDependencies'].update(react='18.0.0'),
        s['executionReceiptBeforeArchive']['versions']['lockedDependencies'].update(react='18.0.0')),
    receipt=lambda r: r['versions']['lockedDependencies'].update(react='18.0.0')),
    'lock metadata must pin react 19.3.1')
checked('nonzero pre-archive command', old.build_fixture(
    snapshot=lambda s: (
        s['commandLedger'][0].update(exitCode=23),
        s['executionReceiptBeforeArchive']['commands'][0].update(exitCode=23)),
    receipt=lambda r: r['commands'][0].update(exitCode=23)),
    'snapshot.commandLedger[0] did not exit successfully')
checked('nonzero final archive command', old.build_fixture(
    receipt=lambda r: r['commands'][-3].update(exitCode=17)),
    'outer receipt.commands[1] did not exit successfully')
checked('snapshot status passed', old.build_fixture(
    snapshot=lambda s: s.update(status='passed')),
    'immutable snapshot status must be archive_pending')
checked('outer snapshot status passed', old.build_fixture(
    receipt=lambda r: r['archive']['executionSnapshot'].update(status='passed')),
    'outer immutable execution snapshot status contradicts')
checked('file/directory collision', old.build_fixture(directory_collision=True),
    'regular-file/directory path collisions')
checked('pre-archive signal', old.build_fixture(
    snapshot=lambda s: (
        s['commandLedger'][0].update(signal='SIGTERM'),
        s['executionReceiptBeforeArchive']['commands'][0].update(signal='SIGTERM')),
    receipt=lambda r: r['commands'][0].update(signal='SIGTERM')),
    'snapshot.commandLedger[0] records signal')
checked('final command error', old.build_fixture(
    receipt=lambda r: r['commands'][-3].update(error='tar failed')),
    'outer receipt.commands[1] records command error')
checked('symlink member', old.build_fixture(special_type=verifier.tarfile.SYMTYPE), 'unsupported member type')
checked('hardlink member', old.build_fixture(special_type=verifier.tarfile.LNKTYPE), 'unsupported member type')
checked('extra unmanifested member', old.build_fixture(add_extra=True), 'unmanifested member')
checked('missing listed member', old.build_fixture(omit_member='react/build-result.json'), 'inventory differs from manifest')
checked('post-run source pin mismatch', old.build_fixture(
    receipt=lambda r: r.update(sourceAfter=[{'path':'src/main.go','bytes':3,'sha256':'b'*64}])),
    'final sourceAfter differs from sourceBefore')
print('counterexample replay passed: 15 expected rejections')
