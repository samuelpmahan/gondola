# E-RELOCATE — extracted source loader replay

**Worker:** N2  
**Outcome:** `mixed_change`  
**Base source:** clean E-RUNFINAL commit `f6c9da1b9299a983f8a55c86ddbb0ab7543a1204`, tree `89a4548e2dcaafb138a5d2b46bbffda082b52d9b`

## Repair

The loader no longer requires the recorded build-time `repositoryRoot` to equal its current filesystem root. It validates the recorded context as canonical absolute paths and checks that its compiler and helper comment bases are internally anchored at that recorded repository root. `ROOT` remains the physical location of the imported source closure and is used for every `sourcePins` and fixture-source read. Build artifacts remain loaded from the supplied index directory. No original checkout fallback was added, and the generated-comment, raw artifact, ABI, effect, command, and source-hash checks remain in place.

Only `compiled-module-effects/build/module-loader.mjs` and the focused test `compiled-module-effects/build/module-loader-relocation.test.mjs` changed. Source comments and ABI admission were not modified.

## Relocated archive replay

The integration test copied the N5-extracted F6 archive source and build tree into a fresh temporary directory, imported the repaired loader from that copied source, and blocked `node:fs/promises.readFile` for the original checkout root for the duration of each load. The unmodified recorded context named `/workspace/scratch/39a56936f173/gondola`; the imported source and build artifacts were under `/tmp/gobi-effects-relocated-source-*`. The successful load did not attempt a read from the original checkout.

The F6 build index pins the old loader bytes (`db9f6cf8…e79a15b`). To test the repaired loader against the existing F6 artifacts without changing the sealed archive or index, the test used a temporary copied index and updated only its loader self-pin to the current loader hash (`bd747b53…667277a`). The other 60 build-index source pins, all build records, commands, generated outputs, artifacts, and native boundary data remained byte-identical. The archived F6 index and archive were not modified. The exact source and index pins are listed in `rawlogs/E-RELOCATE/relocation-inputs.json`.

The relocated load admitted both backend profiles and all four independent parent/child builds. It exposed eight direct role objects (module and encoder for each of the four sides). Each backend's compiled child matched the native oracle for all ten mount-boundary cases, including full state and ordered effects. The normal four-effect request/cancel probes also passed for both backends.

Tamper controls confirmed that a modified local Go child source is rejected by its source pin, a repository-root-only context edit is rejected as internally inconsistent, and a modified React child module ABI artifact is rejected at the earlier BuildResult output hash gate. The artifact-control assertion records that first failing gate.

## Verification

- Node `v22.23.4`: five focused tests passed, zero failed, zero skipped. This includes the relocated-source integration, the existing path/comment controls, and the browser bundle smoke.
- `node --check` passed for `module-loader.mjs` and `module-loader-relocation.test.mjs`.
- The archived artifacts were built by the recorded Go `1.24.0` / compiler Go `1.27.3`, GoScript `v0.6.2`, and esbuild `0.28.2`; this relocation replay ran no compiler or Go command.
- F6 archive: 638 members, 8,666,186 bytes, SHA-256 `e01b9508747b6e59af97a0cb57ce6c41a44514393cf9b57d6832b9d7bef89f4a`. Manifest: 160,505 bytes, SHA-256 `5c06a221bae5709eca9859d1c273a7b9f4b26463fca086a4a2caa2ecd30fe0fc`.

The existing F6 index correctly remains pinned to the old source snapshot, so it does not attest the repaired loader's self-pin. Root must bind the repaired source and perform the next clean producer run before the N5 consumer's final archive acceptance. This packet proves source relocation against the existing pinned builds with an explicitly described temporary test index; it does not claim that the old F6 index has been rewritten or that the next clean run has happened.

The initial copy-mode failure and the first overly-specific artifact assertion are preserved, along with the successful replay, combined focused-test output, and all pins, under `rawlogs/E-RELOCATE/index.json` (10 evidence files; index SHA-256 `74859a394907fcaf0e513744e7f9323969d9d72f9c071258984a858aab6ec552`). No Git, scheduler, archive, or previous packet files were changed.
