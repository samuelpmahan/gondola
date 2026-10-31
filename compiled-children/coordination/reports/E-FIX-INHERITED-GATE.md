# E-FIX-INHERITED-GATE (N1)

**Outcome: `mixed_change`.** Repaired the inherited E-BUILD acceptance gate to evaluate structured evidence from the actual producer receipt, report, archive, manifest, pre-archive snapshot, current source files, and invocation window. Added focused adversarial unit tests. Added a nested Go module boundary under canonical raw logs so root `go test ./...` no longer compiles preserved standalone proof artifacts together.

## Gate behavior

- `compiled-children/inherited-acceptance.mjs` isolates acceptance checks from the runner. It requires E-BUILD identity, a passed full run, all stages passed, no failures, `startedAt >= inheritedInvocationStartedAt`, a valid non-earlier `finishedAt`, and a timestamp-fresh attempt path.
- The validator binds actual report/archive/manifest/snapshot bytes and hashes to producer receipt declarations. It verifies archive inventory against the manifest and immutable pre-archive snapshot, and checks `sourceBefore`, `sourceAfter`, pre-archive pins, snapshot pins, and hashes of the actual current pinned source files for exact equality. It requires the recorded successful `run-compiled-lifecycle.sh` command.
- The runner captures the invocation start immediately before the inherited full command. Its full source pins include both nested `go.mod` boundary files. The ignored archive copy remains untouched.
- The full unit gate includes the new inherited-acceptance tests, shared N2 `no-wasm.test.mjs`, and N6 `conformance/swap-contract.test.mjs` alongside the host and children conformance tests. N6 test source SHA-256: `1dd0772388e37f220462e1d11e47251c9d497f3cbb9e360e22e67c79543f180f`.
- Mounted-browser and HTTP-smoke acceptance require observable WebAssembly guard coverage with status `complete` or `absent` and an empty failures list. Existing request/API-attempt zero checks remain in the smoke gate.

## Verification

No full inherited delivery run was launched. This change was checked with targeted commands only:

- Node 22 combined unit gate: **42/42 passed**, including the new validator tests, N2 no-WASM tests, N6 renderer-swap test, runtime tests, and children conformance tests. `CHROMIUM_PATH=/tmp/chromium` supplied the executable for the real Chromium cases.
- `node --check compiled-children/run.mjs`: exit 0.
- `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test ./...`: exit 0 after the nested module boundary was present.
- The preserved `XR-GO-review-slice-history.go` standalone proof still runs through `go run` and exits 0. Both preserved proof files retain their original hashes.

Command outputs and exit codes are recorded under [`../rawlogs`](../rawlogs/), including earlier failed attempts and corrected reruns. The first Go test red predates the nested module boundary and showed duplicate `main`/`reviewMaxSafeID` declarations from the preserved proof files. A subsequent red showed the copied archive preflight project lacked a module boundary; N5 supplied `compiled-children/evidence-preflight/go.mod` outside the archive tree, and I pinned it without editing it. An initial Go executable lookup used a nonexistent `go1.24` path; the final commands used `/tmp/gondola-go/bin/go`. These failures remain preserved.

## Pinned sources

- `compiled-children/run.mjs`: `deb687ae94cb58d7dab574c973a05d52b3adcb6bf68e70b0c49cdefd77a8eb4f`
- `compiled-children/inherited-acceptance.mjs`: `476757c84f2a793aa2af1561be3e5156b7ee28538428a5ccae0f82d498e566af`
- `compiled-children/inherited-acceptance.test.mjs`: `c4576f4a5f28298d45cea3fd00f6c42604b4ed65c0443e19559ee891f5b2cabb`
- `compiled-children/coordination/rawlogs/go.mod`: `0211d8a701a476a64da53627e42835c4de1475b5faf7ce029803288df6530964`
- N2 `compiled-frontend/conformance/no-wasm.test.mjs`: `529149d9856254bacb049032716e9c978d18dd62de4dec77005495790f49ad5e`
- N5 `compiled-children/evidence-preflight/go.mod`: `4fcd5b92e2ac509a4a3b99d776adef5df5d5003c199075d1e43060f55e1c6b90`
- N6 `compiled-children/conformance/swap-contract.test.mjs`: `1dd0772388e37f220462e1d11e47251c9d497f3cbb9e360e22e67c79543f180f`

No Git, scheduler, archived source, or full inherited-run state was changed by this packet.
