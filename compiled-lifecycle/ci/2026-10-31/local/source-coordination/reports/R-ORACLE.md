# R-ORACLE — scenario expected-effects alignment

**Outcome: mixed change.** Repaired the stale expected-effects assertion in the frozen oracle test so it matches the final lifecycle scenario. The change is limited to `compiled-lifecycle/browser/lifecycle-oracle.test.mjs`; the hand-authored oracle implementation, its state/effect expectations, mutation controls, fixture, and closed E-ORACLE report/receipt were preserved.

## Repair

Before the repair, the first oracle test compared `fixture.expectedEffects` to a literal containing only the `removeParent` cancellation triplet. The final scenario contains eight effect rows: four generation-1 requests, the Grandchild/Child/Parent cancellation triplet, then three generation-2 requests. That metadata assertion failed even though the oracle's independently authored `LIFECYCLE_STEPS` already contained the seven request effects and the cancellation effects.

The assertion now lists all eight rows literally by event index and descriptor. Request rows remain `fixture.request/lookup/<token>/complete`; the one removal row remains `lifecycle.cancel/cancel/<token>/` with exact Grandchild, Child, Parent order. Existing tests still independently assert the seven request tokens, accepted reply behavior, state/tree/DOM expectations, sibling survival, and stale/duplicate no-ops. The existing mutation test still rejects reordered cancellation and an incorrectly accepted old-generation reply. No expected semantics are derived from a candidate trace.

## Preserved before snapshot

Before editing, the original oracle module, test, prior Node test log, E-ORACLE report, and E-ORACLE receipt were copied into `coordination/reviews/r-oracle/before/`. Their hashes are recorded in `coordination/reviews/r-oracle/before/SHA256SUMS.txt`:

| Snapshot file | SHA-256 |
| --- | --- |
| `before/browser/lifecycle-oracle.mjs` | `795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82` |
| `before/browser/lifecycle-oracle.test.mjs` | `18c88acd3e9028af30b1f737599ae537fc1354ea65f37037e5c9f89281ebae6d` |
| `before/browser/lifecycle-oracle.node22.test.log` | `2db2aff769448ad04caf3d76e5f0c91a41679b5de9ecadfdf7cb58ae2051e2e1` |
| `before/coordination/reports/E-ORACLE.md` | `88d80bb25bc6143b2f5f9bc1e1ca26257a64be71dd4fc257792905cc2e4f42ee` |
| `before/coordination/receipts/E-ORACLE.json` | `f7c36952230a9c277ce4d08fd44473e2732fe8110dbf2616540c23182e515fe6` |

The live E-ORACLE report and receipt retain the same hashes. The old focused-test log is retained only as historical evidence; the new passing output is separately recorded below.

## Verification

Toolchain: Node `v22.23.4` at `/tmp/gondola-node22/node_modules/node/bin/node`. The 26-event scenario is fixed and uses no random seed.

| Check | Command | Result |
| --- | --- | --- |
| Syntax | `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-lifecycle/browser/lifecycle-oracle.mjs > compiled-lifecycle/coordination/reviews/r-oracle/node-check.log 2>&1 && PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-lifecycle/browser/lifecycle-oracle.test.mjs >> compiled-lifecycle/coordination/reviews/r-oracle/node-check.log 2>&1` | Exit 0; both modules pass. Output: `coordination/reviews/r-oracle/node-check.log`. |
| Focused oracle suite | `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-lifecycle/browser/lifecycle-oracle.test.mjs` | Exit 0; 5 passed, 0 failed. Output: `coordination/reviews/r-oracle/oracle-test.log`. |
| Combined lifecycle/frontend harness suites | `PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-lifecycle/conformance/check.test.mjs compiled-frontend/conformance/check.test.mjs` | Exit 0; 9 passed, 0 failed. Output: `coordination/reviews/r-oracle/harness-combined-test.log`. |

Node printed its existing experimental `EnvHttpProxyAgent` warning; all commands exited successfully.

Review evidence hashes:

- `coordination/reviews/r-oracle/node-check.log`: `0c085475c95f3d462b7bda350205fe673aa0ca4a3f7bcb0a13cc1dff0e123081`
- `coordination/reviews/r-oracle/oracle-test.log`: `43b9be83a0c71e5eab488824608f1bd6f99de3d9ee921cfa27fe7037b897dfb7`
- `coordination/reviews/r-oracle/harness-combined-test.log`: `60dd7da5bce727d291a6ee147a918000a542376a1a7754889ac63a5a10cd7d05`
- `coordination/reviews/r-oracle/before/SHA256SUMS.txt`: `c2badc8434415a231818d8c18ef9ab894d9a7b535769456419d1903db38c7c4a`

## Frozen source pins

| File | SHA-256 |
| --- | --- |
| `compiled-lifecycle/browser/lifecycle-oracle.mjs` (unchanged) | `795ba7fef0ff680019f4988aba5cfcecb25b205516a2c7058bfc720fc217cb82` |
| `compiled-lifecycle/browser/lifecycle-oracle.test.mjs` (metadata assertion update) | `6a48d1d46addfa07d4792c3bf71d842c7ea6159eb69c5010b00e540df970daf1` |
| `fixtures/compiled/lifecycle/scenario.json` (unchanged) | `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650` |
| `compiled-lifecycle/CONTRACT.md` (unchanged) | `ed9eedea8f9582583d1f89e44be20e55f692f037f2b8decc93025433e478e083` |
| `compiled-lifecycle/conformance/check.mjs` | `0a714448607d40f08719925bf3822b35bd41b58fc66a124d8b7f5f491859c8e5` |
| `compiled-lifecycle/conformance/check.test.mjs` | `270d7fae54be739c9ec6e98fd9bf54aef7b03352b80896afb3194c8f9a16aa00` |
| `compiled-lifecycle/conformance/direct.mjs` | `8e10939fd30687822590ab0b31efac5203bd6b5f3006aa7c37908475fcf9608d` |
| `compiled-lifecycle/conformance/browser.mjs` | `ea9698851cf38ffeb1f1d03a50f369db0508debae39aa6a7e5645fbe804d2257` |
| `compiled-lifecycle/conformance/run.mjs` | `48767a3b4e6902493ab068331748229aac7095ef82d8744a7c0be376143e7c8e` |

## Limits

This repair aligns the oracle test with the already frozen scenario and preserves the independently literal lifecycle semantics. It does not alter the Go fixture, runtime, renderer, scenario, or browser harness implementation. The combined tests validate harness checking logic; physical browser acceptance remains evidenced by N3's separately pinned attempt-05 capture and the inherited full runner. No merge, deployment, or publication was performed.
