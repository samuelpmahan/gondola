#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ASYNC="$ROOT/async-effects"
INTERACTION="$ROOT/interaction"
ESBUILD="$INTERACTION/node_modules/.bin/esbuild"

command -v go >/dev/null || { echo "go is required to build async-save WebAssembly" >&2; exit 127; }
command -v node >/dev/null || { echo "node is required to run async-effects checks" >&2; exit 127; }

cd "$ROOT"

# The default path always preserves the established counter, replacement, and
# controlled-input gates. Set this only after those gates have a passing receipt.
if [[ "${GONDOLA_ASYNC_SKIP_INHERITED:-0}" != "1" ]]; then
  bash "$ROOT/run-controlled-input.sh"
else
  [[ -f "$ROOT/controlled-input/build/react.bundle.mjs" ]] || {
    echo "controlled-input React bundle is missing; run the inherited runner first" >&2
    exit 1
  }
fi

[[ -x "$ESBUILD" ]] || {
  echo "pinned interaction dependencies are missing; install interaction/package.json first" >&2
  exit 1
}

mkdir -p "$ASYNC/build"
GOOS=js GOARCH=wasm go build -o "$ASYNC/build/async-save.wasm" ./cmd/async-save-wasm

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
cp "$WASM_EXEC" "$ASYNC/build/wasm_exec.js"

node "$ROOT/cmd/async-save-wasm/smoke.mjs" \
  "$ASYNC/build/async-save.wasm" \
  "$ASYNC/build/wasm_exec.js"

NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$ASYNC/reference.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$ASYNC/build/reference.bundle.mjs"

go test ./...
node --test "$ASYNC"/*.test.mjs
node "$ASYNC/demo-smoke.mjs"
export GO_COMPARE_BIN="$INTERACTION/build/compare-interaction"
node "$ASYNC/check.mjs" "$@"
