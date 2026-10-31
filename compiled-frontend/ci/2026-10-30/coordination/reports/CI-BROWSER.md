# CI-BROWSER: first fresh-CI attempt

**Outcome: insufficient evidence for mounted-app browser conformance.** The first full CI job failed in the Node test gate before the compiler's four-app build and browser replay. This report closes only run 41140265213; a repaired fresh-CI attempt belongs to the separate follow-up packet.

## Verified attempt

- Workflow run `41140265213`, job `124352550636`, artifact `13019432197`, PR #11 head `408e330517b1dd5e5f865e2ff1914465f98bcf66`, tree `cd615e4bd0e83e31dd87232207afb2bf6416ccff`, parent `42df6883337605d901a23e9fed874768c7ce1824`.
- The downloaded archive SHA-256 is `7159fdd1c372d804f95671700cb1c760f22cef4855d32f8ea24708789c03eda4`, matching the extraction manifest. All 19 compiled-artifact files listed there passed hash and size checks. All 116 `sourceBefore` pins matched this exact checkout; no `sourceAfter` inventory was produced.
- The CI execution record is `failed`. Root Go 1.24.13 tests/race/vet and compiled frontend Go 1.27.3 tests/race/vet all exited 0. Node v22.23.4 reported 79 passed and 2 failed of 81.
- The only failures were no-WASM test cases 26 and 27. Both stopped in `chromium.launch`: the test uses `/tmp/chromium` when `CHROMIUM_PATH` is unset, while this CI environment recorded `CHROMIUM_PATH: null` and `CHROMIUM_EXECUTABLE_PATH: null`. The failures occurred before the no-WASM guards' assertions ran; they do not establish guard behavior.

The entrypoint executes Node tests before `compile-four`. The captured command list ends at the failed `node-tests` step. No compiler app outputs or `conformance/raw` browser traces are present in this artifact, so this attempt contains no mounted browser evidence for live DOM values, checked/disabled controls, literal versus observed button values, keyed focus and selection, detached callback fencing, pending effects and duplicate replies, app no-WASM behavior, or post-unmount DOM.

## Evidence

The immutable provider capture and this audit are separate. The source and provider audit is [first-attempt.json](../../audits/CI-BROWSER/first-attempt.json); its checker is [audit-first-attempt.mjs](../../audits/CI-BROWSER/audit-first-attempt.mjs). The failing raw Node log is at `provider/extracted/compiled-frontend/artifacts/logs/node-tests.stdout.log` (SHA-256 `176208369d53a4d77ad53f5f40f7e8ac4f540dd88bbdd340667c254b5e74a1c5`); the execution receipt is `provider/extracted/compiled-frontend/artifacts/execution.json` (SHA-256 `26d4f82477d0989543f0fdaa9e6885c53990961e0a4c7de74bb9bd5d1c825c86`). The extraction manifest SHA-256 is `504a7b04f88da14d79fa0c6d91e3792c44badebb089220d8a152acc81c8dda4c`.

No four-app CI browser pass is claimed from this attempt. The overall browser gate awaits a separate repaired CI artifact and review.
