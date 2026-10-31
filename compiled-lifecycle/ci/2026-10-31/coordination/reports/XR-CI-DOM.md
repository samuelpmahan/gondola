# XR-CI-DOM — independent review of hosted DOM evidence

**Decision: accepted for bounded artifact reuse.** I independently verified the underlying primary workflow artifact and physical-browser captures supporting E-CI-DOM. The review confirms the recorded React, DOM, and swap-profile claims within the artifact’s scope. The hosted job itself failed at native executable launch, so this review does not establish native Go equivalence, a completed conformance matrix, or overall CI success.

## Artifact and source binding

The source is `49cc2b96c8817a47319d5b7bd484184a22fa984b` with tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`. Primary push run `41178420647` supplied artifact `13034915662` (47,035,803 bytes, SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`). My separate verifier checked the 12 provider chunks, the full ZIP CRC and all 1,272 file members, then checked all 12 selected entries in the nested lifecycle archive and 14 current source pins. The 66,817,124-byte browser capture matched SHA-256 `a663d77ba16c43adfb3f4b12666845b82047b3e1b9c7ed68ffea8c98ac304ad6` in the provider ZIP, extracted artifact, and nested archive.

React and DOM share AppIR SHA-256 `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d` and encoder SHA-256 `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`; their compiled modules differ and both hashes are recorded in the E-CI-DOM packet. The captured browser-entry source reads `container.firstElementChild.outerHTML` and each actual target’s `HTMLElement.disabled` property; those source files are pinned to the published tree.

## Independent physical-capture check

I ran the E-CI-DOM audit and artifact-binding verifier. Both exited 0 and their stdout was byte-for-byte identical to N4’s recorded `audit.json` and `artifact-bindings.json`. I also ran separate recheck scripts in `../../lanes/review-dom/`; they do not consume N4’s result as an input to the assertions.

For each of `react`, `dom`, and `swap`, the N4 assertion suite passed all 26 Go trace ticks; my separate recheck passed all 27 raw physical snapshots. I decoded each snapshot’s encoded `State` and compared it against the manually enumerated fixture oracle, then compared the Go View tree, runtime renderer snapshot, captured `outerHTML`, and live control records (including each button’s actual `disabled` property, path, tag, type, value, and checked value). The N4 suite additionally decodes the State at every Go trace tick. All fields matched. The extra snapshot is the second physical capture at the fixture renderer swap and does not add a Go tick.

The artifact shows 16 enabled physical clicks per profile. Removing Parent leaves the Sibling’s pending request intact, retires Child and Grandchild, and records cancellations in Grandchild, Child, Parent order. Generation-2 remount restores the subtree while preserving that sibling request. Canceled generation-1 replies are rejected without state ticks; sibling and fresh generation-2 replies are accepted; duplicate completions are rejected. Each profile ends with zero pending effects.

The swap profile has 17 renderer swaps and 18 renderer instances. Sixteen swaps had a retained old user-action callback. At each eligible swap, a dispatch probe and a stale-callback probe were both rejected, giving 32 rejected retired-callback probes. Trace, typed state/View, pending correlations, and effect records remain unchanged across all swaps. The one fixture swap without an eligible retained callback is explicitly identified in the capture. After remount, six retained detached Parent/Child/Grandchild Add and Request buttons per profile were clicked; they remained disconnected and produced no callback, trace/state/View, pending-effect, effect-record, or physical-HTML change.

Captured browser version is `156.0.8078.4` with Playwright `1.64.1`; page errors, WASM requests, and WASM API attempts are all zero. Direct emitted-module state, View, requested-effect, and completed-effect traces match each browser profile at all 26 ticks. This remains comparison against the compiled module.

One E-CI-DOM prose detail is narrower than the capture: it calls the six detached buttons “Child/Grandchild” controls, while the recorded paths include Parent Add and Parent Request as well as Child and Grandchild Add/Request. The independent check confirms all six captured paths (`0/1`, `0/2`, `0/3/1`, `0/3/2`, `0/3/3/1`, `0/3/3/2`) remain disconnected and no-op; this is a wording correction, not a data mismatch.

## Failure boundary and disposition

The provider run is marked `failure`; lifecycle execution is failed and the matrix record is rejected. Native replay attempted `/home/runner/work/gondola/gondola/go` and failed with `ENOENT`; therefore the final checker was withheld. I accept E-CI-DOM’s specific physical DOM, typed-state/View, cancellation, effect, and callback-fence evidence as artifact-bound and reproducible. I do not accept it as evidence for native comparison or full hosted acceptance.

## Reproduction and retained files

Commands, run from the repository root:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --max-old-space-size=4096 compiled-lifecycle/ci/2026-10-31/lanes/dom/audit-ci-dom.mjs
python3 compiled-lifecycle/ci/2026-10-31/lanes/dom/verify-artifact-bindings.py
/tmp/gondola-node22/node_modules/node/bin/node --max-old-space-size=4096 compiled-lifecycle/ci/2026-10-31/lanes/review-dom/recheck-dom.mjs
python3 compiled-lifecycle/ci/2026-10-31/lanes/review-dom/recheck-artifact.py
```

Recheck runtime versions: Node `v22.23.4`, Python `3.12.14`. The exact commands’ stdout and stderr are retained under `../../lanes/review-dom/`. Machine-readable summary: `../../lanes/review-dom/review.json` (SHA-256 `595b2173914ab390bf9842d056ad7f2d8b8b20b0cd5a2c4e509cfdcc16771819`). The reviewed N4 report SHA-256 is `d937c7b803ac1928f7598046f13d6d903f9ed6af353513e1f9da1ec56514653e`; its receipt SHA-256 is `7eff89202146d8b8ecb1536654c0ae30123e20ace61dfdd16883c1a3efab2fea`.
