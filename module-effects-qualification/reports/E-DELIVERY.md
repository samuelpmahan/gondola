# E-DELIVERY: native module-effects delivery

Outcome: `mixed_change`.

## Result

The Go consumer accepted the existing PR23 attempt in directory and archive modes. Both reports identify the historical producer source as `e0933465725e470dc610e3f81b4bbee95538c1d0`, confirm 202 source pins (2,214,236 bytes), and validate four scenarios, 20 profiles, 178 events, 182 states, 58 effects, 116 transport events, four builds, and two ABI pairs. Directory mode hashed 643 inputs. Archive mode validated 639 members and 8,667,568 compressed bytes; the four omitted regenerable browser bundles explain the input count difference.

The producer archive is SHA-256 `7eb9f28fc6504bf43207436dfc916549bb28e34059cee69bc138376be7940087`; its manifest is `457073a81f1c93ba0edfe51b06667bb39f9baed95fd32ad3a9c630f9f476b1b9`. The pinned source, restore instructions, and immutable publication identities are in [README.md](../README.md).

`e0933465725e470dc610e3f81b4bbee95538c1d0` is the base checkout HEAD and producer identity. At execution time the checkout was dirty (31 status entries), so there is no separate immutable verifier commit SHA to report. The `sourceCommit` field in the consumer JSON is the producer identity; it is not verifier provenance. Root owns clean source publication and the subsequent fresh run.

## Changes delivered

- Added strict Go CLI directory and archive inputs. Archive mode calls the effects-specific `modulequalification.VerifyEffectsArchive`, extracts only after bounded schema/member validation, then runs `effectqualification.VerifyDirectory` on the extracted attempt. The existing `VerifyArchive` remains limited to its compiled-modules schema.
- Added offline runner modes for an existing directory, an existing archive plus manifest, and a reproducible fresh attempt. Fresh mode requires an explicit expected source SHA, buffers the acceptance report until native archive acceptance and the four-package Go test suite both pass, and cleans private build/extraction directories on success and failure.
- Extended the producer's source closure from the actual Go `go list -deps -test` closure rooted at `cmd/module-effects-qualify`, `effectqualification`, `effectsreplay`, and `modulequalification`. The producer's Go test stage now includes `./effectsreplay`. Explicit pinned sources also include the runner, workflow, and `compiled-frontend/coordination/go.mod` nested-module boundary.
- Added profile ignores for fresh output, raw logs, evidence, and CI output so the producer's Git-cleanliness gate remains usable.
- Added the GitHub Actions fresh qualification workflow. Documentation gives directory/archive/fresh commands, immutable PR23 restore identities, backend extension requirements, measured scope, and tested/not-tested boundaries.
- Added only the authorized N5 addendum in `effectqualification/integration_test.go`: `GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT` overrides the integration-test expected producer SHA; absent the variable, the historical PR23 SHA remains the default. N5's sealed original packet is unchanged.

## Verification evidence

The raw log manifest records byte sizes and SHA-256 digests for 76 evidence files (excluding the manifest itself); its SHA-256 is `e3fe4df6737fa1b1910d715f0b33e8e0dc3d4ceaf54250330be1692400a97d42`.

- Built the Go 1.24 consumer and ran it against the real PR23 directory and archive. Both exited 0. The archive mode reported 639 members, and its archive summary matches the producer SHA. See `rawlogs/E-DELIVERY/directory.stdout.json`, `archive.stdout.json`, and paired exit/stderr files.
- Ran the directory consumer with `PATH=/nonexistent`; it exited 0, showing the compiled consumer does not need Node or other executables at runtime. A malformed CLI invocation exited 2 with empty stdout.
- Ran `go test -v -count=1 ./cmd/module-effects-qualify ./effectqualification ./effectsreplay ./modulequalification` with `GOBI_EFFECTS_QUALIFICATION_INPUT` set to the real attempt and `GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT=e0933465725e470dc610e3f81b4bbee95538c1d0`; all four packages exited 0. The effects integration tests therefore had an explicit real input and expected SHA. The separate default-source integration check also passed with the override unset.
- The full Go log visibly reports five unrelated legacy skips: `TestCapturedFixtureIsActuallyAccepted`, `TestRealCaptureMutationControls`, `TestVerifyArchiveCleansStageWhenDestinationAppearsDuringVerification`, `TestVerifyArchiveActualPublishedRuntime`, and `TestCheckCapturesRejectsCoherenceAndMissingTypedFields`. No pass is attributed to those tests. Effects-specific archive tests passed, including the assertion that the old API rejects the effects schema and adversarial malformed-member cases.
- `/tmp/gondola-go/go/bin/gofmt -l` reported no unformatted scoped Go files; a scoped trailing-whitespace scan checked 13 source and documentation files. `bash -n`, `node --check`, `go build`, and `git diff --check` passed. `go list -deps -test` produced the source-directory closure used by the producer. `git check-ignore -v` confirmed all four fresh output classes are ignored. The first formatter check used `gofmt` without an explicit path and exited 127 because it was not on `PATH`; the explicit Go 1.24 toolchain formatter check then passed.
- Success and failure runs left the private `TMPDIR` roots empty. The saved leftover reports for directory mode, archive mode, and malformed CLI mode are empty.

The first wrapper implementation returned the valid consumer JSON but then continued into fresh-mode argument parsing, exiting 2 when no fresh arguments were supplied. That was corrected by returning the consumer status from direct modes; the final directory and archive invocations above were rerun and passed. The initial failed invocation was not retained as a raw log; the final rerun outputs and exit codes are retained. The initial parser test also exposed that an explicitly pinned `compiled-frontend/coordination/go.mod` must be allowed even though the parent `coordination/` directory is excluded from recursive source discovery. The validator now permits that exact explicit source path, and the regression test passes.

## Scope and limits

This E-DELIVERY run exercised the published PR23 fixture; it did not execute `--fresh`, run the GitHub Actions workflow, launch a browser, invoke a compiler, or authenticate the current verifier source. Fresh mode and CI remain to be exercised by root after publishing the clean verifier source. The report proves native checks over the captured source, artifacts, ABI, and finite saved event/state/effect profiles. It does not establish pixel equivalence, browser input equivalence, arbitrary applications, network/auth behavior, or runtime fault injection across independently compiled modules. The next coherent milestone is live mounted asynchronous error, timeout, cancellation, and fault injection across independently compiled modules; saved-capture mutation controls alone do not cover those runtime faults.

Another backend should implement the declared Go node, message, input, publication, keyed lifecycle, effect, and correlation contracts; provide exact artifact/helper manifests and an event/DOM capture adapter; join the native-admitted profile registry; and replay the same fixed, direct, browser, and swap suite canonically.
