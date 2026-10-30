# Go-owned asynchronous save — October 30, 2026

This milestone adds typed Go request IDs, start/cancel commands and completion receipts to the existing editor. Go alone decides which reply can commit. DOM and React renderers are reused byte-for-byte; pending work survives replacement. An independent React model supplies state, tree, command and audit expectations. The demo also completes a real setTimeout request after an immediate renderer swap.

Base: PR3 a8e9449362f2f2dce76336f5caba9c1468bb6006. Fresh branches/PRs showed the counter, replacement and controlled-input milestones complete and green, with no overlapping effects work. This is a stacked feature review targeting PR3, not main. All inherited signed files/receipts remain unchanged. Main's separate Inertia milestone is not merged into this stack or claimed as a tested input/effects combination.

## Final executed evidence

Go1.24.0 / Node22.23.4 / React and ReactDOM19.3.1 / Playwright1.64.1 / Chromium153.0.8010.0 / Python3.12.14 / native Rebalancer1.0.4. Local Chromium is the previously provisioned npm-hosted fallback. Standard Playwright Chromium is configured in CI; its actual outcome is added to the PR separately.

| Seed | Scenarios | Observations | Fills | Typed keys | Clicks | Replies | Swaps | Detached-input events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20261030 | 38 | 841 | 133 | 180 | 277 | 94 | 92 | 27 |
| 20261031 | 38 | 711 | 137 | 149 | 199 | 83 | 83 | 22 |

**76 scenarios / 1,552 observations, zero mismatches; all 152 native comparisons match.** Each seed includes eight fixed scripts and30 generated scripts capped at40 actions. Fixed cases cover out-of-order/duplicate/cancelled/reset replies, errors and retries, editing while pending and swaps. Two isolated Go WASM instances begin on different renderers, alongside the independent React oracle. Every tick compares full state/tree/bindings/messages, completion audit, start/cancel/delivery order, actual raw HTML and live input/disabled properties. Underlying Go init count stays one per host scenario. Extended audit/transport/property observations are checked independently in JavaScript; native CompareInteraction checks ordered steps, state, tree and DOM, not those additional fields.

**42 Node tests pass.** Full Go tests/vet, strict WASM API smoke and **11 adversarial browser probes** pass. Probe names/counts are enforced. A separate independent boundary probe rejects15 malformed dispatches and21 malformed replies atomically, then accepts a valid pending reply. The visible demo passes late/duplicate/error/reset/retry cases and actual timer completion across replacement. [Screenshot](evidence/demo-pending-swap.png) · [Final run log](evidence/async-final-frozen-run.log).

The full inherited chain passes: static5000 cases/59 compatibility rules with exact expected receipt/SHA256SUMS, original counter107 scripts/4473 ticks, renderer replacement103 scripts/5249 ticks, controlled input216 scripts/10149 observations. All201 previous delivery-manifest pins remain valid. [Static log](evidence/static.log) · [Inherited log](evidence/inherited.log).

## Reproduction and receipts

Normal command: `bash run-async-effects.sh`, requiring Go1.24 and Node22; then serve the repository root and open `/async-effects/demo.html`. See [README](README.md). Exact final local command:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 GONDOLA_ASYNC_SKIP_INHERITED=1 bash run-async-effects.sh --seeds 20261030,20261031 --cases 30 --max-actions 40 --output async-effects/build/final-frozen-report-seeds-20261030-20261031.json
```

The iteration-only inherited skip follows the already completed full inherited runner in inherited.log. Normal runner/CI does not skip it. The runner rebuilds current WASM/reference assets, runs the exact-schema Node/WASM smoke, Go/Node tests, demo and parity checks. The final run uses frozen E1/E2/E3 repairs, unlike earlier successful runs explicitly retained as pre-amendment evidence.

[summary.json](evidence/summary.json) records exact report hash and counts. [Source/asset checkpoint](evidence/source-checkpoint.json) pins the executed build. [async-traces.tar.xz](evidence/async-traces.tar.xz) contains the full final report plus all152 native input envelopes. Extract with `tar -xJf async-effects/evidence/async-traces.tar.xz -C <empty-directory>`; replay an envelope using `go run ./cmd/compare-interaction <input-file.json>`. Original absolute paths in reports are provenance. [Earlier reports](evidence/earlier-reports.tar.xz) retain the first failing fixed diagnostic and earlier successful full reports; their source stages are distinguished in the logs. Build hashes identify the local executed artifacts, not universal byte equality across Go toolchain/VCS metadata changes.

## Concrete failures and repairs

- An initial inherited attempt omitted the local browser override and encountered corrupt browser downloads; the corrected environment passed. A concurrent Go package edit also interrupted an early inherited run; it was rerun after the compile gate. Both failure logs remain in evidence.
- One adversarial assertion expected Saved to survive Reset. The contract clears it; the corrected probe checks ID1→Reset→ID2 and proves the old reply cannot change the new pending request. The initial failed report is preserved.
- The demo JSON panel could sample before React's delegated handler, showing old JSON beside updated DOM. Observation now defers to a later task and awaits the effect queue before sampling; the real timer demo passes.
- Cross-review caught JSON null becoming Go string zero values. The new bridge now requires exact canonical Step/Reply fields and primitive types before mutation; missing/null/wrong/boxed/extra/unserializable inputs are rejected. The independent reference was aligned and retested.
- Cross-review reproduced two live hosts reinitializing the same runtime object and colliding on ID1. A runtime-object lease rejects the second owner before init, releases during cleanup, and a real Go probe proves the retired callback cannot affect a new host reusing ID1. Distinct wrapper aliases to one underlying runtime remain the caller's exclusive-ownership responsibility.
- Failed-host cleanup and per-command transport error handling were strengthened: cleanup remains possible, callbacks fence, and one thrown command does not silently discard later commands in the drained outbox. Errors are surfaced, not transactional rollback.

Initial findings, actual author reports, rechecks and acceptance hashes are under [coordination](coordination/PROTOCOL.md). Six Luna6 XHigh workers used every available child slot; native solver allocated authoring and six independent reviews, both600/600 with no broken constraints or self-review. Platform controls delivered assignments. No fake native extraction finish or modification of older coordination ledgers is claimed.

## Demonstrated limits and next capability

Demonstrated: finite asynchronous-save parity under deterministic serialized scheduling, advisory cancellation with Go-authoritative stale/duplicate guards, request-ID nonreuse across Reset, audit/message/command ordering, and state/request retention across DOM/React replacement. A real timer path also passes. Native Go tests cover safe-ID exhaustion; random browser scenarios do not approach that bound.

This is a bounded typed effect experiment, not a generic executor for every gobi.Effect or a completed Backend.Emit compiler. No real network service, hydration, keyed reconciliation, concurrent React/event-loop equivalence, IME, pixels or other browser engine is established. Completion deliberately remounts the current renderer; focus/selection retention across completion or replacement is untested. DOM segmentation is not compared beyond raw serialization. Already committed Go state and partial DOM mutations cannot be rolled back on renderer/transport exceptions. Each host needs exclusive ownership of its underlying Go session and transport. Manual pending() includes cancelled-but-undelivered requests so forced late replies remain inspectable.

A further frontend backend must consume the same snapshots/bindings and host lifecycle, implement controlled properties/disabled behavior, and pass these scripts/oracle without moving application transitions into framework code. A next substantial milestone is a real Go HTTP transport with typed response validation, abort/error/retry behavior and the same late-reply guards, followed by renderer update/reconciliation support for focus-preserving async rendering.
