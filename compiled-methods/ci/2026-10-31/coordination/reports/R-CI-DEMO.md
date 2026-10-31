# R-CI-DEMO — screenshot wording correction

**Outcome: `mixed_change`.** This bounded metadata repair corrects the description of the retained screenshot and refreshes the report hash in the canonical E-CI-DEMO receipt. It does not change the CI run, demo, audit code, or audit result.

## Preserved originals

Before editing, I copied the original E-CI-DEMO report and receipt byte-for-byte into `compiled-methods/ci/2026-10-31/lanes/demo/repair-screenshot-claim/before/`.

| File | Original SHA-256 | Preserved SHA-256 | Bytes |
|---|---|---|---:|
| E-CI-DEMO report | `9560e6f73314d002bf9ec9710035857c32b445d950233426f498e7a74cc45d05` | `9560e6f73314d002bf9ec9710035857c32b445d950233426f498e7a74cc45d05` | 8,547 |
| E-CI-DEMO receipt | `e02d5fad69f211e096291e4bf1499459073cda0bf97fc03dd825debf7edb6b50` | `e02d5fad69f211e096291e4bf1499459073cda0bf97fc03dd825debf7edb6b50` | 9,409 |

Both preserved files are byte-identical to their pre-repair canonical originals. The preservation inventory is `compiled-methods/ci/2026-10-31/lanes/demo/repair-screenshot-claim/before/preserved-inputs.json` (SHA-256 `23a6f74dfc3aef47b6359760a6604ba894ff30a87a18e08a5b8c4db913bcd3eb`).

## Correction

The previous report said the final screenshot showed “disabled zero reset controls.” That was inaccurate for the captured final state. The revised text states that Parent is 0 and Parent Reset is disabled, while Child is 2 and Child Reset is enabled. It separately states that the smoke verified both controls disabled when their own counters were zero. This distinction matches the actual screenshot and the smoke record.

Screenshot: `compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/http-demo/demo.png`, 244,666 bytes, SHA-256 `623f8f010d87c0c2c2f1e709ce2daec64c11a1bfca508a1071352682ec7ba55b`. Smoke record: `compiled-methods/artifacts/attempts/attempt-20261031T044100445Z/http-demo/demo-smoke.json`, SHA-256 `412f3c341dfdf67a521defef21965e0a2c993cb9cefb89fd6aabbf58060fe80d`; its recorded checks include the zero-valued Parent Reset and Child Reset controls being disabled. The final Go state is `{"parent":0,"child":2,"readOnly":false,"savedChild":1}` and final backend is `dom`.

## Before and after hashes

| Canonical file | Before SHA-256 | After SHA-256 |
|---|---|---|
| E-CI-DEMO report | `9560e6f73314d002bf9ec9710035857c32b445d950233426f498e7a74cc45d05` | `59e3df79f76a43df07226dd59c959cd57a32cd528e9dbfade09f3b8765fa43da` |
| E-CI-DEMO receipt | `e02d5fad69f211e096291e4bf1499459073cda0bf97fc03dd825debf7edb6b50` | `971b3f4e5016f3114ecefea135a177d7c700756941dadcfb1c96c2b3d69a5d06` |

Only the report text and the matching `report.sha256` field changed. Every other semantic receipt field is unchanged. The report now hashes to `59e3df79f76a43df07226dd59c959cd57a32cd528e9dbfade09f3b8765fa43da` as recorded in the canonical receipt.

## Unchanged implementation evidence

The compiled methods runner remains SHA-256 `eb1aa250c0c9cfbb7f3d73abf7692f8e50a57314836f8e5d0ac7d53a77a3cb68`. The demo audit code remains SHA-256 `f9b2143844af0cbd19ccb72b700cde046670bd14dc5aee0700dbfd01d01a1127` and its machine result remains SHA-256 `b1a43514f2b943d38caad7ea9cd03136baddd163df3eff571c2285f0fc25ac5c`. The primary CI artifact, screenshot, smoke JSON and execution receipt were not modified. No implementation or audit rerun was required for this wording correction.
