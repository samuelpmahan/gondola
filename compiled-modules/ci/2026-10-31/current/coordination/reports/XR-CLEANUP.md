# XR-CLEANUP — independent review of renderer candidate disposal

**Reviewer:** N6  
**Decision:** `accepted`  
**Author packet:** N5 `E-CLEANUP`  
**Review scope:** sealed host runtime/test source, red/green evidence, and the available N4 mounted-profile summary. No production source, Git state, or scheduler state was changed.

## Finding and decision

The cleanup fix closes the candidate leak on renderer capability rejection. In the initial mount path, each factory return is assigned to `parentRenderer` or `childRenderer` before `requireRenderer` checks capabilities. If validation throws, the mount catch can therefore call `unmount()` on every candidate already created. In the swap path, `nextParentRenderer` and `nextChildRenderer` are likewise retained before their capability checks; before commit, the catch unmounts each retained candidate.

Cleanup exceptions are caught and suppressed in those rejection paths, so they do not replace the original capability or rendering exception. Candidate roots are detached until both renderers pass validation and render successfully.

The sealed test-first red run has four passing tests and three failing cleanup regressions: rejected initial candidate cleanup, cleanup of both candidates after the second initial candidate fails, and cleanup of a rejected swap candidate. I independently reran the focused runtime suite with Node v22.23.4; all 7 tests passed.

The added tests verify the required paths:

- An initial parent candidate fails capability validation, throws from `unmount()`, is disposed once, preserves the capability error, writes nothing to the outer DOM, and calls neither Go `Init`.
- An accepted parent candidate is followed by a child candidate that fails validation and throws during cleanup. Both candidates are unmounted exactly once, the original child capability error is preserved, the outer DOM remains empty, and no Go roles run.
- A swap candidate fails validation and throws during cleanup. The candidate is disposed once; the live pair's renderer, DOM roots, parent/child state, and Go call counts remain unchanged. The previous live callback still dispatches successfully.

The N4 attempt-007 check summary is also present as read-only integration evidence: it reports `matched`, all 12 named React/DOM/swap profiles, six mutation controls detected, and no page errors. This review did not rerun the browser matrix.

## Packet integrity and pins

The E-CLEANUP author report and receipt match their sealed copies. All 29 raw-log index entries verify. The current runtime and test sources match the sealed source inventory exactly:

- `compiled-modules/runtime/runtime.mjs` — 39,892 bytes, SHA-256 `82aa27d2bad433ce945487c38aa3afcb5848655bd39cf62664aa8e94cb5eda42`
- `compiled-modules/runtime/runtime.test.mjs` — 17,192 bytes, SHA-256 `86046cacbac8802caaec8ae7b8982108a053ebb45a171305e619955046e2ab1d`

The red/green logs, exact command output from my focused rerun, and the copied N4 check/run summaries are in `module-coordination/rawlogs/XR-CLEANUP/`.

## Review limits

This review accepts renderer-candidate disposal on initial and swap capability failures, preservation of live-pair state/callbacks on rejected swaps, and original-error preservation when cleanup throws. It does not claim arbitrary renderer behavior beyond these tests. The N4 browser summary is cited as an existing capture, not a browser run performed by this reviewer.

## Pins and commands

- E-CLEANUP report SHA-256: `539f4d3641e646fd6bb8f648ef834a65f801683094b42753c26caa45f56f73a9`
- E-CLEANUP receipt SHA-256: `7224c43d99d8847c790197d5446578a43a92481c8fff608b26f5f66ca583bcd3`
- E-CLEANUP raw-log index SHA-256: `a2b7cd571db320e6c449b7ac27359cdef8bca69f9e0c17dc872c407f064ef25d`
- Independent test: `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-modules/runtime/runtime.test.mjs`
- N4 check summary: `module-coordination/rawlogs/E-HARNESS/attempt-007-mounted/module-pair.check.json`
- Review audit: `module-coordination/rawlogs/XR-CLEANUP/audit.json`
- Review raw-log index: `module-coordination/rawlogs/XR-CLEANUP/index.json`
