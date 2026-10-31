# XR-EFFECT-SLICE independent review

**Decision: accepted.** The pinned shared runtime derives the effect slice type from the component's emitted `Update` signature and sends typed Array and GoSlice results through that type's generated encoder. The runtime then strictly validates the encoder's Value before applying the existing effect capability and policy checks. This review does not accept or assess the separate lifecycle wrapper unmount repair.

## Review findings

- `getComponent` reads the matching component Update symbol's second result TypeID from AppIR metadata. For a declared effect slice, `effectSliceMetadata` requires a slice type whose element is a struct with exactly string `Kind`, `Name`, `Arg`, and `Reply` fields.
- If the result TypeID is declared, both an Array result and a GoSlice wrapper call `encoder.gobiEncodeState(effects, metadata.typeId)`. The runtime does not infer or accept an arbitrary object as a slice. It checks the encoded Value's exact fields, type ID, kind, nil metadata, dense item list, element struct type, ordered field names, and string field Values before making host effects.
- The generated encoder validates the concrete GoScript representation, including exact wrapper keys, bounds, backing storage, offset, and marked Effect structs. Malformed wrapper, malformed Effect, and malformed encoder Value probes fail before any cancellation is delivered.
- The lifecycle fixture's actual request path returns a JavaScript Array. An independent probe confirms the runtime sends that Array to the generated encoder with the Update result TypeID, and the request is accepted. The real `removeParent` append path exercises a GoSlice; it emits child-first cancellations and leaves the independent sibling pending. A shifted-window probe confirms nonzero offsets are passed through the same encoder path.
- The typed path still applies the `effect.request-reply` capability gate and the configured effect policy. Without a declared effect slice, the legacy Array path retains the existing strict dense-array and GoScript struct-marker/prototype checks. Shared-runtime tests cover unmarked values, accessors, extra fields, unsupported kinds, default rejection, frozen custom-policy input, and capability behavior.
- The implementation is a generic runtime ABI bridge: it uses AppIR Update metadata and the compiler-generated encoder. It adds no lifecycle/application reducer, no per-app state transition, and no shape-based duck typing of slice values.

## Verification

Node `v22.23.4` (`/tmp/gondola-node22/node_modules/node/bin/node`). The pinned R-EFFECT-SLICE logs and hashes in its receipt were verified. I also ran both commands independently against core hash `42da6087…`:

- `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-frontend/frontend/runtime/runtime.test.mjs`: **29 passed, 0 failed**. Review output: `coordination/reviews/xr-effect-slice/review-shared-runtime-29.log`.
- `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test compiled-lifecycle/runtime/runtime.test.mjs`: **8 passed, 0 failed** against the then-current lifecycle wrapper/test files; one additional test was added by the separate R-UNMOUNT repair during this review. Review output: `coordination/reviews/xr-effect-slice/review-lifecycle-current-8.log`.
- `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node compiled-lifecycle/coordination/reviews/xr-effect-slice/typed-array-probe.mjs`: **exit 0**. Its JSON output confirms `isArray: true`, the exact declared result TypeID, and an accepted real compiled request.

The R-EFFECT-SLICE author's pinned lifecycle suite is **7/7** at the original wrapper/test hashes; it includes actual append removal, nonzero offset, malformed wrapper/field/Value cases, cancellation ordering, and stale reply checks. The review-time 8/8 run includes the separate R-UNMOUNT regression test. React/DOM/browser matrix evidence remains with the harness lane.

## Hashes

Pinned R-EFFECT-SLICE sources and artifacts:

- `compiled-frontend/frontend/runtime/runtime.mjs`: `42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0`
- `compiled-frontend/frontend/runtime/runtime.test.mjs`: `6ea9236b08d1bf624bc9f8a84d2bebd6cacfbc12c91749cabf97b8fc6a7bf7b1`
- `compiled-lifecycle/runtime/runtime.mjs`: `c6fad592554dda059c45ecdb1db55ab62283783de1b1d76c0f320f44fbdf7166`
- `compiled-lifecycle/runtime/runtime.test.mjs`: `3c6f5c9d8631a9e1e557ffe93465e0b93d66a085a5b22a33f2f4e6fbb1d0c273`
- `app-ir.json`: `1e0389c7b0ee80119622ce99b8d2f9cc9c117d006ad358662eda5326048b3d23`
- `encoder.mjs`: `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`
- `gobi-compiled.mjs`: `1d1e8a0f5fe4d496780723a9ae4de4ca1047a9563e8d6ebd02151b4bd638bf8a`
- Author lifecycle log: `c995c6f68b67c46476c64b5f47cee3e8eca5a45cc47b2b9bb9c82a88ed324597`
- Author shared-runtime log: `714a47074e8f4127b0deeba8f0aa12b58869e95f926cece2bd027af36961fec6`

Independent probe artifact:

- `typed-array-probe.mjs`: `da9e2d216a3d5e582eff3d704b36be608bbfe43d8e765d023c26cd408d5af37e`
- `typed-array-probe.json`: `b4759d280945a5c3481b6cb9eb8935a52a9919da07a094bd0b376e2f5cf41f45`

The separate unmount repair changed the lifecycle wrapper and test files after the pinned 7/7 run. The independent 8/8 lifecycle run used wrapper hash `36e263da7447f1e8d658dc3233c30ccea06d6352d038a2c6f11b6417c2b9aa45` and test hash `39f7ce792aedd1bc6e4e5ec9a2b0ec4f56e83c2e3e0dd6edb1fd18fdf4495f30`. At review-close hash capture, those out-of-scope files had advanced to `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed` and `71954753de22fdac4a14d28db44917f0d02860f3cedddbc17732b2218d4fff29`, respectively. The shared runtime remains at the pinned hash above.

