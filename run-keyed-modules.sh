#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

resolve_command() {
  local explicit="$1"
  local name="$2"
  if [[ -n "$explicit" ]]; then
    [[ -x "$explicit" ]] || { echo "$name executable is not runnable: $explicit" >&2; exit 127; }
    printf '%s\n' "$explicit"
    return
  fi
  command -v "$name" || { echo "$name is required on PATH or through its GOBI_*_BIN override" >&2; exit 127; }
}

GO_BIN="$(resolve_command "${GOBI_GO_BIN:-}" go)"
NODE_BIN="$(resolve_command "${GOBI_NODE_BIN:-}" node)"
if [[ -n "${GOBI_PYTHON_BIN:-}" ]]; then
  PYTHON_BIN="$(resolve_command "$GOBI_PYTHON_BIN" python3)"
else
  PYTHON_BIN="$(command -v python3 || command -v python || true)"
  [[ -n "$PYTHON_BIN" ]] || { echo "python3 or python is required on PATH or through GOBI_PYTHON_BIN" >&2; exit 127; }
fi

GO_VERSION="$(GOTOOLCHAIN=local "$GO_BIN" version)"
[[ "$GO_VERSION" == *"go1.24."* ]] || { echo "Go 1.24 is required, got: $GO_VERSION" >&2; exit 1; }
NODE_VERSION="$("$NODE_BIN" --version)"
[[ "$("$NODE_BIN" -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo "Node 22 is required, got: $NODE_VERSION" >&2; exit 1; }

export GOBI_GO_BIN="$GO_BIN"
export GOBI_PYTHON_BIN="$PYTHON_BIN"
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.27.3}"
export GOFLAGS="${GOFLAGS:+$GOFLAGS }-buildvcs=false"

cd "$ROOT"
exec "$NODE_BIN" "$ROOT/compiled-keyed-modules/run.mjs" "$@"
