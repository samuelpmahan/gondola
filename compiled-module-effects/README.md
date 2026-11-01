# Compiled keyed module effects

This profile keeps the existing Go keyed parent and compiled counter child, and adds an independently compiled child that starts a cancellable request/reply effect. The closed `fixture.request/save` descriptor is a fixture label: the timer echoes the opaque request token and does not persist data or send an HTTP request. Go owns each request token, pending state, cancellation declaration, and reply transition. The host only routes the declared request and cancellation descriptors. A deferred transport drives conformance; the browser demo uses a real `setTimeout` and clears pending timers when Go requests cancellation.

## Run

Install the repository's existing locked dependencies, then use Go 1.24, Node 22, Python 3, and Chromium:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
CHROMIUM_PATH=/path/to/chromium bash run-module-effects.sh --source-commit <40-character-git-sha>
```

The wrapper resolves Go, Node, and Python from `PATH`. Set `GOBI_GO_BIN`, `GOBI_NODE_BIN`, or `GOBI_PYTHON_BIN` to choose an explicit executable. The Go compiler toolchain is pinned to 1.27.3 for compiler calls. The runner accepts `--chromium`, `--output-root`, and an author-only `--allow-dirty` option in addition to the required source commit; clean-source acceptance uses the exact commit recorded in the receipt.

Each run creates a unique attempt under `compiled-module-effects/output/attempts/` and durable run evidence under `compiled-module-effects/evidence/attempts/`. The attempt records four independent parent/child builds, native/React/DOM/browser/swap captures for one literal and three seeded scenarios, request and cancellation ledgers, oracle checks and mutation controls, the mounted timer demo smoke, exact tool and source pins, command logs, an archived source and evidence snapshot, and an independent archive consumer result. The runner executes the new native fixture/command tests, the exact closed-effect capability admission regression, five focused Go 1.27.3 compiler tests for nested dependency loading, safe integer handling, and Build stage diagnostics, every Node test in this profile, and the archive helper test. CI also runs the inherited M0, counter interaction, and PR22 keyed-module profiles as separate steps before this new profile.

The profile archive contains the new-effects, compiler, and test dependency closure; it is not a complete M0/counter checkout. To rerun the inherited M0 and counter checks, use the full Git checkout with `bash run.sh` and `bash run-interaction.sh`. E-REG separately binds the 295 source inputs used by those regressions.

## What this checks

The capture contract checks the full keyed Go parent and child states, emitted effect descriptors, cancellation order, pending transport correlations, tree/DOM state, and disabled controls. The native path exercises Go transitions directly, the direct paths call the host without browser input, and browser profiles activate actual `HTMLElement.click()` events. Renderer swaps preserve in-flight transport work; removal asks Go to unmount and cancel before renderer teardown; remounting reuses the key with a new generation.

The browser demo starts a cancellable timer-backed request, echoes its opaque token, and displays the fixture's pending/reply labels. It does not persist counter data, make an HTTP request, or guarantee trusted pointer or operating-system input. Results cover the frozen literal and seeded scenarios and the recorded React/DOM profiles; they do not claim arbitrary module graphs or hostile-code containment.
