# XR--CI-DEMO (N4 review of E-CI-DEMO)

**Decision: accepted.** N5's E-CI-DEMO packet is consistent with the retained primary push artifact. I independently verified the original provider ZIP, the readable retained tar, all indexed file bytes, the complete outer and inherited command streams, source and output pins, both CLI output inventories, five conformance profiles, and the HTTP smoke evidence. The successful run is the push at head `195c9433179218348d4b9f2477ae1e0725337d15`; this review makes no claim about the separately tracked PR run or PR readiness.

## Primary artifact and retained copies

- Primary run `41155530877` is a completed successful `push` run at head `195c9433179218348d4b9f2477ae1e0725337d15`, tree `c0e4a66eee3fdd8b789e1b565167856fdab62433`. Job `124401386239` completed successfully, with all 12 recorded job steps successful. The raw workflow transcript records `bash run-compiled-backends.sh` without `--backends-only` and the managed Chromium setup.
- Provider artifact `13025112465` is present at `compiled-backends/ci/2026-10-31/original.zip`: 14,931,201 bytes, SHA-256 `646f06eb972d8ab2680fa34b12bf646e0dda1d8bd31c2ae1a3df443b113c99aa`. I recomputed that hash and checked every ZIP member against the 817-entry retained index and extracted file tree; all paths and bytes match.
- The readable copy `ci-artifacts.tar.xz` is 5,217,080 bytes, SHA-256 `91b781500ff5379cf118918f545b6593969cb28d5495014b68c9a3ea6ca9218d`. Its 817 regular-file members each match the retained index. The ZIP, extraction, and tar are available in this evidence worktree at review time; this review does not claim Git persistence beyond the worktree.

## Full runner evidence

The outer `execution.json` hash matches N5's receipt. It records `mode=full`, `status=passed`, no failures, 18 commands, and zero exit status for every command. I rehashed all 36 stdout/stderr log files against the command records. The nested compiled-frontend `execution.json` also matches its embedded SHA; its 33 commands all exited zero, and all 66 stdout/stderr streams match. This verifies 102 command streams in total. The retained outer command order includes the inherited runner before native build, React/DOM builds, conformance, HTTP demo bundle, and smoke. The preserved receipt contains only the final `execution.json`; the report accurately does not claim a separate pre-command `status=running` snapshot.

I recomputed all 126 source pins from the exact Git objects at the reviewed head and confirmed the before/after arrays match. Both backend requests and result receipts are present: React and DOM each report four apps and 209 output files; all manifest entries carry the selected backend tag. For each backend, the before and after 209-entry output inventories match after removing only the recorded output-root prefix. Across the two builds, all 204 non-bundle, non-manifest companion files are byte-identical. The four GoScript bundle hashes are separately pinned by backend and app; no cross-build bundle equality claim is made. The per-app `app-ir.json`, encoder, generated component module, and role bindings match, and the report's `moduleLoads: 1` records use of each React-profile compiled module by both renderer choices in the harness and demo.

All five conformance profiles are `matched`: counter, form, list, effect, and list-growth. Their source remains stable, and their input/capture pins match the retained archive.

## HTTP smoke

The backend HTTP smoke record is `passed` with five checks, no browser errors, no app failures, and no WASM requests. It records Chromium `156.0.8078.4` with `CHROMIUM_PATH` unset; the workflow transcript records the Playwright-managed install. The screenshot at `extracted/compiled-backends/artifacts/demo.png` matches the retained root copy and measures 151,554 bytes with SHA-256 `5422b89958275a81bed3fd203ae2840d047dd8bfcbe12dfe90e397c3a1ac93fe`. The smoke checks the four-app mount, counter state and stale callback fence over renderer swaps, form state and backward selection, keyed list state, and pending manual effect completion. The source shows loopback HTTP and an in-memory effect host; these results do not establish production transport behavior or physical-node identity.

## History and limits

The earlier `E-CI-DEMO-interim-insufficient` record remains an interim result for head `832d21262ce5dd3bd1d308a19bd8d7a422f6d7cb`; it is consistent with the later fresh artifact packet and was not rewritten. The current E-CI-DEMO report and receipt are present at the canonical dated coordination paths referenced by their source scope.

The reviewed packet establishes the successful full push run only. It does not establish the separately tracked PR run or overall PR readiness. The review reused immutable artifact contents and did not rerun browser tests or the full CI suite.

## Audit artifacts

- Independent archive, source-pin, command-stream, build-output, conformance, and smoke audit: [`audit.json`](../../lanes/reviews/xr-ci-demo/audit.json), SHA-256 `17a543fd42ea2bd2b0777979f2a5011123eb8eda71472b2ff9f051385dd3a358`.
- Reproduction script: [`audit_primary_demo.py`](../../lanes/reviews/xr-ci-demo/audit_primary_demo.py), SHA-256 `bad87fb3f9ab41159f81933ffcb720fa5a1b1ed6965156c70d87abee2223173a`.
- Reviewed E-CI-DEMO report SHA-256: `f094cdd44e803eb0f9215d91974722a740647469d5bf2cd6cda82eeed3c66a8e`.
- Reviewed E-CI-DEMO receipt SHA-256: `9b46bc62455753b5d5e54a8a46cc38928cdea3eb8e756300be11cebe12a87082`.
- The audit was run with Python 3.12. The command `python3 compiled-backends/ci/2026-10-31/lanes/reviews/xr-ci-demo/audit_primary_demo.py` completed successfully; no tests, compiler, browser, or network commands were run for this review.
