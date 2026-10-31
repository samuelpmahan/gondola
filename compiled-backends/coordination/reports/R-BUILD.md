# R-BUILD (N4)

**Outcome: mixed_change.** Fixed the zero-value panic at the public legacy `gobi.Backend` adapter boundary and added regression coverage. The configured React/DOM emitters and generated build output are unchanged.

## Change

`GobiBackend.Emit` retains its existing nil-receiver error and captured-identity check. After those checks, a missing emitter delegates to `Backend{}.Emit(backend.appIR)`, preserving the legacy zero-value behavior: the zero AppIR fails normal React-emitter validation and returns an error with no files. A configured adapter continues to call its selected emitter. This keeps the DOM selection path intact while avoiding a call through a nil interface.

The regression test covers both a nil receiver (existing error path) and a non-nil zero-valued adapter. It asserts no emitted files and checks that the zero adapter returns the same React AppIR validation error as the legacy fallback. Existing configured-adapter tests continue to cover successful output and rejection of identity drift.

## Verification

- Go 1.27.3, fresh focused packages: `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go test -count=1 ./emit ./build` from `compiled-frontend`; exit 0, both packages passed. Output is recorded in `evidence/repairs/build/go1.27.3-emit-build.log`.
- Go 1.24.0 root compatibility: `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go test -count=1 ./compilercontract` from the repository root; exit 0. Output is in `evidence/repairs/build/go1.24.0-compilercontract.log`.
- Re-ran the preserved XR zero-value reproduction from a temporary `.go` copy. It returned zero files and `invalid AppIR for React emission: schema must be "gobi.app-ir/v1"`, matching the preserved legacy fallback output; no panic. Output is in `evidence/repairs/build/zero-backend-repro-after.log`.

The four-app CLI builds were not rerun: this repair changes only the nil-emitter guard in the legacy adapter and does not change AppIR emission or build code generation. The build package tests were rerun. No dependency, lockfile, or Git operation was performed.

## Preserved review evidence

The XR--BUILD reproduction, audit, and before hashes remain unchanged. `evidence/repairs/build/xr-before.json` pins the base-commit backend hash, the pre-repair E-BUILD hashes, and hashes of the preserved XR reproduction and audit. The pre-repair reproduced panic is therefore retained alongside the post-repair result.

## Source hashes

- `compiled-frontend/emit/backend.go`: `b2486fff69d106a4801e5a5400c961b3b6ab55ff9be440dcbdec5a9631f3d3ed`
- `compiled-frontend/emit/backend_test.go`: `dc5c6a1ce143a1d79908eba2805879ff14d7f80d8d27e4ce650fccedf7e4c015`

The pre-repair source hashes are recorded in `evidence/repairs/build/xr-before.json` from the immutable E-BUILD and XR--BUILD receipts.
