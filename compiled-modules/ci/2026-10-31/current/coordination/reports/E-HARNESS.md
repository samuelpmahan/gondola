# E-HARNESS: mounted independent Go module conformance

**Outcome:** matched for the pinned fixture, compiler artifacts, and Chromium run described below. This packet is local test evidence, not a statement that the final Git candidate or CI suite has passed.

## What ran

The runner replayed the fixed parent/child fixture through native Go, direct calls to separately built GoScript modules, and actual mounted React/DOM renderer instances in Chromium. The fixed script has 24 source events, 16 Go updates, and 17 checkpoints. The independent literal oracle checks complete typed parent and child states, Gobi `NodeRecord` trees, bridge records and order, and DOM/control projections at each checkpoint.

All three fixed browser profiles matched. React and DOM each recorded 5 physically clicked disabled controls (0 callbacks) and 15 enabled physical clicks (one callback each). The swap profile began in DOM, switched to React at the scripted point, rejected the retained old-renderer callback as stale, and switched back to DOM. Both swaps added no Go update or bridge call.

The negative ABI profile used an actual mismatched descriptor and its descriptor bytes. It rejected before any parent/child Go role, renderer factory/update, or caller-container mutation. The full mounted checker also compared actual renderer DOM with the physical container DOM.

Six mutations of captured browser output were rejected by the same checker: parent typed state, child view tree, physical DOM HTML, disabled-control value, bridge order, and a fabricated pre-rejection role call. The mutation controls start from a valid real swap capture.

| Seed | Physical clicks | Go updates | Disabled clicks suppressed | Mounted profiles |
|---|---:|---:|---:|---|
| 20261031 | 40 | 29 | 11 | React, DOM, swap |
| 20261032 | 40 | 27 | 13 | React, DOM, swap |
| 20261033 | 40 | 27 | 13 | React, DOM, swap |

Each seed was mounted on all three profiles. Each swap seed profile contained the 40 source clicks plus two renderer swaps and one captured stale callback; the latter three were host probes and did not add Go updates.

## Compiler artifacts and inputs

N2 made four fresh GoScript CLI builds from the stable E-UTF8 source checkpoint, in separate parent/child and React/DOM output directories. The 46 compiler input source pins matched before and after those builds. All 274 emitted files matched their build inventories: React parent 67, React child 70, DOM parent 67, DOM child 70; no output inventory mismatches.

| Artifact | Build manifest SHA-256 | ABI descriptor digest |
|---|---|---|
| React parent | `d4e7f39173467fd433d409ce53c8b7ab3340b60f353e5a0d47522c1081654d37` | `40d55419983742c17dca568b421e30f70a297c78213f755bc4be30c4579c8364` |
| React child | `48cb8aa9d8b529b2a0dbcc3c71276c4870f718efcc3cec9c27ee58c6e5a72a97` | `d0f7ba8eaa4b1b189e70e93003c1a0764e924760efecd8e6c61be2a624605e2f` |
| DOM parent | `3a1866ae2b7bd5c816a88c2d4703083ea42c9b4c0954f6f7088395a81ef08389` | `ee3aa871864f42fb012bccb1a04bd273c953d42a7797656a111415802f6c15c6` |
| DOM child | `8b1d8d74a9faa802b08e488b660cc00d2aae2b2d8bd59065900afa8295bdcf7c` | `e7bc5dfed179b167870d3558f4b1826c6d92b12fbbf1eee58dc96ddbe9061cd0` |

The literal expectations are independent constants, not generated from the Go replay or browser. The JavaScript harness only resolves physical actions, invokes the compiled Go roles/bridges, and records observations; it does not implement parent or child state transitions.

## Verification and environment

The exact full run command and resolved arguments are in `rawlogs/E-HARNESS/attempt-007-mounted/module-pair.run.json`; its stdout summary reports `status: matched`, 12 mounted profiles, six detected mutations, and no browser page errors. The full raw mounted capture is 31,814,241 bytes.

- Go: `go1.24.0 linux/amd64`
- Node: `v22.23.4`
- Browser: Chromium `153.0.8010.0`
- Playwright: `1.64.1`
- Syntax checks: 7/7 conformance modules passed `node --check`
- Portable Node suite: 4/4 tests passed (`check.test.mjs`, `seeded.test.mjs`)
- Separate native/direct pass: 24 events, 16 updates, 17 checkpoints; both direct React and direct DOM matched all literal states, trees, and bridge records.

Final evidence hashes:

- Fixed native trace: `579c8c4a17d26682fc30bfdbbc4de677ee63cda322b7bfdd00bd624c22b4ceec`
- Direct result summary: `8b1f8b10d32651d8adb3a240c33c6de0596672e45b1e5bda79aed0c1783de42b`
- Mounted browser capture: `0c02edf99ab891c1102236e26ccd697505dc68e882afd9cd02f6da207271b90c`
- Conformance summary: `8f34b3aee36b39e9f6ba6deeac50dd7df2b1f89ac1330d340e6544505a535174`
- Run metadata: `d8cd61e6e5c70c07ad3eaa56ced25c168dcb9325b0665c1d12d35a7dc26dd4d7`
- Rawlog index: `e1d47c7fe0bc0e7d2399b4305f5343063ef1328202e16c7f33fd18a15b50bc7e`

Source and artifact byte pins are in `rawlogs/E-HARNESS/source-pins.json`, including the E-REBUILDS 46-input inventory, all four manifests, the 274-output integrity evidence, and the actual host, renderer, native, fixture, and oracle sources used.

## Preserved failed attempts

The first old-build capture is retained in `rawlogs/E-HARNESS/attempt-001-pre-eutf8/`. Strict literal/direct checks found that the old generated parent view rendered `Step −` as `Step â`; this was a compiler string-encoding issue, and the post-E-UTF8 artifacts now match the literal Unicode text. The old failure logs remain unchanged.

Attempts 003 and 004 were harness-driver setup errors (bad test-script import path and output path, respectively) before app assertions ran. Attempt 005 exposed the checker re-encoding an already encoded direct state. The checker now encodes the independent literal state once and compares it to the captured type-encoded state, including the initial checkpoint; attempt 006 then passed and attempt 007 is the full mounted pass. These red logs are preserved and indexed; they are not silently overwritten.

## Limits

Evidence covers this one parent and one child module pair, the declared finite bridge ABI, these fixed actions and three bounded seeds, and Chromium on this Linux environment. It does not establish arbitrary Go/module-graph support, other browsers or operating systems, asynchronous effects, pixels, malicious-code containment, or broader production readiness. A final candidate/CI run remains a separate release gate.
