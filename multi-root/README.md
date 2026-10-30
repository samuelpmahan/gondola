# Multi-root Go sessions

This milestone composes three collection sessions in one browser page. Go owns
session identity, collection state, effects, and audits; the browser owns three
root elements, renderer leases, HTTP lanes, and callback fences. Each root can
use DOM, React, or GoDOM independently.

## Run the complete suite

From the repository root:

```sh
bash run-multi-root.sh
```

The default runner starts with `run-renderer-conformance.sh`. It then builds
the multi-session and GoDOM WebAssembly programs with Go 1.24, copies the
matching `wasm_exec.js`, and runs the new native Go tests, strict bridge
smokes, JavaScript unit tests, real-browser demo smoke, and deterministic
replay. Node 22, the pinned interaction dependencies, and Playwright Chromium
are required. The GitHub Actions workflow installs those dependencies before
running the same command.

To inspect the demo after a successful full run, start the existing HTTP lab
from the repository root:

```sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
```

Open `http://127.0.0.1:8000/multi-root/demo.html`. Three panels show the active
renderer, lane, session snapshot, transport events, and live DOM for each
root. Create and edit rows in separate roots, hold two saves at once, replace
one root's renderer, then dispose one root while its save is held. The late
release must be rejected for that disposed session while the sibling keeps
working. Remounting the vacated root creates a fresh session and lane.

The browser smoke drives the same page and records assertions in
`multi-root/build/`. The deterministic replay defaults to seeds `20261030` and
`20261031`, three fixed witnesses, and 30 generated scripts per seed with at
most 40 actions each. Its report schema is documented in [RESULTS.md](RESULTS.md).

## Evidence status

The full default runner passed, including inherited regressions and the demo.
Final replay: 63 scripts, 1,896 actions, 11,754 actor observations, zero
mismatches and 193/193 native segments. Independent review of the final
lifecycle-oracle repair remains pending because the assigned Luna worker hit
its usage limit. See [RESULTS.md](RESULTS.md) for exact evidence and limits.

The feature scope and explicit non-goals are in [DESIGN.md](DESIGN.md).
