# XR-R-T3 — independent recheck of the disposal reentry repair

**Decision: accepted.** I verified the repair against the requested source hashes and reran the saved red probe. The host now reserves its structural-operation guard before calling raw `manager.disposeTree`, prevents reentrant structural mutations during both the authoritative call and cleanup phase, and clears that reservation while restoring node activity and lifecycle on an atomic manager error.

## Recheck findings

- The reviewed `host.mjs` hash is exactly `bf128868e63b70637faf4e8febaf6d739deb687e8f7551a2d12d52693971f4e3`; `host.test.mjs` is exactly `832ef0c93d94ea0215d58edfbb164ec13406bebdbe803503428dacc7286dfa44`.
- The original `/tmp/xr-t3-reentry-probe.mjs` now reports `reentryBlocked:true`, error `session tree host: mount cannot re-enter an active dispose operation`, no reentrant session, and an empty live tree after disposing root 1. This is red-to-green relative to XR-T3's recorded result, where root 2 was created during the manager call.
- A second temporary probe attempted `mountRoot`, `mountChild` under a sibling, `replace` of the sibling, and `dispose` of the sibling from inside the raw `disposeTree` call. All attempts were rejected by the active-operation guard, and the raw create/createChild counts did not increase.
- The same probe forced an atomic DisposeTree error with active pending requests in the target root, child, and sibling. The host restored all three nodes and their pending state, issued no transport cancels, and released the operation reservation. A subsequent renderer replacement and child completion succeeded. A later successful subtree disposal canceled the still-pending root request exactly once, did not cancel the completed child request or sibling request, and the sibling completed normally.
- The change preserves pre-fencing: `operation` is reserved after target nodes are marked inactive and before the manager call. The disposal phase is switched to cleanup only after bundles are validated. `consumeOrDispose` rejects flat-host disposal calls before cleanup phase, then permits each expected node's cached bundle to be consumed at most once.

## Commands and results

Tool: Node `v22.23.4`.

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node --test session-tree/host.test.mjs
# passed: 11 tests, 0 failures

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node /tmp/xr-t3-reentry-probe.mjs
# passed: reentryBlocked=true; reentrantSession=null; liveTreeAfterDispose=[]; bundles=[1]

PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node /tmp/xr-rt3-dispose-probe.mjs
# passed: mountRoot, mountChild, replace, and sibling dispose all blocked during raw DisposeTree;
# atomic error restored pending sessions; retry canceled root ID 1 only; child and sibling work survived
```

Both probes are preserved under `/tmp`; their SHA-256 hashes are listed below. The test runner emitted an environment-level warning that `Undici EnvHttpProxyAgent` is experimental. No browser replay or demo is claimed in this host-level recheck. No implementation files were changed.

## Reviewed hashes

```text
session-tree/host.mjs                 bf128868e63b70637faf4e8febaf6d739deb687e8f7551a2d12d52693971f4e3
session-tree/host.test.mjs            832ef0c93d94ea0215d58edfbb164ec13406bebdbe803503428dacc7286dfa44
/tmp/xr-t3-reentry-probe.mjs          e317afbf42e01696a5c19a95f754df245ae924a45c54b22cd295c6f2a0bd7ea3
/tmp/xr-rt3-dispose-probe.mjs         9954c1d53eaf711d224f9938daa08d7e2f7f0d0b8367de9840aafcf265a0a5bb
```
