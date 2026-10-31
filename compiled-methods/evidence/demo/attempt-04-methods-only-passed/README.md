# E-DEMO method-only passing attempt

- Mode: `--methods-only` (the inherited full backend runner was intentionally skipped on this fresh attempt).
- Source: 137 source pins before/after matched.
- Go: root 1.24.0, compiler 1.27.3; Node 22.23.4.
- React/DOM compiler outputs: 67 files each. AppIR and encoder bytes match; raw GoScript modules are pinned separately.
- Conformance: native/direct/browser matched for 18 actions and 19 ticks; 14 dispatched, 4 suppressed, 18 backend swaps.
- HTTP smoke: passed with final state `{parent:0, child:2, readOnly:false, savedChild:1}`, 14 accepted actions, and 3 renderer changes.
- Screenshot and full matrix traces, logs, and per-build request/result/manifests are retained here. Raw built bundles and the native executable remain in the ignored original attempt path and are hash-pinned by the runner receipt.
- The local default full inherited route was separately attempted but is marked incomplete because its tool session disappeared without a final exit status. The root M0 gate passed separately. This methods-only receipt is not a claim that the inherited full route passed.
