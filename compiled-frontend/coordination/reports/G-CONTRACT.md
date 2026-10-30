# G-CONTRACT

**Outcome: `mixed_change`.** The v1 contract remains Go 1.24 compatible. The analyzer now fails closed on the reproduced integer-bound false accepts and the native value codec follows the probed JavaScript Number/BigInt split. The accepted source profile is intentionally bounded; this report does not claim general Go numeric soundness or four compiled-app success.

## Changes

- `compiled-frontend/analyze/` projects typed Go source independently with `go/parser` and `go/types`; numeric constant identifiers become literal operations, local variables have source-position identities, and assignment operators include their left-hand expression count (`<token>#lhs=N`) so guard invalidation follows writes.
- The analyzer checks true-side `if` and loop guards against the declared integer width and safe-number range, carries both bounds only through `&&`, removes facts after writes, and does not treat switch case lists as conjunctive guards. It rejects integer compound assignments, unproven arithmetic/conversions, unsafe constant values, entry-package mutable globals, and entry-package `init` functions with source spans.
- `compilercontract.EncodeValue`, `ValidateValue`, and `DecodeValueJSON` enforce the same ABI boundary as the generated encoder: Number-backed integer values must be safe and fit their Go type; BigInt-backed `int64`/`uint64` values preserve their full declared width.
- `CONTRACT.md` records the bounded arithmetic profile and its limits.

## Preserved pre-repair false accepts

The source regression was run before the analyzer repair using a temporary source package loaded by `LoadSources` and analyzed by `Analyze`. The pre-repair output showed these real-source lines without `analyze.numeric-profile` diagnostics:

```text
unsafe source line was accepted without a numeric-profile diagnostic: state.Mutated++
unsafe source line was accepted without a numeric-profile diagnostic: state.Add += 9007199254740991
unsafe source line was accepted without a numeric-profile diagnostic: state.Subtract -= 9007199254740991
unsafe source line was accepted without a numeric-profile diagnostic: state.SwitchOr++
```

The same run accepted a safe `state.Safe64++` control. A later RED pass also showed `state.ConstValue = unsafeNumberConstant` accepted and a safe named-constant bound incorrectly rejected. The codec RED pass showed `EncodeValue` accepted `int(±9007199254740992)` and `uint(9007199254740992)`, while `ValidateValue` accepted the same unsafe tagged Number value. Full-width BigInt controls already passed before the codec fix.

## Verification

All temporary numeric-source probes go through `LoadSources` and `Analyze`, not a hand-built operation tree. They cover the mutation-after-guard, `+=`/`-=`, switch OR, false-side `else`, inclusive bounds, multiplication, loop post overflow, int8/int32 limits, signed negative decrement, multi-assignment invalidation, same-name shadowing, runtime integer conversions, out-of-range named constants, and safe guarded controls. Numeric diagnostics are checked against source-relative file paths and non-empty byte spans on the source lines under test. A separate loaded-source probe checks source spans for rejected mutable globals and `init` functions.

Passed focused commands:

```text
# Nested compiler module, Go 1.27.3
GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 ./analyze -v
PASS: TestLoadAndAnalyzeCompiledFixtures (counter, form, list, effect)
PASS: TestValidateOperationsRejectsUnknownCallAndUnsupportedNode
PASS: TestValidateOperationsRequiresSafeIntegerBounds
PASS: TestLoadSourcesAndAnalyzeRejectsUnsafeIntegerSource
PASS: TestLoadSourcesRejectsMutablePackageGlobalsAndInitFunctions

# Root module, Go 1.24.0
/tmp/gondola-go/bin/go test -count=1 ./compilercontract -run 'TestEncodeValue(MatchesNumberAndBigIntIntegerABI|PreservesFullWidthIntegersAndRejectsNonFiniteFloats)' -v
PASS: Number-backed unsafe limits reject; safe limits pass; int64/uint64 full-width BigInt values remain exact.
```

The analyzer test confirms that all four approved entry packages pass source loading and analysis. It does not claim that this lane produced the final four frontend bundles. The separate numeric audit previously passed 11 unsafe source cases and five safe controls; a final-source rerun was requested after the last constant/global guard additions.

## Bounded guarantees and remaining gaps

- This is a conservative validator for the tested subset, not general Go range analysis. It accepts only guarded `+1`/`++`, guarded `-1`/`--`, and bounded `len(slice-or-array)*2` when used as a `make` capacity. Compound integer assignments and runtime integer conversions are rejected.
- The analyzer roots reachability at package-level `Init`, `Update`, and `View`. It rejects mutable globals and `init` functions in the entry package. Initialization effects in imported dependency packages are not analyzed; v1 assumes trusted dependencies used by the four approved fixtures.
- Guard identity covers local variables and field paths. It does not claim full alias, interprocedural, or arbitrary control-flow proof. Unsupported operations and the listed unsafe source patterns produce diagnostics; untested Go constructs are outside this guarantee.
- The source-entry test proves the analyzer gate for four packages, not direct emitted-JS replay, browser behavior, or a build artifact.

## Source hashes

SHA-256 at this checkpoint:

```text
compilercontract/contract.go fa3ef8b3c60f3ff1d4a0e80827bfa65dc21ad741b3c421c1f4634f6b3c0b363e
compilercontract/contract_test.go be25c3acc722254e8dbb0b472510f81d4e0ca340dccd6812ce9c9b319e356332
compilercontract/js_encoder.go 45b90cc43cd02fb056a9836bcbc63fa392d34d0bc1003213b43d735c30301397
compilercontract/json.go 1a6ddd715af3f8cd3659bc45496e905a62d4b94b0339f7c1bfdf5505024c053e
compilercontract/trace.go de5aa3f70314fe3cc1e5661ce682c953de6ee12328cba3dd609a891657c5e627
compilercontract/validation.go ccb28713bfa7dd0fd5b22fb5dd377945006d9f0517357c62f230666b91ec2e76
compilercontract/value.go e6f26347e56d8bd97f4802dff206489ed3901082525a2b4c7497fe0811c71a1f
compilercontract/view.go cd57673458b025b860f39dbf0c4c23b7958db7c68d7380011e1aaed9bd6260c7
compiled-frontend/CONTRACT.md eb6adaaf8f69d083ddf594b2aa5d68346e405ff58bf62014fa5c07b79cf2456a
compiled-frontend/analyze/analyze.go 28270a69953b8a65d797b0187ca64cd50f48693a5cf283d9cd5edf16841f19c5
compiled-frontend/analyze/analyze_test.go 1333860cd91d0708bfed22364eeecd4162f7ac7834af33c77ef48ad39e7dbe1a
compiled-frontend/analyze/load.go 5ab960705778e54ee3c46f6f975a47cc455f713ef626e81788c7960d867e5a8d
compiled-frontend/analyze/numeric_security_test.go 656f6c4d6f47941f05e307214b238d0a5c0fb2dd4899b1cc8013bc528532f609
compiled-frontend/analyze/package_state_test.go e8ece8e1b9477afb4846b3c35023816ce8862f151bbea4da723c73e74d302003
compiled-frontend/analyze/project.go 32a2c6cee4d3a84a83d76733343f49c061910e3b6329d7fd153a1979a400868a
compiled-frontend/analyze/types.go 50562366a1ec36c2c3b1ce19c1919ce451500f02cf90e80cc1bcbf82a05afbbf
```
