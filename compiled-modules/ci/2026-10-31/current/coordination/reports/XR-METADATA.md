# XR-METADATA — independent review of Unicode metadata validation

**Reviewer:** N6  
**Decision:** `accepted`  
**Reviewed packet:** N5 `E-METADATA`  
**Scope:** The two pinned JavaScript ABI files, the sealed author evidence, its preserved XR-DIGEST witness and baseline, plus the stated Go/JavaScript compatibility evidence. No source, Git, or scheduler changes were made.

## Finding

The metadata repair is supported by the pinned tests and frozen witness. The prior E-DIGEST JavaScript validator admits the exact malformed descriptor; the current validator rejects it as unpaired UTF-16 before hashing. Go decodes the same bytes and rejects the resulting artifact digest mismatch. The current validator also keeps well-formed astral Unicode, Go-compatible escaping, five actual Go/Node artifact pairs, and the ordinary ASCII pair working.

## Boundary and evidence

The final Node suite covers lone high and low surrogates in copied descriptor values and keys, descriptor sidecar values and keys, AppIR object values and keys, artifact-map paths, and embedded `app-ir.json` values and keys. Instrumented WebCrypto counters remain at zero for the malformed cases. The valid astral-Unicode case is admitted.

The 5,973-byte witness has SHA-256 `034334f2973f7bcfeda8d806fdeb3b5af4a3ffa43504be9102b1315e0b1028ca` and is byte-identical to the earlier XR-DIGEST witness. With the preserved baseline validator (SHA-256 `2a8f0c4cfb2a60c08a71f2596b5e06563b663c1aa60d07384d488a8268bc95b0`), the witness is admitted. The current validator rejects it with `unpaired UTF-16 surrogate before hashing`; Go reports `artifact digest does not match artifact inventory` for that same sidecar.

The current validator still agrees with five fixed Go-generated canonical-JSON escaping vectors (`<`, `>`, `&`, U+2028, U+2029). Five real historical parent/child artifact pairs have matching Go and Node ABI digests. The ordinary ASCII parent/child pair remains admitted with its original artifact and ABI hashes.

## Reproduction and pins

I reran `/tmp/gondola-node22/node_modules/node/bin/node --test compiled-modules/abi/validate.test.mjs` against the final pinned source: 10/10 passed under Node v22.23.4. The author packet's Go 1.24.0 `go test -count=1 ./moduleabi` log and frozen-witness decoder output were also inspected; the Go test log is green and the witness is rejected as above. The Go vector and real-pair comparison logs report five matches each.

The sealed E-METADATA report and receipt match their seal. Both current source files match the final source inventory, including the test-file chronology after its embedded-AppIR key cases were added. All 68 E-METADATA raw-log entries match their recorded sizes and hashes; the author index-verification record has no errors.

- `compiled-modules/abi/validate.mjs`: 36,096 bytes, SHA-256 `f3673bac84514039c80ee2eb74651a38720a9c21ccaab9007247866b8b49397e`
- `compiled-modules/abi/validate.test.mjs`: 16,340 bytes, SHA-256 `2f6dee40274860b226d8c13e5a3d778ce1b1ace9d50dc4cab771f1cd2e6fccc1`
- E-METADATA report SHA-256: `df2d22cac255afdbbc8ee76566ffd1a2cc28a55c337374fdb9783076527ce804`
- E-METADATA receipt SHA-256: `4a682ce7a0014dc097538791468809e9747c9ec1b5c1c6495f5f7aa6fb25fbc9`
- E-METADATA raw-log index SHA-256: `75a72167ffd198d4a9a657cb25d066b5b7fae34042d080627b29f54cec85ef16`
- Review audit: `module-coordination/rawlogs/XR-METADATA/audit.json`
- Review raw-log index: `module-coordination/rawlogs/XR-METADATA/index.json`

## Limits

This review accepts the tested malformed-string/key boundary and the listed compatibility witnesses. It does not claim that Go rejects malformed Unicode as a general decode policy, because the Go side still reports an artifact digest mismatch. No fresh producer, browser, or full integration run was performed, and no broader metadata or malicious-input guarantee is inferred from these finite cases.
