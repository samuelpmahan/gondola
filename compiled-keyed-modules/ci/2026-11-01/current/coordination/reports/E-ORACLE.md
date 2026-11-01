# E-ORACLE — N5 independent semantic oracle

## Outcome

**mixed_change.** Added an independent, bounded keyed-module semantic model and capture checker under `compiled-keyed-modules/oracle/`. The checker first validates native Go output against its own transition model and fixed literal expectations, then compares each real direct/browser capture with those native Go snapshots and trees.

I replayed the final N4 captures from disk after the oracle source settled. The literal case and all three seeded cases matched. For the literal capture, all 11 capture mutations were rejected after a healthy baseline check. The actual E-BUILD-final index passed its source/artifact audit, and all 17 build/helper identity mutations were rejected.

## What the checker validates

- Literal intent, event metadata, accepted/rejected dispatch, derived messages, publications, and source-event references. The first 18 literal transitions have independent expected states and order; seeded suffixes are checked through the independent model.
- Parent state including step, lock, input revision and publication fields; both controller slot records including generation, mounted status, tombstone publication values, `first`, `second`, and `childCount`; ordered per-child generation, input, child state and keyed publication.
- The native Go parent and child `NodeRecord` trees, including handler messages/arguments and disabled controls. Direct React/DOM trees are compared to native snapshots; browser React/DOM/swap trees are compared along with non-null physical DOM captures.
- Capture scenario name and embedded scenario, SHA-256 of the serialized scenario, seeded identity, capture profile, backend, and module-build backend. Unit controls reject wrong scenario, seed, hash, and direct/browser backend claims.
- Stale callbacks and publications for retired `a:g1` before and after `a:g2` mounts: each must be suppressed before any ABI bridge/module call, with unchanged call counts. Browser checkpoints require the same key/generation and physical child nodes through reorder, retained `b:g1` after removing `a`, new `a:g2` identity after remount, stable logical Go child instances across renderer swaps, and replaced renderer-owned DOM nodes.
- Both separately compiled React and DOM parent/child pairs, including exact build package/component/backend, module ABI, AppIR, helper bytes, descriptor bytes, Go fixture source, and emitted GoScript source pins. The build mutation suite also flips descriptor source identity and reachability claims.

## Actual capture matrix

All data below is from the N4 `run-final` capture bundle, not generated fixture output. Each direct and browser profile was independently compared with actual native Go snapshots.

| Scenario | Events | Native snapshots | Direct captures | Browser captures | Result |
|---|---:|---:|---:|---:|---|
| `keyed-modules-literal` | 18 | 19 | React + DOM | React + DOM + swap | matched |
| `keyed-modules-seed-20261101` | 36 | 37 | React + DOM | React + DOM + swap | matched |
| `keyed-modules-seed-20261102` | 36 | 37 | React + DOM | React + DOM + swap | matched |
| `keyed-modules-seed-20261103` | 36 | 37 | React + DOM | React + DOM + swap | matched |

Totals: four native scenarios, eight direct captures, and twelve browser captures. Seeds were exactly `20261101`, `20261102`, and `20261103` (18 generated suffix clicks per seed). E-HARNESS reports the browser captures as programmatic `HTMLElement.click()` dispatch, not trusted pointer/OS input.

## Mutation results

**11/11 actual-capture controls detected**, run only after healthy native and parity checks passed:

1. sibling counter isolation;
2. reset affects only its target;
3. reorder preserves keyed state;
4. removal retains a generation tombstone;
5. remount increments the generation;
6. stale callback is fenced;
7. stale publication is fenced;
8. direct React tree mutation;
9. omitted browser DOM evidence;
10. renderer swap loses logical instance identity;
11. renderer swap incorrectly reuses physical DOM nodes.

**17/17 actual-build controls detected** after the E-BUILD-final audit. They cover helper sidecar/descriptor bytes; build backend/package/component identity; module ABI/AppIR/source identity; and descriptor backend/package/component/ABI/AppIR/source/reachability identity. The exact IDs and rejection diagnostics are in `rawlogs/E-ORACLE/actual-replay.json`.

The separate Node unit suite passes 2/2 tests. Its synthetic fixtures exercise three native-state mutations, eleven parity/capture mutations, and five metadata mismatch assertions (scenario name, scenario hash, seed, direct backend, browser backend). These synthetic checks are reported separately and are not counted as actual-capture controls.

## Commands and versions

Oracle syntax check:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-keyed-modules/oracle/oracle.mjs
```

Oracle unit tests:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-keyed-modules/oracle/oracle.test.mjs
```

Independent replay of the actual saved N4 captures and actual E-BUILD-final index:

```sh
/tmp/gondola-node22/node_modules/node/bin/node ../keyed-module-coordination/rawlogs/E-ORACLE/actual-replay.mjs
```

The replay reads the saved `run-final` artifacts, checks each scenario, and writes `actual-replay.json`; it does not synthesize successful capture output. N4 generated those captures with:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-keyed-modules/conformance/run.mjs \
  --native-go /tmp/gondola-go/go/bin/go \
  --build-index compiled-keyed-modules/build/output/E-BUILD-final/build-index.json \
  --chromium /tmp/chromium-portable \
  --output ../keyed-module-coordination/rawlogs/E-HARNESS/run-final \
  > ../keyed-module-coordination/rawlogs/E-HARNESS/run-final.stdout.log \
  2> ../keyed-module-coordination/rawlogs/E-HARNESS/run-final.stderr.log
```

Tool versions: oracle Node `v22.23.4`; native Go `go1.24.0 linux/amd64`; compiler Go `go1.27.3 linux/amd64`; GoScript `v0.6.2`; Chromium `153.0.8010.0`. The runner/browser details and native command rows are retained by E-HARNESS. Node emitted an `UNDICI-EHPA` experimental `EnvHttpProxyAgent` warning; checks still exited 0.

## Evidence pins

- Oracle source `compiled-keyed-modules/oracle/oracle.mjs`: 63,729 bytes, SHA-256 `0c5264035ff00099b0da57209fb38b773a7dce7f0a88e84f3fa36b3724912be8`.
- Unit suite `compiled-keyed-modules/oracle/oracle.test.mjs`: 16,972 bytes, SHA-256 `ccbb62a2dfafcdf8b003d6a7613fc5dcea028e66e5ad8fe3e3e77b8d1cca779f`.
- Fixed expectations `compiled-keyed-modules/oracle/expectations.json`: 3,794 bytes, SHA-256 `9dd927de69b9a1be9349545ab2720dc57f3750eddfb201b0235f1a33027b7ba9`.
- E-HARNESS summary `rawlogs/E-HARNESS/run-final.summary.json`: SHA-256 `b8fa47c2f57c4b011312607cdf3cc029c3c583c9af4bdd99ff68eddc1a48dde1`; check receipt SHA-256 `78f374a187e2b2003b76c66d5a8e89576fa7e4c390ba5d2dd051c972b96850b2`.
- E-BUILD-final index: 84,891 bytes, SHA-256 `75df29c02218fab47294454bb0338a720d806901d64377b4cae024fd4f6a2e66`.
- The per-scenario scenario/native/direct/browser SHA-256 and byte-length pins, actual control IDs, build helper/descriptor/ABI pins, exact replay output, and command logs are in `rawlogs/E-ORACLE/actual-replay.json` and `rawlogs/E-ORACLE/`.

## Failed attempts and limits

The initial test-first run failed with `ERR_MODULE_NOT_FOUND` for the not-yet-created oracle module; this was the expected red phase before implementation and is retained in `rawlogs/E-ORACLE/attempts.json`. A delivery diagnostic also stopped at its source-pin guard while the oracle was being tightened to validate capture backend and scenario hashes. That attempt is excluded from acceptance; N6 retained its failure record. The frozen hashes above were tested by the successful replay and unit run.

The demonstrated profile is two keys (`a`, `b`) and bounded synchronous transitions. No asynchronous-effects behavior is claimed. `Children` is AppIR-reachable; `ReceiveKeyed` and `IsCurrent` are exported GoScript helpers bound by byte/source pins, but are not admitted by the unchanged shared AppIR reachability analyzer. No claim is made that the analyzer proves reachability for those helper functions.
