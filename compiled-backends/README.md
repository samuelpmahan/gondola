# Compiled Go applications across replaceable frontends

This milestone stacks on PR11 (`184ccdaabe9e6e46e1052ee79cd7e0be26fe3281`). The counter interaction experiment already exists in PR1 and its later stack. This change adds a second compiled frontend and state-preserving React↔DOM replacement for the existing counter, controlled form, keyed list, and deterministic effect applications. Application Init/Update/View still execute the original Go functions compiled by pinned GoScript v0.6.2; there is no handwritten JavaScript application reducer or WASM in this path.

One runtime holds Go state, the current Go View, ordered dispatches and pending effects. A renderer owns synchronous DOM commits, event callbacks, snapshots, focus and teardown. Replacement captures focus, tears down the previous physical root, renders the cached View and restores logical focus/selection. It calls no application function and creates no application tick or dispatch ID. Retired renderer callbacks are fenced; a completion arriving during replacement drains after replacement returns. Commit failures after teardown halt without rollback. See [CONTRACT.md](CONTRACT.md) for the precise protocol and failure phases.

## Run and demonstrate

Requirements: Go1.24.x, Node22, access to download compiler Go1.27.3, and Chromium. JavaScript dependencies, React/ReactDOM19.3.1 and GoScript are locked in the existing manifests.

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
bash run-compiled-backends.sh
python3 -m http.server 8080
# Open http://127.0.0.1:8080/compiled-backends/artifacts/demo/
```

The default command runs the full inherited gate, compiler gates, both backend builds, five-fixture backend matrix and real HTTP demo smoke. `--backends-only` explicitly skips the inherited compiler/regression chain. `CHROMIUM_EXECUTABLE_PATH` or `CHROMIUM_PATH` may select an installed browser; otherwise the existing managed Playwright launcher is used. The demo has four cards, per-card backend switching, Go state and ordered trace inspection. Its effect host is manual and deterministic.

The Go build request accepts `backend: "react"` or `"dom"`; both use the existing Gobi Backend seam and unchanged AppIR/module contracts. The two builds record separate raw bundle hashes: temporary source labels make their bytes differ. The harness and demo load one concrete emitted module per app and reuse it across both renderer types. Companion AppIR, encoders, generated components, Go forwarding sources, GoScript TypeScript and mapping files compare byte-for-byte. No comment-stripping bundle equivalence is claimed.

## Evidence and scope

[RESULTS.md](RESULTS.md) records commands, actual local versions, seeds, results, failures, archive restoration and limitations. [PLAN.md](PLAN.md) records disjoint ownership and dependency gates. `coordination/` retains native Rebalancer1.0.4 epochs, actual platform-dispatch receipts, author receipts, independent reviews and all amendments; native allocation and actual worker dispatch are separate observations.

For another frontend implementation, implement the synchronous renderer protocol in CONTRACT.md, consume the same Go View/bindings, preserve keys and controlled properties, fence callback lifetimes, support focus capture/restore, and run the same oracle/mutation/lifecycle matrix. Additional Go language/library support requires compiler analysis and native-versus-emitted execution evidence. No frontend-specific application logic is required by this renderer boundary.
