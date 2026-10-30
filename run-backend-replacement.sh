#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
INTERACTION="$ROOT/interaction"
REPLACEMENT="$ROOT/backend-replacement"
ESBUILD="$INTERACTION/node_modules/.bin/esbuild"

command -v node >/dev/null || { echo "node is required to run backend replacement checks" >&2; exit 127; }

cd "$ROOT"

# Keep the existing Go/WASM and independent React interaction checks in the
# replacement runner so the demo and new backend are built on known-good inputs.
bash "$ROOT/run-interaction.sh"

[[ -x "$ESBUILD" ]] || {
  echo "pinned interaction dependencies are missing after run-interaction.sh" >&2
  exit 1
}

mkdir -p "$REPLACEMENT/build"
NODE_PATH="$INTERACTION/node_modules" "$ESBUILD" \
  "$REPLACEMENT/react-backend.mjs" \
  --bundle \
  --format=esm \
  --platform=browser \
  "--outfile=$REPLACEMENT/build/react-backend.bundle.mjs"

export GO_COMPARE_BIN="$INTERACTION/build/compare-interaction"
node --test "$REPLACEMENT"/*.test.mjs
node "$REPLACEMENT/demo-smoke.mjs"
node "$REPLACEMENT/check.mjs" "$@"
