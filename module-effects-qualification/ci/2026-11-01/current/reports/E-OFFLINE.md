# E-OFFLINE — N5 published-source consumer check

**Outcome: confirmed reuse.** The published Go CLI at repository checkpoint `4338255bf8800d521b7f932fb530fe2cedebbf72` accepted both the actual prior Git-readback attempt directory and the reconstructed prior publication archive while `PATH=/nonexistent`. Both runs exited 0 with empty stderr. The capture and ABI summaries matched exactly, and the canonical reports were equal after removing only archive metadata.

## Published verifier checkpoint and build

The verifier checkout was clean at HEAD `4338255bf8800d521b7f932fb530fe2cedebbf72`, tree `146daa2199e0c2ee679c622b6c765a2c0ff5b356`. `source-publication.json` records that the API, staged, and fetched trees are equal and that the publication is clean. Its SHA-256 is recorded with the raw evidence. The verifier worktree was still clean after the build and consumer runs.

I built `cmd/module-effects-qualify` outside the Gondola repository using Go `go1.24.0 linux/amd64`, with `-mod=readonly -trimpath`. The binary SHA-256 is `91ba287c7333c5291bd81ad0cc8f2586639bc19b8570c9562744eaeecf29b1ee`. Embedded Go build information names verifier revision `4338255bf8800d521b7f932fb530fe2cedebbf72` and `vcs.modified=false`. The saved `go list` output identifies the 14 repository packages and the 35 local `.go` files compiled into the closure; `go-source-closure.sha256` pins each of those files.

## Inputs and results

The directory input was `/tmp/module-effects-publish/readback-final-primary`. Its root contains `builds/`, `conformance/`, `demo/`, `execution-before-archive.json`, `logs/`, `metadata/`, `oracle/`, and `source/`. Its saved source-closure metadata identifies producer commit `e0933465725e470dc610e3f81b4bbee95538c1d0`, a clean source snapshot, and no source-pin mismatches.

The archive input was reconstructed from the nine parts under `/tmp/module-effects-publish/publisher/output/primary-portable-final/bundle/`. Each part hash matches `bundle-parts.json`; concatenation produced the declared 8,667,568-byte archive with SHA-256 `7eb9f28fc6504bf43207436dfc916549bb28e34059cee69bc138376be7940087`. The matching manifest SHA-256 is `457073a81f1c93ba0edfe51b06667bb39f9baed95fd32ad3a9c630f9f476b1b9`.

Both Go CLI invocations reported producer source commit `e0933465725e470dc610e3f81b4bbee95538c1d0` and source identity `dirty=false`, `sourcePinsMatch=true`, `sourcePinCount=202`, `archivedSourceChecks=202`. Both accepted the same native profile totals:

| Check | Result |
| --- | ---: |
| Scenarios | 4 |
| Profiles | 20 |
| Events | 178 |
| States | 182 |
| Effects | 58 |
| Transport events | 116 |
| Seeds | 20261104, 20261105, 20261106 |
| ABI builds / pairs | 4 / 2 |

Archive mode additionally reported 639 members, 8,667,568 bytes, and source commit `e0933465725e470dc610e3f81b4bbee95538c1d0`. The directory JSON is 123,355 bytes (SHA-256 `03fdd5ee715dd225554e05ea95dc955907312a4ef70676afc834285a9e07fae8`); the archive JSON is 123,480 bytes (SHA-256 `62eb963c6550292efe5f51602aeb75892cf9326c8dafb93f7f89a6d6bf62f86c`). `compare-cli-reports.py` uses only Python’s standard JSON library to remove archive metadata and compare the remaining CLI reports canonically; it does not determine capture or ABI acceptance.

As a CLI boundary control, `PATH=/nonexistent module-effects-qualify --unknown` exited 2, wrote zero stdout bytes, and returned the expected usage diagnostic on stderr.

## Limits

This check covers the prior PR23 Git-readback input and archive only. It does not claim fresh-profile coverage. Passing reports establish that these bytes pass this published verifier; they do not authenticate the verifier binary or Git history, prove a compiler invocation, or qualify arbitrary module graphs. The Go CLI itself made the acceptance decision; no Node or Python semantic consumer was used.

## Evidence

- Exact commands and inputs: [`commands.txt`](../rawlogs/E-OFFLINE/commands.txt)
- Complete directory and archive JSON reports: [`directory.stdout.json`](../rawlogs/E-OFFLINE/directory.stdout.json), [`archive.stdout.json`](../rawlogs/E-OFFLINE/archive.stdout.json)
- Invalid-argument control: `invalid-cli.exit-code`, `invalid-cli.stdout.txt`, `invalid-cli.stderr.txt`
- CLI exit codes and stderr: `directory.exit-code`, `archive.exit-code`, `directory.stderr.txt`, `archive.stderr.txt`
- Binary, Go build info, local Go source closure and hashes: `module-effects-qualify`, `go-binary-buildinfo.txt`, `go-source-closure-local-packages.tsv`, `go-source-closure.sha256`
- Reconstructed archive, manifest, and segment hash records: `prior-publication.tar.gz`, `prior-publication.bundle.manifest.json`, `publication-part-hashes.txt`, `publication-archive-hashes.txt`
