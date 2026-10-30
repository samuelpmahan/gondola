# XR-O-BROWSER — independent review of disabled and focus evidence

## Decision

**Accepted for the required browser claims, with a report correction required.** The retained result supports that real disabled-control attempts do not reach the Go manager or change the tested physical input, state, messages, or dirty set across DOM, React, and GoDOM. The separately labeled direct Go guard call is counted independently and is a no-op. Focus and a noncollapsed backward selection are sampled synchronously after each renderer replacement and again after settling.

## Evidence reviewed

I inspected O-BROWSER's report, receipt, probe source, and result. I did not rerun the browser suite. I checked the reported hashes against the current files; all listed demo, Go/WASM, renderer, application source, HTTP lab, browser, probe, and result hashes match. In particular:

| File | Current SHA-256 | Match |
|---|---|---|
| `typed-composition/demo.html` | `ea73df608e3fb9d4555f3fc7a99201865d202a9efef78c008e5e9da2bb8c0913` | yes |
| `typed-composition/demo.mjs` | `e266f424833760a7448414ff11661b3ed8bc32a71fb0502e6f9cfdc5bab124da` | yes |
| `typed-composition/host.mjs` | `e030ff3e1f10a19b2a520f7b652df5e1bc14cb7d5d33bc2f10076f0d11685f3c` | yes |
| `typed-composition/build/composition.wasm` | `3e2ad04fc31bab0684c942590b3f030d83328e6b43e513bd69e8bafc5fdb87cc` | yes |
| `typed-composition/build/godom.wasm` | `3e14286f2d97916996c0604d7d3e3d4ec525bb2998c08e6411d21da2140c9cdb` | yes |
| `typed-composition/build/react.bundle.mjs` | `091e9e8a2f17a9d148803f568720614a911cd22d0fed6db7cbd55c47597e17a6` | yes |
| `session-tree/host.mjs` | `f5ce451235ec2506d80d9ac3ebc364a9e43ba774cd56a66e25e3f8f7bd8a0c5a` | yes |
| `composition/manager.go` | `915254e0ac39e807c63f9a2d34f8cb38809b68e0b376174d04212c5cdf834e7d` | yes |
| `http-effects/build/http-lab` | `9a1a9c90e70c714199ee09ec87026ac71328d9fd52674a1e7a0c96480c417289` | yes |
| `o_browser_disabled_focus_probe.mjs` | `0d89c2eea048dcacab4f24bbc0d9bdc726c397957c362b83b664400777952f19` | yes |
| `O-BROWSER-result.json` | `f5e0555a4cce57b8dc1f312d1a1d381bd3df365b103ac26d315931c89c95ab16` | yes |

The complete matching hash list is retained in `reports/O-BROWSER.md`. Current hashes show the recorded runtime and browser assets are unchanged since the successful probe; no time-bound rebuild qualification is needed.

## Dispatch counter and disabled attempts

The counter is installed at the demo's `manager.dispatch` object, not in a control event handler. `demo.mjs` constructs that manager wrapper around the actual `gobiComposition` methods (`wrapManager`, lines 54–64). The app's dispatch route reaches it through `keyed-editor/dom.mjs`'s `runtime.dispatch`, `multi-root/runtime.mjs`'s `manager.dispatch`, the session-tree `flatManager.dispatch`, and the composition host's dynamic `manager[method]` call. The probe saves the original wrapped method and calls it after recording each invocation, so counted dispatches still reach the real Go/WASM method.

The `native` phase includes each physical control's `.click()` call, Playwright mouse click on the disabled input, Playwright keyboard typing, and `demo.settled()`. All three renderer phases report zero manager dispatches. Before/after full Go state and messages are equal, physical input value is unchanged, and the dirty set is empty. The control flags are all disabled at the before sample. The later read-only Go guard step increments only `directGuardDispatches` (one), while `nativeDispatches` remains zero; it returns the same state/messages, leaves the physical value unchanged, and produces no dirty IDs.

The probe's direct guard is a manager call rather than a browser-delivered event. It is clearly separated by its `direct-guard` phase and its own result record.

## Focus timing

Before replacement, the Go snapshot identifies `row-1-input` and a physical `Row 1` input holds the probe value with selection `[8, 17, "backward"]`. For each backend (`dom`, `godom`, `react`), one synchronous `page.evaluate()` calls `demo.host.replace()` and reads `document.activeElement`, input value, and selection immediately afterward, before yielding to the page event loop. Those physical samples all show active focus and the same noncollapsed backward range. The later samples after `demo.settled()` show the same focus, value, selection, state, and messages. The probe uses direct host replacement and does not use the demo's remembered-focus helper.

## Reporting limitation


There is a small event-log capture mismatch in the probe. At lines 203–224 it returns `bounds.events` to Node before the real mouse and keyboard attempts at lines 225–226. The browser-side post-attempt sample does read `globalThis.__oBrowserNativeEvents` at lines 229–245, but Node then replaces that with the earlier serialized `bounds.events` at lines 247 and 255. Thus the retained `eventLog: []` independently supports the programmatic `.click()` phase only. The counter, physical value, Go state/messages, and dirty-set samples are all taken after the actual mouse/keyboard attempts while the native phase remains active, so the required no-Go-dispatch/no-mutation claim is still supported. The broader sentence in O-BROWSER's report that event listeners recorded no DOM events for the mouse and keyboard attempts is not established. The report should narrow that sentence to the `.click()` phase or add a separately captured post-attempt event sample; preserve the raw result as recorded.

## Scope

This review accepts the retained browser evidence for the required disabled-manager-dispatch, no-mutation, and immediate focus/selection claims. It does not accept this as checker, replay, seeded run, inherited runner, or full oracle parity evidence. I made no production edits and ran no browser suite or broad test suite.
