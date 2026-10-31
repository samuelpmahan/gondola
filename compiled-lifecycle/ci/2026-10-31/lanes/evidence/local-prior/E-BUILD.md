# E-BUILD (compiled Go lifecycle)

**Outcome: mixed_change. The explicit lifecycle-only run passed; no single full-parent local pass is claimed.** The inherited compiled-methods child passed separately in full mode. The default combined full run remains the clean-checkout/CI acceptance gate.

## Lifecycle-only execution

- Mode/status: `lifecycle-only` / `passed`; 18 recorded commands, 13 stages passed, zero failures.
- Attempt: [`attempt-20261031T065111036Z`](../../builds/attempts/attempt-20261031T065111036Z/).
- Source pins: 122 before and after, all matched.
- Fresh React and DOM GoScript CLI builds returned one app each, 67 pinned outputs and zero diagnostics. AppIR and encoder bytes matched.
- The compiled lifecycle runtime suite ran after the fresh React build with `GOBI_LIFECYCLE_APP_DIR=compiled-lifecycle/builds/attempts/attempt-20261031T065111036Z/react/output/apps/lifecycle-7e6575d90707` and passed.
- Native, direct, React, DOM, and renderer-swap profiles matched the independent oracle: 26 events/ticks, 16 clicks, 17 swaps, 7 requests, 3 cancellations, 18 stale physical-click probes across profiles, 32 callback fences across eligible swaps, and 8 mutation controls detected.
- HTTP demo smoke passed; all assets returned HTTP 200, with no browser errors, WASM requests, or WASM API attempts.

The exact lifecycle-only receipt and command report are retained at [`partial receipt`](../../builds/attempts/parallel-lifecycle-only-validation/E-BUILD.json) and [`partial report`](../../builds/attempts/parallel-lifecycle-only-validation/E-BUILD.md). Its verified archive has 719 members and 168,198,179 uncompressed bytes: [`archive`](../../builds/attempts/attempt-20261031T065111036Z/lifecycle-artifacts.tar.gz), SHA-256 `2e674d3d7f43576a0f9052f6164e83f3312933112eaf72fa3348a29d3db22f47`; [`member inventory`](../../builds/attempts/attempt-20261031T065111036Z/archive-manifest.json). Every archived member passed the extraction hash check.

## Separate inherited full run

The inherited `run-compiled-methods.sh` child completed as a fresh full pass. Its exact [`E-DEMO receipt`](../../../compiled-methods/coordination/receipts/E-DEMO.json) (SHA-256 `b610d5e3b37e8015815944db3ae0f119baebbafbcbdefd0f513110cb236d95bd`) and [`report`](../../../compiled-methods/coordination/reports/E-DEMO.md) (SHA-256 `7f65d4640733d294229ab6cb0cfa64ae5e54a09ee5f01e6a9023eb36bbd19477`) record mode `full`, status `passed`, and 17 commands.

The failed full E-BUILD attempt copied 53 inherited attempt files (10,269,094 bytes) into its archive. This is only a subset: the archive walker skips nested directories named `builds`, so it excludes the inherited run's generated React and DOM GoScript build outputs. The full attempt's raw files remain at [`E-DEMO attempt`](../../../compiled-methods/artifacts/attempts/attempt-20261031T063606561Z/); the enclosing [`failed E-BUILD archive`](../../builds/attempts/attempt-20261031T063606056Z/lifecycle-artifacts.tar.gz) and its [`member inventory`](../../builds/attempts/attempt-20261031T063606056Z/archive-manifest.json) have verified hashes. Do not treat the 53-file copy as a complete inherited-build archive.

## Invalidated full-parent attempt

The original full E-BUILD attempt finished with `status: failed` and `sourcePinsMatch: false`. Its inherited child had passed, and its lifecycle matrix and demo passed, but the old runner ran the compiled-runtime Node test before producing a fresh React app directory; it therefore omitted `GOBI_LIFECYCLE_APP_DIR`. The source set also changed after that attempt began. Its original report and receipt were preserved byte-for-byte under [`before/full-invalidated`](../before/full-invalidated/); its [`failed attempt archive`](../../builds/attempts/attempt-20261031T063606056Z/lifecycle-artifacts.tar.gz) is retained with its member inventory.

## Limits and next acceptance gate

AppIR v1 `effect.request-reply` is a coarse effect-route marker. The experiment mounts a closed lifecycle effect policy for `fixture.request` and `lifecycle.cancel`, and cancellation retires runtime correlations; the ordinary compiled runtime host still rejects `lifecycle.cancel`. Another frontend must implement this explicit profile and pass the replay before claiming cancellation support. This finite fixture does not establish arbitrary Manager or pointer-owned Go compilation.

The E-BUILD partial run and separate inherited full run are separate receipts. Their results do not constitute a single full-parent local pass. The default full runner on the repaired source in a clean CI checkout remains the acceptance gate.
