# E-CI-ORDER preflight notes (not CI acceptance)

Status: **provisional only**. The pinned source worktree is `49cc2b96c8817a47319d5b7bd484184a22fa984b` (tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`). The primary push run `41178420647` and PR run `41178477290` were still reported `in_progress` when these notes were made. The final primary CI artifact has not been received or audited. Do not cite these notes as final CI evidence.

## Local accepted preflight evidence

Read-only inspection of the original workspace's explicit lifecycle-only E-BUILD attempt at `/workspace/scratch/39a56936f173/gondola/compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z` found:

| Artifact | SHA-256 |
| --- | --- |
| `matrix/lifecycle.run.json` | `7dc4d7c31ecd83225be87b55a2f5e26548563a445db282c9e0eec00379b6ceb9` |
| `matrix/lifecycle.check.json` | `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a` |
| `matrix/lifecycle.browser.capture.json` | `cf72ae8a2c030cbceafe5175a282717fcff6780c6b34cadab1f84d18483353c5` |
| `matrix/lifecycle.native.json` | `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5` |
| `matrix/lifecycle.direct.json` | `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71` |
| React build record | `36c962c08bece3b14d0d4ed2742bda23f6b758675254f90b7ef2041f3ddbbbb7` |
| DOM build record | `1754673ffb812b375e830d2aff8a4906dfcc0ab1f6ccbd7e572b0c66cac9cdbe` |

The local run record reports `status: matched`, stable sources and build outputs, 26 events/ticks, 16 clicks, 17 renderer swaps, 7 requests, and 3 cancellations in exact order `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`. It records pending requests surviving the fixed renderer swap, 16 callback-eligible swaps and 1 ineligible swap, 32 retired-renderer fences, 18 stale physical clicks across React/DOM/swap profiles, and a physical-DOM literal-oracle check. For all three browser profiles, raw captures show empty page-error lists, empty pending work at end, and successful unmount with empty renderer snapshot and physical DOM (`html: ""`, zero controls). The stale retained-element probe records six attempted clicks per profile; targets are detached and trace, snapshot, callbacks, pending requests, effects, and physical HTML remain unchanged.

The fixed script's stale direct Go messages occur after remove/remount and before the generation-2 requests. The fixed script also force-delivers the three canceled generation-1 host callbacks immediately after removal and expects each runtime completion to be rejected. It does **not** test those stale paths after fresh generation-2 requests are already pending; this must not be inferred from the fixed CI script.

## Separate supplementary live-pending probe

The allowed E-LIVE-REPLY supplementary probe used the same generated app from this local attempt and separately tested the stronger sequence with all fresh generation-2 requests pending before stale delivery. Its report SHA-256 is `37b89d47871ee674963ebe986d5ad89e6541ff75db01918312a54dd3a66c77b4`, receipt SHA-256 is `afbb2cd55e8e6f8cc5159256cd0dce79fd684c0b4bc68c8b18e6467a556b575a`, and native/compiled cross-audit SHA-256 is `4941a6596a737dffe5bcd39aad9a7b142b491f0a03b7f3fdccf4aa42d9c6a101`. It is headless evidence from the actual compiled GoScript host and native Go, not evidence that this sequence ran in primary CI or in a browser.

## Next audit boundary

When the primary CI artifact is supplied, independently pin the downloaded artifact and extracted files, check the CI source/run identities and raw records, then close `E-CI-ORDER` based only on what the artifact actually contains. Keep this local preflight and the supplementary live-pending probe as separate evidence classes.
