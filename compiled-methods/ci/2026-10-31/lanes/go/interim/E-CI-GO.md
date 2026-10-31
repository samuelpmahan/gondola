# E-CI-GO — current-head native lane preflight

**Status: preflight completed; current-head CI acceptance pending.** This packet does not claim that the fresh `6b49` workflow passed. Final outcome remains `insufficient_evidence` until the immutable primary artifact for the published checkpoint is received and audited.

## Checkpoint and source status

The target is commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d`, tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`, parent `8ed5b66a223de1992756516f8d3895c6e096f842`. The recorded primary runs are push `41169518187` and PR `41169522175`. Publication identity matches `publication-current.json`. All 20 source acceptance receipt hashes currently match, but that source record explicitly says scoped local acceptance passed and full CI is pending.

## Native and direct-module preflight

`lanes/go/preflight.py` validates the local methods-only attempt archive against its inventory, runner source and output pins, typed method contract, fixture trace, and retained-input evidence. It found a 189-member archive (SHA-256 `e9ee3f8917bb65e4956ef4fcc620a627c5decdad9d6ffc4b2cf9a1252d4e4b8f`); all archived members and 149 output pins matched their retained hashes. The 19-tick `gobi.trace/v1` native and direct traces are byte-equivalent (SHA-256 `d2c26643dbabeb2f434e51c8b0032e4aa4fe720043d3e5bce2a54871def5cc12`) and match the 18 frozen fixture expectations for state, message, dispatch ID, effects, and view.

The React and DOM AppIR values match. All 15 typed symbols and receiver signatures/call edges match the frozen contract. State uses nested `counter.State` values with `float64` count, plus `bool` and `float64` fixture fields; the AppIR advertises `numeric.float64`. The local emitted-module evidence records 14 enabled-update input-preservation checks and two direct read-only guards. Both `PublishSaved` witnesses show the retained nested parent count unchanged while the returned state changes as expected.

As an additional local replay check, the archived native binary and emitted module were extracted to a temporary directory and run against the published fixture. Each exited successfully and reproduced its archived native/direct trace. This establishes replay of the local archive only; it is not workflow provenance or current-head CI evidence.

The separate source-`8ed` CI artifact was verified as a 957-member ZIP with all retained member hashes matching. Its recorded result is a failure: final provenance paths did not match, so it cannot count as methods acceptance for `6b49`.

## Commands and toolchain

Preflight command: `python3 compiled-methods/ci/2026-10-31/lanes/go/preflight.py` (exit 0). The script records the exact temporary native and Node replay commands and their output hashes in `lanes/go/preflight.json`.

Recorded local identities: root/native Go `go1.24.0 linux/amd64`; compiled Go `go1.27.3 linux/amd64`; Node `v22.23.4`; GoScript `v0.6.2`. No fresh workflow log or current-head CI artifact has been audited in this preflight.

## Gate to final decision

Wait for the root-provided immutable primary artifact corresponding to current source `6b49cc0` / tree `b28b10c`. Verify artifact/run/job identity, complete extraction and raw log provenance; then audit the current workflow’s native binary and direct-module checks against the pinned fixture and source. Until then, the result remains `insufficient_evidence`. The prior `8ed` failure and local success are retained as history and context, not substituted for that gate.
