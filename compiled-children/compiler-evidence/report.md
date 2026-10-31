# E-COMPILER report

**Outcome:** `confirmed_reuse`. The existing GoScript CLI, AppIR type collector, Go forwarding facade, and generated state encoder compiled and encoded the frozen child collection for both React and DOM. No production compiler or contract files were changed.

## Inputs and toolchain

- Frozen package: `github.com/samuelpmahan/gondola/fixtures/compiled/children`
- GoScript: `github.com/s4wave/goscript v0.6.2`
- Compiler: `go1.27.3 linux/amd64`
- Node: `v22.23.4`
- N1 source hashes stayed constant during both accepted builds: `app.go` `d265bbac54017ab366bdf86aa646fdad808f464c5d35cd106259c6943fc32c99`; `view.go` `6d0ecf88dfc521ed197213e8922ec12f553505a37f88f5e8e63a1ec8cfda8185`.

## Actual CLI runs

Working directory for each build: `/workspace/scratch/39a56936f173/gondola-next/compiled-frontend`.

| Backend | Exact command | Exit | Result |
| --- | --- | ---: | --- |
| React | `GOTOOLCHAIN=go1.27.3 GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go/bin/go run ./cmd/gobi-build < ../compiled-children/compiler-evidence/build/react-repeat-request.json > ../compiled-children/compiler-evidence/build/react-repeat.stdout.json 2> ../compiled-children/compiler-evidence/build/react-repeat.stderr.log` | 0 | `ok=true`, 67 output files, no diagnostics |
| DOM | `GOTOOLCHAIN=go1.27.3 GOBI_NODE=/tmp/gondola-node22/node_modules/node/bin/node /tmp/gondola-go/bin/go run ./cmd/gobi-build < ../compiled-children/compiler-evidence/build/dom-request.json > ../compiled-children/compiler-evidence/build/dom-attempt3.stdout.json 2> ../compiled-children/compiler-evidence/build/dom-attempt3.stderr.log` | 0 | `ok=true`, 67 output files, no diagnostics |

The first actual CLI attempts preserved red diagnostics while N1 adapted its fixture to the existing closed analyzer profile: mutable package globals were rejected; then unguarded or indirectly guarded integer updates, address-of, dynamic string/index arithmetic, `strings.IndexByte`, and a dynamic `make` capacity were rejected. N1 changed only its owned Go sources to use local controls, positive safe-integer guards, value-copy slice updates, and bounded key parsing. No analyzer or encoder widening was needed. Red requests, results, stderr, and exit codes remain under `compiler-evidence/build/`.

The first final-source React invocation returned exit 0 but its redirected stdout file was empty; it was repeated to a fresh output directory and captured as `react-repeat.*`. The successful React repeat and DOM build used identical N1 source hashes.

## Emitted compiler artifacts

Both `buildmanifest.json` files point to:

- AppIR: `apps/children-cdeeb3bd6f70/app-ir.json`, SHA-256 `f546e2ff771dd497aebfc2f75ae269f422d0422879dd86b881d4aa911a0e228f`
- Generated helper: `apps/children-cdeeb3bd6f70/encoder.mjs`, SHA-256 `48422999f8d9a251fe51eb5b55372efd8f4aea954ce09523133093a6eae753e7`
- Backend-neutral role metadata: `apps/children-cdeeb3bd6f70/components.gen.mjs`, SHA-256 `f395e6c54b9d550f6fb0a1e7f61179451ad7369dfe75e06f1babfaa7059cfb56`
- Compiled GoScript module: `apps/children-cdeeb3bd6f70/gobi-compiled.mjs`
- Forwarder package: `gobi.generated/compiled/facades/children-cdeeb3bd6f70`; generated Go is under `forwarders/facades/children-cdeeb3bd6f70/forwarder.go` and the compiled forwarding TypeScript is under `emitted-ts/@goscript/gobi.generated/compiled/facades/children-cdeeb3bd6f70/forwarder.gs.ts`.

The compiler emits `[]github.com/samuelpmahan/gondola/fixtures/compiled/children.ChildState` as a `slice` with `jsRepresentation: array-or-goscript-slice`; its element is the exported `ChildState` struct class. The state `Children` field therefore remains a Go-owned value slice. Nested `counter.State` is a generated struct class. `uint64` generation/request fields use `bigint` representation; the encoder produced exact decimal strings in the canonical Value. The shared AppIR, encoder, and components files are byte-identical for React and DOM. Raw bundles differ because they contain separate random GoScript and staging directory comments; replacing those temporary path components makes both module bundles byte-identical. The actual compiled module probes below also produced byte-identical encoded states and slice descriptors.

## Actual module and encoder probe

`encoder-probe.mjs` imports each built `gobi-compiled.mjs`, resolves `Init` and `Update` using that module's AppIR symbols, applies the fixed bounded sequence, and runs the generated `gobiEncodeState` on every returned actual GoScript state. It does not synthesize an AppIR, state model, or transition implementation.

Each backend exited 0 with 14 encoded snapshots. The sequence covers init, three appends (capacity growth), request, reorder, completion, removal, key reuse, another request, parent request, clear, parent removal, and remount. React and DOM produced identical canonical encoded states and identical actual slice descriptors at every step.

Observed runtime values:

- `Init.Children` was a dense JavaScript Array; the generated encoder accepted it.
- Appending produced the actual GoScript wrapper with own fields `backing`, `offset`, `length`, `capacity`, `target`; `target` was `undefined`.
- Growth observations were length/capacity `3/4`, `4/6`, and `5/8`. The backing arrays contained holes only in unused capacity.
- Grown backing arrays carried a non-global `Symbol("goscript.spareZero")` own data property with enumerable/writable/configurable all true. Its function value had own `length: 0` and `name: ""` data properties, both non-enumerable, non-writable, configurable. The encoder accepted each actual state, including the sparse-capacity shape.
- `children.clear` and `parent.remount` produced accepted non-nil empty child slices.

Raw probe JSON contains the full canonical encoded states and descriptor snapshots. The probe is an encoder compatibility check, not native/direct/browser behavioral parity evidence; those checks belong to N4/N6.

## Preserved failed attempts and limits

The initial red CLI diagnostics are retained in `compiler-evidence/build/react.stdout.json`, `react-green.stdout.json`, and `react-attempt2.stdout.json`, paired with their `.stderr.log` and `.exit-code` files. `react-encoder-probe.stderr.log` retains an initial evidence-script error: it assumed `Init.Children` was already a GoSlice wrapper. The corrected probe records both the dense Array and wrapper representations. These failures did not require compiler changes.

This lane does not claim arbitrary-Go support, native/direct/DOM/React parity, browser behavior, or the full inherited runner. The compiler production area remains unchanged.
