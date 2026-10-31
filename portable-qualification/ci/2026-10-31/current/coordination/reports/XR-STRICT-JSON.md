# XR-STRICT-JSON — independent N1 review

## Decision: accepted

The strict-JSON repair closes the reproduced gaps without changing the Go-owned qualification policy. `CertifyFile` continues to use the existing typed input and certificate records and the existing `qualificationRegistry`; the added logic only validates JSON shape before decoding those records. The verifier likewise retains its existing provenance and source-byte comparisons.

The strict decoder rejects duplicate keys and case-insensitive aliases for typed Go struct fields, then uses `DisallowUnknownFields` for closed records. Field names come from the Go JSON tags. Dynamic map keys and `json.RawMessage` values remain opaque to struct-field casing checks; the duplicate-token scan still rejects duplicate keys within raw JSON. Case-evidence diagnostics that are intentionally opaque are named explicitly in the record. Focused tests cover the distinction, unknown fields, aliases, duplicates, and semantic certificate comparison.

## Independent results

I rebuilt `cmd/verify-qualification` from the reviewed source into `/tmp/xr-strict-json-verify` (Go 1.24.0, binary SHA-256 `2f8c7713266ad4dccdf9914ddfc5c725f34ce55529dfe1d56d445fe34f5a387d`). I then invoked that binary on the five rehashed archives from the prior XR-CERTIFICATE finding:

- duplicate raw `sourceCommit` with equal values;
- conflicting duplicate raw `sourceCommit`;
- conflicting duplicate snapshot `attempt`;
- unknown snapshot field;
- unknown case-evidence field with hashes/references refreshed.

All five exited nonzero with empty stdout and the expected strict-decoder error. The archive and manifest hashes matched the pinned prior counterexamples before each invocation.

Both complete 405-member positive inputs passed through that same binary:

- local completed archive and manifest: 405 members, 13/13 cases passed;
- hosted completed archive and manifest: 405 members, 13/13 cases passed.

The focused canonical/opaque JSON tests passed, including the run and evidence alias tests, typed snapshot duplicate/unknown/alias tests, raw state opacity, and certificate semantic equality. The full command/output captures and the positive receipt JSON files are in `portable-coordination/rawlogs/XR-STRICT-JSON/`.

All 40 review raw-log files are byte/hash indexed in `portable-coordination/rawlogs/XR-STRICT-JSON/index.json` (SHA-256 `dd0d1d3636f9169b0e3bbc70d6e1850da66481968a35c6d0de978c9063ac8c2f`).

## Source pins reviewed

| File | Bytes | SHA-256 |
|---|---:|---|
| `backendqualification/certify.go` | 37,302 | `beab2aa11d4b77bdbf06a99d61834eb2e2790cefd283009c9261dbe9d88aa512` |
| `backendqualification/qualification_test.go` | 24,296 | `9b7862ac8eb4a73365d604ceb3654708125bacaf0b566b641fbe7ad24aed6f60` |
| `qualificationarchive/verify.go` | 34,926 | `cffa5f0e1166e95f39a864ddb17ae8d8f57d1c6a7234ade6e7d48e2050c3e67a` |
| `qualificationarchive/verify_test.go` | 7,360 | `5c1cf6363d33628ce488b553d63813cd1ad0f1067c2e6c2aeddae35f701b3638` |

The reviewed source commit is `77f7ce36439f1ae457a397269ea5a8c6d2db1cb2`. Build inputs, exact archive/manifest hashes, and every CLI result are pinned in `portable-coordination/rawlogs/XR-STRICT-JSON/independent-results.json`.

## Limits

This review ran a focused Go test selection and the verifier CLI on the local and hosted completed archives. It did not run the full repository suite or a browser. The verifier establishes consistency of captured data and provenance; it does not authenticate the archive producer or prove fresh browser execution.
