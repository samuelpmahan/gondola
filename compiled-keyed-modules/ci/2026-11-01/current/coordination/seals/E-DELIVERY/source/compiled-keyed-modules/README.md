# Compiled keyed modules

This profile compiles the existing counter child separately from a Go-owned parent that tracks keyed membership and generations. The finite demo mounts keys `a` and `b`, then exercises independent counter updates, removal and remount, reorder preservation, lock and step propagation, and DOM/React renderer swaps. The same source modules are built independently for both renderers.

## Run

Install the repository's existing locked dependencies, then run with Go 1.24, Node 22, and a Chromium executable available on `PATH` or supplied through `CHROMIUM_PATH`:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
CHROMIUM_PATH=/path/to/chromium bash run-keyed-modules.sh --source-commit <40-character-git-sha>
```

Set `GOBI_GO_BIN`, `GOBI_NODE_BIN`, or `GOBI_PYTHON_BIN` to select explicit Go, Node, or Python executables. If unset, the wrapper uses `PATH`. Compiler Build calls use the repository's existing Go toolchain pin through `GOTOOLCHAIN`; no package or lockfile changes are needed.

The runner creates a unique attempt under `compiled-keyed-modules/output/attempts/` and an immutable receipt under `compiled-keyed-modules/evidence/attempts/`. It records source pins, exact tool versions and command logs, four independent Build outputs, fresh native and direct captures, browser captures and mounted demo smoke, healthy oracle results, mutation-control results, and archive member hashes. `--allow-dirty` enables author diagnostics; it does not produce a source-matched receipt.

## Evidence limits

The profile covers two keys and the literal operations recorded in its fixture. Browser controls are dispatched through programmatic `HTMLElement.click()`; this does not claim trusted pointer or OS input. The profile does not cover unbounded collections, arbitrary module graphs, asynchronous effects, hostile-code containment, or renderer behavior outside the checked DOM and React profiles. A passing local run records reproducibility evidence for its pinned source; acceptance still requires a clean-source run and independent review.
