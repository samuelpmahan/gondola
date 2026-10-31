# XR-ACCEPT-DEMO: independent review

## Decision

**Accepted for the scoped demo evidence gate.** N5's packet is tied to source `60b5aeff3172837ad7831c2b78b210454a3d81a2` / tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`. I verified its author report and receipt hashes, all 104 referenced file pins, the local and current CI demo audits, the terminal catalog audit, and the primary archive verifier output. The local archive remains explicitly rejected with cause unknown. This review does not claim the overall capability milestone is complete.

## Demo evidence

The primary current-source CI capture records eight passing browser assertions. Its served page, stylesheet, and compiled bundle each returned HTTP 200. The compiled AppIR requires `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`; the host support profile and active renderer profile are visible in the capture. The captured AppIR, encoder, compiled module, and browser bundle SHA-256 values are respectively:

- AppIR: `ed93e9ae6f9be20c306669d63b676ed466e65fee8dc7fd0a1a4c8a6b38f0a68a`
- Encoder: `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`
- Compiled module: `e6768a43d409664c3a573520f548344c9d13502a8dc0c5100f2dd88d9d6c86c1`
- Browser bundle: `62d0e2cec181850aec5f1b081d7a4cc711355db200cd44be0cbfee05e30e1454`

The capture records the disabled pending-request button ignoring an injected click without a Go tick. Compatible DOM→React and React→DOM swaps preserve the Go snapshot and pending request. The missing-`view.node` candidate is rejected during admission with the existing DOM node, count, trace, and pending request retained; the old control remains usable. The event sequence is `addParent`, `requestParent`, `addParent`, `complete`, with dispatch IDs `dispatch-0001` through `dispatch-0004`. The final parent count is 2, the pending request is cleared, and the Go reply is `parent:g1:r1`.

I inspected the pinned primary screenshot. It visibly shows the mounted lifecycle view, accepted DOM profile, capability lists including `effect.cancel`, parent count 2, and delivered reply. The detailed event ordering and dispatch IDs are verified from the captured JSON, not inferred from the screenshot.

## Current-source artifact and local limitation

The terminal catalog audit references 30 successful current-source runs/jobs (15 push, 15 pull request) and exact source heads. N4's primary run `41193504188`, job `124514913013`, artifact `13040129310` has a matched provider ZIP: 76,786,265 bytes, SHA-256 `3a54a53c81ac93ad1c5a8231b17ac289875ed57ad7bb12d7ae2b3609ff267de1`, with 1,476 verified members. The embedded E-BUILD receipt is `passed/full`, has zero failures, and 163 source pins. The authoritative tar has 189 manifest-matched members, a valid gzip end/trailer, and SHA-256 `ba17805387c8204ef2624caec0af35641771bc8af48d4f03b82c1a6609586d8f`. N5's complete-mode verifier output reports `completeAcceptance: true`.

The local browser capture also passed its eight assertions, but its archive binding does not match: the local file is 12,845,056 bytes / SHA-256 `91e3d977e8efd7ef42a37d43029997a9e2ab8db7266a88cf54d5f7cc90a64b5f`, while the receipt expects 14,983,690 bytes / SHA-256 `1a4fd17fd4f8c2aef16aaa1ed268d253b13dd77396e6cb6da3108e2b2c3921ab`. Its complete-mode verifier exited 2. The root-owned acceptance scope rejects the local container with cause unknown and treats the fresh, independently verified same-source CI archive as authoritative. The local receipt and archive were left unchanged.

## Review method and limits

The independent verifier is `compiled-capabilities/coordination/reviews/XR-ACCEPT-DEMO/verify_packet.py`. It checked the author packet's 104 SHA-256 pins, the primary and local smoke outputs, current-source catalog, archive outputs, AppIR/build pins, event sequence, final state, local rejection, and source-equivalence policy. The final command `python3 compiled-capabilities/coordination/reviews/XR-ACCEPT-DEMO/verify_packet.py` exited 0; its stdout SHA-256 is `3af873daf7a17e9efba478b5112d1b948b90a0be45ecb64572a3c12bc0c87ead`. An initial invocation used an incorrect JSON nesting path and stopped before completing checks. That issue was fixed; attempt 01 failure output and the first corrected output are preserved separately.

Before closure, the final review receipt passed a read-only call to the native `coordination.probe.validate_receipt` helper using `/tmp/gondola-rebalancer-env`. It matched job `XR-ACCEPT-DEMO`, review kind, worker `N1`, and decision `accepted`; no native state was written.

No browser, build, archive, or full regression suite was rerun. Other bounded reviews, root's native scheduling audit, and published delivery-chunk verification remain global gates. No author packet, production source, Git ref, native state, or N4-owned artifact was changed.
