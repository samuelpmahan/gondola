# E-DELIVERY — mounted backend qualification

**Outcome: `mixed_change`.** N6 delivered the executable qualification runner, report viewer, HTTP smoke, and focused workflow. Root executed the final run at the exact candidate commit `77f7ce36439f1ae457a397269ea5a8c6d2db1cb2` (tree `3e297474ddcacb6cf2a66f54e50c701c6a689cc0`). All nine runner stages passed.

## Run result

The fresh N2 build produced 67 React and 67 DOM artifacts. Both AppIRs declare the five required capabilities (`view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, `effect.cancel`) and share AppIR SHA-256 `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f` and encoder SHA-256 `12b9b02389aee4493f724a181ec033f3e884d5559755dcb58b98ee6d02b872f9`. The fresh native trace is 50 source events and 45 Go updates (SHA-256 `bbf6db314e6f9f68802e0dd3d49b5216c4ed93db5696d9f9980055de12bced3d`).

The mounted matrix matched all 13 cases: three healthy profiles and ten activated renderer/event faults. Each healthy case completed all 50 events and 46 state checkpoints. Each fault activated exactly once; every case had zero infrastructure or page errors.

| Fault family | Go-required witness | Observed on both React and DOM |
|---|---|---|
| Text corruption | `dom` | `dom` |
| Key order | `dom` | `dom` |
| Enabled control | `disabled` | `dom`, `disabled` |
| Dropped click | any of `dispatch-count`, `trace-count`, `state` | `dom`, `dispatch-count`, `trace-count`, `state` |
| Duplicate click | `dispatch-count` | `dom`, `dispatch-count`, `trace-count`, `state` |

The Go certificate qualified all 13 rows (SHA-256 `017de67266181fb532f3a0373966cd0ebdc0a0517ae5c0457c1bcd4c38f4248c`). The existing baseline also detected all 16 captured-data mutation controls; these are separate from the ten mounted faults. The three normal browser profiles were React, DOM, and a healthy renderer swap. No WASM guard coverage failures were recorded (10 entries, status `complete`). No randomized seeds were used in this fixed scenario.

The demo was served over HTTP and passed all 12 browser smoke checks. It rendered all 13 actual cases, displayed the candidate source and Go verdict, and showed the pinned evidence for each case.

## Archive and source boundary

The explicit-inventory archive contains 397 members and is 2,443,344 bytes (SHA-256 `61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca`). Its manifest SHA-256 is `8adc8f345a5b66a6ea1fbb92fe9bd510d1682f4c37d4c76e8a0660e06ce30cb1`. The standalone archive consumer extracted and hashed all 397 members successfully. The archive, manifest, and 177 source pins remained unchanged across the post-command consumer check. All 87 N2 provenance source pins were present in the outer source boundary.

The run used Node `v22.23.4`, native Go `go1.24.0`, compiler Go `go1.27.3`, Chromium `153.0.8010.0`, Playwright `1.64.1`, React/React DOM `19.3.1`, and esbuild `0.28.2`. The focused Go tests passed; the focused Node suite passed 23/23 tests with no failures or skips.

The root invocation was:

```sh
PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH \
GOBI_GO_BIN=/tmp/gondola-go/bin/go CHROMIUM_PATH=/tmp/chromium GOFLAGS=-buildvcs=false \
bash run-backend-qualification.sh --source-commit 77f7ce36439f1ae457a397269ea5a8c6d2db1cb2
```

## Evidence and limits

- Runtime receipt: [`evidence/attempts/attempt-20261031T181327827Z-18/receipt.json`](../../evidence/attempts/attempt-20261031T181327827Z-18/receipt.json), SHA-256 `35b80cdf16756f242f9122bcd868f7a1fb78c1f1411c9f9224215923b6d7d312`.
- Runtime report: [`evidence/attempts/attempt-20261031T181327827Z-18/report.md`](../../evidence/attempts/attempt-20261031T181327827Z-18/report.md), SHA-256 `9385072673b62d9e06f2543fc215d3f8d2bca78cf9d6ee087d7e9d01cf066341`.
- Independent consumer result: [`evidence/attempts/attempt-20261031T181327827Z-18/independent-archive-consumer.json`](../../evidence/attempts/attempt-20261031T181327827Z-18/independent-archive-consumer.json), SHA-256 `4ed45d70ac7173b227498208f8ee586c25c4e3466f059f2240ccc366932597de`.
- N6 rawlog summary and focused command logs are under [`rawlogs/E-DELIVERY`](../rawlogs/E-DELIVERY/).

This finite profile covers the admitted React and DOM backends plus a healthy swap; it does not certify arbitrary third-party backends. The Go certificate validates measured report/evidence pairs and source identity, but cannot prove that a malicious producer did not fabricate browser evidence. This delivery run did not execute the inherited full regression chain or assert hosted CI/publication status; those remain separate root gates. No failures or semantic mismatches were recorded in this run.
