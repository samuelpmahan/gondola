# XR-CI-DEMO — independent review of the current-primary HTTP demo

**Decision: `amend`.** The current-head methods artifact, managed-browser smoke, HTTP asset pins, and independently replayed audit support the demo result. Amend one screenshot-specific phrase: the final capture shows Parent Reset disabled and Child Reset enabled at child=2. The smoke separately checks each reset control when its value is zero.

## Reviewed packet and artifact

I reviewed E-CI-DEMO report SHA-256 `9560e6f73314d002bf9ec9710035857c32b445d950233426f498e7a74cc45d05` and receipt SHA-256 `e02d5fad69f211e096291e4bf1499459073cda0bf97fc03dd825debf7edb6b50`. The packet selects source commit `6b49cc0bd4c9512a041f723c86b632ec506afd9d` / tree `b28b10ccefd78f7a90d6d66f2b6769b426ed6a81`, primary push run `41169518187`, job `124444234335`, and artifact `13030848292`. The terminal workflow snapshot is SHA-256 `408aca6aec71391933281fdf078ad23f62665844f01d0125461d642571b87172`; the selected job completed successfully, including `Install Playwright managed Chromium`, `Run inherited gates and compiled method demo`, and `Preserve method and inherited compiler evidence`.

The provider ZIP is `11,460,089` bytes, SHA-256 `95757192e15b6d7da97fd10da7db47747b29bc7b4ae52e265ab42f7d2a543d1a`, with `968` manifested members. The independently replayed audit verified ZIP/chunk integrity and every extracted-member pin. It returned `passed`, 164 checks, zero failures. The retained audit output SHA-256 is `b1a43514f2b943d38caad7ea9cd03136baddd163df3eff571c2285f0fc25ac5c`; my replay produced the same output hash. Replay output and machine evidence are retained in `lanes/build/review-demo/`.

## Demo behavior and asset pins

The retained smoke record SHA-256 is `412f3c341dfdf67a521defef21965e0a2c993cb9cefb89fd6aabbf58060fe80d`. It records managed Chromium `156.0.8078.4`, 14 accepted Go dispatches, three renderer swaps, and final backend `dom` with Go state `{"parent":0,"child":2,"readOnly":false,"savedChild":1}`. Its exact snapshot and tick-count assertions surround renderer replacements. It records zero page errors, zero WebAssembly requests, and zero WebAssembly API attempts. `CHROMIUM_PATH` and `CHROMIUM_EXECUTABLE_PATH` were unset, and the smoke invocation supplied no `--chromium` argument. The successful workflow snapshot confirms the Playwright-managed Chromium install step.

The three actual HTTP resources match their recorded response lengths and hashes: `/` is 4,346 bytes (`9551977e…acb3704`), `/demo.css` is 8,097 bytes (`1513ffe5…6d9275e0`), and `/demo.bundle.mjs` is 1,800,935 bytes (`ba7db6f4…d4e9f0c5`). The site build record identifies the methods fixture and React build. I verified its GoScript module, AppIR, and encoder hashes against the extracted build outputs and the React build receipt; each matched exactly. The raw React and DOM module hashes remain distinct, consistent with E-CI-DEMO's explicit no-equality claim.

I opened the retained screenshot and verified the visible final state: parent 0, child 2, saved child 1, DOM selected, and the runtime snapshot panel visible. The screenshot is a valid PNG, 244,666 bytes, SHA-256 `623f8f010d87c0c2c2f1e709ce2daec64c11a1bfca508a1071352682ec7ba55b`.

## Required wording amendment

The E-CI-DEMO report says the screenshot “shows the completed parent/child Go state, disabled zero reset controls, DOM selected, and the visible runtime state panel.” In this capture, Parent Reset is disabled because parent is zero; Child Reset is enabled because child is 2. The smoke action trace checks Child Reset disabled when child is zero and Parent Reset disabled when parent is zero. Keep that behavior claim, and narrow the screenshot observation to the state actually visible, for example: “The screenshot shows the completed parent/child Go state, Parent Reset disabled at zero, DOM selected, and the visible runtime state panel.”

## Scope

This review accepts the substantive managed-CI demo evidence after that bounded wording amendment. It covers the selected successful current-head push job and its retained artifact. It does not establish separate PR-run or aggregate workflow status. No source, artifact, or Git state was changed.
