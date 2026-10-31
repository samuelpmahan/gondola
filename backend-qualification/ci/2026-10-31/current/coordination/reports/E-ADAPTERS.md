# E-ADAPTERS: mounted qualification fault seams

**Worker:** N3  
**Outcome:** `mixed_change`  
**Date:** 2026-10-31

## Result

Added the default-off qualification renderer decorator at `backend-qualification/adapters/qualification-decorator.mjs` and wired the optional seam into `compiled-publications/conformance/browser-entry.mjs`. The browser entry now accepts `rendererDecorator = null` in `installPublicationsBrowser(...)`, applies optional `wrapCallbacks` before the real core renderer receives callbacks, and calls optional `afterUpdate` only after a real core update. With the default `null`, it passes the original callback object to the core renderer and performs no qualification mutation.

The explicit factory API is:

```js
createQualificationDecorator({ fault, onActivation })
// => { rendererDecorator, activationRecords(), callbackInvocations(), dispose() }
```

Supported `fault` values are `text-corruption`, `key-order`, `enabled-control`, `drop-click`, and `duplicate-click`. The first three run after the first actual renderer update and record the changed live DOM target before and after mutation. The last two attach a capture listener to the mounted `#app` container and activate only on physical event index 0. They record the event target and renderer-callback counts before and after forwarding. Drop suppresses the first actual renderer dispatch callback. Duplicate forwards one intentional extra renderer dispatch callback; any resulting runtime guard remains in control of Go state. The adapter does not change expected values, captured trace data, or application state.

The activation record includes fault family, backend, event index (`null` for initial-render changes), target path/tag and before/after snapshots, and renderer/forwarded callback counts. The decorator and browser entry both expose idempotent cleanup. Browser entry `inspectRaw()` returns unasserted live runtime snapshot/trace, renderer DOM, physical DOM and controls, callback counts and observations, effect records/pending entries, page errors, and renderer sequence. A failed strict replay leaves the instance mounted for inspection; `dispose()` attempts runtime unmount, disposes the decorator listener, and clears the physical container even if unmount reports an error.

## Verification

The focused Node 22.23.4 tests passed **6/6**. They cover each initial DOM mutation, actual click interception for drop and duplicate, fail-closed handling of an unknown fault, no-fault DOM immutability, callback forwarding counts, activation records, and idempotent listener cleanup. Node syntax checks passed for the decorator, tests, and browser entry. A separate Node import probe confirmed the browser entry exports `installPublicationsBrowser`.

The first two adapter test attempts exposed test-fixture problems, not production behavior: the fake click helper initially returned a fixed null event index, and the expected target path was off by one (the actual fake root's third child is path `2`). Both corrections are preserved in `rawlogs/E-ADAPTERS/corrections.log`; the final focused run passed. Node emitted its experimental `EnvHttpProxyAgent` warning; command exit codes were zero.

Two receipt-validator attempts failed on evidence bookkeeping only: the first redirected stderr into a file pinned by that same receipt (`pin mismatch: .../receipt-validation.stderr.log`, exit 1); the second ran after this report had changed but before its receipt pin was refreshed (`pin mismatch: .../reports/E-ADAPTERS.md`, exit 1). They are preserved as `receipt-validation-self-pin-attempt.*` and `receipt-validation-second-attempt.*`. After refreshing the report and rawlog pins, the validator passed without redirecting into its own evidence files. Neither attempt changed production source or native state.

No mounted Chromium/React/DOM qualification profile was run in this packet. N4 owns the actual browser matrix and will verify real activation and post-failure inspection using this API. This packet does not claim any mounted fault detection result or full qualification pass.

## Pinned inputs and changed scope

The production source pins and exact command logs are in `coordination/receipts/E-ADAPTERS.json`. The changed production files are limited to the decorator module, its focused test, and the explicitly authorized optional browser-entry seam. The publications app, Go runtime, renderer cores, compiler, and expected/oracle data were not changed by this lane.
