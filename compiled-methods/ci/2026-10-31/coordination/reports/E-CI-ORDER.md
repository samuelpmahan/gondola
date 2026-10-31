# E-CI-ORDER

**Worker N6 · Outcome: confirmed reuse for the bounded value-method fixture’s event ordering and renderer lifetime.** This result uses the successful current-source push primary artifact, not the local preflight or the failed `8ed5b66` artifact. Source commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d` has tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`.

## Primary artifact and provenance

The primary workflow run was push `41169518187`, job `124444234335` (`compiled-methods`), conclusion `success`. Provider metadata ties artifact `13030848292` to that run and head SHA `6b49cc0bd4c9512a041f723c86b632ec506afd9d`. The attempt is `attempt-20261031T044100445Z`, with `execution.status: passed`, `mode: full`, `methodMatrix.status: matched`, `sourcePinsMatch: true`, and 137 source pins. The runner’s overall `execution.outcome` is `mixed_change`; this lane’s `confirmed_reuse` is limited to the E-CI-ORDER event-ordering and renderer-lifetime result.

`verify_primary.py` independently checked the publication, provider metadata, terminal job snapshot and log, current Git HEAD/tree, source pins, retained archive, ZIP CRC, all three ZIP chunks, all 968 manifest member hashes, and all 968 extracted member hashes. The archive is 11,460,089 bytes (SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`) with 79,084,644 uncompressed member bytes. All 137 source pin hashes match the current worktree. The upload log records `compiled-methods: passed (full)` and the same artifact digest and ID.

## Event ordering and lifetime results

The read-only `audit_order.py` ran against the raw attempt records and passed **677/677 checks**. Each renderer profile recorded 18 click intents and 19 ticks. The 14 enabled intents delivered the expected fixture messages and empty action values in order with IDs `dispatch-0001` through `dispatch-0014`. Physically clicked disabled controls at action indexes `[6, 9, 10, 17]` were recorded as four suppressed ticks with null message and dispatch ID; they did not consume IDs.

| Profile | Intents | Enabled dispatch callbacks | Disabled suppressions | Ticks |
| --- | ---: | ---: | ---: | ---: |
| React | 18 | 14 | 4 | 19 |
| DOM | 18 | 14 | 4 | 19 |
| Alternating React/DOM | 18 | 14 | 4 | 19 |

The swap profile alternated renderers after every action, for 18 swaps. Every record has the same tick count before and after; its state and view are marked unchanged, and the action tick’s state matches both the new oracle and physical snapshot. Each swap empties and detaches the previous root before using a distinct new root. The 18 captured callbacks from retired renderers were invoked after detachment, observed stale at their recorded renderer epoch, fenced with generations `1`–`18`, and left the trace tick count unchanged.

All three profiles end with an empty physical DOM and renderer snapshot after unmount; each pre-unmount view had seven controls. The profile and top-level records contain no page errors, WebAssembly requests, or WebAssembly API attempts. React, DOM, and swap browser trace hashes match (`5f4337422d692fabafa1dd77ab33273c524c9268ce40046d1fed15b87f031a98`); native and direct trace files also match (`d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`).

The fixture contains buttons only, so this packet makes no focus or selection claim. It requests no effects; this packet makes no effect-completion claim. It does not claim manager/session ownership or cancellation behavior.

## Reproduction and digests

Audit runtime: Python `3.12.14`. Exact commands from the worktree root:

```sh
python3 compiled-methods/ci/2026-10-31/lanes/order/verify_primary.py . \
  --output compiled-methods/ci/2026-10-31/lanes/order/primary-provenance-audit.json

python3 compiled-methods/ci/2026-10-31/lanes/order/audit_order.py \
  compiled-methods/ci/2026-10-31/extracted/compiled-methods/artifacts/attempts/attempt-20261031T044100445Z \
  --source-commit 6b49cc0bd4c9512a041f723c86b632ec506afd9d \
  --workflow-run-id 41169518187 \
  --output compiled-methods/ci/2026-10-31/lanes/order/primary-order-audit.json
```

Both commands exited `0`. The independent provenance receipt SHA-256 is `96d76a6e0123bdb297a4de33370da8dd89f5bef34eaa1da5647bcc5254b1ab25`; the raw ordering audit receipt SHA-256 is `685e718408a9b307f43b45683b9a59dd31774a35e69104a78a99c96cc0a81727`.

| Input | SHA-256 |
| --- | --- |
| `audit_order.py` | `c56b222b220288ee75aa497ddfe36cde50e7b721eb340e99b1e366e1330b038f` |
| `verify_primary.py` | `8998c49327685c7d9361b3458db36bf731f63cd48c8febea13c1da550238a2b9` |
| `execution.json` | `88c6599e2da4e7c34e569b9c5d7c26371dbc4eac4929c0c6c3a2e631fa58b6ee` |
| `methods.browser.capture.json` | `af59cc079eccee6c2b3550fec081a32f9056758aa54c6a71ef6f53cdc56cf626` |
| `methods.direct.json` and `methods.native.json` | `d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12` |
| `methods.run.json` | `90763ff81477b3da8185ea9236409e891ce6cca3798aa07cd23fc4bd1d0a7c78` |
| Provider artifact ZIP | `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a` |

Captured CI versions: Node `v22.23.4`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`, root/native Go `go1.24.13 linux/amd64`, compiled Go `go1.27.3 linux/amd64`, Chromium `156.0.8078.4`. Package lock digests are root `e35def24ea8e20847d1ea58a59bc3b233b6c0d1d9fa697e44e735812617ef53b`, interaction `b1dc4681b030322933246c2b4622a4cbb9ebcb8ac7f69f0f4021459c9d603ed0`, and compiled frontend `245318fce8e9760b07f8c465240d85b1449d4b75110c510aa5f362be3c600079`.

This packet accepts the successful current push primary run for its assigned scope. It does not claim that all current workflows are complete, that the separate PR workflow has passed, or that the PR is merged. The earlier local and `8ed5b66` preflight report and receipt were preserved under `compiled-methods/ci/2026-10-31/lanes/order/preflight/`.
