# XR-COMPILER — independent review of the sealed compiler packet

**Reviewer:** N5  
**Decision:** `accepted`  
**Reviewed packet:** N2 `E-COMPILER`  
**Review source:** immutable `module-coordination/seals/E-COMPILER/source/`; report and receipt copied exactly by the E-COMPILER seal.  
**Scope:** source-derived bridge role/type closure, generated facade shape, manifest/artifact binding, compatibility with the standard facade, failure staging, source/evidence custody, and the limits of the recorded build smoke.

## Decision

The sealed compiler implementation meets the finite compiler-emission contract. I found no blocking defect in module-role analysis, source type closure, exact bridge signature/wire type checks, generated local Go record reconstruction, separate primitive bridge exports, or preservation of the legacy `gobiCompiled` v1 object with its three standard symbols. ABI sidecar generation consumes the staged AppIR and exact generated artifact bytes before the output transaction is published.

This decision is limited to E-COMPILER's source and recorded compiler/direct-smoke evidence. It does not clear the known UTF-8 integration mismatch described below or establish mounted browser behavior. The parent/child milestone remains gated on the separately assigned E-UTF8 repair and its independent review, and on host/conformance gates.

## Source and custody review

The sealed report (`5e1389dc9efee84eb1364aba616783da55f40233a44f331c08c2aed3f2d27a57`) and receipt (`050b7d943969ef53e5c2e2485ea6ebf1b87577e860b8512339b026bb245cdc4a`) match the E-COMPILER seal and the author-path copies. All 17 files in the sealed compiler source snapshot match its source inventory.

I independently resolved all **107 author evidence pins**: 49 source pins, 30 evidence pins, four build manifests, 20 generated build files, two evidence indexes, the report, and the contract. The verification is captured in `module-coordination/rawlogs/XR-COMPILER/pin-audit.txt`. The current worktree has three source overlays from the separately approved UTF-8 repair: `compilercontract/js_encoder_test.go`, `fixtures/compiled/modulechild/app.go`, and `fixtures/compiled/modulechild/app_test.go`. Their author-pinned pre-repair bytes were matched against the frozen base-commit blob or preserved E-GO sealed source copies; I reviewed the E-COMPILER snapshot and did not read current mixed compiler/fixture output as if it were the author candidate. The first audit assumed added fixture files existed in the base commit; the second assumed every changed source had an E-GO copy. Both failed attempts are preserved in `pin-audit-initial-failure.log` and `pin-audit-second-failure.log`. The final corrected audit resolves all 107 author pins and reports no unresolved hash mismatches.

The primary edited compiler files in the sealed snapshot are:

| File | SHA-256 |
|---|---|
| `compiled-frontend/analyze/analyze.go` | `b1c29537e11223fa10b262bd9a6f3ee3fb57cfd43594f4b13f52215e7f54b28b` |
| `compiled-frontend/analyze/analyze_test.go` | `e59532b59af0a9560b5def9b1ba9bb4e1a9c94b92116a3bcf175f5f39c9b9c9b` |
| `compiled-frontend/build/pipeline.go` | `78463101a450aec88cf2ecf8b7182fe2da432aab99885edd6304aeccab264c16` |
| `compiled-frontend/build/pipeline_test.go` | `3119342475c48e90e744ceffa2c5abcccd8ec4b39b67262b1ef56314e329866d` |

The pinned base `build/publish.go` was not changed by this packet. Its stage-before-publish flow means AppIR analysis, code generation, bridge validation, artifact hashing, or module ABI writing failures occur before publication; the existing output tree remains in place. The packet's tests exercise producer failure preservation, unsupported-backend preservation, and successful replacement. They do not inject operating-system failures at every rename or backup-cleanup boundary; I make no such exhaustive filesystem-fault claim.

## Code review findings

- Analyzer discovers only the complete parent `Output`/`Receive` pair or complete child `Input`/`Publication` pair; it rejects partial, crossed, duplicate, and wrong-signature declarations. Exact nominal modulewire IDs, field names, types, and field order are enforced. Bridge functions join reachability and operation validation, and their imported signature/type closure is merged into AppIR.
- The build stage validates the one-component AppIR, compiles and emits the ordinary module, writes AppIR/encoder/components, derives `module-abi.json` from those staged files via `moduleabi.Describe`, then writes the sidecar and buildmanifest in the same stage. A failure in this work returns before `Publish` commits the stage.
- `compiledModuleSource` leaves the `gobiCompiled` v1 schema, `appIR`, and exactly `Init`/`Update`/`View` symbol facade intact. It adds `gobiModuleBridges` separately and exposes only the parent or child bridge keys appropriate to that module.
- The generated forwarder reconstructs each destination module's own `modulewire.Input` from primitive fields and projects returned `Input`/`Publication` values into plain JS objects. It does not pass cross-bundle GoScript values as the bridge record.
- Test coverage includes both bridge pairs, invalid/partial roles and wire shapes, imported type closure, descriptor/artifact digests, standard facade behavior, and failure/preservation semantics. The report's test-first REDs and implementation-time failures are classified in the preserved failure index; the two expected REDs show missing analyzer bridge closure and missing module ABI manifest before implementation. Setup and assertion failures have corrections recorded rather than being presented as product failures.

## Verification evidence and limits

The sealed author packet records Go `go1.27.3 linux/amd64`, Node `v22.23.4`, full nested `go test ./...`, `go vet ./...`, four independent React/DOM × parent/child builds, and direct Node bridge smoke. I verified the corresponding source/evidence/build hashes but did not rerun the full compiler suite or rebuild those artifacts.

I independently reran the pinned bridge smoke against the four output modules with Node `v22.23.4`; React and DOM each exited 0. The smoke reports the standard symbol keys as exactly the three package `Init`/`Update`/`View` symbols, parent/child bridge keys as `output`/`receive` and `input`/`publication`, and primitive `Input`/`Publication` values. The exact stdout/stderr are in this review's rawlogs. This is direct module invocation only; it is not a browser mount, renderer swap, or callback test.

The known strict N4 comparison found a Unicode boundary mismatch: native Gobi emits text containing `Step −`, while the compiled GoScript path produces mojibake. Root traced this to GoScript's `lowerGoStringLiteral` byte-string representation without the matching Go/JavaScript string boundary conversion. The E-COMPILER smoke is ASCII-only and does not cover this case. The repair and its review remain separate under E-UTF8; this review neither changes nor waives that finding.

The accepted source remains finite to the exact typed parent/child ABI and the tested React/DOM build profiles. It does not establish arbitrary Go types or module graphs, effects, malicious-code isolation, output authenticity, or browser-renderer equivalence.

## Reviewed packet pins

- Sealed author report: `module-coordination/seals/E-COMPILER/E-COMPILER.md`, 6,445 bytes, SHA-256 `5e1389dc9efee84eb1364aba616783da55f40233a44f331c08c2aed3f2d27a57`.
- Sealed author receipt: `module-coordination/seals/E-COMPILER/E-COMPILER.json`, 28,620 bytes, SHA-256 `050b7d943969ef53e5c2e2485ea6ebf1b87577e860b8512339b026bb245cdc4a`.
- Source inventory: `module-coordination/seals/E-COMPILER/SOURCE-INVENTORY.json`, SHA-256 `e827e71aaf6ff0514546a56354486c403cc89a5cd92e8c6fcc178721bf74a49a`.
- Build evidence index: SHA-256 `445e2207c1660a43cdcd91aebc1c26964a9fceba36ca238b9fd86de1d964d022`.
- Direct-smoke evidence index: SHA-256 `2f5353bd0c52f66ac876de776caf3cd31e3bbde8c792d555491d555bff76cb74`.
- Final contract: `module-coordination/CONTRACT.md`, SHA-256 `ba6dbd37c15c83068216702f5c864af5e423d0871490a890a65052bd66710020`.
- Rulings: `module-coordination/RULINGS.md`, SHA-256 `15612273fa54d60ae92a0175231b369abb6bc9b1d521620f954fe5d0e48616a2`.
- Acceptance criteria: `module-coordination/ACCEPTANCE.md`, SHA-256 `2449f2eb33dea9b38d9f1151472b6c4a492b8be2b42f9bfc38e1e889d7d60ea8`.

No production files, Git state, or native scheduler state were changed by this review.
