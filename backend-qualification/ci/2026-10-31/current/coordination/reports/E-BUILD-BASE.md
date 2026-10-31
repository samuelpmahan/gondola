# E-BUILD-BASE (N5): full contract base-reference repair

**Outcome: `mixed_change`.** Corrected the builder's truncated PR17 base reference and made the builder validate it against the full contract header before building. The new tests reject both the historical 39-character value and a different, valid-length SHA.

## Change

The prior E-BUILD builder stored `5662efcd7feb7920e4690d38cc76a297fed69d5` (39 hexadecimal characters). The contract declares `5662efcd7feb7920e4690d38cc76a297fed69d5a` (40 characters). [`build.mjs`](../../build/build.mjs) now uses the full value, checks its lowercase 40-hex format, parses the PR17 header from `backend-qualification/CONTRACT.md`, and rejects a mismatch before starting the build. The contract is now an explicit source pin because the builder reads it.

The new [`base-ref.test.mjs`](../../build/base-ref.test.mjs) has four tests: full exact match, truncated 39-character rejection, mismatched 40-character rejection, and malformed contract rejection. N3's XR-BUILD recorded the 39/40-character provenance mismatch and amended the prior review. The immutable sealed E-BUILD source copy at `seals/E-BUILD/source/build.mjs` remains SHA-256 `315a0d4f227ec99501b7eb4b4305ab16ed1c7a4a4659ace9975b36b584e66ad0`; this packet does not rewrite the E-BUILD report or receipt.

## Fresh build verification

Two fresh builder runs completed in separate output directories. Each React and DOM build contained 67 physical output files. The builder verified each manifest against the physical output tree, and both runs reported source pins matched before and after. The expanded live input set contains 87 entries because `backend-qualification/CONTRACT.md` is now pinned; the original sealed E-BUILD record still reports its historical 86 inputs.

Both runs reported the same React and DOM AppIR SHA-256 `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f`. Their freshly generated native traces match byte-for-byte at `bbf6db314e6f9f68802e0dd3d49b5216c4ed93db5696d9f9980055de12bced3d`. Each copied provenance record contains the full 40-character contract reference. The records and summary are preserved under [`rawlogs/E-BUILD-BASE`](../rawlogs/E-BUILD-BASE).

## Commands and results

| Command | Result |
|---|---|
| `/tmp/gondola-node22/node_modules/node/bin/node --check backend-qualification/build/build.mjs` and `--check backend-qualification/build/base-ref.test.mjs` | Both syntax checks passed. |
| `/tmp/gondola-node22/node_modules/node/bin/node --test backend-qualification/build/base-ref.test.mjs` | 4 passed, 0 failed. |
| `GOTOOLCHAIN=local GOBI_GO_BIN=/tmp/gondola-go/bin/go GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-node22/node_modules/node/bin/node backend-qualification/coordination/rawlogs/E-BUILD-BASE/run-two-builds.mjs` | Two fresh React/DOM build runs; each produced 67 files per backend, 87 source pins, equal React/DOM AppIR, and identical native traces. |

Toolchains: Node `v22.23.4`, native Go `go1.24.0 linux/amd64`, compiler Go `go1.27.3 linux/amd64`. Node emitted the environment's experimental `EnvHttpProxyAgent` warning. No Go application, compiler, renderer, qualification harness, sealed E-BUILD artifact, scheduler, or Git state was changed by this repair. Root's independent review of this repair remains pending.
