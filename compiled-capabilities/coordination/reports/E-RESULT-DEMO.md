# E-RESULT-DEMO

**Outcome: insufficient evidence.** The HTTP demo passed all eight browser checks in the local current-source full attempt, and I inspected its screenshot. The outer full E-BUILD gate failed at `inherited-static-and-interaction-lifecycle`, while the runner process returned exit code 0. This packet records failed-source corroboration only; it does not accept the full run, the source publication, or the milestone.

## Source and execution

The local run used commit `031c462bcd72c0ae0bee2dc05a0972b3902ca40c`, tree `d22b75e18c7bea70a743cc79d53461b287c7d045`, parent `00da54ad0f5a4006b13a5cded18ce291845978bc`. The publication binding maps remote PR 15 commit `a2e1164d68abaaa7d028bdaf6a20bea842a131ae` to the same tree and parent.

The local attempt is `compiled-capabilities/builds/attempts/attempt-20261031T095356051Z`, invoked with `bash run-compiled-capabilities.sh` from 09:53:56.051Z to 10:16:59.067Z. E-BUILD records 161 before/after source pins with stable hashes, and recorded Node 22.23.4, root Go 1.24.0, compiler Go 1.27.3, Chromium 153.0.8010.0, React/ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2. The primary hosted artifact remains a separate N4-owned evidence path and is not included in this local result.

E-BUILD's final `status` is `failed`. Its failed stage is `inherited-static-and-interaction-lifecycle`, with error `fresh lifecycle receipt does not confirm the inherited full compiled-methods regression chain`. The nested inherited command exited 0, but the runner's receipt gate failed. The outer run process also returned exit 0 despite the failed receipt. The demo's later stage passed, as did the React/DOM builds, backend comparison, independent literal oracle, compiled conformance, and compiled-output stability. That does not repair the failed full gate or the outer exit-code reporting defect.

## HTTP demo evidence

The full attempt's demo build consumed the React GoScript output for `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`. The build record binds these inputs:

| Input | Bytes | SHA-256 |
|---|---:|---|
| React build manifest | 4,658 | `bee3a7810efcc4e9379776961bff22703a740695575c1981a1e8d7475df78603` |
| Lifecycle AppIR | 14,196 | `ed93e9ae6f9be20c306669d63b676ed466e65fee8dc7fd0a1a4c8a6b38f0a68a` |
| Compiled lifecycle module | 521,120 | `f2fa10211b86b94c340897631cffea7c65f8eba4938966bb0436b548d37c879b` |
| Encoder | 15,625 | `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4` |
| HTTP browser bundle | 1,846,171 | `0b024fb34bb7f1a0f98eff2f99a16c2f9cdd423fd77ddd8e0614042e86cfe535` |

The compiled app declares `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. Demo source pins in the build record match the attempt's source-before pins; the smoke source pin is also confirmed against source-before. The locked and installed React and ReactDOM versions both match 19.3.1.

The actual smoke JSON has schema `gobi.compiled-capabilities-demo-smoke/v1`, status `passed`, and eight checks:

1. The compiled Go Parent, Child, Grandchild, and Sibling view mounted in the DOM renderer.
2. `/`, `/demo.css`, and `/demo.bundle.mjs` each returned a nonempty HTTP 200 response (4,505, 6,194, and 1,846,171 bytes).
3. The page exposed compiled requirements, explicit host support, and the active DOM profile.
4. Enabled DOM clicks dispatched to Go in order; injecting a click into the disabled pending request created no tick and left the request pending.
5. The compatible DOM-to-React swap retained Go state, view, tick history, and pending request.
6. The candidate missing `view.node` was rejected during admission before unmount. The smoke assertions confirmed the active React backend, original control DOM node, logical state/view, pending token, and trace were preserved.
7. A physical click on that preserved control dispatched to Go after rejection; React-to-DOM recovery then preserved the state, trace, and pending token.
8. The correlated reply reached Go after the expected event order.

The recorded Go events after initialization are `addParent`, `requestParent`, `addParent`, and `complete`, dispatched as `dispatch-0001` through `dispatch-0004`. The correlated request/reply token is `parent:g1:r1`; final parent count is 2, pending is false, and no requests remain. Browser errors, console errors, failed requests, WebAssembly requests, and WebAssembly API attempts are all empty.

I opened `demo/demo.png` from this attempt. It shows the DOM renderer active, parent count 2, the delivered `parent:g1:r1` reply, visible compiled requirements and renderer/host profiles, and the event trace. This is a visual observation of the captured screen, not a pixel-equivalence claim.

## Evidence paths

- Machine-readable local demo audit: `compiled-capabilities/ci/2026-10-31/lanes/demo/local-cohort-031c462-audit.json`
- Read-only audit script: `compiled-capabilities/ci/2026-10-31/lanes/demo/audit-local-cohort.py`
- Demo build record: `compiled-capabilities/builds/attempts/attempt-20261031T095356051Z/demo/site/demo-build.json`
- Smoke result: `compiled-capabilities/builds/attempts/attempt-20261031T095356051Z/demo/demo-smoke.json`
- Screenshot: `compiled-capabilities/builds/attempts/attempt-20261031T095356051Z/demo/demo.png`
- Full E-BUILD report and receipt: `compiled-capabilities/coordination/reports/E-BUILD.md`, `compiled-capabilities/coordination/receipts/E-BUILD.json`

## Scope

This packet closes only the 031c462/a2e1164d68abaaa7d028bdaf6a20bea842a131ae failed cohort's demo evidence review. It does not assert full-run or source-publication acceptance. A corrected-source full run and its own immutable HTTP artifacts require a separate result review. No production source, E-BUILD output, hosted artifact, scheduler state, Git reference, or pre-existing receipt was changed.
