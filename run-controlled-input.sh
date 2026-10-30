#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONTROLLED="$ROOT/controlled-input"
INTERACTION="$ROOT/interaction"
ESBUILD="$INTERACTION/node_modules/.bin/esbuild"

command -v go >/dev/null || { echo "go is required to build the controlled-input WebAssembly editor" >&2; exit 127; }
command -v node >/dev/null || { echo "node is required to run controlled-input checks" >&2; exit 127; }

cd "$ROOT"

# Re-run the already established counter and replaceable-renderer gates first.
bash "$ROOT/run-backend-replacement.sh"

[[ -x "$ESBUILD" ]] || {
  echo "pinned interaction dependencies are missing after run-backend-replacement.sh" >&2
  exit 1
}

mkdir -p "$CONTROLLED/build"
GOOS=js GOARCH=wasm go build -o "$CONTROLLED/build/editor.wasm" ./cmd/editor-wasm

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
cp "$WASM_EXEC" "$CONTROLLED/build/wasm_exec.js"

NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$CONTROLLED/react.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$CONTROLLED/build/react.bundle.mjs"

NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$CONTROLLED/reference.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$CONTROLLED/build/reference.bundle.mjs"

go test ./...
node --test "$CONTROLLED"/*.test.mjs
node "$CONTROLLED/demo-smoke.mjs"
export GO_COMPARE_BIN="$INTERACTION/build/compare-interaction"
node "$CONTROLLED/check.mjs" "$@"
