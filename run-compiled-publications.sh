#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
if [[ -x /tmp/gondola-go/bin/go ]]; then
  PATH="/tmp/gondola-go/bin:$PATH"
fi
if [[ -x /tmp/gondola-node22/node_modules/node/bin/node ]]; then
  PATH="/tmp/gondola-node22/node_modules/node/bin:$PATH"
fi
if [[ -z "${CHROMIUM_PATH:-}" && -n "${CHROMIUM_EXECUTABLE_PATH:-}" ]]; then
  export CHROMIUM_PATH="$CHROMIUM_EXECUTABLE_PATH"
elif [[ -z "${CHROMIUM_PATH:-}" && -x /tmp/chromium ]]; then
  export CHROMIUM_PATH=/tmp/chromium
fi
if [[ " ${GOFLAGS:-} " != *" -buildvcs=false "* ]]; then
  GOFLAGS="${GOFLAGS:+$GOFLAGS }-buildvcs=false"
fi
export PATH GOFLAGS

cd "$ROOT"
command -v go >/dev/null || { echo "Go 1.24 is required" >&2; exit 127; }
command -v node >/dev/null || { echo "Node 22 is required" >&2; exit 127; }
root_go_version="$(GOTOOLCHAIN=local go version)"
[[ "$root_go_version" == *"go1.24."* ]] || { echo "Go 1.24 is required, got: $root_go_version" >&2; exit 1; }
[[ "$(node -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo "Node 22 is required, got: $(node --version)" >&2; exit 1; }

exec node "$ROOT/compiled-publications/run.mjs" "$@"
