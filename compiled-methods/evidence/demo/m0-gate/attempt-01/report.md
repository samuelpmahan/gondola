# Milestone 0 gate

- Status: `passed`
- Command: `PATH=/tmp/gondola-go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOFLAGS=-buildvcs=false bash run.sh`
- Go: `go version go1.24.0 linux/amd64`
- Node: `v22.23.4`
- Source pins: 27 before, 27 after; match: `true`
- `run.sh` exit code: `0`
- Checks: 5,000 seeded cases matched, M0 receipt matched EXPECTED.json, SHA256SUMS verified
- Full stdout/stderr and SHA-256 pins: `logs/run.stdout.log`, `logs/run.stderr.log` in this attempt.
