# XR-CAPTURES — independent Go capture-verifier review

**Reviewer:** N3  
**Decision:** `amend`

## Packet and baseline verification

The sealed E-CAPTURES report and receipt match their seal hashes. Both owned Go files and all listed fixture/source dependencies match their recorded sizes and SHA-256 values. The seven captured native/direct/browser files match the E-CAPTURES input pins, as do the author raw-evidence records and N4's cited positive-plus-ten-mutation output. The actual capture root is `/tmp/gobi-published-restore-check`; no baseline input was modified.

I reran the focused Go test on that root with Go `1.24.0 linux/amd64`:

```text
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GOBI_MODULE_CAPTURE_ROOT=/tmp/gobi-published-restore-check /tmp/gondola-go/go/bin/go test ./modulequalification -run '^TestCheckCapturesAgainstRestoredModuleRun$' -count=1 -v
```

It passed and returned the pinned finite result: 12 profiles, 144 source events, 99 Go updates, seeds `[20261031, 20261032, 20261033]`, and `MutationControls: 0`. The Go checker replays the fixed canonical scenario using the real parent/child Go functions, regenerates each deterministic seed stream, derives typed state, views, DOM, disabled status, messages, bridge sequence and call counts, and compares native/direct/browser records against that replay. It requires each of the three fixed and nine seeded profile keys. A separate mutation removing `profiles.seeded.seed-20261031-react` was rejected at that required lookup, as expected.

## Findings — accepted capture mutations

### 1. Native zero-valued state fields are not required to be present

The native capture is decoded into typed Go structs and then compared with `reflect.DeepEqual`. Strict decoding rejects unknown/duplicate fields and malformed JSON, but standard Go decoding treats an omitted or `null` numeric/bool field as the zero value. Since several legitimate fields are zero in the initial state, the checker accepts captures that omit actual state values.

On separate hard-link overlays of the actual capture, each mutation below still made `TestCheckCapturesAgainstRestoredModuleRun` pass (exit 0):

- `initial.childState.Counter.Count`: `0` → `null`.
- `initial.childState.Counter.Count`: delete the field.
- `initial.parentState.PublishedCount`: `0` → `null`.

The exact source and mutated capture hashes, paths, commands, and outputs are in `rawlogs/XR-CAPTURES/typed-zero-fields/`. Require exact field presence for the native typed state before comparing it with the replay, including when the expected value is zero.

### 2. Browser renderer identity is not bound to the expected profile

The browser profile checker compares the requested `profile` label, but it does not compare `initialBackend`; `compareBrowserTrace` likewise never checks `trace.backend`. I changed both `profiles.react.initialBackend` and `profiles.react.trace.backend` from `react` to `dom`, left the profile label and the remaining actual capture unchanged, and the Go checker still returned exit 0. The `react` capture can therefore carry explicit DOM backend metadata and still be counted as a React profile. Bind the profile's actual backend metadata to the requested React/DOM/swap profile and the expected backend sequence across swaps.

### 3. Seeded browser profile metadata is not checked against its seed key

`checkBrowserProfile` receives the expected seed but discards it (`_ = seed`). I changed `profiles.seeded.seed-20261031-react.seed` from `20261031` to `20261032`; the checker still returned exit 0. Compare each seeded profile's declared seed with the independently generated seed for its key before accepting it.

These are concrete false acceptances in captured identity/state evidence; they are not merely extra unrecognized metadata. N4's ten preserved mutations cover several state, DOM, disabled, bridge-order, schema, ABI, and source-byte faults, but do not cover these three cases.

## Boundary

The checker’s positive replay and the existing ten N4 controls passed, and missing registered profile lookup is enforced. The three findings above block acceptance of the current verifier. This review does not claim the Go checker independently launches JavaScript or a browser, nor that captured evidence alone authenticates its producer. I made no production, source capture, Git, or native state changes.

All tested hashes, mutation metadata, commands, stdout/stderr, and exit codes are indexed in `native-module-coordination/rawlogs/XR-CAPTURES/index.json`.
