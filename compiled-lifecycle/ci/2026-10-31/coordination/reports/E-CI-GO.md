# E-CI-GO: hosted Go lifecycle artifact review

**Outcome: `mixed_change`.** The exact hosted artifact contains passing Go
fixture/native-adapter tests, successful React and DOM GoScript builds, a
successful standalone native replay, a successful 10/10 compiled-runtime
suite, a successful 26-event direct-module replay, completed browser profiles,
and a passing HTTP demo smoke. The full conformance check was rejected before
cross-runtime comparison because the conformance runner tried to spawn a
nonexistent `go` executable inside the checkout. I do not claim full lifecycle
CI acceptance.

## Artifact and source binding

The review is bound to the primary artifact provided for workflow run
`41178420647`, artifact ID `13034915662`, on head
`49cc2b96c8817a47319d5b7bd484184a22fa984b` and tree
`d49ca35b7eda23837c392bbe0d2363551e4c7bec`. The parent download record gives
47,035,803 bytes and SHA-256
`6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`.
The extracted packet is at
`compiled-lifecycle/ci/2026-10-31/extracted/` in this worktree.

The included E-BUILD attempt is
`compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z`. Its execution
record reports a failed overall status and `mixed_change` outcome. Its 122
source pins match both before and after the run; I independently rehashed all
122 paths against this worktree at `49cc`, with zero missing or differing
files in either set. I also independently rehashed the React and DOM output
pins: 67 files per backend before and after conformance, with zero
mismatches. The attempt's internal archive has 241 manifest members; all 241
member sizes and SHA-256 values match, across 158,843,470 uncompressed bytes.
The JSON verification details and evidence pins are in
[`audit.json`](../../ci/2026-10-31/lanes/go/audit.json) (SHA-256
`aaaa74b18e8df8b0beb2dc2b216f0b875538cee9687166ba8373732f8c52d1fc`).

## Passed Go and compiled-module evidence

- Hosted `go test ./compilercontract ./gobi ./fixtures/compiled/lifecycle ./cmd/compiled-lifecycle-native` and compiler package Go tests both exited successfully. Their stdout logs are under the attempt's `logs/` directory and are SHA-pinned in `audit.json`.
- The native adapter binary built successfully. Its standalone `--script` probe exited zero and produced the 26-step `gobi.compiled-lifecycle-native/v1` replay. It records seven `fixture.request/lookup` effects, followed by child-first cancellation of grandchild, child, and parent, with three old-generation replies fenced as no-ops. The sibling request survives; duplicate replies are no-ops; the final request ID is 7. The native binary SHA-256 is `897f021e17529503724c1535178255546308e98d365fe31ebd5ff57444837655`.
- React and DOM GoScript builds each returned `ok: true` with zero diagnostics and one app. Both AppIRs identify the component by the canonical package path `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`. The `Init`, `Update`, and `View` AppIR roles bind to their corresponding Go symbols and generated `GobiCompiledInit`, `GobiCompiledUpdate`, and `GobiCompiledView` exports. React and DOM AppIR and encoder bytes are identical; backend-specific compiled modules differ, so no raw-bundle equality is claimed.
- AppIR declares `Update` as returning `[]github.com/samuelpmahan/gondola/gobi.Effect`, a slice of the declared Gobi effect struct. It gives `uint64` the `bigint` JavaScript representation. Direct emitted-module trace values encode `Generation`, `RequestID`, and `NextRequestID` as exact decimal integer strings. Its 26-step trace ends with generation 2 for the remounted parent subtree, generation 1 for the sibling, request IDs 5/6/7/4, and no pending requests.
- The hosted compiled lifecycle runtime suite passed 10/10. It includes real compiled append effects going through the signature-typed encoder, acceptance of a nonzero-offset GoSlice, rejection of malformed GoSlice wrappers and malformed Gobi Effect fields, and rejection of unexpected fields in the typed effect Value.
- The lifecycle browser stage completed React, DOM, and alternating-swap profiles. Each contains 26 events and 27 snapshots, zero page errors, and no pending request at the end; the alternating profile records 17 renderer swaps. The separate HTTP demo smoke passed all 12 checks, including request cancellation, remount, stale and duplicate replies, four renderer swaps, and an empty pending-effect set.

## Blocking failure and limits

The full conformance record is
`compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/lifecycle.run.json`
(SHA-256
`1c4ba7c6882faccb760bfb182bacad709d91bd8efd81bc320cf834b0e40364a8`). Its
native replay stage failed with:

```text
spawnSync /home/runner/work/gondola/gondola/go ENOENT
```

The recorded arguments passed `--native-go go`. In the current conformance
source, option values are resolved against the checkout path, so the bare
executable name became `/home/runner/work/gondola/gondola/go` instead of
remaining a PATH lookup. That prevented the harness's required Go CLI replay
from starting. The independently built native binary probe did pass, but the
final exact cross-runtime conformance check was withheld; the lifecycle run
record is `rejected` and has no passing final comparison.

The direct emitted-module and browser-profile stages completed independently,
but they do not replace the omitted Go CLI comparison or the withheld final
checker. Therefore this artifact establishes successful bounded component,
native-adapter, effect-bridge, direct-module, browser-profile, and demo checks,
not a complete hosted lifecycle CI pass. I made no source, runtime, or Git
changes in this review. No tests were rerun locally; conclusions above use the
hosted logs and artifact records.
