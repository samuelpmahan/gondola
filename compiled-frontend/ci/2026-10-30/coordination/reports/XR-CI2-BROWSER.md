# XR-CI2-BROWSER — N4

**Decision: `accepted`.** N3’s CI2-BROWSER report and receipt are accurate for the bounded successful CI artifact and captured browser profiles. The acceptance covers the evidence packet and pinned run, not untested lifecycle behavior.

## Cross-check

I inspected the immutable extracted browser traces, corresponding checker reports, CI execution record and Node log, and extraction manifest. The five profiles are `counter`, `form`, `list`, `effect`, and `list-growth`. They report 43 ticks and 89 mutation controls total; all five checker outputs are `matched` and each offline checker output is byte-identical to its captured CI checker output. Trace and checker hashes are recorded in [review.json](../../audits/XR-CI2-BROWSER/review.json).

All five raw browser reports show Chromium `156.0.8078.4`, empty WASM request/API-attempt arrays, no page errors, and empty physical DOM and renderer snapshots after unmount. The list trace preserves the keyed input and backward selection `(0, 2)` across reorder. Its detached-node callback is observed as stale without a message or added dispatch. The effect trace records the disabled pending-request control at tick 4, one completion correlated to `dispatch-0002`, and rejection of the duplicate without another tick. The form trace preserves the distinction between the literal intent `must not replace literal`, the observed empty button value, and Go message `{Name: "literal", Arg: "target.value"}`.

The Node log records 81 tests passed, zero failed or skipped. It includes the passing test that selects Playwright-managed Chromium when no executable override is configured; both Chromium path overrides are null, and CI records Node `v22.23.4`, Playwright `1.64.1`, and browser `156.0.8078.4`. The manifest lists 309 compiler files; I verified each extracted file’s size and SHA-256 against its manifest row with no missing or mismatched file. The provider ZIP digest and run identity are carried from immutable provider metadata; I did not re-download or re-hash the ZIP.

## Limits

The report correctly says the callback retained after **runtime unmount** remains untested. Its stale-callback evidence is only for a removed node before runtime unmount. The installed manifests for `esbuild`, `react-dom`, and `react` are not present in the checkout/archive, so their package versions are CI-recorded rather than locally rehashed. Review was read-only: no browser, app, build, or test was rerun. Acceptance is limited to this CI run, exact PR head, and five captured profiles.
