# XR-DELIVERY — independent review of E-DELIVERY

**Worker:** N4  
**Decision:** `amend`

## Packet integrity

The sealed E-DELIVERY report and receipt match the seal. The seven authored files in `SOURCE-INVENTORY.json` also match their sealed copies and current worktree bytes (7/7). The exact final receipt reviewed is SHA-256 `2590d6151e485bd013234e815502537c9e91dabb00ba5ed938f88d5f8213bfa7`; earlier announcement hashes were not used.

## Review findings

The delivery runner is structured as an eight-part profile: toolchain and Git/source admission; focused tests; fresh native capture; four independent GoScript builds; native/direct/browser conformance; demo build and HTTP smoke; source recheck; archive and independent consumer verification. The source enforces the finite contract counts: 24 fixed events, 16 Go updates, 17 checkpoints, three seeds with 40 events each, 12 browser profiles, and at least five detected mutation controls. These are code gates, not results observed in E-DELIVERY.

The source snapshot includes the new GoScript codec files and testdata through the recursive `compiled-frontend/build` walk. It also explicitly pins the browser-version helper and its test, archive helper implementation, runner, wrapper, lockfiles and workflow. A clean source-attested invocation compares the supplied 40-character commit with `HEAD`, rejects dirty state unless author-only mode is explicitly requested, checks source bytes against Git blobs, then compares source pins again after profile/archive/consumer work. E-DELIVERY’s own 25-file author snapshot predates the UTF-8 repair and is correctly described as historical rather than as the new source closure.

The demo builder reads each manifest-resolved module, encoder, raw ABI descriptor bytes, AppIR and all four descriptor-listed generated artifacts, checks their digests, and maps actual bytes into the bundle. It presents the imported encoder function as an own data property, matching host admission. The README gives the Go 1.24 / compiler Go 1.27.3 / Node 22 / pinned React reproduction command and a bounded renderer-registration procedure; the workflow supplies the same tool versions, dependency setup and browser installation context and retains attempt evidence. The workflow separately keeps existing M0 and counter regressions.

Archive construction uses the shared helper’s same-directory staging and no-clobber publication. The independent Python consumer runs after the producer returns and verifies regular unique members, exact inventory, byte lengths and hashes. This is archive/manifest integrity evidence; the semantic native/direct/browser comparison occurs earlier and is not inferred from archive hashes. I ran the helper’s seven focused tests separately; all seven passed, including tar failure cleanup, no-clobber and real inventory round-trip cases. This separate review test is not evidence that N6’s delivery runner ran them.

## Required amendment

The delivered profile does not run or source-pin the archive helper regression tests. `runFocusedTests()` discovers tests only under `compiled-modules/abi`, `runtime`, `conformance` and `oracle`; it omits `compiled-capabilities/archive-helper.test.mjs`. The runner’s explicit source pins include `compiled-capabilities/archive-helper.mjs`, but not its test. The workflow’s `push.paths` and `pull_request.paths` likewise include the helper implementation, but not its test file. A test-only change to the staging, failure-cleanup or no-clobber guarantees therefore neither triggers this workflow nor enters the runner’s source closure, and the delivery run cannot catch a regression in those guarantees.

Add `compiled-capabilities/archive-helper.test.mjs` to the runner’s pinned source closure, execute it in the focused Node suite, and add it to both workflow path filters. Then run the source-attested profile. This amendment is narrow; it does not invalidate the separately verified archive implementation or the passing seven-test review run.

## Acceptance boundary

N6 explicitly records `fullRunner: not_run`, no source-commit attestation, no fresh native/direct/browser match and no archive creation/consumer verification. Its Chromium demo smoke used prior build outputs from before the UTF-8 and numeric-boundary repairs. I accept the integrity and implementation quality of the authored packet, while withholding delivery acceptance until the test-closure amendment and a final source-bound run are complete. No production source, Git state or scheduler state was changed during this review.

## Evidence

The exact source and test logs, source-match record, packet seal check and rawlog index are under `module-coordination/rawlogs/XR-DELIVERY/`. The seven E-DELIVERY source hashes, report/receipt seals, author result boundary and review commands are repeated in the machine-readable receipt.
