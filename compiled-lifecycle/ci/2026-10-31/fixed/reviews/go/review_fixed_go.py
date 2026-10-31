#!/usr/bin/env python3
"""Independent Go/GoScript evidence review from the original provider ZIP."""
from __future__ import annotations
import hashlib, json, re, struct, zipfile
from pathlib import Path

ROOT=Path.cwd()
LANE=ROOT/'compiled-lifecycle/ci/2026-10-31/fixed/reviews/go'
ZIP_PATH=Path('/tmp/gobi-compiled-lifecycle-41181505234.zip')
ATTEMPT='compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z'
PKG='github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle'
EFFECT='[]github.com/samuelpmahan/gondola/gobi.Effect'
ZIP_SHA='0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26'


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def decode_typed(value):
    if isinstance(value, list): return [decode_typed(x) for x in value]
    if not isinstance(value, dict): return value
    kind=value.get('kind')
    if kind=='struct': return {field['name']:decode_typed(field['value']) for field in value.get('fields',[])}
    if kind in ('slice','array'): return [decode_typed(x) for x in value.get('items',[])]
    if kind=='string': return value.get('string','')
    if kind=='bool': return value.get('bool')
    if kind in ('uint','int'): return int(value.get('integer','0'))
    if kind=='float64': return struct.unpack('>d',bytes.fromhex(value['float64Bits']))[0]
    if kind=='float32': return struct.unpack('>f',bytes.fromhex(value['float32Bits']))[0]
    if kind=='null': return None
    raise AssertionError(f'unrecognized compiled Value kind: {kind!r}')


def json_member(zf, path):
    return json.loads(zf.read(path).decode('utf-8'))


def pin_record(data, path):
    return {'path':path,'bytes':len(data),'sha256':sha(data)}


def main():
    zip_bytes=ZIP_PATH.read_bytes()
    require(len(zip_bytes)==47_072_021 and sha(zip_bytes)==ZIP_SHA,'original provider ZIP size/SHA')
    with zipfile.ZipFile(ZIP_PATH,'r') as zf:
        infos=zf.infolist()
        require(len(infos)==1270 and len({x.filename for x in infos})==1270,'provider member count/uniqueness')
        require(zf.testzip() is None,'provider CRC scan')
        prefix=ATTEMPT+'/'
        execution_path=prefix+'execution.json'
        execution_bytes=zf.read(execution_path)
        execution=json.loads(execution_bytes.decode())
        require(execution['job_id']=='E-BUILD' and execution['worker']=='N6' and
                execution['mode']=='full' and execution['status']=='passed' and execution['failures']==[],
                'frozen successful E-BUILD attempt')
        require(len(execution['commands'])==18 and all(x['exitCode']==0 for x in execution['commands']) and
                len(execution['stages'])==13 and all(x['status']=='passed' for x in execution['stages']),
                'full run command/stage completion')
        require(execution['sourcePinsMatch'] is True and execution['sourceBefore']==execution['sourceAfter'] and
                len(execution['sourceBefore'])==123,'123 stable source pins')
        source_paths={row['path'] for row in execution['sourceBefore']}
        required_pins={'fixtures/compiled/lifecycle/app.go','fixtures/compiled/lifecycle/app_test.go',
            'compilercontract/contract_test.go','compilercontract/js_encoder.go',
            'compiled-frontend/frontend/runtime/runtime.mjs','compiled-frontend/frontend/runtime/runtime.test.mjs',
            'compiled-lifecycle/runtime/runtime.mjs','compiled-lifecycle/runtime/runtime.test.mjs'}
        require(required_pins.issubset(source_paths),'essential ABI/runtime/fixture source files are included in the 123 pins')
        source_mismatches=[]
        for row in execution['sourceBefore']:
            path=ROOT/row['path']
            if not path.is_file():
                source_mismatches.append({'path':row['path'],'reason':'missing'})
                continue
            data=path.read_bytes()
            if len(data)!=row['bytes'] or sha(data)!=row['sha256']:
                source_mismatches.append({'path':row['path'],'reason':'hash_mismatch'})
        require(not source_mismatches,'current source bytes match all recorded pins')

        # Validate both GoScript BuildResults and every one of their output files in the ZIP.
        output_audit={}
        app_irs={}; encoders={}; modules={}; manifests={}
        for backend in ('react','dom'):
            base=prefix+backend+'/'
            result=json_member(zf,base+'result.json')
            record=json_member(zf,base+'build-record.json')
            require(result['ok'] is True and result['diagnostics']==[] and len(result['outputs'])==67,
                    f'{backend} GoScript BuildResult')
            require(record['backend']==backend and record['outputCount']==67 and len(record['outputPins'])==67,
                    f'{backend} build record count')
            by_result={x['path']:x for x in result['outputs']}
            by_record={x['path']:x for x in record['outputPins']}
            require(by_result.keys()==by_record.keys(),'BuildResult/build record output path sets')
            exec_before=execution['outputPinsBefore'][backend]
            exec_after=execution['outputPinsAfter'][backend]
            require(len(exec_before)==len(exec_after)==67 and exec_before==exec_after,
                    f'{backend} output pins stable through conformance')
            exec_map={x['path']:x for x in exec_before}
            for rel,item in by_result.items():
                full=base+'output/'+rel
                data=zf.read(full)
                want={'bytes':item['bytes'],'sha256':item['sha256']}
                require(len(data)==want['bytes'] and sha(data)==want['sha256'],f'{backend} output file {rel}')
                require({'bytes':by_record[rel]['bytes'],'sha256':by_record[rel]['sha256']}==want,
                        f'{backend} result/build record binding {rel}')
                pin=exec_map[full]
                require({'bytes':pin['bytes'],'sha256':pin['sha256']}==want,
                        f'{backend} execution/output pin binding {rel}')
            manifest_bytes=zf.read(base+'output/buildmanifest.json')
            manifest=json.loads(manifest_bytes.decode())
            require(record['manifest']['sha256']==sha(manifest_bytes) and
                    manifest['schema']=='gobi.build-manifest/v1' and len(manifest['apps'])==1,
                    f'{backend} manifest record')
            manifest_app=manifest['apps'][0]
            require(manifest_app['backend']==backend and manifest_app['componentId']==PKG and
                    manifest_app['packagePath']==PKG and
                    manifest_app['appIR']=='apps/lifecycle-7e6575d90707/app-ir.json' and
                    manifest_app['module']=='apps/lifecycle-7e6575d90707/gobi-compiled.mjs' and
                    manifest_app['encoder']=='apps/lifecycle-7e6575d90707/encoder.mjs',
                    f'{backend} app output linkages')
            appir_bytes=zf.read(base+'output/apps/lifecycle-7e6575d90707/app-ir.json')
            module_bytes=zf.read(base+'output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs')
            encoder_bytes=zf.read(base+'output/apps/lifecycle-7e6575d90707/encoder.mjs')
            require(record['appIR']['sha256']==sha(appir_bytes) and record['appIR']['bytes']==len(appir_bytes),
                    f'{backend} AppIR pin')
            require(record['rawModule']['sha256']==sha(module_bytes) and record['rawModule']['bytes']==len(module_bytes),
                    f'{backend} compiled module pin')
            require(record['encoder']['sha256']==sha(encoder_bytes) and record['encoder']['bytes']==len(encoder_bytes),
                    f'{backend} generated encoder pin')
            appir=json.loads(appir_bytes.decode())
            require(appir['schema']=='gobi.app-ir/v1' and appir['packagePath']==PKG and
                    len(appir['components'])==1 and appir['components'][0]['id']==PKG,
                    f'{backend} AppIR package identity')
            component=appir['components'][0]
            require('effect.request-reply' in component['capabilities'],'request/reply capability')
            symbols={x['id']:x for x in appir['symbols']}
            update=symbols[component['update']]
            sig=update['signature']
            require(sig['params']==[component['stateType'],component['messageType']] and
                    sig['results']==[component['stateType'],EFFECT],
                    f'{backend} Update signature declares actual effect result TypeID')
            types={x['id']:x for x in appir['types']}
            state=types[component['stateType']]
            state_fields={x['name']:x['type'] for x in state['fields']}
            node_type=types[state_fields['Parent']]
            node_fields={x['name']:x['type'] for x in node_type['fields']}
            require(state_fields=={'Parent':PKG+'.NodeState','Child':PKG+'.NodeState',
                    'Grandchild':PKG+'.NodeState','Sibling':PKG+'.NodeState','NextRequestID':'uint64'},
                    f'{backend} State ABI')
            require(node_fields['Generation']=='uint64' and node_fields['RequestID']=='uint64',
                    f'{backend} generation/request uint64 ABI')
            uint_type=types['uint64']
            require(uint_type['kind']=='uint' and uint_type['bits']==64 and uint_type['jsRepresentation']=='bigint',
                    f'{backend} uint64 BigInt representation')
            effect_slice=types[EFFECT]
            require(effect_slice['kind']=='slice' and effect_slice['elemType']=='github.com/samuelpmahan/gondola/gobi.Effect' and
                    effect_slice['jsRepresentation']=='array-or-goscript-slice', f'{backend} typed Effect slice ABI')
            effect_type=types[effect_slice['elemType']]
            require(effect_type['kind']=='struct' and effect_type['fields']==[
                    {'name':'Kind','type':'string'},{'name':'Name','type':'string'},
                    {'name':'Arg','type':'string'},{'name':'Reply','type':'string'}], f'{backend} Effect struct ABI')
            encoder_text=encoder_bytes.decode()
            types_line=next(line for line in encoder_text.splitlines() if line.startswith('const TYPES = '))
            encoder_types=json.loads(types_line[len('const TYPES = '):-1])
            require({x['id']:x for x in encoder_types}[EFFECT]==effect_slice and
                    {x['id']:x for x in encoder_types}['uint64']==uint_type,
                    f'{backend} generated encoder TypeID metadata')
            module_text=module_bytes.decode()
            remove_start=module_text.index('function removeParent(state)')
            remount_start=module_text.index('function remountParent(state)',remove_start)
            remove_text=module_text[remove_start:remount_start]
            order=[remove_text.find(f'appendOne(effects, cancelEffect(state.{name}.Token))')
                   for name in ('Grandchild','Child','Parent')]
            require(all(x>=0 for x in order) and order==sorted(order),f'{backend} generated append child-first cancel')
            app_irs[backend]=appir_bytes; encoders[backend]=encoder_bytes; modules[backend]=module_bytes
            manifests[backend]=manifest_bytes
            output_audit[backend]={'outputs':67,'result_sha256':sha(zf.read(base+'result.json'),),
                'manifest_sha256':sha(manifest_bytes),'app_ir_sha256':sha(appir_bytes),
                'encoder_sha256':sha(encoder_bytes),'module_bytes':len(module_bytes),'module_sha256':sha(module_bytes)}
        require(app_irs['react']==app_irs['dom'] and encoders['react']==encoders['dom'],
                'AppIR and generated encoder byte-identical across backends')
        require(modules['react']!=modules['dom'],'React and DOM compiled modules remain separately pinned')

        # The shared runtime derives effect TypeID from Update's signature, then invokes the generated encoder.
        runtime_source=ROOT/'compiled-frontend/frontend/runtime/runtime.mjs'
        contract_source=ROOT/'compilercontract/js_encoder.go'
        lifecycle_runtime=ROOT/'compiled-lifecycle/runtime/runtime.mjs'
        core=runtime_source.read_text()
        encoder_src=contract_source.read_text()
        wrapper=lifecycle_runtime.read_text()
        required_core=('effectResultTypeId','effectSliceMetadata','encoder.gobiEncodeState(effects, metadata.typeId)',
                       'readEncodedEffectSlice','validateEffectByPolicy')
        require(all(term in core for term in required_core),'runtime source TypeID-to-encoder-to-effect validation path')
        require('function bigintToInteger(value, type)' in encoder_src and 'typeof value !== "bigint"' in encoder_src and
                'return value.toString(10)' in encoder_src,'generated encoder BigInt full-width decimal path')
        require('const SUPPORTED_EFFECT_KINDS = new Set(["fixture.request"])' in core,
                'shared runtime default effect policy remains closed')
        require('validateLifecycleEffect' in wrapper and 'lifecycle.cancel' in wrapper,
                'lifecycle-specific closed effect policy')

        # Native and direct traces are paired event by event, not just summary-compared.
        matrix=prefix+'matrix/'
        native=json_member(zf,matrix+'lifecycle.native.json')
        direct=json_member(zf,matrix+'lifecycle.direct.json')
        check=json_member(zf,matrix+'lifecycle.check.json')
        run=json_member(zf,matrix+'lifecycle.run.json')
        require(native['componentID']==direct['componentID']==PKG and len(native['steps'])==len(direct['steps'])==26,
                'native/direct identity and 26-event length')
        previous=native['initialState']; direct_uints=[]
        def collect_uint(value):
            if isinstance(value,dict):
                if value.get('typeId')=='uint64': direct_uints.append(value)
                for v in value.values(): collect_uint(v)
            elif isinstance(value,list):
                for v in value: collect_uint(v)
        collect_uint(direct['trace'])
        for i,(ns,ds) in enumerate(zip(native['steps'],direct['steps'])):
            require(ns.get('message')==ds.get('message'),f'native/direct message linkage at event {i}')
            require(decode_typed(ds['state'])==ns['state'],f'native/direct full State linkage at event {i}')
            direct_view=ds['view'].get('tree',ds['view']) if isinstance(ds['view'],dict) else ds['view']
            require(direct_view==ns['view'],f'native/direct Go View tree linkage at event {i}')
            tick=ds['traceTick']
            if tick is not None:
                state=decode_typed(tick['state'])
                effects=[row['effect'] for row in tick['requestedEffects']]
                previous=state
            else:
                effects=[]
            normalized_direct=[row['effect'] for row in ds['requestedEffects']]
            require(ns['state']==previous==decode_typed(ds['state']) and
                    ns['effects']==effects==normalized_direct,
                    f'native/direct typed state/effect correspondence at event {i}')
        require(direct_uints and all(x.get('kind')=='uint' and isinstance(x.get('integer'),str) for x in direct_uints),
                'direct uint64 values are encoded as exact decimal strings')
        safe=9007199254740991
        for step in native['steps']:
            require(step['state']['NextRequestID']<=safe,'native NextRequestID stays within fixture safe bound')
            for node in ('Parent','Child','Grandchild','Sibling'):
                for field in ('Generation','RequestID'):
                    v=step['state'][node][field]
                    require(isinstance(v,int) and 0<=v<=safe,f'native {node}.{field} stays within safe bound')
        remove_native=next(x for x in native['steps'] if x.get('message') and x['message'].get('name')=='removeParent')
        remove_direct=next(x for x in direct['steps'] if x.get('message') and x['message'].get('name')=='removeParent')
        expected_tokens=['grandchild:g1:r3','child:g1:r2','parent:g1:r1']
        require([x['arg'] for x in remove_native['effects']]==expected_tokens,'native Go cancellation order')
        require(remove_native['state']['Parent']['Alive'] is False and remove_native['state']['Child']['Alive'] is False and
                remove_native['state']['Grandchild']['Alive'] is False and remove_native['state']['Sibling']['Alive'] and
                remove_native['state']['Sibling']['Pending'],'native subtree removal preserves pending sibling')
        typed=remove_direct['typedEffects']
        require(typed['typeId']==EFFECT and typed['kind']=='slice' and typed['isNil'] is False and len(typed['items'])==3,
                'direct returned effect slice has signature TypeID')
        typed_effects=[]
        for item in typed['items']:
            fields={x['name']:x['value'] for x in item['fields']}
            require(item['typeId']=='github.com/samuelpmahan/gondola/gobi.Effect' and item['kind']=='struct' and
                    set(fields)=={'Kind','Name','Arg','Reply'},'direct Effect typed struct and closed field set')
            typed_effects.append({'kind':fields['Kind']['string'],'name':fields['Name']['string'],
                                  'arg':fields['Arg']['string'],'reply':fields['Reply']['string']})
        require([x['arg'] for x in typed_effects]==expected_tokens and
                all(x['kind']=='lifecycle.cancel' and x['name']=='cancel' and x['reply']=='' for x in typed_effects),
                'direct typed Effect payload/order')
        require([x['effect'] for x in remove_direct['requestedEffects']]==typed_effects,
                'typed GoSlice values normalized to host effects')

        # Full checker result and executable/Node package suite evidence are the uploaded outputs.
        require(run['status']=='matched' and run['nativeGoStderr']=='' and run['sourcesStable'] and
                run['sourceStableThroughCheck'] and run['buildOutputsStableThroughCheck'],'full conformance runner status/stability')
        require(check['status']=='matched' and check['events']==check['ticks']==26 and check['swaps']==17 and
                check['requests']==7 and check['cancellations']==3 and
                check['cancellationOrder']==expected_tokens and check['mutationControlsDetected']==8 and
                all(x['detected'] for x in check['mutationControls']) and
                all(check[k] for k in ('nativeTraceCheckedAgainstLiteralOracle','directTraceCheckedAgainstLiteralOracle',
                                       'browserTracesCheckedAgainstLiteralOracle','physicalDOMCheckedAgainstLiteralOracle')),
                'full lifecycle checker')
        require(run['nativeCommand'][:3]==['go','run','./cmd/compiled-lifecycle-native'], 'hosted native CLI command')
        logs={}
        command_map={x['name']:x for x in execution['commands']}
        for name in ('lifecycle-go-tests','lifecycle-compiler-go-tests','lifecycle-node-tests-before-build',
                     'compile-react','compile-dom','lifecycle-compiled-runtime-tests','lifecycle-conformance'):
            require(command_map[name]['exitCode']==0,f'{name} recorded exit code')
        go_cmd=command_map['lifecycle-go-tests']
        compiler_cmd=command_map['lifecycle-compiler-go-tests']
        require(go_cmd['args']==['test','./compilercontract','./gobi','./fixtures/compiled/lifecycle','./cmd/compiled-lifecycle-native'],
                'hosted lifecycle Go package command')
        require(compiler_cmd['args']==['test','./analyze','./build','./cmd/...','./emit'],
                'hosted compiler Go package command')
        for log_name in ('lifecycle-go-tests','lifecycle-compiler-go-tests'):
            stdout=zf.read(prefix+'logs/'+log_name+'.stdout.log').decode()
            stderr=zf.read(prefix+'logs/'+log_name+'.stderr.log')
            require(len(stderr)==0 and 'FAIL' not in stdout and re.search(r'^ok\s+github\.com/samuelpmahan/gondola/',stdout,re.M),
                    f'{log_name} hosted Go package logs')
            logs[log_name]={'stdout_sha256':sha(stdout.encode()),'stderr_bytes':len(stderr),'package_results':sum(1 for x in stdout.splitlines() if x.startswith('ok\t'))}
        node_stdout=zf.read(prefix+'logs/lifecycle-node-tests-before-build.stdout.log').decode()
        runtime_stdout=zf.read(prefix+'logs/lifecycle-compiled-runtime-tests.stdout.log').decode()
        require('# tests 71' in node_stdout and '# pass 71' in node_stdout and '# fail 0' in node_stdout,
                'prebuild Node suite 71/71')
        require('# tests 10' in runtime_stdout and '# pass 10' in runtime_stdout and '# fail 0' in runtime_stdout,
                'post-build lifecycle runtime suite 10/10')
        runtime_cmd=command_map['lifecycle-compiled-runtime-tests']
        app_dir=execution['attempt']+'/react/output/apps/lifecycle-7e6575d90707'
        require(runtime_cmd['environmentOverrides'].get('GOBI_LIFECYCLE_APP_DIR','').endswith(app_dir),
                'runtime test uses fresh React built app directory')
        command_names=[x['name'] for x in execution['commands']]
        require(command_names.index('compile-react')<command_names.index('compile-dom')<command_names.index('lifecycle-compiled-runtime-tests'),
                'runtime tests deferred until after both GoScript builds')
        logs['node_tests']={'passed':71,'failed':0,'bytes':len(node_stdout.encode())}
        logs['compiled_runtime_tests']={'passed':10,'failed':0,'bytes':len(runtime_stdout.encode()),'fresh_app_dir':app_dir}

        source_test= (ROOT/'compilercontract/contract_test.go').read_text()
        require('func TestEncodeValueMatchesNumberAndBigIntIntegerABI' in source_test and
                'uint64 full max' in source_test and '18446744073709551615' in source_test and
                'uint above safe' in source_test and 'Number-backed tagged integer outside the safe range' in source_test,
                'pinned Go tests cover full-width uint64 BigInt and unsafe Number rejection')
        fixture_source=(ROOT/'fixtures/compiled/lifecycle/app.go').read_text()
        require('const maxSafeID uint64 = 9007199254740991' in fixture_source,
                'finite fixture guards request/generation uint64 values at JavaScript safe integer maximum')

        # Keep only compact hashes. The large browser trace remains in the provider ZIP.
        important={}
        for path in (execution_path, prefix+'react/build-record.json',prefix+'react/result.json',
                     prefix+'dom/build-record.json',prefix+'dom/result.json',
                     prefix+'react/output/apps/lifecycle-7e6575d90707/app-ir.json',
                     prefix+'react/output/apps/lifecycle-7e6575d90707/encoder.mjs',
                     prefix+'react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs',
                     prefix+'dom/output/apps/lifecycle-7e6575d90707/app-ir.json',
                     prefix+'dom/output/apps/lifecycle-7e6575d90707/encoder.mjs',
                     prefix+'dom/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs',
                     prefix+'logs/lifecycle-go-tests.stdout.log',prefix+'logs/lifecycle-compiler-go-tests.stdout.log',
                     prefix+'logs/lifecycle-node-tests-before-build.stdout.log',prefix+'logs/lifecycle-compiled-runtime-tests.stdout.log',
                     prefix+'matrix/lifecycle.native.json',prefix+'matrix/lifecycle.direct.json',
                     prefix+'matrix/lifecycle.check.json',prefix+'matrix/lifecycle.run.json',
                     prefix+'matrix/lifecycle.browser.json'):
            data=zf.read(path)
            important[path]={'bytes':len(data),'sha256':sha(data)}
        browser_bytes=important[prefix+'matrix/lifecycle.browser.json']['bytes']
        require(browser_bytes>60_000_000,'full browser profile evidence remains in primary artifact')

    # Verify the authored report/receipt identifiers and hashes without modifying either.
    author_report=ROOT/'compiled-lifecycle/ci/2026-10-31/coordination/reports/E-FIXED-GO.md'
    author_receipt=ROOT/'compiled-lifecycle/ci/2026-10-31/coordination/receipts/E-FIXED-GO.json'
    author_report_hash=sha(author_report.read_bytes()); author_receipt_hash=sha(author_receipt.read_bytes())
    require(author_report_hash=='b24faffdbe95ea59076947fd47226ca2779180dcd31678e006a1c5ca6230e7da',
            'N1 author report pin')
    require(author_receipt_hash=='237c9c31140de0a23d56c3611e75286d0a13936e78eedb55298b85d387b9ea68',
            'N1 author receipt pin')
    author=json.loads(author_receipt.read_text())
    require(author['job_id']=='E-FIXED-GO' and author['worker']=='N1' and author['decision']=='confirmed_reuse',
            'N1 author packet identity')

    result={
      'schema':'gobi.compiled-lifecycle-fixed-go-review/v1','job_id':'XR-FIXED-GO','worker':'N5',
      'decision':'accepted','outcome':'confirmed_reuse',
      'scope':'independent review of the current successful primary artifact, typed Go/native/direct evidence, generated React/DOM outputs, and hosted suite records; no local build or replay',
      'provider':{'run_id':41181505234,'artifact_id':13035044166,'conclusion':'success',
                  'head_sha':'00da54ad0f5a4006b13a5cded18ce291845978bc',
                  'tree':'51b64a89b5f7e0edd4792becbed9adad6a27a698',
                  'zip_bytes':len(zip_bytes),'zip_sha256':sha(zip_bytes),'member_count':1270,'crc_scan':'passed'},
      'author_packet':{'report_sha256':author_report_hash,'receipt_sha256':author_receipt_hash,
                       'author_audit_sha256':author['evidence'][0]['sha256']},
      'source':{'recorded_pin_count':123,'recorded_pins_stable':True,'current_bytes_match_all_pins':True,
                'current_mismatches':source_mismatches},
      'attempt':{'status':'passed','mode':'full','commands':18,'stages':13,'failures':0},
      'builds':{'profiles':output_audit,'output_pins_stable':True,
                'app_ir_byte_identical':True,'encoder_byte_identical':True,'raw_modules_distinct':True},
      'abi':{'component_id':PKG,'update_result_type_id':EFFECT,
             'effect_slice_representation':'array-or-goscript-slice',
             'effect_struct_fields':['Kind','Name','Arg','Reply'],
             'encoder_selects_update_result_type_id':True,
             'direct_remove_parent_slice_type_id':EFFECT,
             'direct_effect_payloads':typed_effects,
             'native_direct_26_events_state_view_message_and_effects_match':True,
             'uint64_bits':64,'uint64_js_representation':'bigint',
             'direct_trace_uint64_decimal_strings':len(direct_uints),
             'fixture_safe_id_limit':safe,'go_contract_test_full_uint64_max':'18446744073709551615',
             'number_integer_unsafe_range_rejected_by_pinned_test':True,
             'core_effect_policy_closed_by_default':True,'lifecycle_policy_explicit':True},
      'matrix':{'status':check['status'],'events':check['events'],'ticks':check['ticks'],'swaps':check['swaps'],
                'requests':check['requests'],'cancellations':check['cancellations'],
                'cancellation_order':check['cancellationOrder'],'mutation_controls_detected':check['mutationControlsDetected'],
                'literal_oracle_flags':{'native':check['nativeTraceCheckedAgainstLiteralOracle'],
                 'direct':check['directTraceCheckedAgainstLiteralOracle'],'browser':check['browserTracesCheckedAgainstLiteralOracle'],
                 'physical_dom':check['physicalDOMCheckedAgainstLiteralOracle']},
                'browser_trace_bytes':browser_bytes,'full_browser_evidence_retained':True},
      'hosted_tests':{'go_lifecycle_command':go_cmd['args'],'go_compiler_command':compiler_cmd['args'],
                      'go_package_logs':logs,'prebuild_node':{'passed':71,'failed':0},
                      'compiled_runtime':{'passed':10,'failed':0,'fresh_app_dir':app_dir},
                      'replayed_locally':False},
      'toolchain':execution['versions'],
      'scope_limits':['Bounded finite compiled lifecycle fixture only; arbitrary Manager or pointer-owned lifecycles not established.',
                      'AppIR effect.request-reply is a coarse capability marker; lifecycle wrapper provides the closed policy.',
                      'No prior 49cc artifact is used; full browser trace remains in the provider ZIP.'],
      'important_raw_zip_member_hashes':important,
      'review_method':{'inputs_read_from_original_provider_zip':True,'source_files_rehashed':123,
                       'unmanifested_extraction_temp_used':False,'build_or_test_rerun':False,
                       'browser_rerun':False,'git_or_product_changes':False},
    }
    out=LANE/'audit.json'
    out.write_text(json.dumps(result,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps({'decision':'accepted','zip_sha256':sha(zip_bytes),'source_pins':123,
                      'react_outputs':67,'dom_outputs':67,'native_direct_events':26,
                      'node_tests':71,'runtime_tests':10,'checker':check['status'],
                      'effect_slice':EFFECT,'direct_uint64_values':len(direct_uints)},sort_keys=True))

if __name__=='__main__': main()
