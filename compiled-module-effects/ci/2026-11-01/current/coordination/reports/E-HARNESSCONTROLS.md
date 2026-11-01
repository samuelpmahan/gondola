# E-HARNESSCONTROLS — conformance report contract repair

**Worker:** N4  
**Job:** E-HARNESSCONTROLS  
**Outcome:** `mixed_change`  
**Status:** `verified`

## Failure and repair

The preserved N6 attempt `attempt-20261101T031902805Z-2-00c0492f` produced four builds and the full four-scenario/five-profile capture set, then failed only at `compiled-module-effects/conformance/run.mjs`’s stale exact-eight capture-control assertion. The failed attempt and old runner source pin are retained in the indexed evidence.

The conformance producer now validates the capture-control report against the expected control IDs instead of a fixed count. It checks a nonempty control array, unique IDs, the required 16 IDs, a declared `detected` status, each `rejected: true` result, nonempty failure paths, and `total === rejected.length`. It derives the normalized total from the array and emits `{id, name, rejected, path}` per row. The capture policy explicitly permits additional well-formed, unique controls; an extra control without that policy is rejected. The build-admission report uses the same normalized shape with its seven required IDs and explicitly disallows extras.

The aggregate `compiled-module-effects/run.mjs` consumer already checked a nonempty array, matching total, and all-rejected rows dynamically, with no exact-eight guard. The normalized report preserves those fields. N5 independently loaded the fresh summary through the consumer validator and confirmed both the 16-capture and seven-build contracts; that preflight-only probe is recorded at `rawlogs/E-CONSUME/preflight/report-contract-probe.stdout.json` (SHA-256 `3812b8bddc146a53463056406d1241c9f3a6b36bbaff6665f031afc2de7f39c3`). It does not claim clean archive acceptance. The new Node test file is included by the aggregate runner’s recursive `*.test.mjs` inventory.

## Negative contract coverage

Focused tests and structured probes reject an empty report, missing required IDs, duplicate IDs, an undetected control, inconsistent total, ID/name disagreement, a non-boolean extra-control policy, and an extra control without explicit permission. A valid extra control is accepted when `allowAdditionalControls: true` is supplied. The focused test suite passed 11/11, and the structured probe report passed 9/9.

## Fresh matrix and build controls

After the final source edit, I ran the conformance runner against the four-build index from the preserved N6 attempt, writing to a new prefix: `attempt-20261101T032459Z-N4control-final`. The fresh matrix matched all four scenarios across all five profiles. All 28 scenario, native, and profile files matched the generated summary’s byte and SHA-256 pins. The native baseline totals were 178 events, 182 state snapshots, 58 effects, 116 transport rows, and 20 lifecycle rows. Browser profiles used Chromium `153.0.8010.0` with Playwright `1.64.1`; there were no page errors.

The capture mutation report contains all 16 unique required IDs and rejects all 16. It has `total: 16`, matching the array length, and `allowAdditionalControls: true`. The build-admission mutation report contains all seven required IDs; all seven were rejected, with extras disallowed. The fresh run used Node `v22.23.4`, native Go `1.24.0`, and compiler Go `1.27.3`.

The full Node inventory passed 32/32 with the N6 build-index environment set. This includes all current build, conformance, oracle, runtime, and archive-helper tests. Syntax checks passed for all four conformance files.

## Scope and limits

Edits are limited to `compiled-module-effects/conformance/**`. The original sealed E-HARNESS packet and prior attempt remain unchanged. The matrix reused N6’s completed four-build index rather than rebuilding it; this review validates the post-fix conformance matrix, mutation gates, and Node test inventory, not a new aggregate archive/delivery run. No files outside conformance were edited, and no Git or scheduler state was changed by N4.

Commands, red and green evidence, source pins, runtime versions, and verified capture-file references are indexed under `rawlogs/E-HARNESSCONTROLS/`.
