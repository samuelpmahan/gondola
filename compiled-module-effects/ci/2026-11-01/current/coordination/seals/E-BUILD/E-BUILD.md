# E-BUILD — independent compiled module builds and admission

**Worker:** N2  
**Outcome:** `mixed_change`  
**Repository base:** `f4c8f70199a8ca896c13e225a85901abe658d0de`

## Implementation

Added the effects-profile build adapter in `compiled-module-effects/build/**`. It compiles the existing `keyedmoduleparent` and the new `effectmodulechild` as four separate GoScript builds: React parent, React child, DOM parent, and DOM child. The adapter reuses the checked-in compiler, emits per-build requests/results and raw command evidence, and writes `build-index.json` for downstream host, browser, and harness consumers. The CLI is `node compiled-module-effects/build/build.mjs --output <empty-output-directory>`; the final run was written to `compiled-module-effects/build/output/E-BUILD-final`.

The loader exports `loadModuleEffectsBuilds(buildIndexPath)`, `browserModuleSideSource`, and `browserSideImports`. The loaded result contains `builds.react` and `builds.dom`, plus `profiles.react` and `profiles.dom`; each build exposes separately admitted parent/child sides, including `modulePath` and `encoderPath` for browser bundles.

The profile-local ABI checker retains the existing validator checks, admits only the declared child bridge capability extension, and requires the exact two closed descriptors. The Go module ABI validator recognizes the two known effect capabilities only on a typed child bridge with both `Input` and `Publication` roles; parent effect ABI remains unsupported. No generic effect certification is claimed. The child `uint64` exception is limited to `Generation` and `RequestID` as BigInt-encoded fields; all other BigInt placements reject, and every encoded value is checked against JavaScript's safe-integer range.

Parent keyed AppIR, source, and executable module/helper bytes were pinned to PR22. The only module/helper normalization removes exact generated source-path comment lines; code, strings, executable token changes, and unexpected comments are mutation-rejected. Raw hashes remain recorded alongside normalized comparison hashes.

## Four-build inventory

| Backend | Role | Package | Module ABI SHA-256 | Module SHA-256 |
|---|---|---|---|---|
| react | parent | `github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent` | `7dea72d5b46c78bc274b02cb4a98b411d6663b7ac160236b2184d974ab61bad2` | `a219bd5f7b4a96ed31a1086788d434bae30908aa6e8477369e2fc4b87e0537e3` |
| react | child | `github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild` | `2a9c9e13873a1ba3eef2964f2cddcb4948e40a64dc0506921366aa8d412c3b09` | `5e6b38e3986020d321a8e51cba5517d53ddc07d9976120c71ac3e00c8c5d9ca4` |
| dom | parent | `github.com/samuelpmahan/gondola/fixtures/compiled/keyedmoduleparent` | `def5f48128cdaeadf7616a4974ee93067a05533da0f55bb76d75f9b9e031834a` | `6d860c9f4a7a7d96af567fac66ebb4df4be749c03c475f45102ac6f109e36aed` |
| dom | child | `github.com/samuelpmahan/gondola/fixtures/compiled/effectmodulechild` | `fb21ee2718302df9dec70168f3b5a30a25836d0eee51f3e6d8260bb83d8dd3bf` | `27bdeda816af6435f263615c79cd53e587ca061a32af2bc335ce90fd9491984b` |

Each backend passed profile admission with an unchanged parent ABI. The exact build index SHA-256 is `70046a0e7f1070c3ec2ad2186e060137a77f2d8df02b5c23bb1760baf156c444`; it records `4` actual builds and 59 source/dependency pins. The complete index and output artifacts are in `compiled-module-effects/build/output/E-BUILD-final`.

## Effect and numeric boundary admission

Both backends exercised four ordered effects across exactly two descriptors: request `fixture.request/save/complete` with Go-owned token, cancellation `lifecycle.cancel/cancel/empty`, a retry with an incremented request ID, and unmount cancellation. Each probe recorded eight states: initial, mount, input/publication, request, cancel, retry, unmount, and stale completion. Request state commits `Pending=true` and its token before the effect returns from Go Update.

The declared descriptors are:

- `fixture.request`, name `save`, opaque active token `key:g<generation>:r<requestID>`, reply `complete`.
- `lifecycle.cancel`, name `cancel`, the same opaque active token, empty reply.

For each backend, the mount-boundary probe compared complete Go state (`Core`, `Key`, `Generation`, `Mounted`, `RequestID`, `Pending`, `Token`, and `Reply`) and ordered effects to the native Go output. It covered 10 cases, 16 steps, and four emitted effects with exact parity. `max-safe` and `max-safe-cancel-retry` accept generation `9007199254740991`; plus one, zero, leading zero, malformed, uint64 max, uint64 overflow, non-ASCII digit, and another invalid byte reject without state change or effects. The generated encoder's BigInt values were checked for exact safe-integer conversion at every step.

## Verification

- Four actual independent builds and pre-host artifact admission passed for React and DOM.
- `loadModuleEffectsBuilds()` passed against the final index; its selected admission summary is preserved in `rawlogs/E-BUILD/loader-validation.log`.
- Go module ABI tests passed: `TestDescribeAcceptsDeclaredChildEffectsAndPreservesCanonicalChecks` and `TestDescriptorRejectsUnsupportedCapabilitiesAndStaleDigest`.
- Go stage diagnostic regression passed: `TestStageFailureDiagnosticsPreserveCauseOnlyWhenNoStageDiagnosticExists`.
- Node syntax checks passed for `build.mjs`, `module-loader.mjs`, and `abi-admission.mjs`.
- Toolchain: Node v22.23.4, root go version go1.24.0 linux/amd64, compiler Go go1.27.3 linux/amd64, GoScript v0.6.2, esbuild 0.28.2.

Exact build commands/results, dependency and artifact hashes, and failed probe attempts 01–06 are preserved in `rawlogs/E-BUILD`. Probe 07 is the successful four-build run. A temporary direct `produce` test captured probe 05's hidden stage cause (module ABI rejected `effect.request-reply` while returning no diagnostics); its source, the pre-extension descriptor snapshot, command, and output are archived under `rawlogs/E-BUILD/stage-error-reproduction`. The final regression test covers the empty-diagnostics cause propagation without retaining a candidate test that skips after the repaired build succeeds.

## Evidence boundary

This packet verifies actual emitted builds, exact profile admission, compiled GoScript state/effect behavior, and native numeric-boundary parity before host initialization. It does not claim mounted React or browser DOM behavior, end-to-end host transport behavior, or cross-run conformance; those belong to N3–N6. No Git mutation was made by N2.
