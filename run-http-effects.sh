#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HTTP="$ROOT/http-effects"
INTERACTION="$ROOT/interaction"
CONTROLLED="$ROOT/controlled-input"
ESBUILD="$INTERACTION/node_modules/.bin/esbuild"

command -v go >/dev/null || { echo "go is required to build HTTP-save WebAssembly and the HTTP lab" >&2; exit 127; }
command -v node >/dev/null || { echo "node is required to run HTTP-effects checks" >&2; exit 127; }

cd "$ROOT"
mkdir -p "$HTTP/build"

receipt="$HTTP/build/inherited-pass.json"

inherited_digest() {
  node --input-type=module -e '
    import { createHash } from "node:crypto";
    import { readdir, readFile } from "node:fs/promises";
    import { extname, join, relative, resolve } from "node:path";
    const root = resolve(process.argv[1]);
    const ignored = new Set([".git", "node_modules", "build", "artifacts", "evidence", "coordination"]);
    const sourceExtensions = new Set([".go", ".mjs", ".sh", ".html", ".json"]);
    const sourceNames = new Set(["go.mod", "go.sum", "SHA256SUMS"]);
    const files = new Set();
    async function walk(path) {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isDirectory() && ignored.has(entry.name)) continue;
        const absolute = join(path, entry.name);
        if (entry.isDirectory()) await walk(absolute);
        else if (entry.isFile() && (sourceNames.has(entry.name) || sourceExtensions.has(extname(entry.name)))) {
          files.add(absolute);
        }
      }
    }
    await walk(root);
    // The signed M0 manifest names its complete source set. Include each
    // referenced file even if its extension is added to this tree later.
    const manifest = await readFile(resolve(root, "SHA256SUMS"), "utf8");
    for (const line of manifest.split(/\r?\n/)) {
      const match = line.match(/^[0-9a-f]{64}\s+(.+)$/);
      if (match) files.add(resolve(root, match[1]));
    }
    const ordered = [...files].sort((a, b) => relative(root, a).localeCompare(relative(root, b)));
    const hash = createHash("sha256");
    for (const file of ordered) {
      hash.update(relative(root, file));
      hash.update("\0");
      hash.update(await readFile(file));
      hash.update("\0");
    }
    process.stdout.write(hash.digest("hex"));
  ' "$ROOT"
}

if [[ "${GONDOLA_HTTP_SKIP_INHERITED:-0}" == "1" ]]; then
  [[ -f "$receipt" ]] || {
    echo "cannot skip inherited checks: no prior passing receipt at $receipt; run the default runner first" >&2
    exit 1
  }
  current_digest="$(inherited_digest)"
  node --input-type=module -e '
    import { readFile } from "node:fs/promises";
    const receipt = JSON.parse(await readFile(process.argv[1], "utf8"));
    if (receipt.schema !== "gondola.http-effects-inherited-pass/v1" || receipt.status !== "passed" ||
        receipt.sourceDigest !== process.argv[2]) {
      throw new Error("prior inherited pass receipt is missing, failed, or stale; run the default runner first");
    }
  ' "$receipt" "$current_digest"
  echo "Using a matching prior inherited pass receipt."
else
  bash "$ROOT/run.sh"
  bash "$ROOT/run-async-effects.sh"
  current_digest="$(inherited_digest)"
  node --input-type=module -e '
    import { mkdir, writeFile } from "node:fs/promises";
    import { dirname } from "node:path";
    const [receiptPath, sourceDigest] = process.argv.slice(1);
    await mkdir(dirname(receiptPath), { recursive: true });
    await writeFile(receiptPath, `${JSON.stringify({
      schema: "gondola.http-effects-inherited-pass/v1",
      status: "passed",
      sourceDigest,
      recordedAt: new Date().toISOString(),
    }, null, 2)}\n`);
  ' "$receipt" "$current_digest"
fi

[[ -x "$ESBUILD" ]] || {
  echo "pinned interaction dependencies are missing; install interaction/package.json first" >&2
  exit 1
}

mkdir -p "$HTTP/build"
GOOS=js GOARCH=wasm go build -o "$HTTP/build/http-save.wasm" ./cmd/http-save-wasm
go build -o "$HTTP/build/http-lab" ./cmd/http-lab

GOROOT="$(go env GOROOT)"
WASM_EXEC=""
for candidate in "$GOROOT/lib/wasm/wasm_exec.js" "$GOROOT/misc/wasm/wasm_exec.js"; do
  if [[ -f "$candidate" ]]; then
    WASM_EXEC="$candidate"
    break
  fi
done
if [[ -z "$WASM_EXEC" ]]; then
  echo "could not find wasm_exec.js under $GOROOT" >&2
  exit 1
fi
cp "$WASM_EXEC" "$HTTP/build/wasm_exec.js"

node "$ROOT/cmd/http-save-wasm/smoke.mjs" \
  "$HTTP/build/http-save.wasm" \
  "$HTTP/build/wasm_exec.js"

NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$CONTROLLED/react.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$HTTP/build/react.bundle.mjs"
NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$HTTP/reference.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$HTTP/build/reference.bundle.mjs"

go test ./...
node --test "$HTTP"/*.test.mjs
node "$HTTP/demo-smoke.mjs"
export GO_COMPARE_BIN="$INTERACTION/build/compare-interaction"
node "$HTTP/check.mjs" "$@"
