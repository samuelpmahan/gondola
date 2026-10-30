# XR-E5 — Independent four-actor checker review

Status: **PASS after the witness amendments**. The original fail-open counterfactuals and both rounds of browser-normalization false positives are preserved. The E5 owner amended the checker and tests; independent probes now verify the corrected focus and text-input rules, while preserving missing-focus, wrong explicit direction, and no-op action checks. The fresh full replay remains root-owned. No E5-owned source was changed by this review.

## Scope and current verification

Reviewed `check.mjs`, `check.test.mjs`, `harness.mjs`, `adversarial.mjs`, the native `CompareInteraction` path, and the archived positive evidence. Four separately initialized Chromium pages run the independently mounted React reference and three Go candidates. The same action is sent to all four pages, each tick preserves actor-specific observations, and cleanup disposes actors and closes contexts in `finally` paths.

Commands run against the frozen repaired source:

```text
/tmp/gondola-node22/node_modules/node/bin/node --test renderer-conformance/*.test.mjs
# 36 tests passed, 0 failed

/tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/coordination/reports/diagnostic-XR-E5-probe.mjs > renderer-conformance/coordination/reports/diagnostic-XR-E5-probe-recheck.json
# exit 0

CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GO_BIN=/tmp/gondola-go/bin/go \
  /tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/check.mjs \
  --cases 0 --output /tmp/xr-e5-independent-fixed.json
# exit 0: 11 scripts, 125 observations, 33 native comparisons, zero mismatches (first repaired version)
```

The independent 11-script fixed replay passed before the later normalization-only witness changes. It had 375 Go contract snapshot observations, 56 unique snapshots, and 319 cached duplicates. All 11 adversarial probes passed. Chromium was 153.0.8010.0; Node was v22.23.4; Go was 1.24.0. The result JSON SHA-256 was `0f796b02c6de07f79d5576545ddbfee62bad04b07aeb859d69adf66b459db4b0`. The latest source was independently checked with the 36-test suite and focused counterfactual probe; the full browser replay is being run by root.

The original author replay (`author-full.json`, 71 scenarios / 1,184 ticks / 213 native comparisons) predates the checker repair and is not treated as verification of the amended checker. The first full replay after the fail-closed changes exposed 160 false-positive witness mismatches: 120 collapsed-range direction reports and 40 text-input CR/LF cases. After the first normalization repair, another replay exposed 12 false positives for an unspecified (`none`) selection direction on noncollapsed ranges. Both failure archives are retained as `full-witness-normalization-failure.tar.xz` and `full-undirected-selection-failure.tar.xz` under `renderer-conformance/evidence/`. The checker now asserts direction only when a noncollapsed action explicitly requests `forward` or `backward`; noncollapsed actual directions still require actor parity. Text input expectations remove CR/LF only, preserving spaces. The root owns the final fresh full replay and requested no duplicate browser replay from this review.

## Repaired counterfactuals

The initial probe is preserved at [diagnostic-XR-E5-probe-initial.json](diagnostic-XR-E5-probe-initial.json), and the latest result is [diagnostic-XR-E5-probe-recheck.json](diagnostic-XR-E5-probe-recheck.json). It verifies:

- Removing `audit`, `transportLog`, `serverRequests`, `pending`, `dom`, `liveProps`, or `runtimeCalls` from all four actors is caught by required observation-shape validation.
- Setting focus to null for all actors after explicit focus is caught by the required logical key/selection witness. A pre-focus focus difference remains intentionally ignored.
- Collapsed selection direction differences are accepted, while a wrong logical key or range is still caught. Requested indices clamp to the pre-action controlled draft length. An explicit noncollapsed `backward` request reported as `forward` is caught; a noncollapsed request of `none` accepts Chromium's `forward` default, while actual noncollapsed direction differences across actors remain caught.
- A text input value containing LF is checked after browser line-break sanitization; leading spaces are preserved, and a counterfactual that trims them is caught.
- A synchronized `add` with unchanged observations is caught. Per-action delivery receipts are correlated with candidate Go `dispatch` call counters, pre-action handler registration, disabled-target state, and the action message plus legitimate trailing `reply` messages. Raw dispatch is routed through the counted runtime.
- Empty/effectively empty native `State`, `Tree`, `DOM`, or noninitial action steps across every actor are rejected before the comparator runs. Native frames must match their browser observation and expected action tuple. Individual `Index`, `Step`, `State`, `Tree`, and `DOM` mutations are caught.
- A supplemental native `Bindings` mutation is now rejected by browser-frame correlation. The Go comparator itself still compares only index, step, state, tree, and DOM at `SameDOM`; it deliberately ignores mutation counts and does not establish pixel equality.
- Missing actor, duplicate lane, a single-channel mutation, missing action tick, missing adversarial probe, and incomplete/failed/duplicate candidate-comparison sets are all caught.
- Go CLI admission rejects an invalid candidate snapshot, missing candidate snapshot, and unavailable CLI. Three byte-identical snapshots result in one validation and two cache hits.

`requireNativeComparison` accepts only one matched `dom`, `react`, and `godom` comparison per script. `addNativeComparisons` also rejects malformed native projections rather than handing them to a pairwise comparator where shared emptiness could pass.

## Original findings and repair disposition

The pre-repair probe found three green bypasses, recorded in the initial JSON and the original AMEND report:

1. Required observation fields could be absent from all actors and compare equal as `undefined`; all-actor null focus after focus was also accepted. The owner added required observation shape validation and an explicit per-actor focus witness.
2. A synchronized skipped event action could compare green. The owner added action receipts, dispatch counter checks, handler/message witnesses, disabled-target handling, and direct counted-runtime dispatch.
3. Mutually empty native traces could satisfy the native gate. The owner now validates native frame count, actor frames, indices, action steps, and native JSON/string projections against corresponding browser observations before comparison.

The repaired recheck changed all three original outcomes from `GREEN_BYPASS` to `caught`/`failed`, while preserving the baseline synthetic four-actor trace as matched. The latest targeted probe passes all original and browser-normalization counterfactuals. Root reports that offline replay of both retained 71-scenario traces against the final checker/native-frame validators produced zero mismatches; the new full browser replay remains root-owned.

## Other reviewed evidence and limits

- The E5 author report records 11 required adversarial probes: same-backend input identity through reorder/completion for all three renderers; all six directed renderer swaps with physical node replacement and focus restoration; detached GoDOM callbacks; disabled controls; stale path/key rejection; path reuse; invalid Go bridge calls; and pre-init protocol/version/capability rejection.
- The native archive lists 213 comparison inputs. The initial independent SHA-256 pass found no missing files or mismatches. Those archived inputs belong to the pre-repair full replay.
- Focus assertions begin only after explicit focus/selection actions. Browser and server cleanup, readiness failure reaping, fresh-layout HTTP startup, Go command fallback, and exact-snapshot cache behavior are covered by the 36 passing Node tests.
- This check uses Chromium and the loopback HTTP lab. It does not establish pixel equivalence, IME behavior, or behavior in other browser engines. The corrected full 71-script replay was not independently rerun here.

## Frozen source and diagnostic hashes

| File | SHA-256 |
|---|---|
| `renderer-conformance/check.mjs` | `a988db41a4bfa50aa1faf1f9236df48ec3507a4869c4b6fb1f813e6816e9429d` |
| `renderer-conformance/check.test.mjs` | `8c7b169bee52557fe2b62d4cf01586cbc236bd656c7d1c81f13ea89b430c2ee4` |
| `renderer-conformance/harness.mjs` | `79abd8650b42e497b7cb0924e7ee8270d9e213226a49ff5986918bf3a66aa107` |
| `renderer-conformance/adversarial.mjs` | `2e2ed4de8c862347d3410682bf0650465b4c796063e49833f198667ab91cff41` |
| `renderer-conformance/protocol.mjs` | `d54d1dbcea52683a88e42f1bce31df44533bbd3d678ede6b7f7d9a0266c53df9` |
| `cmd/compare-interaction/main.go` | `1eb5638ef0a93cdffcea3ec92b3637dfc4d1ef12632d0a08339ec07e682b3da6` |
| `gobi/compare_interaction.go` | `ee9c32eb30c8edd24a13acf2b4a4aac7d8c796ec8bc07637d7966f2ae20a65f7` |
| Initial counterfactual JSON | `a2b819156301430c50184cddc143d170ee437e2d3fa0c4fc2d31c8441d4b0ad1` |
| Recheck counterfactual probe | `4f4b1eae1d27d576a77a06afa62a99b8c365e95228edb30d3ee292771ada0fc6` |
| Recheck counterfactual JSON | `b219cd55551ba0ec130d81122fe6c840f6ba7552e1e486e68331a2ac5ffd523b` |
| Initial author full report | `7ae430554e0cab38c8b256983599d3268f77c0dde470920968d3cc0c59a4b9e5` |
| Initial full-run native digest manifest | `a5a5dfb7ef2bba8c008341ecfac6406dd7a6e279478db3663a814ed0eb6bff73` |
| Initial `XR-E5.md` before repair | `5a8c7c0bc5132f7efc1e258c321159649caab393536a4df8c6be605575fa6558` |
