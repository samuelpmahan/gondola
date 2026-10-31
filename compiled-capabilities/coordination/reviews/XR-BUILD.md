# XR-BUILD: independent review of the full capability runner

## Decision

**Amend.** N6's runner, shell wrapper, workflow, CLI handoffs, result checks, and pending author report are structurally sound. The archive round-trip is also implemented, but the archive does not carry the full-run replay provenance required to reconstruct what was pinned and executed.

## Finding XR-BUILD-1: archive omits the full-run provenance payload

`makeArchive()` in `compiled-capabilities/run.mjs` enumerates `react/`, `dom/`, `demo/`, `matrix/`, and `logs/`, then optional inherited lifecycle artifacts. The full receipt—including `sourceBefore`, toolchain and dependency versions, and the command ledger—is written to the canonical receipt and to the attempt's `execution.json`; neither file is included in the archive. `sourceAfter` is only computed after archive creation. N3's matrix manifest contains narrower conformance-source/build pins, but that does not replace the outer runner's complete before/after source set and command record.

The archive manifest is outside the tar, while the final outer receipt records its path and hash. That binding is explicit. The gap is the missing immutable full-run execution snapshot inside the archive.

### Requested repair

Before archive creation, write an immutable `execution-before-archive.json` containing `sourceBefore`, toolchain/dependency versions, the command ledger, and an explicit archive-pending status; include it in the tar. Keep `sourceAfter` in the final outer receipt after archive creation, which also binds the archive hash. Either include the payload manifest under a documented self-excluded hash policy or keep it outside and bind its exact hash in the final receipt. Keep the final canonical receipt outside the immutable tar to avoid a self-hash cycle.

## Confirmed areas

- The runner accepts no arguments and records only full mode. A failing stage remains in `receipt.failures`; final status cannot become `passed` after a stage or source-pin failure.
- The runner regenerates the ignored React map and verifies all 24 M0 checksums before taking `sourceBefore`. The inherited `run-compiled-lifecycle.sh` chain runs before fresh React/DOM capability builds.
- The React and DOM builds go through the actual GoScript CLI. N6's author receipt records 67 pinned outputs per backend and the exact five capability declarations. The runner checks AppIR/encoder equality and pins raw modules separately; it makes no cross-build module-equality claim.
- N3's 13 flags match the N6 invocation. `--native-go` is passed a Go executable; the inherited native projection calls `go run ./cmd/compiled-lifecycle-native --script <fixture>`. The generated feasibility binary is not passed to N3.
- The in-flight inherited browser adapter forwards `core.viewCapabilities`; it parses successfully. Its N3 focused runtime pass is still pending and was not run by this review.
- N3's `<capabilityStem>.browser.capture.json` output maps to N6's `capability.browser.capture.json` suffix (dots). The capture, summaries, native/direct/browser traces, and failure artifact are copied when produced.
- N4 is invoked through Node `--test` and reads the checked-in literal expectations. N5 builder/smoke arguments and the `gobi.compiled-capabilities-demo-smoke/v1` output assertions match the actual N5 code.
- The author E-BUILD report and receipt correctly state that the full runner has not run and make no end-to-end acceptance claim.

## Verification

- Node v22.23.4 syntax checks passed for eight files: N6's runner, N3's driver, N4's test, N5's builder and smoke, the inherited lifecycle conformance runner and browser adapter, and the read-only review probe.
- `bash -n run-compiled-capabilities.sh` passed.
- The capability workflow YAML and E-BUILD author receipt JSON parsed successfully.
- A read-only interface probe parsed all 13 N3 flags, preserved the Go executable path, checked the native `go run` invocation, checked N4's expectation input and N5's builder/smoke flags, and matched the N3 browser capture output suffix against N6's archive copy suffix.
- The full inherited or capability runner was not started. No M0 receipt was changed.

The receipt includes source hashes, check logs, and a preserved note that one initial reviewer-only probe had a quoting typo before the corrected read-only probe passed. This review made no production edits and did not commit, merge, or deploy.
