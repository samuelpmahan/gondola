# IA2 — runner, workflow, demo, and evidence audit

**Worker:** W3
**Outcome:** `mixed_change`

## Review result

The current entrypoints are present and connect to meaningful gates. The default
`bash run-multi-root.sh` first invokes the complete renderer-conformance chain,
then builds both WASM entrypoints and runs their bridge smokes, builds the
browser bundles, runs Go tests and vet, runs the multi-root Node tests, runs the
real-browser smoke, and finally invokes `multi-root/check.mjs`. The checker
with no arguments uses its defaults (seeds `20261030,20261031`, 30 generated
cases per seed, up to 40 actions), so the last command is a real replay gate;
it does not silently succeed without replay.

The workflow provisions Go 1.24, Node 22, pinned `interaction` packages, and
Playwright Chromium before invoking that same runner. Its two skip variables
are consumed by the inherited interaction runner and only skip provisioning
already performed by the workflow. The renderer and keyed runners still invoke
their inherited chains. Referenced source paths, smoke entrypoints, bundle
inputs, and replay inputs exist. No missing path or dependency provisioning
gap was found in this static audit.

Two early demo issues reported during integration are repaired in the current
source. `unwrapManager()` now wraps `list()`, which the runtime requires, and
the browser smoke now fails on a visible startup error and verifies all three
sessions mounted. The request action locator is scoped to its own root, while
the render-key guard preserves request-button identity during unchanged poll
refreshes. Current browser smoke confirms three distinct sessions and lanes,
root-local renderer swap/focus behavior, duplicate request ID `1` in separate
lanes, cancellation of only the disposed root, sibling completion, rejection
of the late release with HTTP 409, and fresh-session remount.

## Focused verification

Commands run against the current source:

```sh
bash -n run-multi-root.sh
/tmp/gondola-node22/node_modules/node/bin/node --check multi-root/demo.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check multi-root/browser-smoke.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check multi-root/check.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test multi-root/*.test.mjs
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium /tmp/gondola-node22/node_modules/node/bin/node multi-root/browser-smoke.mjs
```

All syntax checks passed; the Node suite passed 21/21; the Chromium smoke
passed all five printed scenarios. The browser smoke used the locally built
WASM and bundles and the real HTTP lab.

## Remaining evidence gaps

The full inherited runner, seeded replay, final preservation check, and CI
were not run for this audit. Their pending status is therefore appropriate.
Evidence text does need synchronization:

- `multi-root/README.md` still says the browser demo's end-to-end results are
  pending root integration, although the current standalone smoke passed.
- `reports/E6.md` says it does not claim that the browser smoke passed; that
  statement is also stale against the current source and this run.
- `multi-root/RESULTS.md` has mixed browser status: its opening and guarantee
  rows say the standalone smoke passed, while the toolchain table still labels
  Chromium, React/ReactDOM, and Playwright browser verification pending.
- The same results page says `multi-root/evidence/packet-status.json` records
  the exact browser command, assertions, and hashes. That JSON currently only
  records syntax checks plus pending full-run/replay/preservation/review fields;
  it has no browser command, output, or hash fields. A screenshot exists under
  `multi-root/evidence/`, but its hash is not recorded there.

These documentation and evidence-record mismatches do not negate the focused
browser pass. They do mean the packet's recorded evidence is not yet fully
aligned with observed results. I did not run `bash run-multi-root.sh`, replay,
or CI, per the audit scope.
