# E-CI-HARNESS

**Outcome: `confirmed_reuse`.** The published native/direct/backend conformance harness accepts the fresh full CI captures at source `195c9433179218348d4b9f2477ae1e0725337d15`. I independently recomputed the five fixture checks from the retained raw artifacts; every fixture matched. No conformance source or oracle change was needed for this audit.

## Primary artifact and workflow identity

The audited artifact is from successful full push run `41155530877`, job `124401386239`, artifact `13025112465`. The workflow checked out source commit `195c9433179218348d4b9f2477ae1e0725337d15`, tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`. This is the selected first-finished successful full run for that published head. It is a push run; it does not assert the status of separate PR checks or close the root's PR publication gate.

The provider archive is 14,931,201 bytes, SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`. Its 817 extracted files all match the retained member index. Primary provenance, run/job metadata, raw job log, archive, and member index remain at `compiled-backends/ci/2026-10-31/`.

The captured full workflow reports 18 commands, all exit 0, including inherited status `passed`; 126 top-level source pins match before/after execution. The five backend-conformance invocation vectors in `execution.json` exactly match their per-fixture `.run.json` records. Each recorded run has `sourceStable: true`, 34 source pins, four compiled output pins, and one browser bundle pin. Versions from the captured execution: Node `v22.23.4`, Go `1.24.13` (root) and `1.27.3` (compiled), React/ReactDOM `19.3.1`, Playwright `1.64.1`, Chromium `156.0.8078.4`, and esbuild `0.28.2`.

## Independently recomputed fixture matrix

The auditor reads the raw native, direct, browser, checker, and manifest records. It re-evaluates each checker result, verifies native/direct trace objects are equal, projects the browser traces to application ticks and compares them with native/direct, and compares browser DOM snapshots against the independent oracle.

| Fixture | App ticks | Swaps | Focus swaps | Mutation controls detected | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| counter | 5 | 4 | 0 | 8/8 | matched |
| form | 10 | 9 | 1 | 10/10 | matched |
| list | 11 | 10 | 5 | 8/8 | matched |
| effect | 5 | 3 | 2 | 11/11 | matched |
| list-growth | 12 | 11 | 1 | 8/8 | matched |
| **Total** | **43** | **37** | **9** | **45/45** | **all matched** |

Across all captures, swap observations remain outside the Go application trace. Every replacement preserves the checked application state/View and trace, leaves the old root detached and empty, and reports runtime replacement diagnostics. The effect fixture retains pending request correlation across a swap; the checker also validates reply ordering and duplicate/wrong-correlation controls. Browser records report zero page errors and zero WASM requests/API attempts.

## Lifetime evidence and limits

The raw action records distinguish four cases: 15 physically disabled-control suppressions; one retired-renderer callback invocation fenced out of band without changing application trace/snapshot; two active missing-target driver attempts, each represented by one suppressed application tick and preserved actual target value; and one invocation of a retained callback from a detached but still active renderer node. These classifications are checked separately. The retained callback record is evidence of that callback invocation, not evidence that a retained native DOM event listener fired. Post-unmount suppressed-attempt behavior is also checked against the existing contract: cached logical view, empty physical DOM, no Go Update, and a suppressed application tick.

This audit recomputes immutable captures; it does not rerun native or browser execution. Acceptance is scoped to the archived run and published commit. It does not substitute for other CI lanes, separate PR checks, another post-publication run, or coverage of other browser engines, concurrent rendering, hydration, arbitrary Go applications, or production effect transport.

## Audit execution and retained history

The audit implementation is `compiled-backends/ci/2026-10-31/lanes/harness/audit_ci_harness.mjs`, SHA-256 `36917ba65033abebcdc0327643f06f0a17924c56d7199244741e08ea03f7a1c9`. The canonical successful recomputation used Node `v22.23.4`:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-backends/ci/2026-10-31/lanes/harness/audit_ci_harness.mjs \
  --captures compiled-backends/ci/2026-10-31/extracted/compiled-backends/artifacts/conformance \
  --bundle-root compiled-backends/ci/2026-10-31/extracted \
  --output compiled-backends/ci/2026-10-31/lanes/harness/audit-node22.json
```

It returned `accepted`, totals `43/37/9/45`, and output SHA-256 `7571d894b0d5229dd1f30241ef94caa05bdbb0c65be2c62f508c5beb2bf9034b`. The audit tracked 949 pinned input files and found none changed during review. The earlier successful default-output audit is byte-identical. One subsequent Node 22 invocation initially collided with the already-existing default output (`EEXIST`); that failed log is retained as `audit-node22.log`, and the invocation was rerun to a unique output path successfully. Earlier pin-mismatch and pre-command-verification attempts remain preserved in this lane as history and are not used as acceptance evidence.

The source/checker preflight is in `published-source-review.md`; the five checker tests passed before artifact acceptance. Current source identities and all raw capture pins are recorded in the canonical audit JSON and summarized in `receipts/E-CI-HARNESS.json`.
