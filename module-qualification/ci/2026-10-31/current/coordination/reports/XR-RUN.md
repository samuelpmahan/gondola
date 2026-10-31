# XR-RUN — independent offline consumer review

## Decision

**Accepted.** I independently checked and consumed the frozen E-RUN evidence bundle. The outer 123-member archive and its external manifest match their pins; the embedded 529-member runtime archive matches its manifest and source identity. I safely extracted the verified inputs, rebuilt the archived Go verifier with network access disabled, and ran both archive and directory CLI modes. Both reports agree on the same 529 input hashes, ABI result, and 12-profile capture result.

## Provenance and archive checks

The sealed E-RUN report (`c347bd32a849c328ec64837dd04fad3140a33a6c847619d62eceb2b2382c5465`), receipt (`a31c22b5d1dba200ada5fc1997e3c746afca3b599972cbc3f449fb5d0092beaf`), and 30-file raw-log index (`557776cf1ce1e6d58ba51864353641681b1ecaf3660ddcd11d83a9ea5f951f17`) match their seal. All 30 indexed raw-log files matched their recorded sizes and hashes.

The outer archive is 6,616,802 bytes, SHA-256 `98a1c68ed0c2453775a4e069482256b186f6446af40dd3ec0c7837d116914e9e`; its external manifest is 1,530 bytes, SHA-256 `e7567785384c06242aee247026de57245ba68c26fc9f9d5de2c3f72359c092f2`. Before extraction, I checked every path for canonical relative form, duplicates, file/descendant conflicts, and regular-file type. The archive contains 123 files: 121 index-listed files, `bundle/index.json`, and the root execution snapshot. Every file matched its expected byte count and SHA-256; expanded size was 8,509,794 bytes.

The embedded runtime archive is 6,376,501 bytes, SHA-256 `05c71d20f7d7e25281b885a5bed20c337540d9bd6bb9728b23aeaf845f70066d`; its manifest SHA-256 is `4d0e4a7b7362d2d206f32785d3844a1c326f9796ce243252c0dd0ecd31f808c9`. All 529 regular members matched the manifest, totaling 67,487,998 expanded bytes. The archive and manifest bind to source commit `4395d41ade7e4196878b6885d4c46dd4d8ec85f1`. The archived verifier source closure contains 43 files (41 Go files, `go.mod`, and the mutation-control JSON). A read-only check of the current checkout reported the same source commit, tree `5835ca66f5c4903c711e04aa7e8d14212632bc3a`, and an empty working-tree status.

## Offline rebuild and fresh CLI checks

I copied the bundle into a private temporary directory only after validating the complete outer inventory and member hashes. From the copied `bundle/verifier-source`, I rebuilt the verifier using Go 1.24.0, `GOTOOLCHAIN=local`, `GOFLAGS=-buildvcs=false`, `GOPROXY=off`, `GOSUMDB=off`, a fresh Go build cache, and an empty module cache. The command and output pins are recorded in `rawlogs/XR-RUN/`; no network or browser was used.

```sh
go build -o <private-temp>/module-qualify ./cmd/module-qualify
<private-temp>/module-qualify --archive <verified-outer>/bundle/upstream/runtime.tar.gz --manifest <verified-outer>/bundle/upstream/runtime.manifest.json
<private-temp>/module-qualify --directory <verified-runtime-extract>
```

Both CLI invocations exited 0. Each reported source commit `4395d41ade7e4196878b6885d4c46dd4d8ec85f1`, 12 profiles, 144 events, 99 updates, seeds 20261031–20261033, ABI status `passed` for four builds/two pairs, 147 source pins, and 529 input pins. For both reports, every input path, byte count, and SHA-256 exactly matched the independently verified runtime manifest. All semantic report fields were identical; archive mode additionally reported 529 archive members and 6,376,501 compressed bytes.

## Archived acceptance witnesses

The immutable bundle's focused Go run has 82 passing test results (30 top-level tests and their subtests), zero failures, and zero skips. I counted 19 passing coherence subtests and checked the ten listed mutation controls. The archived M0 output contains “same over 5000 inputs,” “receipt matches,” and “SHA256SUMS ok.” The interaction output reports 107 scripts and 4,473 ticks at seed 20261030, with eight Node tests passing. These are preserved archived run results; I did not rerun the test suite or browser.

The earlier outer-consumer attempt and its corrected retry remain preserved. The first checker double-prefixed indexed paths and reported an inventory mismatch even though actual and expected counts were both 123. The retry verified the exact inventory, hashes, and embedded runtime archive. The first command-inventory checker looked for `bundle/evidence-manifest.json`, although the authoritative manifest is external; its corrected retry verified 18 archived successful commands and two successful post-archive Git checks stored separately. These were checker expectation errors, not producer failures.

My first local consumer attempt also misread “43-file source closure” as 43 Go files. The archived closure is 43 files total: 41 Go files, `go.mod`, and the mutation-control JSON. I preserved the failed assumption and reran the corrected consumer successfully without changing the archive or source.

## Limits

This review verifies the bounded archived profile, its manifest-bound inputs, and the copied Go verifier's behavior on those inputs. It does not launch a browser, rerun the producer's full suite, or authenticate Git history or producer/verifier build provenance beyond the recorded content hashes and source identity checks.
