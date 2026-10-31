# E-GO: Go contract and analyzer capability

## Change

Added the AppIR capability `effect.cancel`. The validator accepts it and keeps the existing duplicate and unknown-capability checks. The analyzer declares it only when an Update-reachable Go function constructs the actual `gobi.Effect` type with keyed fields `Kind: "lifecycle.cancel"`, `Name: "cancel"`, a string `Arg` expression, and `Reply: ""`. This supports helper chains and does not depend on an app or package ID.

Detection is intentionally static and fail closed. Computed kind/name/reply fields, positional composites, and descriptors returned by opaque external calls do not declare the capability; such code can still emit cancellation at runtime. The capability is a recognized-source signal, not proof that every emitted effect is cancellation-safe.

## Evidence

- `PATH=/tmp/gondola-go/bin:$PATH go test ./compilercontract` — passed.
- In `compiled-frontend/`, `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=go1.27.3 go test ./analyze` — passed.
- `git diff --check` — passed.
- An initial combined Go test from the repository root passed `compilercontract` but could not resolve `./compiled-frontend/analyze` because `compiled-frontend` is a nested Go module. Re-running from that module with Go 1.27.3 passed the analyzer suite.
- Full capability-milestone runner and integration remain pending; E-GO ran only its focused contract and analyzer suites.

Analyzer coverage includes the lifecycle fixture, a transitively reachable helper descriptor with unrelated decoy text, mismatched descriptor fields, an unreachable descriptor, and a computed kind field. Existing request-only and counter fixtures remain without `effect.cancel`. Contract coverage accepts the new capability and rejects its duplicate declaration.

## Scope

Modified only `compilercontract/**` and `compiled-frontend/analyze/**` for implementation and tests. No commit, merge, or deploy was performed.
