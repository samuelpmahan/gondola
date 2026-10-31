# XR-RELEASE-DOCS (N3): release documentation review

**Decision: `amend`.** The README and RESULTS accurately separate historical captures from pending source-bound acceptance and correctly state the custody, bounded-profile, renderer, and unknowns boundaries. One must-fix factual path statement in README line 35 places files under the attempt directory that the runner actually writes outside it.

## Required amendment

README line 35 says the attempt's report, receipt, and byte-checked archive are written beneath `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>/`. The runner defines the canonical report and receipt at `compiled-children/coordination/reports/E-DELIVERY.md` and `compiled-children/coordination/receipts/E-DELIVERY.json`. It writes the archive and its manifest as siblings of the attempt directory: `compiled-children/demo/output/attempts/attempt-<id>.tar.gz` and `compiled-children/demo/output/attempts/attempt-<id>.archive-manifest.json`.

This makes the sentence's location instructions inaccurate for the report, receipt, archive, and manifest. The static demo site really is inside the attempt at `attempt-<id>/demo/site`, so the following `python3 -m http.server` command points to the correct location. Split the output locations in a documentation repair; no code change is needed. I did not edit the README or RESULTS.

## Claims checked

- **Commands and versions:** README's `npm ci` commands, Playwright Chromium install, `bash run-compiled-children.sh`, and native trace invocation match the CI workflow and runner. The runner enforces root Go 1.24, compiler Go 1.27.3 via `GOTOOLCHAIN`, Node 22, Chromium, and locked React/ReactDOM 19.3.1. It rejects arguments and partial modes. The README's local `PATH` and `CHROMIUM_PATH` guidance matches the wrapper.
- **Demo restoration:** the runner creates `demo/site` inside the unique attempt directory; the local HTTP server command correctly serves that site. The compiled demo builder consumes the React build and the shared app; this does not claim a deployment.
- **Backend contract and scope:** the frozen contract and current host/frontend runtime support the named capabilities, `mountCompiledChildrenApp(options)`, the renderer API, and Go-owned state/lifetime boundary. The guarded profile and listed unknowns, including focus identity, arbitrary object graphs, hydration, IME, concurrent rendering, pixel output, and production transport, are bounded rather than universal claims.
- **Finite historical evidence:** the linked attempt-12 fixed capture has 42 events, 38 Go updates, 39 checkpoints, three mounted browser profiles, and six capture mutation controls. Of three seeded schedules, only seed `20261031` has a mounted browser profile. The 31/31 HTTP smoke is an author smoke against a prebuilt React GoScript output, not the pending full-source acceptance. RESULTS accurately records XR-DELIVERY's fail-open WebAssembly observation finding and does not rely on the old “no WASM activity” smoke summary.
- **Snapshot and final status:** the E-RELEASE-DOCS receipt's state snapshot has three source repairs running, the seeded repair done, and all four amendment reviews pending. README and RESULTS label this as the documentation snapshot. They do not describe it as live status or final acceptance; the full source run and CI remain pending.
- **Custody and exclusions:** the XR-FIX-ORACLE-CUSTODY receipt is accepted, while the original E-ORACLE `7b124f1f…` bytes remain unavailable. RESULTS describes the preserved `f814c0ae…` file only as a reconstruction and makes no restoration claim. The prior R15 archive-corruption evidence remains unresolved and explicitly excluded from acceptance.

## Verification and evidence

The read-only review script checked the E-RELEASE-DOCS report/rawlog hashes and README/RESULTS source pins; inspected the captured status snapshot, attempt-12 capture summary, seeded browser sample flags, author smoke receipt, accepted custody receipt, and current runner/CI path and toolchain code. Its single finding is recorded in [`XR-RELEASE-DOCS-audit.log`](../rawlogs/XR-RELEASE-DOCS-audit.log); the script is [`XR-RELEASE-DOCS-audit.py`](../rawlogs/XR-RELEASE-DOCS-audit.py).

The native read-only `probe.validate_receipt` check accepted the XR-RELEASE-DOCS/N3 packet, and the receipt's source, report, and referenced rawlog hashes and byte counts matched its pins. Its validator and output are recorded in [`XR-RELEASE-DOCS-receipt-validation.py`](../rawlogs/XR-RELEASE-DOCS-receipt-validation.py) and [`XR-RELEASE-DOCS-receipt-validation.log`](../rawlogs/XR-RELEASE-DOCS-receipt-validation.log).

No Node tests, Go builds, browser/demo replay, full runner, or CI was launched for this documentation review. Original README/RESULTS and E-RELEASE-DOCS report/receipt were left unchanged.
