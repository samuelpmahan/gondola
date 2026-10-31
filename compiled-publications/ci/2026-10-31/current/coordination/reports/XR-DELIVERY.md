# XR-DELIVERY — independent delivery review

**Decision: accepted for the focused publications profile after C4 source-commit closure.** This review is limited to the local fixed and seeded publications evidence and the clean-checkout C4 repeat. It does not accept the inherited full browser chain.

## C3 packet and source boundary

The sealed E-DELIVERY report and receipt remain byte-identical to their seals: report SHA-256 `c3ab62c0bb06a6acb6ff06b9bd3badd57ca90072906aa3642dadffaf8f6a62af` (5,698 bytes), receipt SHA-256 `753261ef3f6952604847645697cd17428ecf9ba56e8782ca1ff6fa355dfa4b9e` (11,227 bytes). The C3 runtime receipt was `79abd6b0f4eff15321d3ff5efd80f19c3dc72deea1f22ed18fabcbcfa10ab332` (242,893 bytes), and its report was `d46b956b21aac5343021c2e062555587e9d07842a7d4db59e657e44fa724af4c` (912 bytes). Its eight focused stages passed with empty failure and mismatch lists.

C3’s local and remote commits (`93222c1c4d47ff7a7581cc8fe3ffa644af581e51` and `a426aad09b20cbbb7d298f02cae689ac5fb10e80`) share tree `ad33593b6a914922f1476b68209e718fb2cf65ed`. The C3 delivery boundary nevertheless had a concrete packaging defect: seven of its 128 tested source pins were absent from that committed tree. The C3 archive and its source-input snapshot do contain all 128 pinned bytes, but a checkout of C3 alone did not.

C4 closes that defect. It is an additive child of C3: local commit `96898708846bcd270cb67c3087e1fb43c76650f4` and remote commit `5662efcd7feb7920e4690d38cc76a297fed69d5a` have the same tree, `e0410e9fd67701899351d13f3de879f1672b91a6`. I independently read all 128 runtime pin paths from that Git tree and compared each blob’s exact byte count and SHA-256 with the runtime receipt; all matched, including the seven omitted from C3. The C4 attempt used a fresh checkout with no author coordination/rawlog directory. The existing locked dependency directories were linked by symlink.

## Fresh C4 run and archive

The fresh C4 attempt was `attempt-20261031T170004467Z-5`, completed at `2026-10-31T17:00:26.930Z`. Its runtime receipt SHA-256 is `63cca82eeea81332df5283faf038fb91a00910db7ad085e43c27e15ceae2562d` (243,135 bytes); its report SHA-256 is `31df69ca0156bb15408ba4390492a2c66b3b4efb29d701d91a46bab5a8a3e41d` (911 bytes). All eight focused stages passed, with no runtime failures or mismatches.

I independently streamed the C4 archive and hashed every regular-file member against its external manifest. All 361 members matched by path, size, and SHA-256; there were no missing, extra, unsafe, or mismatched members. Archive: 7,652,032 bytes, SHA-256 `5d1577e5c64c76a181e3aa3f284fa95927974c4f158113c8b0dec6702e900cba`. Manifest: 67,497 bytes, SHA-256 `d42ef9186894d63d7c60021202d8976b001545ef4afb7c1e3db2f872470dd8b0`.

The fresh React and DOM builds each report 67 outputs and the same component ID and capabilities: `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. Their AppIR files are byte-identical at 24,682 bytes, SHA-256 `e673590e57b0b4e5afbf77f5b654f73767f8f410cd35e5315e332c00d325c07f`; their encoders are byte-identical at 17,417 bytes, SHA-256 `12b9b02389aee4493f724a181ec033f3e884d5559755dcb58b98ee6d02b872f9`. Both renderer modules match the C4 receipt.

The C4 execution recorded 16 successful command entries, with no nonzero exit, signal, or spawn error. The focused versions were Node `v22.23.4`, npm `11.9.0`, native Go `1.24.0`, compiler Go `1.27.3`, Playwright `1.64.1`, React/ReactDOM `19.3.1`, Chromium `153.0.8010.0`, and esbuild `0.28.2`. It ran the focused Node and Go tests, fresh native capture, fresh React and DOM builds, conformance, HTTP smoke, archive round-trip, and an independent archive consumer. The exact command records are included in the independent-review JSON.

## Conformance and demo evidence

The fixed fixture has 50 source events, 45 Go updates, and 46 state projections. The fresh native trace matched the literal oracle and direct React/DOM captures; three mounted browser profiles (`react`, `dom`, `swap`) each recorded 50 events, 46 Go ticks, 51 event snapshots, and 34 physical `HTMLElement.click` actions. The captures show the accepted DOM-to-React swap preserving pending work, rejection of the incompatible candidate, and later events using the retained live renderer. They also contain disabled-action suppression, cancelled-reply rejection, and zero page errors.

The three seeded schedules each contain 71 events and 70 Go updates. Seeds `20261031`, `20261032`, and `20261033` all ran native/direct comparison; only `20261031` has a mounted browser capture. The checker marked all 16 mutation controls detected. I inspected the pinned checker implementation: these controls mutate copies of the actual native, direct, and captured browser data and require the applicable oracle/profile assertion to reject each mutation.

The HTTP smoke evidence records 20 passing checks, complete coverage for all ten no-WASM hooks, no WASM requests or API attempts, and no page errors. These are finite checks for this fixture and the captured Chromium version.

## Preserved history, CI, and limits

C1 and C2 remain red. C1’s missing-root-`go.sum` failure log matches its pinned 1,062-byte SHA-256 `93a1d90215a697b64e1ad782edc27f5a837ff40b537985c5166149aa4e1a3808`. C2’s `Unknown encoding: buffer` failure receipt remains failed; its 820-byte log matches SHA-256 `b086e48fbc974d0ef6211888f119831aad794854e1742040a673fd87a8c3f8e8`.

The guide’s CI pointer now resolves to `ci-status.json`. Its snapshot is for C4 source `5662efcd7feb7920e4690d38cc76a297fed69d5a` and records 34 queued runs with null conclusions as of `2026-10-31 17:04:21 UTC`. The full inherited chain was not run locally; a queued workflow is not a pass. A separate original-counter regression record reports 8 passing Node tests, 107 scripts, 4,473 initial/action ticks, 100 generated cases (maximum 80 actions each), and a matched native comparator for seed `20261030`. That is a bounded counter regression, not the inherited browser chain.

The separate static regression used C3, passed 5,000 cases with seed `20261030`, and matched its expected receipt and `SHA256SUMS`. `EXPECTED.json` and `SHA256SUMS` remain byte-identical to M0 commit `ed3fd43b24a58375032a6bc8f9ef0411bcb0ad46` (SHA-256 values `639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2` and `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`). C4 changes the seven already-tested support files and leaves the 128 pinned source bytes unchanged.

The demonstrated guarantee is finite synchronous equivalence for this typed-input/keyed-publication fixture across the listed Go, compiler, Node, and Chromium versions. Arbitrary Go applications, deeper component graphs, production transport/timing, other browser engines, concurrent React scheduling, hydration, IME, focus/selection, and pixel parity remain outside this evidence.

## Independent audit record

The read-only audit used Python `3.12.14` with streaming `tarfile` reads. An initial reviewer-script probe had parsing/path mistakes; its failed output is retained and labeled in the rawlogs. The corrected C3 and C4 audits pass. Their 361-member per-file inventories, 128-pin inventories, exact command/version records, and audit script are under `coordination/rawlogs/XR-DELIVERY/`. The native receipt validator accepted the author receipt without changing scheduler state. This review made no source or scheduler changes.
