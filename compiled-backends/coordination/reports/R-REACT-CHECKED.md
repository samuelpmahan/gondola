# R-REACT-CHECKED

**Outcome: mixed change.** Fixed the React-side DOM serialization mismatch from N3 attempt 07. After each synchronous React commit, the renderer removes the reflected `checked` attribute only for controls identified by an explicit validated `target.checked` binding, while preserving the live `.checked` property. Non-bound static checked inputs retain their source attribute. The DOM oracle and snapshot normalization are unchanged.

## Root cause and repair

Attempt 07's form failure is the second backend swap (`DOM → React`) after the first `React → DOM` replacement succeeded. The captured React DOM contains `<input aria-label="Checked" type="checkbox" checked="">` although the expected `outerHTML-v1` contains no serialized `checked` attribute; the live checkbox state must remain true. The same physical serialization mismatch appears in list and list-growth captures. Evidence fingerprints are recorded in [before.sha256](../../evidence/repairs/react-checked/before.sha256).

`propsFor` correctly lowers the compiled checked state as React's controlled `checked` property for a `target.checked` binding. React's commit reflects that state into the physical `checked` attribute. The renderer now uses the committed element refs and the validated `built.bindings` list after `flushSync` to remove the reflected attribute only at controlled checked-binding paths. It saves and restores the live `.checked` value around that removal. It does not modify `domSnapshot`, the oracle, or unbound static attributes.

The new real-browser test, [renderer.browser.test.mjs](../../../compiled-frontend/frontend/react/renderer.browser.test.mjs), exercises the actual `createReactRenderer` and React DOM in Chromium using GoScript-shaped View/GoSlice wrappers. It verifies initial checked=true mount, true/false/true updates, a fresh renderer remount, raw physical `outerHTML`, live `.checked`, unchanged static checked markup, same keyed nodes, focus, and backward selection.

## Verification

Toolchain: Node `v22.23.4`, React/ReactDOM `19.3.1`, Chromium `153.0.8010.0` at `/tmp/chromium`.

| Command | Result |
|---|---|
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/react/renderer.browser.test.mjs` before the renderer change | **RED**, 0 passed / 1 failed at the expected initial physical `outerHTML`: controlled checkbox serialized `checked=""` |
| `GOBI_CAPTURE_PHYSICAL_OUTERHTML=1 /tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/react/renderer.browser.test.mjs` after the change | **GREEN**, 1 passed / 0 failed; raw `outerHTML` and live state are printed at initial mount, true/false/true updates, and fresh renderer remount |
| `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-frontend/frontend/react/renderer.test.mjs compiled-frontend/frontend/react/renderer.browser.test.mjs compiled-frontend/frontend/react/bindings.test.mjs` | **26 passed / 0 failed** |

The Node runs emitted a non-failing `[UNDICI-EHPA]` experimental `EnvHttpProxyAgent` warning. The RED log, GREEN log, full React suite log, and attempt-07 capture hashes are in [the repair evidence directory](../../evidence/repairs/react-checked/).

## Limits

The new browser test mounts the real React renderer with native-GoScript-shaped View wrappers; it is a focused renderer regression, not an emitted application-module integration test. N3 was notified of the source freeze and owns the rerun of the affected app matrix. No oracle, DOM renderer, runtime, build, harness, demo, or app source was changed for this repair.

## SHA-256

- Before React renderer: `2bb7c59b3d160c09ec9fea61d382df7c4e07ed97ba22c6c790f9682fa00a26c6`
- Before existing React unit test: `0d2c1483c19ff95cc320dab64aeb2f4ec795e0b14e4128b45fe9aa0dafc2e99f`
- After React renderer: `35581215d912c0b19a63de9f122b75fef774c717100590d272cf9e7731943f6a`
- New browser test: `4e8cd936b0ebd0597f9011c5c9a448d07fc76a9b4919cdc74da3a73b420cb78c`
- Attempt-07 form capture: `8977d5d654083881227a28721f72c33533643b9aaeec1532287db60de3a8de5a`
- Attempt-07 list capture: `ecd5796b533037949a2d5f0d48fa7dc99f15324217bb2c22453877fcc56e4951`
- Attempt-07 list-growth capture: `7e01deffe0329be9d06ed1cb1b65f64ff5904dd7f4c3125ddfa953f816e4a6fc`
- RED log: `9c548e2eab5c7c16ad71ecab9f15ae32df929f486ac5754fd36af46c9fe740cd`
- GREEN raw-HTML log: `65619aebe891ff0907a9efc2a7161e08e39f4177c1e0b79cfd903ee862b48ca2`
- Full React suite log: `295eb8c3e2a419da72b0ceef5d4aa0e798c6d71785d2ae7a62fc777e43126842`
