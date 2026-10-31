import hashlib
import json
from pathlib import Path
import sys

ROOT = Path.cwd()
RECEIPT = Path('compiled-capabilities/coordination/receipts/E-ACCEPT-DEMO.json')
REPORT = Path('compiled-capabilities/coordination/reports/E-ACCEPT-DEMO.md')

def load(path):
    return json.loads((ROOT / path).read_text())

def digest(path):
    h = hashlib.sha256()
    with (ROOT / path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def require(condition, label):
    if not condition:
        raise AssertionError(label)
    print(f'PASS {label}')

receipt = load(RECEIPT)
require(receipt['job_id'] == 'E-ACCEPT-DEMO' and receipt['worker'] == 'N5', 'author packet identity')
require(receipt['decision'] == 'accepted' and receipt['outcome'] == 'mixed_change', 'scoped decision/outcome fields')
require(receipt['sourceIdentity']['commit'] == '60b5aeff3172837ad7831c2b78b210454a3d81a2' and receipt['sourceIdentity']['tree'] == 'cc3a129b4372d00d5168135aa2e5687dfbf6788f', 'exact current source identity')
require(receipt['authoritativeCI']['sourceCommit'] == receipt['sourceIdentity']['commit'] and receipt['authoritativeCI']['sourceTree'] == receipt['sourceIdentity']['tree'], 'primary CI receipt binds to reviewed source')
require(digest(REPORT) == receipt['reviewArtifacts']['report']['sha256'], 'author report SHA-256')
checked = 0
for path, expected in receipt['source_sha256'].items():
    actual = digest(path)
    if actual != expected:
        raise AssertionError(f'source hash mismatch {path}: {actual} != {expected}')
    checked += 1
print(f'PASS {checked} author source_sha256 pins')

local = load('compiled-capabilities/ci/2026-10-31/source-60b5aef/demo/local-demo-audit.json')
primary = load('compiled-capabilities/ci/2026-10-31/source-60b5aef/demo/primary-demo-audit.json')
catalog = load('compiled-capabilities/ci/2026-10-31/source-60b5aef/demo/terminal-catalog-audit.json')
require(local['status'] == 'passed' and local['smoke']['checks'] == primary['smoke']['checks'], 'local and current CI demo assertions are identical and passed')
require(len(primary['smoke']['checks']) == 8, 'eight current-source browser assertions')
require(all(a['status'] == 200 for a in primary['smoke']['httpAssets']), 'served page, stylesheet, and bundle returned HTTP 200')
require(primary['smoke']['dispatchIds'] == [None, 'dispatch-0001', 'dispatch-0002', 'dispatch-0003', 'dispatch-0004'], 'four ordered dispatch IDs')
require(primary['smoke']['eventMessages'] == [None, 'addParent', 'requestParent', 'addParent', 'complete'], 'event sequence includes correlated reply completion')
require(primary['smoke']['finalState']['parentCount'] == 2 and primary['smoke']['finalState']['pending'] is False and primary['smoke']['finalState']['reply'] == 'parent:g1:r1', 'counter and pending reply final state')
require(primary['build']['requirements'] == ['view.node', 'numeric.safe-integer', 'numeric.float64', 'effect.request-reply', 'effect.cancel'], 'compiled AppIR capability requirements')
require(primary['build']['inputs']['appIR']['sha256'] == 'ed93e9ae6f9be20c306669d63b676ed466e65fee8dc7fd0a1a4c8a6b38f0a68a', 'primary AppIR pin')
require(primary['build']['inputs']['encoder']['sha256'] == '521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4', 'primary encoder pin')
require(primary['build']['inputs']['module']['sha256'] == 'e6768a43d409664c3a573520f548344c9d13502a8dc0c5100f2dd88d9d6c86c1', 'primary compiled module pin')
require(primary['build']['bundle']['sha256'] == '62d0e2cec181850aec5f1b081d7a4cc711355db200cd44be0cbfee05e30e1454', 'primary browser bundle pin')
require(all(not values for values in primary['smoke']['errors'].values()), 'no page, console, request, or WebAssembly errors')
require(primary['screenshot']['visuallyInspected'] is True and primary['screenshot']['sha256'] in receipt['source_sha256'].values(), 'primary screenshot is pinned and author reports visual inspection')
require('disabled pending request ignored an injected click without a tick' in primary['smoke']['checks'][3], 'disabled request suppresses injected action without Go tick')
require('rejected during admission before old renderer unmount' in primary['smoke']['checks'][5], 'incompatible profile rejected before retirement')
require('compatible React→DOM recovery swap' in primary['smoke']['checks'][6], 'compatible recovery preserves pending request')
require('delivered the pending reply into Go Update' in primary['smoke']['checks'][7], 'reply reaches Go Update after ordered events')
require(catalog['status'] == 'passed' and catalog['source']['commit'] == receipt['sourceIdentity']['commit'] and catalog['source']['tree'] == receipt['sourceIdentity']['tree'] and catalog['catalog']['runCount'] == 30 and catalog['catalog']['jobCount'] == 30 and catalog['catalog']['allTerminalSuccess'], 'terminal 30-run/job current-source audit')
require(catalog['primary']['completeModePassed'] is True and catalog['primary']['sourcePinCount'] == 163, 'primary full archive and source-pin audit')
require(receipt['authoritativeCI']['archive']['completeAcceptance'] is True and receipt['authoritativeCI']['archive']['gzipEofAndTrailerValid'] is True, 'authoritative hosted archive complete and gzip-valid')
require(receipt['local']['archiveIntegrity'] == 'rejected' and receipt['local']['cause'] == 'unknown' and receipt['local']['receiptAndArchiveUnchanged'] is True, 'local archive rejected, cause unknown, originals preserved')
require(receipt['decisionBasis']['scopePath'] == 'compiled-capabilities/ci/2026-10-31/ACCEPTANCE-SCOPE.json', 'root-authorized source-equivalence policy cited')
print('PASS review scope: no browser/build/full suite rerun performed')
