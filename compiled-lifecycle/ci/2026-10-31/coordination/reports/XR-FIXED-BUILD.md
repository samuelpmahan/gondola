# XR-FIXED-BUILD — independent review of the fixed primary build packet

**Decision: accepted** (`confirmed_reuse`) for the bounded source-pinned build and archive evidence in E-FIXED-BUILD. I reviewed the current successful provider artifact `13035044166` from run `41181505234`, source `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`. This review does not imply that the primary ZIP contains outputs for every inherited suite.

## Packet and provider archive

The E-FIXED-BUILD receipt binds its report, audit JSON, and audit script by SHA-256; the three hashes match the retained files. Its `E-BUILD` receipt is byte-identical to the attempt's `execution.json`; the copied E-BUILD report matches its receipt hash and attempt copy. The primary ZIP is 47,072,021 bytes with SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`. I recomputed the archive digest, CRCs, and per-member sizes and SHA-256 values, matching all 1,270 inventory entries and materialized extracted files (413,394,195 expanded bytes). The ZIP paths and extraction contents were only read.

All 123 `sourceBefore` pins match blob content from commit `00da54ad0f5a4006b13a5cded18ce291845978bc` itself, not just the current checkout; that commit resolves to tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`. The full execution receipt records 18 commands, 13 passed stages, no failures, and stable pre/post source pins.

## Retained suite coverage and custody observations

The authoritative ZIP contains 309 `compiled-frontend`, 508 `compiled-backends`, 193 `compiled-methods`, and 260 `compiled-lifecycle` file paths. It has zero `session-tree` and zero `typed-composition` artifact paths. A separate retained PR workflow log contains separate suite results and an upload declaration, but does not add those artifact contents to this ZIP.

The extraction has exactly one file absent from the provider inventory: `compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z/matrix/.lifecycle.browser.json.yXKBO2`, 48,496,640 bytes, SHA-256 `4888479ee2bcf9d514698b27677d027799b4cdbca02d9fbee8fda39d209120a2`. Its bytes are exactly a prefix of the authoritative ZIP's complete 66,817,124-byte browser JSON; the archived browser JSON and browser capture are byte-identical. Its origin is not established; it is excluded from provider-member and application-acceptance evidence.

The earliest retained workflow snapshot is malformed JSON, SHA-256 `3611879716d0d6dd04dceccddbf23482921739efb536933a61be20106fbd6ca0`, with an invalid-control-character parse error at byte/character offset 7000. I excluded it from parsed run counts. The later `workflows-20261031T081509Z.json` snapshot confirms the primary run completed successfully at the pinned source; its matching summary reports 28 completed and successful workflows, zero failures, and no exceptions. The E-FIXED-BUILD audit itself used the earlier valid `081127Z` snapshot; the additional `081509Z` record is supplemental confirmation.

## Fresh builds, typed ABI, and test order

Both fresh GoScript profiles report `ok:true`, zero diagnostics, 67 outputs, and verified output pins. React and DOM AppIR and encoder bytes are identical; backend module bytes are separately pinned and differ. The AppIR component ID is the full fixture package path and advertises request/reply capability. `Update` returns lifecycle State plus `[]gobi.Effect`; AppIR identifies that Effect slice as a typed `slice` with `array-or-goscript-slice` representation. Its `Kind`, `Name`, `Arg`, and `Reply` fields agree with the generated encoder type table and the compiled module's gobi.Effect registration.

The eight Node test files run before compilation passed 71/71. The execution metadata also lists the deferred lifecycle runtime suite among nine test files; the command explicitly ran the eight-file prebuild set. After both fresh builds, `runtime.test.mjs` ran with `GOBI_LIFECYCLE_APP_DIR` pointed at the fresh React app and passed 10/10.

The primary lifecycle matrix reports `matched`: 26 ticks, 17 renderer swaps, and all eight mutation controls detected. The retained literal checks cover native, direct emitted-module, browser traces, and physical DOM. Source and build output pins remained stable through the check.

## Inner lifecycle archive and inherited methods custody

The inner lifecycle archive is 12,072,699 bytes, SHA-256 `152809097b8ce3e5d541646d667635117bd6936193e24775c33a5692a389ee04`; its manifest SHA-256 is `71f078d044a6e90bf92c6636ab9ae9867349dbfbc5171e69ae37971292be089a`. I read and verified all 240 manifest/archive/materialized files, totaling 159,309,482 expanded bytes. Within the provider's 193-file compiled-methods prefix, the attempt retains a distinct 53-file copied subset (10,268,453 bytes); every copied file maps to and matches its original provider member and appears in the 240-member archive. These are separate inventories, not interchangeable totals.

## Git identity disclosure and reproduction

E-FIXED-BUILD discloses that its earlier `git rev-parse HEAD && git write-tree` identity probe returned the existing 00da commit and 51b tree. Root confirmed no HEAD, index, or worktree change; the possible already-existing tree-object side effect remains disclosed. My verification reads commit blobs with `git cat-file` and does not write Git state.

Reproduce the read-only checks from the CI worktree root with Python `3.12.14`:

```sh
python3 compiled-lifecycle/ci/2026-10-31/fixed/reviews/build/audit_fixed_build_review.py
```

The script reads the original ZIP, retained extraction, author packet, execution records, build outputs, Git blobs, and inner archive. It writes the independent JSON result only to `fixed/reviews/build/audit.json`; stdout and stderr are captured alongside it. It does not compile, run tests, rebuild the ZIP, or alter the extraction.

- Independent audit result: `compiled-lifecycle/ci/2026-10-31/fixed/reviews/build/audit.json`.
- Independent audit script: `compiled-lifecycle/ci/2026-10-31/fixed/reviews/build/audit_fixed_build_review.py`.
- E-FIXED-BUILD report and receipt remain unchanged; their hashes are recorded in the XR-FIXED-BUILD receipt.
