# XR-ACCEPT-NATIVE

**Decision: accepted for the native/direct lifecycle and React/DOM output lane.** The captured local evidence and authoritative same-source hosted CI evidence agree on the lifecycle trace and backend-independent outputs. The local archive container remains rejected with cause unknown. This review does not close the overall capability milestone.

## Source and terminal CI evidence

The reviewed source is commit `60b5aeff3172837ad7831c2b78b210454a3d81a2`, tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`, parent `a2e1164d68abaaa7d028bdaf6a20bea842a131ae` (PR 15). The source-bound terminal catalog is 135,588 bytes, SHA-256 `b69f432f53e8d4ff85ae0d855bbfabec35f76febb4830853d313cb0a8b2d9bfc`; it contains 30 runs and 30 jobs (15 push and 15 pull request), all completed-success on the reviewed commit/tree. I rehashed and parsed the run-list response and each of the 30 per-run job snapshots.

The local full attempt `attempt-20261031T103735751Z` and hosted full attempt `attempt-20261031T103752934Z` both have passing E-BUILD receipts, 17 successful commands, no recorded failures, and stable source pins. The source-matched hosted artifact's outer ZIP and complete inner archive/manifest/snapshot are tied to the terminal cohort. This lane's scoped source evidence uses the fresh hosted artifact as authoritative; it does not rely on the local archive.

## Native and direct lifecycle evidence

The frozen scenario has 26 physical events, including 16 clicks. Each local native and direct trace has 26 steps with a state and view at every step. The direct trace records 26 ticks including the initial state; 25 event updates occur, and one physical event is a no-op. Event indices and message ordering match the frozen scenario. The captured conformance record reports `matched` and confirms both native and direct traces were checked against the literal oracle.

There are seven request effects in order: `parent:g1:r1`, `child:g1:r2`, `grandchild:g1:r3`, `sibling:g1:r4`, `parent:g2:r5`, `child:g2:r6`, and `grandchild:g2:r7`. The three cancellations are child-first: `grandchild:g1:r3`, `child:g1:r2`, then `parent:g1:r1`. Both local and hosted copies of the native trace, direct trace, and lifecycle check JSON are byte-identical.

## React and DOM outputs

Each of the local React, local DOM, hosted React, and hosted DOM builds has 67 output files. I rehashed every build-record pin and verified that the physical output inventory exactly matches its pins. For each backend, local and hosted output path sets match; 65 of 67 files are byte-identical. The only differences are:

- `apps/lifecycle-7e6575d90707/gobi-compiled.mjs`, whose source-path comments refer to different temporary build roots. The non-comment module content matches; raw module hashes are retained separately.
- `forwarders/go.mod`, whose repository-root replacement differs between local and hosted environments. The files match after normalizing that path.

React and DOM AppIR files are byte-identical, as are their encoder files, both within each environment and across local/hosted builds. The AppIR declares `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. No claim of raw module bit-identity is made.

The captured toolchain records match on Node `v22.23.4`, compiler Go `1.27.3`, and locked dependencies. They report the local/hosted npm, root Go, and Chromium versions separately; these differ as documented in N2's report.

## Local archive disposition and review method

The local receipt expects 14,983,690 bytes and SHA-256 `1a4fd17fd4f8c2aef16aaa1ed268d253b13dd77396e6cb6da3108e2b2c3921ab`. The preserved local file is 12,845,056 bytes with SHA-256 `91e3d977e8efd7ef42a37d43029997a9e2ab8db7266a88cf54d5f7cc90a64b5f`. Root's integrity record rejects this container and records the cause as unknown. The original local archive and receipt remain unchanged. The rejected local container is separate from the accepted native/direct trace evidence and same-source hosted archive evidence.

The read-only review audit is `compiled-capabilities/coordination/reviews/XR-ACCEPT-NATIVE/audit_native.py`; its JSON output is `audit.json`. It verifies all source pins referenced by N2's packet, the catalog and all job snapshots, trace structure/order/effect counts, all 268 physical backend output files, cross-environment differences and normalizations, and the local archive disposition. It does not rerun a build, browser smoke, or full test suite.

Overall milestone gates remain open, including root's native scheduling audit, the remaining independent acceptance reviews, and delivery reconstruction checks. No production code, source, Git refs, or native scheduler state were changed by this review.
