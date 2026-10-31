from pathlib import Path
import hashlib, json
root = Path.cwd()
receipt_path = root / 'compiled-capabilities/coordination/receipts/E-RESULT-BROWSER.json'
packet = json.loads(receipt_path.read_text())
attempt = root / 'compiled-capabilities/builds/attempts/attempt-20261031T095356051Z'
raw = json.loads((attempt / 'matrix/capabilities.capability.browser.capture.json').read_text())
check = json.loads((attempt / 'matrix/capabilities.capability-check.json').read_text())
caprun = json.loads((attempt / 'matrix/capabilities.run.json').read_text())
lifecyclerun = json.loads((attempt / 'matrix/capabilities.lifecycle.run.json').read_text())
execution = json.loads((attempt / 'execution.json').read_text())
expectations = json.loads((root / 'compiled-capabilities/oracle/expectations.json').read_text())
react_ir = json.loads((attempt / 'react/output/apps/lifecycle-7e6575d90707/app-ir.json').read_text())
dom_ir = json.loads((attempt / 'dom/output/apps/lifecycle-7e6575d90707/app-ir.json').read_text())
lifecycle_check = json.loads((root / 'compiled-capabilities/conformance/evidence/attempt-00/capabilities.lifecycle.check.json').read_text())
lifecycle_browser = json.loads((root / 'compiled-capabilities/conformance/evidence/attempt-00/capabilities.lifecycle.browser.json').read_text())
def require(ok, message):
    if not ok:
        raise AssertionError(message)
def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()
# Admission cases: exact oracle IDs/order, rejected before any Go or renderer method.
admission = expectations['admission']
groups = [('admissions', admission['rejectBeforeInitOrRender']), ('hostDescriptorCases', admission['strictHostDeclarations']), ('rendererDescriptorCases', admission['strictRendererDeclarations'])]
ids = []
for field, expected in groups:
    rows = raw['admissions'][field]
    require([r['id'] for r in rows] == [r['id'] for r in expected], f'{field}: case order differs')
    for row in rows:
        require(row['rejected'] is True and row['errorName'] == 'TypeError', f'{field}/{row["id"]}: no TypeError rejection')
        require(all(row.get(k) == 0 for k in ('initCalls','updateCalls','viewCalls','rendererCalls')), f'{field}/{row["id"]}: Go/renderer method ran')
        require(row['containerEmpty'] is True, f'{field}/{row["id"]}: container touched')
    ids.extend(r['id'] for r in rows)
require(len(ids) == 19 and len(set(ids)) == 19, 'expected 19 unique admission stimuli')
option = next(r for r in raw['admissions']['hostDescriptorCases'] if r['id'] == 'accessor-host-capabilities-property')
require(option['optionAccessorConstructed'] is True and option['optionGetterCalls'] == 0 and option['descriptorGetterCalls'] == 0, 'host option getter case mismatch')
host_array = next(r for r in raw['admissions']['hostDescriptorCases'] if r['id'] == 'accessor-host-capability')
require(host_array['optionGetterCalls'] == 0 and host_array['descriptorGetterCalls'] == 0, 'host capability accessor invoked')
renderer_accessor_calls = {}
for row in raw['admissions']['rendererDescriptorCases']:
    if row['id'] in {'accessor-renderer-capability','accessor-renderer-capabilities-property'}:
        require(row['descriptorGetterCalls'] == 0 and row['rendererCapabilityGetterCalls'] == 0, f'{row["id"]}: getter invoked')
        renderer_accessor_calls[row['id']] = {'descriptorGetterCalls': row['descriptorGetterCalls'], 'rendererCapabilityGetterCalls': row['rendererCapabilityGetterCalls']}
# Bind capability claims to the real React/DOM AppIR and reject the empty view profile.
component_id = raw['componentId']
component = next(c for c in react_ir['components'] if c['id'] == component_id)
dom_component = next(c for c in dom_ir['components'] if c['id'] == component_id)
require(raw['initialAppIRUsedUnmodified'] is True and raw['componentCapabilities'] == component['capabilities'] == dom_component['capabilities'], 'AppIR capability binding mismatch')
known_view = expectations['renderer']['knownCapabilities']
required_view = [c for c in component['capabilities'] if c in known_view]
swap = raw['swap']; rejected = swap['rejected']
require(required_view == ['view.node'], 'actual renderer requirements differ')
require(rejected['missingCapability'] in required_view and rejected['candidateCapabilities'] == [c for c in required_view if c != rejected['missingCapability']], 'candidate profile not derived from AppIR')
require(rejected['errorName'] == 'TypeError' and rejected['diagnostic']['phase'] == 'admission' and rejected['diagnostic']['oldUnmounted'] is False and rejected['diagnostic']['toGeneration'] is None, 'incompatible candidate not rejected before unmount')
require(all(v == 0 for v in rejected['candidateCalls'].values()), 'incompatible candidate methods ran')
# Raw state/view/DOM/pending comparisons and swap continuity.
for label in ('rejected','compatible'):
    before, after = swap[label]['before'], swap[label]['after']
    for key in ('state','view','dom'):
        require(before['snapshot'][key] == after['snapshot'][key], f'{label} {key} changed')
    require(before['pending'] == after['pending'], f'{label} pending effects changed')
require(swap['oldActiveClickAccepted'] is True and swap['oldActiveClick']['after']['ticks'] == swap['oldActiveClick']['before']['ticks'] + 1 and swap['oldActiveClick']['after']['generation'] == swap['oldActiveClick']['before']['generation'], 'retained renderer click failed')
require(swap['compatible']['oldRootDetached'] is True, 'old root not detached after commit')
require(swap['oldCallbackFencedAfterCommit'] is True and swap['oldCallbackResult']['accepted'] is False and swap['oldCallbackResult']['stale'] is True, 'old callback not fenced')
fence = swap['oldCallbackFence']
require(fence['beforeGeneration'] == fence['afterGeneration'] and fence['beforeTrace'] == fence['afterTrace'], 'fenced callback mutated runtime')
require(swap['replyAccepted'] is True and swap['replyResult']['accepted'] is True, 'pending reply not accepted')
require(swap['disabledClick']['attempted'] is True and swap['disabledClick']['targetDisabled'] is True and swap['disabledClick']['beforeTicks'] == swap['disabledClick']['afterTicks'], 'disabled physical click changed tick trace')
expected_order = ['init','click-add-parent','click-request-parent','disabled-request-click-suppressed','reject-incompatible-renderer','old-active-click-after-rejection','compatible-renderer-commit','fence-old-callback-after-commit','deliver-pending-reply']
require(swap['eventOrder'] == expected_order, 'event sequence differs')
trace = swap['finalTrace']; token = swap['requestRecord']['token']
expected_messages = [None, {'name':'addParent','arg':''}, {'name':'requestParent','arg':''}, {'name':'addParent','arg':''}, {'name':'complete','arg':token}]
require(len(trace['ticks']) == 5, 'trace does not have five ticks')
for i, tick in enumerate(trace['ticks']):
    require(tick['index'] == i and tick['message'] == expected_messages[i], f'tick {i} message differs')
    require(tick['dispatchId'] == (None if i == 0 else f'dispatch-{i:04d}'), f'tick {i} dispatch differs')
require(len(trace['ticks'][2]['requestedEffects']) == 1 and trace['ticks'][2]['requestedEffects'][0]['effect']['arg'] == token, 'request effect/token mismatch')
require(len(trace['ticks'][4]['completedEffects']) == 1 and trace['ticks'][4]['completedEffects'][0]['message'] == expected_messages[4], 'reply effect correlation mismatch')
require(raw['pageErrors'] == [] and raw['noWasm']['apiAttempts'] == [] and raw['noWasm']['wasmRequests'] == [], 'browser errors or WASM activity found')
# Both mutation-control sets.
mutation_ids = ['rejected-state','rejected-view','rejected-dom','rejected-pending','compatible-state','compatible-view','compatible-dom','compatible-pending','host-option-accessor-construction']
mutations = check['capabilityMutationControls']
require([r['id'] for r in mutations] == mutation_ids and len(mutations) == 9 and check['capabilityMutationControlsDetected'] == 9, 'capability mutation control set differs')
require(all(r['detected'] is True and r['error'] not in (None,'checker accepted mutated raw capture') for r in mutations), 'capability mutation escaped')
lifecycle_mutations = lifecycle_check['mutationControls']
require(len(lifecycle_mutations) == 8 and lifecycle_check['mutationControlsDetected'] == 8 and all(r['detected'] is True for r in lifecycle_mutations), 'lifecycle mutation control set differs')
require(lifecycle_check['status'] == 'matched' and lifecycle_check['swaps'] == 17 and lifecycle_check['events'] == 26 and lifecycle_check['ticks'] == 26, 'inherited lifecycle counts/status differ')
require(lifecycle_browser['schema'] == 'gobi.compiled-lifecycle-browser/v1' and lifecycle_browser['pageErrors'] == [], 'inherited browser summary invalid')
# Pins, hashes, publication and failure-gate distinction.
raw_hashes = packet['browserAudit']['rawEvidenceSha256']
raw_mismatches = []
for path, expected in raw_hashes.items():
    actual = digest(path) if Path(path).is_file() else None
    if actual != expected: raw_mismatches.append({'path':path,'expected':expected,'actual':actual})
require(not raw_mismatches, 'author receipt raw evidence hash mismatch')
source_counts = []
for run, label in ((caprun,'capability'),(lifecyclerun,'inherited lifecycle')):
    before, final = run['sourcePinsBefore'], run['sourcePinsFinal']
    require(before == final and run['sourceStableThroughCheck'] is True, f'{label} source pins unstable')
    for row in final:
        path = Path(row['path'])
        if not path.is_absolute(): path = root / path
        require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], f'{label} source pin mismatch {path}')
    source_counts.append(len(final))
require(caprun['buildOutputPinsBeforeCheck'] == caprun['buildOutputPinsAfterCheck'] and caprun['buildOutputsStableThroughCheck'] is True, 'build output pins unstable')
build_pin_facts = []
for row in caprun['buildOutputPinsBeforeCheck']:
    path = root / row['path']
    require(path.is_file() and path.stat().st_size == row['bytes'] and digest(path) == row['sha256'], f'build output pin mismatch {path}')
    build_pin_facts.append({'path':row['path'],'bytes':row['bytes'],'sha256':row['sha256']})
require(execution['status'] == 'failed' and execution['failures'][0]['name'] == 'stage:inherited-static-and-interaction-lifecycle', 'full attempt failure not confirmed')
require(execution['sourcePinsMatch'] is True and len(execution['sourceBefore']) == len(execution['sourceAfter']) == 161, 'full attempt source pins differ')
require(len(execution['commands']) == 16 and all(c.get('exitCode') == 0 for c in execution['commands']), 'full attempt command ledger mismatch')
require(packet['localExecution']['rootObservedProcessExitCode'] == 0 and packet['outcome'] == 'insufficient_evidence', 'failed gate/exit distinction missing')
binding = json.loads((root/'compiled-capabilities/coordination/publication-binding.json').read_text())
require(binding['local']['tree'] == binding['remote']['tree'] == packet['sourceIdentity']['tree'], 'source binding tree mismatch')
require(binding['local']['parents'] == binding['remote']['parents'] == [packet['sourceIdentity']['baseCommit']], 'source binding parent mismatch')
# Verify the author report, receipt, auditor and audit output hashes.
report_hash = digest(root/packet['report']['path'])
require(report_hash == packet['report']['sha256'], 'author report hash mismatch')
require(digest(root/packet['browserAudit']['auditScript']) == packet['browserAudit']['auditScriptSha256'], 'auditor script hash mismatch')
require(digest(root/packet['browserAudit']['auditOutput']) == packet['browserAudit']['auditOutputSha256'], 'auditor output hash mismatch')
review = root/'compiled-capabilities/coordination/reviews/XR-RESULT-BROWSER'
result = {
 'schema':'gobi.browser-result-independent-review-audit/v1',
 'sourceCohort':{'attempt':execution['attempt'],'localCommit':packet['sourceIdentity']['localCommit'],'publishedCommit':packet['sourceIdentity']['publishedCommit'],'tree':packet['sourceIdentity']['tree'],'base':packet['sourceIdentity']['baseCommit']},
 'authorPacket':{'outcome':packet['outcome'],'status':packet['status'],'reportSha256':report_hash,'receiptSha256':digest(receipt_path),'auditScriptSha256':packet['browserAudit']['auditScriptSha256'],'auditOutputSha256':packet['browserAudit']['auditOutputSha256']},
 'admissions':{'count':len(ids),'unique':True,'ids':ids,'allTypeError':True,'zeroGoAndRendererCalls':True,'containerEmpty':True,'hostOptionGetterDescriptorConstructed':option['optionAccessorConstructed'],'hostOptionGetterCalls':option['optionGetterCalls'],'hostArrayGetterCalls':host_array['descriptorGetterCalls'],'rendererAccessorCalls':renderer_accessor_calls},
 'compiledAppIR':{'capabilities':component['capabilities'],'reactDomMatch':True,'requiredRendererCapabilities':required_view,'rejectedCandidateCapabilities':rejected['candidateCapabilities'],'incompatibleRejectedAtAdmission':True},
 'swap':{'rejectedSnapshotPreserved':True,'compatibleSnapshotPreserved':True,'oldActiveClickContinued':True,'oldCallbackFenced':True,'pendingReplyAccepted':True,'disabledClickTraceUnchanged':True,'eventOrder':swap['eventOrder'],'fiveTickMessages':expected_messages,'dispatchIDs':[t['dispatchId'] for t in trace['ticks']],'token':token},
 'mutationControls':{'capabilityRows':[{'id':r['id'],'detected':r['detected'],'error':r['error']} for r in mutations],'capabilityDetected':9,'lifecycleRows':[{'name':r['name'],'detected':r['detected']} for r in lifecycle_mutations],'lifecycleDetected':8},
 'inheritedLifecycle':{'status':lifecycle_check['status'],'events':lifecycle_check['events'],'ticks':lifecycle_check['ticks'],'swaps':lifecycle_check['swaps']},
 'pinChecks':{'rawEvidenceEntries':len(raw_hashes),'rawEvidenceMismatches':raw_mismatches,'capabilitySourcePins':source_counts[0],'lifecycleSourcePins':source_counts[1],'buildOutputPins':build_pin_facts,'sourcePinsStable':True,'buildOutputPinsStable':True},
 'fullRun':{'status':execution['status'],'failedStage':execution['failures'][0]['name'],'failure':execution['failures'][0]['error'],'recordedCommands':len(execution['commands']),'allRecordedCommandsExitZero':True,'rootObservedOuterProcessExitCode':0,'acceptance':False},
 'hostedArtifact':{'inspectedByN3Packet':False,'owner':'N4','hostedAcceptanceClaim':False},
 'limitations':['Review accepts only local failed-cohort browser subevidence; it does not accept the overall E-BUILD run, hosted artifact, source publication, or milestone.']
}
(review/'audit.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
print(json.dumps({'out':'compiled-capabilities/coordination/reviews/XR-RESULT-BROWSER/audit.json','status':'passed','admissions':len(ids),'ticks':len(trace['ticks']),'capabilityMutations':len(mutations),'inheritedMutations':len(lifecycle_mutations),'rawHashesChecked':len(raw_hashes),'capabilitySourcePins':source_counts[0],'lifecycleSourcePins':source_counts[1],'buildPins':len(caprun['buildOutputPinsBeforeCheck'])},indent=2))
