# E-COMPILER command attempts

All successful results listed in `coordination/reports/E-COMPILER.md` were rerun and retained with logs.

- Initial `go test ./analyze` failed because the new boundary test expected the phrase `implicit pointer method adaptation`; the analyzer correctly emitted `pointer method receiver`. The assertion was corrected to match that explicit fail-closed diagnostic, and the fresh analyzer suite passed.
- Initial `go test -race ./analyze` reported `-race requires cgo`. The next attempt set `CGO_ENABLED=1` but supplied a PATH without `/usr/bin`, so cgo could not find `gcc`. The final race command included `/usr/bin:/bin` and passed.
- An initial `go run ./cmd/gobi-build` invocation supplied no stdin and returned the expected `decode build request: EOF`. Requests were then written to the retained React and DOM request files; both CLI builds returned `ok:true`.
- `go test ./...` from `compiled-frontend` remains failed at the archival `coordination/reviews/xr_r_abi_codec/source-snapshots` package (`TypeInfo`, `indexTypes`, `validJSRepresentation`, and related names undefined). The archive path is byte-unchanged from base `195c9433179218348d4b9f2477ae1e0725337d15`; see `archive-source-unchanged.log`. The live compiler package set passes.
