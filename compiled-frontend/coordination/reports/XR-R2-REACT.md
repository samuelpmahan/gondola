# XR-R2-REACT

**Decision: amend.** The descriptor snapshots repair the original Proxy `get` bypass, but reject a symbol property that the pinned GoScript v0.6.2 runtime places on real backing arrays. This prevents the form and effect fixtures from mounting and prevents the list fixture from rendering after its first Add. Node and Go unit suites pass; actual browser conformance does not.

## Reviewed source and scope

Reviewed N3's `frontend/react/renderer.mjs` SHA-256 `9f10b75d194aab53cbe504321e8f6df26592c20b6a7123d7f267ba2e68868e5a` and `renderer.test.mjs` SHA-256 `51b9dd07d3ded887adde821f89c0485ad1f244726a26fea4f0a7d8dd51f67257`. Read-only snapshots are preserved as `coordination/reviews/xr_r2_react/renderer.pre-review.mjs` and `renderer.test.pre-review.mjs`. I made no production edits.

## Finding: actual GoScript slice backing is rejected

GoScript v0.6.2 declares `const spareZero = Symbol('goscript.spareZero')` in `gs/builtin/slice.ts:1888`. `setSpareZero` writes a zero-value factory under this symbol when a grown backing array has spare capacity (`:1890–1895`); `fillSpareCapacity` later reads that runtime metadata (`:1898–1909`). The symbol is local to each bundled runtime instance, is not a `Symbol.for` key, and is not exported by the compiled module.

I probed the exact four emitted app modules and the list app after the real `Update(add)` call. The property occurs on these backing arrays:

| App phase | Go view path | Result |
| --- | --- | --- |
| Form `Init+View` | `Tree.Kids[0].Attrs.backing` | `Symbol(goscript.spareZero)` |
| Effect `Init+View` | `Tree.Kids[0].Attrs.backing` | `Symbol(goscript.spareZero)` |
| List `Update(add)+View` | `Tree.Kids[2/0/0].Attrs.backing` | `Symbol(goscript.spareZero)` |
| Counter `Init+View` | all inspected node slices | no spare-zero symbol |

For each occurrence the symbol is an own key with `enumerable`, `writable`, and `configurable` all true. Its descriptor value is a function whose source is `() => appendZeroValue(sample)`. The probe assigned distinct in-process identities to the form, list, and effect keys, confirming that identity cannot be imported and compared across bundles. The value is runtime capacity metadata; the React adapter does not need to call or preserve it when copying the visible slice window.

`listOrEmpty()` calls `snapshotNativeArray()` on the backing. That function routes keys through `ownKeysOf()`, which rejects every symbol. This makes an allowed pinned GoScript representation fail admission. The repair should admit only this documented spare-capacity metadata case, validate its own data descriptor, and omit it from the dense snapshot; it must never execute the factory. Continue rejecting unrelated symbols, sparse indices, extra string keys, accessors, and unsafe GoSlice bounds.

The reproducible probe command, run from `compiled-frontend`, is:

```sh
NODE_NO_WARNINGS=1 /tmp/gondola-node22/node_modules/node/bin/node coordination/reviews/xr_r2_react/goscript-slice-probe.mjs > coordination/reviews/xr_r2_react/goscript-slice-probe.raw.json
```

Node is `v22.23.4`. The probe source hash is `ae2edf2fec7bd28fab76d549f4c14e8f8e97a1e7c3dbdeec3e9f52d934cc91f2`; raw JSON hash is `2589ac6e1371c82bdc04f594a673e498f1b397518e84d69b1c0f6d12752d9517`. The pinned GoScript source file hash is `5f6da8d9bb986cc49f1323e1ba505c8ba779da6c54ebaacf6c1bd540e9a0bdea`; nested `go.mod` pins `github.com/s4wave/goscript v0.6.2` and has SHA-256 `272605fe2a8566fd907c3fea23de9ff27bbb9a9ccce30410079ec3ae3420fa24`.

The probe, exact built modules, manifest, generated forwarder Go sources, and N6 raw browser records/manifests are preserved under `coordination/reviews/xr_r2_react/`. The manifest SHA-256 is `ab7f08e05f210f48f63c4bc7319383a6f2e08a3c89caf5c5a660fc91b64a7ae4`. The four emitted module hashes are:

- Counter: `e7fd6d515cb1c90a28d90db51b85ee4d06986ed5999ee2b7d15b64fba2acfeda`
- Form: `a3bbf244004e10ae1b82a895dc717247731fbddad8d57dd1fbffc36c91ac6a4a`
- List: `54b09d871576d33237c0bda34da1388b9ff9fa393ddafd4f26a71ca55cd75fd6`
- Effect: `7736585c8dea675a146861a840dbc7fec6afd3f0e4e70f2ea677dfbf757e038a`

## Checks that pass

The renderer reads caller-owned values through `Reflect.ownKeys` and own descriptors, copies admitted fields and dense array values, and subsequently validates/lower-normalizes those copies. It checks the GoSlice's exact own fields and `target` descriptor value `undefined`, and bounds the copied backing window before reading it. I did not find a later ordinary `get` from a caller-owned GoSlice or array after validation. The copied inputs are structurally normalized; arbitrary source prototypes are not used as identity proofs and are not consulted for inherited fields.

The original Proxy reproduction was independently rerun:

- Command: `/tmp/gondola-node22/node_modules/node/bin/node coordination/reviews/xr_r_react/proxy-slice-repro.mjs`
- Node `v22.23.4`; exit code `1`, expected rejection: `Node.On has invalid GoScript slice bounds or backing`.
- Empty stdout SHA-256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Captured stderr SHA-256: `a93d5422375380b34365c5b1f4b28dc1a6d3aedf6dfd833d3ff26231423def08`.
- Exit-code file SHA-256: `4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865`.

The independent focused tests pass against the reviewed source hashes:

- `/tmp/gondola-node22/node_modules/node/bin/node --test frontend/react/renderer.test.mjs frontend/react/bindings.test.mjs` — Node `v22.23.4`, 20 passed, 0 failed, exit 0. Log: `coordination/reviews/xr_r2_react/node-tests.log`, SHA-256 `0ff8e8da03050ccd939cd2087a94624cba5e08190f260459d937f8c279580489`.
- `GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 -v ./emit` — Go `go1.27.3 linux/amd64`, 4 passed, 0 failed, exit 0. Log: `coordination/reviews/xr_r2_react/go-emit-tests.log`, SHA-256 `c410e1c5085fe292045730706603e23eb4222f0236c1a2ffc4d72cfa46a6b50b`.

## Actual four-app browser evidence

N6's preserved `n6-source-900dc38` raw evidence shows the counter produced a five-tick browser trace. Form and effect were rejected during mount with `Node.Attrs.backing has unsupported symbol properties`; list reached its first Add action and failed during update with the same error. The copied failure record and manifest hashes are:

| App | Failure JSON SHA-256 | Manifest SHA-256 | Failure point |
| --- | --- | --- | --- |
| Form | `9c2818e39cafebc2e9ae7b661a5697f49c083cb983243a594cda0f28bc4c6e91` | `01d9ccffc5e582992b8923a975144de2ec60ba036c80f64182765a8969ad45b6` | mount |
| List | `f72959ea2a8074c517ac326e493b5cfa44e8a330a52b148246bae4ac32ee48e8` | `8fd88b9f8ef413d243542c27d0248b03e365359457f838739ddd5a29ea615803` | action 0, Add/update |
| Effect | `717f4525d9f9ff0006991e1a4782f47b9a8f7b5c9fbc49bd974b42e0e579bd56` | `0e29292df3a429b737ba61a8d3681602309250311f84b758a695b9952fe3382d` | mount |

The raw records and manifests are also preserved under `coordination/reviews/xr_r2_react/n6-source-900dc38/`. These findings are from the actual compiled modules and browser bundles, not the Node renderer unit fixtures. **This review does not claim four-app browser conformance passed.**

## Limits

The review validates structural admission from own keys and descriptor values; it does not prove nominal class identity or authenticate a raw object's prototype. The adapter copies accepted data before lowering and does not read inherited values. The focused Node suite does not mount the actual generated apps; the N6 browser failures remain open for N3's bounded ABI compatibility repair and a fresh four-app conformance run.
