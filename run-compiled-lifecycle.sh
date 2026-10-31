#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
if [[ -x /tmp/gondola-go/bin/go ]]; then
  PATH="/tmp/gondola-go/bin:$PATH"
fi
if [[ -x /tmp/gondola-node22/node_modules/node/bin/node ]]; then
  PATH="/tmp/gondola-node22/node_modules/node/bin:$PATH"
fi
if [[ -z "${CHROMIUM_PATH:-}" && -x /tmp/chromium ]]; then
  export CHROMIUM_PATH=/tmp/chromium
fi
export PATH
export GOBI_LIFECYCLE_ENTRYPOINT="${GOBI_LIFECYCLE_ENTRYPOINT:-bash run-compiled-lifecycle.sh}"

cd "$ROOT"
command -v go >/dev/null || { echo "Go 1.24 is required" >&2; exit 127; }
command -v node >/dev/null || { echo "Node 22 is required" >&2; exit 127; }
[[ "$(go version)" == *"go1.24."* ]] || { echo "Go 1.24 is required, got: $(go version)" >&2; exit 1; }
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo "Node 22 is required, got: $(node --version)" >&2; exit 1; }

exec node "$ROOT/compiled-lifecycle/run.mjs" "$@"
