# E-CI-GO — primary current-head Go and direct-module audit

**Outcome: `mixed_change`. Native/direct CI scope passed on the successful primary push artifact.** This audit closes the Go/native and direct-module lane for the published source checkpoint. It does not adjudicate the separate PR run or close the overall 26-job acceptance gate.

## Source and immutable workflow artifact

The artifact metadata binds artifact `13030848292` and job `124444234335` to successful primary push run `41169518187`, head commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, matching publication tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`. The retained archive is 11,460,089 bytes with SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`. The three retained chunks reconstruct that exact ZIP; its CRC check passed, and all 968 ZIP members and all 968 extracted files match their retained byte counts and SHA-256 hashes.

The attempt `attempt-20261031T044100445Z` reports mode `full`, status `passed`, and no failures. Its 17 recorded commands all exited 0; each stdout/stderr log hash matches the execution record. The method matrix status is `matched`, and source stability is reported throughout.

## Native Go and direct-module evidence

The methods runner has 188 source pins in each of its before, after, and final sets. All pins resolve to the published source checkout or generated files in the retained artifact; the three sets are identical. All 149 post-check output pins also match, with 145 resolving to artifact outputs and four to published source files.

The typed method AppIR is identical across React and DOM builds. Its 15 symbols, receiver signatures, and call graph match the frozen method contract. The fixture state uses nested `counter.State` values with `float64` counts, plus `bool` and `float64` fields; the AppIR advertises `numeric.float64`. The native and direct-module traces are equal at 19 ticks and match all 18 fixture expectations for typed state, messages, dispatch IDs, effects, and views. Their shared trace SHA-256 is `d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`.

The direct emitted-module probes record 14 enabled updates. Each retained input remained unchanged and each returned state matched its expected value. Both `PublishSaved` witnesses preserve the original nested parent count while returning the updated value. The two direct read-only update probes (`childAdd` and `childReset`) leave the original and returned state unchanged and request zero effects.

I reran the exact archived native binary against the archived React AppIR and published fixture, and reran the archived emitted module and encoder through the pinned direct replay entry point. Each exited 0 and reproduced its retained trace. The ZIP stores the native executable as mode 0644; the replay used a temporary byte-identical copy with mode 0755. The direct replay emitted Node's experimental `EnvHttpProxyAgent` warning on stderr; it exited 0 and the trace matched.

## CI commands and tool identities

The actual method Go test command was `go test ./fixtures/compiled/methods ./cmd/compiled-native` with exit 0. The fixture package reported `[no test files]`; `cmd/compiled-native` reported `ok` (cached). The separate native build command `go build -o …/compiled-native ./cmd/compiled-native` also exited 0. The run's compiled-methods owned Node tests reported 10 passed, 0 failed.

Artifact-recorded identities are Node `v22.23.4`, root/native Go `go1.24.13 linux/amd64`, compiler Go `go1.27.3 linux/amd64`, Chromium `156.0.8078.4`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, and esbuild `0.28.2`. The audit ran with Python `3.12.14`.

Audit command: `python3 compiled-methods/ci/2026-10-31/lanes/go/audit_current_ci.py` (exit 0). It verifies provider metadata and retained archive integrity, source/output pins, typed trace and method-contract expectations, Go value-semantics evidence, command log digests, and fresh native/direct replay. Raw replay stdout/stderr and the machine-readable result are retained under `lanes/go/current-ci/` and `lanes/go/current-ci-audit.json`.

## Acceptance boundary

This is acceptance of the Go/native/direct-module lane for primary push run `41169518187`. It does not establish the separate PR run `41169522175`, all remaining workflow jobs, or global PR readiness. At the latest root snapshot, two PR jobs remained pending (24/26 green); the overall gate therefore remains open. The prior source-`8ed` artifact remains a verified historical failure due to final provenance-path mismatch and is not used as current acceptance. Local M0 and methods-only evidence is not substituted for this successful CI artifact.
