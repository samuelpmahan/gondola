# XR-ADAPTERS: independent review of E-ADAPTERS

**Worker:** N2  
**Decision:** `accepted`  
**Date:** 2026-10-31

## Result

The sealed E-ADAPTERS report and receipt are byte-identical to their copies under `coordination/seals/E-ADAPTERS/`. The reviewed decorator, browser entry, focused test, and N4 qualification runner match the announced hashes. No adapter, application, renderer-core, runtime, or Git files were changed in this review.

The seam is default-off. `installPublicationsBrowser` defaults `rendererDecorator` to `null`; in that case the optional callback wrapper resolves to the original callbacks object, and the optional post-update hook is skipped (`browser-entry.mjs:41,113,122`). N4's source-pinned author capture confirms that healthy React, DOM, and swap profiles each ran 50 source events and 46 trace ticks, had zero activations and no probe exception, and matched the existing full publications checker. I do not claim byte-identical historical `runProfile` source; the verified behavior is the current default path and its healthy author-run result.

The five named faults act on mounted renderer output or its real callback boundary (`qualification-decorator.mjs:122-224`). Initial text, keyed-row order, and disabled-control changes mutate live DOM nodes and record target paths plus before/after values. Click faults install a capture listener on the actual `#app` container and activate only for event 0; the dispatch wrapper then suppresses the real renderer callback once or calls it twice. The seam does not edit expected values, captured result data, or traces to manufacture detection; click faults change actual callback forwarding, with resulting Go updates and trace changes produced by the existing renderer/runtime path. The N4 cases show all ten backend/fault combinations activated exactly once. Initial fault paths are text `0/0/0`, child order `1`, and control `0/1`; click target path is `1/0/1` at event 0. For drop/duplicate cases the observed renderer dispatch count is one and the forwarded dispatch count is zero/two, respectively.

`inspectRaw()` obtains physical DOM from a fresh traversal of the live container and its controls, and returns it separately from renderer DOM and runtime snapshot (`browser-entry.mjs:179-235`). N4's fault evidence is computed from `raw.physicalDOM` first (`qualification.mjs:207-264`); its pinned case files show actual live HTML/control differences. I also ran a focused Chromium 153 probe: a physical click failed the strict replay while leaving the profile mounted; inspection returned HTML equal to the live `#app` HTML. Calling browser `dispose()` twice returned the same successful cleanup result, cleared the container, and produced no page errors. A second adapter disposal confirmed the listener was removed.

The healthy swap capture retains the existing stale-renderer behavior: dispatch and stale callbacks from the retired renderer return stale, with tick count and snapshot unchanged. The old cancelled reply is rejected without changing trace or pending state. The E-ADAPTERS scope receipt lists no application or renderer-core changes, and its default-off path does not wrap callbacks at all when no decorator is supplied.

## Verification

- Independent Node 22.23.4 adapter tests passed 6/6; syntax checks passed for the decorator, its tests, and the browser entry.
- The focused mounted Chromium probe passed: strict replay failure remained inspectable, `inspectRaw` matched live DOM, repeated browser disposal was idempotent, and physical DOM/listener cleanup completed.
- The pinned N4 Node 22 matrix has 13/13 cases, three healthy profiles matched, ten faults activated once, and no page or infrastructure errors. Every one of its 13 case evidence hashes revalidated against the raw report.
- The healthy swap evidence includes one accepted compatible swap, one rejected incompatible swap, retired callback fencing, and rejected cancelled-reply delivery.

The N4 run attests to `author-uncommitted-base-source`, not a final frozen-source or hosted-CI run. This review is limited to E-ADAPTERS behavior and that pinned author evidence; it does not claim full qualification or CI acceptance. Exact pins and raw command outputs are listed in `coordination/receipts/XR-ADAPTERS.json` and `coordination/rawlogs/XR-ADAPTERS/`.
