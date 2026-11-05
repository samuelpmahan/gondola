# Interaction Lab Implementation Plan

Goal: deliver a useful, extensible gallery with reproducible exploration and Go component/renderer reuse.
Spec: docs/superpowers/specs/2026-11-05-interaction-lab-design.md
Architecture: isolated sibling lab; pure JavaScript motion model and existing compiled Go fixtures/runtime/renderers; existing esbuild bundles local assets.

Global constraints: no production deployment, no main merge, no new framework, no proprietary source; preserve fixture sources and sealed receipts.

Review focus: malformed/oversized imports; stale timers after reset; touch scroll and pointer cancellation; renderer swap during pending work; persistence unavailable.

1. Pure exploration core. Files: registry.mjs, motion.mjs, journal.mjs, variants.mjs, tests/core.test.mjs. Tests precede implementations. Validate parameters and event budgets, deterministic fixed ticks, known analytic values, replay mismatch, seeded generation and storage failure.
2. Go host and artifact build. Files: go-host.mjs, build.mjs, tests/go-host.test.mjs. Reuse mountCompiledApp and the existing renderers. Verify the archive hash before restoring it, record source pins and bundle. Capture real bound actions, effect completions and renderer swaps. Replay in a separate mount and compare state/view/DOM.
3. Gallery and workbench. Files: index.html, styles.css, app.mjs, motion-view.mjs. Six working demonstrations; pointer, keyboard, live parameters, saved shelf, JSON transfer, inspector and replay. Check browser-visible behavior and narrow layout.
4. Verification and delivery. Run core and inherited runtime tests, native fixture tests, build, browser QA. Record evidence and actual limits. Review full lab diff, fix material findings, push own branch and open a stacked draft PR. Leave a managed preview available without production publishing.

Progress: all four tasks implemented and verified. New Node tests 13/13, inherited runtime 36/36, Go fixture tests 13/13, browser checks 13/13. Independent review found three Important issues, each addressed by regression tests. See interaction-lab/evidence/REVIEW.md and validation.json. GitHub branch publication and draft PR are the remaining delivery operations; no main merge or production deployment.
