#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
if ! command -v go >/dev/null && [[ -x /tmp/gondola-go/bin/go ]]; then
  PATH="/tmp/gondola-go/bin:$PATH"
fi
if [[ -x /tmp/gondola-node22/node_modules/node/bin/node ]]; then
  PATH="/tmp/gondola-node22/node_modules/node/bin:$PATH"
fi
export PATH
export GOBI_METHODS_ENTRYPOINT="${GOBI_METHODS_ENTRYPOINT:-bash run-compiled-methods.sh}"

exec node "$ROOT/compiled-methods/run.mjs" "$@"
