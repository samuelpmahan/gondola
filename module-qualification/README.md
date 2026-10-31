# Native Go module qualification

This profile independently checks the existing parent/child compiled-module run with Go. It composes three Go verifiers: archive and source-pin validation, bridge ABI admission, and captured native/direct/browser semantics. The Go capture checker reads the real archived captures and replays the fixture; it does not delegate semantic decisions to Node or launch a browser.

## Run

Use a clean Linux/amd64 checkout whose `HEAD` is the source commit being qualified. Install the repository's existing locked Node dependencies and Playwright Chromium, then run:

```sh
CHROMIUM_PATH=/path/to/chromium bash run-module-qualification.sh --source-commit "$(git rev-parse HEAD)"
```

The wrapper resolves `go`, `node`, and `python3` from `PATH`. Set `GOBI_GO_BIN`, `GOBI_NODE_BIN`, or `GOBI_PYTHON_BIN` to select an explicit executable; an invalid override fails closed instead of falling back. The Python consumer uses the standard library only. The profile requires Go 1.24, Node 22, Go compiler toolchain 1.27.3, Python 3, and Chromium available through `CHROMIUM_PATH` or the existing Playwright installation. It has no dependency on a machine-local tool directory or the rebalancer package.

Before starting the producer, the runner tests PATH lookup, explicit executable overrides, and bad-override rejection using isolated executable stubs. It then runs the existing `run-compiled-modules.sh` producer on a fresh attempt, passes that attempt to `cmd/module-qualify` in directory mode and archive mode, and runs the focused Go qualification tests with the real capture root, fresh archive, fresh manifest, and expected source commit supplied explicitly. The suite therefore exercises the actual-archive integration test rather than taking its missing-input skip. It then runs the existing Milestone 0 and counter interaction regressions. The focused suite includes the real-capture acceptance and ten negative mutation controls. The report's capture totals count the fixed scenario and each seed once (144 events and 99 Go updates); the producer separately records the fixed scenario's 24 events, 16 updates, and 17 checkpoints.

Pass `--chromium PATH` to select a browser executable. `--source-commit SHA` is required; the producer verifies that it matches a clean checkout. The runner creates a unique attempt under `module-qualification/output/attempts/` and does not reuse old output.

## Evidence

Each attempt includes command arguments and exit results, tool versions, producer receipt, fresh runtime archive and manifest, directory and archive verifier reports, focused Go test logs, the verifier's Go source closure from `go list -deps -test`, exact profile input pins, and a bundle index. The self-contained `module-qualification-evidence.tar.gz` is accompanied by a manifest with its byte size and SHA-256. A failure writes a failure record and exits nonzero.

The acceptance is finite: one parent/child fixture, the fixed 24-event scenario, three 40-event seeds, React/DOM and swap captures, and ten listed adversarial controls. It does not establish correctness for arbitrary module graphs or malicious producers, nor does it certify additional renderers. Another frontend must implement the same Go module-ABI and renderer contracts, provide an actual capture adapter, and be explicitly added to the Go-checked profile matrix and replay suite. Registering a renderer factory alone does not qualify it; a synthetic third ID is only a host-genericity test. The archive verifier binds source bytes to a commit identifier; it does not authenticate a signer. Linux/amd64 with Go 1.24 is the exercised platform. Other operating systems and architectures are untested; unsupported archive-publication primitives must fail closed rather than fall back to replacement.

Published run records will be linked from the stable acceptance guide: [native module qualification evidence](https://github.com/samuelpmahan/gondola/blob/codex/gobi-native-module-qualification-acceptance-20261031/module-qualification/ci/2026-10-31/current/README.md).
