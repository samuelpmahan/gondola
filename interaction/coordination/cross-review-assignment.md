# Cross-review allocation

Native Rebalancer 1.0.4 allocated six independent, read-only review packets. The solve followed the initial authoring dispatches, so it allocated only the cross-review stage.

| Worker | Agent | Review packet | Target lane | Author excluded | Start acknowledgment (UTC) | Observed review outcome |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | runtime | `XR-compare` | compare | W4 / compare | 06:09:27.309468 | Accepted; no in-scope defects |
| W2 | dom_adapter | `XR-harness` | harness | W3 / harness | 06:09:27.309975 | Accepted with two non-blocking findings; author reports follow-up changes and passing checks |
| W3 | harness | `XR-runtime` | runtime | W1 / runtime | 06:09:27.310350 | Accepted; no findings |
| W4 | compare | `XR-rebalancer` | rebalancer | W6 / rebalancer | 06:09:27.310653 | Accepted; no requested changes |
| W5 | environment | `XR-dom_adapter` | dom_adapter | W2 / dom_adapter | 06:09:27.310991 | Accepted; no concrete mismatch |
| W6 | rebalancer | `XR-environment` | environment | W5 / environment | 06:09:27.311329 | Accepted after runner fix |

The worker mapping is W1=runtime, W2=dom_adapter, W3=harness, W4=compare, W5=environment, W6=rebalancer. Every assignment excludes its lane author. Each packet had capacity one; the exact maximum weighted score and native score were 600, with zero broken constraints. The native solve receipt is timestamped **2026-10-30T06:08:17.765394+00:00**. Six operator start acknowledgments were recorded between 06:09:27.309468 and 06:09:27.311329 UTC.

The original probe schema accepts `kind: "extract"` inputs and validates extraction outcomes in `finish`. This run reuses that slot with `packet_type: "independent_cross_review"`, a target lane, excluded author, and read-only scope. No extraction result was fabricated. A `finish` attempt was rejected because the extraction-only validator does not accept review decisions. The probe state snapshot therefore preserves the six start acknowledgments as `running`; that is archived slot state, not a claim that reviewers remain active. Separate receipts record the actual review outcomes.

## Review reports

- **XR-compare / runtime — accepted.** The reviewer found no defects in the comparator, tests, or CLI. They separately reported an integration syntax issue in `interaction/check.mjs:30`, outside this packet. The harness author reports that issue resolved; final checks below passed.
- **XR-harness / dom_adapter — accepted with two non-blocking findings.** The initial review noted that the inline browser fixture did not smoke-test `interaction/demo.html` and that scenario comments claimed fresh sessions while Reset left the message log cumulative. The harness author later reported follow-up source changes and passing checks. No independent post-change W2 review report was received before this checkpoint, so the original W2 decision remains recorded with its findings.
- **XR-runtime / harness — accepted.** The reviewer found the API/action flow coherent and no issue in the reviewed session/WASM files or tests.
- **XR-rebalancer / compare — accepted.** The reviewer validated unique assignments, author exclusions, exact/native score 600, zero broken constraints, and the dispatch wording. A follow-up confirmed the start chronology.
- **XR-dom_adapter / environment — accepted.** The reviewer found no mismatch for the supported DOM subset; adjacent React text may serialize with comment separators in `innerHTML`.
- **XR-environment / rebalancer — accepted after re-review.** The first pass found that the local runner omitted Playwright browser installation. The owner added a default Chromium install and a CI opt-out after CI installs system dependencies. The standard Playwright browser download still needs its own green CI run; the passing local interaction runs used Chromium 153.0.8010.0 from the npm-hosted browser package.

## Post-browser source checkpoint

At 2026-10-30T06:18:34.010230+00:00, after the harness author reported frozen sources, the browser integration evidence recorded two passing seeds: seed 20261030 ran 107 scripts, 4,366 user actions, and 4,473 ticks; seed 20261031 ran 107 scripts, 4,145 user actions, and 4,252 ticks. Both had zero mismatches and all native comparisons matched. The demo smoke asserted initial 0 with disabled Reset, Add to 1, Reset to 0, and a further disabled Reset with no change. The author reports all eight interaction JavaScript tests and `node --check` passed. Full execution details and the standard-browser limitation are in [RESULTS.md](../RESULTS.md).

## Evidence

- [Spec](evidence/cross-review-v1.json)
- [Probe state with six start acknowledgments](evidence/state.json)
- [Native epoch 0 assignment receipt](evidence/epoch-00.json)
- [Native solver bundle](evidence/epoch-00.bundle)
- [Captured probe source](evidence/probe.py)
- [Evidence manifest with SHA-256 pins](evidence/manifest.json)
- [Finish rejection record](evidence/finish-rejection.txt)
- [XR-compare receipt](evidence/receipts/XR-compare.json)
- [XR-harness receipt](evidence/receipts/XR-harness.json)
- [XR-runtime receipt](evidence/receipts/XR-runtime.json)
- [XR-rebalancer receipt](evidence/receipts/XR-rebalancer.json)
- [XR-dom_adapter receipt](evidence/receipts/XR-dom_adapter.json)
- [XR-environment receipt](evidence/receipts/XR-environment.json)

The manifest pins the coordination evidence and reviewed source files. It does not pin the separately packaged large trace archive or evolving results evidence. The solve did not measure task duration, throughput, or speedup.
