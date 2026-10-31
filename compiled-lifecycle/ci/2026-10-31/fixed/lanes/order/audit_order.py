#!/usr/bin/env python3
"""Read-only audit of lifecycle request ordering and renderer fences in fixed CI artifact."""
import hashlib,json,pathlib,subprocess
ROOT=pathlib.Path(subprocess.check_output(['git','rev-parse','--show-toplevel'],text=True).strip())
FIXED=ROOT/'compiled-lifecycle/ci/2026-10-31/fixed'
EX=FIXED/'extracted'
ATT=EX/'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z'
EVID=EX/'compiled-lifecycle/conformance/evidence/attempt-00'
ZIP=pathlib.Path('/tmp/gobi-compiled-lifecycle-41181505234.zip')
COMMIT='00da54ad0f5a4006b13a5cded18ce291845978bc'
TREE='51b64a89b5f7e0edd4792becbed9adad6a27a698'
RUNNER_PREFIX='/home/runner/work/gondola/gondola/'
CORE_FIELDS=('index','message','dispatchId','state','requestedEffects','completedEffects','view')

def sha_file(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''): h.update(block)
 return h.hexdigest()
def readj(path): return json.loads(pathlib.Path(path).read_text())
def require(ok,msg):
 if not ok: raise AssertionError(msg)
def core(trace): return [{k:t.get(k) for k in CORE_FIELDS} for t in trace['ticks']]

provider=readj(FIXED/'provider-download.json')
require(provider['artifactId']==13035044166 and provider['run']==41181505234,'provider artifact identity')
require(provider['providerRunConclusion']=='success' and provider['source']==COMMIT and provider['tree']==TREE,'provider commit/tree/conclusion')
require(provider['bytes']==47072021 and provider['sha256']=='0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26','provider ZIP pin')
require(ZIP.is_file() and ZIP.stat().st_size==provider['bytes'] and sha_file(ZIP)==provider['sha256'],'original provider ZIP')
require(provider['members']==1270 and provider['CRC']=='all passed','provider outer ZIP member/CRC record')
require(subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==COMMIT,'source HEAD')
require(subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,text=True).strip()==TREE,'source tree')
execution=readj(ATT/'execution.json')
require(execution['job_id']=='E-BUILD' and execution['mode']=='full' and execution['status']=='passed','primary E-BUILD completion')
require(execution['sourcePinsMatch'] and execution['sourceBefore']==execution['sourceAfter'] and len(execution['sourceBefore'])==123,'123 stable E-BUILD source pins')
source_mismatches=[]
for pin in execution['sourceBefore']:
 obj=subprocess.run(['git','cat-file','blob',f"{COMMIT}:{pin['path']}"],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if obj.returncode or len(obj.stdout)!=pin['bytes'] or hashlib.sha256(obj.stdout).hexdigest()!=pin['sha256']:
  source_mismatches.append(pin['path'])
require(not source_mismatches,'source pins differ from exact commit object')
# The attempt's copied matrix records and published evidence records must agree on evidence pins.
manifest=readj(ATT/'matrix/lifecycle.manifest.json')
run=readj(ATT/'matrix/lifecycle.run.json')
check=readj(ATT/'matrix/lifecycle.check.json')
require(manifest['status']=='matched' and run['status']=='matched' and check['status']=='matched','conformance outcome')
require(all(stage['status']=='completed' for stage in run['stages']),'conformance stages complete')
evidence_pin_errors=[]
for pin in manifest['evidencePins']:
 path=EX/pin['path']
 if not path.is_file() or path.stat().st_size!=pin['bytes'] or sha_file(path)!=pin['sha256']:
  evidence_pin_errors.append(pin['path'])
require(not evidence_pin_errors,'matrix evidence pins')
# Use raw artifact outputs; do not copy the large native/direct/browser captures into review lane.
native=readj(ATT/'matrix/lifecycle.native.json')
native_cli=readj(ATT/'matrix/native-cli.json')
direct=readj(ATT/'matrix/lifecycle.direct.json')
browser=readj(ATT/'matrix/lifecycle.browser.json')
require(native['steps']==native_cli['steps'] and len(native['steps'])==26,'native adapter and CLI trace steps')
require(len(direct['trace']['ticks'])==26,'direct trace tick count')
require(set(browser['profiles'])=={'react','dom','swap'},'browser profile set')
projection_matches={}; profile_summary={}; all_effect_records=[]
expected_requests=['parent:g1:r1','child:g1:r2','grandchild:g1:r3','sibling:g1:r4','parent:g2:r5','child:g2:r6','grandchild:g2:r7']
expected_cancels=['grandchild:g1:r3','child:g1:r2','parent:g1:r1']
expected_deliveries=['sibling:g1:r4','grandchild:g2:r7','child:g2:r6','parent:g2:r5']
for kind,profile in browser['profiles'].items():
 require(len(profile['trace']['ticks'])==26 and len(profile['events'])==26 and len(profile['actions'])==16 and len(profile['snapshots'])==27,'browser coverage '+kind)
 # This mirrors only the documented full Go projection. Action metadata is intentionally not projected.
 matches=core(direct['trace'])==core(profile['trace'])
 require(matches,'direct/browser full Go projection '+kind)
 projection_matches[kind]=matches
 records=profile['effectRecords']; all_effect_records.append(records)
 require(len(records)==17,'effect record count '+kind)
 requests=[r for r in records if r['kind']=='request']
 cancellations=[r for r in records if r['kind']=='cancel']
 forced=[r for r in records if r['kind']=='force-deliver-retired']
 deliveries=[r for r in records if r['kind']=='deliver']
 require([r['token'] for r in requests]==expected_requests,'request order '+kind)
 require([r['token'] for r in cancellations]==expected_cancels and all(r['outcome']=='cancelled' for r in cancellations),'cancellation order/outcomes '+kind)
 request_correlations={r['token']:{'dispatchId':r['dispatchId'],'effectIndex':r['effectIndex']} for r in requests}
 require(all(r['target']==request_correlations[r['token']] for r in cancellations),'cancel correlation target '+kind)
 require('sibling:g1:r4' not in [r['token'] for r in cancellations],'sibling cancellation '+kind)
 require(len(forced)==3 and [r['token'] for r in forced]==expected_cancels and all(r['outcome']=='rejected' and r['runtimeResult']['accepted'] is False for r in forced),'retired callback rejection '+kind)
 require([r['token'] for r in deliveries if r['outcome']=='accepted']==expected_deliveries,'accepted delivery order '+kind)
 require(profile['pendingAtEnd']==[],'pending requests at end '+kind)
 require(profile['pageErrors']==[] and profile['noWasm']['apiAttempts']==[] and profile['noWasm']['wasmRequests']==[],'browser errors/WASM '+kind)
 # Detached buttons captured at subtree removal/remount must be harmless and preserve all live work.
 stale=profile['stalePhysicalClicks']
 require(len(stale)==1 and stale[0]['eventIndex']==10 and len(stale[0]['attempts'])==6,'detached button attempts '+kind)
 for attempt in stale[0]['attempts']:
  require(attempt['attempted'] and attempt['method']=='retained-detached-HTMLElement.click' and not attempt['targetBefore']['connected'] and not attempt['targetConnectedAfter'],'detached target fencing '+kind)
 for field in ('trace','snapshot','callbacks','pending','effectRecords','physicalHTML'):
  require(stale[0]['before'][field]==stale[0]['after'][field],'detached click changed '+field+' '+kind)
 require([r['token'] for r in stale[0]['before']['pending']]==['sibling:g1:r4'],'sibling remains pending after subtree retirement '+kind)
 # The Go/event schedule drains effects before unmount; unmount then empties renderer DOM without a Go tick.
 unmount=profile['unmount']
 require(unmount['result'] is True and unmount['pendingBefore']==[] and unmount['effectRecordsBefore']==unmount['effectRecordsAfter'],'unmount admission/effects '+kind)
 require(unmount['traceBefore']==unmount['traceAfter'],'unmount adds no Go tick '+kind)
 require(unmount['physicalDOM']=={'html':'','controls':0} and unmount['rendererSnapshot']=={'normalization':'outerHTML-v1','html':'','controls':[]},'unmount DOM cleanup '+kind)
 swaps=profile['swaps']; eligible=[s['after']['retiredCallbacks'] for s in swaps if s['after']['retiredCallbacks']['eligible']]
 ineligible=[s['after']['retiredCallbacks'] for s in swaps if not s['after']['retiredCallbacks']['eligible']]
 require(len(swaps)==(17 if kind=='swap' else 0),'swap count '+kind)
 if kind=='swap':
  require(len(eligible)==16 and len(ineligible)==1,'eligible/ineligible swap count')
  for record in eligible:
   for callback_name in ('dispatch','stale'):
    callback=record[callback_name]
    require(callback['accepted'] is False and callback['stale'] is True and 'fenced after replacement' in callback['error'],'retired callback fence '+callback_name)
  require(profile['rendererSequence'][-1]['id']==18 and len(profile['rendererSequence'])==18,'renderer lifetime sequence')
  require(profile['callbackCounts']=={'dispatch':32,'stale':16},'renderer callback attempt counts')
 # The fixture probes cover canceled old completions and duplicate sibling/child completions.
 probes=profile['probes']
 require(len(probes)==5 and [p['expectRuntimeCompletion'] for p in probes]==['rejected-cancelled']*3+['rejected-duplicate']*2,'effect completion probes '+kind)
 require(all(p['result']['accepted'] is False for p in probes),'rejected completion probes '+kind)
 profile_summary[kind]={
  'go_ticks':len(profile['trace']['ticks']),'physical_click_records':len(profile['actions']),'physical_snapshots':len(profile['snapshots']),
  'requests':len(requests),'request_tokens':[r['token'] for r in requests],
  'cancellations':len(cancellations),'cancellation_order':[r['token'] for r in cancellations],
  'retired_callback_rejections':len(forced),'accepted_deliveries':[r['token'] for r in deliveries if r['outcome']=='accepted'],
  'completion_probes':[p['expectRuntimeCompletion'] for p in probes],
  'detached_click_attempts':len(stale[0]['attempts']),'detached_before_after_unchanged':True,
  'pending_at_end':len(profile['pendingAtEnd']),'unmount_pending_before':len(unmount['pendingBefore']),
  'unmount_dom_controls':unmount['physicalDOM']['controls'],'swaps':len(swaps),
  'eligible_swaps':len(eligible),'ineligible_swaps':len(ineligible),
  'fenced_callback_invocations':2*len(eligible),'callback_counts':profile['callbackCounts']
 }
require(all(records==all_effect_records[0] for records in all_effect_records),'profile effect record equality')
# The fixed profile's pre-removal requests remain pending across the scheduled fixed swap.
fixed=check['pendingSurvivedFixedSwap']
fields={x['name']:x['value'] for x in fixed['fields']}
pending_nodes=[]
for name in ('Parent','Child','Grandchild','Sibling'):
 node_fields={x['name']:x['value'] for x in fields[name]['fields']}
 is_pending=node_fields['Pending']['bool']
 token=node_fields['Token']['string']
 require(is_pending,'fixed swap expected pending state '+name)
 pending_nodes.append(token)
require(pending_nodes==expected_requests[:4],'fixed swap pending request tokens')
# The canonical native/Go schedule checks stale completions before issuing any generation-two requests.
steps=native_cli['steps']
require([steps[i]['message']['arg'] for i in (11,12,13)]==expected_cancels,'stale Go completion tokens')
require([steps[i]['outcome'] for i in (11,12,13)]==['stale-no-op']*3,'stale Go completion no-ops')
require(all(steps[i]['state']==steps[10]['state'] and steps[i]['view']==steps[10]['view'] and steps[i]['effects']==[] for i in (11,12,13)),'stale Go completion state/View/effects unchanged')
require([steps[i]['message']['name'] for i in (19,20,21)]==['requestParent','requestChild','requestGrandchild'],'generation-two requests after stale Go messages')
require(max(11,12,13)<min(19,20,21),'active-generation stale-message order')
go_duplicate_indices=(15,25)
go_duplicate_tokens=['sibling:g1:r4','child:g2:r6']
require([steps[i]['message']['arg'] for i in go_duplicate_indices]==go_duplicate_tokens,'duplicate Go completion tokens')
require([steps[i]['outcome'] for i in go_duplicate_indices]==['duplicate-no-op']*2,'duplicate Go completion no-ops')
require(steps[15]['state']==steps[14]['state'] and steps[25]['state']==steps[24]['state'],'duplicate Go completion state unchanged')
require(all(steps[i]['view']==steps[i-1]['view'] and steps[i]['effects']==[] for i in go_duplicate_indices),'duplicate Go completion View/effects unchanged')
# Check the known action-metadata boundary from the actual traces and checker source.
action_rows=[]
go_message_ticks=(11,12,13,15,25)
for tick in go_message_ticks:
 action_rows.append({'tick':tick,'message':browser['profiles']['react']['trace']['ticks'][tick]['message'],
  'direct_action':direct['trace']['ticks'][tick].get('action'),'browser_action':browser['profiles']['react']['trace']['ticks'][tick].get('action')})
check_source=ROOT/'compiled-lifecycle/conformance/check.mjs'
check_source_sha=sha_file(check_source)
source_pin={p['path']:p for p in execution['sourceBefore']}['compiled-lifecycle/conformance/check.mjs']
require(check_source_sha==source_pin['sha256'],'checker source identity')
check_text=check_source.read_text()
require('const directCore = direct.trace.ticks.map(({ index, message, dispatchId, state, requestedEffects, completedEffects, view })' in check_text,'full Go projection action omission source')
require('require(Array.isArray(profile.actions) && profile.actions.length === 16' in check_text and 'action.observed.message.Name' in check_text,'separate physical click checks source')
require(all(row['direct_action'] is None and row['browser_action']=={'path':'','event':'click','value':''} for row in action_rows),'captured injected-message action metadata')
# Mutation controls and literal oracle flags are part of the successful check, not this review's own replay.
controls=check['mutationControls']
require(check['events']==26 and check['ticks']==26 and check['clicks']==16 and check['swaps']==17,'conformance matrix counts')
require(check['requests']==7 and check['cancellations']==3 and check['cancellationOrder']==expected_cancels,'conformance effects summary')
require(check['stalePhysicalClicksAcrossProfiles']==18 and check['retiredRendererFences']==32 and check['callbackFenceEligibleSwaps']==16 and check['callbackFenceIneligibleSwaps']==1,'conformance callback summary')
require(check['nativeTraceCheckedAgainstLiteralOracle'] and check['directTraceCheckedAgainstLiteralOracle'] and check['browserTracesCheckedAgainstLiteralOracle'] and check['physicalDOMCheckedAgainstLiteralOracle'],'literal checks')
require(len(controls)==8 and all(c['detected'] for c in controls),'negative controls')
# Record the separate headless supplement without treating it as part of this browser replay.
supplement_path=ROOT/'compiled-lifecycle/ci/2026-10-31/local/source-coordination/receipts/E-LIVE-REPLY.json'
supplement=None
if supplement_path.is_file():
 s=readj(supplement_path); supplement={'path':str(supplement_path.relative_to(ROOT)),'sha256':sha_file(supplement_path),'outcome':s.get('outcome'),'summary':s.get('summary')}

attempt_rel='compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z'
paths={
 'execution':ATT/'execution.json','native_cli':ATT/'matrix/native-cli.json','native':ATT/'matrix/lifecycle.native.json',
 'direct':ATT/'matrix/lifecycle.direct.json','browser':ATT/'matrix/lifecycle.browser.json','browser_capture':ATT/'matrix/lifecycle.browser.capture.json',
 'run':ATT/'matrix/lifecycle.run.json','manifest':ATT/'matrix/lifecycle.manifest.json','check':ATT/'matrix/lifecycle.check.json',
 'checker_source':check_source,
}
artifact_refs={k:{'path':str(v.relative_to(EX)) if v.is_relative_to(EX) else str(v),'bytes':v.stat().st_size,'sha256':sha_file(v)} for k,v in paths.items()}
summary={
 'schema':'gobi.fixed-lifecycle-order-review/v1','job_id':'E-FIXED-ORDER','worker':'N2','decision':'confirmed_reuse',
 'provider':{'artifact_id':provider['artifactId'],'run_id':provider['run'],'conclusion':provider['providerRunConclusion'],'source':COMMIT,'tree':TREE,'zip_bytes':ZIP.stat().st_size,'zip_sha256':sha_file(ZIP),'root_verified_members':provider['members'],'root_crc_status':provider['CRC']},
 'execution':{'job_id':execution['job_id'],'mode':execution['mode'],'status':execution['status'],'attempt':execution['attempt'],'source_pin_count':len(execution['sourceBefore']),'source_pins_stable':True,'source_git_mismatches':source_mismatches,'versions':execution['versions']},
 'conformance':{'status':check['status'],'events':check['events'],'ticks':check['ticks'],'clicks':check['clicks'],'browser_profiles':check['browserProfiles'],'requests':check['requests'],'cancellations':check['cancellations'],'cancellation_order':check['cancellationOrder'],'stale_physical_clicks_across_profiles':check['stalePhysicalClicksAcrossProfiles'],'eligible_swap_fences':check['callbackFenceEligibleSwaps'],'ineligible_swaps':check['callbackFenceIneligibleSwaps'],'retired_callback_invocations_fenced':check['retiredRendererFences'],'mutation_controls_detected':check['mutationControlsDetected'],'literal_native_direct_browser_dom_checks':True},
 'profile_results':profile_summary,
 'direct_browser_full_go_projection':{'fields':list(CORE_FIELDS),'matches':projection_matches,'action_included':False},
 'action_metadata_boundary':{'direct_go_message_action':None,'browser_go_message_action':{'path':'','event':'click','value':''},'go_message_ticks':list(go_message_ticks),'canonical_parity_compared':False,'physical_click_action_records_checked_separately':True,'checker_sha256':check_source_sha},
 'schedule_boundary':{'stale_generation_one_go_messages_at_events':[11,12,13],'duplicate_go_messages_at_events':list(go_duplicate_indices),'go_noop_tokens':expected_cancels+go_duplicate_tokens,'generation_two_request_events':[19,20,21],'fresh_generation_two_requests_pending_during_stale_messages':False,'separate_headless_supplement':supplement},
 'evidence_references':artifact_refs,
 'limits':['This review reports the exact fixed browser/direct/native artifact, not any later supplementary scenario as part of this replay.','The stronger stale-Go-message-while-generation-two-requests-are-pending sequence is represented only by the separate headless supplement.','The `action` field is omitted from canonical full-Go trace comparison; no action-parity claim is made for injected go-message metadata.']
}
out=FIXED/'lanes/order/audit.json';out.write_text(json.dumps(summary,indent=2,sort_keys=True)+'\n')
print(json.dumps({'audit':str(out.relative_to(ROOT)),'status':check['status'],'profile_names':list(profile_summary),'zip_sha256':summary['provider']['zip_sha256'],'requests':check['requests'],'cancellations':check['cancellationOrder'],'stale_clicks':check['stalePhysicalClicksAcrossProfiles'],'fences':check['retiredRendererFences'],'full_core_projection_matches':projection_matches},indent=2))
