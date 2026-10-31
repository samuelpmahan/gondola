# Independently compiled Go modules — executed acceptance, 2026-10-31

[Review PR20](https://github.com/samuelpmahan/gondola/pull/20) composes one independently compiled Go parent and one independently compiled Go child through an explicit typed module ABI. The child reuses the original counter. Go owns state, step/lock inputs, revision-checked publications and all updates; JavaScript validates and transports primitive records. React and standalone DOM implement the same admitted rendering contract. Four separate GoScript builds produce distinct parent/child artifacts for each renderer.

Source commit: `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`; source tree: `bcc71cef48f3a4e141daf181b43f8e12a2132f83`. PR20 is stacked on PR19. Main remains unchanged; nothing was merged or deployed. The interactive-counter milestone was already complete, so this work advances the compiled backend/qualification architecture instead of duplicating it. Initial branch/PR/run reconnaissance and design packets are retained in the audit archive.

## Executed guarantees

| Check | Observed result |
| --- | --- |
| Fixed script | 24 actions, 16 Go updates, 17 state checkpoints; React, DOM and midsequence swaps matched |
| Seeded scripts | Seeds 20261031, 20261032, 20261033; 40 actions each; native updates 29/27/27; each matched React/DOM/swap |
| Comparison | Parent/child state, typed bridge values/order, Gobi node records, mounted DOM, disabled controls, stale callbacks and swap call counts |
| Negative controls | Six mutations of captured outputs detected; these are offline mutations, not six faulty live backends |
| Focused regression | 28 Node tests, root Go tests in five module packages, compiler analyze/build/emit tests passed |
| Static M0 | `bash run.sh`: 5,000 cases, seed20261030, original receipt/checksums matched; all 59 compatibility rules preserved |
| Original counter | 107 scripts / 4,473 ticks, seed20261030, zero mismatches at the recorded regression checkpoint; counter dependencies unchanged by subsequent module fixes |
| Demo | HTTP200; Add/Reset, lock/disabled Go no-op and renderer round trip passed, no page errors |
| Archive | 529 members / 67,486,104 expanded bytes; 147 source pins exactly matched Git; clean source before/after |
| Independent consumer | Checked archive and all source pins, rebuilt/replayed archived Go byte-for-byte, rechecked all 12 captured profiles and six mutations offline; consumer launched no browser |

Final attempt `attempt-20261031T213332911Z-35` exited0. `receipt.json` SHA256 `38246a62989fd77ef7f6af32752be1e23249c262f15cb8bd8f33fc29fab3093c`. Runtime archive is 6,373,581 bytes SHA256 `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c`; manifest SHA256 `ef2f332d15e306daabc290d127a42bfc2f9486fa43219785192f1674d7804fb2`. Native trace is 209,146 bytes SHA256 `579c8c4a17d26682fc30bfdbbc4de677ee63cda322b7bfdd00bd624c22b4ceec`.

## Executable demo without rebuilding

Fetch this evidence branch and check it out separately. From this directory:

```sh
python3 restore-runtime.py /tmp/gobi-modules-restored
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/gobi-modules-restored/demo/site
```

Open `http://127.0.0.1:8000/`. The restore helper checks every part, aggregate archive, manifest and regular-file member before writing a new destination. It serves prebuilt artifacts from the executed producer, without production deployment.

## Reproduce from source

Use a separate clean checkout at the source commit above, with Go1.24, Node22 and a Chromium executable. Dependencies/toolchain must be available or downloadable:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
GOBI_GO_BIN=/path/to/go1.24 GOFLAGS=-buildvcs=false CHROMIUM_PATH=/path/to/chromium \
  bash run-compiled-modules.sh --source-commit 7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0
bash run.sh
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 \
  CHROMIUM_EXECUTABLE_PATH=/path/to/chromium bash run-interaction.sh
```

Executed environment: Go1.24.0 linux/amd64, compiler Go1.27.3 via GOTOOLCHAIN, Node22.23.4, Chromium153.0.8010.0, React19.3.1, Playwright1.64.1, GoScript0.6.2, esbuild0.28.2. Exact argv, environment, stdout/stderr and versions are in runtime logs and audit packets. Run `python3 restore-audit.py` to reassemble and verify the audit archive using `audit/package-index.json`, its ordered parts and full member/snapshot inventories. This verifies without extracting; the included `assemble_evidence.py --verify` supplies the independent inventory checks. Independent archive-consumer helpers are also published under `consumer/` and included with their original command records in the audit.

## Reviews and failure custody

All six available Luna6 XHigh workers were used under native Rebalancer1.0.4. Seven total sessions includes the root coordinator. Native probe SHA256 `5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c`; toolkit PR1 head `989c295717511c812b69beda5d125817ffc054c9`. Assignments have disjoint ownership and dependent independent cross-review. The native solver recommends assignments; the root separately acknowledges them and actually dispatches existing worker sessions. Two epoch28 recommendations scored500 versus independent maximum600 and were rejected before dispatch; after eligibility refinement the native retry matched600. Accepted recommendations match independently enumerated maxima with zero broken constraints. Idle workers at final gates are not claimed as useful dispatched work.

Author/reviewer reports, receipts, source seals, native solver bundles, raw logs, preserved failures and custody exceptions are available in the audit archive. The package author/review receipts and final scheduler state are published as a separate additive record after sealing, avoiding a self-referential archive hash. Read `coordination/lead-acceptance.json`, final acceptance addendum and the review receipts alongside the traces. Historical AMEND reviews remain visible, with later repairs/reviews mapped explicitly. One E-SNAPSHOT report copied the wrong hash for a two-member helper fixture: `coordination/snapshot-report-erratum.json` corrects only that factual report error using receipt/stdout; it does not rewrite the sealed report. Its separate 529-member final producer archive passed independently.

Preserved producer failures include missing ignored UTF8 fixture in source closure, whole-stdout native JSON parsing, duplicate before/after Git log filenames, generated temporary fixture cleanup, and root snapshot placement. The final source fixes these concrete failures. Earlier verifier mistakes and any unavailable overwritten bytes are labeled, not reconstructed. M0's original EXPECTED.json and SHA256SUMS are unchanged. Hosted CI status is recorded separately; queued runs are not claimed as passed.

## Boundaries and another backend

These results cover one synchronous typed parent/child fixture in Chromium on Linux, with browser HTMLElement.click events. They do not prove arbitrary Go/module graphs, async effects in this profile, OS pointer/keyboard/IME behavior, hydration, concurrent React, pixels, other engines/OSes or malicious-code containment. Valid UTF8 strings cross the compiler boundary; invalid strings fail closed. Hashes prove byte consistency against the manifest, not authenticity or resistance to fabricated evidence. The third synthetic renderer ID tests the registration API only; no third frontend implementation is claimed. This module-profile comparator is separate from the earlier 13-case backendqualification certificate.

Another renderer implements `update`, `viewRecord`, `domSnapshot`, `unmount`, declares capabilities, preserves bindings/disabled behavior and scoped callbacks, registers its factory, and replays this same harness. Application Go and the module ABI remain unchanged. A new compiler backend must also emit the checked role/bridge facades and descriptor/artifact evidence. Next substantial milestone: independently compiled keyed child instances with explicit lifecycle identity and typed cancellable effects, composing existing keyed/lifecycle contracts through this module boundary.
