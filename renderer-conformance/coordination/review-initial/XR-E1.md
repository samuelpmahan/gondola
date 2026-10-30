# XR-E1 — independent native renderer-contract review

Status: **PASS after AMEND.** E1 author repaired the direct `ValidateSnapshot` raw-state whitespace finding. The preserved probe passed against the shared fixed source, as did the contract/CLI tests, Go/WASM build, full 36-fixture native/JS admission check, and cross-language blank-rune matrix. No E1 source was edited by this reviewer.

## Finding XR-E1-F1 — `ValidateSnapshot` accepts invalid JSON whitespace in `State`

`Snapshot.State` is a `json.RawMessage`, and exported `ValidateSnapshot` must reject malformed raw JSON when it validates that field. `validateState` currently applies Unicode-aware `bytes.TrimSpace` before parsing. That accepts bytes outside JSON's four whitespace characters around a valid state object.

Minimal reproduction:

```go
snapshot.State = json.RawMessage("\u00a0{\"opaque\":true}")
err := rendercontract.ValidateSnapshot(snapshot) // nil before repair
```

The same acceptance occurred for either a prefix or suffix of U+000B, U+000C, U+0085, U+00A0, or U+2000. The byte-parser entry point `ParseSnapshot` rejects the corresponding embedded raw value, so callers of the two exported validators disagree. The initial finding was handed to E1 author `contract_go`: trim only RFC JSON whitespace (`space`, tab, CR, LF), then rerun the probe and package suite.

Initial probe evidence from `XR-E1-probe.go`:

```text
{"manifestBlankRunes":26,"blankRuneMatrix":52,"acceptedStateKinds":["nested object/array/scalars","empty object"],"rejectedCases":43,"passed":false}
FAIL: ValidateSnapshot rejects non-JSON prefix state whitespace U+000B
FAIL: ValidateSnapshot rejects non-JSON suffix state whitespace U+000B
FAIL: ValidateSnapshot rejects non-JSON prefix state whitespace U+000C
FAIL: ValidateSnapshot rejects non-JSON suffix state whitespace U+000C
FAIL: ValidateSnapshot rejects non-JSON prefix state whitespace U+0085
FAIL: ValidateSnapshot rejects non-JSON suffix state whitespace U+0085
FAIL: ValidateSnapshot rejects non-JSON prefix state whitespace U+00A0
FAIL: ValidateSnapshot rejects non-JSON suffix state whitespace U+00A0
FAIL: ValidateSnapshot rejects non-JSON prefix state whitespace U+2000
FAIL: ValidateSnapshot rejects non-JSON suffix state whitespace U+2000
```

The failed probe is retained as the review's initial diagnostic. The author prepared and synchronized a test-first patch that replaces Unicode trimming with trimming limited to RFC JSON whitespace and adds direct `ValidateSnapshot` tests. Independent XR-E1 recheck of `/tmp/gondola-blankfix` passed:

```text
/tmp/gondola-go/bin/go test -count=1 ./rendercontract ./cmd/render-contract
ok github.com/samuelpmahan/gondola/rendercontract
ok github.com/samuelpmahan/gondola/cmd/render-contract

GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build ./rendercontract
exit 0

/tmp/gondola-go/bin/go run /workspace/scratch/39a56936f173/gondola/renderer-conformance/coordination/reports/XR-E1-probe.go
{"manifestBlankRunes":26,"blankRuneMatrix":52,"acceptedStateKinds":["nested object/array/scalars","empty object"],"rejectedCases":43,"passed":true}
```

The shared-tree recheck passed:

```text
/tmp/gondola-go/bin/go test -count=1 ./rendercontract ./cmd/render-contract ./inputbinding
ok github.com/samuelpmahan/gondola/rendercontract
ok github.com/samuelpmahan/gondola/cmd/render-contract
ok github.com/samuelpmahan/gondola/inputbinding

GOOS=js GOARCH=wasm /tmp/gondola-go/bin/go build ./rendercontract
exit 0

/tmp/gondola-go/bin/go run ./renderer-conformance/coordination/reports/XR-E1-probe.go
{"manifestBlankRunes":26,"blankRuneMatrix":52,"acceptedStateKinds":["nested object/array/scalars","empty object"],"rejectedCases":43,"passed":true}

RENDER_CONTRACT_BIN=/workspace/scratch/39a56936f173/gondola/renderer-conformance/build/render-contract /tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/coordination/reports/XR-E1-probe.mjs
{"manifestBlankRunes":26,"blankMatrixChecks":52,"nonblankChecks":4,"rawNumberLexeme":"Go rejects Kind 1.0; JS receives integer 1 and accepts (raw-only distinction)","status":"passed"}

RENDER_CONTRACT_BIN=/workspace/scratch/39a56936f173/gondola/renderer-conformance/build/render-contract /tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/fixture-check.mjs renderer-conformance/build/fixtures.json
{"nativeChecked":36,"javascriptCompared":33,"rawJsonOnly":3,"accepted":7,"rejected":29,...}

go run ./cmd/render-contract manifest > /tmp/xr-e1-manifest.json && cmp /tmp/xr-e1-manifest.json renderer-conformance/build/manifest.json
exit 0
```

The post-fix probe rejects invalid prefix and suffix whitespace on direct RawMessage validation, accepts the four JSON whitespace characters, and still rejects the invalid surrounding whitespace through `ParseSnapshot`.

## Lexical-only admission note

The Go parser rejects raw JSON `Node.Kind: 1.0` because the field is a Go integer (`gobi.Kind`/`uint8`). `JSON.parse` normalizes that same token to the JavaScript integer value `1`, which passes object admission. XR-E1 confirmed this with the native CLI and the manifest-driven JS validator. This is a raw-lexeme-only distinction, not an E1 semantic source defect; it should be classified as raw-only if it is added to the differential fixture pack. The probe records both outcomes.

## Checks completed before author repair

Toolchain: `/tmp/gondola-go/bin/go version` → `go1.24.0 linux/amd64`; `/tmp/gondola-node22/node_modules/node/bin/node --version` → `v22.23.4`.

Commands and results:

- `/tmp/gondola-go/bin/go test -count=1 ./rendercontract ./cmd/render-contract ./inputbinding` — passed all three packages.
- `/tmp/gondola-go/bin/go run ./cmd/render-contract manifest` — emitted v1 protocol, required capabilities/methods/tags/attributes/events, kinds `[1,2]`, depth `64`, node count `4096`, and the Go-owned code-point-ordered `messageBlankRunes` string.
- `RENDER_CONTRACT_BIN=.../renderer-conformance/build/render-contract /tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/fixture-check.mjs renderer-conformance/build/fixtures.json` — passed 36 native cases, 33 Go/JS object admission comparisons, and 3 raw-JSON-only cases; 7 accepted and 29 rejected, no disagreements.
- `/tmp/gondola-go/bin/go run ./renderer-conformance/coordination/reports/XR-E1-probe.go` — exercises state object/scalar opacity, exact invalid primitive cases, duplicate keys including escaped aliases, paths, key syntax, depth/node boundaries, snapshot nonmutation, manifest slice mutation isolation, and the full whitespace policy. Initial run only failed the ten raw-state whitespace boundary cases in XR-E1-F1.
- `RENDER_CONTRACT_BIN=.../renderer-conformance/build/render-contract /tmp/gondola-node22/node_modules/node/bin/node renderer-conformance/coordination/reports/XR-E1-probe.mjs` — passed all 52 Go/JS message-blank checks (26 declared runes × handler/binding), plus nonblank U+200B checks in both contexts.

The Go probe verifies that `messageBlankRunes` contains exactly every Go `unicode.IsSpace` rune plus U+FEFF in ascending code-point order (26 runes). The JS and Go validators agreed for each rune in both declared-message paths. Nested state objects, arrays, nulls, booleans, finite numbers, and strings remain accepted without app-specific field interpretation; top-level state `null`, array, string, boolean, and number remain rejected.

## Mutation and bounds review

`DefaultManifest()` creates fresh `Capabilities`, `Methods`, `Tags`, `Attributes`, `Events`, and `NodeKinds` slices. Mutating one return does not alter a later return or an already-captured second return. `ValidateSnapshot` does not mutate valid snapshots. Valid empty/null `Node.Attrs`, `Node.On`, `Node.Kids`, and `Attr.Style` representations remain accepted; snapshot `bindings` and `messages` remain non-null arrays.

Root depth 0 and depth 64 are accepted; depth 65 is rejected. A 4,096-node tree is accepted; 4,097 is rejected. Element keys are globally unique ASCII tokens, text keys are empty, input-binding paths are canonical and resolve to one text input with exactly one type/value pair, and the tested duplicate/extra/missing/wrong-case/wrong-null/type fields were rejected. CLI valid/invalid JSON output and nonzero invalid exit are covered by `cmd/render-contract` tests and the native fixture run.

## Source and contract hashes at initial review

| File | SHA-256 |
| --- | --- |
| `rendercontract/rendercontract.go` | `c15a0a23f200b18db36f08cf51325f9474e800fd7a69bd4f0d36bf19f7c81824` |
| `rendercontract/contract_test.go` | `2a14ddbb6344df4b7753c80fb4a621fa95c3b2b4519cafc8c39f58bc443c3619` |
| `cmd/render-contract/main.go` | `042a1a67ce8cd693b09db7813ac794ab0198adc4f2e5aa9f4149c00c22f92917` |
| `cmd/render-contract/main_test.go` | `32dca12a8a4d81ba464fb9aebcc3dc6ccd9781d6ff0dc4955439589eacf3c75b` |
| `renderer-conformance/build/render-contract` | `3bfecc048042073d0e9223bb7f2f510c5dc62186ed8623fc8e8de5bbf725bc49` |
| `renderer-conformance/build/manifest.json` | `f83f26473133be5959211806101566abf04f514cd00831407c2a45ff053a0261` |
| `renderer-conformance/build/fixtures.json` | `e39934b601015f591e7426e26e6da55e52be0197457acade8d50fd20c0b74204` |

Post-repair hashes:

| File | SHA-256 |
| --- | --- |
| `rendercontract/rendercontract.go` | `5db5cf5d1c54acfbaa567ea83b3781bfa1a5609eb25fac4b46487e0639919ca3` |
| `rendercontract/contract_test.go` | `8d89c1d2ef2e95c920952cac969f4085ffc6d97d6986f7771337d44a2fe988be` |
| `cmd/render-contract/main.go` | `042a1a67ce8cd693b09db7813ac794ab0198adc4f2e5aa9f4149c00c22f92917` |
| `cmd/render-contract/main_test.go` | `32dca12a8a4d81ba464fb9aebcc3dc6ccd9781d6ff0dc4955439589eacf3c75b` |
| `renderer-conformance/build/render-contract` | `b34045cefdabe9e84dbd53b6483bf69531129a966d1b06f5baaeae7043632de6` |
| `renderer-conformance/build/manifest.json` | `f83f26473133be5959211806101566abf04f514cd00831407c2a45ff053a0261` |
| `renderer-conformance/build/fixtures.json` | `e39934b601015f591e7426e26e6da55e52be0197457acade8d50fd20c0b74204` |
| `renderer-conformance/coordination/reports/XR-E1-probe.go` | `36861a220c12260707a02143738b3e0a6d3398eddef66413f3eaa0aed6a51535` |
| `renderer-conformance/coordination/reports/XR-E1-probe.mjs` | `fb1d659de8e7b13ca8806bf18193794ca385ca17256c3d93ee832cd3d24a93dd` |

## Limits

This review is limited to the Go renderer-contract package, CLI, and fixture admission boundary. The full inherited runner, DOM browser conformance, and four-actor actual-application replay are owned by the root/final gates. The opaque state boundary means no application-specific state-schema claim is made.
