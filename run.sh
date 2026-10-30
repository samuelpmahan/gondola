#!/usr/bin/env bash
# Reruns the whole Milestone 0 check from scratch and compares it with EXPECTED.json. Exits non-zero on any difference.
set -euo pipefail
cd "$(dirname "$0")"
export GOTOOLCHAIN=local
# 1. Start clean: built output and installed packages are never deliverables.
rm -rf node_modules build react-map.gen.mjs
# 2. Install exactly the pinned packages (react 19.3.1, react-dom 19.3.1, fast-check 4.10.2).
npm ci --no-audit --no-fund
# 3. Write the React mapping from the Go tables.
go run ./cmd/gobi emit react
# 4. Go's own checks: vet, unit tests and the rules table (which also asks React for every row).
go vet ./...
go test ./...
# 5. The 5,000 seeded random cases, Go against React, receipts compared with EXPECTED.json.
go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json
# 6. Every source file is the one that was signed off.
if [ -f SHA256SUMS ]; then sha256sum -c --quiet SHA256SUMS && echo "SHA256SUMS ok"; fi
