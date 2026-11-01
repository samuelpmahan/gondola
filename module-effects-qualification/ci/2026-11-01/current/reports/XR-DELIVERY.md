# XR-DELIVERY — independent review of E-DELIVERY

**Reviewer:** N2  
**Decision:** `amend` (publication URL dependency only)

## Review result

The native verifier, CLI, archive mode, runner’s existing-input modes, Go adversarial tests, source-pin checks, and workflow configuration are accepted on the reviewed frozen source. No production source or tests were changed during this review.

The single open item is the README’s “latest branch guide” URL. It points to branch `codex/gobi-native-effects-qualification-acceptance-20261101` and path `module-effects-qualification/ci/2026-11-01/current/README.md`. That ref is not in the published branch list, and the published source branch `codex/gobi-native-effects-qualification-20261101` at `4338255bf8800d521b7f932fb530fe2cedebbf72` has `module-effects-qualification/README.md`, not the claimed CI guide path. The linked guide currently returns 404. Per the root’s publication plan, this is an intentional forward reference to the evidence branch/path that will be created after fresh runs and final packaging; the gate remains open for publication and a follow-up URL readback. The five immutable PR23 URLs in the same README are reachable and match all five published SHA-256 pins.

## Verifier and CLI

The source seal and inventory are internally consistent: 89 source inventory entries, no missing or unlisted source files, no inventory or seal-record mismatches. The outer E-DELIVERY report is byte-identical to its profile source. The original E-DELIVERY receipt remains preserved byte-for-byte; the outer canonical receipt differs only by worker normalization and its correction record.

The strict CLI accepts exactly directory mode or archive-plus-manifest mode. Duplicate, unknown, incomplete, or mixed options fail before report output. The native report is marshalled only after all checks pass. Existing `VerifyArchive` retains its compiled-modules schema; `VerifyEffectsArchive` has a separate closed effects schema, bounded member extraction, source/member one-to-one pins, and archived execution-snapshot identity checks. It does not execute JavaScript. Limits include 64 MiB compressed archive, 128 MiB expanded archive, 32 MiB manifest/member, 4,096 members, 4,096-byte paths, and 255-byte path segments.

The frozen Go 1.24 overlay build and four-package suite passed with the real PR23 attempt and expected source commit explicitly set. The five visible skips are unrelated legacy modulequalification tests whose separate fixture environments were not supplied; no pass is attributed to those skips. Existing effects archive tests cover the old/new schema boundary and malformed or inconsistent manifests. The only E-DELIVERY integration-test delta from N5 is the authorized `GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT` override, defaulting to the historical PR23 commit when unset.

## Runtime and delivery probes

The built native binary accepted the PR23 directory and archive with `PATH=/nonexistent`, reporting four scenarios, 20 profiles, and 178 events in both modes. Archive mode reported 639 members and 8,667,568 compressed bytes. A malformed mixed-mode invocation exited 2 with empty stdout.

The wrapper’s directory and archive modes produced the same accepted reports. Its malformed option case exited 2 with empty stdout. A manifest with one incorrect declared member hash was rejected after extraction/staging; the wrapper exited 1, emitted no stdout report, and both archive staging and private temporary roots were cleaned. Four output classes (fresh output, rawlogs, evidence, CI output) are covered by the profile ignore rules.

The wrapper’s fresh-mode source path was inspected: it requires a 40-character lowercase source commit, snapshots the `go list -deps -test` closure for the four native Go packages, validates source pins before/after execution, runs archive acceptance then the four-package Go test suite, and only prints the buffered report after both succeed. The GitHub Actions workflow passes `actionlint`; the shell runner passes `bash -n`. Fresh mode, CI, and browser execution were not run here; root owns the fresh run and final publication.

## Backend requirements and limits

The backend requirements are concrete: implement the declared Go node, message, input, publication, keyed lifecycle, effect, and correlation contracts; supply exact artifact/helper manifests and an event/DOM adapter; join the native-admitted profile registry; and replay the same fixed, direct, browser, and swap suite canonically.

The documented profile remains bounded to captured finite scenarios and saved source/artifact/ABI/state/tree/DOM/disabled-control/event/effect/lifecycle/correlation checks. It does not claim pixel equivalence, other engines, arbitrary applications, network/auth behavior, or runtime fault injection across independently compiled modules.

## Evidence

All commands and raw outputs are indexed in `rawlogs/XR-DELIVERY/index.json`. The key evidence is:

- `source-integrity.stdout.json`: source/seal/rawlog integrity and relocation checks.
- `go-suite.stdout.log`, `go-build.stdout.log`: frozen-source package suite and build.
- `directory.stdout.json`, `archive.stdout.json`, and paired stderr logs: native PR23 modes.
- `wrapper-directory.stdout.json`, `wrapper-archive.stdout.json`, `wrapper-bad-cli.*`, `wrapper-bad-member.*`, and `tmp-leftovers.stdout.log`: runner probes and cleanup.
- `integration-delta.diff`: the one authorized N5 test override.
- `pinned-url-hashes.json`, `branch-guide-fetch.json`: immutable URL hashes and the pending forward-reference URL readback.
- `actionlint.*`, `bash-syntax.*`, `ignore-rules.*`: workflow, shell syntax, and clean-ignore probes.
