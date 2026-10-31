# XR-HARNESS — independent review of module-pair conformance evidence

**Reviewer:** N6  
**Decision:** `accepted`  
**Reviewed packet:** N4 `E-HARNESS`  
**Scope:** Sealed report/receipt, harness and runtime source pins, compiler source/output inventories, literal/native/direct/browser evidence, and the existing mounted capture. I did not rerun Chromium or change production source, Git state, or scheduler state.

## Finding

The sealed E-HARNESS packet is internally consistent and the captured result is reproducible through its pinned inputs. I independently verified the sealed author report and receipt, all indexed raw files, the 28 current harness/runtime input pins, the 46 current compiler input pins, and every one of the 274 emitted compiler output files against the recorded hashes. All matched.

I then reran the sealed checker offline against the archived native, direct, and browser captures and the actual emitted React and DOM modules. The literal native trace, direct compiled traces, all 12 captured mounted profiles, and all six negative capture controls passed. A fresh Go CLI run in the Node test suite also matched the independent literal. No browser was launched for this review.

## Results checked

- Fixed scenario: 24 source events, 16 Go updates, and 17 state checkpoints. The manually specified literals in `compiled-modules/oracle/oracle.mjs` are checked independently against a fresh native Go CLI trace. Direct React and DOM outputs and mounted state, tree, bridge ordering, and physical-DOM snapshots are then checked against that native trace and the literal projection.
- Fixed React, DOM, and swap captures each contain 24 events. For each profile, the browser called `HTMLElement.click()` on 20 connected controls: 15 enabled controls invoked one callback apiece; five controls with `disabled === true` invoked no callback and caused no Go update. These are browser DOM click calls, not OS-level pointer input.
- The swap profile accepted DOM→React at event 11 and React→DOM at event 23. Both swaps preserved Go role counts. The callback captured on source event 0 from the initial DOM renderer was invoked after the first swap; it was rejected as stale (`accepted:false`, `stale:true`) with one invocation and no change in Go call counts or bridge calls.
- Seeds 20261031, 20261032, and 20261033 each contain 40 bounded click inputs and were mounted in React, DOM, and swap profiles. Go updates/checkpoints were respectively 29/30, 27/28, and 27/28. Disabled-click counts were 11, 13, and 13 per profile; disabled controls had no callback, and enabled controls had one. The checker compared state, view tree, physical DOM, and bridge calls against each fresh native and direct capture.
- The six controls mutate fields in a valid captured swap profile and confirm that the checker rejects the mutation: parent typed state, child view tree, physical DOM HTML, disabled flag, bridge order, and a fabricated Go role call before ABI rejection. These are **offline capture mutations**, not six live defective renderer or backend executions.
- The invalid-ABI probe recorded zero Go role calls, zero renderer factory calls, and unchanged caller DOM. All three fixed browser profiles recorded no failures or page errors.

## Source and artifact pins

- E-HARNESS report and receipt match their seal. The author raw-log index lists 92 files; every listed file matched size and SHA-256.
- All 28 paths in the E-HARNESS tested-source pin set match the current worktree. All 46 compiler inputs match their before/after pins and current bytes. The 274 files listed in the four independent GoScript build records also match their current size and SHA-256: React parent 67, React child 70, DOM parent 67, DOM child 70.
- The current `compiled-modules/runtime/runtime.mjs` and its tests are within the verified E-HARNESS source set and match the separately sealed E-CLEANUP pins.
- The N3 digest repair is an intentional source overlay. The E-HARNESS source pin and E-DIGEST receipt both identify the current JavaScript ABI validator at 35,025 bytes, SHA-256 `2a8f0c4cfb2a60c08a71f2596b5e06563b663c1aa60d07384d488a8268bc95b0`. The original E-ABI validator bytes remain preserved separately at 34,000 bytes, SHA-256 `a392febf57509bc61c0f221e74429c0f6e268540ac2b675e931e5dc6396a16bd`; they are not misrepresented as the current implementation. The Go `moduleabi/descriptor.go` remains byte-identical to its E-ABI source pin (`d255480f6a10792e1f7f4e6d2204014f128fbb764cd98be8bd23797016b51ced`).
- E-HARNESS did not assert a Git candidate identity. These content pins establish byte consistency for the tested worktree and outputs, not authenticated repository provenance.

## Independent checks and evidence

I ran these checks without launching Chromium:

- `GOBI_GO_BIN=/tmp/gondola-go/go/bin/go /tmp/gondola-node22/node_modules/node/bin/node --test compiled-modules/conformance/check.test.mjs compiled-modules/conformance/seeded.test.mjs` — 4/4 passed. The checker tests invoke a fresh Go CLI and include negative native state/tree/bridge-order checks.
- `/tmp/gondola-node22/node_modules/node/bin/node /workspace/scratch/39a56936f173/module-coordination/rawlogs/XR-HARNESS/offline-recheck-final.mjs` — passed. This invokes the sealed native/direct/browser assertions on the archived captures, covers all three seeded profile triplets, and detected all six offline mutations.
- Versions: Node v22.23.4, Go go1.24.0 linux/amd64. The original capture records Chromium 153.0.8010.0 and Playwright 1.64.1.

The primary capture is `rawlogs/E-HARNESS/attempt-007-mounted/module-pair.browser.json` (31,814,241 bytes, SHA-256 `0c02edf99ab891c1102236e26ccd697505dc68e882afd9cd02f6da207271b90c`). Its matched summary is SHA-256 `8f34b3aee36b39e9f6ba6deeac50dd7df2b1f89ac1330d340e6544505a535174`; run metadata is `d8cd61e6e5c70c07ad3eaa56ced25c168dcb9325b0665c1d12d35a7dc26dd4d7`. Review scripts, outputs, command logs, and hash audits are indexed at `module-coordination/rawlogs/XR-HARNESS/index.json`.

## Limits

This accepts the evidence for the frozen parent/child fixture, bridge ABI, two renderers, fixed scenario, three deterministic seeds, and the tested Chromium/Linux environment. It does not establish arbitrary module-graph or renderer correctness, OS-level input behavior, general browser portability, malicious-capture resistance, or release/CI status. The six mutations measure checker sensitivity to changes in this capture; they do not substitute for live faulty-backend runs.

One reviewer-only first invocation had an incorrect relative import path and executed no assertions. I corrected the path; the final offline replay passed. The setup error and corrected run are recorded in the review raw logs.

## Pins

- E-HARNESS report: `fcbbab35272686c3163f48cd837adeb5a2364c7f86ef6ed922f0bdd40e51403e`
- E-HARNESS receipt: `b45ccbc217fe345a6fb7a6cc6be12b5de312a49648cae479e2516640aaccc7be`
- E-HARNESS raw-log index: `e1d47c7fe0bc0e7d2399b4305f5343063ef1328202e16c7f33fd18a15b50bc7e`
- Review byte-closure audit: `module-coordination/rawlogs/XR-HARNESS/byte-closure-reproduced.json`
- Review capture audit: `module-coordination/rawlogs/XR-HARNESS/capture-audit.json`
- Review offline replay: `module-coordination/rawlogs/XR-HARNESS/offline-recheck-final.json`
