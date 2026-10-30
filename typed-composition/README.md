# Typed parent and child collection composition

This milestone gives a Go-owned collection session typed inputs from its immediate parent and lets the child publish a saved row into the parent's durable Inbox. A publication receipt captures the child's current saved value, save count, and input revision. The child and parent keep separate collection state and renderers, and a parent's receipts remain after child disposal.

## Run the full suite

From the repository root:

```sh
bash run-typed-composition.sh
```

The runner first executes the full inherited `run-session-tree.sh` gate. It then builds the composition and GoDOM WebAssembly programs, the native replay command, the React and reference bundles, and the HTTP lab. It runs the focused Go test, race, and vet gates; both WASM smokes; composition Node tests; the real HTTP browser walkthrough; and the seeded independent browser/native replay. The supported toolchain is Go 1.24 and Node 22 with the pinned interaction packages and Playwright Chromium.

## Inspect the browser demo

After the runner succeeds, start the loopback HTTP lab from the repository root:

```sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
```

Open [http://127.0.0.1:8000/typed-composition/demo.html](http://127.0.0.1:8000/typed-composition/demo.html). Edit the parent policy to change the child title or make the child read-only. Add and save a child row; the child uses a real HTTP request. Publish a saved row into the parent Inbox, then dispose and recreate the child to see that the parent's Go receipt remains and the replacement receives a fresh session ID.

Each session can use DOM, React, or GoDOM. Renderer changes keep Go-owned state, logical focus, selection, and nested session shells. A pending save still completes when the child becomes read-only; all child view controls and publication are disabled until its parent re-enables it.

See [DESIGN.md](DESIGN.md) for the exact Go and browser-host contracts and the stated limits of this experiment.
