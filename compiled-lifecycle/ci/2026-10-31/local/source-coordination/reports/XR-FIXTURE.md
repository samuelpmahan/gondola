# XR-FIXTURE independent review

**Decision: accepted for the finite Go fixture and its native/CLI evidence.** The reviewed source is unchanged from N1's E-FIXTURE packet. The acceptance covers value-owned Go lifecycle transitions, the standalone native replay, and React/DOM AppIR and module generation. It does not cover mounted browser effect delivery or a generic Manager compiler.

## Review findings

- The active `removeParent` implementation builds an initially empty `[]gobi.Effect` and uses ordinary `append` calls in Grandchild, Child, Parent order. It clears the removed subtree's pending token state and preserves the independent Sibling's pending request. The dense slice literal exists only in the archived experiment, not active application code.
- The Go unit suite exercises all eight pending masks for Parent/Child/Grandchild and checks the exact child-first cancellation order for each mask. Its full lifecycle case also verifies exact `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1` effects, sibling survival, and idempotent repeated removal.
- Request tokens are assembled from each scope's actual generation and the global monotonic request ID. The reordered Child-then-Parent test produces `child:g1:r1` then `parent:g1:r2`; subsequent remounts produce distinct Parent tokens `parent:g2:r3` and `parent:g3:r4`. The fixed lifecycle scenario additionally allocates `parent/child/grandchild:g2:r5/r6/r7` after generation 1 requests and removal.
- I ran a separate boundary audit over all four request roles and all three subtree generation slots. Every request role admits ID `9007199254740991` from max-minus-one and then blocks unchanged at the limit. Each subtree generation slot blocks remount when it is already at the limit; a remount from max-minus-one to the last safe generation succeeds, and the following remount is blocked. The source uses `uint64` fields and `strconv.FormatUint`; GoScript AppIR represents `uint64` as `bigint` and retains those field types.
- Completion only changes a live node whose pending token matches exactly. The unit test and fixed replay cover stale generation-1 replies, accepted live replies, and duplicate replies as no-ops. Counter updates call the existing `counter.Update`; value-ownership tests confirm the input state is unchanged.
- The fixture and contract consistently limit the claim to four fixed value-owned slots. They explicitly avoid claims about compiling a pointer-based or generic lifecycle Manager.

## Verification performed

Toolchains recorded in `coordination/reviews/xr-fixture/toolchains.txt`:

- Go tests/native adapter: Go `1.24.0 linux/amd64`.
- Existing GoScript compiler CLI: Go `1.27.3 linux/amd64`.
- Independent JS auditors: Node `v22.23.4`.

The fixed scenario uses no randomness; no seed was used.

Commands and results:

| Check | Command | Result |
| --- | --- | --- |
| Go fixture and native adapter tests | `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go test -count=1 ./fixtures/compiled/lifecycle ./cmd/compiled-lifecycle-native` | Exit 0; both packages passed. Log: `coordination/reviews/xr-fixture/go-test.log`. |
| Native 26-event replay | `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/compiled-lifecycle-native --script fixtures/compiled/lifecycle/scenario.json > /tmp/xr-fixture-native.json` | Exit 0; full package-path component ID; 26 steps; event 9 cancellation order G/C/P; final request ID 7. Captured output: `coordination/reviews/xr-fixture/native-output.json`. |
| Native output versus independent literal timeline | `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/reviews/xr-fixture/audit-native.mjs compiled-lifecycle/coordination/reviews/xr-fixture/native-output.json` | Passed 26 steps, including identity, messages, effects, full Go state, Gobi tree, renderer-swap preservation, and completion outcomes. Log: `coordination/reviews/xr-fixture/native-oracle-audit.log`. |
| Numeric exhaustion audit | `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run compiled-lifecycle/coordination/reviews/xr-fixture/guard-audit.go` | Passed all four request roles and all three subtree generation guards; log: `coordination/reviews/xr-fixture/guard-audit.log`. |
| React GoScript CLI | From `compiled-frontend/`: `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/gobi-build < ../compiled-lifecycle/coordination/reviews/xr-fixture/cli-react/request.json > ../compiled-lifecycle/coordination/reviews/xr-fixture/cli-react/result.json 2> ../compiled-lifecycle/coordination/reviews/xr-fixture/cli-react/stderr.log` | Exit 0, `ok:true`, 67 outputs, and zero diagnostics. Full package-path component identity and `effect.request-reply` capability are present. |
| DOM GoScript CLI | From `compiled-frontend/`: `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false /tmp/gondola-go/bin/go run ./cmd/gobi-build < ../compiled-lifecycle/coordination/reviews/xr-fixture/cli-dom/request.json > ../compiled-lifecycle/coordination/reviews/xr-fixture/cli-dom/result.json 2> ../compiled-lifecycle/coordination/reviews/xr-fixture/cli-dom/stderr.log` | Exit 0, `ok:true`, 67 outputs, and zero diagnostics. Full package-path component identity and `effect.request-reply` capability are present. |
| Emitted CLI output verification | `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/coordination/reviews/xr-fixture/audit-builds.mjs` | Both output sets passed per-file byte-length/SHA checks, result/AppIR parity, `uint64`→`bigint` field assertions, and identical React/DOM AppIR. Audit: `coordination/reviews/xr-fixture/build-audit.json`. |

## Input pins and evidence hashes

All active fixture, native adapter, contract, and author-report hashes below match the source hashes recorded by E-FIXTURE. The separately archived dense-slice experiment is pinned for clarity and is not active source.

| File | SHA-256 |
| --- | --- |
| `fixtures/compiled/lifecycle/app.go` | `6b61e55c3046f58873d2774e38a7bca44769f18f6870c39e1885b78be340fe41` |
| `fixtures/compiled/lifecycle/view.go` | `afc4b1611c5dbd8e5264d3c124b808770bdd8579fdc1426c350f4df6689bb948` |
| `fixtures/compiled/lifecycle/app_test.go` | `5b67112d79f258895b2fffa82b209021581f982f6a5529f6856763ba02986442` |
| `fixtures/compiled/lifecycle/scenario.json` | `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650` |
| `fixtures/compiled/lifecycle/dense-cancellation-experiment.go.txt` | `759744b94938fd3499005473bbae93e98daedba9cd52328ec6ff53a36aea8962` |
| `cmd/compiled-lifecycle-native/main.go` | `37d7d709599a5b402f792cd5e9e66118f0ec296984ed3fb11ad2626bb6c23bf3` |
| `cmd/compiled-lifecycle-native/main_test.go` | `dd6ce451f96390d245768d5a67a6a1844c3609d0c0bdc7dfe5ac9040301f775a` |
| `compiled-lifecycle/CONTRACT.md` | `ed9eedea8f9582583d1f89e44be20e55f692f037f2b8decc93025433e478e083` |
| `compiled-lifecycle/FIXTURE.md` | `44a0c2d3d2f3e6e85dec3106e6eabdfbe2bd4e4e96c16f45bfdb8635779bb6b7` |
| E-FIXTURE report | `c06e2380d2e3e63b8d3cc62da93825bc1dbeccced34d117606586ce274e4c8c9` |
| E-FIXTURE receipt | `47fe1258a3fc84c5206d7e2782bca701d97364afc25d2c7e9b5c6e53e49678ad` |

Review evidence files are pinned separately:

The current emitted builds share AppIR SHA-256 `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d`; the captured React module hash is `4dba2589f78f02598111af32fbf4241ab29f3be5e109557718bbad03f077a28d` and the DOM module hash is `044e305bbb6dcc00200a623ebb6c710b47f8de9828e009eee25dab7e09f9f5cf`.

| Evidence | SHA-256 |
| --- | --- |
| `coordination/reviews/xr-fixture/go-test.log` | `1f71e88f813e3bc5e6cee75e42afd655613ac2168ca40b4ebf6556a64d1d15aa` |
| `coordination/reviews/xr-fixture/native-output.json` | `ae38bab913056033f299d40441503ed7d18dae962e46f8273b36495317022f55` |
| `coordination/reviews/xr-fixture/native-oracle-audit.log` | `cc9df364fa19e35c3993de98da1bb75a44fc3f9797d8aacdb05ccbb5f4f3bb30` |
| `coordination/reviews/xr-fixture/guard-audit.go` | `59dbf538068bb42d9e20b89a1239171d8d04ec7eb87a76d5584b5ada4ddfce3b` |
| `coordination/reviews/xr-fixture/guard-audit.log` | `4dc36e2dfa219d0741f75465d9b717d8b112f20e11f34aa11ca0ea8ae5e65701` |
| `coordination/reviews/xr-fixture/audit-native.mjs` | `264139bf68faa4602a5133def7a37077fb65d4cd69d760b31f2f1e1ed9e3db59` |
| `coordination/reviews/xr-fixture/audit-builds.mjs` | `9ceb6360c4c0105772afa4d4216c74aa70cff91f4ed30bcba2ddfbcf4c583d78` |
| `coordination/reviews/xr-fixture/build-audit.json` | `40c874848852f775d33f7f910d2ebd93bf80a734827eb52329018a3890951614` |
| React build result JSON | `7d8f4d5486c89f3331ec7db64cb829310cc297345d57c89da9f2766c1bff7bad` |
| DOM build result JSON | `b1779af52b7e86c6db1b616c0872b71581ad32935dfa34e51cc5469a7906bcd3` |

The independent oracle module audit matched native output for all 26 steps. Its separate frozen E-ORACLE test currently asserts the earlier `expectedEffects` value containing only the cancellation row, while the fixture script now records seven request rows plus cancellation. I did not alter that frozen packet or its hashes; parent has assigned the metadata/test drift to R-ORACLE. This does not change the fixture's own scenario validator or this review's direct literal native trace check.

## Limits

The compiler evidence proves successful finite fixture AppIR/module generation for React and DOM. It does not prove mounted browser lifecycle behavior or effect delivery. GoScript currently represents emitted effects as `$.Slice<gobi.Effect>`; runtime slice encoding/mounted integration is a separate N2/N3/N5 gate and is not a fixture workaround. No generic/pointer Manager support, merge, deployment, or publication is claimed.
