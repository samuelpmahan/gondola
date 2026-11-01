# XR-BUILD — independent review of E-BUILD

**Reviewer:** N4  
**Job:** XR-BUILD  
**Decision:** **AMEND**  
**Reviewed packet:** sealed E-BUILD source inventory, report, receipt, final build index, and preserved probes 01–06.

## Decision

The sealed E-BUILD packet is internally consistent and its canonical final output passes independent loading, typed admission, source and artifact pin checks, mutation controls, and focused Go tests. I found one release-blocking integration issue: the build adapter rejects the fresh output directory used by the N6 delivery runner. An independent build in that runner-style directory reproduces the rejection before an index can be produced. This requires a separate E-BUILDPATH repair before the build contract can be accepted.

## Verified criteria

- Sealed E-BUILD report, receipt, seven-file source inventory, source-pin manifest, and 255-file raw-log index all match their hashes. All indexed raw-log files and all seven source-inventory files rehashed without mismatch.
- The final build index is SHA-256 `70046a0e7f1070c3ec2ad2186e060137a77f2d8df02b5c23bb1760baf156c444` with four independent outputs: React and DOM parent builds for `keyedmoduleparent`, plus React and DOM child builds for `effectmodulechild`. All 59 recorded source/dependency pins load and verify.
- The unchanged keyed parent is pinned to PR22 AppIR/source and executable bytes. Both backends record raw module/helper hashes and normalized hashes. For the canonical build location, path-only comment mutation controls pass, while executable string/token changes and unexpected comments reject.
- `moduleabi/descriptor.go` has no fixture package or effect name hardcoding. Effect capabilities are structurally constrained to the child `Input`/`Publication` roles; parent effect capabilities are rejected. The build profile then admits the exact effect child state fields and the two closed descriptors. Positive alternate-child and negative parent/unknown/duplicate capability tests pass.
- Both loaded children expose the five expected Go roles: `Init`, `Update`, `View`, `Input`, and `Publication`. Each backend produced four actual effects across two unique descriptors. Ten native boundary cases and sixteen state/effect steps per backend replayed through compiled React and DOM GoScript modules with exact native parity; each backend reports four emitted effects.
- The generated encoder admits `uint64` as BigInt only for `Generation` and `RequestID`, checks the exact encoded integer string and safe-integer range, and rejects other uint64 placements. The independent loader reports seven of seven build-admission mutations rejected.
- Focused module ABI tests passed (2/2); the stage-failure cause regression passed (1/1). The stage fallback preserves existing diagnostics and reports the error cause only when the stage supplies none.

## Blocking finding: fresh output-root comments are rejected

E-BUILD advertises `node compiled-module-effects/build/build.mjs --output <empty-output-directory>`. The N6 runner creates a per-attempt root at `compiled-module-effects/output/attempts/<attempt-id>/builds`. That produces a generated helper path comment of the form:

```text
// ../compiled-module-effects/output/attempts/<attempt-id>/builds/react-parent/emitted-ts/@goscript/builtin/panic.ts
```

The normalizer in `compiled-module-effects/build/abi-admission.mjs` only recognizes helper comments rooted at `../compiled-module-effects/build/output/<run>/...`. I independently reran the build CLI with the N6 environment and a fresh runner-style output path; it exited 1 at `normalizeGeneratedArtifactText()` before producing the four-build index. N6's preserved failure reports the same rejection.

The fresh helper's raw SHA-256 differs from the canonical E-BUILD-final helper because generated comments contain a different output path. After stripping line comments for this review comparison, the helper executable bytes are identical to the canonical helper (SHA-256 `807a3c1707c920a0115b268324691b40f7118e502d6f4db75fe9fea72eae06b0`). This confirms a path-normalization/runner-root mismatch, not a generated-code change. The normalizer should recognize the runner's exact anchored output-root form, with the same executable-mutation and unexpected-comment rejection controls.

## Exact verification

- Loader/admission and all seven mutation controls: [loader-admission.log](../rawlogs/XR-BUILD/loader-admission.log)
- Focused Go tests: [moduleabi-test.log](../rawlogs/XR-BUILD/moduleabi-test.log), [stage-diagnostic-test.log](../rawlogs/XR-BUILD/stage-diagnostic-test.log)
- Fresh output-root reproduction: [fresh-output-build.stderr.log](../rawlogs/XR-BUILD/fresh-output-build.stderr.log), [fresh-path-assessment.json](../rawlogs/XR-BUILD/fresh-path-assessment.json)
- Sealed source/raw-log rehash checks: [e-build-packet-verification.json](../rawlogs/XR-BUILD/e-build-packet-verification.json)
- Indexed reviewer evidence: [rawlogs/XR-BUILD/index.json](../rawlogs/XR-BUILD/index.json), SHA-256 `a50901b9332af579d5a9ae89c220b034b9ae0bfc88800ed1d438188c8aaab38f`.

Toolchain: Node v22.23.4, root Go go version go1.24.0 linux/amd64, compiler Go go1.27.3 linux/amd64, GoScript v0.6.2, esbuild 0.28.2. Commands and outputs are indexed under `rawlogs/XR-BUILD`. The full E-BUILD archive is referenced by its original hash; this review does not duplicate it.

**No E-BUILD source files were modified during this review.**
