# E-BUILD: fresh publications inputs for backend qualification

**Worker:** N2  
**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## Result

Added `backend-qualification/build/build.mjs`, exporting the agreed `buildQualificationInputs({ outputDir })` API. It runs the native publications Go CLI and the existing GoScript build CLI for React and DOM, resolves module and encoder paths from each actual build manifest, verifies the fixture and oracle-plan pins, checks the required AppIR capabilities, and writes a portable provenance record. The compiler, Go application, native CLI, and renderer sources were not changed by this lane.

The final fresh output directory is `/tmp/gobi-backend-qualification-E-BUILD-final-20261031`. The function returned:

- `reactCompiled`: `builds/react/output/apps/publications-5ad33d9496e7/gobi-compiled.mjs`
- `reactHelpers`: `builds/react/output/apps/publications-5ad33d9496e7/encoder.mjs`
- `domCompiled`: `builds/dom/output/apps/publications-5ad33d9496e7/gobi-compiled.mjs`
- `domHelpers`: `builds/dom/output/apps/publications-5ad33d9496e7/encoder.mjs`
- `fixturePath`: `fixtures/compiled/publications/scenario.json`
- `expectationsPath`: `compiled-publications/oracle/expectations.json` (the baseline literal oracle; the separate 13-case plan is pinned in provenance)
- `nativePath`: `native/native-trace.json`
- `provenancePath`: `provenance/build-inputs.json`

Both GoScript CLI builds exited 0 and reported 67 output files. Each physical output tree matched the CLI inventory and file hashes. React and DOM AppIR and encoder outputs are byte-identical. Both AppIR components expose five capabilities: `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`.

The fresh Go 1.24 native CLI trace has 50 events and 45 Go updates. Its SHA-256 is `bbf6db314e6f9f68802e0dd3d49b5216c4ed93db5696d9f9980055de12bced3d`. The source-pin record covers 86 source and plan inputs and reports identical pins before and after the builds; an independent rehash confirmed every pin still matches. Recorded tool versions are Node `v22.23.4`, native Go `1.24.0`, and compiler Go `1.27.3`.

## Verification scope

The builder syntax check and fresh native/React/DOM command sequence passed. A read-only audit rehashed all 134 generated build outputs, both manifests, source pins, command logs, the native trace, and the copied evidence. All 18 audit checks passed. The source, fixture, plan, baseline expectations, lock files, and generated module/helper hashes are pinned in `rawlogs/E-BUILD/build-inputs.json`. The first successful builder invocation was superseded after N4/N5 clarified that `expectationsPath` must point to the literal baseline oracle, with the 13-case plan loaded separately; the final fresh invocation uses the corrected interface. The first independent audit helper also had a duplicated output-root prefix when opening AppIR. That verifier path was fixed and the final audit passed; neither issue was a GoScript or native build failure. Details are in `rawlogs/E-BUILD/review-notes.md`.

This packet proves build and provenance inputs for the qualification runner. It does not claim the 13 mounted qualification cases have run or passed; N4 owns that execution. Build outputs are retained in the temporary directory above for runner consumption.
