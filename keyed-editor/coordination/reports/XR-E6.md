# XR-E6 independent review

## Status

**ACCEPTED after repair recheck.** The original runner ordering, argument-forwarding, demo path-reuse, and README scope findings have all been repaired. The isolated runner flow and the real-HTTP Chromium smoke pass. I did not repeat the full inherited/default runner or the full seeded checker; root owns the inherited full run, and E5 records the full seeded replay.

## Initial AMEND findings and repair

The initial review found two runner defects:

1. `run-keyed-editor.sh` checked for `interaction/node_modules/.bin/esbuild` before calling `run-http-effects.sh`, which prevented a clean checkout from reaching the nested pinned install.
2. The final `node keyed-editor/check.mjs` call did not forward caller arguments, although the README documented seed and action options.

The E6 author moved the esbuild guard after the inherited default runner and added `"$@"` to the final checker call. Current source order is at `run-keyed-editor.sh:41-53`, and argument forwarding is at line 94.

Independent shell-flow probe:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
node keyed-editor/coordination/reports/XR-E6-probe.mjs
```

Result: **PASS**. The isolated fixture began without `interaction/node_modules`; its mocked inherited stage provisioned `esbuild`, after which the runner continued through its mocked build/test stages and passed `--seeds 11,12 --cases 2 --max-actions 7` unchanged to the final checker. The probe tests runner ordering and argument forwarding only; it does not substitute for a real dependency installation or any application test.

The actual default dependency route also checks out by inspection: `run-keyed-editor.sh` clears both inherited-test skip flags and calls `run-http-effects.sh`; its default path calls `run.sh` and then the async/controlled/backend-replacement chain, which reaches `run-interaction.sh`. That runner executes `npm ci --prefix interaction` and installs Playwright Chromium unless the explicit install opt-out variables are set. The workflow sets those opt-outs only after its own `npm ci` and `playwright install --with-deps chromium` steps. The inherited test skip flags are not enabled by the workflow or the keyed entry point.

## Contract and artifact review

- `README.md` describes the four-row cap and why it preserves HTTP status/release capacity. It does not claim unbounded held requests. The demo is one browser actor; E5's multi-actor HTTP lanes use isolated browser contexts.
- The root `.gitignore` is byte-for-byte identical to `HEAD`; a new `keyed-editor/.gitignore` ignores only `/build/`, preserving the old ignore rules and keeping generated keyed artifacts local.
- `.github/workflows/keyed-editor.yml` selects Go 1.24 and Node 22, installs the locked interaction dependencies and Chromium, runs the default keyed runner, and uploads inherited plus keyed build/artifact directories.
- The runner builds `keyed-editor/build/keyed-collection.wasm`, copies `wasm_exec.js` from that Go toolchain's `GOROOT`, and writes `react.bundle.mjs` and `reference.bundle.mjs` under `keyed-editor/build`, which matches the demo imports/fetch path. The keyed runner rebuilds these outputs and does not rely on a checked-in cache.
- `keyed-editor/evidence/inherited-pins.json` records 373 verified old pins and zero mismatches. The keyed entry point always invokes the inherited default path. Root separately reports the full inherited chain passed; I did not repeat that long run.
- The E6 report correctly states that its author lane did not run the full inherited/default keyed runner or full seeded check. I make no claim that the new runner passed end-to-end in this review.

## Demo smoke and repair recheck

The isolated Chromium/real-HTTP smoke passed its other checks: retained input node through same-backend edit/reorder; actual node replacement and logical key/backward-selection restoration on DOM-to-React swap; held HTTP completion updating the retained React input; fetch abort on pending-row removal; stale dispatch rejected without state change; and server error followed by a fresh request-ID retry.

The initial probe did not match its stated path-reuse claim: row 2 was removed from `2/1/0`, row 3 was added at `2/1/0`, but the probe dispatched old key `row-2-input` at `2/0/0` and inspected row 1. This was a smoke coverage defect, not a product dispatch defect. The E6 author corrected the probe to inspect row 3 at `2/1/0`, dispatch the removed row-2 key at that same path, and assert the snapshot is unchanged.

I reran the corrected real-HTTP smoke in an isolated copy of the app and build artifacts, so its screenshot output did not overwrite shared evidence:

```sh
cd /tmp/xr-e6-demo-2qlc6mix/gondola
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH \
CHROMIUM_EXECUTABLE_PATH=/tmp/chromium \
/tmp/gondola-node22/node_modules/node/bin/node keyed-editor/demo-smoke.mjs
```

Result: **PASS** on Chromium 153.0.8010.0. The run confirmed same-backend input identity through edit/reorder; DOM-to-React replacement with logical-key/backward-selection restoration; real held HTTP completion preserving React input identity, draft, and selection; abort of the pending row request; atomic rejection of the stale row-2 key at row 3's reused `2/1/0` path; and HTTP error followed by a fresh-request-ID retry.

The E6 author scoped the closing README sentence precisely: original M0 outputs use `run.sh`, and keyed editor outputs use `run-keyed-editor.sh`. The example's `--max-actions 40` also matches the frozen limit.

## Review checks

```sh
bash -n run-keyed-editor.sh
git diff --check -- run-keyed-editor.sh README.md .github/workflows/keyed-editor.yml keyed-editor/coordination/reports/E6.md
```

Both commands exited successfully. The root `.gitignore` also compares byte-for-byte with `HEAD`; the keyed build ignore is scoped to `keyed-editor/.gitignore`. No application, runner, workflow, or documentation defect remains from this review. No Git mutation was performed.
