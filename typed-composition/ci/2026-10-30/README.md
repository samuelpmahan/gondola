# PR 10: clean CI acceptance evidence

Tested application commit: `42df6883337605d901a23e9fed874768c7ce1824`, tree `7204bcfbc8992f9c47ac5d1bfd9d639a37a65e67`, parent `d6d425765ee9d48eae22342a3cb75fab2e2871ba`. [PR 10](https://github.com/samuelpmahan/gondola/pull/10) remains a draft stacked on PR 9. This evidence branch adds records and archived executed bytes; it changes no application source. Main was not merged or deployed.

## Fresh clean-checkout execution

All **10 pull-request workflows passed**. Primary run [41123116952](https://github.com/samuelpmahan/gondola/actions/runs/41123116952), job `124294552127`, checked out PR merge commit `db880b9ae3065805123b24a43f9514c91b823e0f` and ran:

```sh
bash run-typed-composition.sh
```

The default entrypoint passed the entire inherited chain, original M0 5,000 cases / seed20261030 / unchanged receipt and24 checksums, Go tests/race/vet, actual WASM probes, **47 typed Node tests**, HTTP browser smoke and new replay. New result: **63 scripts, 2,463 actions, 63 native executions, 2,463 native frames, 4,926 actor-to-native comparisons, zero mismatches**. Seeds20261030/20261031,30 generated cases each,max40 actions; three fixed scripts have23/14/26 actions. All five controls had their expected rejection/detection/fencing outcome.

Actual reported runtimes: Go1.24.13 linux/amd64, Node22.23.4, npm10.9.9, React/ReactDOM19.3.1, Chromium156.0.8078.4. Pinned Playwright dependency1.64.1. These differ from the separately preserved local acceptance's Go1.24.0/Chromium153 environment. Neither the older248-finding mixed-source run nor pending pre-artifact audit preparations are treated as acceptance.

| Workflow | Run | Conclusion |
| --- | --- | --- |
| [Counter interaction parity](https://github.com/samuelpmahan/gondola/actions/runs/41123117203) | 41123117203 | success |
| [Gobi backend replacement](https://github.com/samuelpmahan/gondola/actions/runs/41123117138) | 41123117138 | success |
| [Gobi HTTP effects](https://github.com/samuelpmahan/gondola/actions/runs/41123117276) | 41123117276 | success |
| [Gobi async effects](https://github.com/samuelpmahan/gondola/actions/runs/41123117013) | 41123117013 | success |
| [Gobi controlled input](https://github.com/samuelpmahan/gondola/actions/runs/41123117102) | 41123117102 | success |
| [Gobi nested session tree](https://github.com/samuelpmahan/gondola/actions/runs/41123116944) | 41123116944 | success |
| [Gobi typed parent and child composition](https://github.com/samuelpmahan/gondola/actions/runs/41123116952) | 41123116952 | success |
| [Gobi keyed collection editor](https://github.com/samuelpmahan/gondola/actions/runs/41123117155) | 41123117155 | success |
| [Gobi multi-root sessions](https://github.com/samuelpmahan/gondola/actions/runs/41123116945) | 41123116945 | success |
| [Gobi renderer conformance](https://github.com/samuelpmahan/gondola/actions/runs/41123117080) | 41123117080 | success |

## Exact receipts and executed bytes

- CI report SHA256: `338f88bcfc9dd62c1ae7909ad8f51eb677abf3350dab96a31397cea66c91591a`.
- CI source-set SHA256: `f6dc04706c9437210b889935b5467cee179264d56b1e2955ce0557cd56e004f4`. Independent audits checked all49 pins:43 source files at the exact tree and6 generated assets in the archive. Three CI binaries differ from local builds, consistent with the recorded Go/VCS differences; source and artifact pins are kept distinct.
- Exact decoded [primary log](primary.log) SHA256: `41688d55e3ce524ed3b9697d4937108f51f25e89ec45c85b4d16dbbeb44a766a`.
- Original GitHub artifact `13009259933`:120,563,245 bytes; SHA256 `113bd9d8e7e7b862c6ec08f72af4d07cb6c3b0cb0d6a9d4534e58dc6e76a264e`. [CI metadata](ci.json) binds it to run/head; its API record contains no tree or numeric job field. The job log supplies the upload association. The separately preserved [raw Git Data commit response](scratch/XR-C-PUBLISH/git-data-commit.response.json), SHA256 `1762ddbcf865c1d2a12f521db4bf738162a37c8bc514bd7b552ecc195bd1a011`, binds remote head to tree/parent. Captured local and CI checkout proofs remain separately attributed.
- [Permanent CI assets and raw traces](ci-executed-assets-and-traces.tar.xz):6,109,552 bytes; SHA256 `686b9b77587cbf71b44db83adae41a5a229a906aac20d16328e679ae6da04dc5`. It contains all75 executed composition build entries: complete report, manifest, mismatch artifact,66 raw shards and6 generated assets. Every tar entry was read back and its bytes/hash/mode checked; see [manifest](ci-executed-assets-and-traces.manifest.json) and [packaging execution](bundle-execution.json). The tar uses fixed metadata and executable mode for the native replay. No tests were rerun during packaging.

The [acceptance record](acceptance.json) pins reports, receipts, original amendments and raw proof. The [delivery manifest](delivery-manifest.json) pins every evidence file except itself. The application [RESULTS](../../RESULTS.md) documents commands, inherited counts, local failures, limits and the executable demonstration. Reproduce the demo after the full runner:

```sh
./http-effects/build/http-lab -addr 127.0.0.1:8000 -root .
# Open http://127.0.0.1:8000/typed-composition/demo.html
```

## Native allocation and independent acceptance

The platform supports seven active agents including lead; six existing Luna6 XHigh workers were reused. Current toolkit PR1 head989c295717511c812b69beda5d125817ffc054c9/probe Git blob30ebd9bc4b4ed80e41ffd9c20ce29fd859138647 was rechecked unchanged. Dependency was `rebalancer==1.0.4`; probe SHA256 `5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c`.

[Spec](spec.json), [repair extension](repair-spec.json), [final native state](state.json), [native epochs/bundles](native), [actual platform dispatch](dispatch.json) and [live observation](platform-observation.json) distinguish solver allocation from actual agent calls. Six children plus lead were observed running. All14 native packets completed; reviewers differ from authors. Native/exact scores600/600,1000/1000,200/200,300/300,200/200 had zero broken constraints and retained in-flight worker pins. Later occupancy followed ready jobs and dependency gates.

All six current audit lanes are accepted. The original [artifact provenance amendment](reports/XR-C-ARTIFACT.md) is retained; [repair](reports/R-C-ARTIFACT.md) and [independent acceptance](reports/XR-R-C-ARTIFACT.md) correct its attribution. Original bytes remain in [history](history/R-C-ARTIFACT). [Prepared-before-artifact](prepared-before-artifact) records were pending and unaccepted. A transient local tooling bytecode cache created by lead's native-probe import was removed; [cleanup](tooling-cache-cleanup.json) and final tracked-source checks record this separately from application source freeze.

## Demonstrated boundary

The recorded finite serialized Chromium profile agrees on Go/model/native state, Gobi trees/bindings/messages, typed inputs/revisions/inbox receipts, mounted DOM/live values/disabled properties, focus/selection, effect/transport order, pending completion under read-only policy, and tested disposal/recreation fencing. [Lifecycle review](reports/XR-C-LIFECYCLE.md) explicitly bounds its five-shard sample: four candidate physical replacements with before/immediate/settled samples; one blocked input per actor plus separate Go guard; effective cancellation; all observed generations1. It does not establish keyboard-event counts, ignored cancellation, later host-generation reuse or HTTP arrival timing.

Other engines, IME, hydration, pixels, concurrent React scheduling, arbitrary `Backend.Emit`, generic heterogeneous factories, production services/authentication and transactional rollback remain untested. Another renderer must implement the versioned Go keyed-renderer manifest/admission, declared-message dispatch, controlled values/disabled/keyed focus, independent-handle lifecycle and in-place refresh, then pass renderer conformance and this replay. No fourth renderer is claimed.

Next composed milestone: a Go-defined component factory and typed declaration composing distinct existing counter/editor/collection components through that backend contract.
