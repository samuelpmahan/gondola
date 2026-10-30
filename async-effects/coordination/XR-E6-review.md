# XR-E6 independent review

## Verdict: ACCEPT

Reviewed `async-effects/adversarial.mjs`, `async-effects/adversarial.test.mjs`, the E6 author report, and the coordinated fixed-only E4 browser report. No E6 source edits were made.

## Evidence

- The frozen `expectedProbeNames` contains the required **11** cases. `validateProbeSet` rejects missing, duplicate, unregistered, and mislabeled probes; the Node tests exercise those rejection paths and preserve individual probe failures.
- The real-Go cases create fixtures through E4's browser fixture, whose `makeRuntime()` instantiates actual `async-save.wasm` modules and captures each `globalThis.gobiAsyncSave` API. The fixtures count calls to `init`, `dispatch`, `complete`, `effects`, and `audit`; assertions read host snapshots/audits and check real Go completion counts. These cases do not substitute the independent React model for the Go implementation.
- The Reset probe records the real Go sequence **ID 1 → Reset preserving `NextID: 1` → ID 2**. Delivering the old ID 1 leaves ID 2 pending and the reset-cleared saved state unchanged; ID 2 then completes successfully.
- The unmount probe forces delivery through the retained manual-transport callback after `host.unmount()` and observes zero changes in all five Go call counters. The session-collision probe reinitializes the same Go runtime API, creates a new ID 1 request, then delivers the old host's ID 1 callback; old and new counters remain unchanged and the new request stays pending until its own reply.
- The cancellation probe cancels through the real Go host, then invokes the still-retained manual callback and checks that Go keeps the request cancelled and audits the reply as stale. The E4 trace independently records the transport sequence `start → cancel → deliver` for the canceled request.
- Synthetic start/cancel failures require both a case-specific marker and the corresponding `transport.start` / `transport.cancel` context, then check Go-owned state and call deltas. The stale-facade probe requires the specific stale-renderer rejection and verifies that counted Go calls do not change. Synthetic cases are explicitly labeled; the author report does not claim network or cross-browser coverage.
- Node `v22.23.4`: syntax checks passed and `node --test async-effects/adversarial.test.mjs` passed **7/7**.
- The E4 fixed-only Chromium report `async-effects/build/e4-fixed-diagnostic-recheck.json` records **11/11** probes passing (8 `real-go`, 3 `synthetic`), zero parity mismatches, and no Go or page errors. Its summary and retained transitions confirm the assertions above.

The evidence supports acceptance of the E6 probes and tests as scoped.
