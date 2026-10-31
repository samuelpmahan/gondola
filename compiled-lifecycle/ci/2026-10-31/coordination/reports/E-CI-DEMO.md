# E-CI-DEMO: managed lifecycle HTTP demo audit

**Outcome: `confirmed_reuse` for the managed HTTP demo substep only.** The primary managed workflow failed; this packet does not claim a full CI or lifecycle-matrix pass.

## Provenance and result

- Workflow run `41178420647`, attempt 1, head `49cc2b96c8817a47319d5b7bd484184a22fa984b`: completed with conclusion **failure**.
- Artifact `13034915662` was bound to that run and head. Its 47,035,803 ZIP bytes match SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`. All 12 downloaded chunks matched the retained chunk inventory; all 1,272 archive members passed path-safety and CRC checks (412,381,547 uncompressed bytes). Selected demo, trace, AppIR, module, and log members matched their extracted copies byte-for-byte.
- Source pins matched before and after the run (122 entries). The managed demo used the current runtime wrapper SHA-256 `9c2a06521ec19be0f70415dcdcf6aa71b022b08daaf6f913e503cc197e2261ed`. Its React and DOM AppIRs agree on component ID `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`, including `view.node` and `effect.request-reply`; the served bundle includes the freshly compiled Go module, encoder, both existing renderers, and lifecycle runtime.

## HTTP demo evidence

The recorded smoke is `passed` with all **12 checks**, 24 trace ticks including Init, and four renderer swaps (DOM → React → DOM, then React ↔ DOM for the second-generation pending effects). The actual Go state, View tree, messages, and effects at 23 Go updates match the native Go CLI trace. HTTP page, CSS, and JavaScript bundle all returned 200. Browser version was `156.0.8078.4`; browser/console errors, failed requests, WASM requests, and WASM API attempts were all zero.

The trace records seven request effects; subtree removal cancels Grandchild, Child, Parent in that order while Sibling remains pending. Three retired callback probes are rejected; three explicit stale Go `complete` messages leave the remounted state unchanged. Sibling and generation-2 Parent/Child/Grandchild replies complete; duplicate Sibling and Child replies are rejected. The screenshot shows the final generation-2 tree and completed sibling, all request controls disabled, Remount disabled, Remove parent enabled, and no pending requests. Screenshot SHA-256: `d1a9d09dc59e88ce02a83e7d8734acf5987e3e4a1a5c3714384a881295b17648`.

## Global failure and boundary

The required native/direct/browser matrix failed before conformance comparison because `--native-go go` was resolved as `/home/runner/work/gondola/gondola/go`; spawning that nonexistent path returned `ENOENT`. The full conformance check was withheld. The workflow conclusion remains failure even though the separately recorded HTTP demo stage passed. The prior local preflight (`lanes/demo/preflight.json`) is not used for this managed-run finding. This audit does not claim the failed matrix passed, does not claim detached stale physical-button clicks, and does not substitute the older preintegration wrapper.

## Reproduction and audit files

The archived E-BUILD command report records the exact `http-demo-smoke` invocation and logs. The independent audit script reassembles and hashes the downloaded chunks, validates ZIP integrity and selected extracted bytes, binds the source/module metadata, and compares browser trace state/View/effects against the native CLI trace.

- Audit result: [`lanes/demo/audit.json`](../lanes/demo/audit.json), SHA-256 `52349ce3a66f691b856ba7eb7178fee9a22c8143fb3b44dc55d03b8efebd9a0c`.
- Audit script: [`lanes/demo/audit_demo.py`](../lanes/demo/audit_demo.py), SHA-256 `59e6adba635c2a6f6511dcb53e72864f763a7f1fc9cf2aaee501684f5e5cca27`.
- Raw smoke: `extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/demo/demo-smoke.json`, SHA-256 `f288fc6bbfe1d995a0e69afa9087851a5432e8d89a6fb08581a7991ee3eb1145`.
- Screenshot: `extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/demo/demo.png`, SHA-256 `d1a9d09dc59e88ce02a83e7d8734acf5987e3e4a1a5c3714384a881295b17648`.
- Native CLI trace: `extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/matrix/native-cli.json`, SHA-256 `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5`.
- Managed execution record: `extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z/execution.json`, SHA-256 `8cacd69eb2b432237492fde7c3a66185356f7faa311fee0ced0b3042097432fc`.
