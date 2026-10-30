# XR-A-ABI

**Decision: amend.** The bounded compiler/runtime observations are supported by the current hashed probe outputs. Amend the older A-ABI report’s evidence notes: its 22-entry manifest and missing-input list are historical, and its statement that no analyzer range validator exists is stale against current source. Those corrections do not widen the ABI claim.

## Accepted observations

- The nested module pins `github.com/s4wave/goscript v0.6.2`; `module-origin.json` identifies commit `d8f58a091947cff26a9171be7bd130892b0afad3`. The probe records Go 1.27.3, Node 22.23.4, and esbuild 0.28.2.
- The pinned public compiler seam is `compiler.NewCompiler` plus `CompilePackages`. `CompilationResult` exposes package lists, diagnostics, and an optional async report. `SemanticModel` and its semantic records/maps have private fields; `SemanticModelOwner.Build` can return the model, but there are no exported semantic accessors for typed symbols, types, or calls. The public compiler API therefore supplies no usable typed IR. The focused runner emits TypeScript and executes it under Node; no WASM path or WASM output is evidenced in this probe.
- Raw emitted `counter.Update` mutates and returns its input. The compiled Go forwarding adapter calls `counter.Update((state).clone(), message)`; the recorded result leaves the caller at count 0 and returns count 1. The independent native/Node projections match for the checked counter, state-copy, slice, formatting, and `Node.Set` observations.
- The probe shows copied nested structs and fixed arrays, shared slice backing for element writes, and append reallocation for the sampled `[]Inner` and `[]float64` cases. Nil and empty non-nil slices remain distinct across six sampled element types. Float64 negative zero remains `8000000000000000` and formats as `-0` in the sampled calls.
- The negative integer evidence matters: narrower integer types wrap at the sampled width boundary, but emitted `int64`/`uint64` increment results exceed Go’s max and unsigned max instead of wrapping. Number-backed `int`/`uint` reach `9007199254740992`, outside the v1 safe-integer profile. The Node/native output records exactly two Go parity mismatches: `Int64` and `Uint64`.

## Current evidence and limits

The current `results/SHA256SUMS` has 28 entries. `sha256sum -c` passes all 28, and the read-only checker confirms the manifest exactly covers all 28 paths listed by the current runner. `manifest-history.json` preserves the prior manifest as `SHA256SUMS.pre-refresh`; the prior A-ABI report’s 22-entry and five-omission notes refer to that historical version.

Current `analyze/analyze.go` contains numeric-profile checks in `ValidateOperations`; this review did not test their soundness or completeness. The prior A-ABI statement that the current analyzer has no validator is stale. The separate A-NUMERIC adversarial audit remains the gate for deciding whether unsafe operations are rejected.

The stored probe reproduction command is `./toolchain/probe_counter/run.sh` from `compiled-frontend/`. I did not run it; the task directed reviewers not to rerun while N1 refreshed the artifacts. The review only rehashed and inspected existing files. This evidence does not establish every slice element type after append, all GoScript semantics, four-app builds, React/effects integration, or browser conformance.

## Recheck commands

- `sha256sum -c toolchain/probe_counter/results/SHA256SUMS` — exit 0; 28/28 entries verified.
- `python3 coordination/reviews/xr_a_abi/check_results.py` — 28/28 hashes match; runner inputs equal manifest paths; native/Node projections match; overflow mismatches are exactly `Int64` and `Uint64`; sampled clone, nil/empty, float, and GoSlice observations match.
- `rg -n 'WASM|WebAssembly|wasm' toolchain/probe_counter toolchain/probe_counter/results/emitted || true` — no matches.

Current manifest SHA-256: `e836493ee8811f285ade00af72df5c949c4ae3636e9a76527b2b616753db7d00`. Historical pre-refresh manifest SHA-256: `1df0acd14c811b88de67072bdcf6c2d97c29e25348a1fffa4bc0b562e5f7c3b4`.
