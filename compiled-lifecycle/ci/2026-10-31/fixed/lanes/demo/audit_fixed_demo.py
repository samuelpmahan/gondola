#!/usr/bin/env python3
"""Read-only audit of the retained managed E-FIXED-DEMO provider artifact."""
from __future__ import annotations
import collections, hashlib, json, pathlib, struct, sys, zipfile

WORK = pathlib.Path.cwd()
ROOT = WORK / 'compiled-lifecycle/ci/2026-10-31/fixed'
ATTEMPT = ROOT / 'extracted/compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z'
OUT = ROOT / 'lanes/demo/audit.json'
ARTIFACT = pathlib.Path('/tmp/gobi-compiled-lifecycle-41181505234.zip')
PKG = 'github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle'

def read(path):
    return json.loads(path.read_text())
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()
def decode(v):
    if isinstance(v, list): return [decode(x) for x in v]
    if not isinstance(v, dict): return v
    kind=v.get('kind')
    if kind == 'struct': return {x['name']: decode(x['value']) for x in v.get('fields',[])}
    if kind in ('slice','array'): return [decode(x) for x in v.get('items',[])]
    if kind == 'string': return v.get('string','')
    if kind in ('int','uint'): return int(v.get('integer','0'))
    if kind == 'bool': return bool(v.get('bool'))
    if kind == 'float64': return struct.unpack('>d', bytes.fromhex(v['float64Bits']))[0]
    if kind == 'float32': return struct.unpack('>f', bytes.fromhex(v['float32Bits']))[0]
    if kind == 'null': return None
    raise AssertionError('unhandled typed-value kind: '+repr(kind))
def assert_eq(a,b,label):
    if a != b: raise AssertionError(f'{label} mismatch')
def normalized_effects(raw):
    return [x.get('effect',x) for x in raw]
def normalized_state_tick(tick): return decode(tick['state'])
def tree(tick):
    v=tick['view']
    return v.get('tree',v) if isinstance(v,dict) else v

def check(condition, label):
    if not condition: raise AssertionError(label)

def main():
    ex=read(ATTEMPT/'execution.json')
    smoke=read(ATTEMPT/'demo/demo-smoke.json')
    build=read(ATTEMPT/'demo/site/demo-build.json')
    native=read(ATTEMPT/'matrix/lifecycle.native.json')
    direct=read(ATTEMPT/'matrix/lifecycle.direct.json')
    browser=read(ATTEMPT/'matrix/lifecycle.browser.json')
    browser_capture=ATTEMPT/'matrix/lifecycle.browser.capture.json'
    matrix_check=read(ATTEMPT/'matrix/lifecycle.check.json')
    matrix_run=read(ATTEMPT/'matrix/lifecycle.run.json')
    member_index=read(ROOT/'provider-members.json')
    provider=read(ROOT/'provider-download.json')

    # Prove the retained provider ZIP identity and compare the selected extracted members to its index.
    check(ARTIFACT.exists(), 'managed provider ZIP is absent')
    zip_sha=sha(ARTIFACT)
    check(ARTIFACT.stat().st_size == provider['bytes'] == 47072021, 'provider ZIP byte count')
    check(zip_sha == provider['sha256'] == '0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26', 'provider ZIP SHA-256')
    member_by_path={x['path']:x for x in member_index}
    selected = {
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/execution.json':ATTEMPT/'execution.json',
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/demo/demo-smoke.json':ATTEMPT/'demo/demo-smoke.json',
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/demo/demo.png':ATTEMPT/'demo/demo.png',
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/demo/site/demo-build.json':ATTEMPT/'demo/site/demo-build.json',
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/lifecycle.native.json':ATTEMPT/'matrix/lifecycle.native.json',
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/lifecycle.direct.json':ATTEMPT/'matrix/lifecycle.direct.json',
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/lifecycle.browser.json':ATTEMPT/'matrix/lifecycle.browser.json',
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/lifecycle.browser.capture.json':browser_capture,
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/lifecycle.check.json':ATTEMPT/'matrix/lifecycle.check.json',
      'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/lifecycle.run.json':ATTEMPT/'matrix/lifecycle.run.json',
    }
    selected_hashes={}
    for rel,path in selected.items():
        item=member_by_path[rel]
        check(path.is_file(),f'missing extracted member: {rel}')
        check(path.stat().st_size==item['bytes'],f'byte mismatch: {rel}')
        digest=sha(path)
        check(digest==item['sha256'],f'SHA mismatch: {rel}')
        selected_hashes[rel]={'bytes':item['bytes'],'sha256':digest,'crc32':item['crc32']}

    # Source/output identity recorded around the successful managed build and matrix.
    check(ex['job_id']=='E-BUILD' and ex['worker']=='N6' and ex['mode']=='full' and ex['status']=='passed','execution identity/status')
    check(ex['sourcePinsMatch'] is True,'managed source pins did not match')
    check(ex['sourceBefore']==ex['sourceAfter'],'source pin sets differ')
    check(ex['conformance']['status']=='matched','managed lifecycle conformance did not match')
    check(matrix_run['status']=='matched' and matrix_run['sourcesStable'] and matrix_run['sourceStableThroughCheck'] and matrix_run['buildOutputsStableThroughCheck'],'conformance runner stability/status')
    check(matrix_run['nativeGoStderr']=='','native Go CLI stderr is nonempty')
    check(matrix_check['status']=='matched','conformance check status')
    check(matrix_check['nativeTraceCheckedAgainstLiteralOracle'] and matrix_check['directTraceCheckedAgainstLiteralOracle'] and matrix_check['browserTracesCheckedAgainstLiteralOracle'] and matrix_check['physicalDOMCheckedAgainstLiteralOracle'],'literal oracle/physical DOM checks')
    check(matrix_check['mutationControlsDetected']==8 and all(x['detected'] for x in matrix_check['mutationControls']),'mutation controls')

    # Module/AppIR and bundling prove the actual generated Go package was mounted.
    appir_path=ATTEMPT/'react/output'/build['appIR']['path']
    module_path=ATTEMPT/'react/output'/build['module']['path']
    encoder_path=ATTEMPT/'react/output'/build['encoder']['path']
    manifest_path=ATTEMPT/'react/output'/build['manifest']['path']
    for label,path,rec in [('appIR',appir_path,build['appIR']),('module',module_path,build['module']),('encoder',encoder_path,build['encoder']),('manifest',manifest_path,build['manifest'])]:
        check(path.is_file() and path.stat().st_size==rec['bytes'] and sha(path)==rec['sha256'],f'demo build {label} pin')
    ir=read(appir_path)
    components=ir.get('components',[])
    check(len(components)==1 and components[0]['id']==PKG,'actual React AppIR component identity')
    check('effect.request-reply' in components[0].get('capabilities',[]),'request-reply AppIR capability')
    check(build['componentId']==PKG and build['packagePath']==PKG and build['backend']=='react','demo Go module package identity')
    check(direct['componentID']==PKG and browser['componentID']==PKG and native['componentID']==PKG,'native/direct/browser component identity')
    check(set(['compiled-frontend/frontend/dom/renderer.mjs','compiled-frontend/frontend/react/renderer.mjs']).issubset(set(build['bundleInputs'])),'bundle omits a renderer')
    check(build['module']['bytes']==521163 and build['module']['sha256']=='70e1d1171ab71b84e906ef2819faed10902a1cc893afb568e99e077d0f10b260','compiled Go module expected pin')

    # Full matrix: decode typed Go values and compare every Go update and renderer-swap checkpoint.
    profiles=browser['profiles']
    check(set(profiles)=={'react','dom','swap'},'browser profile set')
    check(len(native['steps'])==26 and len(direct['trace']['ticks'])==26,'full matrix schedule size')
    for profile_name,pf in profiles.items():
        ticks=pf['trace']['ticks']
        check(len(ticks)==len(direct['trace']['ticks'])==26,f'{profile_name} tick count')
        check(normalized_state_tick(ticks[0])==native['initialState'],f'{profile_name} initial state')
        check(normalized_state_tick(direct['trace']['ticks'][0])==native['initialState'],'direct initial state')
        cursor=0
        for row in native['steps']:
            if row['kind']=='renderer-swap':
                # Swap is a physical renderer operation, not a Go tick.
                for label,trace in [('direct',direct['trace']['ticks']), (profile_name,ticks)]:
                    cur=trace[cursor]
                    assert_eq(normalized_state_tick(cur),row['state'],f'{label} state at renderer swap')
                    assert_eq(tree(cur),row['view'],f'{label} View at renderer swap')
                continue
            cursor+=1
            check(cursor < len(ticks),f'{profile_name} missing tick {cursor}')
            expected_effects=row.get('effects',[])
            for label,trace in [('direct',direct['trace']['ticks']), (profile_name,ticks)]:
                cur=trace[cursor]
                assert_eq(cur.get('message'),row.get('message'),f'{label} message tick {cursor}')
                assert_eq(normalized_state_tick(cur),row['state'],f'{label} full Go State tick {cursor}')
                assert_eq(tree(cur),row['view'],f'{label} Go View tick {cursor}')
                assert_eq(normalized_effects(cur.get('requestedEffects',[])),expected_effects,f'{label} Go effects tick {cursor}')
        check(cursor==25,f'{profile_name} Go tick mapping did not consume all rows')
        check(pf.get('pageErrors',[])==[],f'{profile_name} page errors')
        check(pf.get('noWasm',{}).get('wasmRequests',[])==[] and pf.get('noWasm',{}).get('apiAttempts',[])==[],f'{profile_name} WASM signal')
        for snap in pf.get('snapshots',[]):
            assert_eq(snap['physicalDOM'],snap['expectedDOM'],f'{profile_name} physical DOM event {snap.get("eventIndex")}')
    # All renderer profiles must agree on effect/cancel correlation records.
    effect_records={name:pf['effectRecords'] for name,pf in profiles.items()}
    assert_eq(effect_records['react'],effect_records['dom'],'React/DOM effect record sequence')
    assert_eq(effect_records['react'],effect_records['swap'],'swap-profile effect record sequence')
    check(matrix_check['events']==26 and matrix_check['ticks']==26 and matrix_check['clicks']==16 and matrix_check['swaps']==17,'full matrix event/click/swap counts')
    check(matrix_check['requests']==7 and matrix_check['cancellations']==3 and matrix_check['cancellationOrder']==['grandchild:g1:r3','child:g1:r2','parent:g1:r1'],'full matrix request/cancel ABI')
    check(matrix_check['stalePhysicalClicksAcrossProfiles']==18 and matrix_check['retiredRendererFences']==32,'full matrix stale binding/fence counts')
    check(matrix_check['callbackFenceEligibleSwaps']==16 and matrix_check['callbackFenceIneligibleSwaps']==1,'callback fence eligibility count')

    # HTTP smoke: compare its initial state and all 23 Go updates with native output,
    # omitting the two no-op duplicate Go messages handled by host correlation rejection.
    check(smoke['schema']=='gobi.compiled-lifecycle-http-smoke/v1' and smoke['status']=='passed','managed HTTP smoke status')
    check(len(smoke['checks'])==12 and smoke['failures']==[],'managed HTTP smoke checks/failures')
    check(smoke['rendererSwaps']==4 and smoke['finalTicks']==24 and len(smoke['finalTrace']['ticks'])==24,'managed smoke swap/tick counts')
    check(smoke['browserVersion']==browser['browser']=='156.0.8078.4','managed Chromium version')
    check(browser['playwright']=='1.64.1','managed Playwright version')
    check(smoke['browserErrors']==[] and smoke['consoleErrors']==[] and smoke['failedRequests']==[],'managed browser/console/network errors')
    check(smoke['requests']==[{'path':'/','status':200,'bytes':4546},{'path':'/demo.css','status':200,'bytes':6573},{'path':'/demo.bundle.mjs','status':200,'bytes':1837935}],'managed HTTP assets')
    check(smoke['wasmRequests']==[] and smoke['noWasm']=={'wasmRequests':[],'wasmAPIAttempts':[]},'managed demo WASM signals')
    smoke_ticks=smoke['finalTrace']['ticks']
    native_demo_steps=[x for x in native['steps'] if x['kind']!='renderer-swap' and x.get('outcome') not in ('duplicate-no-op',)]
    check(len(native_demo_steps)==23 and len(smoke_ticks)==24,'native/HTTP update count')
    check(normalized_state_tick(smoke_ticks[0])==native['initialState'],'HTTP initial Go State')
    for i,row in enumerate(native_demo_steps,1):
        t=smoke_ticks[i]
        assert_eq(t.get('message'),row['message'],f'HTTP native message {i}')
        assert_eq(normalized_state_tick(t),row['state'],f'HTTP full Go State {i}')
        assert_eq(tree(t),row['view'],f'HTTP Go View {i}')
        assert_eq(normalized_effects(t.get('requestedEffects',[])),row.get('effects',[]),f'HTTP Go effects {i}')

    expected_state={
      'parent':('parent','',2,5,True,True,False,'parent:g2:r5','parent:g2:r5',1),
      'child':('child','parent',2,6,True,True,False,'child:g2:r6','child:g2:r6',1),
      'grandchild':('grandchild','child',2,7,True,True,False,'grandchild:g2:r7','grandchild:g2:r7',1),
      'sibling':('sibling','',1,4,True,True,False,'sibling:g1:r4','sibling:g1:r4',1),
    }
    for name,vals in expected_state.items():
        x=smoke['finalState'][name]
        keys=('id','parentId','generation','requestId','alive','requested','pending','token','reply','count')
        actual=tuple(x[k] for k in keys)
        # JSON encodes unsigned Go counters as decimal strings in the UI envelope.
        expected=(vals[0],vals[1],str(vals[2]),str(vals[3]),*vals[4:])
        assert_eq(actual,expected,f'HTTP final {name} state')
    check(smoke['finalState']['nextRequestId']=='7','HTTP final global request ID')
    check(smoke['pendingAtEnd']==[] and smoke['finalBackend']=='dom','HTTP final pending/backend')
    check(smoke['retiredReplyProbeOutcomes']==[{'token':t,'outcome':'rejected','error':'unknown or extra effect completion'} for t in ['grandchild:g1:r3','child:g1:r2','parent:g1:r1']],'HTTP retired callback probes')
    check(len(smoke['goMessageProbeResults'])==3 and all(x['stateUnchanged'] for x in smoke['goMessageProbeResults']),'HTTP stale Go message probes')
    records=smoke['effectRecords']
    check(collections.Counter((x['kind'],x['outcome']) for x in records)==collections.Counter({('request','queued'):7,('cancel','cancelled'):3,('force-deliver-retired','rejected'):3,('deliver','accepted'):4,('deliver','rejected'):2}),'HTTP effect outcomes')
    check([x['token'] for x in records if x['kind']=='request']==['parent:g1:r1','child:g1:r2','grandchild:g1:r3','sibling:g1:r4','parent:g2:r5','child:g2:r6','grandchild:g2:r7'],'HTTP request token order')
    check([x['token'] for x in records if x['kind']=='cancel']==['grandchild:g1:r3','child:g1:r2','parent:g1:r1'],'HTTP child-first cancel order')
    check([x['token'] for x in records if x['kind']=='deliver' and x['outcome']=='rejected']==['sibling:g1:r4','child:g2:r6'],'HTTP duplicate reply rejection')
    controls={x['key']:x['disabled'] for x in smoke['finalDOM']['controls']}
    check(len(controls)==10,'HTTP physical control count')
    check(all(controls[k] is True for k in ['parent-request','child-request','grandchild-request','sibling-request','parent-remount']),'HTTP disabled request/remount controls')
    check(all(controls[k] is False for k in ['parent-add','child-add','grandchild-add','sibling-add','parent-remove']),'HTTP enabled add/remove controls')
    expected_statuses=['Parent: live; count=1; complete parent:g2:r5','Child: live; count=1; complete child:g2:r6','Grandchild: live; count=1; complete grandchild:g2:r7','Sibling: live; count=1; complete sibling:g1:r4']
    html=smoke['finalDOM']['html']
    check(all(s in html for s in expected_statuses),'HTTP final physical DOM status text')
    # Compare matrix's physical final DOM with the HTTP-smoke captured DOM as a cross-path check.
    swap_final=profiles['swap']['snapshots'][-1]['physicalDOM']
    assert_eq(swap_final,smoke['finalDOM'],'matrix and HTTP final physical DOM')

    # Preserve exact environment and hashes in the audit record, without copying large traces.
    files_to_hash={
      'provider_zip':ARTIFACT,
      'execution':ATTEMPT/'execution.json',
      'smoke':ATTEMPT/'demo/demo-smoke.json',
      'screenshot':ATTEMPT/'demo/demo.png',
      'screenshot_review_copy':ROOT/'lanes/demo/managed-demo.png',
      'demo_build':ATTEMPT/'demo/site/demo-build.json',
      'native':ATTEMPT/'matrix/lifecycle.native.json',
      'direct':ATTEMPT/'matrix/lifecycle.direct.json',
      'browser':ATTEMPT/'matrix/lifecycle.browser.json',
      'browser_capture':browser_capture,
      'matrix_check':ATTEMPT/'matrix/lifecycle.check.json',
      'matrix_run':ATTEMPT/'matrix/lifecycle.run.json',
      'appIR':appir_path,
      'compiled_module':module_path,
      'encoder':encoder_path,
      'demo_bundle':ATTEMPT/'demo/site/demo.bundle.mjs',
      'demo_css':ATTEMPT/'demo/site/demo.css',
      'entry':ATTEMPT/'demo/site/entry.mjs',
    }
    file_hashes={k:{'bytes':p.stat().st_size,'sha256':sha(p)} for k,p in files_to_hash.items()}
    check(file_hashes['screenshot']['sha256']=='d1a9d09dc59e88ce02a83e7d8734acf5987e3e4a1a5c3714384a881295b17648','managed screenshot hash')
    check(file_hashes['screenshot_review_copy']==file_hashes['screenshot'],'review screenshot copy differs from provider capture')
    check(file_hashes['browser']['sha256']==file_hashes['browser_capture']['sha256'],'browser capture copy is not byte-identical')
    check(file_hashes['demo_bundle']['bytes']==1837935,'HTTP bundle byte size')
    result={
      'schema':'gobi.compiled-lifecycle-fixed-demo-audit/v1',
      'job_id':'E-FIXED-DEMO','worker':'N3','decision':'accepted','outcome':'confirmed_reuse',
      'scope':'managed successful HTTP demo and complete native/direct/browser lifecycle matrix from the frozen provider artifact; not a claim of a Git landing or deployment',
      'provider':{'artifact_id':13035044166,'run_id':41181505234,'run_conclusion':provider['providerRunConclusion'],'head_sha':provider['source'],'tree':provider['tree'],'zip_bytes':provider['bytes'],'zip_sha256':zip_sha,'members':provider['members'],'crc':'root-verified all passed'},
      'attempt':{'path':str(ATTEMPT.relative_to(WORK)),'status':ex['status'],'mode':ex['mode'],'source_pins_match':ex['sourcePinsMatch'],'source_pin_count':len(ex['sourceBefore']),'matrix_status':matrix_run['status'],'matrix_check_status':matrix_check['status']},
      'managed_http_demo':{'status':smoke['status'],'http_checks':len(smoke['checks']),'trace_ticks_including_init':len(smoke_ticks),'go_updates_compared':len(native_demo_steps),'renderer_swaps':smoke['rendererSwaps'],'final_backend':smoke['finalBackend'],'http_requests':smoke['requests'],'browser_version':smoke['browserVersion'],'playwright_version':browser['playwright'],'browser_errors':len(smoke['browserErrors']),'console_errors':len(smoke['consoleErrors']),'failed_requests':len(smoke['failedRequests']),'wasm_requests':len(smoke['wasmRequests']),'wasm_api_attempts':len(smoke['noWasm']['wasmAPIAttempts']),'pending_at_end':len(smoke['pendingAtEnd'])},
      'matrix':{'native_direct_browser_state_view_effects':'all compared event-by-event after decoding typed Go values','browser_profiles':sorted(profiles),'events':matrix_check['events'],'ticks':matrix_check['ticks'],'clicks':matrix_check['clicks'],'alternating_renderer_swaps':matrix_check['swaps'],'request_effects':matrix_check['requests'],'cancellations':matrix_check['cancellations'],'cancellation_order':matrix_check['cancellationOrder'],'stale_physical_clicks_across_profiles':matrix_check['stalePhysicalClicksAcrossProfiles'],'retired_renderer_fences':matrix_check['retiredRendererFences'],'callback_fence_eligible_swaps':matrix_check['callbackFenceEligibleSwaps'],'callback_fence_ineligible_swaps':matrix_check['callbackFenceIneligibleSwaps'],'mutation_controls_detected':matrix_check['mutationControlsDetected'],'literal_oracle_checks':{'native':matrix_check['nativeTraceCheckedAgainstLiteralOracle'],'direct':matrix_check['directTraceCheckedAgainstLiteralOracle'],'browser':matrix_check['browserTracesCheckedAgainstLiteralOracle'],'physical_dom':matrix_check['physicalDOMCheckedAgainstLiteralOracle']}},
      'lifecycle':{'requests':7,'cancel_order':['grandchild:g1:r3','child:g1:r2','parent:g1:r1'],'retired_callback_rejections':len(smoke['retiredReplyProbeOutcomes']),'stale_go_messages_state_unchanged':len(smoke['goMessageProbeResults']),'duplicate_deliveries_rejected':[x['token'] for x in records if x['kind']=='deliver' and x['outcome']=='rejected'],'final_state':smoke['finalState'],'final_controls':smoke['finalDOM']['controls']},
      'build_identity':{'package_path':build['packagePath'],'component_id':build['componentId'],'capabilities':components[0].get('capabilities',[]),'compiled_module_bytes':build['module']['bytes'],'compiled_module_sha256':build['module']['sha256'],'app_ir_sha256':build['appIR']['sha256'],'encoder_sha256':build['encoder']['sha256'],'bundle_inputs':build['bundleInputs']},
      'managed_toolchain':{'node':ex['versions']['node'],'npm':ex['versions']['npm'],'root_go':ex['versions']['rootGo'],'compiled_go':ex['versions']['compiledGo'],'react':ex['versions']['dependencies']['react'],'react_dom':ex['versions']['dependencies']['reactDOM'],'playwright':ex['versions']['dependencies']['playwright'],'esbuild':ex['versions']['dependencies']['esbuild'],'chromium_reported_by_managed_browser':smoke['browserVersion']},
      'managed_http_check_labels':smoke['checks'],
      'screenshot_visual_inspection':{'inspected':True,'provider_capture':True,'dimensions':'1440x1622','copied_review_path':'compiled-lifecycle/ci/2026-10-31/fixed/lanes/demo/managed-demo.png'},
      'source_and_output_stability':{'source_pins_before_after_equal':ex['sourceBefore']==ex['sourceAfter'],'source_pins_match':ex['sourcePinsMatch'],'matrix_sources_stable':matrix_run['sourcesStable'],'matrix_build_outputs_stable':matrix_run['buildOutputsStableThroughCheck']},
      'selected_provider_members':selected_hashes,
      'file_hashes':file_hashes,
      'audit_environment':{'python':sys.version.split()[0],'script':'compiled-lifecycle/ci/2026-10-31/fixed/lanes/demo/audit_fixed_demo.py'},
    }
    OUT.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'status':'audited','audit':str(OUT.relative_to(WORK)),'matrix_ticks_compared':26,'browser_profiles':sorted(profiles),'http_updates_compared':len(native_demo_steps),'http_checks':len(smoke['checks']),'artifact_sha256':zip_sha},indent=2))

if __name__=='__main__': main()
