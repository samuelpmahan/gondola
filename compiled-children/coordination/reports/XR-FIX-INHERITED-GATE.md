# XR-FIX-INHERITED-GATE (N2): independent inherited-acceptance review

**Decision: `amend`.** The revised gate binds the actual inherited report, archive, manifest, snapshot, and current source bytes. One invocation-relative freshness gap remains: a timestamped attempt path may predate the invocation and still be accepted.

## Finding

`compiled-children/inherited-acceptance.mjs:25-36` validates the attempt timestamp only against `receipt.startedAt`, allowing it to be as much as 60 seconds earlier. The call at lines 139-144 first checks that `startedAt` is at or after the inherited invocation, but then calls `parseAttemptTime` without the invocation time. A minimally valid witness passed with an attempt path at `2026-10-31T12:00:01.000Z`, invocation start `12:00:01.001Z`, and producer `startedAt` `12:00:01.002Z`. Thus the attempt path predates the current invocation by one millisecond while the validator returns `passed`.

The reproduction is [N2-XR-FIX-INHERITED-GATE-invocation-freshness-witness.mjs](../rawlogs/N2-XR-FIX-INHERITED-GATE-invocation-freshness-witness.mjs); its captured output is [N2-XR-FIX-INHERITED-GATE-invocation-freshness-witness.log](../rawlogs/N2-XR-FIX-INHERITED-GATE-invocation-freshness-witness.log). The acceptance check should bind the attempt-path timestamp to the inherited invocation window as well as to `startedAt`.

## Verified gate behavior and producer compatibility

The positive path in `compiled-children/run.mjs:456-492` reads the canonical E-BUILD report and the archive, manifest, and snapshot from the receipt’s attempt directory, rehashes each declared `sourceBefore` path from the live workspace, and passes those actual bytes to the validator. The validator checks invocation-relative `startedAt`, finish ordering, sourceBefore/sourceAfter/current/pre-archive equality, artifact path/hash/byte lengths, manifest member equality, snapshot schema and state, and a successful full inherited lifecycle command. It does not use report prose as an acceptance signal.

The expected fields match the actual legacy producer in `compiled-capabilities/run.mjs`: it creates its attempt from `new Date().toISOString().replace(/[-:.]/g, "")` (lines 115-116), records the full-run receipt identity and timestamp (127-136), writes a pending immutable snapshot and its source-pin boundaries (994-1036), writes the manifest and archive into the attempt (1065-1117), hashes the report (1200-1204), and finalizes sourceAfter and archive-boundary equality (1267-1278). The report hash is present without a `bytes` field in that producer; the new validator correctly permits that shape while hashing the actual report bytes. The archive helper returns actual byte/hash data, and receipt archive paths, manifest paths, snapshot paths, member pins, and lifecycle command arguments align with the validator’s expected schema.

The archived E-BUILD author checkpoint currently in the workspace is not a passed full-run receipt and has no full-run attempt directory. Therefore this review confirms compatibility from the producer source and focused fixtures, but does not claim a successful real producer acceptance replay. The root full run must exercise that path after the timestamp check is repaired.

`compiled-children/run.mjs:77-107` explicitly source-pins both `compiled-children/coordination/rawlogs/go.mod` and `compiled-children/evidence-preflight/go.mod`, and `verifyRequiredInputs` requires both at lines 286-295. These nested modules keep preserved standalone Go proof files out of root package compilation while preserving their recorded `go run` invocation.

## Verification

- Node `v22.23.4`: `node --test compiled-children/inherited-acceptance.test.mjs` passed 11/11 tests.
- Go `go1.24.0 linux/amd64`: `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test ./...` passed with the preserved proof tree present.
- Go `go1.24.0 linux/amd64`: the recorded individual command `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./compiled-children/coordination/rawlogs/XR-GO-review-slice-history.go` passed.
- The freshness witness passed through the validator, demonstrating the finding rather than a production acceptance result.

Captured commands, stdout, and exit codes are pinned in `compiled-children/coordination/receipts/XR-FIX-INHERITED-GATE.json`.

## Scope boundary

This was a read-only review of production and runner source. No production source, Go module, Git state, or native scheduler state was changed. No full inherited run was launched. The review finding is limited to binding the attempt timestamp to the invocation window; the focused byte/source checks and Go package isolation passed.
