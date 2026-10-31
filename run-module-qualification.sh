#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

resolve_executable() {
  local variable_name="$1"
  local default_name="$2"
  local requested="${!variable_name:-$default_name}"
  local resolved=""

  if [[ "$requested" == */* ]]; then
    if [[ "$requested" != /* ]]; then
      requested="$ROOT/$requested"
    fi
    if [[ -x "$requested" && -f "$requested" ]]; then
      resolved="$requested"
    fi
  else
    resolved="$(command -v -- "$requested" 2>/dev/null || true)"
  fi

  if [[ -z "$resolved" || ! -x "$resolved" || ! -f "$resolved" ]]; then
    echo "$variable_name must name an executable, or $default_name must be available on PATH" >&2
    return 1
  fi
  printf '%s\n' "$resolved"
}

go_bin="$(resolve_executable GOBI_GO_BIN go)" || exit 127
node_bin="$(resolve_executable GOBI_NODE_BIN node)" || exit 127
export GOBI_GO_BIN="$go_bin"
export GOBI_NODE_BIN="$node_bin"
if [[ " ${GOFLAGS:-} " != *" -buildvcs=false "* ]]; then
  GOFLAGS="${GOFLAGS:+$GOFLAGS }-buildvcs=false"
fi
export PATH GOFLAGS

root_go_version="$(GOTOOLCHAIN=local "$go_bin" version)"
[[ "$root_go_version" == *"go1.24."* ]] || { echo "Go 1.24 is required, got: $root_go_version" >&2; exit 1; }
[[ "$("$node_bin" -p 'process.versions.node.split(".")[0]')" == 22 ]] || { echo "Node 22 is required, got: $("$node_bin" --version)" >&2; exit 1; }

exec "$node_bin" "$ROOT/module-qualification/run.mjs" "$@"
