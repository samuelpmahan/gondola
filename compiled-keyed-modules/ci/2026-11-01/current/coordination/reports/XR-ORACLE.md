# XR-ORACLE: independent review of E-ORACLE

**Decision:** accepted  
**Reviewer / job:** N4 / XR-ORACLE  
**Author:** N5 / E-ORACLE

## Sealed packet

The sealed N5 packet is byte-identical to the live owned sources: `oracle.mjs` SHA-256 `0c5264035ff00099b0da57209fb38b773a7dce7f0a88e84f3fa36b3724912be8`; `oracle.test.mjs` `ccbb62a2dfafcdf8b003d6a7613fc5dcea028e66e5ad8fe3e3e77b8d1cca779f`; and `expectations.json` `9dd927de69b9a1be9349545ab2720dc57f3750eddfb201b0235f1a33027b7ba9`. The sealed author report and receipt hashes also match `seals/E-ORACLE/seal.json` exactly. The E-HARNESS summary and E-BUILD-final index hashes match the pins in the author packet.

I made no edits to N5 sources, reports, receipts, attempts, or E-HARNESS evidence.

## Fresh checks

I reran the exact pinned Node unit suite and syntax check, then ran an independent focused replay against the frozen run-final scenario/native/direct/browser captures and build index. No native Go or browser process was relaunched; the replay consumes the actual saved outputs and validates them afresh with the sealed oracle.

| Scenario | Events | Native snapshots | Native / parity | Browser DOM roots checked |
|---|---:|---:|---|---:|
| Literal | 18 | 19 | matched | 162 |
| Seed 20261101 | 36 | 37 | matched | 324 |
| Seed 20261102 | 36 | 37 | matched | 324 |
| Seed 20261103 | 36 | 37 | matched | 324 |

The review checked the full Go-owned parent projection and keyed controller state on every native snapshot: both `a`/`b` slots, generation, mounted flag, tombstone/publication values, order and child count. It also checked child order, generation, input, count/state, publication, and actual native `NodeRecord` view trees. All direct and browser captures matched those native rows.

Across all 20 direct/browser capture profiles, I crosschecked parent/child ABI digests, helper bytes, parent AppIR digest, helper descriptor digest, backend and embedded scenario/seed against E-BUILD-final and the frozen scenario records. The build identity audit independently validated both React and DOM package, manifest, component, ABI, AppIR, sidecar, descriptor, fixture-source and emitted-source byte/hash pins.

The browser captures contain live DOM `outerHTML` and controls for each mounted snapshot. The review rendered the native Go view trees to expected HTML and compared those strings and disabled control records against 1,134 actual browser DOM roots across the three browser profiles and four scenarios. It also verified identity checkpoint indexes and distinct logical/physical identities: live nodes persist through reorder, `a:g2` gets new logical and DOM IDs, logical IDs survive renderer swaps, and renderer-owned DOM IDs change.

The click trace audit covered 550 renderer event rows. All 455 accepted clicks had the native Go View handler message as both requested and observed. It checked 220 child call sequences in the order `IsCurrent → child Update → publication → IsCurrent → ReceiveKeyed`, plus 235 parent calls with parent Update followed by output. All 57 actual browser clicks on disabled controls had `HTMLElement.click()` evidence, disabled state before the click, zero callback invocations, no dispatch/message, unchanged call counts, and no bridge or module call before suppression was recorded. Enabled clicks invoked one renderer callback and matched the native message. This is programmatic DOM dispatch, not trusted pointer or OS input.

## Mutation controls

The N5 actual-capture controls ran after successful native and parity baselines and detected all 11 targeted changes. The fresh replay also ran all 17 build/helper identity controls after a healthy build identity baseline. I checked the thrown diagnostic path for every control against the field that was mutated; failures pointed to the corresponding child count, controller slot, generation, accepted flag, view tree, DOM evidence, identity, ABI, AppIR, helper, descriptor or source-identity field. They were not generic rejections of the entire input. Full messages are retained in `rawlogs/XR-ORACLE/review-replay.json`.

The unit suite passed 2/2 tests with zero skipped or failed. Node syntax check exited 0. Node emitted its recorded experimental `UNDICI-EHPA` warning; it did not affect results.

## Commands and pins

Commands run from the Gondola repo root:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --check compiled-keyed-modules/oracle/oracle.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-keyed-modules/oracle/oracle.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node ../keyed-module-coordination/rawlogs/XR-ORACLE/review-replay.mjs
```

Tool used for fresh checks: Node `v22.23.4`. The saved N4 capture metadata records Go `go1.24.0 linux/amd64` and Chromium `153.0.8010.0`; this review did not rerun those processes.

- Sealed N5 author report: SHA-256 `5fe08cd448b44226483cb57f5eb1a5690680a38ac3ecdcf839c6d088de679b66`.
- Sealed N5 author receipt: SHA-256 `ec7d240a27a3a5c8bc6bb07ee08b451c7bb2b4840af54c149e22a1f9b39b650b`.
- Frozen E-HARNESS summary: SHA-256 `b8fa47c2f57c4b011312607cdf3cc029c3c583c9af4bdd99ff68eddc1a48dde1`.
- E-BUILD-final index: SHA-256 `75df29c02218fab47294454bb0338a720d806901d64377b4cae024fd4f6a2e66`.
- Fresh replay result: `rawlogs/XR-ORACLE/review-replay.json`, SHA-256 `4d2a7bb9d16a3c028f5cbdb04a0c7eb47608c2c5476faf3eee6bfebb97c1a230`.

## Preserved attempts and limits

N5's earlier test-first failure remains in `rawlogs/E-ORACLE/attempts.json` (SHA-256 `01289fe7d342e259a3b6c60edaeafeeefe15ac0913ba31bdc67fe9041532db33`). The earlier N6 source-pin rejection remains in its failure receipt and archived attempt; I left those artifacts intact. The following N6 delivery attempt records `--allow-dirty` and a passed independent consumer, and was not conflated with the earlier failure.

This review proves the saved bounded synchronous two-key profile and three specified seeds. It does not cover async effects, trusted input, or key counts beyond `a` and `b`. The oracle's parity API checks native state/tree parity and retired callback/publication fences; the supplemental review replay checked ordinary click message/order and the physical DOM records from the saved captures. The shared analyzer still does not admit `ReceiveKeyed` or `IsCurrent` by AppIR reachability; their GoScript source and emitted artifacts are byte/source pinned.
