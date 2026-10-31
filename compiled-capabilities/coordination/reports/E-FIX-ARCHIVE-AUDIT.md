# E-FIX-ARCHIVE-AUDIT: verifier repair

**Worker:** N5  
**Outcome:** `mixed_change`  
**Status:** repair implemented; no actual full-run archive accepted

## Changes

Updated only `compiled-capabilities/coordination/acceptance/archive/` and
created this repair report and its receipt. The original E-PREP-ARCHIVE and
XR-PREP-ARCHIVE report/receipt files are preserved unchanged.

- Complete verification now requires every command in the immutable
  pre-archive ledger, the embedded pre-archive receipt, and the final outer
  ledger to have `exitCode: 0`, with no signal or command error.
- Snapshot state must be `archive_pending`; outer snapshot metadata must carry
  that same status. The other pending labels remain checked. The embedded
  pre-archive receipt must have the E-BUILD schema/job identity, full mode, and
  `running` status.
- Complete mode validates Node 22, root Go 1.24.x, compiler Go 1.27.3, React
  and ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2 in the installed
  and locked maps. It requires the three package-lock hash pins to match their
  `sourceBefore` rows. If `fast-check` or `fastCheck` is present in the runner's
  version maps, both installed and locked values must be 4.10.2.
- Tar validation rejects a regular file that occupies a directory path or a
  parent path, including the `react` file plus `react/` directory collision.
- `--self-test` now runs two valid fixtures and 20 named mutation fixtures.
  Each rejection fixture checks the expected verifier failure reason, so it
  cannot pass because of an unrelated archive error.

The current runner records the root `package-lock.json` hash, and that file is
bound to `sourceBefore`; the lock declares `fast-check` 4.10.2. The runner does
not record an installed fast-check version, so this verifier does not claim
that installation was independently observed. Toolchain and dependency checks
validate declared metadata consistency and its source-pin linkage; they do not
authenticate arbitrary mutually forged execution records.

## Verification

| Command | Result | Evidence |
|---|---|---|
| `PYTHONDONTWRITEBYTECODE=1 python3 -c 'import ast,pathlib; ast.parse(pathlib.Path("compiled-capabilities/coordination/acceptance/archive/verify_archive.py").read_text()); print("syntax parsed")'` | Passed | `acceptance/archive/repair-logs/syntax.log` |
| `PYTHONDONTWRITEBYTECODE=1 python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --self-test` | Passed; 2 valid fixtures and 20 mutation cases | `acceptance/archive/repair-logs/self-test.log` |
| `PYTHONDONTWRITEBYTECODE=1 python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --receipt compiled-capabilities/coordination/receipts/E-BUILD.json --root . --require-complete` | Expected exit 2: `outer receipt is missing archive metadata` | `acceptance/archive/repair-logs/no-full-archive.stderr.log` |
| Runner dependency declarations and lock entries inspected read-only | Node 22 / Go 1.24.x / compiler Go 1.27.3 guards present; root lock declares fast-check 4.10.2; interaction and frontend locks declare the pinned React, Playwright, and esbuild versions | `acceptance/archive/repair-logs/runner-contract-values.json` |

The reviewer counterexamples now reject for their intended reasons: nonzero
pre-archive and final archive commands; Node `v18.0.0`; installed/locked React
mismatch; snapshot and outer snapshot status set to `passed`; and the
file/directory collision. Additional checks cover command signals/errors,
embedded receipt schema/status/mode, required tool versions, lock hash/source
pin agreement, and conditional fast-check metadata.

## Limits and preserved evidence

No actual final E-BUILD archive or bound manifest exists in the current author
receipt, and the final CLI probe failed closed on that missing input. This is a
bounded verifier repair, not a full archive acceptance result.

`E-PREP-ARCHIVE.json` and `XR-PREP-ARCHIVE.json` remain historical records for
the pre-repair verifier. Their old verifier source hash identifies that
version; this repair receipt records the new source hash. The original reports
and receipts themselves were not rewritten. No N6 runner, M0 input, state,
dependency lockfile, Git state, commit, merge, or deployment was changed.
