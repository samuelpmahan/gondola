#!/usr/bin/env bash
# Reruns the whole Milestone 0 and Milestone 1 checks from scratch and compares them with EXPECTED.json and
# EXPECTED-INERTIA.json. Exits non-zero on any difference.
set -euo pipefail
cd "$(dirname "$0")"
export GOTOOLCHAIN=local
# 1. Start clean: built output and installed packages are never deliverables.
rm -rf node_modules build react-map.gen.mjs
# 2. Install exactly the pinned packages (react 19.3.1, react-dom 19.3.1, fast-check 4.10.2, @inertiajs/core and
#    @inertiajs/react 3.9.1, jsdom 29.1.1).
npm ci --no-audit --no-fund
# 3. Write the React mapping from the Go tables.
go run ./cmd/gobi emit react
# 4. Go's own checks: vet, unit tests and the rules table (which also asks React for every row).
go vet ./...
# (asks/ holds the users' own checks of Milestone 1; they are graded in their rounds, not here.)
go test $(go list ./... | grep -v /asks/)
# 5. Milestone 1: the Go Inertia server graded by Inertia itself (random first paints, random props, the rules table and
#    the protocol checks run with Inertia's own client in jsdom), receipts compared with EXPECTED-INERTIA.json.
go run ./cmd/gobi check inertia --expect EXPECTED-INERTIA.json
# 6. The 5,000 seeded random cases, Go against React, receipts compared with EXPECTED.json.
go run ./cmd/gobi check html --cases 5000 --seed 20261030 --expect EXPECTED.json
# 7. Every source file is the one that was signed off.
if [ -f SHA256SUMS ]; then sha256sum -c --quiet SHA256SUMS && echo "SHA256SUMS ok"; fi
