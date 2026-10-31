import hashlib, json, tarfile
from pathlib import Path
base=Path('/tmp/modules-publish/audit/packages/final-audit-root-release')
archive=base/'module-qualification-evidence.tar.gz'
clarification_path=Path('/workspace/scratch/39a56936f173/module-coordination/candidate-ledger-clarification.json')
readback_path=Path('/tmp/modules-publish/github-readback.json')
readme_path=Path('/tmp/modules-publish/readable/README.md')
sha=lambda b:hashlib.sha256(b).hexdigest()
clarification=json.loads(clarification_path.read_text())
readback=json.loads(readback_path.read_text())
readme=readme_path.read_text()
with tarfile.open(archive,'r:gz') as tf:
    def load(name):
        data=tf.extractfile(tf.getmember(name)).read()
        return data,json.loads(data)
    candidate_bytes,candidate=load('module-coordination/candidate-source.json')
    lead_bytes,lead=load('module-coordination/lead-acceptance.json')
    runtime_bytes,runtime=load('module-coordination/final-runtime/receipt.json')
    fail_bytes,first_failure=load('failed-producer-attempts/compiled-modules/evidence/attempts/attempt-20261031T210720460Z-6/failure-receipt.json')
candidate_map={x['path']:x for x in candidate['files']}
final_pins=runtime['sourcePins']
mismatches=[]
for path,old in candidate_map.items():
    new=final_pins[path]
    if old['bytes']!=new['bytes'] or old['sha256']!=new['sha256']:
        mismatches.append({'path':path,'historical':old,'final':{'bytes':new['bytes'],'sha256':new['sha256']}})
checks={
 'historicalLedgerPin': clarification['historicalLedger']['sha256']==sha(candidate_bytes) and clarification['historicalLedger']['bytes']==len(candidate_bytes),
 'historicalLedgerBaseTreeAndCount': clarification['historicalLedger']['base']==candidate['base'] and clarification['historicalLedger']['tree']==candidate['tree'] and clarification['historicalLedger']['files']==len(candidate_map)==45,
 'initialCommitMatchesPreservedFailure': clarification['historicalLedger']['initialSourceCommit']==first_failure['sourceCommit']=='85a13949a4daf2de8e16fb285e68ce5ac966387f',
 'finalProducerMatchesLeadAcceptance': runtime['sourceCommit']==lead['sourceCommit']==clarification['authoritativeFinal']['sourceCommit']=='7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0' and lead['sourceTree']==clarification['authoritativeFinal']['sourceTree']=='bcc71cef48f3a4e141daf181b43f8e12a2132f83',
 'finalReceiptPin': clarification['authoritativeFinal']['receiptSHA256']==sha(runtime_bytes) and len(final_pins)==clarification['authoritativeFinal']['sourcePins']==147,
 'fourHistoricalDifferencesExact': len(mismatches)==len(clarification['changedHistoricalEntries'])==4 and mismatches==clarification['changedHistoricalEntries'],
 'readbackMatchesFinalRelease': readback['status']=='passed' and readback['sourceCommit']==readback['sourceHead']==clarification['authoritativeFinal']['sourceCommit'] and readback['sourcePinsMatched']==147 and readback['filesMatched']==169 and readback['workingTreeStatus']=='',
 'readbackMatchesAuditPackage': readback['archives']['audit']=={'parts':27,'archiveBytes':27304234,'archiveSHA256':'9fa92163b8bf249ef547fe80369749982b7ec522d00f3ed6e6f4fbff7271aadf','members':3583},
 'readmeClarifiesHistoricalLedger': 'archived `candidate-source.json` is the historical45-file initial-publication ledger, not final source closure' in readme and 'candidate-ledger-clarification.json' in readme,
 'readbackEvidenceCommitMatchesClarification': readback['evidenceCommit']==clarification['authoritativeFinal']['GitReadbackProof'].split('evidenceCommit ')[1].split(',')[0],
}
result={
 'schema':'gobi.xr-package-clarification-review/v1',
 'status':'passed' if all(checks.values()) else 'failed',
 'checks':checks,
 'historical':{'sha256':sha(candidate_bytes),'bytes':len(candidate_bytes),'base':candidate['base'],'tree':candidate['tree'],'files':len(candidate_map),'initialCommit':first_failure['sourceCommit'],'firstAttemptStage':first_failure['stage']},
 'final':{'sourceCommit':runtime['sourceCommit'],'sourceTree':lead['sourceTree'],'producerReceiptSHA256':sha(runtime_bytes),'sourcePins':len(final_pins),'changedHistoricalEntries':mismatches},
 'clarification':{'path':str(clarification_path),'bytes':clarification_path.stat().st_size,'sha256':sha(clarification_path.read_bytes())},
 'readback':{'path':str(readback_path),'bytes':readback_path.stat().st_size,'sha256':sha(readback_path.read_bytes()),'status':readback['status'],'evidenceCommit':readback['evidenceCommit'],'filesMatched':readback['filesMatched'],'sourcePinsMatched':readback['sourcePinsMatched']},
 'readme':{'path':str(readme_path),'bytes':readme_path.stat().st_size,'sha256':sha(readme_path.read_bytes())},
 'rootTreeCheck':'Root separately reports git show of historical commit 85a13949a4daf2de8e16fb285e68ce5ac966387f yields tree 25b02649aaf2b61b758f9ba0068be8a2c97c0826; XR-PACKAGE did not run Git.'
}
print(json.dumps(result,indent=2))
if not all(checks.values()): raise SystemExit(1)
