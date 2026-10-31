# XR--BUILD (N6 review of N4)

**Decision: amend.** The backend selection, emitter, manifest tagging, build outputs, and unsupported-backend rejection are sound in the reviewed scope. One public legacy-adapter boundary can panic on an unconfigured zero value; it regresses the prior error return.

## Finding XR-BUILD-01 — `GobiBackend.Emit` panics for its zero value

At [`backend.go`](/workspace/scratch/39a56936f173/gondola-backends/compiled-frontend/emit/backend.go:155), `Emit` rejects a nil receiver but then calls `backend.emitter.Emit(...)` without checking the emitter. `GobiBackend` is exported and `Name()` explicitly handles an unset emitter by returning an empty string. For `var backend gobi.Backend = &emit.GobiBackend{}`, `backend.Emit(gobi.App{})` passes the identity comparison because both `app` and the captured legacy value are zero, then dereferences the nil `emitter` interface and panics.

I reproduced this with the preserved review fixture at [`zero_backend_repro.go`](/workspace/scratch/39a56936f173/gondola-backends/compiled-backends/evidence/reviews/xr-build/zero_backend_repro.go). The pre-change `GobiBackend.Emit` at base commit `184ccdaabe9e6e46e1052ee79cd7e0be26fe3281` delegated to `Backend{}.Emit(backend.appIR)` after the same identity comparison; direct execution of that fallback returns an AppIR validation error and no files. The baseline `backend.go` SHA-256 is `c602d9d196f61c1717b1ca72e36e50f22dbd0a55c24d0c7cd5d9b585d30dfb9c`; the current file hash is `41c16e8fe42a4f9336f7860fc147bba283c068df3ac3fe2ece4f760103920468`.

The review scope remains read-only. The remaining R-BUILD gate should require `Emit` to reject a non-nil but unconfigured adapter with an error, plus a regression test.

## Verified behavior

- The build request decoder remains closed and rejects duplicate, unknown, missing, and trailing request data. `ValidateRequest` accepts only `react` and `dom`; the existing React adapter constructor still selects React by default.
- Both AppIR emitters validate input and share the exact same component-role metadata and Gobi node mapping. `NewGobiBackendFor` carries the selected emitter and retains the captured legacy `gobi.App` identity guard.
- I inspected the actual four-app output trees at `/tmp/gobi-e-build-cli-smnn3g0r/{react,dom}`: each contains 209 files and four matching app paths. Manifest tags are all `react` or all `dom`; AppIR, module paths, encoder paths, and role bindings match. All 204 non-manifest, non-bundle files are byte-identical. Raw bundled-module hashes differ and remain recorded; no bundle-normalization claim is made.
- I independently ran an unsupported `svelte` CLI request. It exited 1 with `ok:false`, zero apps and outputs, and `unsupported backend "svelte"`; the prior output marker remained unchanged.
- Focused Go tests passed fresh: `go test -count=1 ./emit ./build` with Go 1.27.3. The tests cover emitter parity, legacy identity mutation rejection, DOM manifest metadata, invalid AppIR rejection, and unsupported-backend output preservation.

Evidence and raw output hashes are in [`build-audit.json`](/workspace/scratch/39a56936f173/gondola-backends/compiled-backends/evidence/reviews/xr-build/build-audit.json).

## Limits

This review covers the Go build and emission lane. It does not accept the browser renderer-swap harness or full milestone; those remain with N3 and the integration gate. No production, shared contract, dependency, or Git files were edited during this review.
