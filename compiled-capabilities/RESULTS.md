# Capability negotiation results

## Execution status

The integrated N6 runner and workflow are prepared. This author checkpoint did not launch the full runner because root owns the integrated run after the author and independent review lanes finish. No integration pass is claimed here.

Focused preflight evidence is available, but it does not satisfy milestone acceptance:

- The clean worktree did not contain the ignored M0 `react-map.gen.mjs`. Go 1.24 regenerated it with `go run ./cmd/gobi emit react`; `sha256sum -c SHA256SUMS` then passed all 24 entries.
- Actual GoScript CLI builds for React and DOM each returned `gobi.build-result/v1`, `ok: true`, and 67 output pins. Their AppIR capabilities were exactly `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`.
- N4's separate author receipt records 8/8 oracle tests passed. N5's separate author receipt records a focused HTTP smoke with 8 passing checks against the fresh React feasibility build. N3's complete integrated driver is not part of this author checkpoint.

The root full run will replace the placeholder execution report and receipt with its own observed toolchains, commands, source pins, build hashes, browser captures, mismatch traces, and final stage outcomes. Acceptance requires a fresh passing `run-compiled-lifecycle.sh` receipt, actual React and DOM GoScript CLI builds, a passing N4 literal oracle, matched N3 native/direct/React/DOM replay, a passing N5 HTTP smoke, stable source pins, and a round-trip verified evidence archive.

## E-FIX-BUILD archive and checker repair

The runner now writes an immutable pre-archive execution snapshot into the tar and binds the outside manifest hash, archive hash, and post-archive source pins in the final outer receipt. N3 acceptance also requires raw state/view/DOM/pending preservation after rejected and compatible swaps, plus detection of all nine named capture mutation controls. The focused archive-helper test and syntax checks pass; the full capability runner remains unlaunched and acceptance remains pending root's integrated run. See `coordination/reports/E-FIX-BUILD.md` and `coordination/receipts/E-FIX-BUILD.json` for exact commands and results.

## Planned evidence

- `coordination/reports/E-BUILD.md` — concise execution report.
- `coordination/receipts/E-BUILD.json` — exact commands, versions, stage results, source pins, and output references.
- `builds/attempts/` — per-attempt build requests/results, generated React/DOM outputs, native trace, Node test transcript, browser traces, screenshots, logs, and archive.
- `conformance/evidence/` — original N3 lifecycle and capability matrix outputs; the E-BUILD archive contains hashed copies.

The fixed lifecycle scenario and independent capability expectations use no random seed. The runner records that fact alongside each command inventory; compiler profile, package versions, and existing npm lockfile hashes are recorded explicitly.
