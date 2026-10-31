# E-ACCEPT-GO: current source Go and capability evidence

## Lane conclusion

The exact-source hosted evidence is complete and verified for this lane. The current CI catalog contains 30 successful source-head runs and 30 successful jobs, and the primary capability artifact contains a passed full E-BUILD receipt with a fully verified inner archive. This report accepts the source-bound CI evidence. It does not claim the overall milestone is closed: the six independent acceptance reviews, root's native scheduling audit, and delivery-chunk reconstruction remain global gates.

The root's local full-run attempt reported CLI exit 0 and a passed/full receipt, but its archive bytes do not match the receipt and `gzip -t` reports unexpected EOF. Per [ACCEPTANCE-SCOPE.json](../../ci/2026-10-31/ACCEPTANCE-SCOPE.json), the local archive is rejected with cause unknown; the independently verified same-source hosted CI archive is authoritative. The local archive is not described as passing.

## Source and terminal CI catalog

The source is PR 15, head `60b5aeff3172837ad7831c2b78b210454a3d81a2`, tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`, parent `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`.

The terminal catalog at `compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/source-60b5aeff-terminal-runs-jobs-20261031T111444Z-v2.json` has SHA-256 `b69f432f53e8d4ff85ae0d855bbfabec35f76febb4830853d313cb0a8b2d9bfc`. I independently parsed it and checked unique run/job IDs, exact source heads, event counts, terminal conclusions, and each embedded job's step conclusions. All checks passed: 30 runs, 30 jobs, 15 push and 15 pull-request events, all completed successfully at the exact source head.

The parse output is preserved in `compiled-capabilities/ci/2026-10-31/source-60b5aef/go/logs/terminal-catalog-parse-check-attempt02.log` (SHA-256 `45279727712005d6819891323ab9256b5c577d186ccaecb251c72b919f3f52ce`).

## Primary capability artifact

N4's immutable verification records cover primary push run `41193504188`, job `124514913013`, artifact `13040129310`:

- Outer ZIP verification record SHA-256 `4de2e094846511deaa165be290505e10ab874c07206fb0c0b0a64870f33d82af`: provider and observed ZIP both 76,786,265 bytes with matching SHA-256 `3a54a53c81ac93ad1c5a8231b17ac289875ed57ad7bb12d7ae2b3609ff267de1`; all 1,476 members passed CRC and SHA checks.
- Inner verification record SHA-256 `2d1b7d44636543db65d6f32457563fceda888168a1ce9b7e9201655db91cea04`: extracted E-BUILD receipt is `passed` / `full`, has zero failures, and reports matching source pins. Its archive is 14,960,460 bytes, SHA-256 `ba17805387c8204ef2624caec0af35641771bc8af48d4f03b82c1a6609586d8f`; all 189 regular members match the manifest and gzip reached a valid end/trailer. The 163 before/after source pin sets match.

The root's separate source decision records this hosted CI artifact as authoritative and the local archive as rejected. The records are consistent on the hosted receipt, archive, manifest, and snapshot hashes.

## Go, static comparison, and M0 checks

The current-source counter push and pull-request interaction jobs both completed successfully:

| Event | Run / job | Result |
| --- | --- | --- |
| Push | `41193504118` / `124514912770` | Completed, success |
| Pull request | `41193506615` / `124514920058` | Completed, success; head `60b5aeff`; tested merge `07fc827212889af17524eadfe8c5c9da75d26850` |

Both raw logs show Go `1.24.13 linux/amd64`, Node `v22.23.4`, npm `10.9.9`, passing `compilercontract` and `gobi` packages, `go test ./...`, 5,000 static comparison cases with seed `20261030`, a matching comparison receipt, and a successful M0 `SHA256SUMS` check. `run.sh` uses `set -euo pipefail` and runs `go vet ./...` before `go test ./...`; the successful job progression confirms both commands completed. The static source table has 59 entries by source count; the logs establish package-test success but do not print the row count.

M0 verification covered 24 manifest rows (23 tracked files and the ignored generated `react-map.gen.mjs` row). `SHA256SUMS` has SHA-256 `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`; `EXPECTED.json` has SHA-256 `639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2`. The interaction counter matched 107 scripts over 4,473 initial/action ticks with seed `20261030`; the native comparator matched.

Raw push and pull-request logs are preserved at:

- `compiled-capabilities/ci/2026-10-31/source-60b5aef/go/logs/counter-push-run-41193504118-job-124514912770.log` — SHA-256 `3a2679ee9fad51952babd8c9eab8a7c91557a6871538e4abad5103fe171a075f`.
- `compiled-capabilities/ci/2026-10-31/source-60b5aef/go/logs/counter-pr-run-41193506615-job-124514920058.log` — SHA-256 `3450c65ee49d1e80cae8a99b18585fd79f7348438c5acfffbf2c9ab7f02214c8`.

## Local archive limitation

Root's local attempt `attempt-20261031T103735751Z` reports status `passed`, mode `full`, 17 commands, zero recorded failures, 163 matching before/after pins, and observed CLI exit 0. The canonical receipt is SHA-256 `a04c312c50f6bc4099003045c2e421f0577243d1eff82d106ce1febc2c0e5398`.

An independent read-only check found the local tar is 12,845,056 bytes with SHA-256 `91e3d977e8efd7ef42a37d43029997a9e2ab8db7266a88cf54d5f7cc90a64b5f`; that receipt binds 14,983,690 bytes and SHA-256 `1a4fd17fd4f8c2aef16aaa1ed268d253b13dd77396e6cb6da3108e2b2c3921ab`. `gzip -t` fails with `unexpected end of file`. Root's ACCEPTANCE-SCOPE decision marks this local container rejected with cause unknown and keeps the original receipt/archive unchanged. The raw check log SHA-256 is `b3d38538e0313fc9a904b4c07cad3e1ab1a3fa635925c32865419993cb018320`. The hosted CI archive passes independently; this lane does not infer a cause for the local discrepancy.

## Remaining global gates

This lane's evidence packet is complete. Overall milestone closure still depends on the six independent acceptance reviews, root's independent native scheduling audit, and reconstruction of the authoritative hosted archive from published delivery chunks with the exact expected hash. No commit, merge, deploy, or Git mutation was made by this worker.
