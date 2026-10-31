# XR-ORACLE independent review

**Decision: amend.** The hand-authored lifecycle oracle is a strong, independent set of literal expectations, and the later source-pinned attempt-05 browser matrix matches them. However, the frozen E-ORACLE packet's own test source does not pass against the scenario hash it records: its `expectedEffects` assertion contains one cancellation-only row while the scenario contains eight effect rows. N4 repaired that test assertion separately in R-ORACLE. That repair does not retroactively make the original E-ORACLE source pin pass.

## Oracle review

The oracle pins the full component identity `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle` and separates it from the `compiled-lifecycle` display label. It enumerates Init and all 25 Go messages as 26 literal state checkpoints. The renderer replacement is explicitly state-neutral, so its checkpoint preserves four pending requests without adding a Go tick.

The expected state, Gobi tree, rendered view, and effects are written independently of candidate traces. The fixed script includes 16 physical clicks, stale generation-1 replies, duplicate replies, four accepted replies, and ordered cancellation of Grandchild, Child, then Parent. It also asserts that the independent Sibling survives subtree removal. Request expectations bind each exact token and request ID; stale and duplicate completion messages leave the remounted generation unchanged. The mutation controls reject both reordered cancellation and an incorrectly accepted old-generation reply.

DOM expectations include exact `outerHTML-v1`, ordered tree structure and attributes, plus live control path/key/tag/type/value/checked/disabled values. The browser entry reads actual elements from the mounted container, including each element's live `.disabled` property, `.value`, `.checked`, and `.type`; the conformance checker compares these physical values and raw `outerHTML` against the literal oracle at every snapshot. Thus the browser evidence is a physical DOM comparison, not only a renderer snapshot comparison.

## Finding and repair boundary

The frozen test source at SHA-256 `18c88acd…81ebae6d` asserts one `fixture.expectedEffects` row, the `removeParent` cancellation triplet. Its pinned scenario at SHA-256 `45f3f402…46fa0650` has eight rows: four generation-1 requests, the cancellation triplet, and three generation-2 requests. I reproduced this before N4's edit: 4 tests passed and the expected-effects comparison failed. The author packet's recorded 5/5 run therefore does not reproduce against its own frozen source/scenario pair.

N4's separate R-ORACLE repair changes only the test's literal metadata assertion. The oracle module and lifecycle semantics remain unchanged. The current candidate test is pinned at `6a48d1d4…970daf1`; its current unit log reports 5 passed, 0 failed. R-ORACLE also reports 9/9 combined conformance tests. These are evidence for the repaired candidate, not a reason to accept the original E-ORACLE packet.

## Mounted evidence and limits

Attempt-04 is rejected and excluded: its runtime source hash changed during capture (`c6fad592…df7166` to `36e263da…b9aa45`). Attempt-05 is separate and source-stable through its check, with status `matched`. It pins the unchanged oracle module, original test, final scenario, shared runtime, and lifecycle runtime. The test-suite mismatch above remains, and attempt-05 did not execute the oracle unit suite; its integration checker did compare the captured traces and DOM to the literal oracle.

Attempt-05 records 26 events/ticks, 16 clicks, 7 requests, and 3 cancellations in Grandchild/Child/Parent order across React, DOM, and swap profiles. For each of the three profiles, all 27 physical snapshots matched the expected DOM with no mismatch indexes or page errors. At the renderer swap, the four pending requests and Go tick 8 were preserved. After removal, the physical controls show only sibling request and parent remount disabled; after remount, sibling request and parent remount are disabled. The check also records 32 retired-renderer fences and 8 mutation controls detected. This integration evidence is not a passing focused test run for the original frozen test pin.

## Verification and source pins

Toolchain: Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node`; fixed deterministic scenario, no random seed.

- The historical E-ORACLE log reports 5 passed, 0 failed (SHA-256 `2db2aff7…2051e2e1`), but it does not establish that the frozen source/scenario pair passes: rerunning that exact pair before N4's update exited 1 with 4 passed and 1 failed at the expected-effects assertion. The failing reproduction output was not separately retained.
- Current R-ORACLE candidate focused test log: 5 passed, 0 failed; SHA-256 `43b9be83…897dfb7`.
- Current R-ORACLE combined conformance suites: 9 passed, 0 failed; log SHA-256 `60dd7da5…0cd7d05`.
- Attempt-05 source-pinned integration check: `matched`, source stable; run SHA-256 `e4ea41b9…851c106`, check SHA-256 `b1bbd8a4…374718a`, browser SHA-256 `78886a28…abe4763`.
- Attempt-04 source-pin rejection: run SHA-256 `680529bc…8746ee14`, manifest SHA-256 `2e83cbcb…948f9d4`.

| File | SHA-256 |
| --- | --- |
| `compiled-lifecycle/browser/lifecycle-oracle.mjs` (unchanged) | `795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82` |
| Frozen `compiled-lifecycle/browser/lifecycle-oracle.test.mjs` | `18c88acd3e9028af30b1f737599ae537fc1354ea65f37037e5c9f89281ebae6d` |
| Current R-ORACLE candidate test | `6a48d1d46addfa07d4792c3bf71d842c7ea6159eb69c5010b00e540df970daf1` |
| `fixtures/compiled/lifecycle/scenario.json` | `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650` |
| `compiled-lifecycle/CONTRACT.md` | `ed9eedea8f9582583d1f89e44be20e55f692f037f2b8decc93025433e478e083` |
| E-ORACLE report / receipt | `88d80bb25bc6143b2f5f9bc1e1ca26257a64be71dd4fc257792905cc2e4f42ee` / `f7c36952230a9c277ce4d08fd44473e2732fe8110dbf2616540c23182e515fe6` |
| R-ORACLE report / receipt | `8853401cc5311312e78a702db73b6f4b44b4d6ac1456f4020a5c6c9821a870b6` / `ed4ff120f8afedefee089864a3f3d859d6a0120b141b58fe0ffdee8249d641aa` |
| Review audit | `d1adbc1cface46189009377ddd2076bb4cb95212aca83d7510b11764fc31162a` |

No product, oracle, scenario, test, runtime, or harness source was changed in this review. The only new files are this review report, its receipt, and the review audit/test evidence under `coordination/reviews/xr-oracle/`. This review does not merge, deploy, or publish changes.
