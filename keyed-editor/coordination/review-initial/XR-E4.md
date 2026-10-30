# XR-E4 independent review

## Result

The independent model, projection, and React reference are structurally separate from the Go/WASM candidate and candidate renderers. I found no state-transition or projection mismatch in the direct differential probe. One fixed-script coverage assertion is inaccurate: the scenario named `remove-pending-add-new-id-path-reuse-and-detached-event` does not have the new row occupy the removed row's former child path. This is a test-schedule gap, not a demonstrated model defect.

The original fixed action sequence is in `scripts.mjs:63-70`. It adds rows 1 and 2, starts a pending request for row 1, removes row 1, then appends row 3. Row 2 shifts into path `2/0`; row 3 is appended at `2/1`. The stale event targets the old row-1 key at `2/0`, so it tests cross-row key rejection and the detached-event path, but not a newly added row reusing the deleted row's path as its comment says. To meet that named case unambiguously, remove the last row (row 2), add row 3, and dispatch the stale row-2 key at `2/1/0`.

## Independence and contract inspection

- `model.mjs` imports only the pre-existing independent HTTP codec from `http-effects/reference.mjs`; it imports no Go code, WASM bridge, protocol validator, or candidate renderer. It owns row/request counters, request-to-row history, effects, audit, messages, state transitions, and the Go-shaped view projection.
- `reference.mjs` imports that model and React/ReactDOM. It uses the model's own snapshot as input, React keys for row/input identity, current path/key/value in event closures, and a single root for updates. No candidate renderer or Go state is an oracle.
- The model inspection matched PLAN on key-before-disabled dispatch validation, no-op behavior for disabled Add at four rows, monotonic IDs across reset/removal, cancel-before-remove/reset/re-save, per-row pending request ownership, stale reply audit with retained original `RowID`, accepted error/success handling, exact tree/binding/message shapes, and no DOM key attributes. Fixed scripts also cover focused deletion, selection through keyed movement, repeated save/cancel, reset, and independent held row completions. Seed generation is bounded and deterministic for the two frozen seeds.

## Independent verification

From `/workspace/scratch/39a56936f173/gondola`, with Node `v22.23.4` and Chromium executable `/tmp/chromium`:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
/tmp/gondola-node22/node_modules/node/bin/node --test \
  keyed-editor/reference.test.mjs \
  keyed-editor/scripts.test.mjs \
  keyed-editor/reference.browser.test.mjs
```

Result: **14 tests passed, 0 failed**, including the real Chromium reference test.

The independent Go-WASM differential and adversarial negative probe is reproducible with:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
/tmp/gondola-node22/node_modules/node/bin/node \
  keyed-editor/coordination/reports/XR-E4-probe.mjs
```

Result: **57 checkpoints passed** comparing actual `gobiCollection` WASM snapshots, audits, and drained effects to the pure-JS model across four reset-isolated sequences. The sequences include cap/no-op, reorder and current bindings, repeated-save cancellation, removed-row request history, reset cancellation order, late/stale and accepted replies, error/retry, monotonic IDs, and unknown maximum-safe request ID. Five invalid dispatch probes (wrong key, key mismatch at disabled target, noncanonical path, extra field, wrong primitive type) were rejected by both implementations and left snapshots, audit, and outboxes unchanged. The existing `coordination/probes/model-differential.mjs` also passed its 22-state differential.

The E4 asset hashes reviewed were:

| File | SHA-256 |
| --- | --- |
| `keyed-editor/model.mjs` | `bdb6085460c462f55637e7eb960d0e8b52a0751ced71f3d261018a8ded77c60e` |
| `keyed-editor/reference.mjs` | `1f1c995e041b0329a5f4401d692a556659f737efd0bb66a31fd7fd3c1b8ff1c1` |
| `keyed-editor/scripts.mjs` | `f5f71b3ee821864b8cf636985566d53d9c5074e623c23f6a7adca0fb365c9d14` |
| `keyed-editor/build/keyed-collection.wasm` | `a50c670dbb9ec6895e60f815f7629b504610cbf2a665b7c4c53842a8ecbb1510` |

No production or Git files were changed. No test artifacts or shared traces were overwritten. The new differential probe and this report are the only files written by this review.

## Limits

The direct probe exercises the actual Go WASM bridge against the independent JS model; it does not itself exercise the three browser renderers or live HTTP service. The separate E4 Chromium test verifies the reference renderer's node identity, focus/selection, detached input suppression, stale key/path rejection, and cap behavior. Cross-renderer and live HTTP conclusions remain owned by E5's composed run. Other browser engines, IME composition, concurrent browser scheduling, and pixel output were not tested.

## Authorized bounded repair

The original path-reuse finding above is preserved. The authorized repair changed only the fixed schedule and its test: the scenario now starts a held save for last row 2, removes row 2, adds row 3, and sends the removed row's `row-2-input` key at `2/1/0`. It also dispatches the detached row-2 input and releases request 1 with expected HTTP 409. The added test runs the scenario through the independent JS model and asserts that row 2's former input path equals row 3's new binding path, the row identity changes from 2 to 3, and the stale path/key rejection leaves the snapshot unchanged. The late completion audit still identifies the original row 2.

Verification after this bounded repair:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test keyed-editor/scripts.test.mjs
```

Result: **5 tests passed, 0 failed**. This is the model/projection assertion for the corrected schedule; the requested E5 browser replay of this exact script remains a separate cross-renderer check.
