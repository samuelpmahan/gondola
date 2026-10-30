#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
INTERACTION="$ROOT/interaction"

command -v go >/dev/null || { echo "go is required to build the WebAssembly counter" >&2; exit 127; }
command -v node >/dev/null || { echo "node is required to run the browser check" >&2; exit 127; }

cd "$ROOT"

if [ "${GONDOLA_SKIP_NPM_CI:-0}" != "1" ]; then
  npm ci --prefix "$INTERACTION" --no-audit --no-fund
fi
mkdir -p "$INTERACTION/build"

if [ "${GONDOLA_SKIP_BROWSER_INSTALL:-0}" != "1" ]; then
  "$INTERACTION/node_modules/.bin/playwright" install chromium
fi

GOOS=js GOARCH=wasm go build -o "$INTERACTION/build/counter.wasm" ./cmd/counter-wasm
go build -o "$INTERACTION/build/compare-interaction" ./cmd/compare-interaction

GOROOT="$(go env GOROOT)"
WASM_EXEC=""
for candidate in "$GOROOT/lib/wasm/wasm_exec.js" "$GOROOT/misc/wasm/wasm_exec.js"; do
  if [ -f "$candidate" ]; then
    WASM_EXEC="$candidate"
    break
  fi
done
if [ -z "$WASM_EXEC" ]; then
  echo "could not find wasm_exec.js under $GOROOT" >&2
  exit 1
fi
cp "$WASM_EXEC" "$INTERACTION/build/wasm_exec.js"

"$INTERACTION/node_modules/.bin/esbuild" \
  "$INTERACTION/react-reference.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  --outfile="$INTERACTION/build/react-reference.bundle.mjs"

export GO_COMPARE_BIN="$INTERACTION/build/compare-interaction"
node --test "$INTERACTION"/*.test.mjs
node "$INTERACTION/check.mjs"
