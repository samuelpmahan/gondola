# E-REPRODUCTION-GUIDE-CHECK (N5)

**Outcome:** `confirmed_reuse` for the reproduction and artifact path facts; final acceptance remains gated.  
**Source checked:** `gondola-children-archive` at `462a9827bfe1980600456b00d0a67843eaa9756d`.  
**Scope:** read-only review of `compiled-children/README.md`, the full runner/toolchain scripts, package locks, seed/browser routing, the preserved 978 receipt, and its actual archive. No README or source changes, tests, npm installs, full runner, archive extraction, Git operation, or native state write were performed.

## Full reproduction facts verified against source 462

From the repository root, the documented setup and command align with the locked projects and runner:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium

export PATH="/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH"
export CHROMIUM_PATH=/tmp/chromium

bash run-compiled-children.sh
```

The source wrapper selects the supplied local Go and Node paths when present, selects `/tmp/chromium` when no Chromium path is set and that executable exists, adds `-buildvcs=false`, and checks for Go 1.24 and Node 22. The full runner uses Go 1.24 with `GOTOOLCHAIN=local` for native Go and Go 1.27.3 with `GOTOOLCHAIN=go1.27.3` for the compiler. The source package files pin React and ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2 (also in `compiled-frontend`). Dependencies are installed from the three checked-in npm lockfiles; the full runner is full-only and records the installed versions and lock hashes.

The pipeline includes the fresh inherited capabilities chain, new host/harness tests, React and DOM GoScript builds, the independent literal oracle, fixed native/direct/browser replay, bounded seeded replays, and the compiled HTTP demo/browser smoke. The fresh oracle’s native Go trace is retained at `attempt/oracle/native.json` and pinned in the oracle receipt’s `archivedInputs`.

The fixed browser capture covers React, DOM, and compatible swap profiles. Seeded replay uses `[20261031, 20261032, 20261033]`; all three seeds run native and both direct compiled modules, while only the first seed (`20261031`) receives a mounted browser swap-profile replay.

If a direct React-map regeneration command is shown, use `go run ./cmd/gobi emit react` without redirecting stdout into `react-map.gen.mjs`: the emitter writes that file itself (or the path supplied with `--out`). The full reproduction command already invokes its inherited stage.

## Attempt, archive, restore, and HTTP paths

The runner writes the attempt to `compiled-children/demo/output/attempts/attempt-<timestamp>-<pid>/`. The report and author receipt are under `compiled-children/coordination/`; the `.tar.gz` and external `.archive-manifest.json` are siblings of the attempt directory. Use the exact attempt and both expected SHA-256 values from the final root acceptance evidence, not a guessed attempt name.

The 978 archive is a single 16,625,595-byte `.tar.gz`; it is not split into chunks. Its manifest lists 239 member paths relative to the attempt root. The actual tar listing begins with `demo/...`; the site files are exactly `demo/site/demo-build.json`, `demo/site/demo.bundle.mjs`, `demo/site/demo.css`, `demo/site/entry.mjs`, and `demo/site/index.html`. Thus extracting with `tar -xzf "$archive" -C "$restore_root"` produces `$restore_root/demo/site`. Serve that directory (the HTML uses root-relative `/demo.css` and `/demo.bundle.mjs` paths):

```sh
attempt_dir="<exact attempt path from the final acceptance receipt>"
archive="${attempt_dir}.tar.gz"
manifest="${attempt_dir}.archive-manifest.json"
restore_root="$(mktemp -d)"

node compiled-children/demo/verify-archive.mjs \
  --archive "$archive" \
  --manifest "$manifest" \
  --output "$restore_root/archive-verification.json" \
  --expected-archive-sha256 "<archive SHA-256 from final acceptance>" \
  --expected-manifest-sha256 "<manifest SHA-256 from final acceptance>"
tar -xzf "$archive" -C "$restore_root"
python3 -m http.server 8000 --directory "$restore_root/demo/site"
```

Open `http://localhost:8000/`. The verification command checks the archive and external manifest hashes and independently lists, extracts to a temporary directory, and hashes the manifest members. The separate `tar` command above restores the same relative member paths to the chosen restore root. The demo is a static site bundle; the browser demo hosts the GoScript app and manual effect-reply controls in the page, so serving `demo/site` is the correct root.

If a future publisher distributes the tarball as chunks, reassemble the exact byte stream using that publication’s ordered chunk inventory before running the hash verification and extraction commands. The 978 local artifact and its manifest do not contain a chunk inventory, so no chunk filenames or concatenation order are asserted here.

## Prior 978 evidence boundary

The preserved 978 E-DELIVERY receipt is **failed overall**, not acceptance evidence. Its HTTP browser smoke and 239-member archive round trip passed, but the inherited capability startup-regression gate failed: the gate required three TAP tests while the suite returned five passing tests. Source 462 now requires at least five clean passes. The 978 archive was used only to verify the artifact layout and restore root described above.

At assignment handoff, the source-462 full run was still in progress. I did not inspect its live attempt or receipt. The final guide must remain gated on the root-owned runtime acceptance: read the final receipt/attempt from the designated third worktree and the dedicated `E-ACCEPTANCE` packet. The primary canonical `E-DELIVERY` file is the worker’s author packet, not a substitute for that acceptance. After acceptance, bind any demo/archive instructions to that exact final receipt and source commit.

The README is included in the source-bound runner pins. Any later README edit must be made before the final capture, or followed by a fresh source-bound capture.
