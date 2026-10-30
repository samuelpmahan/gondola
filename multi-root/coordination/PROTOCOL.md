# Multi-root author and review protocol

## Scope and ownership

The captured author solve is the native Rebalancer 1.0.4 allocation in
`spec.json`, `state.json`, and `native/epoch-00.json`. It records six distinct
author assignments, exact score 600/600, zero broken constraints, and passing
independent capacity and eligibility checks. The native allocation and actual
worker starts are separate records; neither is an implementation acceptance.

| Job | Worker | Assigned area |
| --- | --- | --- |
| E1 | W6 | `multisession/`: typed Go session manager |
| E2 | W2 | `cmd/multi-root-wasm/`: strict session bridge |
| E3 | W5 | GoDOM multi-instance bridge and renderer adapter |
| E4 | W3 | JavaScript composition host and runtime |
| E5 | W1 | deterministic scripts, reference, and replay |
| E6 | W4 | demo, default runner, CI, docs, and delivery report |

Each author edits only the paths assigned in the spec and task dispatch. Root
owns Git, overall integration, `RESULTS.md` final evidence, preservation
checks, and final coordination state. Authors do not modify one another's
deliverables, change the allocation, record review acceptance, or claim a full
suite pass based on a packet-local check.

## Review and repair

After author packets finish, root schedules one fresh, independent review per
packet using the captured review policy. The author of the packet repairs its
own findings; the reviewer checks the repair and records an acceptance only
after inspecting the exact current tree. A review start, an author report, a
native solve, and a review acceptance are different events and must retain
their actual evidence. Root schedules the final composed gates and verifies
prior delivery pins and root source hashes before calling the milestone
accepted.

As of E6 packet authoring, review receipts and final integration outcomes are
pending. No acceptance is implied by the native author allocation or by this
protocol.

## Reproduction reference

The original native author snapshot and bundle are preserved as
`native/epoch-00.json` and `native/epoch-00.bundle`. The applicable package
version is Rebalancer 1.0.4. Root's fresh reconnaissance reports Gondola main
at `3b46301e69104d82298126e58e0c65565825a4c4`, open green PR #7 at
`47728575f6f9a7989e3e380bc0acf2d4b242180b`, the Chainspot toolkit main at
`37a2dba87d61262f661af70f1a22440736e61efc`, and open draft PR #1 at
`989c295717511c812b69beda5d125817ffc054c9`. Root also reports 650 previous
delivery pins and all 24 root `SHA256SUMS` entries verified. These are
reconnaissance inputs; root's final preservation check remains authoritative.

The captured epoch JSON is the record of the solve that dispatched these
workers. Re-solving the spec can choose a different equally optimal tie and
must not overwrite the captured epoch or be presented as the historical
allocation.
