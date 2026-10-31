#!/usr/bin/env python3
"""Independent read-only semantic review from the original managed provider ZIP."""
from __future__ import annotations
import collections, hashlib, json, struct, sys, zipfile
from pathlib import Path

ROOT = Path.cwd()
ZIP_PATH = Path('/tmp/gobi-compiled-lifecycle-41181505234.zip')
LANE = ROOT / 'compiled-lifecycle/ci/2026-10-31/fixed/reviews/demo'
ATTEMPT = 'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z'
PKG = 'github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle'
EXPECTED_ZIP_SHA = '0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def decode(value):
    if isinstance(value, list):
        return [decode(x) for x in value]
    if not isinstance(value, dict):
        return value
    kind = value.get('kind')
    if kind == 'struct':
        return {field['name']: decode(field['value']) for field in value.get('fields', [])}
    if kind in ('slice', 'array'):
        return [decode(x) for x in value.get('items', [])]
    if kind == 'string':
        return value.get('string', '')
    if kind in ('int', 'uint'):
        return int(value.get('integer', '0'))
    if kind == 'bool':
        return bool(value.get('bool'))
    if kind == 'float64':
        return struct.unpack('>d', bytes.fromhex(value['float64Bits']))[0]
    if kind == 'float32':
        return struct.unpack('>f', bytes.fromhex(value['float32Bits']))[0]
    if kind == 'null':
        return None
    raise AssertionError(f'unhandled typed value kind: {kind!r}')


def normalized_state_tick(tick):
    return decode(tick['state'])


def view_tree(tick):
    view = tick['view']
    return view.get('tree', view) if isinstance(view, dict) else view


def normalized_effects(raw):
    return [entry.get('effect', entry) for entry in raw]


def require(condition: bool, label: str):
    if not condition:
        raise AssertionError(label)


def canonical_json(raw: bytes):
    return json.loads(raw.decode('utf-8'))


def main():
    zip_bytes = ZIP_PATH.read_bytes()
    require(len(zip_bytes) == 47_072_021 and sha(zip_bytes) == EXPECTED_ZIP_SHA, 'original provider ZIP identity')
    zf = zipfile.ZipFile(ZIP_PATH)
    require(len(zf.infolist()) == 1270 and len({x.filename for x in zf.infolist()}) == 1270, 'provider member inventory')
    require(zf.testzip() is None, 'provider ZIP CRC scan')

    selected_paths = {
        'execution': f'{ATTEMPT}/execution.json',
        'smoke': f'{ATTEMPT}/demo/demo-smoke.json',
        'screenshot': f'{ATTEMPT}/demo/demo.png',
        'demo_build': f'{ATTEMPT}/demo/site/demo-build.json',
        'native': f'{ATTEMPT}/matrix/lifecycle.native.json',
        'direct': f'{ATTEMPT}/matrix/lifecycle.direct.json',
        'browser': f'{ATTEMPT}/matrix/lifecycle.browser.json',
        'browser_capture': f'{ATTEMPT}/matrix/lifecycle.browser.capture.json',
        'matrix_check': f'{ATTEMPT}/matrix/lifecycle.check.json',
        'matrix_run': f'{ATTEMPT}/matrix/lifecycle.run.json',
    }
    raw = {label: zf.read(path) for label, path in selected_paths.items()}
    selected_hashes = {label: {'member': selected_paths[label], 'bytes': len(data), 'sha256': sha(data),
                               'crc32': f'{zf.getinfo(selected_paths[label]).CRC:08x}'}
                       for label, data in raw.items()}
    obj = {label: canonical_json(data) for label, data in raw.items() if label != 'screenshot'}
    execution, smoke, build = obj['execution'], obj['smoke'], obj['demo_build']
    native, direct, browser = obj['native'], obj['direct'], obj['browser']
    check, run = obj['matrix_check'], obj['matrix_run']

    # Bind the output packet to the pinned successful source run and its source bytes.
    require(execution['job_id'] == 'E-BUILD' and execution['worker'] == 'N6' and
            execution['mode'] == 'full' and execution['status'] == 'passed', 'source attempt identity/status')
    require(execution['sourcePinsMatch'] is True and execution['sourceBefore'] == execution['sourceAfter'] and
            len(execution['sourceBefore']) == 123, 'source pin set stability/count')
    source_mismatches = []
    for source in execution['sourceBefore']:
        path = ROOT / source['path']
        if not path.is_file():
            source_mismatches.append({'path': source['path'], 'reason': 'missing'})
            continue
        payload = path.read_bytes()
        if len(payload) != source['bytes'] or sha(payload) != source['sha256']:
            source_mismatches.append({'path': source['path'], 'reason': 'hash_mismatch'})
    require(not source_mismatches, 'current immutable source bytes match all 123 recorded pins')

    require(run['status'] == check['status'] == 'matched' and run['nativeGoStderr'] == '',
            'recorded conformance run/check status')
    require(run['sourcesStable'] and run['sourceStableThroughCheck'] and run['buildOutputsStableThroughCheck'],
            'matrix stability flags')
    require(all(check[key] is True for key in ('nativeTraceCheckedAgainstLiteralOracle',
             'directTraceCheckedAgainstLiteralOracle', 'browserTracesCheckedAgainstLiteralOracle',
             'physicalDOMCheckedAgainstLiteralOracle')), 'literal oracle checks')
    require(check['mutationControlsDetected'] == 8 and all(x['detected'] for x in check['mutationControls']),
            'eight independent mutation controls')

    # Prove the actual GoScript package is the app shown by the HTTP page.
    require(build['backend'] == 'react' and build['packagePath'] == build['componentId'] == PKG,
            'demo build component package identity')
    require(all(x['componentID'] == PKG for x in (native, direct, browser)), 'native/direct/browser component identity')
    appir_path = f'{ATTEMPT}/react/output/{build["appIR"]["path"]}'
    module_path = f'{ATTEMPT}/react/output/{build["module"]["path"]}'
    encoder_path = f'{ATTEMPT}/react/output/{build["encoder"]["path"]}'
    manifest_path = f'{ATTEMPT}/react/output/{build["manifest"]["path"]}'
    build_files = {name: zf.read(path) for name, path in {'appIR': appir_path, 'module': module_path,
                   'encoder': encoder_path, 'manifest': manifest_path}.items()}
    for name, path in (('appIR', appir_path), ('module', module_path), ('encoder', encoder_path), ('manifest', manifest_path)):
        item = build[name]
        require(len(build_files[name]) == item['bytes'] and sha(build_files[name]) == item['sha256'],
                f'{name} bytes/hash match demo build manifest')
    ir = canonical_json(build_files['appIR'])
    components = [x for x in ir['components'] if x['id'] == PKG]
    require(len(components) == 1 and 'effect.request-reply' in components[0]['capabilities'],
            'AppIR exact package and request/reply capability')
    bundle_inputs = set(build['bundleInputs'])
    require({'compiled-frontend/frontend/dom/renderer.mjs', 'compiled-frontend/frontend/react/renderer.mjs',
             appir_path.replace('/app-ir.json', '/gobi-compiled.mjs'),
             appir_path.replace('/app-ir.json', '/encoder.mjs'),
             'compiled-lifecycle/runtime/runtime.mjs'}.issubset(bundle_inputs), 'bundle includes real Go module, encoder, runtime, both renderers')
    require(len(build_files['module']) == 521_163 and sha(build_files['module']) ==
            '70e1d1171ab71b84e906ef2819faed10902a1cc893afb568e99e077d0f10b260', 'compiled GoScript module pin')

    # Compare all direct/browser profile state, View, messages and effects against native Go.
    profiles = browser['profiles']
    require(set(profiles) == {'react', 'dom', 'swap'} and len(native['steps']) == 26 and
            len(direct['trace']['ticks']) == 26, 'complete matrix profiles and native/direct length')
    profile_checks = {}
    for profile_name, profile in profiles.items():
        ticks = profile['trace']['ticks']
        require(len(ticks) == 26 and normalized_state_tick(ticks[0]) == native['initialState'],
                f'{profile_name} initial state and tick count')
        require(normalized_state_tick(direct['trace']['ticks'][0]) == native['initialState'], 'direct initial Go state')
        cursor = 0
        go_updates = 0
        for step in native['steps']:
            if step['kind'] == 'renderer-swap':
                for label, trace in (('direct', direct['trace']['ticks']), (profile_name, ticks)):
                    current = trace[cursor]
                    require(normalized_state_tick(current) == step['state'] and view_tree(current) == step['view'],
                            f'{label} state/View retained at renderer swap {step["index"]}')
                continue
            cursor += 1
            go_updates += 1
            expected_effects = step.get('effects', [])
            for label, trace in (('direct', direct['trace']['ticks']), (profile_name, ticks)):
                current = trace[cursor]
                require(current.get('message') == step.get('message'), f'{label} message at tick {cursor}')
                require(normalized_state_tick(current) == step['state'], f'{label} full Go state at tick {cursor}')
                require(view_tree(current) == step['view'], f'{label} Go View tree at tick {cursor}')
                require(normalized_effects(current.get('requestedEffects', [])) == expected_effects,
                        f'{label} Go effects at tick {cursor}')
        require(cursor == 25 and go_updates == 25, f'{profile_name} trace row mapping')
        require(profile.get('pageErrors', []) == [] and profile.get('noWasm', {}).get('wasmRequests', []) == [] and
                profile.get('noWasm', {}).get('apiAttempts', []) == [], f'{profile_name} browser errors/WASM')
        for snap in profile.get('snapshots', []):
            require(snap['physicalDOM'] == snap['expectedDOM'],
                    f'{profile_name} physical DOM equals literal expected DOM at {snap.get("eventIndex")}')
        profile_checks[profile_name] = {'ticks': len(ticks), 'go_updates': go_updates,
                                        'dom_snapshots': len(profile.get('snapshots', [])),
                                        'all_dom_snapshots_match': True}
    require(profiles['react']['effectRecords'] == profiles['dom']['effectRecords'] == profiles['swap']['effectRecords'],
            'effect/cancel records identical across render profiles')
    require(check['events'] == check['ticks'] == 26 and check['clicks'] == 16 and check['swaps'] == 17,
            'matrix event/click/swap counts')
    fixed_swap_state = decode(check['pendingSurvivedFixedSwap'])
    require(all(fixed_swap_state[name]['Pending'] is True for name in ('Parent','Child','Grandchild','Sibling')),
            'all four pending effects survive the recorded fixed renderer swap')
    effect_record_profiles = {name: profile['effectRecords'] for name, profile in profiles.items()}
    require(effect_record_profiles['react'] == effect_record_profiles['dom'] == effect_record_profiles['swap'],
            'manual effect/cancel record sequence identical across renderer profiles')
    require(check['requests'] == 7 and check['cancellations'] == 3 and
            check['cancellationOrder'] == ['grandchild:g1:r3', 'child:g1:r2', 'parent:g1:r1'],
            'matrix request count and child-first subtree cancellation')
    require(check['stalePhysicalClicksAcrossProfiles'] == 18 and check['retiredRendererFences'] == 32 and
            check['callbackFenceEligibleSwaps'] == 16 and check['callbackFenceIneligibleSwaps'] == 1,
            'physical-button and renderer callback fence counts')

    # Check the captured HTTP event trace against the same native Go states and effects.
    require(smoke['schema'] == 'gobi.compiled-lifecycle-http-smoke/v1' and smoke['status'] == 'passed' and
            len(smoke['checks']) == 12 and smoke['failures'] == [], 'HTTP demo 12 checks')
    require(smoke['finalTicks'] == len(smoke['finalTrace']['ticks']) == 24 and smoke['rendererSwaps'] == 4,
            'HTTP trace ticks and renderer swaps')
    require(smoke['browserVersion'] == browser['browser'] == '156.0.8078.4' and browser['playwright'] == '1.64.1',
            'managed Chromium/Playwright provenance in artifact')
    require(smoke['requests'] == [{'path':'/','status':200,'bytes':4546},
            {'path':'/demo.css','status':200,'bytes':6573},
            {'path':'/demo.bundle.mjs','status':200,'bytes':1837935}], 'three HTTP resources and sizes')
    require(not smoke['browserErrors'] and not smoke['consoleErrors'] and not smoke['failedRequests'] and
            not smoke['wasmRequests'] and smoke['noWasm'] == {'wasmRequests':[], 'wasmAPIAttempts':[]} and
            smoke['pendingAtEnd'] == [], 'HTTP browser/network/WASM/pending status')
    http_steps = [step for step in native['steps'] if step['kind'] != 'renderer-swap' and
                  step.get('outcome') != 'duplicate-no-op']
    smoke_ticks = smoke['finalTrace']['ticks']
    require(len(http_steps) == 23 and len(smoke_ticks) == 24 and
            normalized_state_tick(smoke_ticks[0]) == native['initialState'], 'HTTP Init plus 23 Go updates')
    for index, step in enumerate(http_steps, 1):
        tick = smoke_ticks[index]
        require(tick.get('message') == step['message'] and normalized_state_tick(tick) == step['state'] and
                view_tree(tick) == step['view'] and normalized_effects(tick.get('requestedEffects', [])) == step.get('effects', []),
                f'HTTP Go state/View/effects match native update {index}')

    # Validate event-level cancel, stale and duplicate delivery behavior.
    remove = next(x for x in native['steps'] if x.get('message') and x['message'].get('name') == 'removeParent')
    require(remove['state']['Sibling']['Pending'] is True and
            remove['state']['Parent']['Alive'] is False and remove['state']['Child']['Alive'] is False and
            remove['state']['Grandchild']['Alive'] is False, 'subtree removal keeps unrelated Sibling pending')
    require(smoke['retiredReplyProbeOutcomes'] == [
            {'token':token,'outcome':'rejected','error':'unknown or extra effect completion'}
            for token in ('grandchild:g1:r3','child:g1:r2','parent:g1:r1')], 'retired callback replies rejected')
    require(len(smoke['goMessageProbeResults']) == 3 and all(x['stateUnchanged'] for x in smoke['goMessageProbeResults']),
            'stale old Go completion messages are no-ops after remount')
    records = smoke['effectRecords']
    counts = collections.Counter((x['kind'],x['outcome']) for x in records)
    require(counts == collections.Counter({('request','queued'):7,('cancel','cancelled'):3,
            ('force-deliver-retired','rejected'):3,('deliver','accepted'):4,('deliver','rejected'):2}),
            'effect request/cancel/delivery outcome counts')
    require([x['token'] for x in records if x['kind']=='request'] ==
            ['parent:g1:r1','child:g1:r2','grandchild:g1:r3','sibling:g1:r4',
             'parent:g2:r5','child:g2:r6','grandchild:g2:r7'], 'effect request token order')
    require([x['token'] for x in records if x['kind']=='cancel'] ==
            ['grandchild:g1:r3','child:g1:r2','parent:g1:r1'], 'effect child-first cancellation order')
    request_correlations = {x['token']:(x['dispatchId'],x['effectIndex']) for x in records if x['kind']=='request'}
    require(all(x['target'] == {'dispatchId':request_correlations[x['token']][0],
                                'effectIndex':request_correlations[x['token']][1]}
                for x in records if x['kind']=='cancel'), 'cancel records point to the correct queued request')
    require([x['token'] for x in records if x['kind']=='force-deliver-retired'] ==
            ['grandchild:g1:r3','child:g1:r2','parent:g1:r1'] and
            all(x['outcome']=='rejected' for x in records if x['kind']=='force-deliver-retired'),
            'forced retired callback probes reject old generation replies')
    require([x['token'] for x in records if x['kind']=='deliver' and x['outcome']=='rejected'] ==
            ['sibling:g1:r4','child:g2:r6'], 'duplicate Sibling and Child replies rejected')
    require([x['token'] for x in records if x['kind']=='deliver' and x['outcome']=='accepted'] ==
            ['sibling:g1:r4','grandchild:g2:r7','child:g2:r6','parent:g2:r5'], 'manual completion order')

    expected_tokens = {
        'parent': ('parent:g2:r5', 'parent:g2:r5'),
        'child': ('child:g2:r6', 'child:g2:r6'),
        'grandchild': ('grandchild:g2:r7', 'grandchild:g2:r7'),
        'sibling': ('sibling:g1:r4', 'sibling:g1:r4'),
    }
    for name, (token, reply) in expected_tokens.items():
        state = smoke['finalState'][name]
        require(state['alive'] and state['requested'] and not state['pending'] and state['count'] == 1 and
                state['token'] == token and state['reply'] == reply, f'final Go state for {name}')
    require(smoke['finalState']['nextRequestId'] == '7' and smoke['finalBackend'] == 'dom', 'final global ID/backend')
    controls = {x['key']: x['disabled'] for x in smoke['finalDOM']['controls']}
    require(len(controls) == 10, 'final physical control set size')
    require(all(controls[x] for x in ('parent-request','child-request','grandchild-request','sibling-request','parent-remount')),
            'final physical request/remount controls disabled')
    require(not any(controls[x] for x in ('parent-add','child-add','grandchild-add','sibling-add','parent-remove')),
            'final physical add/remove controls enabled')
    expected_labels = ('Parent: live; count=1; complete parent:g2:r5',
        'Child: live; count=1; complete child:g2:r6',
        'Grandchild: live; count=1; complete grandchild:g2:r7',
        'Sibling: live; count=1; complete sibling:g1:r4')
    require(all(label in smoke['finalDOM']['html'] for label in expected_labels), 'final physical DOM labels')
    require(profiles['swap']['snapshots'][-1]['physicalDOM'] == smoke['finalDOM'],
            'matrix and HTTP final physical DOM equal')

    # Validate the screenshot from ZIP bytes, save only a review copy in this lane.
    png_data = raw['screenshot']
    require(len(png_data) == 326350 and sha(png_data) ==
            'd1a9d09dc59e88ce02a83e7d8734acf5987e3e4a1a5c3714384a881295b17648', 'original ZIP screenshot bytes/hash')
    require(png_data[:8] == b'\x89PNG\r\n\x1a\n', 'PNG signature')
    width, height = struct.unpack('>II', png_data[16:24])
    require((width,height) == (1440,1622), 'original ZIP screenshot dimensions')
    screenshot_path = LANE / 'managed-demo.png'
    screenshot_path.write_bytes(png_data)

    selected_build_pins = {name:{'bytes':len(data),'sha256':sha(data)} for name,data in build_files.items()}
    result = {
        'schema':'gobi.compiled-lifecycle-fixed-demo-review/v1',
        'job_id':'XR-FIXED-DEMO','worker':'N5','decision':'accepted','outcome':'confirmed_reuse',
        'scope':'independent review of the managed demo and lifecycle traces read directly from the original successful provider ZIP; no rebuild or browser rerun',
        'provider':{'run_id':41181505234,'artifact_id':13035044166,'conclusion':'success',
                    'head_sha':'00da54ad0f5a4006b13a5cded18ce291845978bc',
                    'tree':'51b64a89b5f7e0edd4792becbed9adad6a27a698',
                    'zip_bytes':len(zip_bytes),'zip_sha256':sha(zip_bytes),'members':len(zf.infolist()),
                    'all_zip_crc_checked':True},
        'source':{'attempt_status':execution['status'],'mode':execution['mode'],
                  'source_pin_count':len(execution['sourceBefore']),'source_pins_stable':True,
                  'current_source_bytes_match':True,'native_go_argument':'go',
                  'native_go_stderr':run['nativeGoStderr']},
        'build_identity':{'package_path':PKG,'component_id':PKG,'capabilities':components[0]['capabilities'],
                          'compiled_module':selected_build_pins['module'],
                          'app_ir':selected_build_pins['appIR'],'encoder':selected_build_pins['encoder'],
                          'build_manifest':selected_build_pins['manifest'],
                          'bundle_contains_existing_dom_react_renderers_and_lifecycle_runtime':True},
        'http_smoke':{'status':smoke['status'],'checks':len(smoke['checks']),'ticks_including_init':len(smoke_ticks),
                      'native_updates_compared':len(http_steps),'renderer_swaps':smoke['rendererSwaps'],
                      'assets':smoke['requests'],'chromium':smoke['browserVersion'],'playwright':browser['playwright'],
                      'browser_errors':len(smoke['browserErrors']),'console_errors':len(smoke['consoleErrors']),
                      'failed_requests':len(smoke['failedRequests']),'wasm_requests':len(smoke['wasmRequests']),
                      'wasm_api_attempts':len(smoke['noWasm']['wasmAPIAttempts']),'pending_at_end':len(smoke['pendingAtEnd'])},
        'matrix':{'status':check['status'],'profiles':profile_checks,'events':check['events'],'ticks':check['ticks'],
                  'swaps':check['swaps'],'clicks':check['clicks'],'requests':check['requests'],
                  'all_four_pending_effects_survive_fixed_swap':True,
                  'effect_record_sequence_equal_across_profiles':True,
                  'cancellations':check['cancellations'],'cancellation_order':check['cancellationOrder'],
                  'stale_physical_clicks_across_profiles':check['stalePhysicalClicksAcrossProfiles'],
                  'retired_renderer_fences':check['retiredRendererFences'],
                  'callback_fence_eligible_swaps':check['callbackFenceEligibleSwaps'],
                  'callback_fence_ineligible_swaps':check['callbackFenceIneligibleSwaps'],
                  'mutation_controls_detected':check['mutationControlsDetected'],
                  'literal_oracles':{'native':check['nativeTraceCheckedAgainstLiteralOracle'],
                                     'direct':check['directTraceCheckedAgainstLiteralOracle'],
                                     'browser':check['browserTracesCheckedAgainstLiteralOracle'],
                                     'physical_dom':check['physicalDOMCheckedAgainstLiteralOracle']},
                  'state_view_effects_compared_against_native':True},
        'lifecycle':{'retired_generation1_callback_probes_rejected':3,'stale_go_completions_state_unchanged':3,
                     'duplicate_deliveries_rejected':['sibling:g1:r4','child:g2:r6'],
                     'final_pending':0,'final_backend':'dom','final_controls':controls},
        'screenshot':{'provider_member':selected_paths['screenshot'],'review_copy':str(screenshot_path.relative_to(ROOT)),
                      'bytes':len(png_data),'sha256':sha(png_data),'dimensions':f'{width}x{height}'},
        'review_method':{'selected_files_read_directly_from_original_zip':selected_paths,
                         'source_file_hashes_checked':123,'browser_tests_rerun':False,
                         'builds_rerun':False,'author_packet_modified':False,
                         'extraction_only_temp_used':False},
    }
    out = LANE / 'audit.json'
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + '\n', encoding='utf-8')
    print(json.dumps({'decision':result['decision'],'zip_sha256':sha(zip_bytes),'ticks':check['ticks'],
                      'profiles':sorted(profiles),'http_checks':len(smoke['checks']),
                      'http_updates':len(http_steps),'source_pins':len(execution['sourceBefore']),
                      'screenshot_sha256':sha(png_data)},sort_keys=True))

if __name__ == '__main__':
    main()
