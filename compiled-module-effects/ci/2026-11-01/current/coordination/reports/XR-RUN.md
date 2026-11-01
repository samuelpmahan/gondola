# XR-RUN — independent review of the negative E-RUN packet

**Worker:** N2  
**Job:** XR-RUN  
**Decision:** `accepted` — acceptance is limited to the accuracy of the negative report; E-RUN remains `insufficient_evidence` for clean delivery qualification.

## Review conclusion

The sealed E-RUN packet accurately records a clean source-bound attempt that stopped after the conformance producer succeeded and the outer N6 consumer failed. The producer result is real evidence of the four builds, test commands, and four-scenario/five-profile captures. It does not establish a completed delivery run: the aggregate command exited 1 before the timer demo, primary archive, independent archive consumer, final source-stability check, or prior PR22 keyed regression.

The exact failure is recorded in `failure.json`: `TypeError [ERR_INVALID_ARG_TYPE]`, “The `paths[0]` argument must be of type string. Received undefined,” at `compiled-module-effects/run.mjs:542:24` in `runConformance`. The saved public producer summary exposes native `path`, `bytes`, `sha256`, `command`, `commandCwd`, and `commandEnvironment`; it has no `stdoutPath` or `stderrPath`, which the outer consumer passes to `resolve()`. The N4 conformance command itself exited 0 and its summary/check are `matched`; the aggregate `run-module-effects.sh` command exited 1. I did not infer the missing fields or treat the child producer exit as aggregate success.

## Verified evidence

The E-RUN seal matches its report, receipt, and rawlogs index. All 79 indexed E-RUN rawlog entries match their byte and SHA-256 pins. The clean-run metadata records source commit/head `88e7937e66fd1c8f36e5b5dd3224209b07c6eb33`, tree `fb4a44ad63eea969f1ae655e2d58f531b56a94fe`, `dirty: false`, and 199 source pins with no mismatches. The three archived failure-source snapshots match their recorded pins.

The saved build index and integrity record show four actual React/DOM parent/child builds; all four build commands exited 0. Saved command and test records show 13 Go tests, one module ABI regression, four compiler analyzer tests (eight cases), one compiler Build-stage test, and passing Node tests. The full retained Node command lists five files and its output reports 32 passed, 0 failed, 0 skipped. E-RUN’s report/receipt also state four Node files and 21 tests; I preserve that separate subtotal while treating the saved five-file/32-pass command as the full Node inventory.

The N4 producer summary and check both report `matched`. The 28 saved scenario/native/profile files hash-check, covering four scenarios across five profiles each: 178 native events, 182 native states, 58 effects, 116 transport rows, 890 profile events, and 910 snapshots. All 16 capture controls and seven build-admission controls have unique IDs, array-matching totals, and rejected rows.

## E-DELIVERY cross-reference

E-DELIVERY’s sealed report and receipt remain unchanged. The current `source-pins-final.json` matches its preserved packet hash. The current 46,988-byte, 211-entry E-DELIVERY rawlogs index matches the copy saved in E-RUN; all 211 current indexed files match their individual pins. The preservation note explicitly says the exact pre-update E-DELIVERY index bytes were not retained and that no reconstruction is claimed. The updated-index snapshot and preservation note are both preserved and hash-verified.

M0 and counter regression evidence remains separate in the E-REG `confirmed_reuse` receipt. I did not rerun or duplicate it.

## Boundary and limits

The aggregate report correctly remains `insufficient_evidence`. No timer/demo or keyed run occurred, and the declared aggregate archive path does not exist. This review did not rerun the producer, execute a delivery command, query Git, or alter source, report packets, scheduler state, or artifacts. N6’s consumer-contract repair and a future clean run remain separate work.

Commands, pins, and the read-only audit output are indexed at `rawlogs/XR-RUN/index.json`.
