# E-FINAL-ACCEPTANCE (N6)

**Outcome: `confirmed_reuse`.** This packet accepts the exact source462 local full run and its separately verified hosted child and Counter CI artifacts. It supersedes the metadata findings in XR-ACCEPTANCE while preserving the earlier E-ACCEPTANCE and XR-ACCEPTANCE bytes.

## Local source462 acceptance

The source is commit `462a9827bfe1980600456b00d0a67843eaa9756d`. The root-run `bash run-compiled-children.sh` completed successfully with all 10 stages passed, zero failures, and zero mismatches. The full-run source snapshots contain 147 paths; every path matches the physical source and pre/post snapshots are identical.

The correct archive path is `/workspace/scratch/39a56936f173/gondola-children-archive/compiled-children/demo/output/attempts/attempt-20261031T144222262Z-7.tar.gz` (42,985,107 bytes, SHA-256 `5c70c112bd8e9e1366ff572ebde718192236409739059246a422fff52c6c1b01`). Its external manifest is 84,712 bytes, SHA-256 `ba2e35fc2841aaf250e5d21fdfd6b84fba02dd4f5853bd84b6e562d3f0f17f5a`. The post-command consumer completed with exit code 0 and verified 417/417 members.

The fixed fixture has 42 events, 38 Go updates, and 39 state checkpoints. Three 60-event seeded schedules each have 59 Go updates: seeds 20261031, 20261032, and 20261033. Only seed 20261031 includes a mounted-browser capture; the other two are native/direct-only. The fixed scenario detected all 12 mutation controls. The HTTP smoke passed 32/32 checks. The 46 unit checks and 9 literal-oracle checks passed. These results are specific to this fixture and its recorded React/DOM and Chromium captures.

## Corrections to the frozen E-ACCEPTANCE packet

The prior packet remains byte-for-byte unchanged. This packet supplies its corrected metadata:

- It uses the actual `attempt-20261031T144222262Z-7.tar.gz` path recorded by the frozen source462 E-DELIVERY receipt. The prior receipt's `.archive-manifest.tar.gz` path does not exist.
- It states the fixed trace as **42 events / 38 Go updates / 39 state checkpoints**. `ticks: 39` in the conformance summary counts checkpoints, not Go updates.
- It references the actual `independent-post-command-archive-consumer` command in the source462 E-DELIVERY receipt. That command exited 0 and used expected manifest SHA-256 `ba2e35fc2841aaf250e5d21fdfd6b84fba02dd4f5853bd84b6e562d3f0f17f5a`. The copied E-ACCEPTANCE `commands.txt` has a transcription error; it is not the command that ran.

The preserved N1 source978 matrix also has a corrected stage ordinal: there were ten stages total, with preflight before the failed inherited stage and eight passed stages afterward. Thus nine non-inherited stages passed. Source978 remains an overall failed full delivery with two inherited-gate failures and zero semantic mismatches; its separately verified 239-member archive does not change that status.

## Hosted source462 proof

The hosted child push run `41211302195`, job `124566695902`, completed successfully on the exact source462 commit. Its artifact `13046728760` has a 153,482,729-byte ZIP, SHA-256 `0c0ae308fa6089525c77192bf5cb17a0b9ee49325cb778b33b11d7544e6886ad`. Independent streaming verification passed its CRC checks and all 1,893 ZIP entries. The contained E-DELIVERY receipt is 256,637 bytes, SHA-256 `55b8178cf7c23ccbee7a36481fd8b76ad053ccc472a789faa42bcd75219210bd`; all 10 stages passed with zero failures and mismatches.

The hosted artifact contains the 43,430,390-byte final tar archive (SHA-256 `1491c939df0a8e219162af1fb52373c2f64579a24cc550b96cae52f55a2c21a5`) and its 84,683-byte manifest (SHA-256 `b74605cf9975ad7963d3d2a397d6228e68730a62fb0730aa1dbb34a8cc1679e0`). I streamed the archive without extracting or copying it; all 417 members and 420,180,199 uncompressed bytes matched the manifest. The hosted source receipt's 147 before/after pins also match the exact Git commit.

The hosted run used Node v22.23.4, npm 10.9.9, Go 1.24.13, compiler Go 1.27.3, and Chromium 156.0.8078.4. React and ReactDOM were 19.3.1, Playwright 1.64.1, and esbuild 0.28.2. The separate PR child run `41211304775` is recorded as passed in root's run status.

## Separate Counter CI evidence and broader matrix status

A separate Counter CI run `41211304774`, job `124566703068`, artifact `13046685411`, passed on source462. Its 3,776,349-byte ZIP has SHA-256 `4afbf5770ff7ecead54ed01350dcc3303e0504d3334c427f9f86f8100b8760cc`; its archived interaction trace is 49,490,981 bytes, SHA-256 `68157dc955fdb1c230138d8c9513953d00e06a8cc335b98f0933c850aa036b32`. The trace header records seed 20261030, 107 scenarios, 4,473 ticks, 107 native matches, zero mismatches, and Chromium 156.0.8078.4. This is current hosted CI evidence. It remains separate from the local full-run's historical Counter statement in E-ACCEPTANCE; source462's local full-run receipt did not rerun that Counter interaction suite.

At the latest root status recorded for this packet, 29 of the broader 32-run matrix entries had passed and 3 were still running. This packet does not claim completion of all 32.

## Finite scope and custody

The acceptance covers this source snapshot and keyed-child fixture, the recorded React/DOM backends, and Chromium 153 locally / Chromium 156 in hosted CI. Only seed 20261031 was mounted in the seeded browser replay. It does not establish behavior for other backends or browsers, future compiler/source versions, arbitrary Go programs, or production transport effects. The 107/4,473 Counter result is accepted as hosted CI evidence, not as a local source462 result.

Separate historical custody packets accepted the selected 875-member published container (164,464,000 bytes; SHA-256 `a044fd9bab3af502002aeba54513d8f33a263a32aca6023cbf510f87905606e0`) and independently streamed the superseded 902-member retry1 container (167,917,858 bytes; SHA-256 `954bad6b31df16f92c8297d64a53029c26159c3aeede1694d53a626a90c4f1a7`). The earlier 903-file staging cleanup still has one extra 29,884,416-byte file whose identity/equality is unproven; there is no all-903 recovery claim. The earlier source60 local archive-corruption record also remains separate and unchanged; this packet does not reclassify that rejected local container or replace its own authoritative CI record. The source978 failure and prior matrix packets remain preserved. No source, demo, README, Git, or scheduler changes were made; no full pipeline was rerun here. The broad source462 matrix remains under root's tracking.

During packet assembly, one intermediate receipt validation caught a stale rawlog-manifest pin after `commands.txt` had been corrected. A subsequent attempt redirected validator output into files that were themselves pinned, so it stopped on a self-truncation size check. Both failed outputs are preserved. The manifest and receipt were rebuilt, and the final pinned validation was redirected outside the rawlog set and passed. These were packet-assembly sequencing errors, not source, runtime, or archive mismatches.
