# XR-HOST independent review

**Decision:** `accepted`  
**Reviewer:** N2  
**Reviewed job:** E-HOST (author N3)

## Sealed source and artifact checks

The E-HOST report and receipt match `seals/E-HOST/seal.json`. Both owned runtime files match the sealed source inventory. The build index, loader, ABI validator, renderer binding, Go helper fixture, and emitted GoScript source pins also match the E-HOST receipt. The current `E-BUILD-final/build-index.json` is 84,891 bytes with SHA-256 `75df29c02218fab47294454bb0338a720d806901d64377b4cae024fd4f6a2e66`; the E-BUILD packet seal and XR-BUILD accepted review packet verify. Full file/byte/hash checks are in `rawlogs/XR-HOST/pin-verification-rerun.json`, `pin-verification.json`, and `build-seal-check.log`. The saved verifier rerun records 27 passing source, dependency, ABI, helper, and descriptor checks; command: `python3 ../keyed-module-coordination/rawlogs/XR-HOST/verify-pins.py`.

| Backend | Parent ABI | Child ABI | Keyed helper | Helper descriptor |
| --- | --- | --- | --- | --- |
| DOM | `afcc8a633dd042f197eae1fc980c51d36c6c606bddcda336e649871183932146` | `ffbba9b1c36182a7623f9b24468814bfab6210d725d5f3e549fd41542337166d` | `5937778c4b147344247b7886508605d0d2f0581b2f68fac3c4b799e533c29b37` | `03e34f2b9c78e53794e3efaf680031b5bbec1da99c419c81d41616a2268c0e85` |
| React | `3e34e9d8b09e7d9e726ec30c2325340e8ae4be1542d4d3c0ded0243b0009bea3` | `ed5fad22b7b94b4d7ffeb52e1ac880cafc582057673c656c875e369b7bd1ac69` | `7a9e993e97c4aaa47903a6e71449a318c0eb21071f2ed61cd0ac5b1ea5eb9545` | `24e6541fcdb7eba3d0aa9b7dc356200a1f0b08f092d9ad50234f1608de8e8945` |

## Runtime review

The loader builds the parent and child records independently for both backends. It checks the helper artifact and descriptor byte pins, backend/package/component identities, module ABI and AppIR hashes, plus the fixture and emitted GoScript source byte/hash pins before importing the helper. Its descriptor contract pins the three helper signatures and explicitly records that `Children` is AppIR-reachable while `ReceiveKeyed` and `IsCurrent` are exported sidecar helpers outside the unchanged shared analyzer's reachability admission.

The host and loader use a closed helper API with exactly `children`, `receiveKeyed`, and `isCurrent`. The helper adapter projects only `{key,generation}` rows: it copies the GoScript slice window, reads own data fields, checks the finite key and safe generation profile, and returns frozen rows in a frozen array. `keyedSidecar` and the helper record use exact-key validation; browser module source generation copies only the frozen sidecar fields and the pinned bytes.

I verified the host checks helper byte length/digest and backend/package/component/module ABI/AppIR identity before calling any renderer factory or Go role. The existing runtime tests mutate helper bytes and each identity field; all six cases reject before renderer creation, parent `Init`, or container changes. I added six additional closed-record probes across both backends: extra helper member, accessor helper member, and extra sidecar member. All rejected before factories, `Init`, or container mutation.

The runtime reconciles children by key plus Go generation, retains the same per-key Go state/renderer/root through reorder, unmounts removed instances, and initializes a new state/root for a remount. Renderer swaps preserve Go state while advancing a separate renderer epoch. Old callbacks and publications are rejected by the corresponding generation or renderer epoch checks before Go role calls. The two-backend runtime test confirms call counts stay unchanged after removed-child, old-generation, and old-renderer callbacks/publications.

A separate actual-artifact probe exercised disabled parent mount, disabled parent step-down, and disabled child reset controls. Each was suppressed without Go calls. After adding one to both children, resetting `a` changed `a` from 1 to 0 while `b` remained at 1, for both DOM and React builds. See `rawlogs/XR-HOST/reset-disabled-probe.*`.

## Fresh checks

Node: `/tmp/gondola-node22/node_modules/node/bin/node --version` → `v22.23.4`.

| Command | Result | Evidence |
| --- | --- | --- |
| `GOBI_KEYED_BUILD_INDEX=/workspace/scratch/39a56936f173/gondola/compiled-keyed-modules/build/output/E-BUILD-final/build-index.json /tmp/gondola-node22/node_modules/node/bin/node --test compiled-keyed-modules/runtime/runtime.test.mjs` | 2 passed, 0 failed, 0 skipped; exercises both actual build profiles | `rawlogs/XR-HOST/runtime-test.*` |
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-keyed-modules/conformance/module-loader.test.mjs` | 1 passed, 0 failed, 0 skipped; descriptor source-identity mutation checks | `rawlogs/XR-HOST/loader-test.*` |
| `GOBI_KEYED_BUILD_INDEX=/workspace/scratch/39a56936f173/gondola/compiled-keyed-modules/build/output/E-BUILD-final/build-index.json /tmp/gondola-node22/node_modules/node/bin/node ../keyed-module-coordination/rawlogs/XR-HOST/reset-disabled-probe.mjs` | Pass for DOM and React | `rawlogs/XR-HOST/reset-disabled-probe.*` |
| `GOBI_KEYED_BUILD_INDEX=/workspace/scratch/39a56936f173/gondola/compiled-keyed-modules/build/output/E-BUILD-final/build-index.json /tmp/gondola-node22/node_modules/node/bin/node ../keyed-module-coordination/rawlogs/XR-HOST/closed-helper-admission-probe.mjs` | 6/6 closed-record controls rejected before factories/Go Init | `rawlogs/XR-HOST/closed-helper-admission-probe.*` |

Node printed an experimental `EnvHttpProxyAgent` warning; all commands exited 0. No runtime test was skipped.

## Available browser conformance evidence

Separate E-HARNESS Chromium captures are present. I verified the summary hash against its check record, then checked every saved browser profile's byte length/hash, scenario event count, snapshot count, browser version, failure field, and empty-container unmount result. The four scenarios have 12 browser profiles total (React, DOM, and renderer-swap profiles); each literal capture has 18 events/19 snapshots, and each of the three seeded captures has 36 events/37 snapshots. The capture summary reports Chromium `153.0.8010.0` and Playwright `1.64.1`, no page errors, matched native parity, and 17/17 build identity mutation controls rejected. The capture audit command is `python3 ../keyed-module-coordination/rawlogs/XR-HOST/audit-browser-captures.py`; its complete result is `rawlogs/XR-HOST/browser-audit.stdout.log` (with the concise pin summary in `available-browser-conformance-audit.log`).

The browser lifetime audit also checked the actual `HTMLElement` IDs in all 12 captures: both children retained root IDs during reorder, only `a` received a new generation/root on remount, and each renderer swap retained logical Go identities while replacing renderer-owned DOM IDs without Go-role calls. The literal browser snapshots also show reset isolation in real Chromium: resetting `a` preserved `b`, remounted `a:2` started empty, and resetting `b` preserved `a`. Disabled controls and stale callbacks/publications had no bridge-call or Go-role count deltas. See `rawlogs/XR-HOST/browser-audit.stdout.log` and its script. The browser runner source confirms these are programmatic `HTMLElement.click()` DOM dispatches, not trusted pointer or OS-level input. This XR-HOST review verified the saved E-HARNESS captures but did not rerun the full browser matrix.

## Limits and notes

This review supports the bounded synchronous `a`/`b` runtime and pinned actual artifacts. It does not claim asynchronous effects, trusted physical input, broader key counts, or shared-analyzer reachability for `ReceiveKeyed`/`IsCurrent`.

Several initial read-only report-inspection attempts used guessed summary fields or paths and errored before asserting anything; the corrected pin and capture audits passed. No application tests or runtime commands failed. Exact inspector mistakes and corrections are preserved in `rawlogs/XR-HOST/reviewer-tooling-notes.log`.
