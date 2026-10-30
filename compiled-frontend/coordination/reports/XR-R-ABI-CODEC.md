# XR-R-ABI-CODEC

**Decision: `accepted`.** I independently verified the N2 GoSlice backing-array encoder repair against the pinned GoScript v0.6.2 list ABI, the Go 1.24 codec package suite, and a replay of the actual compiled list module. The decision is limited to the reviewed encoder path and evidence below.

## Review result

I regenerated the value encoder from a preserved copy of the list fixture's `app-ir.json` using the reviewed `GenerateValueEncoder` source. The emitted encoder SHA-256 is `8e1727393cd4a2af4a3fc8e8c156462d951bcbfe4990c04bb65ed02d5ec83723`, matching N2's generated encoder. With the actual compiled list module unchanged, the pre-repair encoder fails after the third `Update(add)` at the unused GoSlice capacity slot `[3]`; the wrapper is offset 0, length 3, capacity 4. The current encoder accepts every state from append count 0 through 6 and encodes the visible row IDs as `1..count`.

The pinned GoScript source confirms that `spareZero` is a module-local `Symbol('goscript.spareZero')` on grown backing arrays. The encoder checks the wrapper and backing through own property descriptors, permits at most one local non-global symbol with the observed description and descriptor/factory shape, requires dense visible values, and copies only the visible window into a new dense array. The spare-zero function is not called. Ordinary native arrays still use the strict dense, closed-key path.

The generated-code regression and package suite exercise nil versus non-nil empty slices, Number-backed `[]int`, BigInt-backed `[]uint64` including its maximum, negative-zero float encoding, spare-capacity holes, and rejection of visible/prefix/out-of-capacity holes, unknown/global symbols, malformed factory shape, extra accessors, wrapper extras, unsafe bounds, and sparse or extended native arrays. `GOTOOLCHAIN=local GONDOLA_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go-sdk/go/bin/go test -count=1 ./compilercontract` passed with Go 1.24.0 and Node v22.23.4.

## Bounded limits

The private GoScript symbol cannot be authenticated by identity. Admission is intentionally shape-based: a different local symbol with the same description and exact observed shape can pass. This does not invoke or retain its factory; only own descriptor values from the visible window are copied. A Float64Array-backed GoSlice wrapper and its backing-window behavior were not exercised. Direct Float64Array values, including negative zero, are covered. This review makes no claim about every GoScript slice representation, hostile proxies, full app builds, browser behavior, or overall compiler/end-to-end correctness.

## Reproduction

Commands ran from `/workspace/scratch/39a56936f173/gondola-compiled` unless otherwise stated:

```text
GOTOOLCHAIN=local /tmp/gondola-go-sdk/go/bin/go run ./compiled-frontend/coordination/reviews/xr_r_abi_codec/generate_list_encoder.go /workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r_abi_codec/evidence/list-app-ir.json /workspace/scratch/39a56936f173/gondola-compiled/compiled-frontend/coordination/reviews/xr_r_abi_codec/fresh-list-encoder.mjs
/tmp/gondola-node22/node_modules/node/bin/node compiled-frontend/coordination/reviews/xr_r_abi_codec/pre-repair-actual-list.mjs
/tmp/gondola-node22/node_modules/node/bin/node compiled-frontend/coordination/reviews/xr_r_abi_codec/post_repair_actual_list_probe.mjs
GOTOOLCHAIN=local GONDOLA_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go-sdk/go/bin/go test -count=1 ./compilercontract
```

The pre-repair replay exited 1 at append count 3; the post-repair replay and Go package test exited 0. The actual list module itself was not rebuilt. Raw stdout/stderr, generated encoder, copied inputs, and source snapshots are under `coordination/reviews/xr_r_abi_codec/`.

## Hashes

| Input or output | SHA-256 |
|---|---|
| `compilercontract/js_encoder.go` | `a605b3267f63f7c7ed90c17ee2ed9bf04c7667827a23496c8620070f13b9b46d` |
| `compilercontract/js_encoder_test.go` | `d6dcbda61dc4dcb425164fc45d396f799a0574981103ad4866d268fb3fb9aa9f` |
| Pinned GoScript v0.6.2 `gs/builtin/slice.ts` | `5f6da8d9bb986cc49f1323e1ba505c8ba779da6c54ebaacf6c1bd540e9a0bdea` |
| Compiled list AppIR | `14d93e7c0e22d184ef99d428b0c0b1c2339766211a3785b25a4762a756cb1e4b` |
| Actual compiled list module | `54b09d871576d33237c0bda34da1388b9ff9fa393ddafd4f26a71ca55cd75fd6` |
| Pre-repair encoder | `3412bbb20b80098a35f7933db8ec382497f7853d079defb39fa5060801eabfb0` |
| Fresh encoder from copied AppIR | `8e1727393cd4a2af4a3fc8e8c156462d951bcbfe4990c04bb65ed02d5ec83723` |
| Generator harness | `fef4d799f0ff0ab3d8e5f3088a9a4ccc19cabc455730bb58ac78a7321047387d` |
| Independent pre-repair replay JSON | `d46f7d3dbd307bd3535e9a9e8f9241443bde7400e5d71b1f4c37a5374af6179c` |
| Independent post-repair replay JSON | `22aacbc08490d9bcc4c3a1cbe738c6fb0eaaef2a505548bbb2bb8180059c2fd2` |
| Focused Go package test log | `8fe93f2b8bb6111db98b6d9715b26efa62a85255c4534763a0aec29eac0bfcfd` |

