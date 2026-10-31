# XR-FIX-GO: independent review of the empty-Arg repair

## Decision

**Accept.** E-FIX-GO closes the specific XR-GO finding. The original XR-GO amendment remains recorded as `amend`; this review records acceptance of N1's repair.

## Review

The original E-GO implementation recognized the actual typed `gobi.Effect` cancellation descriptor only when `Arg` passed an extra non-empty-value check. That check treated direct `Arg: ""` differently from parenthesized `Arg: ("")`, even though both are string expressions. E-FIX-GO removes the value check and retains the relevant static contract:

- The effect element type comes from Update's second result slice and must be the exact Gobi `Effect` type with string `Kind`, `Name`, `Arg`, and `Reply` fields.
- The descriptor must be constructed in Update-reachable code and use keyed fields.
- `Arg` must be present and string-typed; its payload value no longer changes the declared requirement.
- `Kind`, `Name`, and `Reply` still have to be literal strings with the protocol values `lifecycle.cancel`, `cancel`, and `""`.
- There is no app or package ID check in capability derivation. It starts from each component's Update symbol and traverses its helper graph.

Analyzer regression coverage now includes both direct and parenthesized empty Args. The existing controls for a mismatched name, unrelated text, unreachable descriptor, and computed kind remain. The implementation did not relax those protocol-field controls.

## Verification

- Repository root, Go 1.24.0: `PATH=/tmp/gondola-go/bin:$PATH go test -count=1 ./compilercontract` — passed.
- `compiled-frontend/`, Go 1.27.3: `PATH=/tmp/gondola-go/bin:$PATH GOTOOLCHAIN=go1.27.3 go test -count=1 ./analyze` — passed. This fresh full package run includes the direct and parenthesized empty-Arg cases.
- Raw command output and reviewed source hashes are recorded in `receipts/XR-FIX-GO.json`; logs are under `reviews/XR-FIX-GO/logs/`.

This review made no production edits. It did not run the full capability milestone runner and did not commit, merge, or deploy.
