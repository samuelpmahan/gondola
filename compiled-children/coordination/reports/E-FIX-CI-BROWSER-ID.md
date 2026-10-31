# E-FIX-CI-BROWSER-ID (N1)

**Outcome: `mixed_change`.** In the isolated worktree, broadened the runner’s browser-version check from a `Chromium ` prefix check to an exact allowlist grammar for the two Chromium-family CLI formats used by Playwright: `Chromium <major>.<minor>.<build>.<patch>` and `Google Chrome for Testing <major>.<minor>.<build>.<patch>`.

## Change

`compiled-children/browser-version.mjs` accepts only those exact prefixes followed by four decimal components, rejects leading zeroes on nonzero components and components outside JavaScript’s safe-integer range, and requires a positive major version. Empty, incomplete, suffixed, whitespace-padded, malformed, and other-engine output is rejected. `collectVersions` checks the trimmed CLI result with this predicate but retains the original version string in `versions.chromium`; it does not rewrite `Google Chrome for Testing ...` to a different browser label.

The focused test covers `Chromium 153.0.8010.0` and the supplied CI output `Google Chrome for Testing 156.0.8078.4`, plus empty, malformed, suffixed, wrong-family, leading-zero, unsafe-integer, and whitespace cases. The helper and test are explicit source pins and required runner inputs; the test is also in the runner’s required unit-test list.

## Verification

- The focused browser-version test passes **2/2** under Node 22.
- Runner and helper syntax checks exit 0. Node printed its existing `UNDICI-EHPA` experimental warning during the syntax checks.
- The initial test-first run is preserved as a red before the helper existed; it failed its expected missing-helper assertions. The final passing test run uses a direct import of the implementation.
- The exact Playwright output and CI identifiers (run `41206230269`, job `124551739981`) are from the root-provided witness. The workspace did not contain the raw CI job log; no CI rerun is claimed.
- No full runner, npm install, Git, or scheduler action was performed.

## Source isolation and preservation

The code change exists only in `/workspace/scratch/39a56936f173/gondola-children-ci` (the assigned isolated worktree). Primary `compiled-children/run.mjs` remains unchanged at SHA-256 `deb687ae94cb58d7dab574c973a05d52b3adcb6bf68e70b0c49cdefd77a8eb4f`. Its pre-change bytes are preserved at `compiled-children/coordination/repairs/E-FIX-CI-BROWSER-ID/originals/run.mjs` with a manifest. Test and syntax command outputs, exit codes, and preservation verification are recorded under [`../rawlogs`](../rawlogs/).

Secondary-worktree source SHA-256 values:

- `compiled-children/run.mjs`: `22f4915c6aa0b300a23ed8a5ffe3a2d8a710c50d7f08c33e1d9e5d82c45e44ac`
- `compiled-children/browser-version.mjs`: `624fc3369d9f6e47d7d84d23de41e0bdbe07d6ce925c878a8623d08765b4f6ee`
- `compiled-children/conformance/browser-version.test.mjs`: `6c465496d274480ad79bf2fd74f4e6566095edc4022f83361b1d9c400a6586e6`

No primary runtime source was edited by this packet. The isolated source is frozen for review.
