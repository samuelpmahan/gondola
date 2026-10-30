#!/usr/bin/env bash
# Rewrites SHA256SUMS: the SHA-256 of every source file (not node_modules, not build/).
set -euo pipefail
cd "$(dirname "$0")/.."
{ echo go.mod; echo package.json; echo package-lock.json; echo run.sh; echo EXPECTED.json
  find . -path ./node_modules -prune -o -path ./build -prune -o \( -name '*.go' -o -name '*.mjs' -o -name '*.sh' \) -type f -print | sed 's|^\./||'
} | LC_ALL=C sort -u | xargs sha256sum > SHA256SUMS
cat SHA256SUMS
