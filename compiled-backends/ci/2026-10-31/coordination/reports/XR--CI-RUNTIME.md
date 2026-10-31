# XR--CI-RUNTIME (N3 review of E-CI-RUNTIME)

**Decision: accepted.** The E-CI-RUNTIME packet accurately reports the primary fresh full push run and its scope. I verified the report/receipt pins against the retained run and artifact, recomputed both execution source pin sets against the current published checkout, checked the combined Node command and TAP output, and inspected the runtime swap/effect/lifetime contract in source and tests. I found no material misstatement requiring amendment.

## Independent artifact and source audit

The packet identifies the correct primary evidence: successful full push run `41155530877`, job `124401386239`, artifact `13025112465`, source `195c9433179218348d4b9f2477ae1e0725337d15`, tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`. This evidence is distinct from the separately tracked synthetic PR run; I infer no PR status from the push result.

I verified the 14,931,201-byte ZIP SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa` and recomputed all 817 extracted member sizes and SHA-256 values against `retained-index.json`. The raw job log SHA-256 is `c647178d63605521abb5c60ae780703cec06a6e9137dcd22b39b2f10d28d7bcb`; it records checkout of the published head, invocation of `bash run-compiled-backends.sh`, and upload of the artifact with the matching digest.

Current runtime source SHA-256 `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4` and test SHA-256 `39790809f3392bb47b3f48d17bfdc40b6fe8628961513f0b1ddf3e69a014e907` match the E-CI-RUNTIME receipt. The compiled-frontend execution record contains 122 `sourceBefore` and 122 `sourceAfter` pins; compiled-backends contains 126 in each set. I compared every pin across each before/after pair and against the current checkout: all match. The records report compiled-frontend status `passed`, 33 child commands and zero mismatches; compiled-backends status `passed`, full mode, 18 commands, zero failures, and `sourcePinsMatch: true`.

The exact runtime test command is the `node-tests` entry in the frontend execution record: Node `v22.23.4`, `--test`, and the 17 listed frontend/conformance files, including `compiled-frontend/frontend/runtime/runtime.test.mjs`; its working directory is the repository root. The archived stdout hash is `60fbc3b138975258c1ba4b3c0c597bdebe05aaa78d6a89364e0741f4d19a8269`, stderr is empty with SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, and the TAP summary is 97 passed, 0 failed. Cases 71–97 are 27 contiguous runtime tests; I matched all 27 emitted test names and order to declarations in the pinned runtime test file.

Toolchain pins agree with the primary records: Node `v22.23.4`; root Go `1.24.13`; compiled Go `1.27.3`; React/React DOM `19.3.1`; Playwright `1.64.1`; managed Chromium `156.0.8078.4`; esbuild `0.28.2`.

## Runtime contract review

The implementation and tests support the packet's claims:

- `replaceRenderer` admits a synchronous renderer, uses the cached raw Go View for the new renderer, and does not call the application's Init, Update, or View functions. State and the application trace remain unchanged by a successful swap; the returned value is the normal state/View/DOM snapshot. Swap diagnostics live outside `gobi.trace`.
- Successful replacement unmounts and retires the previous renderer lease. Its retained `dispatch` and `onStaleAction` closures are fenced by renderer identity and reported in `rendererDiagnostics().fencedCallbacks`, with no application dispatch ID or trace tick. Tests also preserve the established behavior for the active renderer after runtime unmount: a late stale action appends a suppressed tick using the cached logical view and physically empty DOM, without Go Update.
- Focus capture and restoration use the optional synchronous pair. The runtime validates a focus record and requires truthful boolean restore success when a keyed focus snapshot exists. Integration records cover 9 focused swaps. Invalid, throwing, thenable, async-function, and reentrant cases are tested with failure stage and teardown phase distinguished; failures after old-renderer teardown fail closed, with no rollback claim.
- Effect requests are committed only after state and view commit. A valid completion invoked synchronously during replacement is queued until replacement returns; completion remains correlated and is committed once, while duplicate/wrong-correlation replies are rejected. The runtime tests cover completion cancellation on unmount and synchronous host delivery.
- The R-OBSERVATION repair is present in the pinned source: renderer `viewRecord()`/`domSnapshot()` returns and active `unmount()` results pass through the no-thenable guard. Rejected native Promise results are observed before shape validation or unmount success is reported; regressions assert no unhandled rejection, Go Update, or application trace mutation on these failure paths.

The primary artifact's five browser conformance checks independently report `matched` for React, DOM, and alternating swaps. Across them there are 43 ticks, 37 swaps, 9 focus swaps, and 45 detected mutation controls. Each fixture has zero page errors/WASM activity, and its recorded unmount empties both physical DOM and renderer snapshot. The effect swap record shows the pending request surviving a React-to-DOM swap with unchanged trace and host request/completion counts; completion follows once. The keyed-list data records backward selection and focus retained through reorder.

## Evidence and limits

This review is read-only with respect to runtime/production files and does not rerun the browser matrix. The independent raw-artifact verifier and its accepted output are:

- `compiled-backends/ci/2026-10-31/lanes/reviews/xr-ci-runtime/audit_runtime_packet.mjs`, SHA-256 `e4c4e327d754f7c42b0674b1a077fa27e33d4898d6b7c18be351d90a69e3aa74`.
- `compiled-backends/ci/2026-10-31/lanes/reviews/xr-ci-runtime/audit-accepted.json`, SHA-256 `8be567cdfe72b6d7d4a63033edf99a7940f4b8d09f188c19ba2ecc99b1f832be`.
- Run log: `compiled-backends/ci/2026-10-31/lanes/reviews/xr-ci-runtime/audit-accepted.log`, SHA-256 `ec97fda222c2d64cad0d5b3576de77f4c57ad6ef1aef1442825dc3ed29f8fe5c`.

Two failed development invocations and earlier successful audit versions are retained in the same review lane. The final verifier checks the corrected metadata representation, current browser-version location, archive members, all source pins, exact Node test log pins, and the five raw backend checks. No input artifact or source file was rewritten.

The runtime remains a synchronous trusted-renderer contract, not a sandbox for arbitrary Proxy/getter behavior. Regular functions returning thenables are detected after invocation; post-teardown replacement snapshot failures have no rollback guarantee. Evidence is bounded to the pinned deterministic applications and Chromium version. The integration artifacts do not prove a retained native DOM event listener fired after node removal or runtime unmount; callback probes and runtime callback-lease tests are narrower. Other browser engines, hydration, concurrent React, arbitrary Go modules, production effect transport, PR status, merge readiness, and deployment are outside this packet.

## Input packet digests

- E-CI-RUNTIME report SHA-256 `650d203d8dabf5d1ff44b319662b66197347948bd4a70f420b12c38dc9888d32`.
- E-CI-RUNTIME receipt SHA-256 `30d44cb4eb4be9168b9448d041d901bd6c77294081fa4fc74e9161344e712f92`.
- Compiled-frontend execution record SHA-256 `29be76274bceac28e5df142de9aea4419941d330d26f8f5d9de3a747474efc3a`.
- Compiled-backends execution record SHA-256 `6abb89ef41972c790ee95e0248c141944f97a55fbe4b9cd7d29fa78adc90907e`.
