# E4 author report

## Owned implementation

- `controlled-input/reference.mjs` owns an independent React 19 editor model and tree projection. Its edit, save, and reset transitions do not read Go snapshots.
- `controlled-input/scripts.mjs` provides fixed boundary cases and reproducible generated scripts. The two default seeds are `20261030` and `20261031`; each generated script is limited to 80 actions.
- `controlled-input/check.mjs` runs two captured Go WASM instances through the unchanged backend host and the DOM/React mounts, with a separate reference root. It uses Playwright fills, per-character typing, and native button clicks; captures snapshots and actual DOM after each observation; saves full traces and CompareInteraction inputs under the ignored build directory; and calls E5's `runAdversarial(page)`.
- `controlled-input/harness.test.mjs` covers negative snapshot, DOM, value-property, disabled-property, and renderer-reported DOM comparisons, native envelope extras, fixed cases, seeds, and CLI validation.

## Verification

- Node 22.23.4 syntax checks passed for all four owned modules.
- `node --test controlled-input/harness.test.mjs`: 10/10 passed.
- Fixed-only Chromium diagnostic, seed `20261030`, `--cases 0`: 8 fixed scenarios, 74 observations, zero mismatches, 16/16 native `CompareInteraction` comparisons matched, and 9/9 adversarial probes passed. Browser: Chromium 153.0.8010.0.
- Full diagnostic: `controlled-input/build/diagnostic-fixed.json` (build-ignored).

The typing replay focuses each new input and places the caret at the current value's end before a multi-key sequence. This lets the harness verify ordinary typing after renderer swaps without making swap selection preservation part of the contract. The Go instance isolation probe dispatches a disabled Save against the untouched second runtime and verifies it stays at zero with an empty message log; it does not reinitialize that runtime for the observation.

This lane did not run the 100-case-per-seed suite. Root owns the full generated run and evidence aggregation.
