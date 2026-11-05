# Interaction Lab

A separate exploration environment in Gondola: adjust behavior, save a useful variant, replay its events, inspect the actual state. Inspired by the public experience at https://aiforui.dev/lab; all lab code and visuals are original.

## Run

From the Gondola repository root, Node 22 or newer and a system tar with xz support:

    npm ci --prefix interaction --no-audit --no-fund
    node --test interaction-lab/tests/*.test.mjs
    node interaction-lab/build.mjs
    python3 -m http.server 8080 --directory interaction-lab/dist

Open http://localhost:8080/. With the managed preview environment, use:

    sites-preview start /absolute/path/to/gondola/interaction-lab

The build uses existing locked dependencies. It verifies SHA-256 d88b651a05f5c085f33a7763b7a5e2e7c14c9dfd7df6641e99885463aa344f66 of the repository's accepted compiled-artifact archive, restores only its three compiled Go components, and bundles those with the current runtime and renderer adapters. This restores accepted Go compiler output; it does not freshly compile Go. A fresh compiler profile remains available through compiled-frontend's existing documented commands. No generated output or installed dependencies need to be committed.

## Try it

| Experiment | Manipulation | Inspectable comparison |
| --- | --- | --- |
| A little give | Drag/release, arrow keys, stiffness/damping/mass | Fixed 120 Hz semi-implicit Euler versus analytic damped spring; numeric delta and position plot |
| Time, reshaped | Drag both curve handles, arrow keys, live bezier controls, play | Cubic-bezier timing versus linear timing; x(t) is inverted by bisection |
| Drawn to you | Pointer proximity, tap a tool, arrow keys | Magnetic magnification with live reach and strength |
| State stays | Type, checkbox, save/reset, change renderer | Actual compiled Go form state, Gobi tree and DOM snapshot before/after replacement |
| Identity in motion | Add, edit, mark, move and remove keyed rows | Stable Go identity through reordering and renderer replacement |
| While you wait | Request, adjustable timer, manual reply, swap while pending | Actual Go request/reply state, transport order, runtime traces; host disposal cancels timers |

Open **Under the surface** for state, normalized events, execution traces and exact source/build pins. **Replay & compare** recomputes from the initial state and reports agreement or the first differing path. Motion pauses at the checkpoint; another nudge/drag resumes it. Replay turns off automatic replies so pending requests remain inspectable.

**Save variant** preserves a named parameter/event/final-state snapshot in localStorage. The Saved collection restores it by replay. JSON import/export transfers variants between browsers. **Export evidence** also includes the runtime trace and build receipt. Storage failure reports that saving failed; export remains available. Seeded variations are reproducible parameter proposals, not automatic judgments about design quality.

## Architecture and boundaries

This branch is based on the open PR23 stack, e0933465725e470dc610e3f81b4bbee95538c1d0. The review target is PR23's branch, not main.

- Component experiments reuse compiled-frontend/frontend/runtime/runtime.mjs and its actual DOM/React adapters without modification. State, events, view structure and disabled behavior remain Go-owned.
- Motion experiments are pure JavaScript exploration models, with explicit 1/120-second ticks. Their journals include parameter changes and normalized targets, rather than pretending frame timing is deterministic. This is not new Go compiler output.
- The lab supplies presentation, timers, recording and variant persistence. Cancel & reset disposes/recreates the host; the inherited request fixture itself does not implement a domain-level cancel transition.
- PageRouter main 01da028cc9f297795cc9ec3eafd310997d35241f was inspected. Its Atlas replay/FG contract is tied to a six-node inference recipe. No arbitrary UI-equivalence claim is attached to that contract, and its production shell is left intact.
- Renderer replacement compares actual Go state, view and DOM snapshots. It is a bounded observation, not universal backend equivalence or pixel equality. Replay checks this implementation against its saved final state; it is not an independent semantic oracle.
- Journals are bounded to 5,000 events and 20 minutes of motion ticks; portable variants are limited to 1 MB of UTF-8, depth 48 and 60,000 data nodes; the gallery bounds keyed lists to 40 rows. Go execution reserves a cumulative 4 MiB trace budget before each action/reply, for live recording and replay. Shelf capacity is 60 variants. Large sessions may exceed the portable variant limit; Export evidence preserves their full recording and trace.
- Go replay first admits the entire journal in a disposable host using the same modules and renderers. A bad correlation, rejected action or trace budget failure leaves the live state and journal unchanged. Motion recording checks the prospective tick total before coalescing events, so its last accepted checkpoint stays exportable.
- There is no network API, analytics, account database or production deployment. Preview access is supplied by the development environment. Local variant persistence is browser/origin-specific.

## Add or generate experiments

1. Add a record to registry.mjs with a stable id, category, description, kind and bounded parameter schema. Extend the registry-count assertion.
2. For a motion study, supply its initial state and pure event transition in motion.mjs, then mount a view in motion-view.mjs. Add deterministic replay and numeric tests in tests/core.test.mjs.
3. For a Go study, use Gondola's existing compilation profile to produce an admitted component and encoder, add a pinned restoration/build entry in build.mjs, and register the module in go-host.mjs. Reuse the runtime rather than duplicating its reducer or event binding.
4. Add browser cases to verify.mjs and inspect the experiment at desktop and phone widths.

candidate(id, seed) generates a valid repeatable parameter set from an explicit uint32 seed. The UI's Try a variation button advances that seed. Add constrained generators here if an experiment needs relationships between parameters. Retain liked candidates through the same variant schema. It currently generates parameter variants, not new component source code.

## Verification

    node --test interaction-lab/tests/*.test.mjs
    node --test compiled-frontend/frontend/runtime/runtime.test.mjs
    go test ./fixtures/compiled/form ./fixtures/compiled/list ./fixtures/compiled/effect ./counter

After building, open /verify.html and press Run verification. The browser checks use actual compiled Go modules and both existing renderers. /responsive.html provides an inspectable 390 px frame. The verification page exports its receipt. No external browser or package install is needed for these browser checks.

Pointer handlers capture only a dragged handle, release on pointerup/pointercancel/lostpointercapture, and provide keyboard equivalents. Horizontal controls use touch-action: pan-y; two-axis curve handles use touch-action: none only on the small handles. Page scrolling stays native. The clock stops when hidden or settled. Reduced-motion preference removes transitions and resolves motion without continuous animation. Hardware mobile touch/IME, Safari and Firefox require separate device testing.
