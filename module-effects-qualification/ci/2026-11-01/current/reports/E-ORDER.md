# N4 E-ORDER author report

## Result

Implemented `effectqualification.CheckOrdering(expected, actual map[string]any) error` in `gondola/effectqualification/ordering.go`. The expected map is native replay output; actual is one direct or browser profile capture. The checker accepts exactly the five supported profile names and rejects the browser capture index wrapper.

The checker verifies scenario event order and source-event identity, native event projections, actual host results and host event indices, transport action order and terminal outcomes, ordered/effect ledger sequence and correlation, request render-before-start, accepted-reply and cancellation render retirement, final pending state, child unmount cancellation, stale callbacks against the prior generation, and direct/browser renderer swap continuity and epochs.

## Verification

Command: `/tmp/gondola-go/go/bin/go test ./effectqualification -run TestCheckOrdering -count=1`

Output: `ok github.com/samuelpmahan/gondola/effectqualification 0.328s`

The test run checked all five literal real-capture profiles (`direct.dom`, `direct.react`, `browser.dom`, `browser.react`, `browser.swap`), a real seeded `browser.swap` capture for seed 20261104, and three negative controls: reordered events, a mismatched transport correlation, and a mismatched effect-ledger correlation.

Raw command and output are under `effects-qualification-coordination/rawlogs/E-ORDER/`.

## Limits

The real-capture tests read the attempt directory from `GOBI_EFFECTS_QUALIFICATION_INPUT` when set, otherwise the local PR23 fixture path. They report an explicit Go test skip if neither is available. This checker only validates the finite capture schemas and lifecycle semantics described above; it does not claim arbitrary Go/browser or pixel equivalence.
