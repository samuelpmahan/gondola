# E-CAPTURE (N2)

## Result

`CheckCaptures(root)` accepts the explicit PR23 attempt directory and its `conformance/` directory. It fixes the accepted suite to four scenarios and five profiles per scenario, recomputes each native trace with `effectsreplay.ReplayJSON`, compares the archived native JSON byte-for-byte, and validates the profile captures against the replayed Go states and views.

The checker validates all 178 scenario events, 182 Go state snapshots, 58 Go effects, 116 transport records, and 20 direct/browser profile captures. Its report is `Scenarios: 4`, `Profiles: 20`, `Events: 178`, `States: 182`, `Effects: 58`, `TransportEvents: 116`, and `Seeds: [20261104, 20261105, 20261106]`.

## Checks performed

- Four fixed scenario filenames, names, event counts, and raw SHA-256 pins prevent a shorter or substituted scenario suite from passing. Each capture profile's `scenario` object is compared with the pinned scenario; its `scenarioSHA256` is independently recomputed from compact JSON bytes in member order to match the producer's `JSON.stringify` digest convention.
- Every native output must exactly match the bytes returned by Go `ReplayJSON`. Each profile's source events and native expected acceptance, messages, state indexes, and effect indexes are compared with that replay.
- Each captured snapshot is checked against the corresponding replay state for parent state, controller state, child state, child input, and parent/child view trees. Pending effects are reconstructed from Go child `Pending` and `Token` state plus replayed request descriptors, then checked against capture request correlation and queue order.
- Browser DOM markup is rendered from replayed Go view records with `gobi.HTML` and compared exactly. Ordered browser control snapshots and their disabled values are derived from those Go views. Each browser click's `disabledBefore`, target button markup, text, and callback result are also checked from the Go-rendered pre-event view.
- Lifecycle, transport ordering, and correlation are delegated per capture to `CheckOrdering(replayedNative, profileCapture)` from N4.
- `decodeJSONStrict` reuses `modulequalification.DecodeStrict`, preserving `json.Number` for maps and rejecting duplicate keys, invalid UTF-8, unpaired surrogate escapes, trailing values, unknown typed-record fields, and incorrect struct-field casing. Capture profile documents are intentionally decoded as generic maps: required fields and types used by this checker are validated, while additional metadata keys are tolerated.

## Verification

The explicit focused command, raw output, exit code, Go version, and source-file SHA-256 values are indexed in `rawlogs/E-CAPTURE/index.json`. The command exited 0; the strict JSON helper tests, missing-suite rejection, and real PR23 integration test all passed. The integration test uses `GOBI_EFFECTS_QUALIFICATION_INPUT` explicitly, so absent fixture configuration is reported as a visible skip rather than a pass claim.

During integration, the first run exposed a mismatch between raw scenario-file SHA-256 and the producer's compact `JSON.stringify` digest. The checker now independently computes both identities: a pinned raw-file hash for suite admission and a compact ordered JSON hash for each profile digest. Follow-on checks also account for omitted nullable `message`/effect-descriptor fields and preserve pending-request queue order. Earlier integration diagnostics remain in `rawlogs/N5-NEGATIVE/`; N5's later full-package run passed the semantic mutation controls, including Go state/tree, rendered DOM, browser disabled behavior, ordering/correlation, and required-suite removal.

## Scope limits

This is a finite PR23 fixture check. It does not run JavaScript or Chromium, establish arbitrary JavaScript/Go equivalence, qualify arbitrary modules or event streams, or replace N3's source/build/ABI admission. Profile generic maps allow extra fields; required fields, exact state and view projections, DOM markup/control values, and ordering inputs are checked explicitly.
