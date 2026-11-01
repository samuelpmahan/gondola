# E-GOCOMPILE — Go compiler compatibility repair

**Worker:** N1  
**Outcome:** `mixed_change`  
**Repository base:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Changes

Fixed a shadowed local in `projectReachableLocalDependencies`: the walk now follows the body of each newly projected dependency, so dependencies below `modulechild` are visited. The loader also roots `Input` and `Publication` only when the existing typed child-bridge validator accepts the complete pair. The keyed parent remains unchanged. The focused loader test confirms the wrapper bridge roles, `modulechild.Input`/`Publication`, and `counter.Init`/`Update`/`View` all enter the typed program. A second-depth unsafe integer operation still receives the existing numeric-profile diagnostic.

The child mount parser uses `strconv.ParseUint(value, 10, 53)`, rejects errors and zero, and requires `FormatUint` to reproduce the input. The analyzer admits only a direct `strconv.ParseUint` call with constant base 10 and bit size 53. This bounds successful values at JavaScript’s maximum safe integer. Width 64, dynamic base, and dynamic bit size remain rejected; the general call allowlist and numeric arithmetic/conversion rules did not change. Reply handling compares against the exact token regenerated from Go-owned key, generation, and request ID, so it does not parse callback data.

The native CLI adds `-mount-boundaries`, which executes the Go wrapper and emits full state/effect steps for ten mount inputs. The valid maximum-safe generation cases exercise mount, request, completion, and cancel/retry. Invalid inputs include maximum-safe plus one, zero, a leading zero, malformed input, uint64 maximum and overflow, a non-ASCII digit, and another byte.

## Verification

Go 1.24.0 tests passed for `fixtures/compiled/effectmodulechild` and `cmd/module-effects-native`. Go 1.27.3 tests passed for the complete `compiled-frontend/analyze` package, including both loader regressions and positive/negative ParseUint call-site tests. Raw output is in `rawlogs/E-GOCOMPILE/go24-native-tests.log` and `go127-analyzer-tests.log`.

The canonical E-BUILD run completed four independent builds: React parent, React child, DOM parent, and DOM child. The unchanged keyed parent ABI comparison passed. Both child builds retained the five standard roles `Init`, `Update`, `View`, `Input`, and `Publication`, and admitted only the closed request and cancellation descriptors. E-BUILD’s final index is `rawlogs/E-GOCOMPILE/E-BUILD-final/build-index.json` (SHA-256 `70046a0e7f1070c3ec2ad2186e060137a77f2d8df02b5c23bb1760baf156c444`). The index pins the 59-file build source closure and generated artifacts.

The emitted React and DOM child implementations each matched the native Go boundary trace across 10 cases and 16 steps. Each backend accepted the two maximum-safe flows and left all eight invalid mounts unchanged. Full Go state fields and ordered effect descriptors matched. The React and DOM child effect probes also passed with four observed request/cancel effects and two unique closed descriptors. The boundary trace is in `rawlogs/E-GOCOMPILE/mount-boundaries-native.json` (10,451 bytes; SHA-256 `99495344d001201fde88b538e5b1b34fda7bd2ed212b9d41fab2833de2b6d886`).

The native literal replay produced 31 events, 32 states, 10 Go effects, 20 transport rows, one retired child, and no pending requests. Its 1,103,548-byte output is pinned in `rawlogs/E-GOCOMPILE/native-literal.json` (SHA-256 `dffa1412facedeb3d5047f0def6f297dfe296c8ca070a3519a606e50a668ebc8`).

## Preserved attempts

All failed compiler probes remain under `rawlogs/E-GOCOMPILE/probe-02` through `probe-06`. Probe 02 reported 18 unsupported reachable calls, including the wrapper-to-modulechild-to-counter path. Probe 03 isolated seven parser calls after dependency traversal was repaired. Probe 04 rejected a handwritten parser’s unproven loop/index and integer arithmetic. Probe 05 reached module ABI description but rejected the effect capability. Probe 06 completed all four builds but its copied admission validator rejected the child’s `uint64`/`bigint` representation. The final E-BUILD run resolved those gates; no failed attempt was overwritten.

## Limits and ownership

This packet records the Go repair, analyzer tests, native replay, four compiler builds, and emitted boundary parity. Host/browser conformance, seeded cross-adapter parity, demo, archive, and publication remain owned by their lanes and root. The full repository test suite was not run. N1 made no Git or scheduler changes and did not modify the sealed E-GO receipt/report. `moduleabi/descriptor.go` was changed by the E-BUILD lane under root authorization; it is recorded as an external build dependency, not an N1-owned file.

Exact versions, commands, source hashes, raw probe requests/results, and output hashes are indexed in `rawlogs/E-GOCOMPILE/index.json`.
