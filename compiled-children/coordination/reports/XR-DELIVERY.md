# XR-DELIVERY (N2): independent review of E-DELIVERY

**Decision: `amend`.** The author’s 31/31 HTTP smoke and its GoScript inputs are hash-consistent, and the runner is structured to retain failed stages. The positive inherited-run gate does not bind freshness to the inherited invocation or verify inherited report/archive/manifest bytes against their receipt pins. This could accept unverified inherited evidence. The smoke’s WebAssembly observation also fails open if API hooks cannot be installed, while the report calls the result “no WebAssembly activity.” The full inherited pipeline was not launched.

## Must-fix findings

### 1. Bind the inherited success to this invocation and verify its files

At [run.mjs](../../run.mjs), `verifyInheritedRun()` sets `current` from the overall delivery `receipt.startedAt` (lines 447–452). The caller records the actual inherited invocation time at lines 543–548, but the positive verifier never compares `inherited.startedAt` to `receipt.executionParameters.inheritedInvocationStartedAt`. A receipt produced after E-DELIVERY started but before its inherited command began can satisfy the current freshness predicate.

The same gate checks only that the inherited archive hash has 64 characters and a positive byte count (lines 457–458). It reads the report but does not compare its length or SHA-256 with `inherited.report`; it does not hash the archive or external manifest files; and it trusts `sourcePinsMatch: true` without comparing structured `sourceBefore`, `sourceAfter`, and pre-archive pins. Lines 476–488 record the bytes actually read for the inherited report, but do not tie those bytes to the inherited receipt’s claimed report hash. The full E-BUILD receipt contains archive and manifest paths, hashes, member inventory, and pre/post source pins, so the delivery gate can verify those exact fields and the copied attempt.

A read-only witness at [`N2-XR-DELIVERY-inherited-gate-witness.py`](../rawlogs/N2-XR-DELIVERY-inherited-gate-witness.py) demonstrates the freshness gap: with delivery start 12:00, inherited invocation 12:05, and inherited receipt start 12:02, the current comparison accepts although an invocation-relative comparison rejects. It also confirms that a nonempty report and a 64-character archive hash/positive byte count satisfy the current shape checks without verifying either file’s content. This witness is static and did not invoke the full runner.

Required repair: compare the inherited start to `inheritedInvocationStartedAt`; validate report and archive/manifest bytes against their structured path/length/hash fields; validate copied archive members against the external manifest; and require the inherited source-before, source-after, and pre-archive pin sets to match. Keep the final acceptance based on structured receipt data and byte checks.

### 2. Make the WebAssembly observation fail closed and bounded

The smoke installs wrappers for `instantiate`, `instantiateStreaming`, `compile`, `compileStreaming`, `validate`, `Module`, and `Instance` in [smoke.mjs](../../demo/smoke.mjs#L163). If `Object.defineProperty` throws, the catch at lines 177–179 silently continues, leaving the count at zero. The smoke does not record which hooks were installed. Its request check observes URLs matching `.wasm`; the report and README/results currently summarize this as “no WebAssembly activity.”

The current evidence supports the narrower statement “no `.wasm` request was observed and no call to an installed module compile/instantiate hook was observed.” Make hook-install failures fail the smoke, record the observed API list, and use that finite claim in reports/docs.

## Checks that passed

- The E-DELIVERY report and all 13 current source pins in its receipt match. All three npm lock hashes match.
- The author GoScript BuildResult and manifest hashes match. All **67** listed outputs match their recorded sizes and hashes, and the physical output set is exactly the 67 pinned files. The Go fixture app/view source pins match.
- The demo build record, 1,853,920-byte bundle, and four demo source pins match. The author smoke JSON reports **31/31** passing checks; IDs, HTTP rows, Chromium version, zero observed errors, and screenshot hash match the receipt.
- The earlier failed `go-init-state` smoke JSON remains present and hash-matches its receipt entry. The current runner preserves the author report/receipt and the successful author smoke directory before replacing canonical E-DELIVERY files. It does not copy the separately referenced earlier failed smoke JSON or one-member archive probe into the new attempt provenance; those originals remain untouched in the workspace, but a future attempt archive will not be self-contained for those historical artifacts.
- The standalone archive consumer independently verified the author’s one-member tar probe, manifest, extraction, size, and member hash. This is a probe only, not a full-run archive acceptance.
- Node 22 syntax checks for the five delivery JavaScript entry points and `bash -n run-compiled-children.sh` passed. The focused runtime, N4 checker/seeded, and N5 oracle suites passed **24/24**.
- CLI/API alignment matches the current N4 runner: the delivery runner passes `--native-go`, `--fixture`, `--expectations`, both manifests, `--chromium`, and `--output`. N5 is invoked as `node --test oracle.test.mjs`; the oracle tests consume the pinned scenario/expectations and N4 separately runs fresh native, direct, React, and DOM captures.
- CI installs Go 1.24, Node 22, the three locked npm dependency trees, and Playwright Chromium. The shell runner supports explicit `CHROMIUM_PATH`/`CHROMIUM_EXECUTABLE_PATH`, `/tmp/chromium`, and Playwright’s installed executable path; the Playwright resolution probe passed. Compiler commands select Go 1.27.3 through `GOTOOLCHAIN`.
- The delivery runner records command exit codes and stdout/stderr hashes, retains command logs on failure, keeps failed stage records, and sets a nonzero process exit for failed final status. It rejects arguments before entering the chain, uses a new attempt directory, captures source pins before work, and checks source and archive boundaries afterward.

## Evidence and limits

Author source/build/smoke hashes and my review logs are listed in [`N2-XR-DELIVERY-reviewed-hashes.log`](../rawlogs/N2-XR-DELIVERY-reviewed-hashes.log). The full author evidence audit is [`N2-XR-DELIVERY-author-evidence.log`](../rawlogs/N2-XR-DELIVERY-author-evidence.log); it checked the receipt, report, build outputs, smoke, failure JSON, and archive probe. Targeted Node tests are in [`N2-XR-DELIVERY-targeted-tests.log`](../rawlogs/N2-XR-DELIVERY-targeted-tests.log), static checks in [`N2-XR-DELIVERY-node-check.log`](../rawlogs/N2-XR-DELIVERY-node-check.log), and the fresh author archive-consumer result in [`N2-XR-DELIVERY-author-archive-consumer.log`](../rawlogs/N2-XR-DELIVERY-author-archive-consumer.log).

No production source, Git state, or scheduler state was changed. No full inherited run, fresh React/DOM build pipeline, integrated N4 browser replay, or full delivery archive was launched. E-DELIVERY remains unaccepted until the inherited gate and WebAssembly observation are repaired and root completes the source-frozen full pipeline.
