# XR-HARNESS: independent review

**Reviewer:** N1  
**Decision:** `accepted`  
**Date:** 2026-10-31

## Review result

The sealed N4 capture supports its finite 13-case claim. The raw report lists the exact three healthy profiles and ten fault profiles in the oracle's fixed order. All 13 report-relative case evidence files match their report SHA-256 values. I independently re-derived each case's changed channels from its five expected/observed comparison pairs and confirmed that those channels match both the raw row and evidence record.

The healthy React, DOM, and swap profiles each match 50 source events and 46 state checkpoints. The full baseline checker reports `matched`, including 34 physical click actions per profile. The ten faults each have one actual activation record, with the expected renderer, fault, event index, and DOM target path. Initial-render faults have no scripted source event and are recorded after the first rendered update; click faults target event 0 at `1/0/1`. The evidence contains before/after target snapshots, actual physical-DOM observations, and full typed state comparisons against the pinned literal oracle. All cases report empty page and infrastructure error arrays.

Dropped clicks record one renderer callback attempt and zero forwarded dispatches; the runtime stays at its initial tick while the expected event-0 state differs. Duplicate clicks record two forwarded dispatches and three trace ticks total, which is the initial checkpoint plus two actual Go updates. Neither fault passes from its stored exception alone: each has semantic channel differences, and the Go certificate independently validates all 13 cases as qualified.

## Specific evidence and limits

The raw capture is `rawlogs/E-HARNESS/attempt-04-node22-source-pinned/qualification.raw.json` (7,820 bytes, SHA-256 `4222a32d73fde4e9fa31e534ebad7ab61fae8337f6cff7e0b2c9b05486586bcf`). The summary is 12,468 bytes, SHA-256 `3110e119c325eb644c26671290c482b09ee8408f6a9eca868e0066b5f36c3cc0`; it reports matched status and stable before/after pins for all nine build, fixture, oracle, trace, and plan inputs. N4's raw-evidence verifier reports 13 evidence hashes verified and derived channel pairs matching. I also rehashed those inputs and source files in the XR-HARNESS audit log.

The rendered-DOM path is grounded in `inspectRaw()`: it separately obtains `physicalDOM` by reading actual `#app` elements and controls, records any physical-DOM read error, and the qualification runner prefers that physical snapshot over the renderer snapshot. Expected DOM/state are loaded from the plan-pinned, independent literal oracle. Enabled-control evidence shows path `0/1` disabled in the expected checkpoint and enabled in physical DOM; text and row-order faults likewise have actual before/after DOM changes.

Each case gets a fresh Playwright `browser.newPage()`, then the runner invokes the mounted instance's `dispose()` and closes the page in `finally`. No cleanup or page error was recorded. The Go certificate, at SHA-256 `6877bc6cb8fc31d58d5378f2ac4770c6bf85f30dd06f6918398dd06b0f335174`, reports qualified=true for all 13 cases.

The healthy swap profile records 36 total renderer callback invocations because its two intended retired-callback probes are included in that counter. Both probes are fenced and leave trace/state unchanged. The healthy semantic dispatch comparison is the 34 physical click actions; the profile and event records confirm each click dispatched once. This distinction does not alter the matched full-baseline result.

The report explicitly labels its caller-supplied 40-character `sourceCommit` as the contract-base source with `author-uncommitted-base-source` attestation. This is accurate for N4's author run; it is not a final-candidate source claim. Root's pinned candidate rerun remains necessary for final source acceptance.

Two initial reviewer-audit attempts contained incorrect assertions: the first expected the healthy swap's total callback counter to equal its physical click count; the second looked for the accepted-swap preservation field at the wrong nesting level. Both attempts are preserved. The corrected read-only audit passed; no N4 source change was needed.

## Frozen pins

| Artifact | SHA-256 |
| --- | --- |
| N4 runner `qualification.mjs` | `18991f813d2bfb78499b542a0b99dfd2eae3252fec6c61203759abbde744b050` |
| N3 renderer decorator | `c6e75b5a6b935b7d009ce0fd6d5a0d58f6490bfe44c5a34c54b3ba8544a2ba31` |
| N3 browser-entry seam | `b99a9d24fd39bfb59662ca6859559f508f60f8da07b3777a004d4397b2ee2492` |
| E-HARNESS report | `b5efb360092481faa6b0f2571fcd295dc3992e65eb6ff3edd76df584b407cbb5` |
| E-HARNESS receipt | `385d47787449f422b715b9757ccc71dbbdfd0add043d22deeed4be870b0ec08e` |

