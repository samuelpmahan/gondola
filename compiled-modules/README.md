# Independently compiled Go modules

The module profile compiles the parent and child Go fixtures in separate GoScript Build calls for React and DOM. Their bridge roles and primitive input/publication records are checked against a generated ABI descriptor before mounting. JavaScript transports those records; Go owns all state transitions.

## Run

Install the repository's existing locked dependencies, then run the profile with a source label and browser path:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
CHROMIUM_PATH=/path/to/chromium bash run-compiled-modules.sh --source-commit <40-character-git-sha>
```

The runner uses Go 1.24 for application tests/native traces, Go 1.27.3 through `GOTOOLCHAIN` for compiler Build calls, Node 22, and pinned React 19.3.1. It creates a unique attempt under `compiled-modules/output/attempts/` and a separate immutable execution receipt under `compiled-modules/evidence/attempts/`. An execution receipt is not a backendqualification certificate.

`--source-commit` must match the checkout's current 40-character Git HEAD. The runner records working-tree status and requires a clean tree for acceptance; `--allow-dirty` is only for author diagnostics and never turns a dirty run into a source-matched result.

The runner executes focused Go and Node regression suites, captures a fresh native trace, issues four independent GoScript Build calls (one parent and one child for each renderer), replays the literal scenario through native/direct/browser paths, builds the HTTP demo, and verifies its mounted UI. It records exact tool versions, commands, source hashes, module ABI descriptors, generated artifact hashes, seeded runs, and archive member hashes in a unique attempt. An independent Python archive consumer checks the published archive after the producer and archive helper return.

The bounded scenarios cover the parent/child ABI declared in the project contract, Add and Reset including zero, step and lock inputs, revision-checked publications, fail-closed incompatible ABI admission, and DOM/React rendering and swaps. Inspect the attempt's native trace, four separate build manifests and artifacts, conformance captures, demo smoke result, source pins, archive manifest, archive, and post-command consumer result.

To run the existing Milestone 0 and counter interaction regressions separately:

```sh
bash run.sh
npm ci --prefix interaction --no-audit --no-fund
interaction/node_modules/.bin/playwright install chromium
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-interaction.sh
```

## Evidence limits

The profile tests one separately built parent and one separately built child with the declared primitive ABI and the tested React/DOM renderers. It does not certify arbitrary module graphs or Go programs, async effects, malicious-code containment, cryptographic provenance, pixels, additional browsers, or other operating systems. Archive hashes establish byte consistency against the manifest; the semantic comparator is separately recorded and does not reuse the unrelated 13-case backend qualification certificate.

To qualify another frontend renderer, implement the existing shared renderer interface (`update`, `viewRecord`, `domSnapshot`, and `unmount`), declare its renderer capabilities, preserve Gobi's exact bindings and disabled-control behavior, and use the pair host's scoped callbacks. Register it through the host's lazy renderer factory and run the same fresh native, direct, browser, swap, and stale-callback checks with the literal fixture. The Go bridge ABI and generated module ABI remain unchanged for another renderer. The current Go wire package and pair host are fixture-specific; supporting additional wire types, arbitrary graphs, or more module roles requires a new contract version and matching evidence.
