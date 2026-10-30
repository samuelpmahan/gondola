# XR-E6 independent review

## Status

**AMEND pending one demo-smoke assertion correction.** The runner's initial dependency-order and argument-forwarding issues have been repaired and independently rechecked. The real-HTTP smoke exercises the advertised identity, focus, swap, completion, abort, stale-dispatch, and retry paths, but its path-reuse assertion currently dispatches at row 1's path instead of the removed row 2 path that row 3 reoccupies. The smoke log/report therefore overstates that particular assertion.

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
- `.github/workflows/keyed-editor.yml` selects Go 1.24 and Node 22, installs the locked interaction dependencies and Chromium, runs the default keyed runner, and uploads inherited plus keyed build/artifact directories.
- The runner builds `keyed-editor/build/keyed-collection.wasm`, copies `wasm_exec.js` from that Go toolchain's `GOROOT`, and writes `react.bundle.mjs` and `reference.bundle.mjs` under `keyed-editor/build`, which matches the demo imports/fetch path. The keyed runner rebuilds these outputs and does not rely on a checked-in cache.
- `keyed-editor/evidence/inherited-pins.json` records 373 verified old pins and zero mismatches. The keyed entry point always invokes the inherited default path. Root separately reports the full inherited chain passed; I did not repeat that long run.
- The E6 report correctly states that its author lane did not run the full inherited/default keyed runner or full seeded check. I make no claim that the new runner passed end-to-end in this review.

## Demo smoke and remaining correction

The isolated Chromium/real-HTTP smoke passed its other checks: retained input node through same-backend edit/reorder; actual node replacement and logical key/backward-selection restoration on DOM-to-React swap; held HTTP completion updating the retained React input; fetch abort on pending-row removal; stale dispatch rejected without state change; and server error followed by a fresh request-ID retry.

One assertion does not match its stated path-reuse claim. In `demo-smoke.mjs`, row 2 is the last row at `2/1/0` when removed, and newly added row 3 occupies `2/1/0`. The current probe sends old key `row-2-input` at `2/0/0` and inspects the first row's key, so it tests a key mismatch against row 1 rather than stale identity at the reused path. The requested correction is to inspect row 3 at `2/1/0`, dispatch the removed row-2 key at that same path, and assert the snapshot remains unchanged. This is a smoke coverage defect; it does not demonstrate a product dispatch defect. The separate E5 replay already has a correct path-reuse probe.

## Review checks

```sh
bash -n run-keyed-editor.sh
git diff --check -- run-keyed-editor.sh README.md .github/workflows/keyed-editor.yml keyed-editor/coordination/reports/E6.md
```

Both commands exited successfully. The real demo smoke must be rerun in an isolated copy after the path assertion correction before XR-E6 can be marked accepted.
