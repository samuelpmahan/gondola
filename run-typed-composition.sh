#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
COMPOSITION="$ROOT/typed-composition"
BUILD="$COMPOSITION/build"
INTERACTION="$ROOT/interaction"
ESBUILD="$INTERACTION/node_modules/.bin/esbuild"

if ! command -v go >/dev/null && [[ -x /tmp/gondola-go/bin/go ]]; then
  PATH="/tmp/gondola-go/bin:$PATH"
fi
if [[ -x /tmp/gondola-node22/node_modules/node/bin/node ]]; then
  PATH="/tmp/gondola-node22/node_modules/node/bin:$PATH"
fi
export PATH
export GOTOOLCHAIN=local
if [[ -z "${CHROMIUM_EXECUTABLE_PATH:-}" && -x /tmp/chromium ]]; then
  export CHROMIUM_EXECUTABLE_PATH=/tmp/chromium
fi

cd "$ROOT"

# The inherited nested-session runner is the first gate on every default run.
bash "$ROOT/run-session-tree.sh"

command -v go >/dev/null || { echo "Go 1.24 is required" >&2; exit 127; }
command -v node >/dev/null || { echo "Node 22 is required" >&2; exit 127; }
go_version="$(go version)"
[[ "$go_version" == *"go1.24."* ]] || {
  echo "expected Go 1.24, got: $go_version" >&2
  exit 1
}
node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" == "22" ]] || {
  echo "expected Node 22, got: $(node --version)" >&2
  exit 1
}
[[ -x "$ESBUILD" ]] || {
  echo "pinned interaction dependencies are missing after the inherited runner" >&2
  exit 1
}

mkdir -p "$BUILD" "$ROOT/http-effects/build"

GOOS=js GOARCH=wasm go build -o "$BUILD/composition.wasm" ./cmd/composition-wasm
GOOS=js GOARCH=wasm go build -o "$BUILD/godom.wasm" ./cmd/godom-wasm
go build -o "$BUILD/composition-replay" ./cmd/composition-replay
go build -o "$ROOT/http-effects/build/http-lab" ./cmd/http-lab

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
cp "$WASM_EXEC" "$BUILD/wasm_exec.js"

NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$ROOT/keyed-editor/react.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$BUILD/react.bundle.mjs"
NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$COMPOSITION/reference.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$BUILD/reference.bundle.mjs"

go test ./composition ./cmd/composition-wasm ./cmd/composition-replay
go test -race ./composition ./cmd/composition-wasm ./cmd/composition-replay
go vet ./composition ./cmd/composition-wasm ./cmd/composition-replay

node "$ROOT/cmd/composition-wasm/smoke.mjs" "$BUILD/composition.wasm" "$BUILD/wasm_exec.js"
node "$ROOT/cmd/godom-wasm/smoke.mjs" \
  "$BUILD/godom.wasm" \
  "$ROOT/keyed-editor/build/keyed-collection.wasm" \
  "$BUILD/wasm_exec.js"
node --test "$COMPOSITION"/*.test.mjs
node "$COMPOSITION/browser-smoke.mjs"
COMPOSITION_REPLAY_BIN="$BUILD/composition-replay" node "$COMPOSITION/check.mjs" \
  --seeds 20261030,20261031 \
  --cases 30 \
  --max-actions 40 \
  --output "$BUILD/report.json" \
  "$@"
