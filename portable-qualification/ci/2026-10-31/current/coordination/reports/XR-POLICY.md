# XR-POLICY: independent review of E-POLICY

**Worker:** N3  
**Decision:** `accepted`  
**Date:** 2026-10-31

## Result

The sealed E-POLICY report and receipt are byte-identical to their seal copies. Current `qualificationarchive/policy_test.go`, `portable-qualification/THREATS.md`, and N1 `archive.go` match the author packet’s source pins. All 16 author rawlog pins match.

I reran the bounded policy command against the pinned archive implementation. It passed all 10 top-level groups and 27 nested cases (37 passing test nodes, no failures) in about 0.8 seconds. The separate N1 compressed-limit test also passed.

## Fixture quality and intended guards

The adversarial fixtures do not use wrong content hashes as a shortcut to rejection. Small payload rows hash the same bytes written to their tar entries. The 32 MiB boundary fixtures stream zero bytes and compute the corresponding zero-content digest with the same declared size. Duplicate/archive inventory cases use otherwise valid bytes; gzip-tail cases mutate the compressed stream while retaining the baseline tar-member manifest; source-commit cases start from a valid baseline archive and vary only the commit input/field. The single-file, aggregate-stream, and member-count cases therefore reach their intended size or inventory constraints.

Each rejection goes through `policyTestExpectReject`, which isolates `TMPDIR`, requires `Extract` to return no bundle on error, and checks that no extraction paths remain. The positive baseline test closes the returned bundle and checks that its private root is removed. The test helpers and fixture code confirm these cleanup checks exercise actual extraction state, not only temporary inputs.

The policy test helpers check rejection rather than matching a specific error string. I found their manifests and archive contents consistent, and the tested variants isolate the target condition; none has an unrelated hash mismatch that could cause premature rejection. The initial fixture-construction failure is preserved and correctly classified: `archive/tar.Writer` rejected a regular file name ending in slash before `Extract` ran. The final test set removed that unencodable case and passed.

The N5 suite covers 32 MiB per-file, 128 MiB expanded-stream, and 4,096-member limits. I independently ran N1’s separate sparse-file test for the 64 MiB compressed archive limit; it passed. The implementation also enforces the manifest/file limits before extraction and the expanded-stream cap while reading the tar stream.

## Claim boundary

`THREATS.md` accurately limits the result to structural archive/manifest integrity and consistency of the recomputed Go certificate. It explicitly says the verifier does not authenticate who produced an archive, prove that captured browser behavior is genuine, or establish that the current runtime matches the capture. The document presents the byte/member limits as bounds for this verification path, not a universal resource-safety guarantee.

No must-fix finding. This review did not run the full package suite, browser flow, or hosted CI. No production, Git, or native state was changed.

The command output, exact source pins, seal comparison, and rawlog hashes are in `portable-coordination/receipts/XR-POLICY.json` and `portable-coordination/rawlogs/XR-POLICY/`.
