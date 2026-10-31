# E-ACCEPTANCE (N6)

**Outcome: `confirmed_reuse`.** The local source462 full run is accepted for the bounded compiled-children fixture. N6 made no product-source or README changes and did not rerun the full pipeline.

## Accepted local run

The exact source snapshot is commit `462a9827bfe1980600456b00d0a67843eaa9756d` in `/workspace/scratch/39a56936f173/gondola-children-archive`. Root ran `bash run-compiled-children.sh`; its archived console ends `compiled-children: passed (full)`. The outer E-DELIVERY receipt reports all ten stages passed, zero failures, zero mismatches, source pins matched, and completion at `2026-10-31T15:06:59.356Z`.

The 147 paths in the receipt's before/after snapshots were rehashed against the physical source tree. Every file matched both snapshots, and the pre/post boundary hashes are identical (`09cb165ef61b09ec61a8ee5376801abaf6a63f4d882a309366b6790df68f6356`). This includes an independent check of the fresh native oracle capture at 653,879 bytes, SHA-256 `8ad3a28bd1a5e03a3c324dcecb1b5c55d97ffae257b1011103e7730573baefbb`.

After the outer command exited, N6 used the separate Node archive consumer to verify the immutable 42,985,107-byte archive and all 417 manifest members. Archive SHA-256 is `5c70c112bd8e9e1366ff572ebde718192236409739059246a422fff52c6c1b01`; manifest SHA-256 is `ba2e35fc2841aaf250e5d21fdfd6b84fba02dd4f5853bd84b6e562d3f0f17f5a`. The consumer did not call the producer helper. Its result and the pin checks are in this packet's raw logs.

## Fixture and inherited evidence

The run passed 46/46 new host, harness, inherited-gate, and no-WASM unit tests; the independent literal oracle passed 9/9. The fixed capture matched 42 events and 39 Go ticks across native, direct compiled, React, and DOM paths; it recorded two swap cases and detected all 12 captured-data mutation controls. The HTTP demo smoke passed 32/32 checks, including pending-request disabled controls. Chromium reported all ten WebAssembly hooks installed with no hook failures, browser API attempts, or WebAssembly requests.

Three bounded seeded schedules each ran 60 events and 59 Go updates for seeds 20261031, 20261032, and 20261033. Seed 20261031 also had a mounted-browser capture and matched. Seeds 20261032 and 20261033 were native/direct runs only; this report makes no mounted-browser parity claim for them. The seeded schedules use native/direct differential checks and do not add a per-seed literal oracle.

React and DOM builds each produced 67 outputs. Their AppIR, encoder, and output path inventory were byte-identical. The inherited M0 record was checked against the actual source tree: all 24 checksum entries and `SHA256SUMS` matched, and `gobi/rules_test.go` contains 59 rule rows. The Counter figure of 107 scripts / 4,473 ticks remains historical evidence from seed 20261030; source462 did not rerun that Counter baseline.

Toolchain recorded by the run: Node v22.23.4, npm 11.9.0, Go 1.24.0, compiler Go 1.27.3, Chromium 153.0.8010.0, React/ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2.

## Correction to the source978 matrix

The original N1 report says nine stages passed **after** inherited execution. XR-RELEASE-CONTRACT-MATRIX correctly identified the ordinal error. Source978 had ten stages total: preflight passed before inherited execution, the inherited stage failed, and eight stages after it passed. Thus nine non-inherited stages passed, not nine post-inherited stages. The N1 report, N1 receipt, and XR report/receipt are preserved byte-for-byte; their pins are in `prior-matrix-preservation.json`.

Source978 remains a failed full delivery with two inherited-gate failures and zero semantic mismatches. Its inherited gate expected three archive-helper tests but observed five passing tests, and its source-pin boundary compared an empty `sourceBefore` with 163 later files. Its separate 239-member archive passed the recorded checks, but that does not change source978's failed overall status. The passing source462 run supersedes source978 for current local acceptance.

## Limits

This acceptance covers the frozen fixture, compiler output, shared runtime, React/DOM paths, and Chromium capture exercised above. It does not establish behavior for another backend, another browser engine, future compiler/source changes, arbitrary Go programs, or production network effects. A future backend should consume the same compiled AppIR/encoder/module and shared renderer/effect contract, avoid JavaScript domain state, and replay the fixed plus seeded schedules while comparing Go state, view trees, effects, DOM order, disabled controls, cancellation, stale replies, and swaps.

The previously recorded source60 local archive-corruption evidence (`978eaea98831154f8152baa1a64f1d1356916596`) remains a separate historical limitation: that local container was rejected, and this source462 packet neither rewrites its receipt nor reclassifies it. The earlier milestone’s authoritative complete CI record remains separate. CI32 for source462 is outside this local acceptance packet and remains under root’s tracking.

The initial static-check helper drafts had assertion-shape mistakes (they compared receipt path metadata as content hashes); the corrected independent check passed. The first summary-helper draft also treated the receipt's boundary list as a mapping; the corrected check passed. These verifier-only failures are retained in raw logs and are not source, runtime, or archive mismatches.
