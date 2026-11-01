# E-ORACLE — independent compiled-module effects oracle

**Worker:** N5  
**Job:** `E-ORACLE`  
**Outcome:** `mixed_change`  
**Repository base:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Oracle implementation

Added an independent transition model and fail-closed capture checker in `compiled-module-effects/oracle/oracle.mjs`, with focused tests in `compiled-module-effects/oracle/oracle.test.mjs`. The model regenerates the pinned literal and seeded intent streams and derives each keyed parent/child state, view tree, Go message, request ID, token, effect, transport outcome, cancellation, and retired generation without using the native replay to compute expected transitions.

The checker verifies all native full-state snapshots and typed effects, then compares the same expected replay against five host captures: `direct.react`, `direct.dom`, `browser.react`, `browser.dom`, and `browser.swap`. It checks full parent/controller/child Go state, input/publication projections, Go View trees, per-key pending requests, correlations, message routing, and independent renderer epochs. For browser captures it parses the recorded live `innerHTML` into a normalized tree and checks every wrapper, Go View node, attribute, and text node; it separately checks actual controls, disabled state, connection, and click callbacks.

The ordered host ledger checks that a Go request is recorded before commit/render and transport start; its request correlation is unchanged when a reply crosses a renderer swap. Replies with canceled or delivered correlations cannot call Go again. Removal checks Go unmount state and its declared cancellation before transport cancellation and renderer teardown. Pending sibling requests retain their own token and correlation.

Build admission independently checks all four actual module builds, keyed helper placement, ABI pins, the unchanged parent ABI comparison, the closed request/cancel descriptors, and the exact compiler toolchain. It requires the sole BigInt TypeInfo to be `uint64`/64-bit and limits that type to `State.Generation` and `State.RequestID`. For both compiled child backends, N5 also replays the ten mount-boundary cases through the loaded generated Update and encoder, checking each full state/effect step and exact uint64 decimal encoding within JavaScript’s safe-number range.

## Verification

The frozen N4 run completed with no browser page errors. N5 independently reopened its saved captures and the final build index and reran native, profile, and build-admission checks. The Node oracle tests passed 3/3.

| Scenario | Source events | Native states | Go effects | Transport rows | Lifecycle rows |
|---|---:|---:|---:|---:|---:|
| Literal | 31 | 32 | 10 | 20 | 5 |
| Seed 20261104 | 49 | 50 | 16 | 32 | 5 |
| Seed 20261105 | 50 | 51 | 17 | 34 | 5 |
| Seed 20261106 | 48 | 49 | 15 | 30 | 5 |

Across four scenarios, the native arrays contained 178 events, 182 states, 58 effects, 116 transport rows, and 20 lifecycle rows. The five profiles produced 890 event rows and 910 state snapshots. Each browser profile exercised 108 real `HTMLElement.click()` calls; 16 disabled clicks per browser profile invoked no callback. The actual Go transition/tree/DOM/control and transport arrays matched the independent oracle for all 20 profile captures.

Admission covered four independent builds (React and DOM parent/child pairs), two typed effect descriptors, five required capabilities, and ten boundary cases per backend. Both backends passed the compiled effect probe’s four observations: request r1, cancel r1, request r2, and unmount cancel r2; the probe recorded two unique descriptors and eight full state snapshots.

All 15 malformed-capture/admission controls were detected:

- Eight capture-level mutations: bypass Go cancellation; cancel the sibling’s pending request; accept a duplicate reply; accept a wrong reply tuple; accept an old-generation reply; mix renderer epoch into reply correlation; start transport before commit/render; call transport cancellation before retiring the correlation.
- Seven build-admission mutations: remove the cancel descriptor; remove the cancel capability; unadmit a backend; change a child package identity; remove a keyed helper; drop a source pin; change the child `uint64` representation to `number`.

These controls mutate saved capture/build summaries and confirm that the oracle rejects the altered evidence. They are not claims that the mounted host itself was fault-injected.

## Commands and pins

The mounted run used:

```text
/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/gondola/compiled-module-effects/conformance/run.mjs --native-go /tmp/gondola-go/go/bin/go --build-index compiled-module-effects/build/output/E-BUILD-final/build-index.json --chromium /tmp/chromium-portable --output ../module-effects-coordination/rawlogs/E-HARNESS/attempt-03/capture
```

N5’s independent replay and controls used:

```text
/tmp/gondola-node22/node_modules/node/bin/node ../module-effects-coordination/rawlogs/E-ORACLE/final/independent-check.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-module-effects/oracle/oracle.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-module-effects/oracle/oracle.mjs
```

Versions: Node `v22.23.4`; root Go `go1.24.0`; compiler Go `go1.27.3`; GoScript `v0.6.2`; esbuild `0.28.2`; Chromium `153.0.8010.0`; Playwright `1.64.1`.

Key pins:

- Build index: `70046a0e7f1070c3ec2ad2186e060137a77f2d8df02b5c23bb1760baf156c444`.
- N4 capture summary: `ef336f8b37a8d19980ec6cd230efcfb186890d41cabb9fb3f65a6656a8bbffb4`.
- Oracle source: `2c9072dbd7dcbe70a009798ef441e1080e553dfe3eab9959b1ab15e0fecdb763`.
- Oracle tests: `b06fcb29908a19dc98d54e1c78f8b35f8e2044f67c18a60bea2a2d0399c84892`.

The independent-check raw output includes per-scenario/per-profile array counts, artifact hashes, full compiler source pins, admission results, and every rejected mutation path. The receipt records owned-source hashes and dependency pins.

## Evidence limits and preserved failures

The transport is a deterministic deferred manual queue, not real HTTP. Browser actions use actual DOM `HTMLElement.click()` but do not establish trusted pointer or OS input. The browser matrix does not exercise synchronous transport start or synchronous cancellation callbacks; the host’s separate N3 unit evidence covers synchronous reentrancy. N5 checked the recorded retire-before-`transport.cancel` order in every profile.

No full repository test suite, demo timer, or full application deployment was run by N5. The captured literal/seeded matrix and compiled boundary replay are scoped to the frozen fixture. The reply payload remains the opaque request token echo used by the Go fixture.

The rawlogs preserve N5 author-preflight failures caused by incorrect relative paths in temporary replay scripts, the first admission run’s toolchain-prefix mismatch, N4 attempt-01’s toolchain check, and N4 attempt-02’s pending/nativeExpected shape mismatches. The corrected final attempt-03 and independent-check runs passed; the failures did not change production sources. No Git or scheduler mutation was made by N5.
