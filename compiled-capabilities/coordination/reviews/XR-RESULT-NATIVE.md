# XR-RESULT-NATIVE: independent review of local native evidence

## Decision

**Accepted as an accurate partial-evidence packet.** N2's claims about the preserved local native/direct lifecycle traces and the two GoScript output trees are supported by the captured files. The full E-BUILD result remains failed, so this review does not accept the integrated capability run.

## Source and run boundary

The reviewed source identity is the root-verified publication binding: local commit `031c462bcd72c0ae0bee2dc05a0972b3902ca40c`, published head `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`, tree `d22b75e18c7bea70a743cc79d53461b287c7d045`, base `00da54ad0f5a4006b13a5cded18ce291845978bc`. The binding file SHA-256 is `3ef9f4bd3ae606dda6c4e06f30e1df40c03de697bbeda17449783e29bfaf87a8`.

The local full attempt is `compiled-capabilities/builds/attempts/attempt-20261031T095356051Z`; its execution receipt SHA-256 is `ceb82b7e2bcbb5f42a4620c3a5076fbe2803aa637b20d622e01096b1de5c1df7`. It records mode `full`, status `failed`, 161 matching before/after source pins, 24/24 M0 rows, and one failed stage: `inherited-static-and-interaction-lifecycle`, with error `fresh lifecycle receipt does not confirm the inherited full compiled-methods regression chain`. All 16 recorded subprocess commands exited zero, and N2 records root-observed process exit 0. The failed receipt is the controlling outcome.

The attempt records Node `v22.23.4`, root Go `go1.24.0 linux/amd64`, and compiler Go `go1.27.3 linux/amd64`. Its seed is null and its lifecycle run uses the frozen fixture without a random seed.

## Independent checks

The read-only Node 22 verifier rehashed all 35 paths listed in N2's `source_sha256`; verified the E-RESULT report pin, E-BUILD receipt, native/direct/run/check JSON, audit JSON, and fixture; checked the captured source-before/source-after arrays; and rehashed each of the 67 physical outputs in both React and DOM build trees against the corresponding BuildResult and build-record inventory.

The fixture and traces contain 26 events, 26 native steps, 26 direct steps, and 26 direct Go ticks. I compared native state/tree rows and direct typed state/tree/binding rows to the frozen lifecycle oracle and fixture. The direct trace has seven requests in order (`parent:g1:r1`, `child:g1:r2`, `grandchild:g1:r3`, `sibling:g1:r4`, `parent:g2:r5`, `child:g2:r6`, `grandchild:g2:r7`), three cancellations in child-first order (`grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`), four deliveries, and no remaining pending requests. The conformance run and check both report `matched`; the check records 16 physical clicks.

Each backend has 67 output files. Their AppIR bytes match at SHA-256 `ed93e9ae6f9be20c306669d63b676ed466e65fee8dc7fd0a1a4c8a6b38f0a68a`; encoder bytes match at `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`. Both AppIRs declare `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. Generated modules are correctly treated as distinct evidence: React SHA-256 `f2fa10211b86b94c340897631cffea7c65f8eba4938966bb0436b548d37c879b`; DOM SHA-256 `1989db8e823b466ee9355932909572feba477dd905095b0771ffa886b6c2dcda`.

The author auditor's frozen script performs the broader per-event comparisons, including typed effect values, request/delivery correlation, swap expectations, and literal lifecycle expectations. I reviewed those checks and confirmed its output JSON is pinned and reports `matched` while preserving the outer execution's `failed` status.

## Reproduction and limits

The independent verifier command was:

```text
/tmp/gondola-node22/node_modules/node/bin/node compiled-capabilities/coordination/reviews/XR-RESULT-NATIVE/logs/verify.mjs > compiled-capabilities/coordination/reviews/XR-RESULT-NATIVE/logs/verification.json
```

It exited 0. Node emitted only its `UNDICI-EHPA` experimental environment-proxy warning on stderr. The full build and full suites were not rerun.

This review accepts the factual accuracy of N2's native/direct and GoScript partial evidence for the named local attempt. It does not accept the full capability milestone. The hosted artifact remains N4's separate catalog/review responsibility; this review did not inspect it. Browser/demo and archive acceptance are outside scope.

Verification JSON SHA-256: `31671221618dbfad7cf39385d7528a0ee731f2018fe148b8c3704eb070e31b03`.
