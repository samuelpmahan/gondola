#!/usr/bin/env python3
"""Read-only independent audit for the retained N2/N3 browser artifacts."""
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path.cwd()
BASE = Path('compiled-methods/evidence/harness/attempt-04-final')
OUT = Path('compiled-methods/evidence/reviews/xr-browser/audit.json')

def read_json(path):
    return json.loads(Path(path).read_text())

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def die(message):
    raise SystemExit(message)

def decode_state(value):
    if value.get('kind') == 'struct':
        return {field['name']: decode_state(field['value']) for field in value['fields']}
    if value.get('kind') == 'float64':
        return struct.unpack('>d', bytes.fromhex(value['float64Bits']))[0]
    if value.get('kind') == 'bool':
        return value['bool']
    die(f"unsupported typed state value: {value.get('kind')}")

def flat_state(raw):
    return {
        'parent': raw['Parent']['Count'],
        'child': raw['Child']['Count'],
        'readOnly': raw['ReadOnly'],
        'savedChild': raw['SavedChild'],
    }

def expected_dom(s):
    parent_disabled = s['parent'] == 0
    child_add_disabled = s['readOnly']
    child_reset_disabled = s['readOnly'] or s['child'] == 0
    attrs = lambda disabled: ' disabled=""' if disabled else ''
    lock = 'Unlock child' if s['readOnly'] else 'Lock child'
    html = (
        '<div class="method-composition"><div class="parent-counter">'
        f'<p>Parent: {int(s["parent"])}</p><button>Parent +</button>'
        f'<button{attrs(parent_disabled)}>Parent Reset</button></div>'
        '<div class="child-counter">'
        f'<p>Child: {int(s["child"])}</p><button{attrs(child_add_disabled)}>Child +</button>'
        f'<button{attrs(child_reset_disabled)}>Child Reset</button></div>'
        f'<button>{lock}</button><p>Saved child: {int(s["savedChild"])}</p>'
        '<button>Capture child</button><button>Publish saved to parent</button></div>'
    )
    controls = []
    for path, key, disabled in [
        ('0/1', 'parent-add', False),
        ('0/2', 'parent-reset', parent_disabled),
        ('1/1', 'child-add', child_add_disabled),
        ('1/2', 'child-reset', child_reset_disabled),
        ('2', 'readonly-toggle', False),
        ('4', 'capture-child', False),
        ('5', 'publish-saved', False),
    ]:
        controls.append({'path': path, 'key': key, 'tag': 'button', 'type': 'submit', 'value': '', 'checked': False, 'disabled': disabled})
    return {'normalization': 'outerHTML-v1', 'html': html, 'controls': controls}

fixture = read_json('compiled-methods/conformance/fixtures/methods.json')
browser = read_json(BASE / 'methods.browser.json')
run = read_json(BASE / 'methods.run.json')
check = read_json(BASE / 'methods.check.json')
report = Path('compiled-methods/coordination/reports/E-BROWSER.md')
receipt = read_json('compiled-methods/coordination/receipts/E-BROWSER.json')

raw_states = [fixture['initialState'], *[item['state'] for item in fixture['expectations']]]
states = [flat_state(state) for state in raw_states]
if len(states) != 19 or len(fixture['actions']) != 18:
    die('frozen fixture did not contain expected 19 states / 18 actions')
messages = [item.get('message') for item in fixture['expectations']]
ids = [item.get('dispatchId') for item in fixture['expectations']]
expected_disabled = [i for i, msg in enumerate(messages) if msg is None]
if expected_disabled != [6, 9, 10, 17]:
    die(f'unexpected fixture-disabled actions: {expected_disabled}')

profile_summaries = {}
for profile_name in ('react', 'dom', 'swap'):
    profile = browser['profiles'][profile_name]
    if len(profile['trace']['ticks']) != 19 or len(profile['actions']) != 18:
        die(f'{profile_name}: trace/action counts mismatch')
    if len(profile['domOracle']) != 19 or len(profile['physicalDOMSnapshots']) != 19:
        die(f'{profile_name}: snapshot count mismatch')
    active_count = stale_count = 0
    for i, expected_state in enumerate(states):
        tick = profile['trace']['ticks'][i]
        state = decode_state(tick['state'])
        if state != raw_states[i]:
            die(f'{profile_name}: trace state differs from frozen fixture at tick {i}')
        exp_state = expected_dom(expected_state)
        for label, snapshot in (
            ('trace', tick['dom']),
            ('oracle', profile['domOracle'][i]['snapshot']),
            ('physical', profile['physicalDOMSnapshots'][i]['snapshot']),
        ):
            if snapshot != exp_state:
                die(f'{profile_name}: {label} snapshot differs from independently reconstructed expected DOM at tick {i}')
        if profile['domOracle'][i]['state'] != expected_state or profile['physicalDOMSnapshots'][i]['state'] != expected_state:
            die(f'{profile_name}: state label mismatch at snapshot {i}')
        if i == 0:
            if tick['action'] is not None or tick['message'] is not None or tick['dispatchId'] is not None:
                die(f'{profile_name}: init tick has action/message/dispatch')
            continue
        ai = i - 1
        action = profile['actions'][ai]
        fixture_action = fixture['actions'][ai]
        if action['action'] != fixture_action:
            die(f'{profile_name}: action ordering/shape differs at action {ai}')
        if tick['action'] != fixture_action:
            die(f'{profile_name}: trace action differs at action {ai}')
        if action['tickIndex'] != i or action['afterTickCount'] != i + 1:
            die(f'{profile_name}: action tick order differs at action {ai}')
        msg = messages[ai]
        expected_go_msg = None if msg is None else {'Name': msg['name'], 'Arg': msg['arg']}
        if tick['message'] != msg or action['tick']['message'] != msg or tick['dispatchId'] != ids[ai]:
            die(f'{profile_name}: action message/dispatch differs from fixture at action {ai}')
        before, after = action['beforeCallbacks'], action['afterCallbacks']
        if msg is None:
            if action['physicalClick'] != {'method': 'HTMLElement.click', 'attempted': True, 'disabled': True, 'traceTicksUnchanged': True}:
                die(f'{profile_name}: disabled physical click evidence mismatch at action {ai}')
            if action['target']['disabled'] is not True or action['observed'] is not None:
                die(f'{profile_name}: disabled target reached a renderer callback at action {ai}')
            if action['suppressedDispatch'].get('accepted') is not True or action['suppressedDispatch'].get('dispatchId') is not None:
                die(f'{profile_name}: disabled action lacks expected runtime suppression at action {ai}')
            if before != after:
                die(f'{profile_name}: disabled click changed callback counts at action {ai}')
        else:
            active_count += 1
            expected_backend = profile_name
            if profile_name == 'swap':
                expected_backend = 'react' if sum(1 for transition in browser['swapTransitions'] if transition['afterActionIndex'] < ai) % 2 == 0 else 'dom'
            observed = action['observed']
            if observed != {'action': fixture_action, 'message': expected_go_msg, 'backend': expected_backend}:
                die(f'{profile_name}: renderer callback/action/message/order mismatch at action {ai}')
            if after['dispatch'] != before['dispatch'] + 1 or after['stale'] != before['stale']:
                die(f'{profile_name}: active callback delta mismatch at action {ai}')
    if active_count != 14:
        die(f'{profile_name}: active callback count is {active_count}, expected 14')
    expected_stale_total = 18 if profile_name == 'swap' else 0
    if profile['callbackCounts'] != {'dispatch': 14, 'stale': expected_stale_total}:
        die(f'{profile_name}: callback totals mismatch')
    if profile['pageErrors'] or profile['noWasm'] != {'wasmRequests': [], 'wasmAPIAttempts': [], 'apiAttempts': []}:
        die(f'{profile_name}: page errors or no-WASM evidence mismatch')
    if profile['unmount']['physicalDOM'] != {'normalization': 'container-innerHTML-v1', 'html': '', 'controls': 0}:
        die(f'{profile_name}: physical container was not empty on unmount')
    if profile['unmount']['rendererSnapshot'] != {'normalization': 'outerHTML-v1', 'html': '', 'controls': []}:
        die(f'{profile_name}: renderer snapshot was not empty on unmount')
    profile_summaries[profile_name] = {
        'ticks': len(profile['trace']['ticks']),
        'actions': len(profile['actions']),
        'active_dispatches': active_count,
        'oracle_snapshots': len(profile['domOracle']),
        'physical_snapshots': len(profile['physicalDOMSnapshots']),
    }

swap = browser['profiles']['swap']
if len(swap['swaps']) != 18 or len(swap['retiredCallbacks']) != 18:
    die('swap profile does not have 18 transitions and retired callbacks')
for i, record in enumerate(swap['swaps']):
    old, new = ('react', 'dom') if i % 2 == 0 else ('dom', 'react')
    cb = record['retiredCallback']
    if record['actionIndex'] != i or record['from'] != old or record['to'] != new:
        die(f'swap transition {i} has the wrong order/backends')
    if not (record['stateUnchanged'] and record['viewUnchanged'] and record['oldRootEmptyAfterUnmount'] and record['oldRootDetached'] and record['newRootDistinct']):
        die(f'swap transition {i} did not preserve state/view or replace/detach root')
    if cb['runtimeFenceCountAfter'] != cb['runtimeFenceCountBefore'] + 1 or not cb['traceTicksUnchanged'] or not cb['detachedAtInvocation'] or not cb['rendererStaleCallbackObserved']:
        die(f'swap transition {i} did not fence one detached old callback')
    if cb['rendererObservation']['backend'] != old or cb['traceTicksBefore'] != cb['traceTicksAfter']:
        die(f'swap transition {i} stale callback was not the old backend or advanced trace')
    stale_count += 1

# Verify the complete source pin sets actually hash to the recorded values.
def pinset(records, label):
    changed_during_review = {'compiled-methods/conformance/check.mjs', 'compiled-methods/conformance/check.test.mjs'}
    skipped = []
    for item in records:
        if item['path'].replace(str(ROOT) + '/', '') in changed_during_review:
            skipped.append(item['path'])
            continue
        path = Path(item['path'])
        if not path.is_absolute():
            path = ROOT / path
        if not path.is_file():
            die(f'{label}: pinned file missing: {item["path"]}')
        data = path.read_bytes()
        if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
            die(f'{label}: hash/byte mismatch: {item["path"]}')

if run['sourcePinsBefore'] != run['sourcePinsAfter'] or run['sourcePinsAfter'] != run['sourcePinsFinal']:
    die('recorded source pin inventories differ across run stages')
if run['outputPinsBeforeCheck'] != run['outputPinsAfterCheck']:
    die('recorded output pin inventories differ across checker stages')
pinset(run['sourcePinsFinal'], 'sourcePinsFinal')
pinset(run['outputPinsAfterCheck'], 'outputPinsAfterCheck')
pinset(run['evidencePins'], 'evidencePins')
for rel, expected in receipt['evidence']['source_files'].items():
    if sha(rel) != expected['sha256'] or Path(rel).stat().st_size != expected['bytes']:
        die(f'E-BROWSER source pin mismatch: {rel}')
if sha(report) != receipt['evidence']['report_sha256']:
    die('E-BROWSER report hash does not match its receipt')
if sha('compiled-methods/evidence/browser/observed-run-audit.json') != receipt['evidence']['observed_integrated_browser_run']['n2_raw_record_audit']['sha256']:
    die('N2 observed-run audit hash does not match its receipt')

summary = {
    'schema': 'gobi.methods-browser-independent-review/v1',
    'status': 'checks_passed',
    'independent_state_and_dom_source': 'frozen conformance fixture state/expectations plus FIXTURE.md and Go fixture View shape; no AppIR or renderer output used to derive expected values',
    'profiles': profile_summaries,
    'disabled_action_indexes': expected_disabled,
    'swaps': len(swap['swaps']),
    'retired_callback_fences': stale_count,
    'no_wasm': {'api_attempts': 0, 'requests': 0},
    'page_errors': 0,
    'unmount_empty': True,
    'source_pin_count': len(run['sourcePinsFinal']),
    'source_pin_files_not_rehashed_due_to_concurrent_N2_repair': ['compiled-methods/conformance/check.mjs', 'compiled-methods/conformance/check.test.mjs'],
    'output_pin_count': len(run['outputPinsAfterCheck']),
    'run_artifacts': {
        'run_sha256': sha(BASE / 'methods.run.json'),
        'check_sha256': sha(BASE / 'methods.check.json'),
        'browser_sha256': sha(BASE / 'methods.browser.json'),
        'browser_trace_sha256': browser['traceSha256'],
    },
    'reviewed_source_sha256': {path: sha(path) for path in receipt['evidence']['source_files']},
    'e_browser_report_sha256': sha(report),
    'e_browser_receipt_sha256': sha('compiled-methods/coordination/receipts/E-BROWSER.json'),
    'limits': [
        'Local Chromium only; managed-CI browser execution not established.',
        'Fixed buttons-only fixture; no portable input focus/selection claim.',
        'One deterministic action schedule; no effect completion or randomized sequences.',
        'React-built GoScript module mounted in all three browser profiles; DOM-built module only separately pinned by N3.',
        'Swapped stale-callback probe reads a React internal props property for React callback capture; this is bounded to the pinned React/browser setup.',
    ],
}
OUT.write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
