# Gondola Interaction Lab

Build authorization: the November 5 request authorizes inspection, implementation, tests and a GitHub review branch; it excludes public/production deployment. Work proceeds within that scope.

## Repository findings

PageRouter main 01da028cc9f297795cc9ec3eafd310997d35241f has a composed project shell, hash routing, IndexedDB snapshot storage and an Atlas adapter. Atlas's FunctionalGuarantee describes a pinned six-node motion inference recipe, not an arbitrary UI trace contract. Extending it for this gallery would couple unrelated contracts.

Gondola PR23 e0933465725e470dc610e3f81b4bbee95538c1d0 is an open stack based on PR22, not main. Its compiled frontend has interchangeable React/DOM renderers, controlled bindings, keyed nodes, effect hosts, ordered traces and renderer replacement. These interfaces are reused directly in a separate interaction-lab directory. The PR targets PR23's branch so the review diff contains only this lab.

## Approach

One gallery with six experiments: spring comparison, cubic easing, magnetic dock, Go controlled form, Go keyed list and Go asynchronous request. Motion exploration is JavaScript with fixed ticks; Go component fixtures retain their actual compiled Go behavior through the existing runtime. No new framework, hand-translated Go reducer or paid materials. Compiled fixtures are restored from the repository's accepted artifact archive, verified against its hash, and bundled using its existing esbuild dependency. Their source and restoration boundary are explicit.

Each experiment opens in a workbench with direct manipulation, live controls, a visible state/trace inspector and a local named variant shelf. A seeded candidate button proposes reproducible parameter combinations. JSON export/import preserves parameters and event journals. Replay recomputes state and reports agreement or the first difference. Compare spring integration methods visually; compare React/DOM by replacing the renderer of the same Go runtime and showing the resulting state, tree and DOM evidence.

The gallery stays separate from fixture UI. Pointer dragging uses capture, handles cancellation, and confines touch-action restrictions to small horizontal controls; the page remains vertically scrollable. Keyboard alternatives, reduced motion, accessible control names and narrow layouts are required. Animation clocks stop when hidden or settled. Persistence errors remain visible and export remains available.

## Alternatives

PageRouter-first would reuse its shell but needs a new contract for UI events and imports of the Gondola runtime anyway. A standalone framework would duplicate existing renderers and event machinery. Gondola sibling lab is selected for the direct reuse and reviewable scope.

## Proof and limits

Pure tests cover fixed-tick determinism, known spring/easing behavior, seeded generation, malformed import rejection and persistence failures. Component tests and browser checks cover real controlled input, stable keyed state, async completion, React/DOM replacement, journal replay and saved variant restoration. Native Go fixture checks are run when the toolchain is available. Pixel equality, universal backend equivalence, trusted touch hardware and independent design acceptance are not claimed.

Sites publishes deployment URLs to production, including private Sites. This task therefore uses only the managed temporary preview and does not invoke production publishing. Source is preserved in the requested GitHub branch/PR.
