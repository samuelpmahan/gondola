# gondola

Gobi, Milestone 0: Go writes HTML that is byte identical to React 19.3.1's `renderToStaticMarkup`, checked over
5,000 seeded random cases.

Gobi is a front-end architecture in which application code is plain Go written against one interface. A screen is a value
(`gobi.Node`), a user action is a value (`gobi.Message`) and a side effect is a value (`gobi.Effect`). Each front-end
framework is a backend that implements the interface, and each backend is checked against a golden reference. React is
the first golden reference.

## Run it

```
bash run.sh
```

This needs Go 1.24 and Node 22. It installs the pinned packages (react 19.3.1, react-dom 19.3.1, fast-check 4.10.2),
generates the React mapping from the Go tables, and runs `go vet` and `go test`. It then checks 5,000 cases with
seed 20261030 against `EXPECTED.json` and every source file against `SHA256SUMS`. A passing run ends with:

```
same over 5000 inputs
receipt matches
SHA256SUMS ok
```

## The cleanroom rule

React is a black box. No React source was read to write this: every rule came from rendering a Node with React and
reading the difference. Each rule is one row in `gobi/rules_test.go`. `go test` checks every row against Go and asks
React to render the row again, so the spec checks itself. There are 59 rows.

## Layout

| Path | What it is |
| --- | --- |
| `gobi/node.go` | The run-time interface: `Node`, `Attr`, `Style`, `On`, `Message`, `Effect`. Concrete types only, so goscript can compile it to synchronous TypeScript. |
| `gobi/build.go` | The build-time interfaces: `Backend`, `Oracle`, `Trace`, `Tick`, `Compare`. |
| `gobi/names.go` | The single table of attribute names (DOM name, React prop, written name) and boolean attributes. |
| `gobi/html.go` | The Go static HTML backend. |
| `gobi/rules_test.go` | The 59 React rules, as executable rows. |
| `wire/` | JSON transport that keeps JavaScript text exact, lone surrogates included (Go strings hold WTF-8). |
| `reactmap/` | Writes `react-map.gen.mjs` from the Go tables (generated, not committed). |
| `cmd/gobi` | `emit react`, `check html` (with `--fast --agent N` for a 10% sample per agent), and `hunt html`, which shrinks failures. |
| `gen-cases.mjs` | The seeded fast-check generator of random Nodes. |
| `react-side.mjs` | Renders each case with React. |
| `counter/` | The smallest component, by convention: `Init`, `Update`, `View`. |
| `EXPECTED.json`, `SHA256SUMS` | The receipts: versions, seed, hashes of the cases and the verdict, and of every source file. |

## Keyed collection editor

The keyed collection milestone keeps row IDs, drafts, saved values, save status, and request IDs in one Go `collection.Session`. Its Gobi tree assigns stable keys to rows and controls. The browser updates retained DOM and React nodes by key; a renderer swap remounts the elements while restoring the focused input by logical key and selection. Saves use the same loopback Go HTTP lab as the HTTP-effects milestone. Go limits the collection to four rows; this lets every row have a held save while preserving browser connection slots for the lab's status and release requests.

Run the complete inherited and keyed checks from the repository root:

```sh
bash run-keyed-editor.sh
```

The runner requires Go 1.24 and Node 22. Its default inherited chain provisions the pinned `interaction` dependencies on a fresh checkout before the keyed runner checks for `esbuild`; it then builds the collection WebAssembly bridge and React/reference bundles and runs native Go tests, the strict WASM smoke, keyed-editor Node tests, a real HTTP browser demo smoke, and the keyed three-way replay harness. The default runner always runs the inherited chain; it does not select a cached or partial path.

Arguments are forwarded to the final keyed replay harness, after the inherited and keyed author gates have run. For example, `bash run-keyed-editor.sh --seeds 20261030,20261031 --cases 20 --max-actions 40` changes the replay parameters without skipping any earlier checks.

After a successful run, start the local HTTP lab from the repository root and open the demo URL it serves:

```sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
```

Open `http://127.0.0.1:8000/keyed-editor/demo.html`. Add, edit, reorder, save, cancel, and remove rows. Choose an HTTP mode before saving to hold a response, produce an error, retry, or exercise the malformed, wrong-ID, status, and dropped-connection paths. The page exposes the raw Go snapshot, tree, keys, bindings, messages, reply audit, transport log, server records, live input values, DOM identity counters, active logical key, and selection.

The checks cover retained input identity during same-backend updates and completion, logical focus/selection restoration across a backend swap, monotonic row and request IDs, stale replies after deletion, and error retry over the real HTTP lab. IME composition, other browser engines, pixel matching, and production HTTP services are outside this milestone.

## Three-renderer conformance

The additive renderer-conformance milestone runs that same collection through keyed DOM, React, and a Go/WASM DOM renderer. A Go-generated versioned manifest gates renderer admission before the collection initializes. The all-renderer real-HTTP demo and four-actor replay also check keyed identity, events, focus and selection restoration, HTTP completion, and stale or failed paths within this finite contract.

Run the full inherited and renderer-conformance gates from the repository root:

```sh
bash run-renderer-conformance.sh
```

The runner first executes `run-keyed-editor.sh` in its default full mode, then builds the Go contract CLI, fixtures, and Go/WASM renderer before running the conformance tests, real-HTTP browser demo, and four-actor replay. Its Node 22 and Go 1.24 requirements match the keyed runner. See [renderer-conformance/README.md](renderer-conformance/README.md) for the demo and contract limits.

Built output and installed packages are never committed. The original M0 outputs are reproduced by `run.sh`; keyed editor outputs are reproduced by `run-keyed-editor.sh`.

## Multi-root sessions

The multi-root milestone composes three independent collection sessions in one browser page, with DOM, React, and GoDOM roots, session-scoped HTTP lanes, renderer swaps, disposal, late-reply rejection, sibling continuation, and fresh root remount. Run the full inherited and new gates from the repository root:

```sh
bash run-multi-root.sh
```

The default runner executes `run-renderer-conformance.sh` before building the multi-session and GoDOM WebAssembly bridges, copying the matching Go runtime, and running the new Go, Node, browser demo, and seeded replay gates. It requires Go 1.24, Node 22, the pinned interaction packages, and Playwright Chromium. See [multi-root/README.md](multi-root/README.md) for the manual demo and [multi-root/RESULTS.md](multi-root/RESULTS.md) for result status and the evidence schema.

## Nested session ownership

Go sessions can form an immutable parent tree. Parent and child collections retain independent state, renderer, and effect lanes; replacing a parent renderer preserves its mounted descendants. Disposing a subtree fences callbacks and returns child-first cancellation bundles while unrelated roots continue.

```sh
bash run-session-tree.sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
# Open http://127.0.0.1:8000/session-tree/demo.html
```

The runner includes every inherited gate, nested-session tests, a real HTTP demonstration, and deterministic browser/native comparison with an independent pinned React reference. See [session-tree/README.md](session-tree/README.md), [the Go/host contract](session-tree/DESIGN.md), and [executed results and limits](session-tree/RESULTS.md).

## Typed parent/child application communication

The composition experiment adds Go-defined child inputs and saved-row publications over the existing session tree. A parent can set its direct child's title and read-only policy; the child publishes a Go-captured saved value to its immediate parent's inbox with a monotonic sequence and input revision. DOM, React and direct Go/WASM views use the same Go application contracts.

```sh
bash run-typed-composition.sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
# Open http://127.0.0.1:8000/typed-composition/demo.html
```

See [typed-composition/README.md](typed-composition/README.md), [contracts](typed-composition/DESIGN.md), [execution evidence and limits](typed-composition/RESULTS.md), and [assignment/review receipts](typed-composition/coordination/PROTOCOL.md). This remains a bounded application experiment; a general component compiler is not supplied.

## Compiled Go methods across replaceable frontends

The compiled frontend experiments use actual GoScript output instead of a WebAssembly application bridge. The same compiled Go application module can run through React or the standalone DOM renderer. The value-method experiment adds a nested counter whose Go value-receiver methods enforce child read-only behavior, capture a saved value, and publish that value to the parent.

```sh
bash run-compiled-methods.sh
```

This default command includes the complete inherited regression chain, then builds both frontend profiles, compares native Go and emitted-module execution with mounted browser traces, and checks an HTTP demo. See [compiled-methods/README.md](compiled-methods/README.md) for prerequisites and the executable demo, [the bounded source/ABI contract](compiled-methods/CONTRACT.md), and [executed status and limitations](compiled-methods/RESULTS.md). Concrete value methods are a prerequisite to broader compiled composition; the existing pointer-based session manager and cancellation lifecycle remain outside this compiler profile.
