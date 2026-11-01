# Independently compiled keyed Go children — executable evidence

Source [`f4c8f70199a8ca896c13e225a85901abe658d0de`](https://github.com/samuelpmahan/gondola/commit/f4c8f70199a8ca896c13e225a85901abe658d0de), tree `9539b600d72927641217b77a20a38955350eec49`, [review PR22](https://github.com/samuelpmahan/gondola/pull/22), stacked on PR21. All 30 source changes are additions (8,074 lines). Existing counter, application/compiler interfaces, M0 receipts, and main remain unchanged.

Go owns fixed keyed membership (`a`, `b`), generations, order, parent inputs and per-key publications. The existing counter child is compiled independently and instantiated per live identity. React and DOM consume these same Go contracts. Reordering retains the current child; removing and remounting it creates a new generation. Key generation and renderer epoch fence different stale callbacks.

## Executed acceptance

The clean-source attempt is `attempt-20261101T003733042Z-6-a2f2aa08`. Its 157 first-party source/lock/test pins, including 45 test sources, match the published source; before/after maps match and Git stayed clean. Toolchain dependencies remain separately pinned by the included lockfiles and recorded versions.

| Check | Executed result |
|---|---|
| Independent GoScript builds | Four: parent/child separately for React and DOM; two admitted ABI pairs |
| Literal | 18 actions, 19 native checkpoints |
| Seeds 20261101, 20261102, 20261103 | 36 actions and 37 native checkpoints each |
| Total | **126 source actions, 130 native checkpoints**, 8 direct and 12 mounted profiles |
| Comparisons | Full parent/controller and child state, Gobi trees, DOM, disabled controls, observed messages/call order, identity and stale fences |
| Fault controls | 11 captured-semantic mutations and 17 build/helper identity mutations detected after healthy baselines |
| Focused checks | Five Go packages (`-count=1`); five Node tests, zero failures/skips |
| Mounted prebuilt demo | Six interaction steps, DOM→React→DOM round trip, zero page errors/failed requests |
| M0 regression | 5,000 cases, seed20261030; original 59 rules and receipt/checksum files preserved |
| Counter regression | 107 scripts / 4,473 initial/action ticks, seed20261030; eight Node tests; native comparator matched |

The primary archive contains 600 files / 372,962,548 expanded bytes. Compressed bytes: **25,697,770**, SHA-256 **`1921ef063cd8f62f56384c72c65a0f87b26a6cabb015d3aff42040c96b6453d7`**. Manifest SHA-256: `0f8f5b15c36442d54412ad6480f4dbbb475b4cabec45ef800a01498a312f064b`. Its 25 segments are listed in `bundle-parts.json`.

## Restore and run the executed demo

The following downloads only the primary bundle. Python3 and a browser are sufficient to run the prebuilt demo; Node/Go are needed only for rebuilding.

```sh
mkdir /tmp/gobi-keyed-reproduction
curl -fsSL 'https://raw.githubusercontent.com/samuelpmahan/gondola/0b25bd8cda7049a439bbf3998650bc1f56774311/compiled-keyed-modules/ci/2026-11-01/current/restore.py' -o /tmp/gobi-keyed-reproduction/restore.py
python3 /tmp/gobi-keyed-reproduction/restore.py /tmp/gobi-keyed-restored --base-url 'https://raw.githubusercontent.com/samuelpmahan/gondola/0b25bd8cda7049a439bbf3998650bc1f56774311/compiled-keyed-modules/ci/2026-11-01/current'
python3 -m http.server 9000 --directory /tmp/gobi-keyed-restored/demo/site
```

Open `http://localhost:9000/`. Add independently to both counters, reorder, remove/remount a child, change the step/lock, and switch renderers. The restore command verifies segment, manifest, exact member, and source hashes before publishing a new destination. Use a destination that does not exist. The published restoration CLI requires Linux with `renameat2(RENAME_NOREPLACE)` and fails closed if that primitive is unavailable; other operating systems are not qualified. Hashes establish consistency, not publisher authenticity.

A restored Go-only native replay can be rebuilt without module downloads:

```sh
cd /tmp/gobi-keyed-restored/source
GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off go build -o /tmp/gobi-keyed-native ./cmd/keyed-module-native
/tmp/gobi-keyed-native --script ../conformance/keyed.inputs.literal.scenario.json
```

Use Go1.24 for that command. Captured literal/seed native outputs and all compiled/direct/browser traces are under `conformance/`.

## Rebuild the entire experiment

From a checkout of the source commit, install the existing locked dependencies and browser, then run:

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install chromium
bash run-keyed-modules.sh --source-commit f4c8f70199a8ca896c13e225a85901abe658d0de
bash run.sh
GONDOLA_SKIP_NPM_CI=1 GONDOLA_SKIP_BROWSER_INSTALL=1 bash run-interaction.sh
```

The accepted local commands selected Go and Node through `PATH`, Python through `GOBI_PYTHON_BIN`, and Chromium through `CHROMIUM_PATH`; the legacy counter runner uses **`CHROMIUM_EXECUTABLE_PATH`** instead. Exact commands/logs are in `coordination/reports/E-RUN.md` and the audit archive. Versions: native Go1.24.0 linux/amd64; compiler Go1.27.3; Node22.23.4; Python3.12.14; GoScript0.6.2; esbuild0.28.2; React19.3.1; Playwright1.64.1; Chromium153.0.8010.0. A fresh rebuild may change artifact bytes due to paths/tool metadata; compare the semantic traces and freshly produced receipts.

## Reviews, coordination and preserved failures

Six actual Luna6 XHigh workers were the maximum available beside the root coordinator in seven slots. Native Rebalancer1.0.4 used the inspected toolkit PR1 head `989c295717511c812b69beda5d125817ffc054c9`; probe SHA-256 `5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c`. Every accepted solver score matched its independent exact check with zero broken constraints. Recommendations/acknowledgments and actual platform dispatch are recorded separately; dependency and independent-review gates can leave an owner idle.

`coordination/` exposes the contract, interface, plan, native epochs, reports, receipts, seals and correction records. The audit archive adds raw scripts, outputs, traces and preserved failed attempts:

```sh
python3 /tmp/gobi-keyed-reproduction/restore.py /tmp/gobi-keyed-audit --audit --base-url 'https://raw.githubusercontent.com/samuelpmahan/gondola/0b25bd8cda7049a439bbf3998650bc1f56774311/compiled-keyed-modules/ci/2026-11-01/current'
```

The first delivery run failed source-stability because the oracle author changed two files after an informal freeze notice. It exited1 and produced no accepted archive. Its exact diagnostic, source hash pairs and compressed attempt are retained, as are the stable dirty-source retry and final clean-source run. Intermediate unsealed source versions were not all snapshotted; accepted reproduction uses the final pinned source. `compiled-keyed-modules/RESULTS.md` intentionally retains the first failed author diagnostic; this guide and E-RUN supersede that historical snapshot.

The sealed E-DELIVERY author report mistakenly counted 148 native checkpoints. The additive `coordination/corrections/E-DELIVERY-snapshot-count.json` derives **19 + 37×3 = 130** from the actual captured files; independent XR-DELIVERY acceptance verifies it. Original author records remain unchanged. This was a reporting error, not an execution mismatch. Earlier compiler/adapter diagnostics and the first legacy counter launch with the wrong Chromium variable are also preserved. Independent XR-RESTORE reproduced an overwrite race in the original utility fallback. A separately assigned repair removes that fallback and fails closed without the no-replace primitive; original utility, race witness and AMEND stay sealed. The runtime/source archive is unaffected. Verified duplicate extracts and ephemeral Go build caches are omitted from the audit; `coordination/audit-exclusions.json` records their primary-archive references.

## Demonstrated boundary and next milestone

The demonstrated profile is finite, synchronous, fixed two-key membership on Linux/Chromium, using programmatic **`HTMLElement.click()`**, not trusted pointer/OS input. Another frontend must implement the shared typed module ABI, supplemental keyed helper contract and renderer lifetime protocol, then supply a mounted capture adapter and pass the same healthy/fault matrix. Backend registration alone is insufficient.

The standard module ABI binds its original five roles and four generated artifacts. The helper sidecar is additionally tied to exact Go source/signatures, AppIR/module ABI identities and emitted bytes. `ReceiveKeyed` and `IsCurrent` are GoScript-compiled but are not general AppIR-reachability-admitted by the unchanged analyzer. This experiment does not extend the separate earlier 13-case backendqualification certificate or PR21's Go verifier to this new keyed capture schema.

Arbitrary/unbounded keys or module graphs, asynchronous effects/cancellation in this independent profile, other engines/OSes, hydration, IME, concurrent React, focus/selection, pixels, hostile-code isolation, signer authenticity and fabricated-producer resistance remain untested. Checksums are byte-consistency receipts.

Next coherent milestone: typed cancellable effects and request/reply ordering across independently compiled keyed children, preserving generation and renderer lifetime ownership. No main merge or production deployment.

## Final review and publication records

The native ledger closes **18 packets in 9 independent author/reviewer pairs**: eight accepted review receipts plus the preserved XR-RESTORE AMEND, resolved by the independently accepted XR-RESTORE-SAFE repair. All 22 native epochs matched the independent maximum score with zero broken constraints. See `coordination/final-acceptance.json` and the sealed reports/receipts.

The audit has **965 regular members / 894,295,379 expanded bytes**, compressed to **116,385,862 bytes** in 111 segments, SHA-256 `597aa7808052af64b669d1aab0154b4808ae180bd4bf37e5c1d16977b425088e`. The final restoration utility verified this actual archive after packing. Its source SHA-256 is `0dac505c5e9949a2b6168dac955e40c7af805847f73ef27652e1962d603d3f68`.

[Published Git-object readback](readback/github-readback.json) checks the delivered segment and metadata bytes, restores both archives, and compares the 157 runtime source pins against Git. The proof names its exact checked evidence commit; later delivery-only proof files do not alter the accepted source or archive. Hosted source CI was queued at the recorded observation; completed local and independent results are separate. Nothing was merged or deployed.

