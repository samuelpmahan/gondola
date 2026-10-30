# G-CONFORMANCE

**Outcome: mixed; the four-app browser gate is blocked by an actual generated-ABI mismatch.** The N6 comparison, direct-JavaScript replay, browser driver, provenance capture, independent DOM oracle, and mutation controls are in place. On the frozen N1/N3/N4 checkpoint, native and direct-JavaScript traces match exactly for all four fixtures (31 ticks total). The counter passes mounted-browser comparison and the full checker. Form, list, and effect browser runs reject when the renderer encounters GoScript's valid `goscript.spareZero` array marker.

## Actual replay results

| Fixture | Native/direct JS | Mounted browser | Ticks |
| --- | --- | --- | ---: |
| counter | exact | matched; checker passed | 5 |
| form | exact | rejected at mount | 10 |
| list | exact | rejected after action 0 | 11 |
| effect | exact | rejected at mount | 5 |

The three browser failures are captured with stable before/after source hashes and empty changed-path lists. In `form` and `effect`, renderer initialization rejects `Node.Attrs.backing`; in `list`, the same error occurs while applying action 0. The captured errors are under [form.browser.failed.json](../../conformance/raw/n6-source-900dc38-r2runtime/form.browser.failed.json), [list.browser.failed.json](../../conformance/raw/n6-source-900dc38-r2runtime/list.browser.failed.json), and [effect.browser.failed.json](../../conformance/raw/n6-source-900dc38-r2runtime/effect.browser.failed.json).

The marker was independently inspected from the pinned compiled form View under Node 22. A valid Attrs backing is a native array with an own `Symbol(goscript.spareZero)` property whose descriptor is `{ value: function, writable: true, enumerable: true, configurable: true }`; for the observed input its array length is 4 and its GoSlice window is offset 0, length 3, capacity 4. The current renderer's `snapshotNativeArray` rejects every symbol key, so this valid ABI representation fails before React can mount. N3 confirmed the marker is GoScript's private zero-value factory. Do not treat the three browser rejections as trace mismatches or as successful four-way conformance. Renderer production source remains at the pinned R2 hash pending the root's R3 disposition.

## Verified scope and limits

- The native and direct-JavaScript comparison used independent adapters; it does not reuse runtime dispatch. [native-direct-summary.json](../../conformance/raw/n6-source-900dc38-r2runtime/native-direct-summary.json) records exact equality and 31 ticks: counter 5, form 10, list 11, effect 5.
- The counter browser run passed [counter.check.json](../../conformance/raw/n6-source-900dc38-r2runtime/counter.check.json) with 17 detected mutation controls, no WASM API attempts or `.wasm` requests, and an actual empty container plus empty renderer snapshot after unmount.
- The remaining three browser gates did not reach the checks they were intended to prove. Effect commit-before-completion and exactly-once reply, list keyed-node focus and backward selection preservation, and browser stale-handler behavior are therefore **unproven on this checkpoint**. The prior-session `normalizeEffects` rejection is also not resolved by this run: the effect browser failure occurs earlier, at renderer mount.
- A stale callback after runtime unmount remains explicitly `not-tested`. The counter run proves physical DOM removal after unmount, not callback suppression after runtime unmount.
- The deterministic fixture scripts use no randomized seed. No generic Go equivalence claim is made; results concern the pinned compiled frontend profile and four named fixtures only.

## Commands and environment

The reproducible sequential capture is [run.sh](../../conformance/raw/n6-source-900dc38-r2runtime/run.sh). It builds the independent native replay binary with `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false`, then captures native, direct-JavaScript, and browser output for each fixture in order. A previous native build without `-buildvcs=false` failed because this shared worktree could not provide VCS status; the explicit flag only disables build metadata stamping. It does not modify Go source.

The four native/direct comparisons were checked with:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-frontend/conformance/raw/n6-source-900dc38-r2runtime/verify-native-direct.mjs
```

The counter's complete checker command was:

```sh
/tmp/gondola-node22/node_modules/node/bin/node compiled-frontend/conformance/check.mjs \
  --app-ir /tmp/gondola-compiled-atomic/apps/counter-b05e9eb0e4e6/app-ir.json \
  --fixture compiled-frontend/fixtures/counter.json \
  --native compiled-frontend/conformance/raw/n6-source-900dc38-r2runtime/counter.native.json \
  --direct compiled-frontend/conformance/raw/n6-source-900dc38-r2runtime/counter.direct.json \
  --browser compiled-frontend/conformance/raw/n6-source-900dc38-r2runtime/counter.browser.json \
  --output compiled-frontend/conformance/raw/n6-source-900dc38-r2runtime/counter.check.json
```

Focused conformance verification passed with Node `v22.23.4`: `node --check compiled-frontend/conformance/check.mjs` and `node --test compiled-frontend/conformance/*.test.mjs` (37 passed, 0 failed). The captured stdout/stderr are in the raw evidence directory. The browser used Playwright's Chromium `153.0.8010.0` through `CHROMIUM_PATH=/tmp/chromium`. Native replay was built with Go `1.24.0`; direct replay and all conformance scripts used Node `22.23.4`.

The build input was N1 checkpoint `900dc38eee351e745717136cb54ae26d0765ec53d25c2d99e226b2b4ee620f2b` (86 pinned files; 209 output hashes verified by N1). N3 renderer SHA-256 is `9f10b75d194aab53cbe504321e8f6df26592c20b6a7123d7f267ba2e68868e5a`; N4 runtime SHA-256 is `ab0a2fe8c97293a8e45a035b92e46a80ae53b702103de47ca337f0a830b26704`. N4 separately reports 16/16 focused runtime tests and a passing adjusted completion-reentry probe on this runtime hash. N6 provenance now includes the actual counter, gobi, React map, fixtures, build/toolchain, frontend, root and interaction manifests/locks, and pinned dependency metadata, while excluding raw evidence outputs. Direct manifests contain 94 inputs; browser manifests contain those inputs plus the generated browser bundle. Each final direct/browser run asserted stable before/after hashes; all three rejection receipts report `stable: true`, `changedInputs: []`.

The first parallel run is retained separately at `raw/n6-source-900dc38/`; its browser provenance was contaminated by raw bundle files being included in the source walk. That was fixed and covered by a test. The sequential rerun at `raw/n6-source-900dc38-rerun/` verified stable provenance, and the final capture at `raw/n6-source-900dc38-r2runtime/` additionally includes the corrected uppercase GoMessage checker regression and final 37-test run. Artifact hashes are listed in [SHA256SUMS](../../conformance/raw/n6-source-900dc38-r2runtime/SHA256SUMS).

## Integration handoff

The root integration entry point is `run-compiled-frontend.sh --compiled-only`, which delegates to `compiled-frontend/run.mjs`. The visible demo smoke exercises all four generated modules and encoders, text/checkbox/literal form actions, keyed list editing and reorder, effect pending DOM followed by a manual single reply, and no-WASM requests. The current renderer admission failure blocks the form, list, and effect portions of both browser conformance and the demo smoke. Once the pinned ABI decision is implemented and source hashes are frozen, rerun the sequential N6 capture and then root's full runner.
