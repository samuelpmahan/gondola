# XR-G-CONTRACT

**Decision: amend.** The closed source/JSON contract and focused Go tests support the finite four-app profile. The independent numeric audit found no unsafe false accepts, with 14 unsafe source cases rejected and six safe controls accepted. Two additional safe numeric patterns are conservatively rejected. The current browser checkpoint still fails on three apps because the renderer rejects valid GoScript `GoSlice` backing metadata; N1's pinned-runtime probe confirms that the metadata is real. This review made no production changes.

## Contract and source review

- The root `compilercontract` module is Go 1.24 compatible. The nested source analyzer runs on Go 1.27.3. The closed JSON decoders reject unknown fields, wrong tagged-union shapes, and trailing JSON. The generated state encoder checks exact own keys, reads own data descriptors rather than properties, rejects accessors without invoking them, and rejects unexpected string or symbol keys.
- The generated encoder's state-shape probe accepted the actual `form.State` shape, rejected added string and symbol fields, and rejected an accessor with `getterCalls: 0`. It also accepted a plain own-field object without a `clone` method. That is an encoder-only result: state cloning happens in the emitted GoScript `Update` forwarder, whose `(state).clone()` behavior is covered by the pinned ABI evidence. The encoder does not establish or invoke the transition clone operation.
- AppIR preserves `int`/`uint` as Number-backed and explicit `int64`/`uint64` as BigInt-backed. Native and generated encoders accept Number-backed values only within the safe range and declared Go width, while preserving full-width BigInt values. Nil and empty non-nil slices remain distinct; float64 negative zero is encoded as bits `8000000000000000`.
- Entry-package mutable globals and `init` functions are rejected with source spans. The written contract explicitly leaves imported dependency initialization outside v1 analysis and assumes the four fixture dependencies are trusted. The source analyzer admits the four fixture packages but does not claim general Go range, alias, interprocedural, or control-flow proof.

## Independent numeric evidence

N5's final raw audit contains 22 cases: 14 expected unsafe source cases reject with source spans, six required safe controls pass, and two optional safe patterns are conservatively rejected (`safe_compound_add_control`, `cross_function_safe_numeric_parameter`). There were no unsafe false accepts. The same raw result confirms the safe Number boundary `[-9007199254740991,9007199254740991]`, rejects immediately out-of-range `int`/`uint`, and preserves full-width `int64`/`uint64` values as BigInt decimal text. The five focused analyzer test groups pass, including all four fixture packages and entry-package global/`init` gates.

## GoSlice ABI amendment

The pinned GoScript v0.6.2 source defines a private, non-global `Symbol('goscript.spareZero')` on grown backing arrays when spare capacity remains. Its value is a zero-value factory; spare slots remain holes until the slice extends into them. The N1 actual-module probe observes that symbol on form, list, and effect `Node.Attrs.backing` arrays, with own data descriptors and function values. The symbol is local to each bundled GoScript runtime, so its presence cannot be authenticated by importing or comparing a shared global symbol.

N6's source-frozen browser run passes counter but fails form/effect during mount and list after action 0 with `Node.Attrs.backing has unsupported symbol properties`. N6 raw failure bundles and manifests preserve the reproduction. This is a valid pinned-runtime shape that the renderer currently rejects. The required compatibility rule is narrow: validate the GoSlice wrapper and visible-window bounds/descriptors, snapshot only the visible window into a fresh dense array, and never read or invoke the spare-capacity factory. Allow the observed spare marker only on a GoSlice backing with the observed own data descriptor shape; do not claim symbol identity/authenticity. Holes outside the visible window may represent unused capacity. Ordinary arrays must remain dense and reject unknown symbols and extra own properties.

The state encoder has a related unverified boundary: `sliceItems()` passes the entire GoSlice backing to strict `ownArray()` before it slices the visible window. That helper rejects every extra symbol and every sparse index. This review did not edit or repair that separate owner boundary; N2 has been asked to test actual grown state slices and address it if reproduced. Four-app acceptance therefore still requires a fresh integration run after the renderer and encoder boundaries handle actual GoScript shapes.

## Verification

Commands run from the repository root and nested module respectively:

```text
GOTOOLCHAIN=local /tmp/gondola-go/bin/go test -count=1 ./compilercontract -v
# Go 1.24.0; all compilercontract tests pass.

GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 ./analyze -v
# Go 1.27.3; all five analyze test groups pass.
```

Full output is preserved in `coordination/reviews/xr_g_contract/go24-contract.log` and `go27-analyze.log`. The focused encoder shape probe and raw output are also preserved in that directory. The current N6 final checkpoint is under `conformance/raw/n6-source-900dc38-final/`; counter is matched, while form, list, and effect retain failed browser artifacts. The actual GoSlice probe is N1's `coordination/reviews/xr_r2_react/goscript-slice-probe.raw.json`.

## Evidence hashes

SHA-256 at this review checkpoint:

```text
CONTRACT.md eb6adaaf8f69d083ddf594b2aa5d68346e405ff58bf62014fa5c07b79cf2456a
semantic/ABI.md 6da7fe9292c14317c29eb275be8e5074409fd683bd2e528ac0326e5c053e191d
compilercontract/contract.go fa3ef8b3c60f3ff1d4a0e80827bfa65dc21ad741b3c421c1f4634f6b3c0b363e
compilercontract/js_encoder.go 45b90cc43cd02fb056a9836bcbc63fa392d34d0bc1003213b43d735c30301397
compilercontract/json.go 1a6ddd715af3f8cd3659bc45496e905a62d4b94b0339f7c1bfdf5505024c053e
compilercontract/validation.go ccb28713bfa7dd0fd5b22fb5dd377945006d9f0517357c62f230666b91ec2e76
compilercontract/value.go e6f26347e56d8bd97f4802dff206489ed3901082525a2b4c7497fe0811c71a1f
analyze/analyze.go 28270a69953b8a65d797b0187ca64cd50f48693a5cf283d9cd5edf16841f19c5
analyze/load.go 5ab960705778e54ee3c46f6f975a47cc455f713ef626e81788c7960d867e5a8d
analyze/project.go 32a2c6cee4d3a84a83d76733343f49c061910e3b6329d7fd153a1979a400868a
analyze/types.go 50562366a1ec36c2c3b1ce19c1919ce451500f02cf90e80cc1bcbf82a05afbbf
numeric audit raw 68914c08fcb4b02f063ffc717a539eae9728e2d00131ac4b0b97bf9e5d7d73f6
Go 1.24 test log c6811662ac264ef2edc39d0fc08972543e720e8d874a72ab4640016c3093eeea
Go 1.27 test log cbaaab3f673b767b1ddbbf8516f9be32ffa5e3611563cda2496621465f5e473c
encoder shape probe 79f19d30bf07c9a14769eea05a8334303d3d61ae9a7b10a057a6e93dfed1c14f
encoder shape raw 45654990cdf29a7d3010cd18447707629697f1125726f4fabc17bb419b8fb4b9
GoScript v0.6.2 slice.ts 5f6da8d9bb986cc49f1323e1ba505c8ba779da6c54ebaacf6c1bd540e9a0bdea
N1 GoSlice probe raw 2589ac6e1371c82bdc04f594a673e498f1b397518e84d69b1c0f6d12752d9517
N6 counter.browser.json 2956294ec74a84429deb01147bdcc266b7a2fc7108866f4c92c973f7ac79b9cb
N6 form failure raw 95d32525277fbe1d52940f7e4656172e57d9e6e8e40cfff18534a6a457a4fde1
N6 list failure raw 4d4041ab393d59ececf2ba79125856d2fde0a6306e8de6d5cae7d0ddb33da88e
N6 effect failure raw 467e2c2398cd8843db5ff87e656126b5380e0d21b7adb347b7a16064d82a82b3
```

Limits: this is a finite-profile contract review, not a general Go soundness proof. The two safe false rejects remain. No production source was changed. Browser acceptance remains open until the real GoScript GoSlice metadata and lazy spare capacity are handled at each relevant ABI boundary and all four apps pass from a fresh source checkpoint.
