#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
KEYED="$ROOT/keyed-editor"
INTERACTION="$ROOT/interaction"
ESBUILD="$INTERACTION/node_modules/.bin/esbuild"

# The pinned local toolchain used by the project workspace. CI setup-go and
# setup-node remain authoritative when these paths are not present.
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
command -v npm >/dev/null || { echo "npm is required for the inherited runner" >&2; exit 127; }

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
mkdir -p "$KEYED/build"

# Always run the inherited default path here. That path runs the signed M0
# baseline, async-effect regressions, HTTP lab build, and HTTP-effects checks.
# This feature entry point deliberately has no inherited skip mode.
unset GONDOLA_HTTP_SKIP_INHERITED
unset GONDOLA_ASYNC_SKIP_INHERITED
bash "$ROOT/run-http-effects.sh"

# The inherited default runner installs the pinned interaction dependencies
# on a fresh checkout. Check for its esbuild only after that provisioning step.
[[ -x "$ESBUILD" ]] || {
  echo "pinned interaction dependencies are missing after the inherited runner; install interaction/package.json first" >&2
  exit 1
}

wasm="$KEYED/build/keyed-collection.wasm"
GOOS=js GOARCH=wasm go build -o "$wasm" ./cmd/collection-wasm

goroot="$(go env GOROOT)"
wasm_exec=""
for candidate in "$goroot/lib/wasm/wasm_exec.js" "$goroot/misc/wasm/wasm_exec.js"; do
  if [[ -f "$candidate" ]]; then
    wasm_exec="$candidate"
    break
  fi
done
if [[ -z "$wasm_exec" ]]; then
  echo "could not find wasm_exec.js under $goroot" >&2
  exit 1
fi
cp "$wasm_exec" "$KEYED/build/wasm_exec.js"

[[ -f "$ROOT/cmd/collection-wasm/smoke.mjs" ]] || {
  echo "the collection WASM smoke is missing" >&2
  exit 1
}
node "$ROOT/cmd/collection-wasm/smoke.mjs" "$wasm" "$KEYED/build/wasm_exec.js"

NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$KEYED/react.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$KEYED/build/react.bundle.mjs"
NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$KEYED/reference.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$KEYED/build/reference.bundle.mjs"

go test ./...
node --test "$KEYED"/*.test.mjs
node "$KEYED/demo-smoke.mjs"
node "$KEYED/check.mjs" "$@"
