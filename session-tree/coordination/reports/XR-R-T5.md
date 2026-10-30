# XR-R-T5 — independent review of the oracle correction

## Decision: accepted

The R-T5 checker correction matches the assigned frozen source hashes and closes the reviewed oracle gaps. I independently reran the 34 Node tests, the external browser blur probe, and read-only checks of the fixed replay summary and its raw shards. No implementation files were changed. This accepts the scoped XR-T5 correction; it does not accept the full default replay or CI chain.

## Findings verified

- **Observed cancellation invocation order:** each side has a shared monotonic clock recorded by the actual transport `start`, `cancel`, and callback-delivery methods. Actor validation requires the channel on both actors, contiguous sequence numbers, and the correct per-actor provenance. Cross-actor comparison removes only the `side` label after this validation. For disposal, the checker compares the observed synchronous invocation delta to cancellation commands derived from the Go snapshot in independently derived postorder, including command order. The synthetic postorder witness remains separate from transport calls.
- **Negative controls:** the cross-session cancellation reorder is detected while the captured local transport histories, Go bundles, and native frames remain unchanged. Add-at-cap, Reset-empty, and Up-first-row mutations each fail with the corresponding model-derived disabled-state finding on both actors and no unrelated findings. Missing global invocation channels on both actors fail closed.
- **Recreated-tree stale callback:** the fixed 18-action witness disposes the old orchard/fruit/seed family, mounts the same aliases again, then delivers retired seed request 1 before the new seed issues request 1. Both actors identify retired session 13/generation 1 and current session 16/generation 2, with orchard/fruit/seed sessions 14/15/16 live. The current seed has no request 1. The complete active arrays, including each live session's snapshots and audits, and the manager tree are unchanged by the callback.
- **Immediate focus capture:** the fixture captures focus synchronously after each side's action before switching documents. The unchanged external blur probe injected one blur after replacement and the checker reported `parity.root.inputs`, `parity.root.focus`, and `replace.focus-selection`.

## Verification

Assigned source hashes match:

| File | SHA-256 |
| --- | --- |
| `session-tree/check.mjs` | `60cc9e94481f557e5d27935097e2b0d75db6830c50b001298495a49cd6619109` |
| `session-tree/check.test.mjs` | `b3c9c0d2b06a7534d316162dacf27c7e5f3be3255b792fa7d7dbb3c67196606c` |
| `session-tree/fixture.mjs` | `4ca46fed7cf88b7eb92db8dc8b2133f0c267b27d2686a912cb8344e6afa3bf5d` |
| `session-tree/fixture.html` | `556867d0f6b93aae63ab23e702f398e37a60a09b1a45b34c064276dc1086e885` |
| `session-tree/scripts.mjs` | `17707f0ca1b6147a25cd6a121e444189900f5b06ed512906d43766cda0e01631` |
| `session-tree/scripts.test.mjs` | `ed2588447d2de094694c1b50324875c238aa27e1a840d248658b6f313f7a18b8` |

Commands rerun independently:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
  CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  GO_COMPARE_BIN=$PWD/session-tree/build/compare-interaction \
  node --test session-tree/*.test.mjs
# 34 passed, 0 failed

PATH=/tmp/gondola-node22/node_modules/node/bin:/tmp/gondola-go/bin:$PATH \
  CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  node session-tree/coordination/probes/focus-loss.mjs /tmp/accept-xrrt5-focus-negative.json
# injected=1; mismatchCount=3; fields include inputs, focus, and replace.focus-selection
```

The corrected fixed replay artifact `session-tree/build/replay-rt5-fixed2.json` has SHA-256 `1fbb9c06e268da215325fa200333b0e7e392d3cfeaa37df0d51295eede904eac`. Its status is `matched`: 68 actions, 71 ticks, 232 observations per actor, 15/15 native comparisons, and zero mismatches. The cancellation-order negative control is detected; all three disabled-control negatives are rejected bilaterally. I recomputed the hashes for all 3 scenario shards and the 1 focus-negative shard; each matches its summary pin. The mismatch artifact is the empty three-byte JSON array with SHA-256 `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`.

The fresh root run at `session-tree/build/replay-accepted.json` was not available during this review: the observed process had ended without creating that artifact, and its redirected log contained only the Node proxy warning. The existing `replay-default.json` predates R-T5/R-T4B and records 27/21/16 fixed actions, so I excluded it. The fixed replay used zero generated cases; this review does not claim the new default seeded replay, integrated runner, or CI passed.
