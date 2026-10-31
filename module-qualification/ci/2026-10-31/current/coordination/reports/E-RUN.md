# E-RUN — fresh published-source acceptance

**Outcome: passed.** The full module-qualification wrapper completed with exit code 0 on the clean, frozen source commit `4395d41ade7e4196878b6885d4c46dd4d8ec85f1` (tree `5835ca66f5c4903c711e04aa7e8d14212632bc3a`). Its final source check reported the same HEAD, a clean working tree, and unchanged source pins. No source files were changed for this run.

## Command and toolchain

```sh
PATH="/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH" \
GOBI_GO_BIN=/tmp/gondola-go/go/bin/go \
GOBI_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node \
GOBI_PYTHON_BIN=/tmp/rebalancer-env/bin/python \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium-portable \
bash run-module-qualification.sh \
  --source-commit 4395d41ade7e4196878b6885d4c46dd4d8ec85f1 \
  --chromium /tmp/chromium-portable
```

The run used Go 1.24.0 linux/amd64 for verification, Go 1.27.3 linux/amd64 for the GoScript compiler, Node v22.23.4, Python 3.12.14, and Chromium 153.0.8010.0. The runner’s compiler environment recorded `GOTOOLCHAIN=go1.27.3` and `GOFLAGS=-buildvcs=false`.

## Results

- Fresh producer profile: matched; 24 fixed events, 16 Go updates, 17 state checkpoints; 3 seeded runs (`20261031`, `20261032`, `20261033`) with 40 events each; 12 mounted browser profiles; no browser page errors.
- ABI qualification: 4 builds and 2 parent/child pairs passed.
- Native capture checker: 12 profiles, 144 events, 99 Go updates, 3 seeds. All 10 named actual-capture mutations were detected; no tests failed or skipped. The producer’s separate offline controls detected 6 additional captured-data mutations.
- Go directory and archive verification both passed against the current run. The inner runtime archive has 529 members, 6,376,501 bytes, and source commit `4395d41ade7e4196878b6885d4c46dd4d8ec85f1`.
- `bash run.sh` passed the inherited M0 checks, including “same over 5000 inputs”, receipt matching, and `SHA256SUMS ok`.
- `bash run-interaction.sh` passed the counter regression: 107 scripts, 4,473 initial/action ticks, seed `20261030`; eight Node tests passed.
- Portable tool-resolution tests passed 4/4.

## Evidence archives

The verifier bundle is [module-qualification-evidence.tar.gz](/workspace/scratch/39a56936f173/gondola/module-qualification/output/attempts/attempt-20261031T230513555Z-8/module-qualification-evidence.tar.gz): 6,616,802 bytes, SHA-256 `98a1c68ed0c2453775a4e069482256b186f6446af40dd3ec0c7837d116914e9e`, 123 regular-file members, 8,509,794 expanded bytes. Its manifest SHA-256 is `e7567785384c06242aee247026de57245ba68c26fc9f9d5de2c3f72359c092f2`. The bundle index records 121 indexed members plus the index and execution snapshot. The verifier source closure contains 43 Go files; the run hashed 529 verifier inputs.

A separate standard-library Python consumer verified the outer archive hash, manifest, exact member set, lengths, and SHA-256 digests, including the embedded upstream runtime archive and its hash-pinned files. It passed with 123/123 outer members and 529 reported source inputs. The consumer result is `rawlogs/E-RUN/outer-consumer-retry.stdout.json`.

## Command inventory timing

The archived summary’s `commandCount: 18` is correct for the immutable bundle. The archive contains exactly 18 command records, all with exit code 0. The attempt directory has 20 records because `git-final-head` and `git-final-status` were recorded after archive creation. Their exact command records and stdout/stderr bytes were copied to `rawlogs/E-RUN/finalization/postarchive-git-checks/`; all six copied files are hash-listed in the passing `command-inventory.json`. This timing difference does not indicate an archive mismatch.

The first independent-consumer attempt failed its own expected-name assertion: it double-prefixed paths, although both actual and expected member counts were 123. The corrected consumer passed. An initial command-inventory checker also looked for an evidence manifest inside the tar even though the manifest is external; that checker failed before emitting a result. Its corrected version reads the archived summary, verifies 18 archived versus 20 directory command records, and passes. These were diagnostic-script errors, not producer or verifier failures; their original scripts and logs remain preserved.

## Scope

This is a finite Go-verified qualification of the frozen React/DOM parent-child module profile and its 12 recorded fixed/seeded browser profiles. It does not claim arbitrary frontend qualification, immunity to a malicious evidence producer, or a browser launch by the Go consumer. Hosted CI and an independent offline rebuild consumer remain separate acceptance evidence.

## Raw evidence pins

- Runner summary: SHA-256 `4165398faaabee7d0fb9e434979efc8f0e79cd54a22821de6fedfaa29ee82424`.
- Raw runner stdout: SHA-256 `87b0e1e957fa11f842c56bb1c388b18f9d7a498994aa8198d53e47dffbe95436`.
- Evidence manifest: SHA-256 `e7567785384c06242aee247026de57245ba68c26fc9f9d5de2c3f72359c092f2`.
- E-RUN raw-log inventory: 30 files, SHA-256 `557776cf1ce1e6d58ba51864353641681b1ecaf3660ddcd11d83a9ea5f951f17` at `rawlogs/E-RUN/rawlog-index.json`.
