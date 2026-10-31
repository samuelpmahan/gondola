# XR-CI-DOM — independent DOM evidence review

**Decision: `accepted`.** I independently checked the current primary CI DOM packet against its retained raw native, direct, and browser records. The fixed state/view expectations, physical snapshots, controls, disabled click behavior, and artifact provenance agree. This review accepts the bounded DOM claims in E-CI-DOM.

## Source and primary artifact

The published source is commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`. Local `HEAD` and its tree, `publication-current.json`, provider metadata, and retention metadata agree. The current successful primary push is run `41169518187`, job `124444234335`, artifact `13030848292`.

The retained provider ZIP is 11,460,089 bytes with SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`. Its CRC passed; 968 members totaling 79,084,644 uncompressed bytes match retention and extraction records in the N6 provenance audit. The current attempt is `attempt-20261031T044100445Z`: full execution passed, method matrix matched, 137 source pins were stable, and the browser capture and `methods.browser.json` are byte-identical. This review uses the successful push primary artifact; it makes no separate PR-run acceptance claim.

## Independent raw-record checks

The review program `lanes/order/review-dom/review_dom.py` builds expected wire states, view trees, normalized HTML, and live button-control properties from literal fixture values. It does not import the project DOM oracle or its checker. It ran against the retained raw records and passed **1,030 checks with zero failures**.

- Native and direct traces, plus React, DOM, and swap browser traces, match all 19 fixed state values, view trees, tick indexes, messages, and dispatch IDs. Every requested/completed effect list is empty.
- Each browser profile records 18 fixed click intents, 19 matching `domOracle` snapshots, and 19 matching physical DOM snapshots. Each snapshot matches the expected `outerHTML-v1` serialization and the seven live button controls.
- Disabled action indexes `6`, `9`, `10`, and `17` have connected, physically disabled targets. The capture records attempted `HTMLElement.click()` calls with disabled state and unchanged trace ticks; these intents have no observed callback, message, or dispatch ID, and preserve the expected state. The other 14 intents produce the expected message and sequential dispatch IDs.
- All 18 swap records have matching expected post-action state and physical/oracle snapshots. The browser capture has no page errors. The swap checks do not assert focus behavior.

The independent raw-record counts and hashes are recorded in `lanes/order/review-dom/review-dom-audit.json`. Raw browser capture SHA-256 is `af59cc079eccee6c2b3550fec081a32f9056758aa54c6a71ef6f53cdc56cf626`; native and direct traces are each `d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`. All three browser trace hashes are `5f4337422d692fabafa1dd77ab33273c524c9268ce40046d1fed15b87f031a98`.

The author packet's independent oracle source and result hashes match (`77dbc9c2a4481a4eeb7c88966da83c9b28204e39b7b92b84874bb2f99fe074d8` and `47fa3a74382f82252d0f41ca209d6c37fd766c6980a2f205d63a6ae83e803118`). The separate primary DOM audit also matches its recorded hashes and passed. The review program was run with Python `3.12.14`:

```sh
python3 compiled-methods/ci/2026-10-31/lanes/order/review-dom/review_dom.py
```

It exited `0` with `decision: accepted`, `checksPassed: 1030`, and `checksFailed: 0`. Its SHA-256 is `987ca14f4e4cac25b5db2d61f94c231e4763fdb4ae2d7b2c0e7cb7695fa42afe`; the audit-result SHA-256 is `96ef56b3513fb316620800b17ac39836f8490e04ef7907227a04447a82f95c8a`.

## Claim boundaries

Acceptance is limited to the frozen fixture's state/view/DOM consistency, physical controls and snapshots, disabled click suppression, and current successful primary push provenance. It does not claim focus behavior, effect completion, manager/session/cancellation semantics, general browser behavior, or separate PR acceptance. Callback lifetime fences are reviewed in the distinct N6 E-CI-ORDER packet, not inferred here. Earlier local preflight and failed `8ed` artifact history are not substituted for this current CI evidence.
