# E-CI-ORDER

**Worker N6 · Outcome: insufficient evidence pending the current primary CI artifact.** This packet is a preflight only. The accepted source is `6b49cc0bd4c9512a041f723c86b632ec506afd9d` (tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`), and the designated current primary workflow runs are push `41169518187` and PR `41169522175`. Neither the local archive nor the retained failed `8ed5b66` CI artifact closes the current-head completion gate.

## Ordering and lifetime audit

I added a standalone read-only audit program at `compiled-methods/ci/2026-10-31/lanes/order/audit_order.py`. It checks the fixed 18-action fixture against its 19 ticks and validates each profile’s actual intent, physical target status, observed message, dispatch ID, and tick state. It also checks the alternating renderer schedule, unchanged tick count and state across every swap, root detach/teardown records, retired callback fences and generations, WebAssembly request/API-attempt records, and page-error records.

The current local methods-only archive passed all 677 raw-record checks:

| Profile | Click intents | Enabled dispatches | Disabled suppressed | Ticks |
| --- | ---: | ---: | ---: | ---: |
| React | 18 | 14 | 4 | 19 |
| DOM | 18 | 14 | 4 | 19 |
| Alternating React/DOM | 18 | 14 | 4 | 19 |

The swap profile has 18 swaps and 18 retired callback attempts. For each swap record, the audit confirmed the exact pre/post tick count is unchanged; the state in the action tick, the new renderer’s oracle snapshot, and the physical snapshot matches the same fixture state; the old root is emptied and detached; and the new root is distinct. Each retained callback was invoked only after detachment, observed as stale at its recorded renderer epoch, fenced with a unique increasing generation, and left the trace tick count unchanged. The final unmount record shows a nonempty view with seven controls before teardown and empty physical and renderer snapshots afterward.

All profiles recorded no page errors and empty WebAssembly request/API-attempt lists. The fixture has buttons only; this lane makes no focus claim. The fixture has no requested effects; this lane makes no effect-completion claim.

## Preflight inputs and provenance boundary

The passing local preflight input was the 189-member archive `compiled-methods/evidence/builds/final-local-methods-only.tar.gz` (SHA-256 `e9ee3f8917bb65e4956ef4fcc620a627c5decdad9d6ffc4b2cf9a1252d4e4b8f`). Attempt `attempt-20261031T042646625Z` records `status: passed`, `methodMatrix.status: matched`, and stable source pins, but it was produced by the local methods-only run. Its browser capture SHA-256 is `e46650f8b06c47c352661ea8b49c0d49d8846fb6d915bda264cadbdb5271606b`; its execution record SHA-256 is `c4dc1db9e9a22c8548f4b7a656e7e1dbef6289e61f0703a2ec81f1ba37df97f7`. It confirms the auditor against a complete current-source local record set, but it does not establish current primary workflow provenance.

The initial primary artifact is retained separately as `compiled-methods/ci/2026-10-31/initial-source8ed/original.zip` (10,841,763 bytes, SHA-256 `56ad778c1e76803734ae9b38620ae0afe57220273be4143ecc59a48525d3424a`). It belongs to source `8ed5b66a223de1992756516f8d3895c6e096f842` / tree `759461302d9fd0d4aef69eaff908f22f31b8c6f0`. Although its browser records contain 18 intents, 14 dispatches, four suppressions, and 18 retired callback attempts, the full execution is failed and has no matched methods matrix: the checker could not find the expected shared `builds/request.json` and `builds/result.json` provenance paths. The archive README records the failure; it is not accepted evidence for the repaired source.

## Commands and versions

Audit runtime: Python `3.12.14`. Exact preflight invocations:

```sh
python3 compiled-methods/ci/2026-10-31/lanes/order/audit_order.py \
  compiled-methods/ci/2026-10-31/lanes/order/preflight/local/compiled-methods/artifacts/attempts/attempt-20261031T042646625Z \
  --output compiled-methods/ci/2026-10-31/lanes/order/preflight/local-order-audit.json

python3 compiled-methods/ci/2026-10-31/lanes/order/audit_order.py \
  compiled-methods/ci/2026-10-31/initial-source8ed/original.zip \
  --output compiled-methods/ci/2026-10-31/lanes/order/preflight/old-head-order-audit.json
```

The local audit exited `0` with 677/677 checks passed and outcome `insufficient_evidence` because no current workflow identity was supplied. The old-head audit exited `1` with 674/677 checks passed; it rejected the failed execution, absent matched matrix, and absent fixture counts.

The local record’s captured tool versions are Node `v22.23.4`, React and ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`, root Go `go1.24.0 linux/amd64`, compiled Go `go1.27.3 linux/amd64`, and Chromium `153.0.8010.0`. These are preflight versions, not a substitute for versions from the current primary artifact.

## Completion gate

The report remains `insufficient_evidence` until root provides the fresh artifact from current primary run `41169518187` or `41169522175` and matching workflow identity proving source `6b49cc0bd4c9512a041f723c86b632ec506afd9d`. At that point rerun `audit_order.py` on the raw attempt records with `--source-commit 6b49cc0bd4c9512a041f723c86b632ec506afd9d --workflow-run-id <current-primary-run-id>`, then update this report and receipt with the exact CI artifact hashes, command, toolchain versions, and result. No current-CI acceptance is inferred from this preflight.
