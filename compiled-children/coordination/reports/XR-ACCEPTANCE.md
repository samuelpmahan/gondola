# XR-ACCEPTANCE (N1): independent review of N6's source462 packet

**Decision: `amend` the E-ACCEPTANCE evidence packet.** The actual source462 local full run passes the reviewed checks. Two fields in N6's report/receipt misstate where evidence is or how the trace is counted; a pinned command transcript also contains a manifest-hash typo. These are packet metadata errors, not archive-member, source, application-runtime, or command-execution failures. Preserve N6's original packet bytes and publish a separate evidence-only correction.

## Independently verified run

N6's report, all **28 receipt entries** (27 manifest-listed rawlogs plus the manifest), and all recorded hashes match the current files. I checked the actual source462 outer receipt at `coordination/current-full-source-462/E-DELIVERY.json`, its report and console. That receipt records the 2026-10-31 source462 full command with all **10 stages passed**, zero failures, and zero mismatches.

The source tree at `/workspace/scratch/39a56936f173/gondola-children-archive` is commit `462a9827bfe1980600456b00d0a67843eaa9756d`. I independently rehashed all **147** `sourceBefore`/`sourceAfter` paths against that physical tree. The two snapshots are identical, all files match, and both boundary hashes are `09cb165ef61b09ec61a8ee5376801abaf6a63f4d882a309366b6790df68f6356`.

The actual full-delivery archive is `attempt-20261031T144222262Z-7.tar.gz`: **42,985,107 bytes**, SHA-256 `5c70c112bd8e9e1366ff572ebde718192236409739059246a422fff52c6c1b01`. Its external manifest is **84,712 bytes**, SHA-256 `ba2e35fc2841aaf250e5d21fdfd6b84fba02dd4f5853bd84b6e562d3f0f17f5a`. I streamed and hashed all **417** tar members against the manifest without extracting or copying the archive; all member paths, sizes, and hashes match. The previously recorded standalone consumer result also passes and is bound to those actual hashes.

The archived fixed trace reports **42 source events, 38 Go updates, and 39 state checkpoints** (the initial checkpoint plus 38 updates), with two swaps and all 12 mutation controls detected. The three seeded runs each contain 60 events and 59 updates; only seed `20261031` has a mounted-browser output. The source462 demo records 32/32 HTTP checks passed. React and DOM each produced 67 outputs with byte-identical AppIR, encoder, and output paths; the 46 unit checks and 9 literal-oracle checks passed in the full artifact.

M0 verification confirms **24 checksum entries**, all matching actual files, and 59 rule rows. The `107 scripts / 4,473 ticks` Counter baseline is historical from seed `20261030`; it was not rerun in source462. The source978 correction also matches the actual failed full-delivery receipt: 10 stages total, preflight passed before the inherited stage, the inherited stage failed, and eight stages passed afterward. That is nine non-inherited passes, not nine post-inherited passes. The four prior matrix report/receipt files still match their preserved hashes.

## Corrections required in E-ACCEPTANCE

1. **Archive path:** N6's receipt says `/workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7.archive-manifest.tar.gz`. That path does not exist. The actual archive verified by the current full-delivery receipt and standalone consumer is `/workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7.tar.gz`, with the same recorded 42,985,107-byte size and SHA-256 above.

2. **Fixed trace counts:** N6's receipt says `goTicks: 39` and its report says “39 Go ticks.” The actual `harness/run.check.json` and native capture have 42 events, **38** update steps, and **39** checkpoints. Change the packet to name all three counts accurately; the 39 value is the checkpoint count.

3. **Command transcript:** N6's pinned `commands.txt` records expected manifest SHA-256 `ba2e35fc2841aaf250e5d21fdfd1b6d84fba02dd4f5853bd84b6e562d3f0f17f5a`, which differs from the actual manifest SHA-256 `ba2e35fc2841aaf250e5d21fdfd6b84fba02dd4f5853bd84b6e562d3f0f17f5a`. The executed command recorded in the source462 E-DELIVERY receipt uses the correct hash, exited 0, and the standalone consumer output reports the same correct manifest hash. Correct the transcript in the evidence-only packet; this mismatch does not indicate that the archive consumer ran with the wrong argument.

## Scope

This review does not rerun the full pipeline or alter any original E-ACCEPTANCE file, source, archive, README, Git state, or scheduler state. It verifies the exact source462 local artifact only. CI remains under root's separate hosted-run evidence. The amend decision is limited to correcting N6's evidence packet metadata; the underlying local source462 full run and its verified archive remain passing.
