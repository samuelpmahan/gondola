# E-GO — typed parent/child Go fixtures and native oracle

**Worker:** N1  
**Outcome:** `mixed_change`  
**Scope:** `fixtures/compiled/modulewire/**`, `fixtures/compiled/moduleparent/**`, `fixtures/compiled/modulechild/**`, `cmd/compiled-modules-native/**`, and this lane's report/receipt/rawlogs.

## Implementation

Added the shared `modulewire.Input{Step int, Locked bool, Revision int}` and `Publication{Count float64, Revision int}` records. The parent app owns step, lock, revision, and its accepted publication snapshot. The child app imports only `modulewire` and the existing `counter` package; its Go `Input` bridge applies newer valid inputs and its standard Update uses `counter.Update` for Add/Reset. Add applies steps 1–3, lock blocks Add, and Reset is a no-op at zero and stays enabled at positive counts regardless of lock. Parent Receive rejects stale revisions and invalid counts; finite fractional float64 publications remain accepted.

Added the canonical 24-event source scenario and native command. The native runner initializes both Go apps, applies the six-call initial bridge sequence, then executes each parent or child event through the frozen synchronous bridge order. It preserves action intent separately from resolved message/no-dispatch status and emits pair state and both Go view trees after each of the 16 Go Update calls. Renderer swaps, disabled-action probes, and the retired callback probe remain tick-free source events. The parent fixture does not import the child implementation; only the native oracle composes both packages.

## Verification

Go version: `go version go1.24.0 linux/amd64`.

Targeted Go tests passed:

```text
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 ./fixtures/compiled/modulewire ./fixtures/compiled/moduleparent ./fixtures/compiled/modulechild ./cmd/compiled-modules-native
```

The test log is at `module-coordination/rawlogs/E-GO/tests.stdout.log` (exit 0). Tests cover step and revision boundaries/overflow, repeated reset, stale/malformed input and publication no-ops, fractional float64 publication acceptance, counter Add/Reset and lock rules, disabled controls, immutable Go values, bridge ordering, and CLI source-event/checkpoint mapping.

The native replay command completed with exit 0:

```text
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go run ./cmd/compiled-modules-native --script fixtures/compiled/moduleparent/scenario.json
```

Output: `gobi.compiled-modules-native/v1`, 24 source events and 16 Go update steps, SHA-256 `169b1e20faa959d0c964dc943910e59a33be599287c8e6fbddfae77d39e37a7a` (208,651 bytes). The full native JSON is preserved at `module-coordination/rawlogs/E-GO/native-trace.json`.

N2 independently built the parent and child in four separate compiler invocations (React and DOM for each module). Its targeted build test and compiler suite passed. Evidence: `module-coordination/rawlogs/E-COMPILER/stable-builds/index.json` SHA-256 `445e2207c1660a43cdcd91aebc1c26964a9fceba36ca238b9fd86de1d964d022`; compiler validation index SHA-256 `d6140a3653336a81644f3175cf30e6ec5438c8eb90a4ca778624570cb741f7de`. The four output manifests describe one module each and carry the expected parent (`Output`, `Receive`) or child (`Input`, `Publication`) bridge roles. N2's build command and environment are recorded in that evidence index.

## ABI preflight witness

During read-only integration preflight, I found `moduleabi.ValidateDescriptor` accepted an actual parent descriptor after changing an artifact byte count to `9007199254740992` and recomputing both digests. The original accepted output, exact descriptor bytes, and reproducer are preserved in `module-coordination/rawlogs/E-GO/preflight-unsafe-artifact-bytes/`. N5 added a `MAX_SAFE_INTEGER` cap to `Artifact.Bytes`; rerunning the same reproducer against the repaired source returned `REJECTED: invalid artifact record at index 0` (exit 0). The pre-fix `moduleabi/descriptor.go` hash was not captured before N5's edit; the rawlog note distinguishes the post-fix hash from the accepted witness. This integration finding did not require an E-GO fixture change.

## Limits

This lane verifies the typed Go reducers and native source replay, plus the separately compiled React/DOM build evidence cited above. It does not claim a composed browser run, ABI-pair host acceptance, renderer-swap behavior in a real browser, pixel/OS equivalence, or general Go module graph support; those are covered by their assigned lanes and later integration gates.

## Source pins

| File | SHA-256 |
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

No Git, scheduler, or shared compiler/host/ABI source was changed by N1.
