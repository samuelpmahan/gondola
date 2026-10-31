# XR-CI-DEMO — independent review of the managed HTTP demo

**Decision: accepted for the bounded HTTP demo extraction only** (`confirmed_reuse`). The hosted workflow remains failed; this review does not accept the full CI run or the withheld lifecycle conformance result.

## Provider and packet binding

The reviewed packet is N3's `E-CI-DEMO` report, SHA-256 `ff7a8cab3a3a2c47486a25b74f20e1b9f874d8b7a923d10bef6bdd42bc3b17c6`. Its receipt binds that report to the demo audit. I independently reassembled the 12 retained provider chunks and compared the result byte-for-byte with `/tmp/gobi-compiled-lifecycle-41178420647.zip`: 47,035,803 bytes, SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`. The ZIP has 1,272 unique, safe members, 412,381,547 uncompressed bytes, and all CRC checks pass. The selected smoke, screenshot, execution, native trace, site assets, AppIRs, Go module, and encoder match their extracted copies.

The provider records artifact `13034915662`, run `41178420647`, head `49cc2b96c8817a47319d5b7bd484184a22fa984b`, with workflow conclusion `failure`. The current tree identity is `d49ca35b7eda23837c392bbe0d2363551e4c7bec`. All 122 recorded source pins remained equal before and after the hosted attempt and match the current worktree. The attempt's execution mode is `full`, and its status is `failed`.

## Bounded demo evidence

The retained managed smoke reports all 12 checks passed. The page, CSS, and bundled JavaScript returned HTTP 200. Browser version `156.0.8078.4` recorded zero browser errors, console errors, failed requests, WASM requests, or WASM API attempts. Four renderer swaps are recorded with 24 trace ticks including Init and no pending effects at the end.

The browser trace matches the native Go CLI trace for Init and all 23 Go updates: message, decoded full Go state, View tree, and emitted effects match at each corresponding step. Reply correlations and physical action paths also match. This is a bounded comparison of the captured HTTP demo trace and native CLI trace; it does not repair the separate full conformance run.

The effect evidence records seven Go requests, child-first subtree cancellation (`grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`), and preservation of the pending independent Sibling. Three retired generation-1 callbacks are rejected; three stale Go completion messages leave the remounted state unchanged. Sibling and generation-2 Parent/Child/Grandchild replies are accepted; duplicate Sibling and Child replies are rejected. The final controls expose the expected disabled Request and Remount states.

I opened the screenshot directly from the extracted provider artifact. It is a 1440 × 1622 PNG, 326,350 bytes, SHA-256 `d1a9d09dc59e88ce02a83e7d8734acf5987e3e4a1a5c3714384a881295b17648`. It shows the completed generation-2 Parent/Child/Grandchild tree, the completed Sibling, DOM selected, no pending requests, and the disabled Request/Remount controls.

The smoke's demo build record binds the full Go package component ID, React/DOM AppIRs, the compiled GoScript module and generated encoder; its bundle inputs include both existing DOM and React renderers. The included AppIR carries `view.node` and `effect.request-reply`. This is real compiled Go state and View evidence, not a JavaScript business reducer.

## Failure boundary

The primary managed workflow remains failed. Its native replay passed `--native-go go`, which resolved to `/home/runner/work/gondola/gondola/go` and failed to spawn with `ENOENT`. The native/direct/browser matrix is marked failed and the final conformance check is explicitly withheld. Therefore I accept only the HTTP demo substep's captured evidence and artifact binding; I do not claim full CI, complete native/direct/browser equivalence, or overall workflow success.

## Reproduction and hashes

Review command: `python3 compiled-lifecycle/ci/2026-10-31/lanes/review-demo/audit_review.py` (Python `3.12.14`). The read-only reviewer rechecks provider chunk and original ZIP hashes, ZIP integrity, selected extracted members, all 122 current source pins, module/build bindings, the 12 smoke assertions, the native/browser trace correspondence, effect ordering, and the failure boundary. Screenshot inspection was performed from the extracted artifact.

- Independent audit: `compiled-lifecycle/ci/2026-10-31/lanes/review-demo/audit.json`, SHA-256 `f31ea1b8c0b192478d40e59e0eab9ffdf9ae51c8c8133578f9f39336a7bb8dc3`.
- Reviewer script: `compiled-lifecycle/ci/2026-10-31/lanes/review-demo/audit_review.py`, SHA-256 `895f4589c442ba1d6a236f1ed2620f3b53d28f348e357789161ad6b9572edf12`.
- Raw smoke SHA-256 `f288fc6bbfe1d995a0e69afa9087851a5432e8d89a6fb08581a7991ee3eb1145`; native CLI trace SHA-256 `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5`; execution record SHA-256 `8cacd69eb2b432237492fde7c3a66185356f7faa311fee0ced0b3042097432fc`.

The evidence establishes the demo stage for this provider artifact only. The failed overall result and withheld final check remain preserved as the acceptance boundary.
