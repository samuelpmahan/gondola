# E-HARNESS completion report

**Worker:** N4  
**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## Result

The publications conformance harness now replays the frozen typed-input/publication fixture through the fresh native Go trace, direct React and DOM compiled modules, and mounted Chromium React/DOM renderers. The fixed checker compares full typed states, Gobi view records, DOM projections, physical controls, event order, pending effects, renderer identity, and swap behavior against N5's independent literal expectations. The harness uses actual button clicks for scripted controls and does not contain an application state reducer in JavaScript.

The browser capture was compacted after E-HARNESS attempt 005 showed quadratic duplication. The profile's complete runtime trace is now captured once. Per-source-event records retain state/tick indices, physical DOM snapshots, pending effect keys, callback/action outcomes, and swap identity/fence evidence. Repeated cumulative traces, runtime snapshots, and effect histories were removed from event operations. `run.mjs` now uses the browser runner's single `.browser.capture.json` output for fixed and mounted-seed evidence.

## Validation

| Evidence | Result |
|---|---|
| E-HARNESS attempt 005, before capture compaction | Full runner `matched`; 50 source events, 45 Go updates, 46 state checkpoints; React, DOM, and swap profiles passed; 16/16 captured-data mutations were detected; all seven runner stages completed. |
| Fixed compact browser capture + fixed checker | `matched`; 50 events, 45 updates, 46 checkpoints in each of 3 profiles; all 16 mutation controls detected. Uses attempt 005's native/direct captures and fresh `react-proof`/`dom-proof` builds. |
| Compact mounted seed `20261031` + seeded checker | `matched`; 71 events, 70 Go updates, mounted `swap` profile passed state/tree/DOM parity. |
| Compact swap-only replay after the stale-reply fence assertion | Passed; 50 events, 46 trace ticks. |
| Portable Node tests | 5/5 passed; the native trace is spawned afresh by `check.test.mjs`, with a 128 MiB output buffer. |
| Syntax checks | `node --check` passed for `browser-entry.mjs`, `browser.mjs`, `check.mjs`, `check.test.mjs`, and `run.mjs`. |

The full-runner attempt 005 executed with Node 22.23.4 and Go 1.24.0. The focused compact validations used the same Node, Chromium at `/tmp/chromium`, and compiler proof builds. The final full runner was not rerun after the capture/output-path compaction; N6's delivery runner is the next integrated validation. This report does not claim final CI or release acceptance.

## Scenario coverage

The fixed literal scenario has 50 source events, 45 Go updates, and 46 state checkpoints. It exercises input-step and lock changes, locked-control suppression, publication value snapshots surviving counter edits, stale input revisions, out-of-order delivery, child and parent generation checks, key reuse, queue retention over remount, cancellation ordering, duplicate/malformed IDs, and pending effects through compatible and rejected renderer swaps. Fixed browser captures include 34 physical clicks per profile and two disabled-control attempts.

Seeds `20261031`, `20261032`, and `20261033` each replayed 71 source events and 70 Go updates in native and direct React/DOM modes in attempt 005. Only `20261031` was mounted in a browser; its swap profile was rechecked after compaction. The other two remain native/direct-only. The bounded schedule reaches eight live children and covers growth, duplicate/invalid add, pending reorder, removal/reuse, cancellation, remount, publication queue order, and a live callback after renderer replacement. This is reproducible bounded evidence, not a universal randomized-equivalence claim.

## Capture-size repair and preserved failures

The old attempt 005 fixed browser capture is 160,485,984 bytes and the mounted-seed capture is 135,394,686 bytes. The corresponding `.browser.json` files are byte-identical copies: each pair has matching SHA-256 (`10480e56…19302` fixed; `9f7b24f5…3e6f2` seed). These originals are preserved for root-managed archive/deduplication.

The compact fixed capture is 8,634,354 bytes; the compact mounted-seed capture is 6,816,769 bytes. The full fixed capture shrank by about 94.6%; the mounted seed capture shrank by about 95.0%. The complete old and new raw captures remain under `coordination/rawlogs/`.

Attempt history and corrections:

1. Attempts 001–002 used older `*-repaired` compiler manifests without the `effect.cancel` capability. Parent removal therefore failed host admission and later remount evidence was invalid. Attempts were preserved; subsequent runs use `react-proof` and `dom-proof`, whose AppIR declares `effect.cancel`.
2. Attempt 003 stopped at harness manifest preflight because the local manifest adapter omitted `componentId`; the adapter was corrected.
3. Attempt 004 reached checker mutations but the typed float mutation searched for kind `float`; compiled state encodes it as `float64` with `float64Bits`. The mutation now changes the actual encoded bits and is detected.
4. Attempt 005 passed the full pre-compaction runner, including seeds and 16 mutation controls.
5. Compact attempt 01 stopped because an overstrict local fence expected a canceled host reply to leave effect history unchanged. The host correctly records the rejected delivery while preserving Go trace, state, and pending tokens. The check now allows that history record and still verifies the trace, snapshot, and pending list stay fixed.
6. Compact attempt 02 passed all fixed browser profiles, the fixed checker, mounted seed checker, and unit tests. Compact attempt 03 passed the swap profile after adding an explicit pending-list equality assertion to the stale-reply probe.

## Reproduction

Full fixed plus seeded runner:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-publications/conformance/run.mjs \
  --native-go /tmp/gondola-go/bin/go \
  --fixture fixtures/compiled/publications/scenario.json \
  --expectations compiled-publications/oracle/expectations.json \
  --react-manifest compiled-publications/compiler/build/react-proof/buildmanifest.json \
  --dom-manifest compiled-publications/compiler/build/dom-proof/buildmanifest.json \
  --chromium /tmp/chromium \
  --output compiled-publications/coordination/rawlogs/<unique-attempt>/run
```

Portable focused suite:

```sh
GOBI_GO_BIN=/tmp/gondola-go/bin/go \
  /tmp/gondola-node22/node_modules/node/bin/node --test \
  compiled-publications/conformance/check.test.mjs \
  compiled-publications/conformance/seeded.test.mjs
```

`check.test.mjs` runs `go run ./cmd/compiled-publications-native --script fixtures/compiled/publications/scenario.json` from repository root and checks its output against the independent literal oracle. It does not depend on an author-side native rawlog.

## Pins

Harness source hashes:

| File | SHA-256 |
|---|---|
| `conformance/browser-entry.mjs` | `ee1a3f691287dcb502938c9dd822634207b68f9da2748325f5edc6ed5ba04732` |
| `conformance/browser.mjs` | `322cf204e3fd8beec8b70152521ddac0bdc966a913336576f8bf5979e9ccba5f` |
| `conformance/check.mjs` | `4f1b47b641617861f4ded1142a29a756035063d0fc677c5fad50f165a00414d0` |
| `conformance/check.test.mjs` | `f5479f37ea5b926cded6e6f15e0dca6b302f8a5b28fbb91c52e55b3ad198a281` |
| `conformance/direct.mjs` | `bacc757e6c85ed5c892b3260afb4f8d056bef7e73506c53adc5027659a4de078` |
| `conformance/run.mjs` | `c0431b550637d6feff9405a084188cc794fc235ca1d030bc517f2fa9b822d825` |
| `conformance/seeded.mjs` | `289dc3f5e8bb021aa277d00653b3bbe71c42014ec046334310a75e6c2e42bc61` |
| `conformance/seeded.test.mjs` | `45723d3ec9d148cc5c8a2af3edb95513c83a5da9105324ffe77107f88ce9eb52` |

Key independent input/build pins: fixture scenario `824240f36750c9806265edc4511143188d20e3d1ba0686cd37fe7cd996193819`; oracle expectations `b27821506c20b23f5eaa53be6f80d49d157c9d26db682d565604c6b70bfcf201`; native CLI `cmd/compiled-publications-native/main.go` `7fee0e56a8f9a0c411e2b3fa794f95744616f538cd15ffa7e5910d28a1d19302`; host runtime `runtime.mjs` `f496854ad89e8f2ee2b2fa6dc91daeaf81af7218427bd160b8b868f5e6319da0`; compiler source proof `f6604b31b7a7fadfb5ce9d7234070502ca800371a5b4e75db8b6f96817e04478`. Both proof AppIR files are identical at `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f`; React/DOM manifests are pinned separately in the receipt.

The contract is limited to this admitted typed Go profile, the shared compiler/runtime and the closed effect contract. It does not establish support for arbitrary Go graphs, other compiler engines, production transport/hydration/IME/concurrent-React behavior, or pixel/focus-identity parity. No production compiler or application reducer was added by N4.
