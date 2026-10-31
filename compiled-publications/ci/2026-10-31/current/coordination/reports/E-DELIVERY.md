# E-DELIVERY — typed keyed publications

## Result

The focused publications profile passed all eight integrated stages on source checkpoint C3. The runner generated a fresh native Go trace, built React and DOM output with the actual GoScript CLI, matched native/direct/browser captures against the literal oracle, served the demo over HTTP in Chromium, and created and independently consumed the per-attempt archive. The C3 runtime receipt reports no failed stages, failures, or mismatches; its 128 source pins matched before and after execution and archive verification.

This is focused local acceptance for the new publications profile. The inherited PR16 chain was not run locally. Full inherited CI remains pending and is not part of this result.

## Current run

Command: `bash run-compiled-publications.sh` from the repository root. The wrapper resolved Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node`, root Go `go1.24.0` at `/tmp/gondola-go/bin/go`, compiler Go `go1.27.3` via `GOTOOLCHAIN=go1.27.3`, and Chromium `153.0.8010.0` at `/tmp/chromium`. Other recorded versions were npm `11.9.0`, Playwright `1.64.1`, React/ReactDOM `19.3.1`, and esbuild `0.28.2`. Go commands used `GOFLAGS=-buildvcs=false`; the Node test stage passed `GOBI_GO_BIN=/tmp/gondola-go/bin/go`.

The C3 attempt was `attempt-20261031T165233358Z-35`. Its stages were all green:

1. Tool versions.
2. Focused Node host, oracle, conformance, seeded tests and focused Go fixture/CLI tests.
3. Fresh native scenario capture.
4. Fresh React and DOM GoScript builds.
5. Native/direct/browser conformance.
6. Demo build and HTTP smoke.
7. Source snapshot and post-command boundary.
8. Archive creation, round trip and independent consumer.

The native trace contains 50 scenario events, 45 Go updates and five host-only events across 46 state checkpoints. React and DOM each report 67 generated files. Their AppIR is byte-identical (24,682 bytes, SHA-256 `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f`) and their encoder is byte-identical (17,417 bytes, SHA-256 `12b9b02389aee4493f724a181ec033f3e884d5559755dcb58b98ee6d02b872f9`). The profile capabilities include `view.node`, safe integer and float64 numeric operations, request/reply effects, and cancellation. The generated React module is 550,516 bytes (SHA-256 `d1fecdc84cfa6fa911ef35c48bf973d65cb8e3baf9db2f70c4b975a2db1941ee`); the DOM module is 550,512 bytes (SHA-256 `829d768108a90e6a60ed071185d6ed7c77e9c2fb2ffa860e9ce853ca48835510`).

The conformance run matched the fixed capture in React, DOM, and swap profiles. It detected all 16 mutation controls. Three seeded schedules used seeds `20261031`, `20261032`, and `20261033`; seed `20261031` also ran mounted in the browser. The HTTP smoke passed all 20 checks, including typed input and lock behavior, stale revision rejection, publication queue survival across renderer swaps, rejected incompatible swaps, manual reply completion, cancellation and stale reply rejection, remount behavior, and disabled controls. All ten no-WASM guard hooks were installed and observable; no WASM request or API attempt and no uncaught page error was recorded.

The archive is `compiled-publications/demo/output/attempts/attempt-20261031T165233358Z-35.tar.gz` (7,651,878 bytes, SHA-256 `dde9b1916aa7772b6aa91c3cbacf33221f5dedfcc95bf3f7280c7bd5c69715f6`). Its external manifest is 67,498 bytes (SHA-256 `5cfa4ba17f92f627c7b9e22c8ff1452d2e483094443d4521a9b1d231ed16592a`). The archive contains 361 regular file members. The independent consumer passed after the producer command, verified every manifest member and reported 361 members. The archive and manifest hashes remained stable at the post-command boundary. A separate read-only inspection then rehashed the current 128 source pins, archive, manifest and consumer record; all matched the C3 receipt.

## Preserved failed attempts

- C1 stopped before stages while snapshotting sources because the runner required a nonexistent root `go.sum`; the root Go module has no external dependencies and no `go.sum` by design. The runner pin was corrected to omit that absent file. The failed log is preserved as `coordination/rawlogs/E-DELIVERY/checkpoint-c1-failed.log`.
- C2 passed versions, focused tests and fresh native capture, then stopped at the React/DOM build with Node's `Unknown encoding: buffer` error. The runner now uses `spawnSync`'s default Buffer output. Its failed receipt remains at `evidence/attempts/attempt-20261031T165014857Z-35/receipt.json`; its log is preserved as `coordination/rawlogs/E-DELIVERY/checkpoint-c2-failed.log`.
- C3 reran the focused profile after both fixes and passed. Its root orchestration log is preserved as `coordination/rawlogs/E-DELIVERY/checkpoint-c3-passed.log`.

These red attempts remain failures and are not counted as passing evidence. C3 is the only passing integrated publications attempt reported here. The full inherited CI result must be reviewed separately when it completes.

## Evidence

The immutable runtime receipt, report, stage command logs, native trace, build outputs, conformance captures, demo smoke, archive, and independent consumer are under `compiled-publications/evidence/attempts/attempt-20261031T165233358Z-35/` and `compiled-publications/demo/output/attempts/attempt-20261031T165233358Z-35/`. The post-run inspection is `coordination/rawlogs/E-DELIVERY/post-run-inspection.json`; it confirms all eight stage statuses, empty failure and mismatch lists, current source pins, and archive hashes. The pinned native `probe.py::validate_receipt` accepted E-DELIVERY/N6; its before/after scheduler state hashes match, and validation performed no scheduler mutation.
