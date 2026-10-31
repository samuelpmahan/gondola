# Compiled keyed child collections

This milestone exercises a typed Go `[]ChildState` as a keyed collection. Go owns child identity, collection order, counters, generation numbers, and request lifetime. The existing compiler emits the Go package as AppIR and JavaScript; the shared runtime mounts that compiled result through either the React or DOM renderer.

The frozen profile includes a parent request scope and child request scopes. Removing a child cancels its pending request before the key can be reused. Reuse receives a fresh generation, so an old token cannot complete work for the new child. Clearing children cancels pending child work in reverse presentation order and preserves a pending parent request. Removing and remounting the parent retires both levels and allocates a fresh parent generation.

The browser demo renders the actual compiled Go `View`. Try adding and moving children, changing counters, starting requests, swapping between React and DOM, rejecting a renderer without `view.node`, and trying a cancelled reply. Reply delivery is manual so pending and stale token behavior is visible.

## Run the full evidence chain

Install the existing locked dependencies and Chromium, then run the single full command:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
bash run-compiled-children.sh
```

The runner invokes `bash run-compiled-capabilities.sh` as a fresh inherited regression, builds the children fixture through `go run ./cmd/gobi-build` for React and DOM, executes the N5 literal oracle and N4 native/direct/browser harness, builds the HTTP demo from the React compiled output, and runs the browser smoke test. There is no partial or reuse mode. A failed stage remains in the receipt and makes the command exit nonzero.

The runner requires Go 1.24, compiler Go 1.27.3, Node 22, Chromium, React/ReactDOM 19.3.1, and the current three npm lockfiles. It does not install or change dependencies during the run. React and DOM builds, command logs, native/direct/browser traces, HTTP smoke output, screenshot, inherited receipt, and an immutable pre-archive snapshot are kept in a unique attempt under `compiled-children/demo/output/attempts/`. The archive manifest stays outside the tar file and is bound by the final receipt. Tar membership, extracted file sizes and hashes, source pins, and archive/manifest bytes are checked after the archive commands.

After a passed run, serve the demo site from the attempt recorded in `compiled-children/coordination/receipts/E-DELIVERY.json`:

```sh
python3 -m http.server 8000 --directory compiled-children/demo/output/attempts/<attempt-id>/demo/site
```

Open [http://localhost:8000](http://localhost:8000). The final report and receipt are written to `compiled-children/coordination/reports/E-DELIVERY.md` and `compiled-children/coordination/receipts/E-DELIVERY.json`.
