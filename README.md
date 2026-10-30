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

Built output and installed packages are never committed. They are reproduced by `run.sh`.
