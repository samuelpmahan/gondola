# XR-CLI — independent N5 review

## Decision: accepted

The sealed N3 CLI source and its captured runtime behavior meet the frozen contract. I found no must-fix issue in the two reviewed files, `cmd/verify-qualification/main.go` and `cmd/verify-qualification/main_test.go`.

## Findings

- The CLI requires archive, manifest, and source-commit values; rejects unknown, malformed, repeated, empty, and positional arguments; and serves help without invoking the verifier. Its success path delegates qualification to `qualificationarchive.Verify` before producing deterministic indented JSON with a trailing newline.
- The optional output is opened with `O_EXCL`, so an existing path is preserved. The command creates it only after verification and JSON encoding succeed; write and close errors clean up the new file. If stdout fails after the output file is written, the new file is removed. Unit tests cover these cases.
- The original 397-member archive is rejected because the pinned `compiled-frontend/frontend/react/review-evidence/r2-go-emit.log` copy is absent. The actual CLI exits 1, writes zero stdout bytes, and creates no requested output file. This preserves the intended fail-closed result.
- The complete 405-member archive verifies as qualified with all 13 cases passing. The stdout-only JSON, stdout JSON when `--output` is set, and output-file JSON are byte-identical at SHA-256 `0aae5ce79da5211dbf836425b4f8f1ee9d40533e07235133dd5c467c33e15979`.
- The sealed E-CLI receipt's 14 source records and 42 evidence records match their recorded byte counts and SHA-256 values; its native receipt validation passes.

## Independent verification

Toolchain: Go `go1.24.0 linux/amd64`; receipt-validation Python `3.12.14`.

I ran the bounded CLI unit suite only:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false /tmp/gondola-go/go/bin/go test -count=1 -v ./cmd/verify-qualification
```

It passed all CLI argument, help, deterministic output, no-clobber, verifier-failure, and cleanup tests (exit 0). I separately checked the archived CLI result files and hashes for the 397-member fail-closed run and the 405-member byte-identical outputs. I did not rerun the full qualification package, browser pipeline, or hosted CI.

## Pins reviewed

| Evidence | SHA-256 |
|---|---|
| Sealed E-CLI report | `1c6838ae4db840d29498203ca431dc54f923a90d55f5804ee7878fd099ae8c69` |
| Sealed E-CLI receipt | `5110fb4a912ff601ee0138b073e68adfdc5894eebd672dc91a75ceb2be255adf` |
| `cmd/verify-qualification/main.go` | `2546634c91224c940f13c901b75dfea07fc9a741ee72ab57d924c9e10f7894af` |
| `cmd/verify-qualification/main_test.go` | `3ecf01f482e2fb5ebb7652cac10698fc0b99ee3600ef0875a150254ff5ca0a35` |
| Original 397-member archive | `61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca` |
| Completed 405-member archive | `5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1` |
| Completed manifest | `7645cb803edb5cbb053b43a5a02c04f124e3b60553f7057a6a92777f3d211dcd` |
| Positive verification receipt | `0aae5ce79da5211dbf836425b4f8f1ee9d40533e07235133dd5c467c33e15979` |

No source, fixture, Git, or shared state was changed during this review. This review establishes CLI behavior and consistency of the captured evidence; it does not establish fresh browser execution, hosted CI, or producer authenticity.
