#!/usr/bin/env python3
"""Validate the restored demo smoke result against retained R-FINAL and fixture evidence."""
import hashlib,json,pathlib,subprocess
ROOT=pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
BASE=ROOT/'compiled-lifecycle/ci/2026-10-31'
LANE=BASE/'lanes/restore'

def readj(p): return json.loads(pathlib.Path(p).read_text())
def sha_file(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
 return h.hexdigest()
def require(ok,msg):
 if not ok: raise AssertionError(msg)

restore=readj(LANE/'restore.json'); smoke=readj(LANE/'smoke.json')
receipt=readj(BASE/'lanes/repair-native-path/green/final-run-receipt.json')
scenario=readj(ROOT/'fixtures/compiled/lifecycle/scenario.json')
root=pathlib.Path(restore['restore_root']); site=root/'demo/site'
# Static restored assets must remain byte-identical across the smoke execution.
after={}
for relative,before in restore['demo_site_pins'].items():
 path=root/relative
 require(path.is_file() and path.stat().st_size==before['bytes'],'site asset missing/size changed '+relative)
 actual=sha_file(path)
 require(actual==before['sha256'],'site asset changed during smoke '+relative)
 after[relative]={'bytes':path.stat().st_size,'sha256':actual,'stable':True}
require(set(after)==set(restore['demo_site_pins']),'site asset pin coverage')
# Local smoke result requirements and comparison with the retained final receipt.
expected=receipt['demoSmoke']
require(smoke['status']=='passed' and smoke['failures']==[],'smoke status/failures')
require(len(smoke['checks'])==12 and smoke['checks']==expected['checks'],'12 smoke checks vs final receipt')
require(smoke['browserVersion']=='153.0.8010.0' and smoke['browserVersion']==expected['browserVersion'],'local browser version')
require(smoke['rendererSwaps']==4 and smoke['rendererSwaps']==expected['rendererSwaps'],'renderer swap count')
require(smoke['finalTicks']==24 and smoke['finalTicks']==expected['finalTicks'],'trace tick count')
require(smoke['finalBackend']=='dom' and smoke['finalBackend']==expected['finalBackend'],'terminal renderer')
require(smoke['pendingAtEnd']==[] and smoke['pendingAtEnd']==expected['pendingAtEnd'],'pending queue terminal state')
require(smoke['requests']==expected['requests'] and len(smoke['requests'])==3,'HTTP asset requests')
require(all(row['status']==200 for row in smoke['requests']),'HTTP 200 responses')
require(smoke['browserErrors']==[] and smoke['consoleErrors']==[] and smoke['failedRequests']==[],'browser/console/network errors')
require(smoke['wasmRequests']==[] and smoke['noWasm']['wasmRequests']==[] and smoke['noWasm']['wasmAPIAttempts']==[],'WASM absence')
require(smoke['httpRequestCount']==3,'HTTP request count')
require(smoke['retiredReplyProbeOutcomes']==expected['retiredReplyProbeOutcomes'],'retired callback outcomes')
require(smoke['goMessageProbeResults']==expected['goMessageProbeResults'],'stale Go completion outcomes')
require(smoke['finalState']==expected['finalState'],'final Go state vs R-FINAL receipt')
require(smoke['finalView']==expected['finalView'],'final Go View vs R-FINAL receipt')
require(smoke['effectRecords']==expected['effectRecords'],'ordered effect records vs R-FINAL receipt')
# Check the finite headless fixture's expected terminal state against this actual run.
final=scenario['expectedStates'][-1]
require(smoke['finalState']['nextRequestId']==str(final['nextRequestID']),'headless expected nextRequestID')
fields={'generation':'generations','requestId':'requestIDs','alive':'alive','requested':'requested','pending':'pending','token':'tokens','reply':'replies','count':'counts'}
for i,node in enumerate(('parent','child','grandchild','sibling')):
 for target,source in fields.items():
  value=final[source][i]
  if target in ('generation','requestId'): value=str(value)
  require(smoke['finalState'][node][target]==value,f'headless final fixture mismatch {node}.{target}')
require(scenario['componentID']==restore['demo_build_metadata']['component_id'],'fixture component identity')
# Explicitly summarize request/cancel/delivery lifecycle evidence from the real Go-backed demo.
records=smoke['effectRecords']
request_tokens=[r['token'] for r in records if r['kind']=='request']
cancel_records=[r for r in records if r['kind']=='cancel']
require([r['token'] for r in cancel_records]==['grandchild:g1:r3','child:g1:r2','parent:g1:r1'],'child-first cancellation order')
require(all(r['outcome']=='cancelled' for r in cancel_records),'cancellation outcomes')
force=[r for r in records if r['kind']=='force-deliver-retired']
require(len(force)==3 and all(r['outcome']=='rejected' for r in force),'force-retired callbacks fenced')
require(len(smoke['goMessageProbeResults'])==3 and all(r['stateUnchanged'] for r in smoke['goMessageProbeResults']),'old Go messages leave state unchanged')
require(len([r for r in records if r['kind']=='deliver' and r['outcome']=='accepted'])==4,'sibling and generation-two replies delivered')
# Compare screenshot file produced by this run and write a portable summary.
screenshot=LANE/'smoke.png'
require(screenshot.is_file(),'screenshot missing')
expected_screenshot=expected['screenshot']
require(screenshot.stat().st_size==expected_screenshot['bytes'] and sha_file(screenshot)==expected_screenshot['sha256'],'restored smoke screenshot differs from R-FINAL')
summary={
 'status':'passed','restored_site':str(site),'smoke_source':'/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/demo/smoke.mjs',
 'smoke_source_sha256':sha_file(ROOT/'compiled-lifecycle/demo/smoke.mjs'),'node':'v22.23.4','chromium':'153.0.8010.0','chromium_path':'/tmp/chromium',
 'checks':len(smoke['checks']),'ticks':smoke['finalTicks'],'renderer_swaps':smoke['rendererSwaps'],'http_requests':smoke['requests'],
 'browser_errors':len(smoke['browserErrors']),'console_errors':len(smoke['consoleErrors']),'failed_requests':len(smoke['failedRequests']),'wasm_requests':len(smoke['wasmRequests']),'wasm_api_attempts':len(smoke['noWasm']['wasmAPIAttempts']),
 'request_tokens':request_tokens,'cancel_order':[r['token'] for r in cancel_records],'retired_callbacks_rejected':len(force),'stale_go_messages_unchanged':len(smoke['goMessageProbeResults']),
 'headless_fixture':{'sha256':restore['headless_fixture']['sha256'],'events':len(scenario['events']),'expected_states':len(scenario['expectedStates']),'final_state_matches':True},
 'site_assets_stable_before_after':after,
 'final_receipt_sha256':restore['r_final_receipt_sha256'],'app_identity':restore['demo_build_metadata']['component_id'],
 'appIR_sha256':restore['demo_build_metadata']['appIR']['sha256'],'module_sha256':restore['demo_build_metadata']['module']['sha256'],
 'smoke_json_sha256':sha_file(LANE/'smoke.json'),'screenshot':{'path':str(screenshot),'bytes':screenshot.stat().st_size,'sha256':sha_file(screenshot),'matches_r_final':True},
}
out=LANE/'post-smoke.json';out.write_text(json.dumps(summary,indent=2,sort_keys=True)+'\n')
print(json.dumps({'status':summary['status'],'post_smoke_record':str(out.relative_to(ROOT)),'checks':summary['checks'],'ticks':summary['ticks'],'swaps':summary['renderer_swaps'],'all_assets_stable':all(r['stable'] for r in after.values()),'screenshot_sha256':summary['screenshot']['sha256']},indent=2))
