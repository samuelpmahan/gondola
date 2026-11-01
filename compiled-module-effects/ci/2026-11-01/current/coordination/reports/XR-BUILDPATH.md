# XR-BUILDPATH — independent review of output-root normalization

**Reviewer:** N1  
**Job:** XR-BUILDPATH  
**Decision:** **accepted**  
**Score:** 200/200; broken items: 0  
**Reviewed packet:** sealed E-BUILDPATH and the original XR-BUILD amendment.

## Decision

The E-BUILDPATH repair resolves XR-BUILD’s runner-root comment rejection. The build now derives source-comment policy from each build’s declared path context, records the complete comment sequence and authorized roots, and removes only the exact recorded comment lines before comparing executable bytes. I found no remaining issue in the declared build-path scope.

The original XR-BUILD packet remains unchanged and continues to record its historical `AMEND`. This acceptance explicitly closes that finding through the separate E-BUILDPATH repair and its actual fresh-root builds.

## Packet and source verification

The E-BUILDPATH report and author receipt match the sealed hashes. All five source-inventory files, all 61 source pins, and all 96 indexed E-BUILDPATH raw-log files rehashed without mismatch. The primary E-BUILDPATH raw-log index is SHA-256 `20d4fe9721a066f1e20dcd21f1bee64fbe06a36d44957783f10cddb4afac2e9d`.

The original author receipt has SHA-256 `695ce7b14579a6d3c49fc66a7ef3b540ba191fe47055e1764b0f8266873821ad` and retains its original `outcome: valid`. The native protocol-normalized copy has SHA-256 `26b2a7afa2f45e8991f1b8afea767319dff1ed879c02fb6ee66f1635da5d5468`, records `mixed_change`, and points back to the original receipt hash. The protocol addendum documents that normalization; it did not change build evidence or source.

## Source-comment and browser checks

`source-comments.mjs` is the Node path-resolution module. The browser ABI admission module `abi-admission.mjs` has no Node built-in imports. The browser-entry bundle smoke passed and confirmed the generated bundle contains neither `node:path` nor `node:fs`.

Each build index carries a source-comment policy with its context and exact ordered `comments` inventory. Policy validation resolves GoScript comments beneath the declared temp root, staged module comments beneath that run’s output root, and helper comments beneath the declared emitted or helper-entry locations. Comment normalization requires the observed lines to match that ordered inventory exactly. Executable bytes remain in the normalized digest.

The focused tests independently passed 4/4. They cover runner-shaped and deeper checkout roots, an external output directory, helper-policy relocation, unexpected/altered/unrecorded comments, executable string changes, and a real browser bundle smoke. Mutation controls report executable string/token changes and unrecognized comment changes rejected.

## Build and relocation evidence

Both sealed indexes pass an independent `loadModuleEffectsBuilds()` call, which checks the indexed source/artifact pins and profile structure. Each records four actual builds: React parent/child and DOM parent/child. The runner-shaped index is 271,809 bytes, SHA-256 `cedac419a1e83cebb5f693b4378a477cf33bc60be2cea76fb0daa6b98512290a`; the external index under `/tmp/gobi effects external 20261101/builds` is 262,944 bytes, SHA-256 `349be7d2aef5dcc1275c0cbb0c56514c93c4587a148aa82ee570e7f61ae46433`.

| Backend | Role | Output count | Module ABI SHA-256 | Compiled module SHA-256 |
|---|---|---:|---|---|
| React | parent | 71 | `5b05d79d1168ef2be997962ee4097c084e83c824da7c3baf97cfa6402b0a72fe` | `85b8e453b7b2262ecea641482e936a6f57868fe287b8983bb98ef35b2584f7c8` |
| React | child | 73 | `52f4eb3ba3fd3541619aee8691bc734b344fa5a92256b80eb1e613080a4644e1` | `cfafb8ae5514f265c5daa7fef0f61938d3b7ec55a66105f7b0c1e48f1272cfe9` |
| DOM | parent | 71 | `c71addd8061f1fd70d21634fbdfd9e0cc416ee6f44fbe8ad14fea26e5ea4886c` | `53d09f428a04af8e3275a62e8919b1e11e51f8946250ece50bc7498fb39ded1f` |
| DOM | child | 73 | `d768504e1df794231689fa9671e33b811787dae693b0b3d39a9fe7ce8ce940bc` | `c006ff3d4a3fdb55dcf9d9b06ed3c99e5f82bc03f31a3e68aa4c66a517ac9245` |

The profile preserves the PR22 parent AppIR (`70e17604359b90bc78e022f12b7faeeed3a7a80fac7ba63f79697085711c85af`) and normalized executable parent module/helper hashes (`4f8066ef90393a8b76490a1532bcfc6f59d48bac6d9d7e57f02426e6d28ba1ce`, `9bf860060df1e0463ab1074962dbaf87883d9125acb2e067248dfc6bda04ca3d`) for both backends.

I independently loaded the runner-shaped index, external index, and relocated index. Then I temporarily renamed the original external output directory and loaded the relocated copy while it was absent; loading succeeded with the same external index hash and both React and DOM profiles.

## Commands and limits

Focused command: `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-module-effects/build/path-normalization.test.mjs` (Node v22.23.4), 4 passed, 0 failed. Independent index validation and the relocation-while-original-absent check are captured under `rawlogs/XR-BUILDPATH/`. The author’s actual four-build commands, output hashes, toolchain versions, and full logs remain indexed under `rawlogs/E-BUILDPATH/`.

This review covers output-root source comments, build-index loading, and the four-build evidence. The browser test is a bundle smoke and does not claim full browser interaction or renderer acceptance. No production source, tests, original receipts, or sealed packet files were changed.
