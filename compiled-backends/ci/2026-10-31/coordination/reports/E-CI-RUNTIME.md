# E-CI-RUNTIME

**Outcome: confirmed reuse.** The fresh full compiled-backends push run passed on the final source head. The runtime and runtime-test files are unchanged from the reviewed R-OBSERVATION implementation, their hashes match both CI `sourceBefore` and `sourceAfter` pins, and the runtime tests passed as part of the 97-test Node run.

## Primary immutable CI evidence

The acceptance input is the successful full push workflow, not the earlier pending run on `832d212…` and not the separately tracked synthetic PR run. Primary provenance records source head `195c9433179218348d4b9f2477ae1e0725337d15`, source tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`, direct parent `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`, run `41155530877`, event `push`, job `124401386239`, status `completed`, conclusion `success`, and artifact `13025112465`.

The artifact ZIP is 14,931,201 bytes with SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`. The retained extraction has 817 indexed files. The root-provided provenance binds the artifact digest and job checkout; the job log independently shows checkout commit `195c943…`, the complete `bash run-compiled-backends.sh` step, and the artifact upload. The run metadata selects this successful full current-source push as the primary audit input. The PR run `41155534356` remains separately tracked, so this report does not infer its status or claim the overall PR-ready gate.

## Runtime source and test pin

The fresh audit worktree is at commit `195c9433179218348d4b9f2477ae1e0725337d15`, tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`. The runtime source is SHA-256 `dcc4af98eccceda5b2975e1310cf535fad2a14ec3a21b4db61094d267d2067a4`; the runtime tests are `39790809f3392bb47b3f48d17bfdc40b6fe8628961513f0b1ddf3e69a014e907`. Both match `sourceBefore` and `sourceAfter` in the compiled-frontend and compiled-backends execution records. The final managed-Chromium repair is a later commit; these two runtime files remain byte-identical to the previously reviewed source.

## Runtime test result

CI ran the combined frontend Node suite using Node `v22.23.4`:

```sh
/opt/hostedtoolcache/node/22.23.4/x64/bin/node --test \
  /home/runner/work/gondola/gondola/compiled-frontend/frontend/dom/renderer.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/frontend/react/bindings.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/frontend/react/renderer.browser.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/frontend/react/renderer.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/frontend/runtime/runtime.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/browser-options.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/check.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/compare.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/direct-js.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/dom-oracle.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/fixture-expectations.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/list-growth.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/no-wasm.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/observed-action.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/provenance-order.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/provenance.test.mjs \
  /home/runner/work/gondola/gondola/compiled-frontend/conformance/trace.test.mjs
```

The immutable [`node-tests.stdout.log`](../../extracted/compiled-frontend/artifacts/logs/node-tests.stdout.log) reports **97 passed, 0 failed** and has SHA-256 `60fbc3b138975258c1ba4b3c0c597bdebe05aaa78d6a89364e0741f4d19a8269`; stderr is empty. The runtime file contributes subtests **71–97 (27/27)**. That block includes cached-view replacement without an application Update/tick, retired-renderer callback fencing, focus return validation, replacement admission and post-teardown failures, rejected Promise handling for update/observation/unmount, and queued completion plus unmount cancellation.

## Full-run runtime and lifetime evidence

The compiled-frontend execution record is `status: passed`, `mismatches: 0`, with 33 child commands and no nonzero exit codes. The compiled-backends execution record is `status: passed`, `sourcePinsMatch: true`, with 18 orchestrator commands, no command failures, and the same runtime/test source pins before and after. The CI run/job conclusion is successful. Tool versions recorded by the run: Node `v22.23.4`, compiled Go `1.27.3`, root Go `1.24.13`, React and React DOM `19.3.1`, Playwright `1.64.1`, and managed Chromium `156.0.8078.4`.

All five browser conformance checks report `matched` against the run's direct and native evidence. Their summaries contain 43 logical ticks, 37 swaps, 9 focus swaps, and 45 mutation controls detected:

| Fixture | Ticks | Swaps | Focus swaps | Mutation controls |
|---|---:|---:|---:|---:|
| Counter | 5 | 4 | 0 | 8 |
| Form | 10 | 9 | 1 | 10 |
| Keyed list | 11 | 10 | 5 | 8 |
| Effect | 5 | 3 | 2 | 11 |
| List growth | 12 | 11 | 1 | 8 |

Each browser profile reports no page errors and both the physical root and renderer snapshot empty after unmount. The keyed-list browser capture retains focus and selection on the same keyed node after reorder; it also records one detached stale callback. The effect capture records one correlated request and completion; a duplicate completion is rejected while the application tick count remains at five. Raw per-profile data and the matched conformance summaries are in the immutable artifact extraction under `compiled-frontend/artifacts/{counter,form,list,effect,list-growth}.browser.json` and `compiled-backends/artifacts/conformance/*.json.check.json`.

## Scope and limits

No runtime source or test changes were needed for this final CI gate. The successful full push confirms the already-reviewed runtime in the pinned full source tree and the browser integrations exercised by that workflow. This runtime receipt covers the primary push run and its artifact only. It does not assert the separate synthetic PR-run conclusion, remaining current-head workflow statuses, merge readiness, or deployment; root's combined PR-ready gate owns those decisions. The local checks recorded in [the historical source audit](../../lanes/runtime/source-audit.md) are supplementary; the outcome here is based on the immutable run/artifact above.

## Evidence digests

- Primary provenance: `primary-provenance.json`, SHA-256 `120e2b58bb5c6bf2f718b1be948c6db122be9e88e9c3a2c9e3aa982343757f2b`.
- Primary run metadata: `primary-run.json`, SHA-256 `f40729d52a01c052e75799e1688a7810355b845fdd25433e424a80911f46993e`.
- Primary job metadata: `primary-jobs.json`, SHA-256 `1a0100c3b88b24aae2a21681c125f97ac099ac39ea7c05a3c490f3257b3592a6`.
- Artifact metadata: `artifact.json`, SHA-256 `29e72f66887c1edc981fea426a65dc4a60976549dbfd7310b330c8f52a2930a4`.
- Retained-file index: `retained-index.json`, SHA-256 `7b621030d9d9576db534905af653c62b7a518b344c0dfd0e16f1a96a64e03826`.
- Full workflow job log: `logs/124401386239.log`, SHA-256 `c647178d63605521abb5c60ae780703cec06a6e9137dcd22b39b2f10d28d7bcb`.
- Compiled-frontend execution record: extracted `compiled-frontend/artifacts/execution.json`, SHA-256 `29be76274bceac28e5df142de9aea4419941d330d26f8f5d9de3a747474efc3a`.
- Compiled-backends execution record: extracted `compiled-backends/artifacts/execution.json`, SHA-256 `6abb89ef41972c790ee95e0248c141944f97a55fbe4b9cd7d29fa78adc90907e`.

The earlier `832d212…` source audit in this lane is retained as historical evidence. Its final pending status was accurate for that initial pin; this report records the final CI result at `195c943…`.
