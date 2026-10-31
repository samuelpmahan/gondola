# E-ABI — derived module ABI and pair admission

**Worker:** N5  
**Outcome:** `mixed_change`  
**Base commit:** `a275d646b0d8ceed956b27b6b8f3099e17106857`  
**Scope:** `moduleabi/**`, `compiled-modules/abi/**`, and this lane's report, receipt, and rawlogs.

## Implementation

Added the Go `moduleabi` descriptor builder and validators. `Describe(appIR, artifactFiles)` derives component identity, the conventional and bridge role signatures, recursively closed ordered type metadata, and finite capabilities from the supplied AppIR, then binds the descriptor to the exact output bytes. The inventory is closed to `app-ir.json`, `gobi-compiled.mjs`, `encoder.mjs`, and `components.gen.mjs` under one `apps/<appDir>/` directory; `module-abi.json` is its sidecar and is not self-hashed. Pair admission requires exactly one parent (`Output`/`Receive`) and one child (`Input`/`Publication`) using the nominal shared `modulewire.Input` and `Publication` IDs.

Added a browser-compatible JavaScript parity validator using WebCrypto SHA-256. It snapshots both modules' descriptor, descriptor bytes, AppIR, and artifact bytes before awaiting any digest; validates the closed descriptor and exact sidecar bytes; and returns frozen snapshots. The record helpers rebuild plain primitive records and reject prototypes/accessors/extra fields. `Input.Step` is 1–3 and `Revision` is a positive safe integer; `Publication.Count` accepts finite fractional values in `[0, Number.MAX_SAFE_INTEGER]`, and `Revision` is a positive safe integer.

The existing `gobiCompiled` role object was not changed. Bridge roles remain a separate ABI surface.

## Adversarial findings and fixes

- A fully rehashed descriptor with `Artifact.Bytes = 9007199254740992` was accepted by the first Go implementation. Go now rejects artifact byte counts above JavaScript's safe-integer limit; a regression rehashes the descriptor and expects rejection. The original preflight witness is preserved under `module-coordination/rawlogs/E-GO/preflight-unsafe-artifact-bytes/`.
- A UTF-8 BOM on a raw JS descriptor sidecar was accepted because the default `TextDecoder` strips the marker. The validator now uses `ignoreBOM: true` so the BOM remains visible to the strict JSON parser and is rejected. The original witness and pre-fix source copies remain under `module-coordination/rawlogs/lead-bom-preflight/`; `validate.before.mjs` SHA-256 is `e4190c4cc97d5938e3501b7f6ab45b1be55039ee8a4136f834d25b4fbbe2ea51`, and its output was `BOM_SIDECAR_ACCEPTED`. The current JS regression confirms rejection.
- Closed JSON decoding rejects duplicate keys, missing/extra keys, case aliases such as `Schema` and `ArtifactSHA256`, trailing data, and invalid UTF-8. Mutated descriptors with recomputed digests still fail when role signatures, nominal wire IDs, wire field names/order, or source-derived type closure differ.

## Verification

Tool versions: Go `go1.24.0 linux/amd64`; Node `v22.23.4`. Exact command lines, stdout/stderr, and the pair-check scripts are preserved under `module-coordination/rawlogs/E-ABI/`.

| Check | Command | Result |
|---|---|---|
| Go ABI tests | `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 ./moduleabi` | exit 0 |
| JS ABI tests | `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-modules/abi/validate.test.mjs` | exit 0, 6/6 tests |
| Actual Go-built pair check | `GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go run /tmp/moduleabi-actual-pair-check.go` | exit 0; both actual pairs derived, decoded, byte-validated, and admitted |
| Actual JS-built pair check | `/tmp/gondola-node22/node_modules/node/bin/node /tmp/moduleabi-actual-pair-check.mjs` | exit 0; both actual pairs admitted and frozen |

The actual React and DOM app outputs were built independently by N2 and are under `/tmp/gobi-module-gate1-{react,dom}-module{parent,child}-20261031/`. Both Go and JS checks read the four artifacts plus `module-abi.json` from each output. The generated parent/child descriptors contained the expected conventional roles plus their complete bridge pair:

| Profile | Module | Artifact digest | ABI digest | Sidecar SHA-256 |
|---|---|---|---|---|
| React | Parent | `3dfd31c0e783ef39c03343d19a74fe65484b2304e2b721d829d9d1038c90752f` | `7ac5a916d9cf08667b7dddec2cb70f2f2ad9147c9a2cdb5820e5dc301f215277` | `f77db058aacb19f115c073a97daaa61dd88003cb57cb3bb0b4c15887d9b46d70` |
| React | Child | `970aa7a2350fd8c27418f8113422524ed267bef01b89342657a3dbe4fc95e894` | `092380b7c276452369752cf77d306b89c28f7facfad653045e3d42e4c4df30d3` | `86f22733e37a0903fc5f18da192e5975ee3b5b51414d985106bee5eb54a552b8` |
| DOM | Parent | `891a24a01bf860dd048a5e57c48e7c7f18351d303af29d779ee59442b5e6bf23` | `2f8c61741f2cae080b7b68b9a6780421e0e71f41283bc3b208c80011eff3b2fc` | `664c95c6cdb5668fb953acca7c6c86ad87d2bb04290962dae553df32df0b08c5` |
| DOM | Child | `ee6d45434f6abbf95f813046b468717c980c3c0d7d0837dee8235a096840c122` | `d3c9e119047ab254cbb0c342f261750531ad478dd5b950bda64c7f23d1444a8d` | `3c8c8c13c0e2eb4e14e01e4a9ddda0ecf0104fd7ff7d6a39ecf49b40e0d5b748` |

The checks confirmed descriptor digests and actual artifact-byte hashes, then Go `ValidatePair` / JS `validateModulePair` accepted React parent+child and DOM parent+child. This is ABI admission evidence, not a claim that a mounted browser lifecycle was exercised; the host and conformance lanes own that check.

## Limits

This ABI is the frozen one-parent/one-child, effect-free `Input`/`Publication` profile with exact shared nominal types. It does not establish arbitrary Go package graphs, arbitrary type shapes, cross-bundle GoScript identity, asynchronous effects, malicious-code containment, or cryptographic provenance. SHA-256 binds descriptor metadata to supplied bytes; it does not authenticate who produced those bytes. The JS suite ran on Node's WebCrypto implementation; browser mounted integration is outside this packet.

## Source pins

| File | Bytes | SHA-256 |
|---|---:|---|
| `moduleabi/descriptor.go` | 37686 | `d255480f6a10792e1f7f4e6d2204014f128fbb764cd98be8bd23797016b51ced` |
| `moduleabi/descriptor_test.go` | 15399 | `6685a14593ab18f83fc9c0fc244b135c1378f21fc51e4e82e81ecc8c7a46e442` |
| `compiled-modules/abi/validate.mjs` | 34000 | `a392febf57509bc61c0f221e74429c0f6e268540ac2b675e931e5dc6396a16bd` |
| `compiled-modules/abi/test-fixtures.mjs` | 6834 | `ecedbc119e5bf441f0f265b3b5a67398fad28a03c8065d3466261575d779bbc1` |
| `compiled-modules/abi/validate.test.mjs` | 9109 | `111d40153ae1a6f326373430a518908047a8e66a96b6971b68fe62060d28cd14` |
| `module-coordination/CONTRACT.md` | 5478 | `ba6dbd37c15c83068216702f5c864af5e423d0871490a890a65052bd66710020` |
| `compiled-frontend/analyze/analyze.go` (N2 input) | 46162 | `b1c29537e11223fa10b262bd9a6f3ee3fb57cfd43594f4b13f52215e7f54b28b` |
| `compiled-frontend/build/pipeline.go` (N2 input) | 40718 | `78463101a450aec88cf2ecf8b7182fe2da432aab99885edd6304aeccab264c16` |
| `compilercontract/contract.go` (dependency) | 7144 | `35700b392b396a6ee9bdb822e3004854da75eeccadfd83b2989f754c24bfb188` |
| `compilercontract/validation.go` (dependency) | 20785 | `43b7ca7356782caa23ed8826b8778e5ce91eabaab50dcd06580a10d70deadc8e` |

No Git commit, scheduler, or shared source state was changed by this lane.
