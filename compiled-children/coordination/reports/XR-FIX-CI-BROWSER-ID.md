# XR-FIX-CI-BROWSER-ID (N3)

**Decision: `accepted`.** The isolated runner repair fixes the reproduced Playwright version-label failure. I found no must-fix defect in the allowlist grammar, receipt value handling, or runner integration.

## Review findings

- The primary raw CI job log for run `41206230269`, job `124551739981`, shows Playwright's Chromium executable returning `Google Chrome for Testing 156.0.8078.4`; the old preflight rejected that exact value. The log is now available in the primary checkout and its matching failure text is recorded in the review audit. E-FIX's statement that its author did not have this log was accurate at packet time; root supplied the log afterward.
- The secondary helper accepts only the `Chromium` and `Google Chrome for Testing` families with four decimal components, a positive safe-integer major, safe-integer components, and no leading zeroes on nonzero components. The tests cover the CI value and representative malformed, suffixed, whitespace-padded, wrong-family, leading-zero, unsafe-integer, and trailing-LF cases. A separate Node 22 probe confirmed actual LF and CRLF suffixes are rejected.
- `collectVersions` trims the CLI output as the runner already did, validates that string, then writes the unchanged trimmed browser label and version to `receipt.versions.chromium`. It does not rename `Google Chrome for Testing` to `Chromium`. This preserves the exact non-whitespace CLI text in the receipt; the line terminator is removed by `.trim()`.
- The helper and its test appear in the runner's pinned source list, required input list, and required unit-test list. The runner also compares current source pins against the initial set before and after the archive command. The preserved pre-change `run.mjs` matches its manifest byte count and SHA-256.

## Verification

- Node `v22.23.4`: focused browser-version tests **2 passed, 0 failed**.
- Node syntax checks for `run.mjs`, `browser-version.mjs`, and `browser-version.test.mjs`: all exit `0`.
- Secondary source SHA-256 values match the E-FIX receipt: runner `22f4915c6aa0b300a23ed8a5ffe3a2d8a710c50d7f08c33e1d9e5d82c45e44ac`, helper `624fc3369d9f6e47d7d84d23de41e0bdbe07d6ce925c878a8623d08765b4f6ee`, test `6c465496d274480ad79bf2fd74f4e6566095edc4022f83361b1d9c400a6586e6`.
- The full runner, npm install, browser workflow, and CI were not run as part of this bounded review.

## Evidence

The detailed source and evidence hash inventory, source-list checks, CI witness lines, command results, and actual line-terminator probe are in `coordination/rawlogs/XR-FIX-CI-BROWSER-ID-review-audit.json`. Focused test, syntax-check, and probe outputs are separately preserved in the adjacent `XR-FIX-CI-BROWSER-ID-*` rawlogs.
