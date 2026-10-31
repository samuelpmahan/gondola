# XR-CONSUMER — independent archive and replay review

**Worker:** N6  
**Decision:** `accepted`  
**Reviewed packet:** E-CONSUMER (worker N3)

## Result

I accept the sealed E-CONSUMER result within its stated scope. The consumer packet's report and receipt match its seal; all 38 files in its raw-log index match their recorded lengths and SHA-256 values. The author receipt's archive, manifest, producer receipt, source commit, and 147 source pins agree with the supplied manifest and published Git tree.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Producer archive, attempt `attempt-20261031T213332911Z-35` | 6,373,581 | `039e6b8f7d074c6c4873fc4a04ebc56f6b7110250046906e222eb1d17503e20c` |
| Archive manifest | 125,900 | `ef2f332d15e306daabc290d127a42bfc2f9486fa43219785192f1674d7804fb2` |
| Producer receipt | 472,432 | `38246a62989fd77ef7f6af32752be1e23249c262f15cb8bd8f33fc29fab3093c` |
| E-CONSUMER report | 6,102 | `b37278d6de0853d6a3fe68ac4230d4f6097dee651e69393f8cf126c41d253374` |
| E-CONSUMER receipt | 5,887 | `d1a3e078321d4319865a8ff50aababdc6cb30306bd05be4c8b0467a63774f4a2` |
| E-CONSUMER raw-log index | 8,074 | `b165279a097dfbf1695454f73c6c27a5448b23af2074028f6ee65935c23012ad` |

The reviewed source identity is commit `7bd0da2b1211cc639176b86b70c1cbc2b5fc10e0`, tree `bcc71cef48f3a4e141daf181b43f8e12a2132f83`. I independently checked the current checkout is clean at that commit/tree.

## Independent archive inventory check

My read-only archive audit matched every one of the 529 regular-file members to manifest size and SHA-256, with 67,486,104 expanded bytes. It found no duplicate, unsafe, noncanonical, or non-regular members. The archive's `source/` inventory exactly equals all 147 source pins; each source byte sequence and Git blob ID matches the published commit. The check is recorded in `rawlogs/XR-CONSUMER/archive-audit.json` and implemented by `verify-archive.py` (SHA-256 `aa00ea88104052a7b9a1d1802fb94bc077c20d84009ace0b2138744a566f8526`).

The sealed consumer's own validation helper, `consume-archive.py` (SHA-256 `f5fafdba298bc17848c6975f684cce324792bb3bc2a71b254884cdcc949cb927`), also completed archive validation before extraction. Its checks bind the manifest and archive hashes, exact inventory, path/type/size constraints, source pin set and Git blobs, then extract to a fresh private directory and verify the archived source snapshot. Its final command/result and the producer cross-check are pinned in the E-CONSUMER index.

## Archived Go replay

I reran the fixed native scenario from the extracted archived source with Go `go1.24.0 linux/amd64` and `GOTOOLCHAIN=local`, `GOPROXY=off`, `GOSUMDB=off`, and `GOWORK=off`. `go run ./cmd/compiled-modules-native --script fixtures/compiled/moduleparent/scenario.json` exited 0. Its 209,146 output bytes have SHA-256 `579c8c4a17d26682fc30bfdbbc4de677ee63cda322b7bfdd00bd624c22b4ceec`, byte-identical to the archived raw native stdout; the parsed JSON also equals the normalized native trace. The replay produced 24 source events and 16 Go updates, and all 147 archived source pins were unchanged across execution. My command/result are in `rawlogs/XR-CONSUMER/replay/native/`.

## Offline captured-profile check

I reran the archived `check-archived-captures.mjs` under Node `v22.23.4` against the extracted source and captured data. It passed with status `passed`. The checker validates the fixed React/DOM direct results and captured React/DOM/swap profiles, then validates all three 40-event seeds (`20261031`, `20261032`, `20261033`) across React, DOM, and swap: 12 captured browser profiles total. It detected the six listed mutations: `parent-state-field`, `child-view-tree`, `physical-dom-html`, `disabled-control`, `bridge-order`, and `ABI-role-before-reject`. The output is SHA-256 `72c63e54e65572a60d333461ffefd07a81cab280f4bd0e847332d43800730b43`.

This checker run launched no browser. It replays archived browser captures and performs semantic checks; it is separate from the producer's browser execution and from the distinct 13-case `backendqualification` certificate. The producer's reported live-browser run is cross-checked as a sealed producer claim, not rerun as part of this consumer review.

## Preserved failures and corrections

The author's `red-history.json` (SHA-256 `7b37e9258488467cb11660068ead238b16463589a7aa76dfe1e4517b46a9ad1e`) preserves two consumer-only failures: a Python sort-order assumption that disagreed with the producer's `localeCompare` ordering, and a stale expected location for the root snapshot. They failed before archive bytes were changed. The corrected inventory and snapshot checks passed.

I also preserved two reviewer command/setup corrections in `rawlogs/XR-CONSUMER/reviewer-attempts.json`: my first archive-audit draft compared the nested `attempt` object as a string and stopped before member inspection; my first Go replay invocation supplied a nonexistent `archive.manifest.json` path and stopped before Go execution. I corrected the object access and read the actual manifest path from the preserved command record. The full archive audit, Go replay, and offline checker then passed. These are reviewer invocation errors, not producer/archive failures.

## Limits

This review establishes byte/inventory/source correspondence and finite replay for this archive, commit, parent/child fixture, fixed scenario, three seeds, and the 12 captured profiles. Git blob equality is not signer authenticity or proof against malicious code. The offline checker did not launch a browser; this review does not independently certify browser execution, arbitrary module graphs, or the separate 13-case backend qualification.

## Evidence index

My raw logs are indexed in `rawlogs/XR-CONSUMER/index.json` (29 files, 5968 bytes, SHA-256 `a40c62d430619140b157f7434e3eeef2627e72a7e0d2e6c7e6f178efeb918bc0`). The native read-only receipt validator accepted the XR-CONSUMER job/worker/decision/summary fields without changing coordination state; its command and result are recorded under `rawlogs/XR-CONSUMER/`.
