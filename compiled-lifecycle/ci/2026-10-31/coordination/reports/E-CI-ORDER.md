# E-CI-ORDER: hosted lifecycle order audit

**Outcome: `mixed_change`.** The primary hosted run contains substantial bounded lifecycle evidence: a separate native CLI replay matches all 26 direct GoScript steps; the compiled browser profiles record child-first cancellation, stale-reply no-ops, retired effect rejection, renderer callback fences, detached-control behavior, and clean physical unmount. The overall workflow failed because the conformance runner could not spawn its native replay command. It withheld the full lifecycle comparison and mutation controls, so this report does not claim full CI acceptance.

## Artifact and source binding

This audit uses primary push run `41178420647`, artifact `13034915662` (`gobi-compiled-lifecycle-artifacts`), from head `49cc2b96c8817a47319d5b7bd484184a22fa984b`, tree `d49ca35b7eda23837c392bbe0d2363551e4c7bec`. The retained artifact listing records 47,035,803 bytes and provider digest SHA-256 `6fa057edf26af20b3e6ef805458c92033e2e626d625f44a88bffcc04781762c4`. The workflow completed with conclusion `failure`.

The audited E-BUILD attempt is `compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z` under the extraction root `compiled-lifecycle/ci/2026-10-31/extracted/`. The conformance run records 178 identical source-pin entries before, after, and at final stability check, plus 8 identical generated-output pins before and after checking. Its direct and browser evidence pin hashes match their extracted copies. Key raw evidence hashes are listed in [audit-result.json](../../lanes/order/audit-result.json).

## Lifecycle order and stale replies

The standalone native replay at `matrix/native-cli.json` is a separate successful E-BUILD stage, distinct from the later failed matrix runner subprocess. I decoded the direct GoScript typed state values and compared each of the 26 native CLI steps against the corresponding direct module step. Initial state and all step states, Views, messages, and emitted effect arrays matched.

Both native CLI and direct compiled-module records show that removing Parent emits exactly three cancellation effects in `Grandchild`, `Child`, `Parent` order. Their targets map to the originating request correlations. The independent Sibling remains pending. After remount, direct old `complete` messages for Grandchild, Child, and Parent are recorded as no-op Go ticks: state and View remain unchanged and no effects are emitted. The later sibling and generation-2 replies are accepted; duplicate completions are no-ops.

The actual mounted browser capture has React, DOM, and alternating-swap profiles, each with 26 events/ticks, 16 physical clicks, 17 ordered effect records, zero page errors, and no pending work at end. In each profile, the effect host force-delivers the canceled generation-1 Grandchild, Child, and Parent callbacks after removal. Each is rejected as `unknown or extra effect completion` without adding a Go tick. Duplicate completion probes for the already-delivered Sibling and generation-2 Child are also rejected as `effect completion already delivered`; direct Go duplicate messages leave state and View unchanged. The Sibling reply and generation-2 Grandchild, Child, and Parent replies are accepted. The fixed DOM→React swap preserves all four initial request tokens.

The alternating profile records 17 renderer swaps. Sixteen swaps had retained callbacks and both late callback forms were rejected by renderer lifetime fences; one swap had no retained user action callback. The capture records 32 retired-renderer fence diagnostics.

After remount, each profile attempts six clicks on retained old Parent/Child/Grandchild buttons. All targets are detached before and after the attempt, and the trace, snapshot, callbacks, pending requests, effect records, and physical HTML are unchanged. At final unmount, all browser-profile pending work is already drained; unmount succeeds, renderer snapshots are empty, and physical DOM is empty with zero controls. The browser scenario therefore checks teardown after completion, not browser unmount while a request remains pending. The same artifact's 10/10 compiled-runtime unit suite separately includes pending-sibling unmount, rejected reentrant unmount, and deferred unmount callback-retirement cases.

## Failure boundary and un-compared fields

The conformance harness recorded `--native-go go` and resolved it to `/home/runner/work/gondola/gondola/go`. Spawning that nonexistent checkout-relative path failed with `ENOENT`. Consequently `matrix/lifecycle.native.json` and `matrix/lifecycle.check.json` are absent; `lifecycle.run.json` is `rejected`, and `lifecycle.failed.json` records that the full check was withheld. The standalone native CLI replay described above does not replace that orchestrated native stage or the final matrix checker.

The direct/browser state, View, message, dispatch, request-effect, and completion-effect projections match across all profiles. The raw `action` field differs at injected Go-message ticks 11, 12, 13, 15, and 25: direct replay records `null`; the browser traces record `{path:"",event:"click",value:""}`. The pinned `compiled-lifecycle/conformance/check.mjs` (`0a714448607d40f08719925bf3822b35bd41b58fc66a124d8b7f5f491859c8e5`) excludes `action` from its direct/browser Go projection, while its browser assertions separately validate the 16 physical fixture clicks. Thus this action metadata for injected Go messages is un-compared; it is not a reported conformance failure.

The primary artifact force-delivers retired callbacks after `removeParent` and before the generation-2 requests are created. The stronger ordering with fresh generation-2 requests already pending was exercised separately by the headless E-LIVE-REPLY probe, not by this CI artifact. That separate report/receipt have SHA-256 values `37b89d47871ee674963ebe986d5ad89e6541ff75db01918312a54dd3a66c77b4` / `afbb2cd55e8e6f8cc5159256cd0dce79fd684c0b4bc68c8b18e6467a556b575a`; they are not counted as hosted CI evidence here.

## Audit reproduction

The bounded raw-record audit ran with Node `v22.23.4` and exited 0:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-lifecycle/ci/2026-10-31/lanes/order/audit-ci-order.mjs compiled-lifecycle/ci/2026-10-31/extracted/compiled-lifecycle/builds/attempts/attempt-20261031T065420569Z compiled-lifecycle/ci/2026-10-31/lanes/evidence
```

The custom audit script is SHA-256 `daa5329bd09bdf3bedb7a49b283f9749a29a2ba330176c45c392922989a70327`. Its result is [audit-result.json](../../lanes/order/audit-result.json), SHA-256 `af35ddd2d08127221462e079bae86cb97895f90ff556a9a5541ecd9d794ebb21`; command metadata is [audit-command.json](../../lanes/order/audit-command.json). The captured stderr contains only Node's experimental `EnvHttpProxyAgent` warning (SHA-256 `db12ad97221988bf346c55d06788e21a01bb6a683d69266bf732ed4d6d9763c8`); the captured exit code is `0`.

No product source, runtime, native source, or Git state was changed for this audit.
