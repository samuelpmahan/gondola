#!/usr/bin/env python3
"""Independent physical-DOM and trace audit over the original provider ZIP bytes."""
from __future__ import annotations
import collections, hashlib, json, pathlib, stat, struct, subprocess, sys, zipfile

ROOT = pathlib.Path.cwd()
DATE = ROOT / 'compiled-lifecycle/ci/2026-10-31'
FIXED = DATE / 'fixed'
REVIEW = FIXED / 'reviews/dom'
ZIP_PATH = pathlib.Path('/tmp/gobi-compiled-lifecycle-41181505234.zip')
COMMIT = '00da54ad0f5a4006b13a5cded18ce291845978bc'
TREE = '51b64a89b5f7e0edd4792becbed9adad6a27a698'
PKG = 'github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle'
ATTEMPT = 'compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z'
NODE = '/tmp/gondola-node22/node_modules/node/bin/node'
ORACLE = 'compiled-lifecycle/browser/lifecycle-oracle.mjs'
SCENARIO = 'fixtures/compiled/lifecycle/scenario.json'


def need(condition, label):
    if not condition:
        raise AssertionError(label)

def digest(data): return hashlib.sha256(data).hexdigest()
def canonical(x): return json.dumps(x, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
def decode(value):
    if isinstance(value, list): return [decode(x) for x in value]
    if not isinstance(value, dict): return value
    kind = value.get('kind')
    if kind == 'struct' and 'typeId' in value: return {f['name']:decode(f['value']) for f in value.get('fields',[])}
    if kind in ('slice','array') and 'typeId' in value: return [decode(x) for x in value.get('items',[])]
    if kind in ('uint','int') and 'integer' in value: return int(value['integer'])
    if kind == 'float64' and 'float64Bits' in value: return struct.unpack('>d',bytes.fromhex(value['float64Bits']))[0]
    if kind == 'float32' and 'float32Bits' in value: return struct.unpack('>f',bytes.fromhex(value['float32Bits']))[0]
    if kind == 'string' and 'string' in value: return value['string']
    if kind == 'bool' and 'bool' in value: return value['bool']
    if kind == 'null': return None
    return {k:decode(v) for k,v in value.items()}

def load_archive_json(archive, rel):
    raw=archive.read(rel)
    try: obj=json.loads(raw)
    except Exception as e: raise AssertionError(f'provider member is not valid JSON: {rel}: {e}')
    return obj, raw

def git_blob(path):
    return subprocess.check_output(['git','show',f'{COMMIT}:{path}'],cwd=ROOT)

def effect_projection(effects): return [e.get('effect',e) for e in effects]
def view_tree(tick):
    v=tick['view']
    return v.get('tree',v) if isinstance(v,dict) else v

def run_oracle():
    source=git_blob(ORACLE)
    need(digest(source)=='795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82','pinned literal oracle source SHA')
    worktree=(ROOT/ORACLE).read_bytes()
    need(worktree==source,'working oracle file differs from immutable Git source')
    code=("import {LIFECYCLE_STATES,LIFECYCLE_STEPS,LIFECYCLE_PROBES,expectedLifecycleView,expectedLifecycleDOM,expectedLifecyclePhysicalControls} "
          "from './compiled-lifecycle/browser/lifecycle-oracle.mjs'; "
          "const out={states:LIFECYCLE_STATES,steps:LIFECYCLE_STEPS,probes:LIFECYCLE_PROBES," 
          "views:LIFECYCLE_STATES.map(expectedLifecycleView),doms:LIFECYCLE_STATES.map(expectedLifecycleDOM),"
          "controls:LIFECYCLE_STATES.map(expectedLifecyclePhysicalControls)}; process.stdout.write(JSON.stringify(out));")
    command=[NODE,'--input-type=module','-e',code]
    proc=subprocess.run(command,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
    oracle=json.loads(proc.stdout)
    return oracle,proc.stdout,command,proc.stderr

def expected_browser_effects(steps,probes):
    records=[]; requests={}; seq=0
    for i,step in enumerate(steps):
        for effect_index,effect in enumerate(step.get('effects',[])):
            token=effect['arg']; seq+=1
            if effect['kind']=='fixture.request':
                corr={'dispatchId':f"dispatch-{step['stateIndex']:04d}",'effectIndex':0}
                requests[token]=corr
                records.append({'sequence':seq,'kind':'request',**corr,'token':token,'outcome':'queued'})
            elif effect['kind']=='lifecycle.cancel':
                need(token in requests,'oracle cancel token had no request')
                records.append({'sequence':seq,'kind':'cancel','dispatchId':f"dispatch-{step['stateIndex']:04d}",
                  'effectIndex':effect_index,'token':token,'target':requests[token],'outcome':'cancelled'})
            else: raise AssertionError('unexpected literal effect kind '+effect['kind'])
        for probe in probes:
            if probe['afterEvent']==i and probe['expectRuntimeCompletion']=='rejected-cancelled':
                token=probe['token']; need(token in requests,'retired callback token had no request'); seq+=1
                records.append({'sequence':seq,'kind':'force-deliver-retired',**requests[token],'token':token,'outcome':'rejected',
                  'message':{'name':'complete','arg':token},'runtimeResult':{'accepted':False,'error':'unknown or extra effect completion'}})
        if step['kind']=='effect-reply':
            token=step['token']; need(token in requests,'literal reply token had no request'); seq+=1
            records.append({'sequence':seq,'kind':'deliver',**requests[token],'token':token,'outcome':'accepted',
                'message':step['message'],'runtimeResult':{'accepted':True,'dispatchId':f"dispatch-{step['stateIndex']:04d}"}})
    return records

def expected_direct_effects(steps):
    records=[]; requests={}; seq=0
    for step in steps:
        if step['kind']=='effect-reply':
            token=step['token']; need(token in requests,'direct reply token missing request'); seq+=1
            records.append({'sequence':seq,'kind':'deliver',**requests[token],'token':token,'outcome':'accepted','message':step['message']})
        for effect_index,effect in enumerate(step.get('effects',[])):
            token=effect['arg']; seq+=1
            if effect['kind']=='fixture.request':
                corr={'dispatchId':f"dispatch-{step['stateIndex']:04d}",'effectIndex':0};requests[token]=corr
                records.append({'sequence':seq,'kind':'request',**corr,'token':token,'outcome':'queued'})
            elif effect['kind']=='lifecycle.cancel':
                need(token in requests,'direct cancel token missing request')
                records.append({'sequence':seq,'kind':'cancel','dispatchId':f"dispatch-{step['stateIndex']:04d}",
                  'effectIndex':effect_index,'token':token,'target':requests[token],'outcome':'cancelled'})
            else: raise AssertionError('unexpected direct effect kind '+effect['kind'])
    return records


def main():
    need(ZIP_PATH.is_file(),'original provider ZIP is absent')
    zip_bytes=ZIP_PATH.read_bytes()
    zip_sha=digest(zip_bytes)
    need(len(zip_bytes)==47072021 and zip_sha=='0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26','provider ZIP bytes/hash')
    with zipfile.ZipFile(ZIP_PATH) as z:
        infos=z.infolist(); names=[x.filename for x in infos]
        need(len(infos)==1270 and len(set(names))==1270,'ZIP member count or duplicate names')
        unsafe=[]
        for info in infos:
            p=pathlib.PurePosixPath(info.filename)
            mode=(info.external_attr>>16)&0xffff
            if p.is_absolute() or '..' in p.parts or '\\' in info.filename or stat.S_ISLNK(mode): unsafe.append(info.filename)
        need(not unsafe,'unsafe provider ZIP members: '+repr(unsafe[:3]))
        need(z.testzip() is None,'provider ZIP CRC failure')
        uncompressed=sum(i.file_size for i in infos)
        need(uncompressed==413394195,'provider uncompressed byte count')
        def j(rel): return load_archive_json(z,rel)
        attempt=ATTEMPT
        execution,exec_bytes=j(f'{attempt}/execution.json')
        run,run_bytes=j(f'{attempt}/matrix/lifecycle.run.json')
        check,check_bytes=j(f'{attempt}/matrix/lifecycle.check.json')
        manifest,manifest_bytes=j(f'{attempt}/matrix/lifecycle.manifest.json')
        native,native_bytes=j(f'{attempt}/matrix/lifecycle.native.json')
        direct,direct_bytes=j(f'{attempt}/matrix/lifecycle.direct.json')
        browser,browser_bytes=j(f'{attempt}/matrix/lifecycle.browser.capture.json')
        browser_copy,browser_copy_bytes=j(f'{attempt}/matrix/lifecycle.browser.json')
        react_app,react_app_bytes=j(f'{attempt}/react/output/apps/lifecycle-7e6575d90707/app-ir.json')
        dom_app,dom_app_bytes=j(f'{attempt}/dom/output/apps/lifecycle-7e6575d90707/app-ir.json')
        react_module=z.read(f'{attempt}/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs')
        dom_module=z.read(f'{attempt}/dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs')
        react_encoder=z.read(f'{attempt}/react/output/apps/lifecycle-7e6575d90707/encoder.mjs')
        dom_encoder=z.read(f'{attempt}/dom/output/apps/lifecycle-7e6575d90707/encoder.mjs')
        author_exec,author_exec_bytes=j(f'{attempt}/execution.json')
        source_pin_files=set(names)
        need(browser_bytes==browser_copy_bytes,'browser capture and browser output members differ')

        # Validate every run source pin against immutable Git objects or direct provider ZIP members.
        pin_rows=run['sourcePinsBefore']
        need(len(pin_rows)==179 and run['sourcePinsBefore']==run['sourcePinsAfter']==run['sourcePinsFinal'],'source pins are not stable')
        src_count=generated_count=0; pin_checks=[]
        prefix=f'{ATTEMPT}/'
        for pin in pin_rows:
            path=pin['path']
            if path.startswith(prefix):
                need(path in source_pin_files,'generated source pin is not a member of provider ZIP: '+path)
                blob=z.read(path); generated_count+=1; origin='provider_zip'
            else:
                blob=git_blob(path); src_count+=1; origin='immutable_git_object'
            need(len(blob)==pin['bytes'] and digest(blob)==pin['sha256'],'source pin mismatch: '+path)
            pin_checks.append({'path':path,'bytes':len(blob),'sha256':digest(blob),'origin':origin})
        need(src_count==51 and generated_count==128,'pin classification/count mismatch')
        for pin in run['buildOutputPinsBeforeCheck']:
            need(pin['path'] in source_pin_files,'build output pin is not a ZIP member: '+pin['path'])
            blob=z.read(pin['path']); need(len(blob)==pin['bytes'] and digest(blob)==pin['sha256'],'build output pin mismatch '+pin['path'])
        for pin in run['evidencePins']:
            need(pin['path'] in source_pin_files,'matrix evidence pin is not a ZIP member: '+pin['path'])
            blob=z.read(pin['path']); need(len(blob)==pin['bytes'] and digest(blob)==pin['sha256'],'matrix output pin mismatch '+pin['path'])

    # Source fixture and literal oracle are read from the immutable named Git tree, not an extraction.
    need(subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()==COMMIT,'review checkout is not at pinned source commit')
    tree=subprocess.check_output(['git','rev-parse',f'{COMMIT}^{{tree}}'],cwd=ROOT,text=True).strip()
    need(tree==TREE,'pinned source tree identity')
    scenario_bytes=git_blob(SCENARIO); scenario=json.loads(scenario_bytes)
    scenario_sha=digest(scenario_bytes)
    oracle,oracle_bytes,oracle_command,oracle_stderr=run_oracle()
    states,steps,probes=oracle['states'],oracle['steps'],oracle['probes']
    need(len(states)==26 and len(steps)==26 and len(probes)==5,'literal oracle dimensions')
    need(scenario_sha=='45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650','immutable scenario hash')
    need(execution['job_id']=='E-BUILD' and execution['status']=='passed' and execution['mode']=='full','full execution result')
    need(execution['sourcePinsMatch'] is True and execution['sourceBefore']==execution['sourceAfter'] and len(execution['sourceBefore'])==123,'execution source pins')
    need(execution['sourcePinsMatch'] and run['status']=='matched' and check['status']=='matched' and manifest['status']=='matched','complete checker status')
    need(run['summary']==check and all(x['status']=='completed' for x in run['stages']),'run/check or stages status')
    need(run['sourcesStable'] and run['sourceStableThroughCheck'] and run['buildOutputsStableThroughCheck'],'source/build stability flags')
    need(scenario['packagePath']==PKG and scenario['componentID']==PKG,'fixture package identity')
    for checkpoint in scenario['expectedStates']:
        event_i=checkpoint['afterEvent']; state_i=0 if event_i<0 else steps[event_i]['stateIndex']; state=states[state_i]
        nodes=[state[k] for k in ('Parent','Child','Grandchild','Sibling')]
        for key,field in (('generations','Generation'),('requestIDs','RequestID'),('alive','Alive'),('requested','Requested'),('pending','Pending'),('tokens','Token'),('replies','Reply')):
            need([n[field] for n in nodes]==checkpoint[key],f'fixture checkpoint {event_i} {key}')
        need([n['Counter']['Count'] for n in nodes]==checkpoint['counts'],f'fixture checkpoint {event_i} counters')
        need(state['NextRequestID']==checkpoint['nextRequestID'],f'fixture checkpoint {event_i} request sequence')
    need(native['componentID']==direct['componentID']==browser['componentID']==PKG,'native/direct/browser component id')
    need(native['packagePath']==direct['packagePath']==browser['packagePath']==PKG,'native/direct/browser package path')
    need(native['initialState']==states[0] and len(native['steps'])==26,'native initial state/event count')
    need(len(direct['steps'])==26 and len(direct['trace']['ticks'])==26,'direct event/tick count')
    need(len(scenario['events'])==26,'scenario event count')

    # Native Go states and Views, direct typed trace and effects against independent literal rows.
    for i,(step,nrow,drow,event) in enumerate(zip(steps,native['steps'],direct['steps'],scenario['events'])):
        si=step['stateIndex']; expected_state=states[si]
        need(nrow['index']==i and nrow['kind']==step['kind'],'native row identity '+str(i))
        need(nrow['message']==(None if step['kind']=='renderer-swap' else step.get('message')),'native message '+str(i))
        need(nrow['effects']==step.get('effects',[]),'native effects '+str(i))
        need(nrow['state']==expected_state and nrow['view']==oracle['views'][si]['tree'],'native State/View '+str(i))
        need(drow['eventIndex']==i and drow['event']==event,'direct event binding '+str(i))
        need(drow['message']==nrow['message'],'native/direct message '+str(i))
        need(decode(drow['state'])==expected_state,'direct typed State '+str(i))
        need(drow['view']==oracle['views'][si],'direct View '+str(i))
        need(effect_projection(drow['requestedEffects'])==step.get('effects',[]),'direct event effects '+str(i))

    tick_by_state={s['stateIndex']:s for s in steps if s['kind']!='renderer-swap'}
    request_corr={}
    for step in steps:
        for effect in step.get('effects',[]):
            if effect['kind']=='fixture.request': request_corr[effect['arg']]={'dispatchId':f"dispatch-{step['stateIndex']:04d}",'effectIndex':0}
    need(len(direct['trace']['ticks'])==26,'direct trace ticks')
    for i,tick in enumerate(direct['trace']['ticks']):
        s=tick_by_state.get(i)
        msg=s.get('message') if s else None
        dispatch=f'dispatch-{i:04d}' if s else None
        requested=[] if s is None else [{'dispatchId':dispatch,'effectIndex':k,'effect':effect} for k,effect in enumerate(s.get('effects',[]))]
        completed=[]
        if s and s['kind']=='effect-reply': completed=[{**request_corr[s['token']],'message':s['message']}]
        need(tick['index']==i and decode(tick['state'])==states[i],'direct tick state '+str(i))
        need(tick['message']==msg and tick['dispatchId']==dispatch,'direct tick message/correlation '+str(i))
        need(tick['requestedEffects']==requested and tick['completedEffects']==completed,'direct tick effect arrays '+str(i))
        need(tick['view']==oracle['views'][i] and tick['dom'] is None,'direct tick View/DOM projection '+str(i))

    total_snaps=total_props=total_disabled=active_clicks=detached_clicks=0
    profile_summaries={}
    direct_projection_fields=('index','message','dispatchId','state','requestedEffects','completedEffects','view')
    for name in ('react','dom','swap'):
        profile=browser['profiles'][name]
        need(profile['backend']==name and profile['componentId']==PKG and profile['appId']==PKG,'browser identity '+name)
        need(len(profile['events'])==26 and len(profile['trace']['ticks'])==26,'browser events/ticks '+name)
        need(len(profile['actions'])==16 and len(profile['snapshots'])==27,'browser actions/snapshots '+name)
        for i,(tick,dtick) in enumerate(zip(profile['trace']['ticks'],direct['trace']['ticks'])):
            need(tick['index']==i and decode(tick['state'])==states[i],'browser typed Go state '+name+':'+str(i))
            need(tick['view']==oracle['views'][i] and tick['dom']==oracle['doms'][i],'browser View/DOM trace '+name+':'+str(i))
            need({k:tick.get(k) for k in direct_projection_fields}=={k:dtick.get(k) for k in direct_projection_fields},'browser/direct full trace '+name+':'+str(i))
        for i,(record,step) in enumerate(zip(profile['events'],steps)):
            need(record['eventIndex']==i and record['event']==scenario['events'][i] and record['stateIndex']==step['stateIndex'],'browser event binding '+name+':'+str(i))
        for si,snapshot in enumerate(profile['snapshots']):
            state_i=snapshot['stateIndex']
            need(0<=state_i<26 and snapshot['traceTickIndex']==state_i,'snapshot state/tick index '+name+':'+str(si))
            need(snapshot['traceTick']==profile['trace']['ticks'][state_i],'snapshot trace ref '+name+':'+str(si))
            physical=snapshot['physicalDOM']; expected_dom=oracle['doms'][state_i]
            expected_controls=[{k:v for k,v in c.items() if k!='text'} for c in oracle['controls'][state_i]]
            need(physical==expected_dom,'outerHTML/live controls vs oracle '+name+':'+str(si))
            need(snapshot['expectedDOM']==expected_dom and snapshot['rendererSnapshot']==expected_dom,'expected/renderer snapshot '+name+':'+str(si))
            need(snapshot['runtimeSnapshot']['dom']==expected_dom,'runtime snapshot '+name+':'+str(si))
            need(physical['controls']==expected_controls,'native button disabled props vs oracle '+name+':'+str(si))
            need(all(type(c['disabled']) is bool for c in physical['controls']),'disabled not a boolean DOM property '+name+':'+str(si))
            total_snaps+=1; total_props+=len(physical['controls']); total_disabled+=sum(c['disabled'] is True for c in physical['controls'])
        click_index=0
        for event_i,step in enumerate(steps):
            if step['kind']!='click': continue
            action=profile['actions'][click_index]
            control=next(c for c in oracle['controls'][step['stateIndex']-1] if c['path']==step['action']['path'])
            target={'connected':True,'disabled':control['disabled'],'value':step['action']['value'],'type':control['type'],'text':control['text']}
            need(action['eventIndex']==event_i and action['method']=='HTMLElement.click' and action['attempted'] is True,'click method/attempt '+name+':'+str(click_index))
            need(action['action']==step['action'] and action['expectedMessage']==step['message'],'click event/message metadata '+name+':'+str(click_index))
            need(action['target']==target,'click physical target properties '+name+':'+str(click_index))
            need(action['afterTicks']==action['beforeTicks']+1,'click Go tick delta '+name+':'+str(click_index))
            click_index+=1;active_clicks+=1
        need(click_index==16,'active click total for '+name)
        stale_rows=profile['stalePhysicalClicks']
        need(len(stale_rows)==1 and stale_rows[0]['eventIndex']==10,'detached probe event '+name)
        stale=stale_rows[0]
        expected_detached=[('0/1','addParent'),('0/2','requestParent'),('0/3/1','addChild'),('0/3/2','requestChild'),('0/3/3/1','addGrandchild'),('0/3/3/2','requestGrandchild')]
        need(len(stale['attempts'])==6,'detached controls count '+name)
        for attempt,(path,msgname) in zip(stale['attempts'],expected_detached):
            need(attempt['path']==path and attempt['message']=={'name':msgname,'arg':''},'detached target/message '+name+':'+path)
            need(attempt['method']=='retained-detached-HTMLElement.click' and attempt['attempted'] is True,'detached click metadata '+name+':'+path)
            need(attempt['targetBefore']['connected'] is False and attempt['targetConnectedAfter'] is False,'detached connectivity '+name+':'+path)
            detached_clicks+=1
        for field in ('trace','snapshot','callbacks','pending','effectRecords','physicalHTML'):
            need(stale['before'][field]==stale['after'][field],'detached click changed '+field+' '+name)
        need(profile['pendingAtEnd']==[] and profile['pageErrors']==[],'browser terminal state/errors '+name)
        need(profile['noWasm']['apiAttempts']==[] and profile['noWasm']['wasmRequests']==[],'browser WASM signal '+name)
        need(profile['unmount']['physicalDOM']['html']=='' and profile['unmount']['physicalDOM']['controls']==0,'unmount retained physical DOM '+name)
        profile_summaries[name]={'events':len(profile['events']),'ticks':len(profile['trace']['ticks']),
          'physical_snapshots':len(profile['snapshots']),'live_button_properties':sum(len(s['physicalDOM']['controls']) for s in profile['snapshots']),
          'active_clicks':len(profile['actions']),'detached_clicks':len(stale['attempts']),
          'effect_records':len(profile['effectRecords']),'pending_at_end':len(profile['pendingAtEnd']),'page_errors':len(profile['pageErrors'])}
        need(profile['effectRecords']==expected_browser_effects(steps,probes),'complete ordered effects/callback trace '+name)

    need(total_snaps==81 and total_props==792 and total_disabled==228,'aggregate snapshot/live-button properties')
    need(active_clicks==48 and detached_clicks==18,'aggregate active/detached click counts')
    need(direct['effectRecords']==expected_direct_effects(steps) and direct['pending']==[],'direct full effects/pending queue')
    direct_records=direct['effectRecords']
    request_tokens=[r['token'] for r in direct_records if r['kind']=='request']
    cancel_order=[r['token'] for r in direct_records if r['kind']=='cancel']
    need(request_tokens==['parent:g1:r1','child:g1:r2','grandchild:g1:r3','sibling:g1:r4','parent:g2:r5','child:g2:r6','grandchild:g2:r7'],'request tokens')
    need(cancel_order==['grandchild:g1:r3','child:g1:r2','parent:g1:r1'],'child-first cancellation order')

    # Remove/remount and the stable independent Sibling are checked on the raw native output.
    removed=native['steps'][9]['state'];remounted=native['steps'][10]['state']
    need(all(not removed[n]['Alive'] for n in ('Parent','Child','Grandchild')),'removeParent did not remove subtree')
    need(removed['Sibling']['Alive'] and removed['Sibling']['Pending'] and removed['Sibling']['Token']=='sibling:g1:r4','removed subtree lost sibling pending request')
    need(all(remounted[n]['Alive'] and remounted[n]['Generation']==2 and remounted[n]['Counter']['Count']==0 for n in ('Parent','Child','Grandchild')),'remount did not create fresh generation 2 subtree')
    need(remounted['Sibling']==removed['Sibling'],'remount mutated sibling')
    for i in (11,12,13): need(native['steps'][i]['state']==remounted,'old reply changed remounted tree '+str(i))
    need(native['steps'][15]['state']==native['steps'][14]['state'],'duplicate sibling message changed state')
    need(native['steps'][25]['state']==native['steps'][24]['state'],'duplicate child message changed state')

    swap_profile=browser['profiles']['swap']; swaps=swap_profile['swaps']
    need(len(swaps)==17,'renderer swaps')
    eligible=[r for r in swaps if r['after']['retiredCallbacks']['eligible']]
    ineligible=[r for r in swaps if not r['after']['retiredCallbacks']['eligible']]
    fences=0
    for row in eligible:
        retired=row['after']['retiredCallbacks']
        need(retired['dispatch']['accepted'] is False and retired['dispatch']['stale'] is True,'retired dispatch not fenced '+row['reason'])
        need(retired['stale']['accepted'] is False and retired['stale']['stale'] is True,'retired stale callback not fenced '+row['reason'])
        delta=len(retired['after']['diagnostics']['fencedCallbacks'])-len(retired['before']['diagnostics']['fencedCallbacks'])
        need(delta==2,'expected two fences for '+row['reason']); fences+=delta
    need(len(eligible)==16 and len(ineligible)==1 and fences==32,'eligible swap/fence counts')
    fixed_swap=next(r for r in swaps if r['reason']=='fixture-renderer-swap-8')
    pending=['parent:g1:r1','child:g1:r2','grandchild:g1:r3','sibling:g1:r4']
    need([x['token'] for x in fixed_swap['before']['pending']]==pending,'fixed swap pending tokens before')
    need(fixed_swap['after']['pending']==fixed_swap['before']['pending'],'fixed swap dropped/reassigned pending correlations')
    need(swap_profile['rendererSequence'][-1]['backend']=='react','alternating profile final backend')

    # Literal checker is a completed artifact member, not rerun here.
    expected_mutations=['native-child-first-cancel-order','direct-old-generation-state','direct-message','react-physical-dom',
      'dom-disabled-control','swap-effect-correlation','remounted-detached-button','cancel-order-literal']
    muts=check['mutationControls']
    need([x['name'] for x in muts]==expected_mutations and all(x['detected'] for x in muts),'mutation controls')
    need(check['mutationControlsDetected']==8 and check['nativeTraceCheckedAgainstLiteralOracle'] and check['directTraceCheckedAgainstLiteralOracle'] and check['browserTracesCheckedAgainstLiteralOracle'] and check['physicalDOMCheckedAgainstLiteralOracle'],'complete checker oracle flags')
    need(check['events']==26 and check['ticks']==26 and check['clicks']==16 and check['swaps']==17 and check['requests']==7 and check['cancellations']==3 and check['stalePhysicalClicksAcrossProfiles']==18 and check['retiredRendererFences']==32 and check['callbackFenceEligibleSwaps']==16 and check['callbackFenceIneligibleSwaps']==1,'checker aggregate counts')

    # Backend builds are raw ZIP members; exact module identity and distinct build roots are retained.
    need(react_app==dom_app,'React/DOM AppIR differ')
    component=next(c for c in react_app['components'] if c.get('packagePath')==PKG)
    need(component['id']==PKG and 'effect.request-reply' in component['capabilities'],'AppIR component/capability')
    need(digest(react_encoder)==digest(dom_encoder),'React/DOM encoder hash mismatch')
    need(digest(react_module)=='70e1d1171ab71b84e906ef2819faed10902a1cc893afb568e99e077d0f10b260','React compiled module hash')
    need(digest(dom_module)=='dabb20e55c86b1821ee12254e10ca4a9a25ec4e12573ad27e6650024f9f69d9c','DOM compiled module hash')
    need(digest(react_module)!=digest(dom_module),'unexpected raw React/DOM module equality')

    # Compare the independently reviewed N4 packet to the captured content hashes and claims.
    author_report=DATE/'coordination/reports/E-FIXED-DOM.md'
    author_receipt_path=DATE/'coordination/receipts/E-FIXED-DOM.json'
    author_audit_path=FIXED/'lanes/dom/audit.json'
    author_script_path=FIXED/'lanes/dom/audit_fixed_dom.py'
    author_report_bytes=author_report.read_bytes(); author_receipt_bytes=author_receipt_path.read_bytes(); author_audit_bytes=author_audit_path.read_bytes(); author_script_bytes=author_script_path.read_bytes()
    need(digest(author_report_bytes)=='466168c1755cfd9dafa92975c29d9e94c29bb1bd27b601dd2e928f1ea332672f','author report source hash')
    need(digest(author_audit_bytes)=='a0e2c072b7edcabbc12c0fe349a90b3a6ed758f89abf50a232b54d335c7b8279','author audit source hash')
    author_receipt=json.loads(author_receipt_bytes); author_audit=json.loads(author_audit_bytes)
    need(author_receipt['job_id']=='E-FIXED-DOM' and author_receipt['worker']=='N4' and author_receipt['decision']=='accepted','author receipt identity/decision')
    need(author_receipt['report_sha256']==digest(author_report_bytes) and author_receipt['audit_sha256']==digest(author_audit_bytes),'author receipt report/audit linkage')
    need(author_audit['provider']['zip_sha256']==zip_sha and author_audit['provider']['artifact_id']==13035044166 and author_audit['provider']['run_id']==41181505234,'author audit provider binding')
    need(author_audit['physical_dom']['total_snapshots']==total_snaps and author_audit['physical_dom']['live_button_properties_checked']==total_props,'author audit counts match archive')
    need(author_audit['complete_run']['check_status']==check['status'] and author_audit['mutations']['count']==8,'author audit checker/mutation counts match archive')

    zip_member_hashes={}
    with zipfile.ZipFile(ZIP_PATH) as z:
        for rel in [f'{ATTEMPT}/execution.json',f'{ATTEMPT}/matrix/lifecycle.native.json',f'{ATTEMPT}/matrix/lifecycle.direct.json',
          f'{ATTEMPT}/matrix/lifecycle.browser.capture.json',f'{ATTEMPT}/matrix/lifecycle.check.json',f'{ATTEMPT}/matrix/lifecycle.run.json',
          f'{ATTEMPT}/matrix/lifecycle.manifest.json',f'{ATTEMPT}/react/output/apps/lifecycle-7e6575d90707/app-ir.json',
          f'{ATTEMPT}/dom/output/apps/lifecycle-7e6575d90707/app-ir.json']:
            b=z.read(rel);zip_member_hashes[rel]={'bytes':len(b),'sha256':digest(b)}
    result={
      'schema':'gobi.compiled-lifecycle-fixed-dom-independent-review/v1','job_id':'XR-FIXED-DOM','worker':'N3',
      'decision':'accepted','outcome':'confirmed_reuse',
      'summary':'Independently verified the pinned successful provider ZIP directly: the full native/direct/browser checker matched the immutable Go oracle, all 81 physical snapshots and 792 live button properties matched literal DOM/control expectations, and the removal/remount, callback-fence, detached-click, swap, and mutation-control counts agree.',
      'provider':{'artifact_id':13035044166,'run_id':41181505234,'conclusion':'success','source_commit':COMMIT,'source_tree':TREE,
        'zip_path':str(ZIP_PATH),'zip_bytes':len(zip_bytes),'zip_sha256':zip_sha,'members':1270,'uncompressed_bytes':413394195,
        'crc':'all passed (ZipFile.testzip returned None)','path_safety':'all member paths relative, unique, no parent traversal or symlink'},
      'provenance':{'provider_output_source':'original ZIP members read directly in-memory; no fixed/extracted files read',
        'source_oracle_source':'immutable Git commit 00da, oracle hash verified against run source pin',
        'source_input_pins_verified_against_git':src_count,'generated_attempt_pins_verified_against_zip':generated_count,
        'lifecycle_pin_count':len(pin_rows),'build_output_pins_verified_against_zip':len(run['buildOutputPinsBeforeCheck']),
        'evidence_pins_verified_against_zip':len(run['evidencePins']),'scenario_sha256':scenario_sha,
        'oracle_sha256':digest(git_blob(ORACLE)),'oracle_materialized_bytes':len(oracle_bytes),'oracle_materialized_sha256':digest(oracle_bytes),
        'oracle_materialization_stderr_bytes':len(oracle_stderr)},
      'complete_checker':{'run_status':run['status'],'check_status':check['status'],'manifest_status':manifest['status'],
        'all_stages_completed':True,'events':check['events'],'ticks':check['ticks'],'clicks':check['clicks'],'swaps':check['swaps'],
        'requests':check['requests'],'cancellations':check['cancellations'],'cancellation_order':check['cancellationOrder'],
        'literal_oracle_flags':{'native':check['nativeTraceCheckedAgainstLiteralOracle'],'direct':check['directTraceCheckedAgainstLiteralOracle'],
          'browser':check['browserTracesCheckedAgainstLiteralOracle'],'physical_dom':check['physicalDOMCheckedAgainstLiteralOracle'],
          'all_eight_mutation_controls_detected':all(x['detected'] for x in check['mutationControls'])}},
      'trace_comparison':{'native_steps':len(native['steps']),'direct_ticks':len(direct['trace']['ticks']),
        'browser_profiles':{name:{'ticks':len(browser['profiles'][name]['trace']['ticks']),'state_view_dom_effects_match':True,
          'physical_snapshots':len(browser['profiles'][name]['snapshots'])} for name in ('react','dom','swap')},
        'state_view_effects_compared_to_literal_oracle':True,'browser_core_trace_equal_to_direct':True},
      'physical_dom':{'snapshots_per_profile':27,'total_snapshots':total_snaps,'live_button_properties_checked':total_props,
        'disabled_true_properties':total_disabled,'active_clicks':active_clicks,'detached_controls_clicked':detached_clicks,
        'detached_click_metadata_bound_and_noop':True,'literal_outerhtml_and_live_controls_match':True,
        'remove_remount_sibling_retention_verified':True},
      'callback_lifecycle':{'alternating_renderer_swaps':len(swaps),'eligible_swaps':len(eligible),'ineligible_swaps':len(ineligible),
        'retired_callback_fences':fences,'pending_tokens_preserved_across_fixed_swap':pending,
        'request_tokens':request_tokens,'child_first_cancel_order':cancel_order},
      'mutation_controls':{'count':len(muts),'all_detected':True,'names':[x['name'] for x in muts]},
      'app_identity':{'component_id':component['id'],'react_dom_appir_equal':react_app==dom_app,
        'react_module_sha256':digest(react_module),'dom_module_sha256':digest(dom_module),
        'react_dom_encoder_sha256':digest(react_encoder),'raw_module_equality_claimed':False},
      'author_packet':{'report_sha256':digest(author_report_bytes),'receipt_sha256':digest(author_receipt_bytes),
        'audit_sha256':digest(author_audit_bytes),'audit_script_sha256':digest(author_script_bytes),
        'author_report_and_receipt_linkage_valid':True,'source_data_method':'author script reads fixed/extracted attempt files; this reviewer instead read provider outputs directly from ZIP'},
      'raw_zip_members':zip_member_hashes,
      'commands':{'review':'python3 compiled-lifecycle/ci/2026-10-31/fixed/reviews/dom/audit_dom_archive_review.py','python_version':sys.version.split()[0],
        'oracle':{'executable':NODE,'version':subprocess.check_output([NODE,'--version'],cwd=ROOT,text=True).strip(),
          'argv':oracle_command[1:3]+['<pure lifecycle oracle export>'] }},
      'limits':['Bounded to the finite frozen lifecycle fixture and captured provider run.','No test suite, conformance runner, build, or browser was rerun.','No source, Git metadata, shared state, or extraction file was changed.']
    }
    out=REVIEW/'audit_review.json'
    out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
    print(json.dumps({'status':result['decision'],'artifact_sha256':zip_sha,'zip_crc':'passed','source_pins':src_count,
      'generated_pins':generated_count,'snapshots':total_snaps,'live_button_properties':total_props,
      'detached_clicks':detached_clicks,'swaps':len(swaps),'fences':fences,'mutations':len(muts),
      'report':str(out.relative_to(ROOT))},indent=2))

if __name__=='__main__': main()
