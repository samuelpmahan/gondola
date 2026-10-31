# E-BUILD (compiled backend capability negotiation)

**Outcome: mixed_change.** Source pins changed during execution or do not match the immutable pre-archive snapshot.

## Execution

- Status: `failed`
- Attempt: `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z`
- Invocation: `bash run-compiled-capabilities.sh`
- Started: 2026-10-31T14:30:23.256Z
- Finished: 2026-10-31T14:30:24.317Z
- Source pins: changed or mismatched (0 before; 163 after)

## Exact commands

- `version-npm`: `npm --version` (exit 0; stdout SHA-256 `d9f29f5aab43c8c1a8d6acc856e258b89735f541aa5e1f07b39a62f28bfa8d06`; stderr SHA-256 `13370caaaa535d643375a625b072017c6d99c08862a5fc969341ff19a757b53f`; logs `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/version-npm.stdout.log`, `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/version-npm.stderr.log`)
- `version-root-go`: `go version` (exit 0; stdout SHA-256 `a25c9afbc0b5cef0771a799565082fe511d668065f83bd54750592f8102aa9f3`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/version-root-go.stdout.log`, `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/version-root-go.stderr.log`)
- `version-compiled-go`: `go version` (exit 0; stdout SHA-256 `5707bf75dd54b4fdd5ac209444d48c9c4179ebf8510f80e2f7293dfbedc1012b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/version-compiled-go.stdout.log`, `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/version-compiled-go.stderr.log`)
- `version-chromium`: `/tmp/chromium --version` (exit 0; stdout SHA-256 `685fc1764b9a92beaca4b87593f55170ca6b158f4179690064c25a352f08531b`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/version-chromium.stdout.log`, `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/version-chromium.stderr.log`)
- `archive-helper-startup-regressions`: `/tmp/gondola-node22/node_modules/node/bin/node --test /workspace/scratch/39a56936f173/gondola-children-archive/compiled-capabilities/archive-helper.test.mjs` (exit 0; stdout SHA-256 `fab4bbad3bd191b6527087b86c04ba1f214fecbbc40a932698ee001a194015c2`; stderr SHA-256 `76f5292a3dee8feb6bbf2bdab5647af093871e98057dae3c49b96d0fb408bea9`; logs `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/archive-helper-startup-regressions.stdout.log`, `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/archive-helper-startup-regressions.stderr.log`)
- `archive-capability-artifacts`: `tar -czf /workspace/scratch/39a56936f173/gondola-children-archive/compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/capabilities-artifacts.tar.gz -C /workspace/scratch/39a56936f173/gondola-children-archive/compiled-capabilities/builds/attempts/attempt-20261031T143023255Z --no-recursion --null --files-from /tmp/gobi-capability-archive-list-y26myt/members.nul` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/archive-capability-artifacts.stdout.log`, `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/archive-capability-artifacts.stderr.log`)
- `list-capability-archive`: `tar -tzf /workspace/scratch/39a56936f173/gondola-children-archive/compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/capabilities-artifacts.tar.gz` (exit 0; stdout SHA-256 `d15ef3d4351d8d80a494ecb4ee5af9ea82a79812998122055ae9cca8987cf1e8`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/list-capability-archive.stdout.log`, `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/list-capability-archive.stderr.log`)
- `extract-capability-archive`: `tar -xzf /workspace/scratch/39a56936f173/gondola-children-archive/compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/capabilities-artifacts.tar.gz -C /workspace/scratch/39a56936f173/gondola-children-archive/compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/archive-verification` (exit 0; stdout SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; logs `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/extract-capability-archive.stdout.log`, `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/logs/extract-capability-archive.stderr.log`)

## Toolchains and locked dependencies

- node: `v22.23.4`
- npm: `11.9.0`
- rootGo: `go version go1.24.0 linux/amd64`
- compiledGo: `go version go1.27.3 linux/amd64`
- chromiumPath: `/tmp/chromium`
- chromium: `Chromium 153.0.8010.0`
- dependencies.react: `19.3.1`
- dependencies.reactDOM: `19.3.1`
- dependencies.playwright: `1.64.1`
- dependencies.esbuild: `0.28.2`
- dependencies.frontendEsbuild: `0.28.2`
- lockedDependencies.react: `19.3.1`
- lockedDependencies.reactDOM: `19.3.1`
- lockedDependencies.playwright: `1.64.1`
- lockedDependencies.esbuild: `0.28.2`
- lockedDependencies.frontendEsbuild: `0.28.2`
- packageLocks.package-lock.json: `e35def24ea8e20847d1ea58a59bc3b233b6c0d1d9fa697e44e735812617ef53b`
- packageLocks.interaction/package-lock.json: `b1dc4681b030322933246c2b4622a4cbb9ebcb8ac7f69f0f4021459c9d603ed0`
- packageLocks.compiled-frontend/package-lock.json: `245318fce8e9760b07f8c465240d85b1449d4b75110c510aa5f362be3c600079`

## Checks

- Go 1.24, compiler Go 1.27.3, Node 22, Chromium, React 19.3.1, all existing npm lockfile hashes, and installed-versus-locked package versions were recorded
- M0 SHA256SUMS and every listed source file are part of the before/after source-pin set
- capability archive contains 11 hashed build, native, conformance, demo, log, inherited lifecycle, and immutable pre-archive provenance members; extraction round-trip verified

## GoScript backend builds

- Fixture package: `github.com/samuelpmahan/gondola/fixtures/compiled/lifecycle`
- React output files: not built
- DOM output files: not built
- AppIR capabilities: `not recorded`
- Shared AppIR/encoder across profiles: false
- Raw generated modules are pinned per profile; the runner makes no cross-output raw bundle equality claim.

## Negotiation and replay evidence

- Runner acceptance regressions: not run (0/0 tests)
- Inherited lifecycle chain: not passed (lifecycle not passed; methods receipt not bound; backend receipt not bound; full mode; stable source pins)
- Native lifecycle trace: not produced
- N4 literal oracle: not run
- N3 direct/native/React/DOM matrix: not run
- N3 assertion summary: `{}`
- N3 raw rejected/compatible swap preservation: not verified; capture mutation controls: 0/9 detected
- N5 HTTP demo: not run
- Evidence archive: `compiled-capabilities/builds/attempts/attempt-20261031T143023255Z/capabilities-artifacts.tar.gz` (11 members; SHA-256 `9b80228a8e30eda28ac416dfd5ccbe0d43e9a9928f536225ceab4a7110c6cfce`; immutable pre-archive snapshot included; manifest SHA-256 `ca4220a145276bd9ccafb30cfdb03cc49913266549901e0651236a06e2581b67`; round-trip verified)

## Failures

- stage:archive-helper-startup-regressions: archive helper Node test stage did not report three clean TAP passes: {"tests":5,"pass":5,"fail":0,"cancelled":0,"skipped":0,"todo":0}
- runner: archive helper startup regressions failed; inherited execution was withheld
- source-pins-prearchive: sourceBefore and pre-archive source pins differ
- source-pins: sourceAfter must match sourceBefore and the pre-archive snapshot (sourceBefore=false, snapshot=true, preArchive=false)

## Scope

The compiled lifecycle fixture proves this bounded typed-Go capability profile across native Go, direct execution, and the shipped React/DOM renderers. Host and renderer capability profiles are separate. Incompatible candidates must be rejected before the active lifecycle is retired; only explicit profiles establish support for the declared capabilities. The actual Go lifecycle view has no value/checked input bindings; synthetic N4 oracle cases independently exercise those renderer requirements.
