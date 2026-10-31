# XR-DELIVERY — independent review of the qualification runner

**Reviewer:** N5  
**Decision:** `amend`

## Scope and packet integrity

Reviewed the sealed N6 E-DELIVERY report, receipt, source inventory, raw-log index, runner, wrapper, workflow, mutation corpus, README, and archive-helper dependency. The sealed report and receipt match their seal hashes. All 26 indexed E-DELIVERY logs match their recorded byte counts and SHA-256 values. All nine source pins in the sealed receipt match the current files; the independently recorded source inventory also matches its pins.

The author packet accurately limits itself to static checks and one preserved failure against an older capture. It explicitly does not claim a fresh producer, full Go suite, directory/archive acceptance, Milestone 0, counter regression, or green CI. I did not run a producer, browser, full suite, or hosted workflow.

## Independent checks

Node 22.23.4 passed `node --check module-qualification/run.mjs`; Bash passed `bash -n run-module-qualification.sh`; and the wrapper’s `--help` exited zero. Go 1.24.0 passed `go list -deps -test -json ./cmd/module-qualify`; the current review snapshot had 11 local packages. The source-closure code includes Go, cgo, internal/external test and embedded files, pins `go.mod`/`go.sum`, explicitly includes the JSON mutation corpus, and records generated test harness files. The sealed author snapshot reports 44 local Go/test files. A later read-only `go list` snapshot yielded 45 file associations; I treat these as distinct snapshots while other lanes were changing Go sources.

The workflow parses as YAML. Push and pull-request filters match exactly across 38 paths; the job uses `ubuntu-latest`, sets the Go and Node setup actions, checks out the same PR-head/SHA it records in `SOURCE_COMMIT`, and uploads the attempt on completion. The README states Linux/amd64 as the exercised target and says other operating systems and architectures are untested, which is consistent with the bounded profile. The focused Go-test gate in the runner requires the real-capture test, rejects skips/failures, and compares the passed names of all ten mutation subtests with the pinned corpus. It supplies all four `GOBI_MODULE_*` values, runs directory and archive verification, and compares their capture, ABI, and input inventories.

## Finding — hosted workflow uses unavailable local tool paths

At `module-qualification/run.mjs:470–471`, absent overrides select `/tmp/gondola-go/go/bin/go` and `/tmp/rebalancer-env/bin/python`. The committed workflow installs Go through `actions/setup-go`, installs Node through `actions/setup-node`, and invokes the wrapper without setting `GOBI_GO_BIN` or `GOBI_PYTHON_BIN`. The wrapper’s preflight resolves Go from `PATH`, but the Node runner then executes the fixed Go path. A standard GitHub-hosted Ubuntu runner does not provide these task-local `/tmp` paths, so the workflow reaches `tool-go-version` with a missing executable. Supplying only `GOBI_GO_BIN` would still leave the Python path hardcoded.

This is a source/workflow finding, not a hosted-run observation. The fixed paths exist in this review environment, so local syntax/help checks cannot expose it. Resolve Go and Python from `PATH` when overrides are absent, or pass the setup-installed executable paths in workflow env; then exercise the wrapper in a clean runner. The issue prevents accepting the runner as a portable workflow as currently authored.

## Boundaries

The old archive CLI mismatch is preserved and correctly described as a prepublication result against an older capture; I do not infer its cause or treat it as current acceptance. The source-closure algorithm and archive composition are statically coherent, but this packet does not prove a fresh producer run, end-to-end directory/archive equivalence, bundle extraction, Milestone 0, counter interaction, or CI execution. Those checks remain for the clean-candidate run. Hash and commit fields establish internal consistency, not publisher authenticity.

Raw review commands, exact tool versions, source excerpts, E-DELIVERY pin audit, and the indexed evidence are under `native-module-coordination/rawlogs/XR-DELIVERY/`.
