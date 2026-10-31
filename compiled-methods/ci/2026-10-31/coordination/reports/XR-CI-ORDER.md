# XR-CI-ORDER — independent primary CI event-order review

**Decision: `accepted`.** I independently reviewed N6’s E-CI-ORDER packet against the raw current-primary artifact and replayed both its provenance verifier and its event-order checker. The bounded event-order and renderer-lifetime claims are supported. No source, workflow, raw artifact, or Git state was changed.

## Primary artifact and provenance

The author report and receipt identify the successful push run `41169518187`, job `124444234335`, artifact `13030848292`, at source commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d` and tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`. I re-ran `verify_primary.py` into this review lane. It reported `passed`, confirmed the repository HEAD/tree, all 137 before/after source pins, the terminal successful job with 12 successful steps, the upload marker, and the provider artifact ID/digest. The 11,460,089-byte provider ZIP (SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`) has three reconstructing chunks, a passing ZIP CRC check, and 968 matching retained and extracted members totaling 79,084,644 uncompressed bytes.

## Ordering and lifetime evidence

Re-running the author checker against the extracted primary attempt reproduced **677/677 passed checks and zero failures**. I also checked the capture directly in `independent_raw_review.py`: 21 top-level audit groups passed, plus 228 React-profile checks, 228 DOM-profile checks, and 284 alternating-swap checks. These checks decode state from raw trace records and compare each profile’s trace, oracle, physical snapshots, fixture actions, and lifecycle observations.

For React, DOM, and alternating-swap profiles, all 18 physical click intents and 19 ticks matched the frozen fixture. The four disabled targets were at indexes `[6, 9, 10, 17]`; each was physically clicked with `HTMLElement.click`, recorded as suppressed with null message and dispatch ID, and left the state unchanged. The other 14 events delivered the expected messages and empty action values with IDs `dispatch-0001` through `dispatch-0014`, without gaps. All 19 DOM-oracle snapshots equaled their corresponding physical DOM snapshots in each profile, including keyed controls and disabled states.

The swap profile alternated React/DOM after each of the 18 actions. Every recorded swap preserved the existing tick count and the old rendered HTML, emptied and detached the old root, and used a distinct new root. The new physical and oracle snapshots matched the post-action state and rendered HTML. All 18 retired callbacks were invoked after detachment, observed stale at their recorded renderer epoch, fenced with generations `1` through `18`, and left trace tick counts unchanged. Each profile ended with a seven-control view before unmount and empty physical DOM and renderer snapshots after unmount. There were no page errors or WebAssembly requests/API attempts.

I recomputed the browser trace hashes using the runner’s `JSON.stringify(profile.trace)` SHA-256 method; React, DOM, and swap all match the recorded digest `5f4337422d692fabafa1dd77ab33273c524c9268ce40046d1fed15b87f031a98`. The native and direct trace files are byte-identical at digest `d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`.

## Claim boundaries and limits

The packet correctly limits acceptance to event ordering and renderer lifetime on the successful primary push artifact. Its button-only fixture supports no focus or selection conclusion; it exercises no requested effects, so it supports no effect-completion conclusion. It makes no manager/session ownership or cancellation claim. It does not assert the separate PR run passed or that all workflows were complete. Those boundaries are retained in the author packet.

The independent runner emitted Node’s experimental `EnvHttpProxyAgent` warning while recomputing the trace hashes, but exited 0 and produced all three recorded hashes exactly. No review check failed.

## Reproduction

Commands run from the repository root:

```sh
python3 compiled-methods/ci/2026-10-31/lanes/order/verify_primary.py . \
  --output compiled-methods/ci/2026-10-31/lanes/go/review-order/replica-primary-provenance.json

python3 compiled-methods/ci/2026-10-31/lanes/order/audit_order.py \
  compiled-methods/ci/2026-10-31/extracted/compiled-methods/artifacts/attempts/attempt-20261031T044100445Z \
  --source-commit 6b49cc0bd4c9512a041f723c86b632ec506afd9d \
  --workflow-run-id 41169518187 \
  --output compiled-methods/ci/2026-10-31/lanes/go/review-order/replica-order-audit.json

python3 compiled-methods/ci/2026-10-31/lanes/go/review-order/independent_raw_review.py
```

All three commands exited `0`. The independent raw review receipt records its 21 top-level groups and per-profile assertion totals. Python runtime: `3.12.14`. The source artifacts and exact hashes are recorded in the companion receipt.
