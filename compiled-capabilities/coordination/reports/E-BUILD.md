# E-BUILD: compiled backend capability negotiation

**Outcome: mixed_change.** N6 implemented the full runner, shell entrypoint, locked-dependency CI workflow, M0/source pin checks, evidence archive, and documentation. Focused compiler and static-interface preflights passed. The complete milestone runner has not been launched by N6; root owns that run after the author and independent review lanes finish.

## Focused preflight results

- The clean worktree lacked the ignored M0 `react-map.gen.mjs`. N6 regenerated it with Go 1.24 using `go run ./cmd/gobi emit react`, then `sha256sum -c SHA256SUMS` passed all 24 entries, including the regenerated map. The full runner performs this generation and verification before it takes `sourceBefore` pins. The inherited static run regenerates the map again and the final pin comparison requires identical bytes.
- Actual `go run ./cmd/gobi-build` React and DOM builds each returned `gobi.build-result/v1`, `ok: true`, and 67 output pins. Both AppIR and encoder hashes matched across profiles. AppIR capabilities were exactly `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`; separate generated module hashes are retained with no cross-profile equality claim.
- The feasibility outputs are under `compiled-capabilities/builds/feasibility/{react,dom}/output`. They are ignored preflight inputs for N3/N5 only and are not full-run acceptance evidence.
- The installed React 19.3.1, ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2 versions matched the existing package-lock entries. The CI workflow runs the three existing `npm ci` commands and installs locked Playwright Chromium before the full runner.
- `node --check compiled-capabilities/run.mjs`, `bash -n run-compiled-capabilities.sh`, workflow YAML parsing, and a static source audit of N3/N4/N5 CLI arguments and paths passed.
- Separate N4 and N5 author receipts report their focused checks passed. Those results are not the N6 integration run.

## Full-run status

The N6 runner has not executed `bash run-compiled-capabilities.sh`. Therefore inherited M0/static/interaction regressions, N3 native/direct/React/DOM replay, N4 execution by N6, N5 smoke by N6, full before/after source pins, and archive round-trip remain pending root's integrated run. No end-to-end acceptance claim is made.

## Evidence and implementation

- `coordination/receipts/E-BUILD.json` records N6 commands and results, preflight output paths/hashes, capability declarations, and limitations.
- `run.mjs` always invokes the full inherited runner first, regenerates and verifies the original M0 pins, then builds fresh React/DOM outputs through the real GoScript CLI. It executes N4, N3, and N5 in the same attempt, validates their independent output contracts, and archives build outputs, logs, traces, screenshots, and inherited lifecycle evidence.
- Source pins exclude coordination receipts/reports, installed packages, generated logs/images, and build/evidence outputs. The `SHA256SUMS` file and all 24 listed M0 inputs are pinned after the deterministic map regeneration.
- No Git operations, dependency lockfile edits, publication, merge, or deployment were performed by N6.
