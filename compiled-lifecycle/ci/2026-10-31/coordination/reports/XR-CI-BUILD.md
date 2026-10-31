# XR-CI-BUILD — independent review of primary build evidence

**Decision: accepted for the bounded React/DOM build and artifact audit only** (`confirmed_reuse`). The provider run remains failed; this review does not accept full CI or the withheld native/direct/browser conformance check.

## Packet and provider binding

I reviewed N5's E-CI-BUILD report (SHA-256 `98ae169b95c5b7772e66c2249efed58921ddd5783d8637758bffb31be55516ff`), receipt (SHA-256 `b04e275c266b976c003562b69df6eed9cbf730e85bf8d3e745e601b4f6743be5`), audit JSON (SHA-256 `94114d9c3d8f3d7d968bdc07b302e1139a74eadc4771f057e8078366e37cf924`), and audit script (SHA-256 `1c73d947fbff4a2aaae9b6cefb16962e17ab5f3043ec64f608a09a7cb632647c`). The N5 receipt hash matches the supplied packet pin and its report hash matches the report bytes.

The artifact is ID `13034915662`, run `41178420647`, source commit `49cc2b96c8817a47319d5b7bd484184a22fa984b`, tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`. I independently reassembled and hashed the 12 retained chunks, then streamed the original 47,035,803-byte ZIP (`6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`). All 1,272 unique member names match the retained inventory; every member's size, SHA-256, and CRC matches, with 412,381,547 uncompressed bytes and no unsafe paths or extraction mismatches.

I checked all 122 uploaded source pins against blobs in Git commit `49cc2b96c8817a47319d5b7bd484184a22fa984b` and confirmed the tree is `d49ca35b7eda23837c392bbe0d2363551e4c7bec`. The comparison uses the pinned Git object, so unrelated mutable-worktree edits cannot change this result.

## React and DOM build evidence

The retained attempt executed `go run ./cmd/gobi-build` for both backends with `GOFLAGS=-buildvcs=false` and `GOTOOLCHAIN=go1.27.3`. Each BuildResult is successful, has zero diagnostics and 67 output entries. I independently matched all 67 pinned output files for React and all 67 for DOM against the extracted bytes and hashes. The 67 output pins for each backend also remain unchanged before and after the recorded matrix/demo stages.

Both AppIR files are byte-identical and bind component `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`; both declare `effect.request-reply`. Update's AppIR result type is `[]github.com/samuelpmahan/gondola/gobi.Effect`. The generated encoders are byte-identical and describe that slice as `array-or-goscript-slice` of `gobi.Effect`; the Effect struct has exactly string fields `Kind`, `Name`, `Arg`, and `Reply`. The AppIR and encoder pins are React/DOM SHA-256 `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` and `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`. The 65 remaining outputs excluding `buildmanifest.json` and the backend-specific compiled module match; the manifests match after removing the backend tag. The two raw compiled module hashes differ and remain separately pinned.

The fresh app-directory runtime suite ran after both builds with `GOBI_LIFECYCLE_APP_DIR` set to the React app directory under attempt `attempt-20261031T065420569Z`. Its TAP output records 10 passed and zero failed; stdout SHA-256 is `423cb059cc96073a10f6d57271c0c8b6c07af7bbf11631cbe7ce3f2e7c8173ca`.

The attempt's inner lifecycle archive also verifies: all 241 regular-file members match its manifest, covering 158,843,470 uncompressed bytes, with no member or path errors. This supports artifact custody only.

## Failure boundary

The provider artifact conclusion and uploaded E-BUILD execution are `failure` / `failed`. The retained run snapshot separately records `in_progress` at its capture time; that snapshot is not evidence of success. The conformance invocation passed `--native-go go`, and the runner resolved it to `/home/runner/work/gondola/gondola/go`, which failed with `ENOENT`. The conformance evidence includes direct and browser stage files, but `lifecycle.check.json` is absent and the run record says the final check was withheld. Therefore the build and runtime subchecks are verified, while full hosted CI and complete native/direct/browser equivalence are not accepted.

## Reproduction and hashes

Run `python3 compiled-lifecycle/ci/2026-10-31/lanes/review-build/review_artifact.py` from the repository root with Python `3.12.14`. The verifier rechecks the exact provider chunk/ZIP/member/extraction hashes, all 122 pinned Git source objects, both sets of 67 build outputs, AppIR/encoder/effect ABI, output stability, runtime TAP evidence, inner archive, and failure boundary.

- Independent result: `compiled-lifecycle/ci/2026-10-31/lanes/review-build/review.json`, SHA-256 `e17ed68cc6bfc0852ac3bcf17400557b17d7845e270c0d39713d4cae4c85812f`.
- Reviewer script: `compiled-lifecycle/ci/2026-10-31/lanes/review-build/review_artifact.py`, SHA-256 `5a194bcfa1df76c34d2067359a45b7fb9b93d7b8b2a661c0b8e8e7e87210c25e`.
- N5 audit script and result hashes are recorded above. No source, Git, or provider state was changed by this review.
