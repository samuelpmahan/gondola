# XR-FIXED-GO — independent Go/GoScript artifact review

**Decision: accepted** (`confirmed_reuse`) for N1’s E-FIXED-GO packet, bound to the successful primary run `41181505234`, artifact `13035044166`, source `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`. The review used the original provider ZIP and pinned source bytes. It did not rebuild, rerun tests, or rerun a browser.

## Author packet and provider identity

The authored E-FIXED-GO report is SHA-256 `b24faffdbe95ea59076947fd47226ca2779180dcd31678e006a1c5ca6230e7da`; its receipt is SHA-256 `237c9c31140de0a23d56c3611e75286d0a13936e78eedb55298b85d387b9ea68`. Both match the requested pins and were left unchanged.

The original ZIP `/tmp/gobi-compiled-lifecycle-41181505234.zip` is 47,072,021 bytes, SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`. Its 1,270 members passed a CRC scan. The review reads relevant outputs directly from the ZIP; it does not use the extraction-only unmanifested temporary file. Provider and source identity are those recorded for the current 00da run, not an earlier artifact.

The embedded execution record reports a full passed attempt: 18 commands, 13 passed stages, no failures, and 123 source pins equal before and after. I independently rehashed all 123 corresponding source files against the execution record. Key checked sources include the lifecycle Go fixture (`fixtures/compiled/lifecycle/app.go`, `6b61e55c…340fe41`), the core frontend runtime (`compiled-frontend/frontend/runtime/runtime.mjs`, `42da6087…bd643e0`), the lifecycle wrapper (`compiled-lifecycle/runtime/runtime.mjs`, `9c2a0652…2261ed`), and the Go encoder generator (`compilercontract/js_encoder.go`, `a605b326…b9b46d`).

## Native and direct Go value linkage

The AppIR and direct/native traces identify `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`. For all 26 native/direct events I compared the Go message, decoded full State, Go View tree, and emitted effects. The source-pinned conformance runner and checker report `matched`; the checker covers 26 events/ticks, 17 renderer swaps, seven requests, three cancellations, 32 retired-renderer fences, and eight detected mutation controls. Its native, direct, browser, and physical-DOM literal-oracle flags are all true.

At `removeParent`, native Go marks Parent, Child, and Grandchild dead and keeps the independent Sibling alive with its request still pending. Native Go and direct compiled GoScript emit the same ordered cancellation tokens: Grandchild, Child, Parent (`grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`).

## Effect slice TypeID and encoding path

Both AppIR profiles declare the Update signature as `State, gobi.Message -> State, []github.com/samuelpmahan/gondola/gobi.Effect`. The declared slice type uses `array-or-goscript-slice`; its element is the `gobi.Effect` struct with exactly string fields `Kind`, `Name`, `Arg`, and `Reply`. The generated encoder carries that same TypeID and slice metadata.

The direct trace’s actual `removeParent` result is a non-nil typed slice with TypeID `[]github.com/samuelpmahan/gondola/gobi.Effect`. Its three elements have TypeID `gobi.Effect`, the exact four-field shape, and `lifecycle.cancel/cancel` payloads in the child-first order above. The normalized host effects match those typed values. The generated GoScript module’s `removeParent` function appends cancellations Grandchild, Child, then Parent.

The pinned shared runtime gets the effect result TypeID from the compiled Update symbol signature, checks it against AppIR’s declared slice, passes it to `gobiEncodeState`, validates the returned slice/elements/fields, then applies the effect policy. Its default policy remains closed to `fixture.request`; the lifecycle wrapper explicitly validates the lifecycle request/cancel ABI. The archived lifecycle runtime tests include the shifted nonzero-offset GoSlice, malformed GoSlice/Effect field rejection, and malformed typed Value rejection cases.

## uint64 and BigInt evidence

AppIR declares `uint64` as 64 bits with JavaScript representation `bigint`. All 234 `uint64` values in the direct trace are typed `uint` Values encoded as decimal strings. The finite lifecycle fixture caps generation/request IDs at `9007199254740991`; the native scenario remains inside that safe-number bound. Full-width encoding is covered separately by the pinned `compilercontract` Go tests: `TestEncodeValueMatchesNumberAndBigIntIntegerABI` checks a full-width `uint64` maximum of `18446744073709551615`, signed 64-bit bounds, and rejection of Number-backed integer values outside JavaScript’s safe range. The recorded `go test ./compilercontract ...` suite passed, so this is test evidence, not a claim that the lifecycle fixture itself reaches the full uint64 maximum.

## Fresh React/DOM outputs and hosted suites

Both GoScript builds report `ok:true`, zero diagnostics, and 67 outputs. I checked every output’s bytes and SHA-256 against the archived BuildResult, build record, and before/after output pins. Both output sets stayed stable through the checker. React and DOM AppIR and encoder bytes match; their raw modules remain separately pinned rather than being claimed identical.

The hosted Go package commands and logs record success:

- `go test ./compilercontract ./gobi ./fixtures/compiled/lifecycle ./cmd/compiled-lifecycle-native`
- From the compiled-frontend module: `go test ./analyze ./build ./cmd/... ./emit`

The pre-build Node suite passed 71/71. The lifecycle runtime suite passed 10/10 after the React and DOM builds, with `GOBI_LIFECYCLE_APP_DIR` set to the fresh React app output. Tool versions recorded by the run were Node `v22.23.4`, npm `10.9.9`, root Go `1.24.13`, compiled Go `1.27.3`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, and esbuild `0.28.2`. These results are read from the hosted artifact’s command receipts and logs; no suites were rerun here.

## Scope and review record

This confirms the finite admitted lifecycle fixture, its native adapter, the current generated React/DOM modules, the declared GoSlice effect bridge, and the hosted conformance/test outputs. It does not establish compilation for arbitrary `Manager` APIs or pointer-owned lifecycles. `effect.request-reply` is a coarse AppIR capability marker; the wrapper supplies the closed effect policy. The 66,817,124-byte raw browser profile remains in the provider ZIP and is hash-pinned; the full checker records the browser literal-oracle and physical DOM checks as passed.

The review command was:

```sh
python3 compiled-lifecycle/ci/2026-10-31/fixed/reviews/go/review_fixed_go.py
```

It read original ZIP members and source files, then wrote only the audit JSON in `fixed/reviews/go/`. No product source, author packet, Git state, extraction data, build, or test suite was changed or rerun.

- Independent review audit: `compiled-lifecycle/ci/2026-10-31/fixed/reviews/go/audit.json`
- Review script: `compiled-lifecycle/ci/2026-10-31/fixed/reviews/go/review_fixed_go.py`

This conclusion is limited to the pinned successful 00da artifact and its retained source, build, test, and conformance records.
