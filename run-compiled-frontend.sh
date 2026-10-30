#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [[ -x /tmp/gondola-go/bin/go ]]; then PATH="/tmp/gondola-go/bin:$PATH"; fi
if [[ -x /tmp/gondola-node22/node_modules/node/bin/node ]]; then PATH="/tmp/gondola-node22/node_modules/node/bin:$PATH"; fi
export PATH
cd "$ROOT"
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo 'Node 22 required' >&2; exit 1; }
if [[ "${1:-}" == --compiled-only ]]; then
  shift
else
  # Preserve the Go 1.24 baseline and every inherited interaction gate.
  bash "$ROOT/run-typed-composition.sh"
fi
if [[ -z "${CHROMIUM_PATH:-}" && -x /tmp/chromium ]]; then export CHROMIUM_PATH=/tmp/chromium; fi
export GOTOOLCHAIN=go1.27.3
[[ "$(go version)" == *'go1.27.3 '* ]] || { echo 'Compiler profile requires Go 1.27.3' >&2; exit 1; }
node "$ROOT/compiled-frontend/run.mjs" "$@"
