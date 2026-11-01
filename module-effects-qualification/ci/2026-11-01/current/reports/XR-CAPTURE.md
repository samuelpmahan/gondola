# XR-CAPTURE — independent review of N2 E-CAPTURE

**Reviewer:** N1  
**Decision:** `accepted`

## Review summary

The sealed E-CAPTURE report, packet JSON, rawlog index, and source inventory agree with their sealed hashes. All three E-CAPTURE source files match the live `gondola/effectqualification` files byte-for-byte. The original N2 logs and source inventory pass their SHA-256 checks.

The explicit PR23 fixture passes with **4 pinned scenarios, 20 profiles, 178 events, 182 states, 58 effects, and 116 transport records**. The four scenarios are `literal` and seeds `20261104`, `20261105`, and `20261106`; each has the five fixed profiles.

## Boundary probes

An independent Go harness ran against a temporary regular-file copy of the real `conformance/` fixture. It first passed the baseline and passed again after restoring each mutation. All four scenario names were changed independently while retaining valid JSON; each substitution failed its pinned raw SHA-256 check. Changing the `browser.dom` profile identity to `direct.react` failed the expected-profile check.

Replay-derived checks rejected these mutations:

- Parent view tree and corresponding DOM markup changed together from `main` to `article`.
- A disabled button was enabled in both the DOM markup and the matching browser control snapshot.
- An event result and its DOM callback result were changed together.
- Parent Go state and controller child count were changed together.
- An effect descriptor and matching pending snapshot descriptors were changed together.
- A pending snapshot token was changed.

Adding an extra top-level metadata key to a capture document remained accepted. That matches the documented boundary: profile documents decode as generic maps with required consumed fields checked, while extra metadata keys are allowed. The shared strict decoder tests also passed for exact `json.Number` handling, duplicate keys, invalid UTF-8, unpaired surrogates, trailing values, unknown typed fields, and incorrect struct-field casing. Typed node records use this strict typed decoder; generic capture maps do not claim closed-key validation.

## Verification and scope

Focused E-CAPTURE tests and the shared decoder tests passed under Go 1.24.0. The test overlay mapped `ordering.go` and its tests to the sealed E-ORDER source because N2 was repairing the live ordering file during this review. This isolates capture verification from that concurrent edit. The separate XR-ORDER review has an outstanding `pendingCount` finding in ordered lifecycle records; this capture review does not clear that finding.

The review is limited to the finite pinned PR23 fixture and its five profiles. It makes no arbitrary browser or JavaScript equivalence claim. No production source was changed. Early harness iterations had path/fixture-assumption mistakes; they are retained in rawlogs, and the final harness completed successfully.

## Evidence

- `rawlogs/XR-CAPTURE/seal-integrity.stdout` and `seal-integrity.txt` contain sealed packet, rawlog, and source inventory checks.
- `rawlogs/XR-CAPTURE/sealed-tests.*` contains the explicit-fixture capture and decoder focused test run.
- `rawlogs/XR-CAPTURE/decoder-tests.*` contains the shared `modulequalification.DecodeStrict` tests.
- `rawlogs/XR-CAPTURE/boundary-probe.go` and `boundary-probe.*` contain the independent positive and mutation controls.
- `rawlogs/XR-CAPTURE/probe.go` and `positive-inspect.*` preserve the real first browser DOM and disabled-control snapshot inspected.
- `rawlogs/XR-CAPTURE/make-index.go` generates the per-file hash inventory.
- `rawlogs/XR-CAPTURE/ordering-overlay.json` maps ordering source to the sealed E-ORDER snapshot used for stable compilation.
- `rawlogs/XR-CAPTURE/commands.txt` records commands and preserved harness iterations; `rawlogs/XR-CAPTURE/index.json` hashes every review rawlog.
