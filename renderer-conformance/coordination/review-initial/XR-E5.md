# XR-E5 — Independent review of the four-actor checker

Status: **AMEND**. The pre-policy full replay evidence and E5 author report are reproducible, but targeted counterfactuals found fail-open cases in observation completeness, synchronized action delivery, and native trace completeness. Findings were handed to the E5 author for repair; this review will be updated after an independent rerun.

## Scope and verification

Reviewed `check.mjs`, `check.test.mjs`, `harness.mjs`, `adversarial.mjs`, the native `CompareInteraction` implementation, and the recorded author/full and fixed-gate evidence. No E5-owned source was changed.

Commands run:

```text
/tmp/gondola-node22/node_modules/node/bin/node --test renderer-conformance/check.test.mjs
# pass 10, fail 0 (Node printed the existing experimental EnvHttpProxyAgent warning)

/tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/coordination/reports/diagnostic-XR-E5-probe.mjs
# exit 0; counterfactual summary is emitted as JSON
```

The independent probe built the real comparator with `/tmp/gondola-go/bin/go build -o <temporary-path> ./cmd/compare-interaction` and used the current Go contract CLI at `renderer-conformance/build/render-contract`.

The native-input digest manifest lists 213 archived native comparison inputs. An independent SHA-256 pass verified all 213 files with no missing files or mismatches.

Root reports the frozen pre-policy full replay as 71 scenarios, 1,184 ticks, 213 matching native comparisons, 3,552 Go contract observations (559 unique snapshots), 11/11 adversarial probes, and zero mismatches. Root also reports the post-policy fixed gate as 11 scripts, 125 ticks, and 33 matching native comparisons. The E5 author full-run command recorded in [E5.md](E5.md) is:

```sh
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GO_BIN=/tmp/gondola-go/bin/go \
  /tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/check.mjs \
  --output renderer-conformance/build/author-full.json
```

## Findings

### XR-E5-1 — Required observation channels can disappear from all actors

`compareObservations` compares values but does not validate that the required observation fields exist. If a field is missing on every actor, it compares `undefined` to `undefined` and passes. The diagnostic removed these fields from all four actors at one tick; every case produced zero mismatches:

- `audit`
- `transportLog`
- `serverRequests`
- `pending`
- `dom` (including raw HTML, controls, disabled paths, input path/value, and order)
- `liveProps`
- `runtimeCalls`

Likewise, changing `focus` to `null` for all four actors after an explicit focus action produced zero mismatches. A one-actor focus mutation was caught. Add required-shape checks for each observation, and require a valid focus/selection witness on the explicit focus tick for the target key and selection. Keep later focus comparisons active as the existing code does.

### XR-E5-2 — A synchronized skipped action can compare green

The diagnostic changed an action to `add` while leaving all four actors’ post-action observations unchanged. `compareEveryTick` returned zero mismatches because it checks parity and tick count, but has no action-delivery assertion. The harness currently captures `runtimeCalls` but does not compare or validate it.

Add a per-actor action-delivery check for Go runtime dispatches on app events, accounting for actions intentionally blocked by disabled controls. This should detect a lost `add`, `reset`, click, fill, or raw-dispatch even when every actor is skipped in lockstep.

### XR-E5-3 — Mutually empty native traces satisfy the native gate

The native gate correctly requires one matching `dom`, `react`, and `godom` comparison per script; deleting a candidate, duplicating one, or failing one comparison is rejected. Mutating one candidate’s `Index`, `Step`, `State`, `Tree`, or `DOM` is also caught.

However, the diagnostic set `State`, `Tree`, `DOM`, and every non-initial `Step` to empty/effectively empty values for **all** reference and candidate native ticks. `addNativeComparisons` returned `matched`. The Go comparator enforces pairwise equality and sequential indices, but does not require non-empty state/tree/DOM or verify action steps against the script. Validate each native tick against its corresponding browser observation and expected script action before invoking the comparator, and reject missing required semantic fields.

`Bindings` and other additional properties placed on the native JSON tick are ignored by `gobi.Trace` decoding; a mutated supplemental `Bindings` property still yields native `matched`. This is not itself a parity gap because those channels are compared from browser observations, but they must not be presented as channels verified by `CompareInteraction`.

## Areas that passed review

- Four separately initialized Chromium contexts are assigned to `dom`, `react`, `godom`, and `reference`. The reference mounts `mountCollectionReference` from the independent React bundle and its separate `createCollectionReference` model. The same script action is sent to every participant; an individual actor omission or duplicate lane is caught.
- A mutation to one candidate’s required snapshot, audit, transport, HTTP, DOM, properties, or focus channel is caught. A missing actor and duplicate server lane are caught.
- Go CLI admission rejects unavailable CLI status, missing candidate snapshots, and an invalid candidate snapshot. Three observations of one exact snapshot produce one unique validation plus two cached observations.
- `requireNativeComparison` rejects missing, duplicate, extra, and failed candidate records; `addNativeComparisons` requires exactly three results per scenario.
- The 11 adversarial probes exercise all three same-backend input-identity paths through reorder and held HTTP completion, all six directed renderer swaps with node replacement and logical focus/selection restoration, removed GoDOM callbacks, disabled controls, stale path/key rejection, path reuse, invalid bridge calls, and pre-init version/capability rejection.
- Readiness failure tests reap malformed, invalid-URL, silent, and unlaunchable HTTP lab children. Fresh-layout and Go path fallback tests pass.

The counterfactual action/native findings mean the E5 acceptance gate needs amendments despite the positive replay evidence. Actual native-platform dispatch remains a separate platform action.

## Hashes of reviewed inputs

| File | SHA-256 |
|---|---|
| `renderer-conformance/check.mjs` | `2fe467f501cc2722dd58fc87c401f655414b1ae409fef2c5766716b991675299` |
| `renderer-conformance/check.test.mjs` | `203b4f68ffde3f134c62eceb79f63c44ff5d441e7f98307e17b3361cb016ab04` |
| `renderer-conformance/harness.mjs` | `d76ca0487c4e8f2d3b018cf01f2dd69745abe8b90ac7622405e91bb9f057846e` |
| `renderer-conformance/adversarial.mjs` | `2e2ed4de8c862347d3410682bf0650465b4c796063e49833f198667ab91cff41` |
| `cmd/compare-interaction/main.go` | `1eb5638ef0a93cdffcea3ec92b3637dfc4d1ef12632d0a08339ec07e682b3da6` |
| `gobi/compare_interaction.go` | `ee9c32eb30c8edd24a13acf2b4a4aac7d8c796ec8bc07637d7966f2ae20a65f7` |
| `renderer-conformance/protocol.mjs` | `d54d1dbcea52683a88e42f1bce31df44533bbd3d678ede6b7f7d9a0266c53df9` |
| `renderer-conformance/coordination/reports/E5.md` | `5a8c7c0bc5132f7efc1e258c321159649caab393536a4df8c6be605575fa6558` |
| `renderer-conformance/evidence/fixed-first.tar.xz` | `06ca27acc7f1927808ecc91080b55c72b1465c014cb91928b5b6fff06cfc97e4` |
| `renderer-conformance/evidence/author-full-prereview.tar.xz` | `279ce82756db7ff858ab159d04368c2050d9a92bc62f04b417b19e7670954595` |
| `renderer-conformance/evidence/author-full-native-sha256.json` | `a5a5dfb7ef2bba8c008341ecfac6406dd7a6e279478db3663a814ed0eb6bff73` |
| `renderer-conformance/build/author-full.json` | `7ae430554e0cab38c8b256983599d3268f77c0dde470920968d3cc0c59a4b9e5` |
| `renderer-conformance/coordination/review-native/epoch-00.json` | `951db86b883af59737950498547f4abd6186434da270e2cf40e3205d51917309` |
| `renderer-conformance/coordination/review-native/epoch-00.bundle` | `7729fbc74a71bd187b37107d24cfef982885cb704c6965eb56d500a708eaa220` |
| `renderer-conformance/coordination/reports/diagnostic-XR-E5-probe.mjs` | `161fd9ce2a2ad13097547e2b1e1a12279eced932ef70e8de55feebe94a920acd` |
