# XR-G-SEMANTIC

**Decision: accept, scoped to N1’s compiler and atomic-build claims.** I independently rebuilt the CLI from the current 86-file N1 source checkpoint using Go 1.27.3 and the pinned GoScript v0.6.2. The build published and executed the actual GoScript-generated bundles: the forwarding Go code calls each original Go package, the emitted Update wrappers clone their value input, and AppIR role IDs resolve to callable Init/Update/View exports. The fresh manifest contains 209 files; all 209 output sizes and SHA-256 values match on disk.

## Pinned compiler API

The nested `go.mod` and `go.sum` pin `github.com/s4wave/goscript` v0.6.2. `go list -m -json`, the existing module-origin record, and `go mod verify` agree on the v0.6.2 tag at commit `d8f58a091947cff26a9171be7bd130892b0afad3`; module integrity verification passed.

The compiler’s public entry points are `compiler.NewCompiler` and `(*Compiler).CompilePackages`. `CompilationResult` exposes package path lists, diagnostics, and an optional async report. `PackageGraph`/`PackageGraphNode` expose package identity, file paths, and imports, while their typed package storage is private. `SemanticModelOwner.Build` returns `*SemanticModel`, but `SemanticModel` has unexported fields and no exported accessors. I found no public typed symbol/type/call metadata surface. The current frontend projects its own source AST and `go/types` results into its neutral typed program before using GoScript for lowering.

## Forwarders and emitted bundles

I built the CLI from the current nested module into a separate binary; its SHA-256 matches N1’s recorded build binary. I sent it the four approved entry packages and an isolated output path at `/tmp/gondola-xr-g-semantic-n5-20261030-2215/output`. The generated forwarder module is `gobi.generated/compiled` and uses a local replacement to the requested source root. Its five manifest entries are `go.mod` plus four `.go` forwarding packages. Each Go package imports its original app and directly calls that package’s Init, Update, and View functions.

The pinned compiler emitted 186 TypeScript files, including each forwarding package. In the generated TypeScript, `GobiCompiledUpdate` calls the original `Update((state).clone(), message)`. The generated `components.gen.mjs` files contain AppIR role metadata and no JavaScript role implementations. The bundled modules map each AppIR Init/Update/View symbol to those compiled forwarding exports.

My independent Node 22 audit imported each of the four bundles, checked all three AppIR role mappings, invoked each actual Init/Update/View export, and encoded the resulting state. All four Updates returned distinct Go struct values. For the actual counter `add` transition, the input stayed at Count 0 and the returned clone had Count 1. This exercises emitted GoScript output, not a hand-written JavaScript transition.

The fresh `BuildResult` and output tree both contain 209 files, including `buildmanifest.json`. I independently recomputed every file’s bytes and SHA-256; the complete output tree and the CLI inventory match exactly. The 209 files comprise 186 emitted TypeScript sources, five forwarding-module inputs, and the remaining 18 bundle, AppIR, encoder, and metadata outputs.

## Closed requests and previous-output preservation

The isolated successful CLI build exited 0 with four apps and no diagnostics. I then sent a valid request naming a nonexistent package to that same output path. It exited 1 with `ok:false`, `preservedPreviousOutput:true`, and an empty output inventory. After that failure, and after the malformed-request probes below, the prior 209-file tree still matched every hash and byte count from the successful result.

- A duplicate `backend` field exited 1 with `ok:false` and a `duplicate build request field` diagnostic.
- A request missing the required `backend` field exited 1 with `ok:false` and a `missing required build request field` diagnostic.

For these parse-time failures, `preservedPreviousOutput` is false because the CLI returns from `writeFailure` before entering `Build`/`Publish. The output path was nevertheless untouched; my post-probe audit confirms the same 209 hashes. I treat this as a parse-failure result-field nuance, not as evidence that output was replaced.

## Source and evidence checks

- All 86 files in N1’s `source-checkpoint.json` still match their individual hashes and the tree hash `900dc38eee351e745717136cb54ae26d0765ec53d25c2d99e226b2b4ee620f2b`.
- All 17 Go fixture/native source paths hashed by `G-FIXTURES.json`, including `counter/counter.go` and the form/list/effect implementations, match the current repository bytes.
- The fresh CLI was built from that same verified source tree. It uses the pinned compiler in `build/pipeline.go`, then records every staged output in `BuildResult.Outputs` before publishing.

## Limits and cleanup

This review verifies the public compiler boundary, generated forwarders, actual exported functions, and CLI output transaction. It does not establish complete Go language compatibility, full action-trace parity for the four applications, React DOM behavior, or browser conformance. The malformed-request `preservedPreviousOutput` field is only interpreted here as described above. The known React slice-proxy and runtime completion-admission issues belong to their separate review lanes and were not audited here.

My first draft of the independent output verifier assumed an untyped TypeScript function signature and stopped on that verifier assertion. I corrected the matcher for the actual typed signature and reran the full output audit successfully; the first-attempt stderr is preserved under my review lane.

I found one `fixture-scratch-*` directory containing the 22 `app.go` probes from my previous numeric harness and archived its contents to `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_g_semantic/prior-numeric-fixture-scratch-73224265.tar.gz`. A guarded removal initially left the numeric lane empty, but a later check found the same path, contents, and original timestamp back in place. No probe process is active; because the directory may have been restored by the concurrent XR-A-NUMERIC review, I left it in place and recorded the uncertainty rather than deleting it again.

## Independent evidence

The source/API checks and fresh CLI outputs are retained under `/workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_g_semantic/`, including `public-api-evidence.json`, `source-checkpoint-audit.json`, `app-source-audit.json`, request/result JSON files, and `audit-result.json`. The audit result records the output counts, role calls, clone observations, exit-status outcomes, and full 209-file hash verification.
