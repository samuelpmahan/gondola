# Gondola interaction environment report

## Provisioned toolchains

- Initial probe: `go` was absent from `PATH` and no executable was found on disk.
- Downloaded official Go 1.24.0 Linux amd64 archive to `/tmp/gondola-go1.24.0.tar.gz` with `curl --max-time 60`; response was HTTP 200, 78,382,844 bytes, 49.63 seconds. Extracted to `/tmp/gondola-go`; `go version` reports `go1.24.0 linux/amd64`.
- Existing Node: `v24.22.1`; npm `11.9.0`.
- Installed Node 22 from npm package `node@22.23.4` into `/tmp/gondola-node22`; `/tmp/gondola-node22/node_modules/node/bin/node --version` reports `v22.23.4`.
- NPM registry returned Playwright `1.64.1` and esbuild `0.28.2`. React and ReactDOM `19.3.1` are confirmed in the original lockfile.

## Commands and results

- `PATH=/tmp/gondola-go/bin:$PATH bash run.sh` — passed. Go vet/tests passed, the 5,000 seeded cases matched, the signed receipt matched, and `SHA256SUMS ok` printed.
- `npm install --package-lock-only --ignore-scripts --prefix interaction --no-audit --no-fund --fetch-timeout=60000 --fetch-retries=1` — passed; generated `interaction/package-lock.json`.
- `npm ci --prefix interaction --no-audit --no-fund` — passed; installed seven locked packages.
- `node --test interaction/*.test.mjs` — passed all eight tests at the time of the run.
- Playwright's official Chromium download started for Chrome for Testing `156.0.8078.4` (Playwright Chromium revision `1248`) but returned a 0 MiB/corrupt zip (`End of central directory record signature not found`). No system Chromium was found in `/usr/bin`, `/opt`, `/ms-playwright`, or the searched executable caches.
- Installed `@sparticuz/chromium@153.0.0` from npm as a local fallback. Its `chromium.br` extracted to `/tmp/chromium`, 209,022,176 bytes; `--version` reports Chromium `153.0.8010.0`. The bundled `tar-fs` extraction attempted unsupported `chown` operations on this overlay filesystem, so only the temporary package copy at `/tmp/gondola-chromium/node_modules/@sparticuz/chromium/build/lambdafs.js` was patched to call `extract(output, { chown: false })`. No repository source was changed for this workaround.
- Full local interaction command: `PATH=/tmp/gondola-go/bin:$PATH CHROMIUM_EXECUTABLE_PATH=/tmp/chromium GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-interaction.sh` — passed. Esbuild completed; all 8 Node tests passed; browser parity matched 107 scripts across 4,473 initial/action ticks for seed `20261030`; the native comparator matched; the demo smoke covered initial, add, reset, and disabled reset; the report has zero mismatches. Browser report version is `153.0.8010.0`.
- CI remains configured to install the pinned Playwright Chromium using the standard Playwright command, with system dependencies.
- Per the parent agent's independent rerun, `bash run.sh` with Node `v22.23.4` also passed and its output is saved as `static-node22.log` in the repository workspace.

## Working-tree scope

- `run.sh` removed/rebuilt only its documented root `node_modules`, `build`, and `react-map.gen.mjs`; the original receipt and checksum check passed.
- Interaction build output is under the ignored `interaction/build/`; interaction npm modules are ignored.
