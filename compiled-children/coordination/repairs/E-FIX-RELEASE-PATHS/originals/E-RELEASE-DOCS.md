# E-RELEASE-DOCS (N4): reproduction guide and evidence boundary

**Outcome: `mixed_change`.** Updated the two assigned release documents with a reproducible full-run path, native trace command, renderer/capability integration contract, bounded scope, and explicit historical-versus-pending evidence distinction. The exact-source full acceptance run remains pending; these docs do not report final acceptance.

## Changes

- `compiled-children/README.md` now describes the parent plus keyed collection contract, toolchain and locked dependency setup, full-only runner and output locations, native trace command, demo access, and steps for a new renderer backend. It records that app state stays in Go and that no compiler production change was required for this fixture.
- `compiled-children/RESULTS.md` identifies attempt 12 and the author 31/31 smoke as historical captures, lists the finite fixture/seed metrics with their limits, explains current repair/review gates, and records the compiler-reuse and custody findings without asserting a fresh integrated pass.
- The original README and results document were left untouched in `coordination/repairs/E-RELEASE-DOCS/originals/`.

## Read-only checks

Relative Markdown links resolve, `git diff --check` passes for the two owned docs, and `bash -n run-compiled-children.sh` passes. The exact commands and outputs are preserved in [`static-review.log`](../rawlogs/E-RELEASE-DOCS-20261031/static-review.log). No Go build, Node test suite, browser replay, demo smoke, full runner, or CI run was launched for this documentation task.

The runner includes both docs in its source pin list. Their hashes below are the documentation freeze values; the next full-run receipt must capture them and no further doc edits should occur during that run.

| File | SHA-256 |
| --- | --- |
| `compiled-children/README.md` | `d599a2e235df8d60b453debc6633000dc2bf71309b96fe4caec0274ce6ca84f1` |
| `compiled-children/RESULTS.md` | `9361f41000071ea4302a116d533a8635a619e4b8ae8749168133c4c97af22cf0` |

See [`E-RELEASE-DOCS.json`](../receipts/E-RELEASE-DOCS.json) for byte counts and source/evidence hashes.
