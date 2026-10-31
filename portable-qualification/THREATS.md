# Portable archive verifier: threat boundary

## What is being verified

This package reads a tar/gzip archive and its JSON manifest, extracts the declared regular files into a temporary directory, then re-runs the existing Go backend qualification certificate verifier over the archived raw report. The resulting certificate is compared with the certificate in the archive and the caller-supplied expected source commit.

A successful result means the admitted archive is structurally within the verifier's policy, its listed bytes match the manifest's sizes and SHA-256 digests, and its archived certificate agrees with the certificate recomputed from the included report under the verifier's rules. The command does not execute the browser, JavaScript application, or GoScript renderer.

## Inputs treated as untrusted

The archive, its manifest, archive paths and member metadata, JSON fields, and the contents of extracted evidence are untrusted inputs. The expected source commit is supplied by the caller and is the trust anchor for the source-commit comparison. The archive and manifest are not signed by this verifier.

Admission must reject absolute, traversal, ambiguous, or non-normalized paths; duplicate, extra, or missing members; symlinks, hardlinks, and special tar entries; malformed or mismatched source commits; hash or size mismatches; and unexpected gzip trailing data, including concatenated gzip members. Extraction must be limited to regular files and must clean up its private temporary directory on failure. Successful bundle cleanup must remove only the directory created for that bundle.

The bounded input policy is:

- compressed archive: at most 64 MiB
- total decompressed archive stream: at most 128 MiB
- manifest/archive members: at most 4,096
- one file: at most 32 MiB

These limits are admission bounds for this portable verification path. The expanded-byte budget applies to the decompressed tar stream, including its headers and padding. They are not a general resource-safety guarantee for every operating system or every parser implementation.

## What this does not establish

A manifest digest is an integrity check, not an authenticity mechanism. An attacker who can replace both the archive and its manifest can create a different self-consistent pair unless the caller obtains the expected source commit and artifact identity through a trusted channel. The certificate comparison checks consistency of the included capture with the existing Go certifier; it does not prove that the capture came from a real browser, that the browser behaved honestly, or that the current runtime matches the captured runtime.

This verifier does not rerun frontend behavior, execute untrusted application code, verify a digital signature, authenticate a publisher, attest a build service, or prove that a Git checkout is clean. It makes no claim against kernel compromise, privileged filesystem interference, resource exhaustion outside the explicit archive bounds, or defects in Go's standard archive/compression libraries.

## Evidence discipline

Tests should generate archives and assert rejection at the relevant admission boundary. Oversized expanded-data cases can stream compact zero-filled content into temporary fixtures rather than commit large files. They should not claim a security property broader than the tested input class. The mounted archive's successful verification is evidence that this specific captured artifact is internally consistent under the bounded parser policy; it is not evidence of arbitrary malicious-producer resistance.
