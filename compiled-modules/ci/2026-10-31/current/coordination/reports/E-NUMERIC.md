# E-NUMERIC — safe child counter Add boundaries

**Outcome:** `mixed_change`  
**Worker:** N2  
**Scope:** `fixtures/compiled/modulechild/app.go`, `fixtures/compiled/modulechild/app_test.go`, and this packet's raw evidence. The sealed E-GO and XR-GO packets were left unchanged.

## Change

The child now checks the complete Add size before calling the existing counter reducer. For step 1, the current count must be below `MAX_SAFE_INTEGER`; for steps 2 and 3, it must be at most `MAX_SAFE_INTEGER - step`. The check is performed before any `counter.Update` call, so an overflowing multi-step Add is rejected as a whole. Valid Adds still invoke `counter.Update` once per step. A nonnegative check also rejects invalid negative/NaN/positive-infinite counter values from entering the counter path. Reset logic is unchanged.

Regression tests cover: step 1 already at the maximum; step 1 reaching it exactly; step 2 and step 3 reaching it exactly; step 2 and step 3 starting one count above their safe threshold and remaining unchanged; publication at the current revision accepted by the parent for each case; and Reset at the maximum while locked, followed by an accepted zero-count publication.

## Test-first evidence and verification

The new boundary table failed before the source fix: step 1 at the maximum and step 2/3 overflow cases all produced `9007199254740992` rather than an unchanged state. The expected red is preserved in `rawlogs/E-NUMERIC/test-red.stdout.log`; command and exit are recorded alongside it. Formatting/build-evidence collection setup mistakes and their corrections are separately documented under `rawlogs/E-NUMERIC/failures/`; neither represents a Go source or compiler build failure.

Go 1.24.0 commands passed after the change:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 ./fixtures/compiled/modulechild
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 ./fixtures/compiled/modulewire ./fixtures/compiled/moduleparent ./fixtures/compiled/modulechild ./cmd/compiled-modules-native
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go run ./cmd/compiled-modules-native --script fixtures/compiled/moduleparent/scenario.json
```

The native scenario remained byte-identical to the sealed E-GO trace (208,651 bytes, SHA-256 `169b1e20faa959d0c964dc943910e59a33be599287c8e6fbddfae77d39e37a7a`) because it does not approach the numeric boundary. Exact green commands, environment, stdout/stderr pins, and exit codes are in `rawlogs/E-NUMERIC/native-test-index.json` (SHA-256 recorded in the receipt).

I rebuilt the updated child with the actual GoScript CLI separately for React and DOM, using the Go 1.27.3 compiler toolchain. Both commands exited 0, returned `ok:true`, and produced 70 files, including refreshed AppIR, compiled module, encoder, components, and module ABI sidecar. Output roots are:

- `/tmp/gobi-module-gate1-numeric-react-modulechild-20261031`
- `/tmp/gobi-module-gate1-numeric-dom-modulechild-20261031`

A Node 22.23.4 probe imported each freshly built child alongside its corresponding unchanged parent module and exercised the six boundary cases through the real compiled GoScript `Update`, generated `Publication`, and parent `Receive` bridge. React and DOM each passed all six cases, proving no emitted child publication diverges from the parent's accepted current-revision snapshot at the tested boundary. The two bridge probes are recorded in `rawlogs/E-NUMERIC/node-boundary-index.json`.

## Source pins

| File | SHA-256 |
|---|---|
| `fixtures/compiled/modulechild/app.go` | `68d462ac1ca616f05249392cbac894fbd954687441377e255944c84a74441265` |
| `fixtures/compiled/modulechild/app_test.go` | `2e4d1234fcf9973c96a73c50a450e796cf43ca328a7fb7cbd20c69892876b6c1` |
| Frozen contract | `ba6dbd37c15c83068216702f5c864af5e423d0871490a890a65052bd66710020` |
| Numeric ABI ruling | `d511895dddae81392d3bab6ebb34970019f7ea2556818142070d38327620b0c0` |

## Limits

The regression tests seed the child count at boundary values instead of replaying trillions of Adds; they exercise the production Go reducer and freshly emitted GoScript reducer from those states. This packet establishes numeric Add/Reset behavior for the frozen three-step counter fixture only. It does not claim browser-mounted pair acceptance or general numeric behavior for arbitrary apps. Prior E-GO/XR-GO findings and receipts remain preserved; this repair closes only the out-of-range publication finding.
