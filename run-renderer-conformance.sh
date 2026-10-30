#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CONFORMANCE="$ROOT/renderer-conformance"
BUILD="$CONFORMANCE/build"
ESBUILD="$ROOT/interaction/node_modules/.bin/esbuild"

# Match the toolchain locations used by the inherited keyed-editor runner.
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

cd "$ROOT"
mkdir -p "$BUILD"

# This always executes the keyed runner's default full inherited chain first.
# Its only supported provisioning opt-outs are inherited unchanged from the
# caller and are valid only after the interaction packages and browser exist.
bash "$ROOT/run-keyed-editor.sh"

[[ -x "$ESBUILD" ]] || {
  echo "pinned interaction dependencies are missing after the inherited runner; install interaction/package.json first" >&2
  exit 1
}

go build -o "$BUILD/render-contract" ./cmd/render-contract
"$BUILD/render-contract" manifest > "$BUILD/manifest.json"
go run ./cmd/conformance-fixtures > "$BUILD/fixtures.json"
GOOS=js GOARCH=wasm go build -o "$BUILD/godom.wasm" ./cmd/godom-wasm

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

node "$ROOT/cmd/godom-wasm/smoke.mjs" \
  "$BUILD/godom.wasm" \
  "$ROOT/keyed-editor/build/keyed-collection.wasm" \
  "$BUILD/wasm_exec.js"

go test ./...
RENDER_CONTRACT_BIN="$BUILD/render-contract" node "$CONFORMANCE/fixture-check.mjs" "$BUILD/fixtures.json"
node --test "$CONFORMANCE"/*.test.mjs
node "$CONFORMANCE/fixture-check.browser.mjs"
node "$CONFORMANCE/demo-smoke.mjs"
node "$CONFORMANCE/check.mjs" "$@"
