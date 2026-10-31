# E-UTF8 — strict GoScript string boundary

**Worker:** N1  
**Base:** `a275d646b0d8ceed956b27b6b8f3099e17106857`  
**Decision:** implementation and targeted compiler evidence complete; source is frozen for independent review.

## Finding and change

The preserved pre-fix direct and browser literal checks used the original `Step −` fixture and found `Step â`. GoScript v0.6.2 represents Go strings as one JavaScript code unit per UTF-8 byte. That byte-string form was crossing into renderer-facing Go views and the state encoder as if it were already Unicode.

The pipeline now wraps generated `Update` calls with a strict JS-to-GoScript conversion and clones generated Go view values into Unicode without changing Go application state. The clone retains generated struct prototypes and GoSlice structure, and rejects malformed UTF-8, unsupported shapes, cycles, and graphs deeper than 256. Generated state encoders use an explicit GoScript mode with fatal UTF-8 decoding. The existing `GenerateValueEncoder` default remains unchanged. Invalid UTF-8 Go strings and malformed JS surrogate input fail closed.

The pipeline file started from the already-closed E-COMPILER snapshot (`pipeline.go` SHA-256 `78463101a450aec88cf2ecf8b7182fe2da432aab99885edd6304aeccab264c16`). This packet adds the encoder mode selection and string-boundary adapter to that frozen compiler/bridge implementation; module bridge generation and ABI discovery remain as established in E-COMPILER.

No fixture label or literal comparator was changed. The test fixture covers accented Latin, CJK, emoji, U+2212, nested nodes, attributes, styles, event handlers, message fields, and encoded state.

## Verification

Targeted tests passed:

- `PATH=/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=local GOFLAGS=-buildvcs=false go test ./compilercontract -count=1` — Go 1.24.0, exit 0.
- From `compiled-frontend`: `PATH=/tmp/gondola-go/go/bin:/tmp/gondola-node22/node_modules/node/bin:$PATH GOTOOLCHAIN=go1.27.3 GOFLAGS=-buildvcs=false go test ./build -count=1` — exit 0. This runs a real compiler Build and imports the generated module and standalone encoder in Node 22.23.4; it checks state immutability, view decoding, message round-trip, state encoding, invalid UTF-8, and lone-surrogate rejection.

N2 rebuilt parent and child independently for React and DOM. All four BuildResults were `ok:true` with no diagnostics; parent outputs had 67 files and child outputs 70 files. Their source snapshot contains 46 inputs and has identical before/after pins (SHA-256 `1653781498f4b420a85370c6a8fc60207b60675c9f07f24aff0efef1ff04b6ed`). The bridge/state-encoder probe and ABI pair validation both exited 0. Their exact logs and output manifests are preserved under `rawlogs/E-REBUILDS/`.

N4 then compared the fresh native/direct traces: status `matched`, 24 source events, 16 Go updates, 17 checkpoints, and strict React and DOM direct profiles each matched all 24 events/16 updates. A subsequent mounted capture also matched in 12 profiles (React, DOM, swap, and three seeds across those profiles), with 6/6 mutation controls detected and no page errors. These are separate harness-owned observations, pinned below; they do not replace this packet's compiler tests.

## Historical red evidence

The pre-fix attempt remains unchanged at `rawlogs/E-HARNESS/attempt-001-pre-eutf8/`. Its direct check reports expected `Step −`, actual `Step â` (red log SHA-256 `998c29f258cd9ac541bcd2f51d23105ab8acb61385c0eb4f9cea63868e56d150`). The browser literal check records the same mismatch (SHA-256 `e2c7bcbc545f60169d9d612c92def464448b0939b655aeb616d96eaae32c7fec`). The captured browser JSON SHA-256 is `07646a3bf626d6f0f8573b65d63cc1f6344a25c2dcbeb9957c668cd3a35fca58`.

## Source and codec pins

| Path | Bytes | SHA-256 |
|---|---:|---|
| `compiled-frontend/build/pipeline.go` | 40856 | `5bc9207fbeb58f406bca9fc40ddf86269aab9667f8af798b3e40fd3a95889ba4` |
| `compiled-frontend/build/pipeline_test.go` | 24611 | `0098d09ff6aba6efaa3df326920e4acdcd464aa0c39cad59831e4663637de2ab` |
| `compiled-frontend/build/stringcodec.go` | 6308 | `2d795134529711bbc3b16e6a1c2a9f56ba1e5274ab54017263474f9e55b7e71c` |
| `compiled-frontend/build/stringcodec_test.go` | 5561 | `1969acb5a84422e4d1ba2b13c83bf4de38563eaa30ed23bf073161b0d0d1ad50` |
| `compiled-frontend/build/testdata/utf8app/app.go` | 706 | `8d1e730112deff726069aaf8226a4e98f8355334c8934a25cb14728ce69c66c7` |
| `compilercontract/js_encoder.go` | 13710 | `c04fa788356a9c16038e2dc6834b34acd4be7f2476bc31a05238058333b39ffa` |
| `compilercontract/js_encoder_test.go` | 10240 | `4d28ac5c7c554bc10a846e3462aac69d262b5ea72b2a7ee56529866a436167f4` |
| GoScript v0.6.2 `gs/builtin/slice.ts` | — | `5f6da8d9bb986cc49f1323e1ba505c8ba779da6c54ebaacf6c1bd540e9a0bdea` |
| GoScript v0.6.2 `gs/builtin/index.ts` | — | `c42d461381d152e5eb9d1627f08c38d26619efb9ceba3d45954e252c2e94218e` |
| `module-coordination/CONTRACT.md` | 5478 | `ba6dbd37c15c83068216702f5c864af5e423d0871490a890a65052bd66710020` |
| `module-coordination/RULINGS.md` | 2583 | `15612273fa54d60ae92a0175231b369abb6bc9b1d521620f954fe5d0e48616a2` |

## Evidence references

- Own test logs and a fresh emitted-module Unicode probe: `rawlogs/E-UTF8/`.
- Fresh four-build results, build records, manifests, output integrity, bridge/encoder probe, and ABI validation: `rawlogs/E-REBUILDS/`; source-pins SHA-256 `1653781498f4b420a85370c6a8fc60207b60675c9f07f24aff0efef1ff04b6ed`, probe SHA-256 `594946e79a0c8e667a74404c5e4f51a30d361c15bbdf0a3d790a73d7d8a3db1d`, ABI validation SHA-256 `2a71d22d96632059b412b3175e1b309c83c67232b778c1b80513bfefe8106528`.
- N4 fresh direct result: `rawlogs/E-HARNESS/attempt-006-postutf8-direct/result.json`, SHA-256 `8b1f8b10d32651d8adb3a240c33c6de0596672e45b1e5bda79aed0c1783de42b`.
- N4 mounted capture summary/check: `rawlogs/E-HARNESS/attempt-007-mounted/module-pair.check.json`, SHA-256 `8f34b3aee36b39e9f6ba6deeac50dd7df2b1f89ac1330d340e6544505a535174`; actual capture SHA-256 `0c02edf99ab891c1102236e26ccd697505dc68e882afd9cd02f6da207271b90c`.

## Limits

The guarantee is a strict UTF-8 boundary for valid GoScript byte-strings and well-formed JavaScript Unicode in this compiled-module pipeline. Arbitrary invalid-UTF-8 Go strings are rejected at the boundary. This packet does not change Go's internal string representation, the AppIR type schema, or the legacy default encoder API; it does not claim support for arbitrary Go programs or unbounded object graphs.

The raw evidence index is `rawlogs/E-UTF8/index.json` (SHA-256 `7edb812e83fdf83227175e687fa4609d7c3f4d09a39b56be81542c4086e5b36d`).
