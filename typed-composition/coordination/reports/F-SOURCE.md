# F-SOURCE — accepted-full source and build provenance audit

## Decision

**Supported.** The accepted-full execution record, report, before/after pin captures, and current content of all 49 pinned paths agree. The run record is internally consistent with its 0-exit status and report hash. This supports the accepted-full proof's source/build provenance for the captured worktree; it does not bind that proof to a future Git commit.

## Accepted execution evidence

The saved `accepted-full-execution.json` records `node typed-composition/check.mjs --seeds 20261030,20261031 --cases 30 --max-actions 40 --output typed-composition/build/accepted-full-report.json` from the repository root, status `passed`, exit code 0, and UTC interval `2026-10-30T20:06:53.662402Z` to `2026-10-30T20:10:29.389891Z`. Its log digest equals the current `accepted-full.log` digest.

The accepted report says `matched`, with 63 scripts, 2,463 actions, 63 native replay executions, 2,463 native frames, 4,926 candidate/reference frame comparisons, zero mismatches, and five mutation/lifecycle controls in their expected states. The report's source pin count is 49.

## Pin verification

I recomputed SHA-256 for every path in `accepted-full-before.json` and compared each current file to the before capture, the report's `sourcePins`, and the after capture's `afterPins`:

- Pin entries: 49
- Current paths found and rehashed: 49
- Current differences: 0
- Before/report/after maps: equal
- After capture flags `sourcePinsUnchanged` and `reportPinsMatchBefore`: both true

The aggregate digests use different serialization orders, not different pin values. The independent capture's `sortedSHA256` is `eabf5436702bac38735e85cf486cb125d32a57e52c79ef8195d6bf926cfe0acb`; it matches the before and after records and is reproducible as SHA-256 of Python's default `json.dumps(pins, sort_keys=True)` bytes. The checker report's `sourceSetSHA256` is `ad5ddea05a4b5eecc3089f2b5cd297106e6f12b271593ec373334f55f0bde057`; it is reproducible as SHA-256 of `JSON.stringify(report.sourcePins)` in the checker-declared path order. Since the 49 path-to-hash entries compare equal, the different digests reflect different JSON serialization order/format rather than a content discrepancy.

## Toolchain and binary provenance

The accepted report records Go `go1.24.0 linux/amd64`, Node `v22.23.4`, Chromium `153.0.8010.0`, React `19.3.1`, and React DOM `19.3.1`. Read-only version queries at audit time returned the same versions. The execution receipt records `GOTOOLCHAIN=local` and `CHROMIUM_EXECUTABLE_PATH=/tmp/chromium`; the report and current React package metadata agree with the recorded browser/library versions.

The reported replay executable is `/workspace/scratch/39a56936f173/gondola/typed-composition/build/composition-replay`. Its SHA-256 is `38d42d71fb2d3ed301ea7cf13ae527306063234bd3ad6cb6e494262ba19309a3` in the before capture, report, after capture, and current file. The current file is an executable, statically linked x86-64 ELF. The report records its exact path and `ensureNativeBinary` falls back to that same build path when `COMPOSITION_REPLAY_BIN` is unset.

One capture limit remains: `accepted-full-execution.json` records the command as `node ...` and filters environment capture to selected variables; it does not preserve `PATH`, an absolute Node/Go executable path, or `COMPOSITION_REPLAY_BIN`. The report records observed Node/Go versions and the replay path, and the command's default replay path is the pinned executable, but the supervisor receipt alone does not bind those executable paths. No rebuild command is recorded as part of this accepted replay; the pinned binary and browser assets pre-existed the run and remained byte-identical.

## VCS and publication boundary

At this audit, the repository is on branch `codex/gobi-typed-composition-20261030` at HEAD `d6d425765ee9d48eae22342a3cb75fab2e2871ba`. The worktree is dirty with 15 status entries (9 tracked modifications and 6 untracked entries). The accepted-run artifacts pin file contents, not the Git tree or commit ID. Thus, the supported provenance statement applies to the captured worktree content only; a future published commit has not been verified here and must be checked against these pins if publication changes the tree.

## Artifact hashes and scope

- `accepted-full-before.json`: `6b8f2624f749bf3598ebd53e23e17ad1dbd28983825331ab0c2a07454d6b4cbd`
- `accepted-full-after.json`: `7ce59a8e27ef386e2e2ad503e27e1b4770bf19839537d34c7b661861a9027b88`
- `accepted-full-report.json`: `6944e09e7ef7af2ea492799d701f0ee7fa830a3702bfbcdb7bf743c7537dbd01`
- `accepted-full-execution.json`: `20f9f8eab697797b5675977ef17fcb18f5fdbd4d4b75156b7d95b1769a3e77fd`
- `accepted-full.log`: `a737e35a019b7d2db9c6f2014984a87e64a50dee7ccae9db9e313ac27c17e6c3`

This is a read-only source/build and execution-metadata audit. I did not rerun tests, replay, or the inherited runner. Raw trace shard correctness and coverage are the separate F-DATA audit scope.

## Receipt schema correction

The initial receipt used `outcome: "supported"`, which is outside the accepted outcome enum. The receipt now records `outcome: "confirmed_reuse"` and `validationStatus: "supported"`. The earlier report findings and decision remain unchanged; this is a schema-only correction. No checks or replay were rerun.
