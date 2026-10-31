# R-EFFECT-SLICE

**Outcome: mixed change.** The compiled runtime now accepts GoScript `Update` effect results represented as typed slices, including append-produced `$.Slice<gobi.Effect>` wrappers. It resolves the slice type from the component's emitted `Update` signature, validates the declared slice and exact Go `Effect` fields, and delegates wrapper/layout and struct-marker checks to the generated encoder. Encoded effect values are then checked by the existing strict default policy or the caller's closed effect policy.

## Repair

The first real compiled append test reproduced the blocker: removing the parent returns a GoScript slice wrapper, while `normalizeEffects` accepted only a JavaScript Array or null. A first implementation routed typed Arrays through the encoder too, but exposed an existing GoScript runtime behavior: later Go struct copies add `Symbol(structCopy)` to the generated Effect prototype, causing the older raw-Array prototype validator to throw `Cannot convert a Symbol value to a string`.

The accepted routing preserves the prior Array/null behavior for untyped modules. When AppIR declares the actual Update result type, both an Array and a GoScript slice wrapper are encoded against that result TypeID. This preserves compiled Array effects while validating append backing storage, offset, length, capacity, element markers, fields, and field types through the compiler-generated encoder. Null and undefined still normalize to no effects. If no declared effect slice type exists, legacy dense Arrays continue through the existing strict Go-struct validation; an untyped wrapper is rejected.

No compiler, encoder, or fixture source was changed for this repair. The direct generated module and encoder used by the integration checks were:

- `compiled-lifecycle/builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/app-ir.json`
- `compiled-lifecycle/builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/encoder.mjs`
- `compiled-lifecycle/builds/feasibility/final/react/output/apps/lifecycle-7e6575d90707/gobi-compiled.mjs`

Their SHA-256 values are recorded below. The earlier `E-RUNTIME` report and receipt were left untouched as the original scope packet.

## Verification

Toolchain: Node `v22.23.4`. Both test commands ran from `/workspace/scratch/39a56936f173/gondola`; Node printed its existing experimental `EnvHttpProxyAgent` warning.

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-lifecycle/runtime/runtime.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/runtime/runtime.test.mjs
```

Results: lifecycle integration **7 passed, 0 failed**; shared compiled runtime **29 passed, 0 failed**. The lifecycle suite exercised a real compiled removal append and child-first cancellations, independent sibling survival, runtime forced-late completion rejection, direct stale-token Go `Update` messages that leave state unchanged, unmount retirement, a nonzero slice offset, malformed slice wrapper rejection, malformed Go Effect rejection, and rejection of an encoder-produced typed Value with extra fields. The generated encoder was called with the `Update` signature's exact result TypeID.

The separate XR-RUNTIME review found a reentrant unmount admission race in the pre-existing lifecycle wrapper. It remains a separate repair (`R-UNMOUNT`) and is not claimed as fixed by this effect-slice packet. The E-RUNTIME lifecycle suite and focused tests pass; cross-renderer/browser matrix results remain with the harness lane.

## SHA-256

- `compiled-frontend/frontend/runtime/runtime.mjs`: `42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0`
- `compiled-frontend/frontend/runtime/runtime.test.mjs`: `6ea9236b08d1bf624bc9f8a84d2bebd6cacfbc12c91749cabf97b8fc6a7bf7b1`
- `compiled-lifecycle/runtime/runtime.mjs`: `c6fad592554dda059c45ecdb1db55ab62283783de1b1d76c0f320f44fbdf7166`
- `compiled-lifecycle/runtime/runtime.test.mjs`: `3c6f5c9d8631a9e1e557ffe93465e0b93d66a085a5b22a33f2f4e6fbb1d0c273`
- `app-ir.json`: `1e0389c7b0ee80119622ce99b8d2f9cc9c117d006ad358662eda5326048b3d23`
- `encoder.mjs`: `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`
- `gobi-compiled.mjs`: `1d1e8a0f5fe4d496780723a9ae4de4ca1047a9563e8d6ebd02151b4bd638bf8a`
- `R-EFFECT-SLICE.lifecycle-7.log`: `c995c6f68b67c46476c64b5f47cee3e8eca5a45cc47b2b9bb9c82a88ed324597`
- `R-EFFECT-SLICE.shared-runtime-29.log`: `714a47074e8f4127b0deeba8f0aa12b58869e95f926cece2bd027af36961fec6`
