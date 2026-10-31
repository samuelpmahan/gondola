# XR-HOST (N1) independent review

**Decision: `accepted`.** I reviewed E-HOST’s frozen driver, focused tests, report, receipt, and raw logs against `compiled-children/CONTRACT.md` and the shared compiled runtime. I found no concrete source defect requiring amendment.

## Contract and implementation review

- The host admits only the frozen request/cancel tuples. Token validation enforces the parent/child grammar, lowercase key rule, canonical positive decimal IDs, and the `Number.MAX_SAFE_INTEGER` bound before delivery or admission.
- The driver stores request tokens, original `{dispatchId, effectIndex}` correlations, delivery callbacks, statuses, and records. It does not store or reduce collection identity, ordering, generations, counts, pending state, or liveness; those remain Go-owned.
- Cancellation looks up the token’s original request correlation and calls the shared runtime’s `cancelEffect`. The host marks the token canceled only after the runtime confirms cancellation. Later delivery of a canceled token is rejected.
- Delivery constructs `Message{Name:"complete", Arg:token}` with the original correlation. It preserves the pending callback on retryable candidate admission, and consumes it only after a non-retryable runtime result.
- Compatible and rejected renderer replacement are delegated to the shared runtime. The wrapper does not change Go state or renderer state. Unmount retires outstanding correlations; if the shared runtime queues unmount while busy, the wrapper checks retirement in a microtask after the queued unmount settles.
- The initial raw logs, final test log, source hashes, report hash, and receipt-listed byte counts all match the E-HOST receipt. A read-only direct `validate_receipt` call accepts E-HOST/N3.

## Verification performed

Runtime: Node `v22.23.4`.

```text
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-children/runtime/runtime.test.mjs compiled-frontend/frontend/runtime/runtime.test.mjs
```

Exit 0: **42 tests passed, 0 failed** (6 E-HOST tests and 36 shared-runtime tests). The host cases cover closed token/effect admission, original-correlation delivery, cancellation and later rejection, request persistence over a compatible swap, rejected candidate preservation, retryable candidate admission, retired callbacks, and unmount retirement. Shared-runtime cases cover actual cancellation fencing, stale/post-unmount callbacks, held completion cancellation, and renderer admission behavior.

```text
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-children/runtime/runtime.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-children/runtime/runtime.test.mjs
```

Both syntax checks exited 0. E-HOST’s source hashes are `7ed7bfa6f567658a0fc283cfce4e76c4dd28fa2646eeea2d8519b2bf4746777b` for `runtime.mjs` and `13b4558399c07ad6337b466b0df8465b1beeb6a83057a6f6253a2071f8eedc47` for `runtime.test.mjs`.

The read-only native `validate_receipt` accepted E-HOST/N3. My first XR-HOST validation wrapper exited before calling the validator because it looked for generated review jobs in the static extraction spec; the corrected direct call accepted both E-HOST/N3 and XR-HOST/N1. Both logs are retained.

## Review notes and limits

The parent token newline concern did not reproduce. The pinned Node validator rejects LF, CR, CRLF, U+2028, and U+2029 suffixes; the ordinary `parent:g1:r1` token is accepted. The exact probe is retained in `coordination/rawlogs/XR-HOST-token-newline-probe.log`.

E-HOST’s standalone suite uses a synthetic compiled ABI module, so it does not prove delivery from the actual Go fixture. Its incompatible-candidate test verifies preserved state, DOM, renderer, and callback, but delivers its pending token before the rejected candidate. N4’s browser harness contains explicit pending-set equality assertions for compatible and rejected swaps; actual Go/browser parity remains a separate integration gate and is not claimed by this review.

No production source was changed in this review. The read-only validation and Node logs are under `compiled-children/coordination/rawlogs/`; independent review receipt is `compiled-children/coordination/receipts/XR-HOST.json`.
