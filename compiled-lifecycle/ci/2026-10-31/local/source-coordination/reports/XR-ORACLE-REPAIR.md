# XR-ORACLE-REPAIR independent review

**Decision: accepted.** The R-ORACLE change correctly aligns the frozen test's literal `expectedEffects` assertion to the exact final fixture scenario. The change is limited to that one assertion block; the hand-authored oracle and its independent state/effect/DOM expectations remain byte-identical to the preserved pre-repair packet.

## Isolated reproduction of the before state

I copied N4's preserved original oracle module and test from `coordination/reviews/r-oracle/before/` into an isolated path under this review directory. I copied the exact scenario currently pinned by E-ORACLE (`fixtures/compiled/lifecycle/scenario.json`) and the oracle's comparison dependency into the matching relative paths. All four copied source hashes match their inputs: original oracle module `795ba7fe…217cb82`, original test `18c88acd…81ebae6d`, scenario `45f3f402…46fa0650`, and comparison module `29426a90…f8d12cc`.

The retained child command is `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-lifecycle/coordination/reviews/xr-oracle-repair/pre-repair-mirror/compiled-lifecycle/browser/lifecycle-oracle.test.mjs`, run from the repository root with Node `v22.23.4`. The test resolves both the scenario and comparison dependency within the mirror; it does not read the live modified test. It exited 1 with **4 passed, 1 failed**. The sole failure is the first test's deep-equality assertion: the old literal contains only the removal cancellation row, while the exact scenario has eight rows (four generation-1 requests, the ordered Grandchild/Child/Parent cancellation triplet, and three generation-2 requests). Captured stdout, stderr, exit code, and child command are retained under `coordination/reviews/xr-oracle-repair/captures/pre-repair/`; mirror inputs remain available under `pre-repair-mirror/`.

This is a fresh retained reproduction. The historical E-ORACLE log reports 5/5, but cannot establish that the preserved original test passes with the exact final scenario it pins. The isolated run resolves that evidence gap without altering either frozen source packet.

## Repair review

The diff from the preserved original test contains exactly one change: `fixture.expectedEffects` now lists all eight literal rows, with the seven exact `fixture.request/lookup/token/complete` request descriptors and the exact `lifecycle.cancel/cancel/token/""` triplet in Grandchild, Child, Parent order. The final test passes against the final scenario. The repair does not derive expected values from candidate traces.

The oracle module is still hash `795ba7fe…217cb82`, identical to the preserved before copy. Since the test diff is confined to the `expectedEffects` assertion, the manually enumerated 26 states, 26 steps, view/tree/DOM expectations, request/reply semantics, sibling-survival expectation, and mutation controls are unchanged. The unchanged mutation test rejects reordered cancellation and a changed state after accepting an old generation reply. The E-ORACLE report and receipt also remain byte-identical to their preserved copies.

## Verification

Toolchain: Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node`; deterministic fixed scenario, no seed.

| Check | Result | Captured evidence |
| --- | --- | --- |
| Isolated preserved-before test with final scenario | Exit 1; 4 passed, 1 failed at the stale `expectedEffects` assertion | `coordination/reviews/xr-oracle-repair/captures/pre-repair/` |
| Current focused oracle suite | Exit 0; 5 passed, 0 failed | `coordination/reviews/xr-oracle-repair/captures/focused-final/` |
| Current combined lifecycle/frontend conformance suites | Exit 0; 9 passed, 0 failed | `coordination/reviews/xr-oracle-repair/captures/combined-final/` |

The test runner and isolated replay commands, stdout, stderr, and exit codes are retained separately. Existing Node `EnvHttpProxyAgent` warnings appear on stderr; they do not change the recorded exit statuses.

## Bounded attempt-05 audit

I independently rechecked retained attempt-05 artifacts with `audit-attempt05.mjs`. Its run and check records are `matched`, sources and build outputs stayed stable through the check, and the actual component ID is the full package path. Native, direct, browser trace, and physical-DOM checks are recorded as passing. Each React, DOM, and swap profile has 27 snapshots; for every snapshot I compared the captured physical `outerHTML-v1` plus live control fields against its literal `expectedDOM`, and also checked renderer snapshots. All comparisons match and each profile has no page errors.

This audit is bounded to the existing attempt-05 capture. That run pinned the old test hash `18c88acd…81ebae6d` and did not execute the oracle unit suite. It is physical integration evidence for the unchanged oracle semantics, not a fresh matrix on the repaired test source. No fresh E-BUILD matrix was run or claimed here.

## Pins and evidence

- R-ORACLE author report/receipt: `8853401c…1a870b6` / `ed4ff120…9d641aa`.
- Repaired test SHA-256: `6a48d1d46addfa07d4792c3bf71d842c7ea6159eb69c5010b00e540df970daf1`.
- Unchanged oracle SHA-256: `795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82`.
- Unchanged scenario SHA-256: `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650`.
- `source-pins.json`: preserved before inputs, final inputs, mirror copies, and author artifacts.
- `attempt05-audit.json`: independent bounded audit of retained physical browser evidence.

No fixture, oracle, scenario, runtime, renderer, or conformance source was changed in this review. No Git, native, merge, deploy, or publication action was performed.
