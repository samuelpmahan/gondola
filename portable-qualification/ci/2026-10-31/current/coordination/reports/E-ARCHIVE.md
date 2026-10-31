# E-ARCHIVE (N1)

## Result

Implemented the bounded `qualificationarchive.Extract` API and owned extraction tests. It admits only a strict, exact-shape manifest for the expected 40-character source commit, verifies the archive and member hashes/sizes, and extracts the exact inventoried regular files into a private unique temporary directory. It rejects unsafe or ambiguous paths, duplicate/missing/extra members, non-regular entries, malformed/trailing gzip data, and inputs beyond the contract limits. `Bundle.Close` only removes the directory created by that bundle and is idempotent.

The implementation pins bounds of 64 MiB compressed, 128 MiB expanded, 4,096 members, 32 MiB per member, and 32 MiB for the manifest. The shared `qualificationarchive` package suite passed on the final captured source snapshot. That suite included the N4 actual-bundle integration tests and N5 adversarial policy tests; these are collaborators' files and are listed as test-snapshot inputs below.

## Commands and results

Go was `go version go1.24.0 linux/amd64`. The final command was:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test ./qualificationarchive -count=1
```

It exited 0 with `ok github.com/samuelpmahan/gondola/qualificationarchive 5.504s`. The final command, combined output and exit code are preserved under `portable-coordination/rawlogs/E-ARCHIVE/`.

The receipt passed the pinned Rebalancer `validate_receipt` check using `/tmp/rebalancer-env/bin/python`. This was read-only and confirmed the E-ARCHIVE job remained `running`; the validation command, output, and exit code are in the same raw-log directory.

The package tests exercise extraction, independent temp roots, caller-owned path safety, `Close`, and malformed manifests/archives. The final package snapshot also exercised the original published 397-member archive and the completed 405-member archive. The original archive is extractable under its own published inventory; its separate verification fails because eight source files needed to close the verifier's source inventory are absent. The augmented 405-member archive passes the verification integration path. This is archive consistency evidence, not a fresh browser run.

An initial red test-first compile is preserved. Two later package compile attempts also exposed a helper-name collision with N2's concurrently written verifier and an unused local in N4's integration test; the collision was resolved by prefixing N1's private helpers, and N4 fixed its test. Those intermediate logs are retained rather than omitted. The final package test was rerun after those fixes and passed.

## Source and input pins

Owned files at closure:

| File | Bytes | SHA-256 |
|---|---:|---|
| `qualificationarchive/archive.go` | 19,376 | `87e2db7726efb9ebf9262983b4dcc9674c7a7860fcd7b62918df04f7f3e2ea03` |
| `qualificationarchive/archive_test.go` | 10,514 | `e92a6e73c9489b037bcc1d3f517190700dbf27c382db44aa61142c4bc4980aa4` |

The package-test snapshot also included `integration_test.go` (`f2eac6b861450342f85dc8ffef0f099ca8d3fa46c6005c685298be88fb4b7541`), `policy_test.go` (`33c3dd4a2b348f08186357808a1695c27207d7f75b39ac5c947a0e8d255db941`), `verify.go` (`1999b7b0d693e6e8fc4019b71f727e646a73469d67ed2de805b680426b97a79c`), and `verify_test.go` (`e0362eba245cdbea0ec7fcdcfee4c0b94e80c80925d1279b804cb8ee5533d169`). Archive and manifest pins for the published and completed bundles are recorded in `rawlogs/E-ARCHIVE/published-inputs.json`.

## Limits

Extraction establishes bounded byte-level consistency with the supplied manifest and expected commit. It does not establish who produced the files, that the archived browser observations are true, or that a browser/backend was freshly executed. Verification and CLI behavior are owned by other lanes.
