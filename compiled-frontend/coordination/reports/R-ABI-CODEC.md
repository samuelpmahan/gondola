# R-ABI-CODEC

**Outcome: `mixed_change`.** The generated value encoder now accepts the observed GoScript v0.6.2 grown backing-array shape for non-float GoSlice values. It checks the wrapper and backing descriptors, requires dense visible elements, and copies only the visible window. Ordinary native arrays retain the existing strict dense check. Evidence is limited to the actual compiled list fixture and the codec package tests; no full app build, full runner, browser, or demo pass is claimed.

## Reproduced failure and repaired actual list path

The pre-repair Node 22 probe imports the compiled list module from `/tmp/gondola-compiled-atomic/apps/list-f8359aa2866d/gobi-compiled.mjs`, calls its `Init` and actual `Update` role with repeated `Name: "add"` messages, then encodes each returned `State` with the encoder generated in that build directory. The stored output shows successful encoding for 0, 1, and 2 rows, then the actual failure at 3 rows:

```text
TypeError: slice []github.com/samuelpmahan/gondola/fixtures/compiled/list.Row GoSlice backing[3] must be an own data property
```

At that point the GoSlice window is offset 0, length 3, capacity 4, and the backing array has indices 0–2 plus its length and one symbol property. Index 3 is an unused capacity hole. The symbol has description `goscript.spareZero`, is non-global, and has an enumerable, writable, configurable data property whose value is a zero-argument function. The function's own properties are exactly `length: 0` and `name: ""`, both non-enumerable, non-writable, configurable data descriptors. The upstream pinned `slice.ts` source shows the private symbol assignment and explains that spare slots are left empty until needed.

I regenerated an encoder from the current `GenerateValueEncoder` and the compiled list app's current `app-ir.json`; the compiled list module itself was not rebuilt. The post-repair Node 22 probe imports that fresh encoder alongside the actual compiled module and runs `Init` plus six actual `Update(add)` calls. It exits 0 with no failures. The encoded row IDs match exactly at all counts 0 through 6; the 3-row window has capacity 4, and the 5-row window has capacity 8.

## Encoder rule and regression coverage

The GoSlice path now:

- Requires the exact own data-property wrapper keys and safe integer offset, length, and capacity bounds, including safe sums and `offset + capacity <= backing.length`.
- Requires an Array backing for the non-float GoSlice path. It accepts ordinary canonical array indices, the standard `length` property, and at most one local non-global symbol named `goscript.spareZero` with the observed data-descriptor attributes and function shape.
- Rejects extra keys, additional or global symbols, symbol accessors, index accessors/nonstandard index descriptors, malformed factories, and holes before the visible window or outside unused capacity.
- Copies each visible index through its own data descriptor into a fresh dense array. It never invokes the spare-zero factory. Holes are admitted only in `[offset + length, offset + capacity)`.

The private symbol identity cannot be authenticated by the encoder, so this is deliberately shape-based admission. A different local symbol with the same description and exact observed descriptor/factory shape can match. The factory is not called, and only the visible values are copied. Direct native arrays still use `ownArray`, which remains closed to extra symbols/properties and sparse indices.

The Node-backed regression in `compilercontract/js_encoder_test.go` covers generated GoScript-shaped Row, `[]int`, and BigInt `[]uint64` slices; nil versus non-nil empty slices; `uint64` maximum values; negative-zero float values; a valid sparse spare-capacity tail; and rejection of visible/prefix/out-of-capacity holes, unknown/global symbols, malformed factory shape, extra accessors, wrapper extras, unsafe bounds, and sparse/extended native arrays. The spare-zero factory call counter remains zero.

**Untested typed-array limit:** direct `Float64Array` values are covered, including negative zero. A Float64Array-backed GoSlice wrapper and its hidden-capacity behavior were not exercised. That existing typed-array wrapper path validates the dense typed array, converts it, and then slices the requested window; this report makes no GoSlice-wide claim for that case.

## Commands and results

The pre-repair reproduction ran from `compiled-frontend/`:

```text
/tmp/gondola-node22/node_modules/node/bin/node coordination/reviews/r_abi_codec/pre_repair_probe.mjs
```

It exited 1 at 3 rows. The JSON output preserves the thrown TypeError and stack; the accompanying stderr contains Node's experimental proxy warning. The raw output, stderr, and exit status are retained separately.

Fresh encoder generation ran from the repository root with Go 1.24.0:

```text
GOTOOLCHAIN=local /tmp/gondola-go-sdk/go/bin/go run ./compiled-frontend/coordination/reviews/r_abi_codec/generate_list_encoder.go /tmp/gondola-compiled-atomic/apps/list-f8359aa2866d/app-ir.json /workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/r_abi_codec/fresh-list-encoder.mjs
```

The actual post-repair probe ran from `compiled-frontend/` with Node 22.23.4 and exited 0:

```text
/tmp/gondola-node22/node_modules/node/bin/node coordination/reviews/r_abi_codec/post_repair_actual_list_probe.mjs
```

The complete root codec package suite ran with Go 1.24.0 and the Node-backed test pinned to Node 22.23.4; it passed:

```text
GOTOOLCHAIN=local GONDOLA_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go-sdk/go/bin/go test -count=1 ./compilercontract
```

No four-app build or full runner was run in this lane. The later integration run must use the frozen source hashes and its own current build/output receipt.

## Hash closure

| File | SHA-256 |
|---|---|
| `compilercontract/js_encoder.go` | `a605b3267f63f7c7ed90c17ee2ed9bf04c7667827a23496c8620070f13b9b46d` |
| `compilercontract/js_encoder_test.go` | `d6dcbda61dc4dcb425164fc45d396f799a0574981103ad4866d268fb3fb9aa9f` |
| GoScript v0.6.2 `gs/builtin/slice.ts` | `5f6da8d9bb986cc49f1323e1ba505c8ba779da6c54ebaacf6c1bd540e9a0bdea` |
| `/tmp/gondola-compiled-atomic/buildmanifest.json` | `ab7f08e05f210f48f63c4bc7319383a6f2e08a3c89caf5c5a660fc91b64a7ae4` |
| Compiled list `app-ir.json` | `14d93e7c0e22d184ef99d428b0c0b1c2339766211a3785b25a4762a756cb1e4b` |
| Compiled list `gobi-compiled.mjs` | `54b09d871576d33237c0bda34da1388b9ff9fa393ddafd4f26a71ca55cd75fd6` |
| Pre-repair compiled list `encoder.mjs` | `3412bbb20b80098a35f7933db8ec382497f7853d079defb39fa5060801eabfb0` |
| Fresh encoder generated from current AppIR metadata | `8e1727393cd4a2af4a3fc8e8c156462d951bcbfe4990c04bb65ed02d5ec83723` |
| `generate_list_encoder.go` | `fef4d799f0ff0ab3d8e5f3088a9a4ccc19cabc455730bb58ac78a7321047387d` |
| Pre-repair probe stdout JSON | `45b90395697f7d3f94fd64411ef5f737d3ab7a8a78e31182e72409d97ef3d207` |
| Post-repair actual list stdout JSON | `22aacbc08490d9bcc4c3a1cbe738c6fb0eaaef2a505548bbb2bb8180059c2fd2` |
| Root Go 1.24 codec test stdout | `7f271c718fe4e233ad1831bb4b75b255b4671f0064a32e64f32daf01072674b3` |

