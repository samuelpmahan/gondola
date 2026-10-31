# R-CONTRACT semantic audit

## Scope

This audit targets focus-capability admission and the renderer-swap failure boundary in `runtime.replaceRenderer(nextRenderer)`. It uses the runtime with fixture Go symbols and fake renderer objects. It does not replace N3's four-app browser conformance run.

## Executed checks

Command:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-backends/evidence/semantic/swap-semantics.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-backends/evidence/semantic/swap-semantics.test.mjs
```

Node v22.23.4. Syntax check passed. Semantic suite passed 9/9, 0 failed; exact output is in `r-contract-node22.log`. Node emitted the existing experimental `UNDICI-EHPA` warning.

The added probes establish:

- A throwing focus capture, returned native Promise, invalid field types/ranges, extra record field, or `undefined` is rejected in `focus-capture` before old unmount. The old renderer remains mounted; runtime failure is null; trace and Go call counts stay unchanged; snapshot remains usable; a later valid swap succeeds.
- Dispatch and nested replacement attempted synchronously from focus capture are fenced. They allocate no dispatch ID, invoke no Go Update, and add no trace tick; the outer replacement still completes.
- `restoreFocus` returning `false`, `undefined`, a string, or a rejected native Promise fails after teardown. Runtime records `focus-restore`, halts, reports `focusRestored:false`, and does not claim rollback or add an app tick. The rejected Promise is observed by the runtime's sync guard.
- A synchronous replacement's delayed effect completion remains queued until after return. Duplicate delivery is fenced, exactly one reply Update occurs after the microtask, and unmount or a failed post-teardown swap cancels the held delivery.
- If focus capture delivers a one-shot completion and then rejects before teardown, the held completion is canceled; the old renderer and pending runtime state remain usable without a hidden reply Update.
- A thenable returned from next-renderer update is detected after teardown and fails closed. Same-instance and malformed focus-pair admission checks remain pre-teardown.

## Review boundary

No production file was edited by N6. The runtime behavior above was exercised against N1's integrated runtime implementation. Real DOM focus, browser engine behavior, and the full four-app fixture matrix are not established by this fake-renderer audit. An independent cross-review of this R-CONTRACT lane remains pending.
