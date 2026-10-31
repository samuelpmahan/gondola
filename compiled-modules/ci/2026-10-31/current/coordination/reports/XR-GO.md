# XR-GO — independent review of the sealed Go fixture packet

**Reviewer:** N2  
**Decision:** `amend`  
**Author packet:** N1 `E-GO`  
**Review scope:** sealed Go fixture sources, source inventory and seal, test code, scenario, native CLI trace, and cited compiler evidence. No production source or sealed packet was changed.

## Finding

**A valid enabled Add can produce a publication outside the ABI's admitted count range, leaving parent and child snapshots divergent.** The child `Update` routes an unlocked `add` directly through `counter.Update` without bounding the resulting count (`fixtures/compiled/modulechild/app.go:26–38`). The reused counter increments its `float64` count by one. The parent `Receive` rejects any publication count above `9007199254740991` (`fixtures/compiled/moduleparent/app.go:58–66`). The final ABI ruling says the JS bridge admits finite nonnegative publication counts only through `MAX_SAFE_INTEGER`, while preserving `Count` as float64 (`module-coordination/RULINGS.md:7`).

I ran an external Go witness against the sealed sources. Starting from an otherwise valid child state with `Count=9007199254740991`, step 1, unlocked, and input revision 1, one normal `add` produces count `9007199254740992`. The resulting publication has revision 1, but `parent.Receive` leaves its initial published count and revision at zero. This is a real accepted action at the boundary; parent/child count views can diverge and the host bridge cannot admit the child publication. The exact witness source, command, stdout/stderr, exit, and the initial witness-only compile typo/correction are preserved under `module-coordination/rawlogs/XR-GO/`. No repository source changed during the witness.

A bounded repair should keep every generated child publication in the ABI's accepted numeric range, including step-2 and step-3 additions near the boundary, and add direct Go regression cases for the boundary and rejected/no-op behavior. I did not edit N1's source or rewrite any E-GO artifact.

## Other review checks

The author report and receipt are byte-identical to the sealed copies. The seal hashes match both files. All ten source-inventory entries and receipt source pins match the current files. The parent imports only `modulewire` and `gobi`; the child imports the shared wire package, `gobi`, and the existing `counter` package, not the parent implementation.

The Go behavior otherwise matches the finite contract: exact typed `Input`/`Publication` records; parent revision advancement and safe-revision guard; child step bounds, stale/equal-conflict input rejection, lock behavior, reuse of `counter.Init`, `counter.Update`, and `counter.View`; Reset at zero remains a no-op/disabled and a positive-count Reset remains enabled while locked; parent rejects stale, negative, NaN, infinite, and over-range publications. Tests cover stale and malformed inputs/publications, step 1/2/3 behavior, repeated resets, lock/Add and locked Reset behavior, zero-count Reset, immutable state, and native message/bridge order.

I independently reran the exact targeted Go test command from the report with Go 1.24.0; it exited 0 and produced the same 294-byte stdout (SHA-256 `81ed7152fb485ff42ba1f889f92ee8f98225ece977a811849155f5989647b636`). I independently reran the native replay; it exited 0 and its 208,651-byte output is byte-identical to the sealed native trace (SHA-256 `169b1e20faa959d0c964dc943910e59a33be599287c8e6fbddfae77d39e37a7a`). It contains 24 source events and 16 Go-update checkpoints. Disabled-action events resolve against the current Go view and produce neither a message nor a tick; the native test pins those event indexes and checks bridge order. The direct step-3 add is covered by a separate fixture test, not by this scenario's native trace.

The E-COMPILER artifact/build evidence cited in E-GO is N2's own author evidence, not an independent Go-semantics review. I checked its stable index pin (`445e2207c1660a43cdcd91aebc1c26964a9fceba36ca238b9fd86de1d964d022`), but this review's independent execution is the Go test and native replay above. No browser, mounted pair, or host admission claim is made here.

## Sealed source pins

| Source | SHA-256 |
|---|---|
| `fixtures/compiled/modulewire/modulewire.go` | `9d29a10bdf9069852d861a38ede52f11b40a650da057dbd85070bb7da5c4561f` |
| `fixtures/compiled/modulewire/modulewire_test.go` | `948dbfe7022d3896a91a40d844b1e1a1db3f1fc9f9862abc9773df014f7bd42f` |
| `fixtures/compiled/moduleparent/app.go` | `1da626a1e56e34c9b08bb9d56e6d99f4cbf783439c25053cd61d83eca1830c37` |
| `fixtures/compiled/moduleparent/app_test.go` | `bb9c372618dc1684fd0661befffb2f80e8cec7148aa5c3afe4d56f11971b8c7a` |
| `fixtures/compiled/moduleparent/scenario.json` | `9b99a2d7ac7f9d044bcc590414787ea4a9d934f180503a45aac7684778f94539` |
| `fixtures/compiled/modulechild/app.go` | `1a0906fa3d6efdaefe5f580f6783901c6243c8403108b0b9423d35a2b815a246` |
| `fixtures/compiled/modulechild/app_test.go` | `0dc8dac0473adecab7c3e9d5f82e0a2ab3147ac0d50fca2bc142d11ce8cbab3b` |
| `fixtures/compiled/modulechild/view.go` | `0a860eae91c70fc86535deb56754410a89c20186d658c68642a5476e6f1f7407` |
| `cmd/compiled-modules-native/main.go` | `a94ab417cdc8699b59bba5998a31012e9881f744840a1c79eaba484a2808a056` |
| `cmd/compiled-modules-native/main_test.go` | `1d262d376d219f88f8f0886c69b347bbe205bf7d9e03a91050474180f95ea6d7` |

## Limits

This review finds one Go/ABI range mismatch. It does not dispute the existing typed reducer, counter reuse, source replay, or compiler-emission evidence. It does not establish browser pair mounting, actual renderer swaps, callbacks in a browser, pixel/OS equivalence, arbitrary module graphs, or malicious-code isolation. The E-GO receipt/report and their sealed copies remain unchanged; this review is an additive amendment finding, not a replacement author packet.

Exact custody, current source checks, independent commands, and the boundary witness hashes are pinned in `module-coordination/rawlogs/XR-GO/index.json`.
