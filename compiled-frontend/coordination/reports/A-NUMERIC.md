# A-NUMERIC

**Outcome: `confirmed_reuse`, limited to the source-level numeric cases below.** The final analyzer rejects every required unsafe case with a source-located diagnostic, accepts six directly bounded controls, and still accepts the four approved application fixtures. The native Go encoder now matches the generated JavaScript encoder at the Number safe-integer boundary while preserving full-width BigInt `int64`/`uint64` values.

## Independent final-source run

I ran a read-only harness that writes short Go packages under `coordination/reviews/numeric/fixture-scratch-*`, calls the real `analyze.LoadSources` and `analyze.Analyze`, invokes the generated value encoder under Node, then removes the temporary packages. The final raw result is at `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/numeric/final-full-check.json`; no scratch fixture directories remain.

All 12 unsafe numeric probes were rejected with `analyze.numeric-profile` spans covering the target expression. Two unsupported package constructs were also rejected with source spans from `LoadSources`:

- Mutation after an upper guard; upper guard plus a maximum-sized compound addition; an unsafe `else` increment; a `switch` case with an OR alternative; inclusive `<= MAX_SAFE` increment; an inclusive loop bound; a negative operand that can cross the lower bound; lower guard plus a maximum-sized compound subtraction; `int8` and `int32` width overflow; an unsafe helper with a numeric parameter; and an out-of-profile integer constant identifier.
- Mutable package globals produce `source.package-global`; package `init` functions produce `source.init-function`.

Six bounded controls were accepted: a constant-based upper guard, direct upper and lower guards, exact lower-bound decrement (`Count > -MAX_SAFE`), and safe `int8` and `int32` increments. Two additional safe cases were conservatively rejected: `Count += 1` inside `Count < MAX_SAFE`, and a helper `v + 1` called under a safe caller-side bound. The analyzer does not yet prove those operand/helper ranges; neither is an unsafe acceptance.

The four real entry packages—counter, form, list, and effect—loaded and analyzed with four apps and no diagnostics. The numeric fixture packages use minimal local Message/Effect/Node types to isolate the source analyzer inside the nested module; the positive fixture check uses the repository’s real types and source files.

## Encoder boundary finding and repair

The preserved pre-codec run at `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/numeric/pre-codec-repair.json` exposed a mismatch. For `TypeInfo` ID `int`/`uint`, 64 bits, and `JSRepresentation: number`, native `EncodeValue` accepted `9007199254740992` (and signed `-9007199254740992`) as decimal text, while generated JavaScript rejected those Number values. N2 changed `compilercontract/value.go` to enforce the safe Number range.

The final run confirms that both encoders accept signed `±9007199254740991`, reject signed values just outside that range, accept unsigned `9007199254740991`, and reject unsigned `9007199254740992`. For `int64` and `uint64` with BigInt representation, both encoders preserve the full-width maxima as `9223372036854775807` and `18446744073709551615`.

## Pre-repair evidence and limits

N2’s retained red source test is `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/analyze/numeric_security_test.go`. N2 reported that this pre-fix command failed on `state.Mutated++`, `state.Add += 9007199254740991`, `state.Subtract -= 9007199254740991`, and `state.SwitchOr++`, while the bounded `state.Safe64++` control did not fail:

```text
GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 ./analyze -run TestLoadSourcesAndAnalyzeRejectsUnsafeIntegerSource -v
```

N2 did not retain a separate stdout/stderr file for that run; the source repro and N2’s contemporaneous result summary are the available pre-fix record. My first attempt to run the owned harness occurred while the analyzer and contract constants were temporarily out of sync; its compile error is preserved at `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/numeric/pre-repair.stderr.log`. It did not produce an independent pre-fix false-accept trace. The later pre-codec JSON and `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/numeric/post-analyzer-pre-codec-repair.json` are preserved separately from the final run.

The final check does not prove all Go arithmetic, all control-flow combinations, or every helper/dataflow pattern. The two false rejects above are evidence that the gate is conservative and incomplete; future operation support should retain that fail-closed behavior until it has range proofs.

The completed XR-A-ABI receipt was left untouched. Its `native_result` field contains only the first 32 hex characters; the actual SHA-256 for `toolchain/probe_counter/results/native.json` is `3b34fc0e46e4122e033a6baf460438d4a4467293216b22064e670914038e63a4` (64 hex characters).

## Commands and source hashes

Final independent command, run from `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/`:

```text
GOTOOLCHAIN=go1.27.3 PATH=/tmp/gondola-go/bin:$PATH /tmp/gondola-go/bin/go run ./coordination/reviews/numeric/run_probes.go -mode=post > coordination/reviews/numeric/final-full-check.json 2> coordination/reviews/numeric/final-full-check.stderr.log
```

It exited 0. N2 separately reported its focused codec regression command passed:

```text
/tmp/gondola-go/bin/go test -count=1 ./compilercontract -run 'TestEncodeValue(MatchesNumberAndBigIntIntegerABI|PreservesFullWidthIntegersAndRejectsNonFiniteFloats)' -v
```

| File | SHA-256 |
|---|---|
| `analyze/analyze.go` | `28270a69953b8a65d797b0187ca64cd50f48693a5cf283d9cd5edf16841f19c5` |
| `analyze/project.go` | `32a2c6cee4d3a84a83d76733343f49c061910e3b6329d7fd153a1979a400868a` |
| `analyze/numeric_security_test.go` | `656f6c4d6f47941f05e307214b238d0a5c0fb2dd4899b1cc8013bc528532f609` |
| `compilercontract/value.go` | `e6f26347e56d8bd97f4802dff206489ed3901082525a2b4c7497fe0811c71a1f` |
| `coordination/reviews/numeric/run_probes.go` | `e57902ff2fb1c1b6fb69e442cc9b35d2fff17f11517027201410bf5f49853a9c` |
| `coordination/reviews/numeric/final-full-check.json` | `68914c08fcb4b02f063ffc717a539eae9728e2d00131ac4b0b97bf9e5d7d73f6` |
| `coordination/reviews/numeric/pre-codec-repair.json` | `2c66f363b2a5c8c670fb071153ebc3858c6cf320b626c726c71ebca414edc227` |
| `coordination/reviews/numeric/post-analyzer-pre-codec-repair.json` | `958fe1aeff8eb3f0290f6d12b026034c943ad6676fef145c89b451e49941e7fc` |
| `toolchain/probe_counter/results/native.json` | `3b34fc0e46e4122e033a6baf460438d4a4467293216b22064e670914038e63a4` |
