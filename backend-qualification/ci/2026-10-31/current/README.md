# Mounted backend qualification — executed evidence

Source/review: [PR18](https://github.com/samuelpmahan/gondola/pull/18), commit `77f7ce36439f1ae457a397269ea5a8c6d2db1cb2`, tree `3e297474ddcacb6cf2a66f54e50c701c6a689cc0`. Stacked on [PR17](https://github.com/samuelpmahan/gondola/pull/17), browser preflight repair `5f624b9a46b56d9610e936360e9da2fe46b99a29`. Neither PR was merged; no production deployment occurred.

The complete exact-commit qualification attempt `attempt-20261031T181327827Z-18` passed all nine stages. Native Go certified three healthy mounted profiles (React, DOM, and renderer swap) and ten activated faults: text corruption, key order, enabled control, dropped click, and duplicate click, once per backend. Healthy profiles replay the full 50-event scenario, 45 Go updates, and 46 state checkpoints against native Go, direct compiled Go, the fixed oracle, and mounted browser observations. The full healthy checker covers Gobi trees, physical DOM, disabled controls, callback/effect ordering, stale publications, and renderer lifecycle. Fault cases inspect actual mounted output and physical callback effects. All ten activated once; none had infrastructure or page errors. Generic exceptions do not qualify as detections.

## Reproduce and view

Check out the source commit, install the three locked npm dependency sets, and provide Chromium. Node `22.23.4`, native Go `1.24.0`, compiler Go `1.27.3`, React/ReactDOM `19.3.1`, Playwright `1.64.1`, esbuild `0.28.2`, and Chromium `153.0.8010.0` were used locally. Compiler Go is selected by the existing GoScript build; native tests use Go 1.24.

```sh
git checkout 77f7ce36439f1ae457a397269ea5a8c6d2db1cb2
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
CHROMIUM_PATH=/path/to/chromium bash run-backend-qualification.sh --source-commit 77f7ce36439f1ae457a397269ea5a8c6d2db1cb2
bash run.sh
```

The exact local command, executable paths, versions, all 15 subprocesses, source hashes, mismatches, and stage timings are in `receipt.json`. The fresh qualification runtime archive is `runtime.tar.gz`: **2,443,344 bytes**, SHA-256 **`61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca`**. `runtime.manifest.json` inventories all **397** regular members, SHA-256 **`8adc8f345a5b66a6ea1fbb92fe9bd510d1682f4c37d4c76e8a0660e06ce30cb1`**. A separate process listed, extracted, and hashed every member; archive, manifest, and all 177 source pins stayed unchanged afterward. Every source pin was independently compared with the reviewed Git commit and rechecked after M0.

To view the already executed demonstration, download `runtime.tar.gz`, verify its hash, extract it to a fresh directory, and serve its `demo/site` directory over HTTP, for example `python3 -m http.server 8123 --directory /tmp/gobi-qualified/demo/site`. The viewer shows actual case evidence and the Go certificate; it does not decide qualification or maintain application state. Its HTTP smoke passed **12** checks. The archive includes the standalone verifier in `source/backend-qualification/demo/verify-archive.mjs`.

## Regression and review evidence

- **M0:** `bash run.sh` passed 5,000 cases, seed `20261030`, matching `EXPECTED.json` and `SHA256SUMS`. Both receipt files remain byte-identical to milestone commit `ed3fd43b24a58375032a6bc8f9ef0411bcb0ad46`. Vet and root Go tests, including the new certificate/CLI packages, passed.
- **Original interactive counter:** `bash run-interaction.sh` with installation skips passed 107 scenarios (7 fixed, 100 seeded), 4,366 actions, 4,473 ticks, 8 Node tests, and 107 native comparisons. Seed `20261030`; no mismatches. The full 49,493,116-byte trace is in the audit archive, SHA-256 `4e22212a1c8b66c1cc768cf2f01b5ea0d45c994221f8b634a183fecab7194fb5`.
- **PR17 repair:** one full local publications run passed all eight stages, three seeds `20261031/32/33`, 20 HTTP checks, and a 363-member archive. Its 130 tested source pins match published repair commit `5f624b9a46b56d9610e936360e9da2fe46b99a29`. Concatenate `parent-runtime.part000` and `parent-runtime.part001` for the 7,651,792-byte archive, SHA-256 `c449070787424074fc80834c70eb4d79e00f59b1cdccda8aa3879c5b4ffe7783`.
- **Actual hosted CI:** C4 run `41222316736` passed the complete inherited PR16 chain, then failed the browser-brand preflight. Its 29,156-byte failed artifact and job log are preserved. Repair run `41228270986`, job `124616896941`, passed the publications profile on GitHub; the inherited chain was still running when observed. PR18 qualification run `41228361042` was queued. Timestamped observations are retained; local passing results do not imply all hosted CI passed.
- **Independent review:** readable worker reports, receipts, native state, and assignment bundles accompany this guide. `acceptance.json` records the final review gates and evidence inventory. Original amendment findings and subsequent repairs remain visible.

## Native coordination and custody

Native Rebalancer `1.0.4` was verified against current toolkit PR1 head `989c295717511c812b69beda5d125817ffc054c9`; probe SHA-256 `5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c`. Actual capacity was seven sessions including the root coordinator, so all six available Luna 6 XHigh workers were started concurrently with disjoint ownership. Dependency gates controlled review dispatch; actual start/finish events are distinct from solver recommendations. One epoch-8 native recommendation scored 600 against an independently computed 700 maximum and was rejected before dispatch. An explicit review-role restriction preserved the 700 maximum; the accepted rerun met it. The rejected attempts and failed system-Python import remain preserved.

The audit archive retains author/reviewer receipts, raw logs, sealed source snapshots, build-provenance repair, strict raw-channel repair, and the parent-CI failure. The builder's post-seal edit was preserved and its original bytes recovered exactly before a separately reviewed repair. Root prematurely snapshotted the still-writing PR17 repair packet; both that preliminary snapshot and the final author version are retained separately, with a custody addendum and final independent review. Archive-backed cleanup of prior published materializations is inventoried; this does not erase or resolve older explicitly recorded custody limits in prior milestones.

## Demonstrated and untested bounds

This is finite evidence for the admitted React/DOM implementations, the specified deterministic scenario, actual five-family fault detection, and a strict native Go qualification registry over hash-bound captures. The 16 inherited captured-data mutation controls remain distinct from the ten new mounted faults. Callback debug metadata is partly opaque; neither it nor SHA-256 receipts prove that a malicious browser/evidence producer could not fabricate measurements. Pixels, other browsers, arbitrary applications, real network timing, and an arbitrary third backend remain untested.

A further backend needs an explicit shared-renderer ABI and host policy, a Go registry/profile extension, and the same healthy and activated-fault gates. The next coherent milestone is independently compiled typed Go child modules composed through that ABI, then exercised through the mounted qualification path.

The final audit archive `audit.tar.gz` contains **699** regular members / **96,657,189** raw bytes, **3,267,371** compressed bytes, SHA-256 **`ef32ac4326cfe7dce1c843e48b9d141f021acb8b1f6b61614b54bb9ec020b44e`**. Its manifest SHA-256 is **`eee4f3ceaadd8cb36bc8b4e427f18c73216044f9d73668174fa9cf062b7d5561`**. A separate Python process verified every member. All **24** native jobs are closed: **12** author packets and **12** independent reviews across **14** accepted scheduling epochs; original amendment findings were resolved through separately reviewed repairs.
