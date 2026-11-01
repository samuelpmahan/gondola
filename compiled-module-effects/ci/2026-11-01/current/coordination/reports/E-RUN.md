# E-RUN — Clean E-DELIVERY qualification attempt

**Outcome:** insufficient_evidence  
**Status:** stopped_on_runner_consumer_schema_mismatch  
**Phase:** clean Git-bound qualification attempted; full delivery qualification did not complete.

## Source and command

The run used a clean checkout at commit 88e7937e66fd1c8f36e5b5dd3224209b07c6eb33, tree fb4a44ad63eea969f1ae655e2d58f531b56a94fe. The runner recorded dirty=false and sourcePinsMatch=true.

Command:

    GOBI_GO_BIN=/tmp/gondola-go/go/bin/go GOBI_NODE_BIN=/tmp/gondola-node22/node_modules/node/bin/node GOBI_PYTHON_BIN=/tmp/rebalancer-env/bin/python bash run-module-effects.sh --source-commit 88e7937e66fd1c8f36e5b5dd3224209b07c6eb33 --chromium /tmp/chromium-portable

Tool versions were Go 1.24.0, compiler Go 1.27.3, Node v22.23.4, Python 3.12.14, Chromium 153.0.8010.0, Playwright 1.64.1, and GNU tar 1.35.

## Completed checks

Four independent builds completed. Native fixture Go tests passed 13 tests across two packages; the module ABI regression passed 1; compiler tests passed 4 analyzer tests (8 cases) and 1 Build-stage test; four Node test files passed 21 tests.

The N4 conformance command exited 0. Its producer summary and check both reported matched. It produced all four scenario tapes and all 20 direct/browser profile streams: 31 literal events and 49/50/48 events for seeds 20261104/05/06, 178 source events overall, 182 native states, 58 effects, 116 native transport rows, 890 profile event rows, and 910 snapshots. The N4 summary reports all 16 required capture mutation controls and all 7 build admission controls rejected.

These are producer results. The N6 delivery runner did not finish validating and incorporating the producer output.

## Stop reason

The N6 consumer failed in runConformance at compiled-module-effects/run.mjs:542 while resolving record.native.stdoutPath. The current public N4 summary shape for each native record is path, bytes, sha256, command, commandCwd, and commandEnvironment; it does not expose stdoutPath or stderrPath. Although the conformance attempt wrote native stdout log files, the N6 consumer could not find their paths through its expected summary fields. The N6 process exited 1 before the timer demo or archive stage.

This receipt records the concrete producer/consumer contract mismatch without treating missing metadata as permission to skip the native output checks. Root will assign a separate N6 contract-repair packet, including a full consumer-chain audit and focused tests, before another author run.

## Not reached

No actual timer/browser demo smoke ran; no renderer-swap or remove/remount browser actions were exercised in this clean attempt. No primary archive or manifest was produced; the independent archive consumer and final source-stability stage did not run. The prior PR22 keyed regression was not started after the aggregate failure. M0 and counter results remain in E-REG (295-input isolated copy); that precommit evidence is separate and requires final Git binding.

## Evidence and cross-reference

The full clean attempt failure witness, source pins, command records, build/test metadata, matched N4 summary/check, and all scenario/native/profile captures are indexed at ../rawlogs/E-RUN/index.json and ../rawlogs/E-RUN/attempt-01-clean-run/index.json. The primary archive was not produced. Four regenerable browser bundles and duplicate native stdout files are omitted from this copied witness, with exact pins recorded in the attempt index.

This witness was first copied under E-DELIVERY rawlogs before the E-RUN packet was opened. It is copied here and cross-referenced; the E-DELIVERY report and receipt remain unchanged. The earlier byte-identical E-DELIVERY rawlogs index was not preserved before it was appended with clean-run data. Root has been notified; the current E-DELIVERY index is identified as the updated index in the E-RUN evidence index.
