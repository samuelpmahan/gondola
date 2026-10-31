# E-CI-GO source preflight (provisional)

This file records a read-only source review of published commit
`49cc2b96c8817a47319d5b7bd484184a22fa984b` in the isolated CI worktree. It is
not a CI result or acceptance. The primary hosted artifact for push
`41178420647` / PR `41178477290` has not been provided to this lane yet. CI
logs, artifact contents, tool versions observed in the hosted job, and all
runtime claims remain pending that artifact.

## Source pins reviewed

SHA-256 hashes from the exact `49cc` checkout:

| File | SHA-256 |
| --- | --- |
| `go.mod` | `e5dba8ed15a331f2bcdc7a35604cadd927fd486bca2543e83953f6a73716c5fa` |
| `.github/workflows/gobi-compiled-lifecycle.yml` | `8c7382b44c764f8f51c8038150714d7b70c0896b3bf52359c1a848d17f99d1bd` |
| `run-compiled-lifecycle.sh` | `81a45e018a53c437af4099199461def46a10f395b20eb0e7372342a5db32ed7b` |
| `fixtures/compiled/lifecycle/app.go` | `6b61e55c3046f58873d2774e38a7bca44769f18f6870c39e1885b78be340fe41` |
| `fixtures/compiled/lifecycle/view.go` | `afc4b1611c5dbd8e5264d3c124b808770bdd8579fdc1426c350f4df6689bb948` |
| `fixtures/compiled/lifecycle/app_test.go` | `5b67112d79f258895b2fffa82b209021581f982f6a5529f6856763ba02986442` |
| `fixtures/compiled/lifecycle/scenario.json` | `45f3f402681f8f685af043debaa572d09f9c34f7017ae3bb7a31903b46fa0650` |
| `cmd/compiled-lifecycle-native/main.go` | `37d7d709599a5b402f792cd5e9e66118f0ec296984ed3fb11ad2626bb6c23bf3` |
| `cmd/compiled-lifecycle-native/main_test.go` | `dd6ce451f96390d245768d5a67a6a1844c3609d0c0bdc7dfe5ac9040301f775a` |
| `compilercontract/trace.go` | `de5aa3f70314fe3cc1e5661ce682c953de6ee12328cba3dd609a891657c5e627` |
| `compilercontract/value.go` | `e6f26347e56d8bd97f4802dff206489ed3901082525a2b4c7497fe0811c71a1f` |
| `compilercontract/validation.go` | `ccb28713bfa7dd0fd5b22fb5dd377945006d9f0517357c62f230666b91ec2e76` |
| `compilercontract/contract.go` | `fa3ef8b3c60f3ff1d4a0e80827bfa65dc21ad741b3c421c1f4634f6b3c0b363e` |
| `compilercontract/js_encoder.go` | `a605b3267f63f7c7ed90c17ee2ed9bf04c7667827a23496c8620070f13b9b46d` |
| `compiled-frontend/frontend/runtime/runtime.mjs` | `42da6087f01acf712aa810556b4ca768dd306e595e8aaf95425cd3d24bd643e0` |

## Source observations

- The fixture is a finite, value-owned topology: parent, child, grandchild,
  and independent sibling are fields of `lifecycle.State`. The fixture does
  not claim that an arbitrary pointer-based manager was compiled.
- Request tokens are formed from the actual `Generation` and monotonic
  `RequestID` using `strconv.FormatUint`. Request allocation stops at the safe
  integer boundary. Remount is refused if any parent-subtree generation has
  reached that boundary; successful remount increments all three generations.
- `removeParent` emits explicit `lifecycle.cancel/cancel` effects for pending
  descendants in grandchild, child, parent order. It clears their pending
  status and token while leaving the independent sibling's pending request
  untouched. `complete` updates only an alive, pending slot whose token equals
  the reply token; stale and duplicate tokens are no-ops.
- The native adapter imports the same lifecycle Go package, derives click
  messages from `lifecycle.View` Gobi nodes, invokes `lifecycle.Update`, and
  records effects with `compilercontract.EffectFromGobi`. The separate native
  test source checks renderer-swap state preservation, child-first cancels,
  stale replies, duplicate replies, final request tokens, and state settlement.
- `compilercontract.EncodeValue` serializes Go unsigned integers with
  `strconv.FormatUint`; type validation requires 64-bit integer source types
  to declare `bigint`. Existing contract-test source includes exact full-width
  `uint64` maximum coverage. This source review did not execute those tests.
- The frontend runtime obtains the effect-slice TypeID from the compiled
  component's `Update` symbol signature. It checks the declared slice and
  element struct metadata, then routes typed effects through
  `gobiEncodeState`; the encoded effect value is checked for its exact slice,
  struct, and `Kind`/`Name`/`Arg`/`Reply` fields. The no-declared-TypeID legacy
  array path remains strict about dense own data properties and Gobi effect
  fields. The generic source encoder validates GoSlice wrapper metadata,
  bounds, backing storage, and element representation. These are source-level
  observations pending confirmation that the current hosted job exercised
  them.

## Limits and next evidence needed

- No tests or builds were run as part of this read-only preflight.
- No hosted command output, generated AppIR, direct/native replay output,
  React/DOM artifact, or archive manifest was available to this lane when this
  note was written.
- Final review must bind every hosted log/artifact to the current `49cc`
  workflow run, verify source pins against this checkout, inspect the direct
  Go and compiled module evidence, and record exact CI tool versions/results.
- No conclusion about hosted CI completion, pass status, or artifact integrity
  is made here.
