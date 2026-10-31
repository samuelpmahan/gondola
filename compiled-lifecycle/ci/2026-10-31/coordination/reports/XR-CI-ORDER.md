# XR-CI-ORDER: independent review of the hosted lifecycle-order packet

**Decision: `accepted` for the bounded artifact comparisons below. Outcome: `mixed_change`.** The hosted artifact has a matching standalone native/direct lifecycle replay and browser lifecycle evidence, while the required orchestrated native replay failed to spawn and the full checker was withheld.

## Artifact and source binding

The raw evidence is from push artifact `13034915662`, workflow run `41178420647`, source `49cc2b96c8817a47319d5b7bd484184a22fa984b` and tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`. The ZIP is 47,035,803 bytes, SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`, with a failed workflow conclusion. I reassembled and checked its 12 retained chunks, verified all 1,272 ZIP members against the provider member inventory and extracted copies, and read each member so ZIP CRC checks also ran.

The conformance record has 178 stable pins before, after, and at its final stability check. I verified its 50 committed source-file pins against immutable Git objects at 49cc, rather than the shared worktree, which is in use for the separate path repair. The other 128 entries refer to this attempt’s generated outputs; each matches its extracted artifact member. The eight additional generated-output pins before/after the checker also match. There are no pin mismatches.

## Standalone native and direct GoScript event steps

I independently compared the same attempt’s standalone native CLI trace (`matrix/native-cli.json`) with its direct emitted-module event-step record (`matrix/lifecycle.direct.json`). Both contain 26 event steps. The initial typed state in the direct trace decodes exactly to the native initial state. For every event step, I compared the complete decoded lifecycle state, the View tree, message, and emitted request-effect payloads. All 26 matched the fixture event sequence. The renderer swap is represented as a no-message, no-effect step with preserved state/View; no extra Go update is inferred from that renderer operation.

Both records show seven request effects. Removing Parent cancels Grandchild, Child, Parent in that order and each cancellation points to its original request correlation. Sibling stays pending while the three generation-1 completion messages are recorded as no-ops. Duplicate Sibling and generation-2 Child completions also leave state and View unchanged. The Sibling and all three fresh generation-2 replies are accepted. The direct module ends with no pending requests.

This comparison is an event-step projection over state, View, messages, and requested effects, not a claim that every native and direct JSON field is byte-identical.

## Browser capture and physical lifecycle evidence

The raw browser capture has React, DOM, and alternating-swap profiles. Each records 26 events and Go ticks, 16 physical clicks, and 17 ordered effect records, with zero page errors and no pending work at the end. The direct and browser traces match on the full core projection: tick index, message, dispatch ID, typed state, requested effects, completed effects, and View tree.

Each profile clicks six retained Parent/Child/Grandchild buttons after their subtree has been removed and remounted. That is 18 detached-button click attempts across the three profiles. Every target remains disconnected, and each attempt leaves trace, snapshot, callbacks, pending requests, effect records, and physical HTML unchanged. All 16 active fixture clicks in each profile are also verified as connected, enabled `HTMLElement.click()` actions with the expected message.

The fixed DOM→React swap preserves all four pending request tokens. The alternating profile records 17 swaps: 16 swaps with retained callbacks and one scheduled swap with no action callback to retain. The two old callback forms are fenced at each eligible swap, totaling 32 fence records. Canceled generation-1 host callbacks are rejected; Sibling and the generation-2 replies succeed. Each browser profile unmounts after pending work has drained, with an empty renderer snapshot and physical DOM containing zero controls. This artifact does not test browser unmount while work is pending; that case is covered by the separately recorded runtime unit tests.

## Action metadata asymmetry

For injected Go-message ticks 11, 12, 13, 15, and 25, direct trace `action` is `null` while browser trace `action` is `{path:"",event:"click",value:""}`. The immutable 49cc checker source (`compiled-lifecycle/conformance/check.mjs`, SHA-256 `0a714448607d40f08719925bf3822b35bd41b58fc66a124d8b7f5f491859c8e5`) projects the compared core fields without `action`; separate browser assertions cover the 16 physical fixture clicks. I verified this exact projection and the five raw mismatches. The action metadata remains un-compared; it is not treated as equality or as a conformance failure.

The stronger order where generation-1 callbacks arrive while fresh generation-2 requests are already pending is separate E-LIVE-REPLY evidence. It is not included in this hosted artifact finding.

## Hosted failure boundary

The hosted lifecycle run remains `rejected`. Its required `native-go-script-cli-replay` stage received bare `--native-go go`, resolved it to `/home/runner/work/gondola/gondola/go`, and failed with `ENOENT`. As a result, `matrix/lifecycle.native.json` and `matrix/lifecycle.check.json` are absent, and the final checker/mutation controls were withheld. The separately passing `matrix/native-cli.json` is a bounded standalone replay; it does not complete the failed orchestrated stage or prove a full CI pass.

## Reproduction and hashes

Run from the repository root:

```sh
python3 compiled-lifecycle/ci/2026-10-31/lanes/review-order/audit_order_review.py
```

This deterministic audit uses Python `3.12.14` and no random seed. It verifies raw artifact members, immutable source/build pins, typed native/direct event steps, browser projection fields, detached controls, callback fences, and the failure boundary.

- Independent result: `lanes/review-order/audit-result.json`, SHA-256 `449078dae4f39daee4013ec18ddf103d6475091e02605fee236befe5a0fc72f5`.
- Independent script: `lanes/review-order/audit_order_review.py`, SHA-256 `308378c3f4f189f4a642d8061def567e3401091de5e9c4ff66c1b17cf95eb38a`.
- N2 author report/receipt: SHA-256 `01453ee944a32cf3afdc4ee47fd96ed858f39fbe32879cf8969028500b8e326c` / `f0f2c65134f03752dfe635d7d4c58fd4cc47b652b3d6692dec854ba9888e0ab7`.
- Native CLI / direct module / browser capture: SHA-256 `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5` / `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71` / `a663d77ba16c43adfb3f4b12666845b82047b3e1b9c7ed68ffea8c98ac304ad6`.

I made no product source, runtime, native source, provider, Git, or shared state changes.
