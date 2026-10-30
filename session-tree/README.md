# Nested Go collection sessions

This milestone gives each visible collection its own Go session and renderer, then nests those sessions in an immutable parent tree. The demo begins with a DOM family root, a React child, a GoDOM grandchild, and a separate GoDOM sibling root. The parent renderer owns only its view element; the child shells live alongside it in a separate child container, so a parent renderer swap cannot erase the child subtree.

## Run the complete suite

From the repository root:

```sh
bash run-session-tree.sh
```

The default runner starts with the complete `run-multi-root.sh` gate. It then rebuilds the additive multi-root and GoDOM WebAssembly bridges, matching `wasm_exec.js`, React and reference bundles, the native interaction comparator, and the HTTP lab. It runs the session-tree Go tests, race checks and vet, both bridge smokes, every session-tree Node test, the real-browser demo smoke, and the deterministic T5 replay. The required toolchain is Go 1.24, Node 22, the pinned interaction dependencies, and Playwright Chromium. CI installs those dependencies and runs the same entrypoint.

## Inspect the browser demo

After a successful full runner, start the HTTP lab from the repository root:

```sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
```

Open [http://127.0.0.1:8000/session-tree/demo.html](http://127.0.0.1:8000/session-tree/demo.html). Add rows in the nested collections, switch the parent or child renderer, and set a session's next save to Hold. Dispose a child subtree while its descendant requests are held: the Go panel shows the postorder session IDs and per-session cancellation commands, the lab observes each abort, and late releases return HTTP 409. The sibling root keeps its DOM and pending work. Recreate the family root to see a fresh ID and an empty Go collection.

The page's HTTP requests use the real loopback lab and independent lanes. The deterministic replay uses manual transports to produce repeatable ordered start, cancel, and delivery events; it is a separate test and is not presented as a real-server trace.

## Contract and scope

Go owns each collection state, immutable parent relation, session ID, request ID, and atomic postorder disposal. The browser host owns renderer shells, per-session transports, and lifecycle fences. Parent and child collection events remain scoped to their own session. See [DESIGN.md](DESIGN.md) for exact interfaces, limits, fixed replay witnesses, and explicit non-goals. See [RESULTS.md](RESULTS.md) for executed evidence and remaining review/runtime limits.
