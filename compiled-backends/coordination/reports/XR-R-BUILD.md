# XR-R-BUILD (N2 independent review of N4)

**Decision: accepted for the bounded zero-value adapter repair.** The added nil-emitter branch restores the prior legacy fallback behavior without changing the existing nil-receiver or captured-identity checks. The configured emitter path remains intact. Fresh focused Go tests and the preserved zero-value reproduction pass. This review does not claim a new four-app CLI rebuild or the separate N3 browser matrix.

## Review findings

In `compiled-frontend/emit/backend.go`, `(*GobiBackend).Emit` retains its nil-receiver return before any field access and retains the `reflect.DeepEqual(app, backend.legacy)` identity guard before emitter selection. The new `backend.emitter == nil` case delegates to `Backend{}.Emit(backend.appIR)`. That is the legacy default React AppIR emitter. For the zero-valued adapter, it returns the original validation error (`invalid AppIR for React emission: schema must be "gobi.app-ir/v1"`) and no files instead of dereferencing a nil interface. A configured adapter still calls its selected `AppIREmitter`.

The new `TestGobiBackendEmitErrorsForNilReceiverAndUninitializedAdapter` covers both the nil receiver and the non-nil zero value. Existing configured React and DOM adapter tests cover successful configured emission and rejection of captured identity drift. The preserved reproduction compares the zero-value result against a direct `NewBackend().Emit(compilercontract.AppIR{})` call; both return zero files and the same validation error.

The production repair is confined to the legacy adapter's missing-emitter fallback. React/DOM AppIR emission and generated output code are unchanged in this repair, so a fresh four-app CLI rebuild was not required for this review. The independently run `./build` package tests passed. N3 owns the active browser matrix.

## Independent verification

The preserved source fixture is [zero_backend_repro.go.txt](../../evidence/reviews/xr-build/zero_backend_repro.go.txt), SHA-256 `f5cd990adeb80587d8decbfd9fdf13e6f7e779cbb11499f6f99502668f083196`. I copied it to `/tmp/xr-r-build-repro/main.go` and ran it from the nested `compiled-frontend` module with Go 1.27.3; the copy was outside the repository.

| Check | Command | Result |
|---|---|---|
| Focused emitter and build packages | `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go test -count=1 ./emit ./build` from `compiled-frontend` | Go 1.27.3; passed, 0 failed |
| Root compiler contract | `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go test -count=1 ./compilercontract` from repository root | Go 1.24.0; passed, 0 failed |
| Preserved zero-value repro | `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go run /tmp/xr-r-build-repro/main.go` from `compiled-frontend` | Go 1.27.3; no panic, 0 files, same validation error as direct legacy fallback |

Logs and hashes are in [the independent review evidence directory](../../evidence/reviews/xr-r-build/). The initial fixture-copy attempt used a repository-root-relative path while the working directory was `compiled-frontend` and failed before execution; it made no repository changes. Repeating the copy with the correct `../compiled-backends/...` path and the same temporary destination succeeded.

## Limits

- No four-app CLI rebuild was run; code generation and the configured emitters are outside this guard-only repair. The focused build package tests passed.
- N3's four-app/five-fixture integration matrix is separate and remains owned by N3.
- No production sources, tests, contracts, dependencies, lockfiles, or Git state were changed during this review.

## Reviewed source fingerprints

- `compiled-frontend/emit/backend.go`: `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed`
- `compiled-frontend/emit/backend_test.go`: `dc5c6a1ce143a1d79908eba2805879ff14d7f80d8d27e4ce650fccedf7e4c015`
- Preserved reproduction: `f5cd990adeb80587d8decbfd9fdf13e6f7e779cbb11499f6f99502668f083196`
- Go 1.27.3 emitter/build log: `8d6e5822f7b79de38ec9d2d60e2598f490fd82b99ce40c10bd8cd967d082d6f5`
- Go 1.24.0 contract log: `10d168a6e7b0021bb267a4af76e0a663ad4fa02725f0b63efae617baf0e0f935`
- Reproduction log: `c2f3d092d410fc7564c5c7e13f071c481ceeafa7adfbe9cc0fd7c48f782da17a`
