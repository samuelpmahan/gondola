# XR-DIGEST — independent review of Go/JavaScript digest parity

**Decision:** `amend`. **Reviewer:** N5. This read-only review covers the sealed E-DIGEST repair, its source pins and raw evidence, plus a narrowly scoped sidecar admission edge case.

## E-DIGEST checks confirmed

The E-DIGEST report and receipt match their seal; all three owned source files match the receipt inventory; all 48 indexed E-DIGEST raw files rehash correctly. The source diff against the preserved pre-fix validator adds Go-style string escaping for `<`, `>`, `&`, U+2028 and U+2029, and UTF-8 byte comparison at the ABI string-ordering sites. The diff leaves raw descriptor decoding, duplicate-key rejection, exact sidecar-to-object equality, artifact-byte checks and embedded `app-ir.json` validation unchanged.

Fresh focused checks passed with Node v22.23.4 and Go 1.24.0: the ABI Node suite is 7/7 and `go test -count=1 ./moduleabi` passes. A fresh Go `encoding/json.Marshal` vector generator matched all five fixed vectors for the five path characters. For actual artifacts, Go `moduleabi.Describe` and `ValidatePair` produced five parent/child descriptor pairs; Node `validateModulePair` admitted those same actual artifact bytes with matching ABI hashes for all five. The ampersand parent digest matches the preserved XR-ABI failure witness. I also independently rehashed all 20 historical build files and admitted the unchanged ASCII React parent/child descriptors with their original Go artifact and ABI digests.

The UTF-8 comparator is implemented as lexicographic `TextEncoder` byte comparison, which matches Go string ordering for valid Unicode strings. The exercised artifact directory prefix is common across each four-file inventory, so its Unicode code point does not change the fixed ASCII basename order. The supported Go-produced descriptors and actual Go/Node artifact witnesses pass.

## Finding requiring amendment

The JS admission boundary also accepts a self-consistent sidecar that Go rejects. I changed a synthetic parent fixture's artifact directory to contain an escaped unpaired high surrogate (`\ud800`), recomputed the descriptor digests with the JS fixture helper, and passed it with an ordinary child to `validateModulePair`. JS admitted the pair. Go `moduleabi.DecodeDescriptorJSON` rejected those exact sidecar bytes with `artifact digest does not match artifact inventory`: Go JSON decoding replaces an unpaired surrogate with U+FFFD before recomputing the digest, while the JS canonicalizer keeps the surrogate escape.

This witness was deliberately created in JS; it is not a Go-generated artifact, and the normal Go builder cannot emit this unpaired-surrogate spelling. However, the current JS path validator accepts it and the host admission API can receive sidecar bytes directly. The boundary should reject unpaired UTF-16 surrogates in copied metadata strings and keys before digesting so Go and JS make the same decision. The raw witness and exact output are retained in `rawlogs/XR-DIGEST/`.

## Limits

This review made no source or Git changes and did not rerun the full producer, browser, or integration pipeline. The successful real-artifact checks use the historical Go build files pinned by E-DIGEST; they establish digest compatibility for those inputs, not fresh producer acceptance or provenance authenticity. The one failed reviewer witness invocation was caused by its not-yet-created output directory; the same Go witness was rerun after creating that directory and passed. The failure and successful retry are both preserved.

## Reviewed identities

- E-DIGEST report: `01271435450278a6b44fd3207d7719002ca6a2bd8a555f44c1f37c1672def758`
- E-DIGEST receipt: `ffe561c17ae122e46aaf8ae5e074494c4f5f453a24c579b2956660cb86080a97`
- `validate.mjs`: `2a8f0c4cfb2a60c08a71f2596b5e06563b663c1aa60d07384d488a8268bc95b0`
- `validate.test.mjs`: `9bbcc79d988aa109330ddae93c5ffb86778c62946cc147256431e93237ddf4a9`
- `test-fixtures.mjs`: `c037f5d6e3355a198f6ac1b7d8b7aa1dee3c27557fe9a333c1e5965c6d5602dc`

Independent replay commands, outputs, pin checks, source diff and the amendment witness are indexed under `rawlogs/XR-DIGEST/`.
