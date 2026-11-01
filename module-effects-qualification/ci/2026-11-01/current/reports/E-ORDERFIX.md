# N2 E-ORDERFIX author report

## Result

Updated `gondola/effectqualification/ordering.go` to validate every `pendingCount` on the declared `request`, `start`, `cancel`, and `reply` rows in both `orderedLedger` and `effectLedger`. Counts now come from the Go replay state after the corresponding source event (`expected.events[eventIndex].stateIndex`), not from captured metadata. The dispatch/action projection pairs each ledger row with its source transport token. Starts must be present in the Go pending set with matching key and generation; cancellation and reply actions must have removed that token from Go pending state.

The checker requires each count field, rejects unexpected count fields on other row kinds, and accepts only canonical non-negative integer values. It also compares every renderer and Go render commit's full `pendingGo` identity set (key, generation, token) with the Go state mapped through the capture's host event index. This prevents the capture's count and pending token list from validating each other when both are forged.

Added tests cover the reviewed `orderedLedger` start count mutation from 1 to 99, wrong counts for request/start/cancel/reply in both ledgers, missing count fields, non-integer and noncanonical numeric representations, a coherently forged pending list plus count, and a pending list forged by itself.

## Verification

Focused command: `/tmp/gondola-go/go/bin/go test ./effectqualification -run 'TestCheckOrdering(BindsPendingCountsToGoState|RejectsCoherentPendingForgery|RejectsPendingGoForgeryAgainstGoState|RealLiteralProfiles|RealSeededCapture)$' -count=1`

Result: passed (`ok github.com/samuelpmahan/gondola/effectqualification 1.749s`). This includes the regression controls and real literal profile plus seeded capture ordering positives.

Full package command: `/tmp/gondola-go/go/bin/go test ./effectqualification -count=1`

Result: passed (`ok github.com/samuelpmahan/gondola/effectqualification 27.891s`). The package includes the PR23 `CheckCaptures` control that asserts all four required scenarios and all 20 scenario/profile captures, plus the existing adversarial controls.

`git -C gondola diff --check` returned exit status 0 with no output. Exact commands and raw outputs are in `effects-qualification-coordination/rawlogs/E-ORDERFIX/`.

## Limits

Validation is limited to the finite native and capture schemas and the PR23 fixture protocol. It does not establish arbitrary browser equivalence. The capture must provide the declared async count fields and render pending snapshots in the current schema.
