# E-NATIVECLICK — physical click resolution against Go views

**Outcome:** `mixed_change`  
**Worker:** N2  
**Scope:** `cmd/compiled-modules-native/main.go`, `main_test.go`, and this packet's report/receipt/rawlogs. No fixtures, compiler, host, seed generator, Git, or scheduler paths were changed.

## Change

The native runner now treats `kind:"click"` as a physical click attempt and resolves it against the current Go `View` node. It retains the source event, action, and target. When that node is disabled, it records `disabled:true`, `message:null`, and `stepIndex:null`, and emits no Go update or bridge checkpoint. Enabled clicks record `disabled:false` and dispatch normally. Action records alone carry the optional `disabled` boolean; renderer-swap and stale-callback event projections are unchanged.

`kind:"disabled-action"` remains an explicit assertion: it is accepted only when the current Go view marks the node disabled, and records `disabled:true` without a tick. If the node is enabled, the CLI returns an error and writes no trace.

## Tests and native seed replays

The test-first RED is preserved in `rawlogs/E-NATIVECLICK/test-red.stdout.log`: before the change, generic click on the disabled Reset at zero returned an error, and the explicit assertion had no serialized `disabled` flag. After the change, both focused and full command-package tests passed with Go 1.24.0:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 ./cmd/compiled-modules-native -run 'Test(GenericClicksResolveDisabledControlsFromCurrentGoViews|ExplicitDisabledActionStillAssertsGoViewState)'
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 ./cmd/compiled-modules-native
```

The regression scenario covers Reset-at-zero, Add while locked, the parent Step-down boundary, and a positive enabled Add. It verifies retained source metadata, no message or step for blocked clicks, `disabled` booleans for both enabled and disabled action events, and normal parent/input and child/publication bridge order for the updates that do dispatch. An explicit `disabled-action` on enabled Add still errors.

I ran the actual Go CLI against all three click-only N4 seed scripts; each run exited 0 with 40 source events and the native reducer's actual Go checkpoints. Disabled rows all had null message/step and enabled rows all had a message/step:

| Seed | Go steps | Disabled clicks | Enabled clicks | Native trace SHA-256 |
|---|---:|---:|---:|---|
| `20261031` | 29 | 11 | 29 | `e2c479d97fdb19e639a63b6c9092208d4d2984b1f1d0f85e951cb6f3f975b365` |
| `20261032` | 27 | 13 | 27 | `a608333a3b77392b821f81b5af6e44863b1b53793deebc49f5992fa2bc66e92a` |
| `20261033` | 27 | 13 | 27 | `393d897e13fdf950ebe10ba35af81338cb232531848173940231ed7853e857dd` |

For continuity, the original 24-event fixture scenario also ran successfully: 24 source events, 16 Go-update checkpoints, output 209,146 bytes, SHA-256 `579c8c4a17d26682fc30bfdbbc4de677ee63cda322b7bfdd00bd624c22b4ceec`. Its existing explicit disabled-action probes now include `disabled:true`; prior E-GO/XR-GO/E-NUMERIC receipts and traces were not rewritten.

Exact request hashes, commands, versions, exit codes, stdout/stderr pins, seed source hashes, and all native trace hashes are recorded under `module-coordination/rawlogs/E-NATIVECLICK/`.

## Source pins

| File | SHA-256 |
|---|---|
| `cmd/compiled-modules-native/main.go` | `356902a6517f6922409431730344364f23a156df9a90f2957f7f52d1cc9b1a3f` |
| `cmd/compiled-modules-native/main_test.go` | `a3b6d3f60a2ec272afdeaac1e13db985bc92165d784bce6eb85b6087449ec7de` |
| Numeric-fixed `fixtures/compiled/modulechild/app.go` | `68d462ac1ca616f05249392cbac894fbd954687441377e255944c84a74441265` |
| `fixtures/compiled/moduleparent/app.go` | `1da626a1e56e34c9b08bb9d56e6d99f4cbf783439c25053cd61d83eca1830c37` |
| `fixtures/compiled/modulewire/modulewire.go` | `9d29a10bdf9069852d861a38ede52f11b40a650da057dbd85070bb7da5c4561f` |
| Root `go.mod` | `e5dba8ed15a331f2bcdc7a35604cadd927fd486bca2543e83953f6a73716c5fa` |
| Frozen contract | `ba6dbd37c15c83068216702f5c864af5e423d0871490a890a65052bd66710020` |
| Acceptance criteria | `2449f2eb33dea9b38d9f1151472b6c4a492b8be2b42f9bfc38e1e889d7d60ea8` |

## Limits

This verifies native Go event resolution against the current Go-generated view trees and the three actual seed inputs. It does not establish mounted browser click behavior, DOM/React event propagation, renderer swaps, pixels, or operating-system equivalence; those remain in the harness/browser lane. The seeds and fixture stay stateless inputs to the Go native runner; no JavaScript Go reducer was added.
