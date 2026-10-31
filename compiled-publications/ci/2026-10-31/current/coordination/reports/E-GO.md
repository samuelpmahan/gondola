# E-GO: typed parent inputs and delayed publications

**Outcome: mixed_change.** Added a Go-owned typed input and publication queue to the keyed child collection fixture. Each capture stores a value snapshot together with parent generation, child generation, and input revision. Delivery consumes one queued publication and accepts it only for the same live parent/child generations and current unlocked input revision, with a per-child monotonic accepted-ID watermark. The browser/runtime layer does not reduce application state.

## Fixture behavior

`fixtures/compiled/publications/app.go` defines `ParentInput`, `ParentState`, value-slice `ChildState` rows, and queued `Publication` records. The parent owns `Step`, `Locked`, and `Revision`; `AddFromInput` applies the selected bounded counter step. Child request/count/reorder operations preserve the accepted-publication watermark. Child key reuse receives a fresh generation. Parent removal cancels outstanding child requests in reverse presentation order, retains queued publications, and remount advances the parent generation while preserving input configuration so old publications are rejected.

`fixtures/compiled/publications/view.go` exposes keyed child controls, input-step and lock controls, parent lifecycle controls, and a delivery button for each queued publication. `scenario.json` supplies the fixed source actions used by native and browser harnesses. Its 50 source events include 45 Go dispatches, two disabled clicks, compatible and rejected renderer swaps, and a stale callback probe. The schedule covers frozen-value capture, stale input and generation rejection, out-of-order delivery, key reuse, request effects, parent remount, malformed IDs, and one-time consumption.

The app tests cover snapshot immutability, input/lock behavior, stale input and generation rejection, parent remount, malformed IDs, cancellation order, safe ceilings, out-of-order one-time delivery, and the accepted-ID watermark surviving a request, count edit, and reorder before an older queued publication is delivered.

## Verification

The focused Go 1.24 test passed:

```sh
/tmp/gondola-go/bin/go test -count=1 ./fixtures/compiled/publications
```

The final native capture contains 50 events and 45 Go steps. Its SHA-256 is `bbf6db314e6f9f68802e0dd3d49b5216c4ed93db5696d9f9980055de12bced3d`. The same bytes are retained in the N3 capture and the E-GO evidence directory. A superseded pre-final-envelope capture is preserved separately.

N2's React and DOM build outputs are present for the final application source. Their generated AppIR files are byte-identical (24,682 bytes, SHA-256 `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f`) and declare `effect.cancel`, required by the fixture's `lifecycle.cancel` effects. N2 owns the final compiler source-pin and encoder-probe receipt; this E-GO packet does not claim full browser or CI acceptance.

## Source pins

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `fixtures/compiled/publications/app.go` | 13,874 | `c9865a8d2c6e4da3568f1e288d3506144d94c5f987006f9128878acd479fa0bb` |
| `fixtures/compiled/publications/view.go` | 5,263 | `458e33f640a6fe9edfa3a200405ec9ef381d43668f2088706c58f012481079bc` |
| `fixtures/compiled/publications/app_test.go` | 9,703 | `6402baa2a342528c93ef52e4e93ba6e9c51d013193cc2a8fa8d9989bde39c392` |
| `fixtures/compiled/publications/scenario.json` | 12,307 | `824240f36750c9806265edc4511143188d20e3d1ba0686cd37fe7cd996193819` |
| `compiled-publications/CONTRACT.md` | 5,361 | `2ad4be1aeb1da3f3e6905bb01a7b3ef0eed22ecf60df7307aecbb997a0a2e296` |

## Limits

This packet records focused Go fixture and native trace evidence. Full inherited pipeline, mounted browser replay, and hosted CI acceptance belong to the other milestone lanes and are not claimed here. The final test-only watermark regression was added after N2 generated its build outputs; application sources and AppIR remain unchanged, and N2 is refreshing its test-source pin record.
