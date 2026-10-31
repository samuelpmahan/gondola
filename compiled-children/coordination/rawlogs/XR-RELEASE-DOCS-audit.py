import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path.cwd()
def read_json(path): return json.loads(Path(path).read_text())
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()

release = read_json('compiled-children/coordination/receipts/E-RELEASE-DOCS.json')
release_report = read_json('compiled-children/coordination/receipts/E-RELEASE-DOCS.json')['report']
source_pins = {item['path']: item['sha256'] for item in release['sources']}
for doc in ['compiled-children/README.md', 'compiled-children/RESULTS.md']:
    assert sha(doc) == source_pins[doc]
assert sha(release_report['path']) == release_report['sha256']
assert Path(release_report['path']).stat().st_size == release_report['bytes']
for item in release['rawlogs']:
    assert sha(item['path']) == item['sha256']
    assert Path(item['path']).stat().st_size == item['bytes']

snapshot_path = release['acceptance']['activeRepairSnapshot']
snapshot = read_json(snapshot_path)
assert sha(snapshot_path) == next(item['sha256'] for item in release['sources'] if item['path'] == snapshot_path)
fix_status = {name: snapshot['jobs'][name]['status'] for name in [
    'E-FIX-INHERITED-GATE','E-FIX-WASM-OBSERVABILITY','E-FIX-SEEDED-ASSERTIONS','E-FIX-HARNESS-LIVENESS',
    'XR-FIX-INHERITED-GATE','XR-FIX-WASM-OBSERVABILITY','XR-FIX-SEEDED-ASSERTIONS','XR-FIX-HARNESS-LIVENESS']}
assert sum(fix_status[name] == 'running' for name in fix_status if name.startswith('E-')) == 3
assert fix_status['E-FIX-SEEDED-ASSERTIONS'] == 'done'
assert all(fix_status[name] == 'pending' for name in fix_status if name.startswith('XR-'))

attempt12_path = 'compiled-children/coordination/rawlogs/E-HARNESS-20261031T123850.820Z-2/run.json.gz'
attempt12 = json.loads(gzip.open(attempt12_path, 'rt').read())
summary = attempt12['summary']
assert attempt12['status'] == 'matched'
assert (summary['events'], summary['goUpdates'], summary['stateCheckpoints']) == (42,38,39)
assert summary['mutationControlsDetected'] == 6

xr_harness = read_json('compiled-children/coordination/receipts/XR-HARNESS.json')
assert xr_harness['decision'] == 'amend'
seeded = xr_harness['capture_review']['seededRuns']
assert [item['seed'] for item in seeded] == [20261031,20261032,20261033]
assert [item['mountedBrowserProfile'] for item in seeded] == [True,False,False]

e_delivery = read_json('compiled-children/coordination/receipts/E-DELIVERY.json')
smoke = e_delivery['authorValidation']['httpSmoke']
assert smoke['status'] == 'passed' and (smoke['passed'],smoke['failed']) == (31,0)
assert e_delivery['authorSmoke']['status'] == 'passed'
xr_delivery = read_json('compiled-children/coordination/receipts/XR-DELIVERY.json')
assert xr_delivery['decision'] == 'amend'

custody = read_json('compiled-children/coordination/receipts/XR-FIX-ORACLE-CUSTODY.json')
assert custody['decision'] == 'accepted'
assert custody['custody_boundary']['closed_E_ORACLE_expected_sha256'] == '7b124f1f2a3c5ac4d36e2f0d255b7b1548b4d095bb8e2c9b0b82bfa846a2466e'
assert custody['custody_boundary']['original_pinned_bytes_available'] is False
e_delivery_report = Path('compiled-children/coordination/reports/E-DELIVERY.md').read_text()
assert 'prior local-container archive corruption remains excluded from acceptance' in e_delivery_report

runner = Path('compiled-children/run.mjs').read_text()
wrapper = Path('run-compiled-children.sh').read_text()
ci = Path('.github/workflows/gobi-compiled-children.yml').read_text()
assert 'const reportPath = join(here, "coordination/reports/E-DELIVERY.md")' in runner
assert 'const receiptPath = join(here, "coordination/receipts/E-DELIVERY.json")' in runner
assert 'const manifestPath = join(dirname(attemptRoot), `${basename(attemptRoot)}.archive-manifest.json`)' in runner
assert 'const archivePath = join(dirname(attemptRoot), `${basename(attemptRoot)}.tar.gz`)' in runner
assert 'throw new Error("E-DELIVERY supports full mode only; arguments and partial/reuse modes are rejected")' in runner
assert 'go1.27.3' in runner and 'go1.24.' in runner and 'v22.' in runner and '19.3.1' in runner
assert 'node-version: 22' in ci and 'go-version: 1.24.x' in ci
assert 'exec node "$ROOT/compiled-children/run.mjs" "$@"' in wrapper

readme = Path('compiled-children/README.md').read_text()
archive_sentence = next(line for line in readme.splitlines() if 'The attempt\'s report, receipt' in line)
assert 'compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>/' in archive_sentence
assert 'archivePath = join(dirname(attemptRoot)' in runner
contract = Path('compiled-children/CONTRACT.md').read_text()
assert '[a-z][a-z0-9_-]{0,15}' in contract
assert 'no mutable package globals' in readme and 'focus identity' in readme
assert all(claim in readme for claim in ['arbitrary Go object graphs','hydration','IME input','concurrent React rendering','pixel-level output'])
assert all(claim in readme for claim in ['view.node','effect.request-reply','effect.cancel','mountCompiledChildrenApp'])
assert all(method in Path('compiled-frontend/frontend/runtime/runtime.mjs').read_text() for method in ['update, viewRecord, domSnapshot, and unmount'])

print(json.dumps({
 'status':'passed_with_one_factual_finding',
 'documentationPinsMatch':True,
 'releaseReportAndRawlogPinsMatch':True,
 'snapshotRepairStatuses':fix_status,
 'attempt12':{'events':summary['events'],'goUpdates':summary['goUpdates'],'stateCheckpoints':summary['stateCheckpoints'],'mutations':summary['mutationControlsDetected']},
 'seededMountedProfiles':[item['mountedBrowserProfile'] for item in seeded],
 'historicalAuthorSmoke':{'passed':smoke['passed'],'failed':smoke['failed'],'chromium':smoke['browser']},
 'oracleCustody':{'review':'accepted','expected7bOriginalAvailable':False},
 'runnerOutputs':{'canonicalReport':'compiled-children/coordination/reports/E-DELIVERY.md','canonicalReceipt':'compiled-children/coordination/receipts/E-DELIVERY.json','archive':'compiled-children/demo/output/attempts/attempt-<id>.tar.gz','manifest':'compiled-children/demo/output/attempts/attempt-<id>.archive-manifest.json'},
 'finding':{'id':'XR-RELEASE-DOCS-01','severity':'must-fix-factual-path','path':'compiled-children/README.md:35','summary':'README places canonical report/receipt and byte-checked archive beneath attempt-<id>/, while report/receipt are under coordination and archive/manifest are siblings of the attempt directory.'}
},indent=2))
