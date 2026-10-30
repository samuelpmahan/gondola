# R-T5 — replay checker repair and focused acceptance evidence

**Outcome: mixed change.** The XR-T5 gaps were repaired in the checker/fixture-owned files and the fixed actual-browser replay now passes. The default seeded replay and integrated runner remain pending root execution; this report makes no default-run claim.

## Changes and required channels

The per-side fixture records one globally sequenced transport-call log for each script. Events distinguish synchronous `start`, `cancel`, and callback delivery invocations and retain `sessionID`, renderer `generation`, `hostGeneration`, and `requestID` scope. The sequence resets at a new script, keeping the evidence bounded without erasing retired aliases within a script. Each actor’s channel is required and validated for contiguous sequence, correct side provenance, positive identifiers, scoped starts, and delivery/cancel ordering. Cross-actor parity projects away only `side`, which is provenance metadata; it still compares the ordered calls and all semantic fields. Local per-transport histories remain separately captured.

For each dispose result, the checker compares the actual synchronous cancellation-invocation delta against the independently derived Go postorder bundles, including session order and command order. The synthetic `derived-postorder` witness remains distinct from actual transport calls. The negative control swaps two cross-session cancellation identities in the global call trace while leaving per-transport histories, Go bundles, and native frames unchanged. It produces both `parity.transport-invocation-order` and `dispose.cancel-invocation-order` findings. Missing global transport channels on both actors fail closed.

Disabled state is derived independently from the Go snapshot: Add is disabled at four rows, Reset at zero rows, and Up on the first row; existing Save and Cancel checks remain. Three bilateral negative controls change the matching disabled observation for both actors and recompute the DOM disabled-path witness. Each is rejected on both sides with only the expected state-derived findings.

The T4B recreation schedule is fixed and checked. It retires orchard/fruit/seed, recreates the aliases, and invokes the old seed request 1 before the new seed has issued request 1. In the browser trace, the retired seed is session 13/generation 1/host generation 1; the current seed is session 16/generation 2 and has no request 1. The candidate and reference each preserve the complete current tree and active state/audits across that stale callback: orchard 14, fruit 15, seed 16 remain live with empty rows, and the callback reports no error. Fixed counts are 29/21/18 actions (68 total).

## Verification

Toolchain: Go `go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`; the comparison binary is the report-pinned `session-tree/build/compare-interaction`. The fixed replay used no generated cases (`--cases 0`) and ran in real Chromium against Go/WASM candidate and the independent React reference.

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
  node --test session-tree/check.test.mjs
# passed: 12 tests, 0 failures

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
  CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  node --test session-tree/*.test.mjs
# passed: 34 tests, 0 failures

PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
  CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
  GO_COMPARE_BIN=$PWD/session-tree/build/compare-interaction \
  node session-tree/check.mjs --cases 0 \
    --output session-tree/build/replay-rt5-fixed2.json
# matched: 68 actions, 71 global ticks, 232 observations per side,
# 15/15 native comparisons, 0 mismatches
```

The built-in collapsed-caret focus-loss negative control was detected with the expected focus/input/selection findings and one matched native segment. The cancellation-order negative control was detected without changing local transport histories, Go bundles, or native frames. Add-at-cap, Reset-empty, and Up-first-row negatives each produced the expected findings on both actors and no unrelated findings. The checker tests also cover missing transport/focus channels, provenance labels, disposal order, full mismatch/raw-shard retention, and fixed schedule bounds.

The first R-T5 fixed run is preserved at `session-tree/build/replay-rt5-fixed.json`: it reported 36 checker findings (33 were parity comparisons of the expected `reference` versus `candidate` provenance label; the remaining three were disabled-negative controls contaminated by that same parity finding). The fixture observations and native comparisons matched. The repair projects away only that provenance field for parity and retains strict per-actor side validation; a regression test verifies both behaviors. The corrected result is `session-tree/build/replay-rt5-fixed2.json`, SHA-256 `1fbb9c06e268da215325fa200333b0e7e392d3cfeaa37df0d51295eede904eac`, with an empty full mismatch artifact (SHA-256 `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`).

All raw fixed scenario shards and the focus negative-control shard are retained under `session-tree/build/`; the summary records paths and hashes. Fixed shard hashes:

| Scenario | SHA-256 |
| --- | --- |
| `000-nested-postorder-cancel-and-sibling-isolation.json` | `e0f3d5288b2bd9ca612c5f9b322ac34cee70c85a2f1e0f0e5c55f1f6a83821dc` |
| `001-nested-renderer-changes-preserve-child-dom-and-focus.json` | `af957ee73d0a6eaea69f5a03cfc12c9041ebbf990ed42536a108cd4bd7c0ab24` |
| `002-dispose-fences-late-replies-and-allows-parent-recreation.json` | `33a107b71e3c85bc9547126f29801ea981afe9c9fabda6d07e556e02c0734452` |
| focus-loss negative `000-focus-loss-negative-control.json` | `5d7a26c064f89995368de730717d619341d3ca442109f322857665990c37d942` |

## Source pins and limits

| File | SHA-256 |
| --- | --- |
| `session-tree/check.mjs` | `60cc9e94481f557e5d27935097e2b0d75db6830c50b001298495a49cd6619109` |
| `session-tree/check.test.mjs` | `b3c9c0d2b06a7534d316162dacf27c7e5f3be3255b792fa7d7dbb3c67196606c` |
| `session-tree/fixture.mjs` | `4ca46fed7cf88b7eb92db8dc8b2133f0c267b27d2686a912cb8344e6afa3bf5d` |
| `session-tree/fixture.html` | `556867d0f6b93aae63ab23e702f398e37a60a09b1a45b34c064276dc1086e885` |
| `session-tree/scripts.mjs` | `17707f0ca1b6147a25cd6a121e444189900f5b06ed512906d43766cda0e01631` |

The fixed replay exercised real browser DOM/React/Go-WASM behavior and the native comparator, but no generated seeded cases. The full default replay, complete `run-session-tree.sh` chain, inherited suites, and fresh CI remain pending root execution and reconciliation. Manual deterministic transports do not establish HTTP/network behavior; that is covered by the separate runner/smoke gates.
