# E-ACCEPT-DEMO: current-source capability demo evidence

## Decision

**Accepted for the scoped demo evidence gate.** The fresh primary CI run for source `60b5aeff3172837ad7831c2b78b210454a3d81a2` (tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`) passed the full E-BUILD and demo checks, and its complete 189-member archive passed independent verification. The local run's browser smoke passed, but its archived container is explicitly rejected as truncated. Per the root-owned `compiled-capabilities/ci/2026-10-31/ACCEPTANCE-SCOPE.json`, the exact-source fresh CI execution is the authoritative archive evidence; no regression run was reused or skipped.

This packet accepts the demo evidence only. It does not close the full capability milestone.

## Local run: demo passed, archive rejected

Local attempt `attempt-20261031T103735751Z` records full E-BUILD `passed`, zero failures, 163 matching source pins, and root-observed runner exit code 0. The eight Playwright checks passed, the browser reported no page or console errors, failed requests, WebAssembly requests, or WebAssembly API attempts, and the captured screenshot was visually inspected.

The local archive is not valid. The final receipt binds it as 14,983,690 bytes with SHA-256 `1a4fd17fd4f8c2aef16aaa1ed268d253b13dd77396e6cb6da3108e2b2c3921ab`; the preserved file is 12,845,056 bytes with SHA-256 `91e3d977e8efd7ef42a37d43029997a9e2ab8db7266a88cf54d5f7cc90a64b5f`. The read-only complete-mode verifier exited 2 with `archive bytes do not match the final receipt binding`. A bounded stream inspection found 188 of 189 members before the gzip stream ended; the missing member is `inherited-lifecycle-artifacts.tar.gz`. Root records the cause as unknown and the local archive as rejected. The local attempt, receipt, and archive were left unchanged.

Local evidence and the failure output are preserved under `compiled-capabilities/ci/2026-10-31/source-60b5aef/demo/`, including `local-demo-audit.json`, `local-archive-verification/`, `local-archive-byte-diagnostic.json`, and exact byte copies in `raw-local/`.

## Authoritative primary CI run and archive

The independently checked terminal catalog at `compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/source-60b5aeff-terminal-runs-jobs-20261031T111444Z-v2.json` has SHA-256 `b69f432f53e8d4ff85ae0d855bbfabec35f76febb4830853d313cb0a8b2d9bfc`. It records all 30 current-source workflows and jobs completed successfully (15 push and 15 pull request), all on the exact source commit and tree.

Primary push run `41193504188`, job `124514913013`, uploaded artifact `13040129310`. N4's outer verification matched the provider ZIP byte count and SHA-256 (`76,786,265` bytes; `3a54a53c81ac93ad1c5a8231b17ac289875ed57ad7bb12d7ae2b3609ff267de1`) and verified all ZIP member CRCs, hashes, and safe file types. The embedded full E-BUILD receipt is `passed` with zero failures and 163 source pins. Its inner archive has 189 of 189 members, a valid gzip end marker, and SHA-256 `ba17805387c8204ef2624caec0af35641771bc8af48d4f03b82c1a6609586d8f` (14,960,460 bytes). My complete-mode `verify_archive.py` run also exited 0 with `completeAcceptance: true`.

The terminal catalog audit, outer ZIP verification, inner archive verification, and complete-mode output are recorded in `terminal-catalog-audit.json` and `primary-archive-verification/`. The authoritative raw demo and archive files are copied under `raw-primary/` with a byte/hash inventory.

## Demo checks

Both the local attempt and authoritative CI capture passed the same eight pinned Playwright assertions. The smoke test verified that the actual compiled lifecycle view mounted with the DOM renderer; `/`, `/demo.css`, and `/demo.bundle.mjs` each returned HTTP 200; and the page exposed the AppIR requirements, host support, and renderer profile. React and ReactDOM are both 19.3.1.

The interaction checks verified that a disabled pending request ignored an injected click without a Go tick; a compatible DOM-to-React swap retained Go state, view, trace, and pending request; the candidate missing `view.node` was rejected at admission with the old renderer, physical control node, state, trace, and pending request preserved; and a physical click after rejection still dispatched to Go. A compatible React-to-DOM recovery kept the request correlated and delivered its reply to Go Update.

The final trace has five ticks: the initial state followed by `addParent`, `requestParent`, `addParent`, and `complete`, with dispatch IDs `dispatch-0001` through `dispatch-0004`. The final parent counter is 2, reply token is `parent:g1:r1`, and there are no pending requests. Both captures have zero page errors, console errors, failed requests, WebAssembly requests, and WebAssembly API attempts.

The mounted AppIR, compiled module, encoder, manifest, and browser bundle were checked against the generated build record and command logs. The AppIR declares `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. Both screenshots were visually inspected; they show the mounted DOM view, counter at 2, delivered reply, capability/support profiles, and event trace. This is visual observation, not a pixel-equivalence claim.

## Commands and scope

I did not rebuild, rerun Playwright, or rerun a full suite. The demo auditor read the captured JSON, logs, source pins, build outputs, and archive members. The terminal catalog audit hashed the run list, all 30 per-run job snapshots, the provider artifact, and the associated verification records.

The archive verifier commands were:

```text
python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --receipt compiled-capabilities/coordination/receipts/E-BUILD.json --root . --require-complete
```

Local result: exit 2, rejected archive-byte binding.

```text
python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --receipt <primary-extracted>/compiled-capabilities/coordination/receipts/E-BUILD.json --root <primary-extracted> --require-complete
```

Primary CI result: exit 0, full archive acceptance verified.

Remaining milestone gates are tracked by root: the other bounded independent reviews, the root-owned native scheduling audit, and the published delivery-chunk hash gate. This packet does not mark those gates complete.
