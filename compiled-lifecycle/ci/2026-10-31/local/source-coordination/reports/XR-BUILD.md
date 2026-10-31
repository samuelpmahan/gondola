# XR-BUILD Independent Review

**Decision: accepted for the recorded lifecycle-only attempt and the separate inherited child receipt.** This review does not accept a single full-parent local run or hosted CI.

## Lifecycle-only E-BUILD

The canonical E-BUILD receipt is `lifecycle-only` / `passed`: 18 commands, 13 passed stages, and zero failures. Its report hash is `54b4146e5cde6cd1cb31d5243d432764fdd841569a773996c2064e7339ba36f0`; its receipt hash is `cc5ab603c6288cca0665869881ce0bcd347207c7821f61d83a03fb16fad9bdd3`.

I compared the 122 source pins from both the canonical receipt and attempt execution against the current files and the published source commit `49cc2b96c8817a47319d5b7bd484184a22fa984b`. There were no missing or mismatched pins. The source commit tree, publication tree, and local `HEAD` tree are all `d49ca35b7eda23837c392bbe0d2363551e4c7bec`.

The fresh React and DOM GoScript CLI builds each returned `ok: true`, 67 outputs, and zero diagnostics. All 67 output hashes per backend match their recorded pins, before/after output pins are unchanged, and both profiles share byte-identical AppIR and encoder outputs. Their raw GoScript module hashes differ, and the run makes no raw-bundle equality claim. The compiled lifecycle runtime test ran after both builds with `GOBI_LIFECYCLE_APP_DIR` pointing at the fresh React output; its retained TAP log reports 10 passed and zero failed.

Native, direct GoScript, React, DOM, and swap profiles matched the independent oracle: 26 events/ticks, 16 clicks, 17 swaps, 7 requests, and 3 cancellations in Grandchild→Child→Parent order. The evidence records 18 stale physical-click probes, 32 callback fences across 16 eligible swaps, and all 8 mutation controls detected.

The HTTP smoke passed with three HTTP 200 responses, no browser/console/request failures, no WASM requests or API attempts, and a retained screenshot. I independently streamed the lifecycle archive and verified all 719 regular-file hashes against its manifest, covering 168,198,179 uncompressed bytes; the tar also has 272 directory entries and no unsafe paths or special entries. Archive SHA-256: `2e674d3d7f43576a0f9052f6164e83f3312933112eaf72fa3348a29d3db22f47`.

## Separate inherited compiled-methods run

The independent E-DEMO receipt records mode `full`, status `passed`, 17 commands, and 137 stable source pins. All 137 match current files and the published `49cc` source tree; `root-checks/inherited-source-compatibility.json` also records 137 checked pins and no current mismatches. This is a separate child receipt, not a full-parent lifecycle pass.

The complete inherited attempt directory has 191 files, including 138 files under nested React/DOM build directories. The invalidated parent archive contains a copied subset of 53 inherited files (10,269,094 bytes); I matched each copied file to the complete attempt. None is under the nested `builds` directories, so this copy is incomplete and must not be treated as the inherited run's complete build archive. The full inherited attempt remains available at `compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/`.

## Invalidated full-parent run and acceptance boundary

The earlier E-BUILD full-mode attempt remains `failed` with `sourcePinsMatch: false`. Its preserved receipt under `before/full-invalidated` is byte-identical to the attempt's original `execution.json`; the preserved report matches its recorded hash. The old attempt's 122 source pins drifted in the workflow, runner, and lifecycle runtime test. Its combined Node test ran before the fresh React/DOM builds and had no `GOBI_LIFECYCLE_APP_DIR`, which explains why that earlier attempt is not accepted. I independently verified all 701 regular files in its retained failed-attempt archive against its inventory; that history remains failure evidence.

Therefore the accepted evidence is limited to the lifecycle-only run and the separately passing inherited child. There is no single full-parent local pass. Publication metadata says the current-head 28 hosted CI workflows are pending; this review does not claim hosted CI acceptance. `current_tree_accepted` is false.

The reproducible checks and detailed hashes are in [`audit.json`](../reviews/xr-build/audit.json); the read-only verifier is [`audit.py`](../reviews/xr-build/audit.py).
