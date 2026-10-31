# R-CI-GO — expected View claim correction

**Outcome: `mixed_change`.** This is a documentation and receipt-precision repair to E-CI-GO. The accepted native/direct CI evidence is unchanged.

## Finding

The original E-CI-GO report said that the 18 fixture expectations matched “typed state, messages, dispatch IDs, effects, and views.” The frozen fixture expectation records have no `View` field, so that wording overstated what those expectations assert. The native and direct trace records do contain `view` values and their full trace files are equal, which establishes backend parity but does not establish that the trees match an independent expected View.

## Repair

The original report and receipt are preserved byte-for-byte under `lanes/go/repair-view-claim/before/`. The canonical report now limits fixture-expectation matching to typed state, messages, dispatch IDs, and requested/completed effects. It states separately that native/direct View records are equal, and points to the independent expected-tree check in E-CI-DOM. The canonical E-CI-GO receipt now uses the field `fixture_state_message_dispatch_effect_expectations_matched`, records `native_direct_view_records_equal` separately, and references the E-CI-DOM report, oracle, and passing primary audit by hash.

The E-CI-DOM evidence reports that its hand-authored oracle checked fixed Go states and View trees against native, direct, and React/DOM/swap browser records. Its report SHA-256 is `c90ee5efed77ba2cc1e1d5c86571e4e979d727a0b446046920f0b907f4d41df0`; its primary DOM audit SHA-256 is `5daff9df36feac4ebff9a0df485926d86e4c6888f9e04d3cd20a56aab7f92eed`.

The substantive Go lane proof was not rerun or changed. `audit_current_ci.py` remains SHA-256 `259b173aefb9a8e0459644e7614ce4a97e27435a9636c24c1f7445e309b82346`, and `current-ci-audit.json` remains SHA-256 `7094b22776f354047af95fc54c8189a6af83210f02c308e295031a2c57320fc2`. The original E-CI-GO report/receipt hashes were `5ec5ac56d4ceaeb6733e53850308ac5dde8a454dd6582a3536dc559c2f4cd256` / `5f518e33bfc3e93b0a697c4b3d0e222385c49155e628efd552e97086ce85e37c`; the corrected canonical hashes are `5ca16a93e4d9ce3b4ac5b06a85cb8795e34bba2d9f3bbf839d1b981bea4b11d1` / `7cbeb3fb41323aeee29a6a6074b9f7325718b74c8eeab995d883c06ed41f414f`. The stale 24/26 pending snapshot statement was also replaced with a scope boundary that defers global workflow status to its separate cross-workflow packet.

## Scope

The primary push Go/native/direct lane remains passed. This repair corrects the boundary between fixture expectations and View parity; it adds no new execution result and makes no new View conformance claim beyond the independently hashed E-CI-DOM oracle evidence.
