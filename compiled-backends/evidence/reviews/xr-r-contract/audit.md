# XR-R-CONTRACT independent audit evidence

## Scope and decision

Worker N1 independently reviewed N6 R-CONTRACT against current runtime behavior, contract/plan text, the nine-case semantic suite, the pre-amendment XR--CONTRACT artifacts, and the attempt-07 conformance records. Decision: **amend**. No production source was changed by this review.

## Source fingerprints

| Path | SHA-256 |
| --- | --- |
| `compiled-frontend/frontend/runtime/runtime.mjs` | `e729e3b360892edf01511b64657d32f638db54b5f5b0d2767b980114bb6d3105` |
| `compiled-frontend/frontend/runtime/runtime.test.mjs` | `3ddaaded2db26d7b2acf9bcbd8e85584f1f4b57e1e89b325a602aff5dab39fcc` |
| `compiled-backends/CONTRACT.md` | `7a221afaf0455ff6060b2634dde7660899c5c8abb40cea0de8874f31f583075b` |
| `compiled-backends/PLAN.md` | `e91bc98abaf2aea117de2aedf88f332eab484f43336a914d2952d9d8505a4756` |
| `compiled-backends/evidence/semantic/swap-semantics.test.mjs` | `4b8801a5382e1075d0d4f37482f097443179c1e2bdda82e637dc55e7fc972ebc` |
| `compiled-backends/coordination/reports/R-CONTRACT.md` | `09dee1e6b2d0c612438e0c6db805ae4e1d73cddf5c6d2a15909fd9a5d0cd7070` |
| `compiled-backends/coordination/receipts/R-CONTRACT.json` | `224b0f12b85573658e4a0f992772ccb8c79d7527d8fc58cd319ec43ae2c59f42` |

## Executed semantic suite

Node version: `v22.23.4`.

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --check compiled-backends/evidence/semantic/swap-semantics.test.mjs
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node --test compiled-backends/evidence/semantic/swap-semantics.test.mjs
```

Both commands exited 0. The test command passed **9**, failed **0**. Raw logs: `semantic-syntax.log` (SHA-256 `e0cb71fe601c6aa0bc77d1c72b7de24eb689cec9d73775860edf39dc4fa5755c`) and `semantic-node22.log` (SHA-256 `482b8485767cc91d4e1c8d7e0c35aa3ce1cafc33a992748924188fcefbe25a9e`). Existing experimental `UNDICI-EHPA` warning only.

Coverage specifically verified: cached Go View/no swap tick; completion microtask ordering and duplicate fencing; cancellation on unmount and swap failure; one-shot completion cancellation on pre-teardown capture rejection; focus-capture throw/Promise/malformed/extra-field/undefined rejection with active old renderer, no RuntimeFailure, unchanged trace, usable snapshot, and later valid swap; strict `restoreFocus(true)` only; focus-restore failure after teardown with halted runtime/unavailable snapshot/no rollback claim; capture reentrancy fencing; malformed pair and declared async admission/commit handling.

## Post-commit observation Promise reproduction

Command:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH /tmp/gondola-node22/node_modules/node/bin/node compiled-backends/evidence/reviews/xr-r-contract/postcommit-observation-promise-probe.mjs
```

The script returns a rejected native Promise from a regular (non-async) `viewRecord()` method and then from a regular `domSnapshot()` method on separate replacement candidates. Both replacements fail closed as `RuntimeFailure(stage=renderer-replacement)` after the old renderer is unmounted, with `snapshot()` unavailable. The process-level listener nevertheless records both `late viewRecord rejection` and `late domSnapshot rejection` as unhandled. The command exited 0 because the probe captures those events. Probe source SHA-256 `cc6d2fa59a2dfef2dd25e3f6bab561bd20764bd4989d5e131e21d5a98d04ccf9`; JSON result SHA-256 `a1aa98f2b808887d695b2cca107a2f4887dc44baaced37b957e8d80c9aa48555`.

This occurs because the current `viewSnapshot()` and `domSnapshot()` helpers call their renderer observation methods and immediately validate the returned shapes. The replacement path uses these helpers after old teardown; unlike `update`, replacement-time `unmount`, `focusState`, and `restoreFocus`, these method results are not passed to `noThenable()` before shape validation. The catch path correctly fails closed but cannot consume a native Promise rejection that was never attached to a rejection handler.

## Optional pair wording and report typo

Current code computes `focusSupported` from both old `focusState` and next `restoreFocus` methods after each renderer's pair check. The contract sentence “When the old renderer implements the focus pair” is broader than the actual behavior for a third-party candidate that omits both methods. Clarify capture is attempted when both sides provide the optional pair.

R-CONTRACT.md line 28 says “N6's 8/8 result,” but the execution section, semantic log, and receipt all record 9/9.

## Preserved historical evidence

- XR--CONTRACT report SHA-256: `b2e68fa43543a6468733998cf4c55233f632feb9576df76b23f0165ef4223043`; receipt SHA-256: `29b7a5076a5abab2819f6a5b9a91799f632b4324ce0adb859f0f0712388e8054`. Its pre-amendment runtime/contract/plan/test hashes remain present in the historical receipt and probe artifacts.
- XR--CONTRACT's preserved pre-amendment hashes are CONTRACT `82ee318d1f8e5788fe1a7b405855465292e9eaa7f5986d19ff43f489a87d073f`, PLAN `c2fa778603e6fdb835b8d0ac778fbcd0c5ab0a011a298d631cb34cadcc9886cd`, semantic test `dc2f4c7244a8c5bf1804c43e9710ec3b29085211de33df11fc032fa4b1e94b53`, and runtime `a35338302fc391499575fe7d3c7c59c41a3eeaddce23a3039f0a13d84ac94ae2`. Its baseline false-success probe source/result hashes remain `c54a1170fe850d259f1dce9ee22890616427e3716dfb78a18c6c48b176e0f06e` and `9b4879df48ceb42ef1e1de302de2faf3f77a4f02b8ab3b10f06f6a43354816c2`.
- XR--BUILD report SHA-256: `c775352b26a6a52e8baf218304773ea3cf45e421bd2697fb2ed8450155bd9dbd`; receipt SHA-256: `baf7e7a5b6e837628fa287c71759ab166a13ba7b18d604d9143a9559062c680d`; audit SHA-256: `6f34de936802975cb28fd40e89a2f7d9986949c771e1188dd3d36783d518a04e`.
- `zero_backend_repro.go.txt` SHA-256 remains `f5cd990adeb80587d8decbfd9fdf13e6f7e779cbb11499f6f99502668f083196`; old `.go` pathname absent; no `.go` files found under `compiled-backends/evidence`.
- R-CONTRACT's cited earlier failure histories remain visible in E-RUNTIME, E-DOM, and E-BUILD receipts: 22/1 then corrected 23/0; expected missing-renderer red run; and abandoned overstrict raw-bundle equality experiment.

## Separate attempt-07 integration artifacts

- `effect.run.json` SHA-256 `f548027253eaf4b3e7bad9bb4bc85c2ec9101f81f5df998cb97ea4794fd4f8ff`; `effect.browser.json` SHA-256 `90ba9775487080fc1924719642fb6becbad6d83619e90ba2cbfc75d515c6a4d2`. Effect swaps 1 and 2 show matching before/after focus identity `["effect","effect-input"]`, selection `14..14`, direction `forward`; diagnostics report captured/restored true. The fixture has `focusWitnesses: []`. The run's checker source pin is `54f475533d242d3b31646901d1b5b5df048d136b6c89c1e3d1739986b2dddca0`, while current `check.mjs` is `e0327cfe16fb47e779344e5c62eab3a79aa974df458dc2bef948d75c820255be`. It rejects at the checker with `swap 1 lost the keyed input focus or selection witness`; sourceStable only refers to the duration of the captured run.
- `form.run.json`, `list.run.json`, and `list-growth.run.json` are rejected during browser profile-or-swap on “new renderer DOM differs from the independent DOM oracle after swap.” They also pin React renderer SHA `2bb7c59b3d160c09ec9fea61d382df7c4e07ed97ba22c6c790f9682fa00a26c6`, while current React renderer is `35581215d912c0b19a63de9f122b75fef774c717100590d272cf9e7731943f6a`. The attempt-07 DOM source hash matches current. These are historical integrated evidence and do not establish current-source acceptance or universal four-app behavior.
