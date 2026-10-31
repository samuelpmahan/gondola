# E-METADATA — reject unpaired UTF-16 in module metadata

**Worker:** N5  
**Outcome:** `mixed_change`

## Repair

The previous JS admission path accepted a self-hashed parent descriptor whose artifact directory contained an escaped unpaired high surrogate. Go’s `DecodeDescriptorJSON` decodes that escape as U+FFFD and rejects the resulting artifact digest. The validator now rejects unpaired high and low UTF-16 surrogates in metadata strings and object keys before it snapshots or hashes them.

The recursive metadata snapshot validates descriptor and AppIR string values and keys. Artifact-byte map paths are checked while copied. The raw JSON scanner validates every parsed descriptor and AppIR string/key, including escaped surrogates, before sidecar comparison. The embedded `app-ir.json` is decoded and checked before artifact hashing or comparison. Canonical JSON serialization also rejects malformed strings and keys as a final guard. Well-formed surrogate pairs and the existing Go escaping for `<`, `>`, `&`, U+2028 and U+2029 remain supported.

## Regression evidence

The frozen 5,973-byte XR-DIGEST descriptor was replayed byte-for-byte. The sealed E-DIGEST validator admits it with the ordinary child; the repaired JS pair validator rejects it before hashing; Go rejects the same bytes with `artifact digest does not match artifact inventory`. The red baseline and both rejecting outputs are retained in `rawlogs/E-METADATA/`.

The expanded Node suite passes 10/10. Tests cover lone high and low surrogates in descriptor values/keys, descriptor sidecar values/keys, AppIR object values/keys, artifact map keys, and embedded `app-ir.json` values/keys. Digest-call counters confirm rejection occurs before WebCrypto hashing. A well-formed astral path remains admissible.

No Go decoder change was made. The five Go-generated escaping vectors still match. Fresh Go `Describe`/`ValidatePair` and JS `validateModulePair` checks on the same five historical artifact pairs match all parent and child ABI hashes. The ordinary ASCII parent and child descriptors still admit with their original Go artifact and ABI digests. Go `./moduleabi` tests pass.

## Verification and scope

Node v22.23.4 and Go 1.24.0 were used. Exact commands, failure output, replay outputs, and source pins are indexed under `rawlogs/E-METADATA/`. The source diff is limited to the two owned ABI files. `validate.test.mjs` changed after the first stable notice to add raw embedded AppIR key cases; the final hash and chronology are recorded in `source-change-chronology.json`, and the final 10/10 suite ran against that final hash.

This packet does not claim a fresh full producer/browser run. No API, schema, or Go policy was changed. N5 ran no Git or scheduler commands.

## Final source pins

- `compiled-modules/abi/validate.mjs`: `f3673bac84514039c80ee2eb74651a38720a9c21ccaab9007247866b8b49397e`
- `compiled-modules/abi/validate.test.mjs`: `2f6dee40274860b226d8c13e5a3d778ce1b1ace9d50dc4cab771f1cd2e6fccc1`
