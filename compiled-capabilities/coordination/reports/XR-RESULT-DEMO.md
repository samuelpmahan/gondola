# XR-RESULT-DEMO: independent review of the closed demo packet

## Decision

**Accepted for the local failed-cohort demo evidence only.** N5's E-RESULT-DEMO report and receipt accurately preserve the passed HTTP smoke evidence while keeping the overall full-run gate failed. This review does not accept the full run, published source, hosted artifact, or milestone.

## Source and failed-gate finding

The packet is bound to local commit `031c462bcd72c0ae0bee2dc05a0972b3902ca40c`, tree `d22b75e18c7bea70a743cc79d53461b287c7d045`, base `00da54ad0f5a4006b13a5cded18ce291845978bc`, and remote PR 15 commit `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`. The publication-binding file records the same tree and parent for local and remote source and a verified remote ref readback.

The raw attempt and E-BUILD receipt both say `mode: full`, `status: failed`, and identify the failed stage `inherited-static-and-interaction-lifecycle`, with reason `fresh lifecycle receipt does not confirm the inherited full compiled-methods regression chain`. The attempt contains 161 before/after source pins and `sourcePinsMatch: true`. Its 16 recorded subprocess commands all have exit code 0. Root observed the outer `bash run-compiled-capabilities.sh` process exit code 0; the runner log ends with `compiled-capabilities: failed (full)`. N5's packet clearly states both facts and does not treat the exit code as a passed gate.

## HTTP smoke and interaction verification

I reran `compiled-capabilities/demo/smoke.mjs` against the attempt's immutable `demo/site` inputs. Node was `v22.23.4`, Chromium `153.0.8010.0`, React and ReactDOM `19.3.1`. The run exited 0 and passed all 8 checks. The page, stylesheet, and browser bundle returned HTTP 200 with 4,505, 6,194, and 1,846,171 bytes. Browser errors, console errors, failed requests, WebAssembly requests, and WebAssembly API attempts were empty.

The smoke assertions in the pinned source and the successful rerun cover the behavior behind the eight recorded checks:

- Compiled Go Parent, Child, Grandchild, and Sibling view mounts in DOM; the UI shows AppIR requirements, explicit lifecycle host support, and the active renderer profile.
- While the Parent request is pending, the smoke injects a click event into its disabled button and asserts that the Go trace is unchanged and `parent:g1:r1` remains pending.
- A compatible DOM→React swap preserves the Go snapshot, logical view, trace, and pending token.
- An incompatible candidate with an empty view profile is rejected at admission. The smoke asserts the active React renderer, Go state/view, trace, pending token, physical HTML, and original Parent control node identity are preserved. The preserved control still dispatches after rejection.
- React→DOM recovery preserves state, trace, and the pending request; the correlated reply reaches Go Update.

The recorded event order is `addParent`, `requestParent`, `addParent`, `complete` with dispatch IDs `dispatch-0001` through `dispatch-0004`; the last carries token `parent:g1:r1`. Final Parent count is 2, `Pending` is false, and no request remains. The second smoke run independently returned the same order and final facts.

## Screenshot and asset hashes

I inspected the captured cohort screenshot. It displays the DOM renderer, Parent count 2, delivered reply, AppIR requirements, host and renderer profiles, and final trace. This is a visual inspection only; no pixel-equivalence claim is made. The screenshot is 317,879 bytes, SHA-256 `ea9d67e7ecc650b2b3b529695cd092f8bf70a67c893c56ffc2e51a5c1c0c09c7`.

I rehashed the smoke, screenshot, build record, bundle, CSS, and HTML and compared each against the full attempt's archive manifest and actual tar member bytes. All six member contents exactly match the manifest and archive:

| Member | Bytes | SHA-256 |
|---|---:|---|
| `demo/demo-smoke.json` | 204,880 | `58dabce8d2b4551341edf548964870e37b755d18bdec854aa26a3c2537c96338` |
| `demo/demo.png` | 317,879 | `ea9d67e7ecc650b2b3b529695cd092f8bf70a67c893c56ffc2e51a5c1c0c09c7` |
| `demo/site/demo-build.json` | 2,685 | `b22b2e2b269fb464bd269a11f6de7dd51f1d6a1277b59f950a6019c05de7dfb8` |
| `demo/site/demo.bundle.mjs` | 1,846,171 | `0b024fb34bb7f1a0f98eff2f99a16c2f9cdd423fd77ddd8e0614042e86cfe535` |
| `demo/site/demo.css` | 6,194 | `3c36b27dc9297f363e3a7e1dd770101c2433e830b0deca337b5801a8d58b26e0` |
| `demo/site/index.html` | 4,505 | `68ebf6373b4a666ab49fa2f618aad9fce96ccb8be9281b4c8e5692c4e2155b11` |

The outer archive itself is 14,976,273 bytes with SHA-256 `adabec770f19f985e5ad499b87b1a2f8c0e3890822a905346432cd69133c7040`; its manifest is pinned as `f51970414a096529361b283733be90f7ebf8bd72ebf686b333bc590aba623c7c`. Archive integrity here only corroborates these local members; it cannot override the failed E-BUILD status.

## Limits

This accepts N5's report/receipt as accurate for the named local demo subevidence. The full run remains failed at the inherited lifecycle gate despite runner exit 0. The primary hosted artifact is outside this review; no source-publication or milestone acceptance follows from this packet.
