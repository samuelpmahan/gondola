# E-ACCEPT-PROVENANCE

**Outcome: accepted for the capability source milestone using the verified same-source CI archive.** The local runner receipt passed, but its archive container is truncated and is explicitly rejected. The fresh CI execution on the exact published source supplies the accepted full archive and receipt.

This closes N6 source and execution provenance only. It does not claim that all six independent reviews, the root scheduling audit, or the final delivery-custody gate have closed.

## Source identity and M0

The tested and published source is `60b5aeff3172837ad7831c2b78b210454a3d81a2`, tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`, direct parent `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`. That commit is parented by the earlier published source and remains a descendant of frozen M0 base `00da54ad0f5a4006b13a5cded18ce291845978bc`. The follow-up publication binding records local=remote source identity and branch ref readback. The PR synthetic merge `07fc827212889af17524eadfe8c5c9da75d26850` has the same source tree and ordered parents `[00da54ad…, 60b5aeff…]`; the primary PR job log checks out that merge object.

The independent N1 auditor passed against both the local E-BUILD receipt and the extracted CI receipt. Each has 163 exact before/after pins matching the worktree and Git source. The audit verified all 24 original M0 SHA256SUMS entries: 23 tracked inputs plus the signed generated `react-map.gen.mjs`; `EXPECTED.json` remains byte-identical to base.

## Full executions

The local full command ran from 10:37:35.752Z to 11:00:09.475Z:

```sh
GOTOOLCHAIN=local GOFLAGS=-buildvcs=false GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 CHROMIUM_PATH=/tmp/chromium CHROMIUM_EXECUTABLE_PATH=/tmp/chromium bash run-compiled-capabilities.sh
```

Root observed process exit code `0`. The canonical E-BUILD receipt is `status: passed`, `mode: full`, 17 successful commands, 12 passed stages, zero failures, and stable 163 source pins. It records Node 22.23.4, npm 11.9.0, root Go 1.24.0, compiler Go 1.27.3, Chromium 153.0.8010.0, React and ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2. It uses the frozen lifecycle fixture and literal capability expectations; no random seed is used.

The inherited full lifecycle receipt and typed nested methods, backends, and frontend facts are hash-bound in E-BUILD and passed. Fresh React and DOM GoScript builds each produced 67 outputs and the backend comparison matched. N4’s literal oracle, N3 compiled conformance, and N5 HTTP demo passed. N3 reported 19/19 admission cases, both rejected and compatible raw-preservation checks, and all nine ordered mutation controls detected. The HTTP demo passed eight browser checks with no WASM requests or API attempts.

The local outer receipt says its archive round trip passed, but the immutable N5 complete verifier rejected the current on-disk tar.gz: the receipt binds 14,983,690 bytes and SHA-256 `1a4fd17f…`, while the actual file is 12,845,056 bytes and SHA-256 `91e3d977…`; gzip ends before its trailer. The adjacent manifest still matches its receipt binding. A separate read-only audit verified all 189 loose manifest-listed files (90,270,286 bytes) against their exact sizes and hashes, while confirming the receipt, manifest, and tar remained unchanged. This loose-file check does not make the corrupt tar valid. The cause is unknown. The local archive is rejected, not waived or relabeled as passing.

A separate 16 MiB witness was already complete before the observer’s first read; both observations matched its producer marker. That was a non-concurrent observation and does not reproduce or explain the local archive truncation. No causal or general storage claim is made.

## Authoritative CI artifact and terminal catalog

The primary push run `41193504188`, job `124514913013`, and primary PR run `41193506502`, job `124514919688`, both completed successfully for source head `60b5aeff…`. The push job checked out that published commit. The PR job log checked out merge commit `07fc827…`, merging the source into the frozen base. The terminal N4 catalog and raw API response bind 30 unique runs and 30 job snapshots: 15 push and 15 pull-request runs, all on the source head and all completed-success. The independent catalog audit rechecked every raw run-list and per-run job snapshot byte count and SHA-256, run/job association, step status, focused run IDs, and provider ZIP CRC.

The primary push artifact (`13040129310`) is 76,786,265 bytes, SHA-256 `3a54a53c…`. It came from a fresh CI invocation of the default full command `bash run-compiled-capabilities.sh`; no regression execution was skipped or reused. Its extracted full E-BUILD receipt is byte-identical to N4’s preserved copy, `status: passed`, `mode: full`, with 163 matching source pins, 17 successful commands, 12 passed stages, and zero failures. N1’s source audit passed on that receipt. N5’s `--require-complete` verifier independently returned `status: verified`, `completeAcceptance: true`: the bound inner archive is 14,960,460 bytes, SHA-256 `ba178053…`, with its bound manifest, all 189 members (90,254,161 bytes), the pending immutable snapshot, source pins, full toolchain/dependency metadata, command-ledger prefix, and required stages verified. This same-source CI archive is the evidence used for source acceptance; the corrupt local container remains excluded.

The first CI archive-verifier invocation used a repository-relative receipt while setting `--root` to the CI extraction, so it selected the local receipt and could not resolve the local attempt inside the extraction. That pathing probe is excluded. The recorded N5 pass uses the extracted CI receipt’s absolute path and the extraction root.

## Scope limits

Compiler cancellation inference covers admitted exact keyed typed descriptors in Update-reachable functions, as implemented. It does not establish arbitrary Go/control-flow inference, computed protocol-field inference, or a universal Init-time inference guarantee. Pre-Init mismatch rejection applies to declared AppIR requirements.

The source-level decision and local archive rejection are recorded in `compiled-capabilities/ci/2026-10-31/ACCEPTANCE-SCOPE.json`. Root’s remaining reviews, scheduling audit, and delivery custody are separate gates; this packet does not claim all project work is closed. No source, M0 receipt, Git ref, provider run, or archived CI artifact was modified by this audit.
