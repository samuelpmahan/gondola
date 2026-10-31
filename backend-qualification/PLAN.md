# Mounted backend qualification implementation plan

Goal: qualify known-good backends and detect actual faulty renderer/event adapters under an authoritative Go certificate. Read CONTRACT.md forfrozeninterfaces.

1. N1 implements typedGocertificate/CLI with meaningful rejection tests (missing/duplicate/unactivated/fakeerror/hash mismatch). N5 independently publishes13case plan andchecks. Gate: registry/wire agreeN1,N4,N5.
2. N2 builds actualcurrentGoScriptReact/DOM/native with source/ABI/capability provenance, gatesmodulepaths. N3 implements default-offadapters andread-onlybrowserseam; testsdefaultunchanged andactualfaultactivation.
3. N4 integratesexistingfullbaseline andsemanticrawnegativechecks withN2/N3/N5. Gate: no negativepasses onerroralone oractivationmetadataalone. Two backendsfivefaults plushealthyReact/DOM/swap all13mustexecute.
4. N6 composes runner, Go certificate, executableartifactreport, smoke, manifest/sourcepin/archive receipts. Gateallinputsavailable; diskbounded compactcaptures; no imported authorrawlog asruntimeinput.
5. Rootinspectsactualcode, runsM0/originalcounter/focusedqualification, repairsconcretefailures throughscopedpackets, nativeindependentreviews, closesreceipts, sourceGitpinboundaryauditalltestedfilestracked, publishesfeaturebranch/reviewPRstackedonPR17 andevidencebranch. No main/deploy. KeepPR17CIacceptanceresumeinparallel withoutclaimingqueuedruns passed.

Reviewfocus: negativefixturemaskedbyhostguard (measureactualcallbacks); unactivatedfault falsepass; contaminationbetween cases; genericerrors countedasdetection; source/helperfilemissingfromGit. N1/N4/N5 testeachcase andfailureclass. Otherbrowserengines/concurrentReact/pixels/arbitraryGo remainuntested. Nextcapabilityafterqualification: separatelycompiledtypedchildmodules, nowwithstrongerbackendwitness.
