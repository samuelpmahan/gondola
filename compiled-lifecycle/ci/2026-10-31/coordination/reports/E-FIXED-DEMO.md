# E-FIXED-DEMO — managed lifecycle demo audit

**Decision: accepted** (`confirmed_reuse`) for the successful managed provider artifact and its full lifecycle matrix. The report is limited to run `41181505234`, artifact `13035044166`, source `00da54ad0f5a4006b13a5cded18ce291845978bc`, tree `51b64a89b5f7e0edd4792becbed9adad6a27a698`. It makes no claim about a later Git landing or deployment.

## Provider and source binding

The provider ZIP is 47,072,021 bytes with SHA-256 `0aa934688e98dacec2eab4b9deb498aac39b1492575ecfc027193a2a747b3a26`. Its index lists 1,270 members. The provider metadata records a successful run; the parent archive check verified all member CRCs. This audit recomputed the ZIP hash and matched 10 selected extracted files to the provider member index by byte count and SHA-256, including the smoke record, screenshot, build metadata, native/direct/browser traces, and conformance run/check records.

The retained attempt is `compiled-lifecycle/builds/attempts/attempt-20261031T074040915Z`, in `full` mode with status `passed`. Its 123 source pins match before and after the run. The conformance runner also reports stable sources and stable build outputs through its final check. The lifecycle matrix status and check status are both `matched`.

## Actual Go module and browser build

The generated AppIR and module identify the component as `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`. The AppIR includes `view.node` and `effect.request-reply`. The exact compiled GoScript module in the HTTP page's React output is 521,163 bytes, SHA-256 `70e1d1171ab71b84e906ef2819faed10902a1cc893afb568e99e077d0f10b260`; its AppIR is 14,180 bytes, SHA-256 `341693716b95fe70cb7fe0aab3bbc26db78e920266602062510b90feb87c1f6d`. The generated encoder is 15,625 bytes, SHA-256 `521a73b7cdcbec19b764e8dea2936f466c2fd71550b06bae1d5110d3a503c4a4`.

The bundle input manifest includes the existing DOM and React renderers, the compiled Go module and encoder, and the lifecycle runtime. The smoke began on the DOM renderer and finished on DOM after exercising both renderers. The managed browser reported Chromium `156.0.8078.4`; Playwright was `1.64.1`. Recorded tool versions are Node `v22.23.4`, npm `10.9.9`, root Go `go1.24.13 linux/amd64`, compiled Go `go1.27.3 linux/amd64`, React/ReactDOM `19.3.1`, and esbuild `0.28.2`.

## Managed HTTP smoke

The captured smoke reports all 12 checks passed. It records 24 trace ticks including Init, 23 Go updates, and four renderer swaps. The three observed HTTP resources all returned 200: `/` (4,546 bytes), `/demo.css` (6,573 bytes), and `/demo.bundle.mjs` (1,837,935 bytes). The browser recorded zero page errors, console errors, failed requests, WASM requests, or WASM API attempts. There were no pending effects at the end.

I independently decoded the typed Go state values and matched the HTTP trace's Init plus all 23 Go updates to the native Go CLI record by message, complete state, Go View tree, and emitted effects. The matching sequence excludes the renderer-swap event, which does not dispatch Go, and the two duplicate Go messages that the HTTP host rejects at its effect-correlation boundary.

The effect record contains seven requests. Removing Parent cancels `grandchild:g1:r3`, `child:g1:r2`, then `parent:g1:r1`, while Sibling remains live and can complete. All three retired callbacks are rejected. The three explicit stale generation-1 completion messages enter Go Update and leave state unchanged. The Sibling completion and generation-2 Grandchild, Child, and Parent replies are accepted; duplicate Sibling and Child deliveries are rejected.

The final state has a completed generation-2 Parent/Child/Grandchild chain (`parent:g2:r5`, `child:g2:r6`, `grandchild:g2:r7`) and the completed generation-1 Sibling (`sibling:g1:r4`), each with count 1 and no pending request. The final physical DOM has all four Request buttons disabled, Remount disabled, and all Add buttons plus Remove enabled. Its DOM snapshot also matches the final matrix profile's physical DOM.

I opened the actual provider screenshot. It is a 1440 × 1622 PNG, 326,350 bytes, SHA-256 `d1a9d09dc59e88ce02a83e7d8734acf5987e3e4a1a5c3714384a881295b17648`. It shows the completed generation-2 subtree, completed Sibling, DOM selected, no pending requests, and the expected disabled controls. A review copy is retained at `compiled-lifecycle/ci/2026-10-31/fixed/lanes/demo/managed-demo.png` with the same hash.

## Full native/direct/browser matrix

The matrix contains the `react`, `dom`, and alternating `swap` profiles. I compared the native Go trace against the direct compiled-module trace and each browser profile across the initial state and every Go update. Comparisons decode typed Go values, then check the full State, View tree, message, and effect values. The renderer-swap checkpoint retains the same Go state and View without an extra tick. All 26 captured ticks in each profile match; the scheduled scenario has 26 events, 16 clicks, and 17 alternating renderer swaps.

The matrix records seven requests, three cancellations in child-first order, 18 stale physical clicks across the three profiles, 32 retired-renderer fences, 16 eligible callback-fence swaps and one ineligible swap. All eight mutation controls were detected. Its independent literal-oracle flags pass for native, direct, browser traces, and physical DOM. Every captured physical DOM snapshot equals the corresponding expected DOM. Browser profile page-error and WASM records are empty.

## Reproduction and evidence

The read-only audit command is:

```sh
python3 compiled-lifecycle/ci/2026-10-31/fixed/lanes/demo/audit_fixed_demo.py
```

It reads the retained provider ZIP, extracted attempt, and member index; it writes only the audit JSON in this lane. No build, test, source edit, Git operation, or state change was performed for this review. Large raw traces remain in the retained ZIP.

- Independent audit JSON: `compiled-lifecycle/ci/2026-10-31/fixed/lanes/demo/audit.json`
- Audit script: `compiled-lifecycle/ci/2026-10-31/fixed/lanes/demo/audit_fixed_demo.py`
- Screenshot copy: `compiled-lifecycle/ci/2026-10-31/fixed/lanes/demo/managed-demo.png`
- Raw managed smoke SHA-256: `1e7b1475c39425128b13a8bad6e83320a99987727aa324049fd59b9a5be914d3`
- Native Go trace SHA-256: `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5`
- Direct trace SHA-256: `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71`
- Browser trace SHA-256: `f93564a73887472bef70fcb925882ef80a07a2845dfddec25ce89be9796ba280`
- Conformance check SHA-256: `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a`
- Conformance runner SHA-256: `0584a60bab261d1a447550dbc60ffc4371db2531653d4c075dcd7831c6236eaf`

This acceptance covers the successful managed artifact's HTTP demo and complete lifecycle matrix. It does not infer any result beyond this pinned run and tree.
