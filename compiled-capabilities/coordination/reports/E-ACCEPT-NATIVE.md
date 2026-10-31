# E-ACCEPT-NATIVE: native, direct, and compiled-output evidence

## Lane conclusion

**Outcome: mixed change; native evidence accepted for the exact source using the verified hosted CI artifact.** The fresh local and hosted runs both pass their full E-BUILD receipts. Their native and direct lifecycle traces match byte-for-byte and match the frozen 26-event oracle; both React and DOM builds contain 67 pinned outputs, with byte-identical AppIR and encoder files. N4 independently verified the hosted artifact, inner archive, manifest, gzip end marker, and source pins, and the terminal source catalog is green.

The local full-run archive container is rejected. Its raw native/direct/build evidence remains valid bounded subevidence, but the local archive itself is not accepted and its cause is unknown. Per [ACCEPTANCE-SCOPE.json](../../ci/2026-10-31/ACCEPTANCE-SCOPE.json), the exact-source hosted CI archive is authoritative. This lane does not close the overall milestone; root's native scheduling audit, independent acceptance reviews, and exact-hash delivery reconstruction remain global gates.

## Source and terminal CI cohort

The source is PR 15, branch `codex/gobi-backend-capabilities-20261031`, commit `60b5aeff3172837ad7831c2b78b210454a3d81a2`, tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`, direct parent `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`. The follow-up publication binding records identical local and published commit/tree/parent; its SHA-256 is `18e502e12e886c99a641a4a02e0c39d690806644362ede3dc3aed92b5c49869d`.

The terminal current-source catalog at `compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/source-60b5aeff-terminal-runs-jobs-20261031T111444Z-v2.json` is 135,588 bytes, SHA-256 `b69f432f53e8d4ff85ae0d855bbfabec35f76febb4830853d313cb0a8b2d9bfc`. I parsed the file and verified its summary fields: 30 unique runs and 30 jobs, 15 push and 15 pull-request events, all runs and jobs completed-success, and all workflow heads match the source commit. The catalog records PR synthetic merge `07fc827212889af17524eadfe8c5c9da75d26850`.

N4's accepted custody packet is `E-ACCEPT-CUSTODY` (receipt SHA-256 `f5fd25cfb7ed7bd8070f862cb422e2dd403d23874066634a79d9e12b7ef9acb1`). It independently verified primary push run `41193504188`, job `124514913013`, artifact `13040129310`:

- The outer ZIP is 76,786,265 bytes with SHA-256 `3a54a53c81ac93ad1c5a8231b17ac289875ed57ad7bb12d7ae2b3609ff267de1`. All 1,476 ZIP members passed CRC and SHA checks, with safe paths and regular-file types.
- The embedded full E-BUILD receipt is `passed`, has zero failures, and reports matching before/after source pins across 163 files. Its SHA-256 is `f091b4814b377210bafd54ca1922bf7f129c160b5393f6ef0957e3018efb59c4`.
- The inner `capabilities-artifacts.tar.gz` is 14,960,460 bytes with SHA-256 `ba17805387c8204ef2624caec0af35641771bc8af48d4f03b82c1a6609586d8f`. All 189 files match the 35,229-byte manifest (SHA-256 `ccf0bb8fb460d72febd3f96ab7476f3f29588b80fba38c974cf4ab95066ebac5`), and gzip was consumed through EOF with a valid trailer. The independent inner verification record SHA-256 is `2d1b7d44636543db65d6f32457563fceda888168a1ce9b7e9201655db91cea04`.

## Full native/direct audit

The local full attempt is `compiled-capabilities/builds/attempts/attempt-20261031T103735751Z`; its E-BUILD receipt SHA-256 is `a04c312c50f6bc4099003045c2e421f0577243d1eff82d106ce1febc2c0e5398`. It completed at `2026-10-31T11:00:09.475Z` with status `passed`, 17 command rows, zero command failures, and 163 matching source pins before and after. Root recorded the outer process exit code as 0 in [ACCEPTANCE-SCOPE.json](../../ci/2026-10-31/ACCEPTANCE-SCOPE.json). The fresh hosted full attempt finished at `2026-10-31T11:02:41.335Z`, also with 17 successful commands and zero failures.

The independent Node 22 audit command was:

```text
/tmp/gondola-node22/node_modules/node/bin/node compiled-capabilities/ci/2026-10-31/source-60b5aef/native/audit.mjs compiled-capabilities/builds/attempts/attempt-20261031T103735751Z
```

It exited 0 and checked actual native/direct steps, state and Gobi trees, typed effects, request/reply correlation, output pins, and the full local execution receipt against the frozen fixture. The fixture has 26 events, 16 physical clicks, and 26 Go ticks. Both native and direct runs have 26 steps/ticks and no state, view, event, effect, ordering, or tick mismatches. The seven request tokens are `parent:g1:r1`, `child:g1:r2`, `grandchild:g1:r3`, `sibling:g1:r4`, `parent:g2:r5`, `child:g2:r6`, and `grandchild:g2:r7`. The three cancellations occur child-first: `grandchild:g1:r3`, `child:g1:r2`, `parent:g1:r1`.

The local native trace SHA-256 is `2a3ebb21b4da7ff70701c3a476b5d3b1b12d96e4cce8df4e1b648a15064956d5`; the direct trace SHA-256 is `4fbd9bb6b94e14647edfad95bf681949b2a14ead04091d351f2f4f6eb1689d71`. Those trace bytes also match exactly in N4's extracted CI artifact. The lifecycle checker reports `matched`; its JSON is byte-identical between local and hosted evidence (SHA-256 `b1bbd8a41d6eca789aa27fe5bbcdaa582e908249d8d1ff1fabc4e603e374718a`).

The raw audit output is `compiled-capabilities/ci/2026-10-31/source-60b5aef/native/data-audit.json` (SHA-256 `fb9544fd8a96a36b10d421030128608099f2c8e7dc444e65e0cfb8c1a2b34799`). The audit program SHA-256 is `1cd687865ac025926e0517c0250d59e12336253523a53d46a24233a37287a382`.

## React and DOM GoScript outputs

Both full-run builds used the actual compiler command `go run ./cmd/gobi-build` from `compiled-frontend` with `GOTOOLCHAIN=go1.27.3` and `GOFLAGS=-buildvcs=false`. Each BuildResult contains exactly one lifecycle app and 67 output files; every output was individually rehashed against its BuildResult and physical inventory.

The AppIR capabilities are `view.node`, `numeric.safe-integer`, `numeric.float64`, `effect.request-reply`, and `effect.cancel`. React and DOM AppIR bytes are identical (SHA-256 `ed93e9ae6f9be20c306669d63b676ed466e65fee8dc7fd0a1a4c8a6b38f0a68a`), and encoder bytes are identical (SHA-256 `521a73b7cdcbec19b764e8dea2936f466c2cd71550b06bae1d5110d3a503c4a4`).

I compared all 67 output paths in each local backend build with the matching hosted CI build. The path sets match, and 65 file bytes match for each backend. The only differing files are the generated `gobi-compiled.mjs` and `forwarders/go.mod`: the module's source-path comments refer to different temporary GoScript build directories, while all non-comment module content is identical; `forwarders/go.mod` differs only in its local-versus-hosted repository-root replacement. Raw module hashes remain separate:

| Backend | Local module SHA-256 | Hosted module SHA-256 | Local `forwarders/go.mod` SHA-256 | Hosted `forwarders/go.mod` SHA-256 |
| --- | --- | --- | --- | --- |
| React | `9229f4da86e91aa5c057981856c532b245d0d29f8a094f9ac237802de45d9ce3` | `e6768a43d409664c3a573520f548344c9d13502a8dc0c5100f2dd88d9d6c86c1` | `797b7d933d53048fd4b445b0d5ff5fcb40192b98f83d4986eef7b416d0844c5c` | `2c0e30330ecf59e6498e28f91e36e8d16bd11bccbb7d08e9ed0ad73bd246aeaa` |
| DOM | `2e95c81b11351c33c973dc21a7dc3058f6e84c700ce7cd12dbb5429b1593497a` | `7fd1b9e272ab03dc3c64757dd3af99c5af88933c95fdcf0325067861e8afad1e` | `797b7d933d53048fd4b445b0d5ff5fcb40192b98f83d4986eef7b416d0844c5c` | `2c0e30330ecf59e6498e28f91e36e8d16bd11bccbb7d08e9ed0ad73bd246aeaa` |

The reproducible hosted comparison command was:

```text
python3 compiled-capabilities/ci/2026-10-31/source-60b5aef/native/compare_hosted.py
```

It exited 0 and wrote `hosted-byte-compare.json` (SHA-256 `ee320e9a7a539e71b7e5cea4f403ab80e7caafe97ea5fd545108a6cd9c06667e`). The comparison script SHA-256 is `8cec2143cdd5f5071c87b2a3b1e4b343113cc5299e31bcc1a009b9cee51f31c0`. Node was `v22.23.4`; comparison Python was `3.12.14`.

The local receipt recorded Node `v22.23.4`, npm `11.9.0`, root Go `1.24.0`, compiler Go `1.27.3`, and Chromium `153.0.8010.0`. The hosted receipt recorded Node `v22.23.4`, npm `10.9.9`, root Go `1.24.13`, compiler Go `1.27.3`, and Chrome for Testing `156.0.8078.4`. All three lockfile hashes and locked React, React DOM, Playwright, and esbuild versions match; npm, root Go, and Chromium versions differ between local and hosted environments.

## Local archive rejection

The local run's report records an archive of 14,983,690 bytes with SHA-256 `1a4fd17fd4f8c2aef16aaa1ed268d253b13dd77396e6cb6da3108e2b2c3921ab`. A separate root integrity record found 12,845,056 bytes with SHA-256 `91e3d977e8efd7ef42a37d43029997a9e2ab8db7266a88cf54d5f7cc90a64b5f`; independent validation rejects the gzip stream as truncated. The producer's receipt, archive, and manifest were preserved unchanged. The root integrity manifest is 103,152 bytes, SHA-256 `4d8434ed7defccbb0a71c48ce9e230d2bf0af73b91c2849c831971de2e7f40a6`. `ACCEPTANCE-SCOPE.json` rejects the local archive with cause `unknown`; the hosted CI archive is used for source-bound acceptance. No cause is inferred here.

## Remaining global gates

This lane accepts native/direct lifecycle evidence and actual React/DOM output evidence for the exact source, backed by the independently verified same-source hosted full artifact. It does not accept the local archive. Overall milestone closure still depends on root's independent native scheduling audit, the required independent acceptance reviews, and exact-hash reconstruction of the hosted archive from delivery chunks. No production changes, Git mutations, merges, or deployments were made by this lane.
