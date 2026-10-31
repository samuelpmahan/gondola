# XR-DELIVERY — independent N5 review

## Decision: accepted, scoped to N6 delivery

N6's sealed delivery packet is internally consistent and the reviewed N6-owned sources match their pins on the frozen candidate tree. The portable Go runner, archive inventory repair, documentation, workflow structure, and producer helper regression tests meet the bounded delivery scope. This does not close the separate `qualificationarchive.Verify` certificate review: XR-CERTIFICATE has an independent AMEND finding and repair gate.

## Findings

- The sealed N6 receipt passed the read-only native validator. All 10 recorded source/fixture items and all 62 evidence files match their recorded sizes and SHA-256 hashes.
- The archived attempt 04 record has 23 source/test/script/fixture inputs. Its before and after pin files are byte-identical (SHA-256 `837e5d953b70c576551e2cc6db8bdeaf6f76eb2bb5e58b0e6f81ad5a4f05627e`), and all 23 current files match the captured hashes.
- The portable Go attempt exited 0. Its 405-member positive archive yielded a qualified receipt with 13 passing cases, and stdout exactly matched the exclusive output file. The original 397-member control exited 1 for the missing archived `r2-go-emit.log` source pin, with zero stdout and no output receipt.
- The producer inventory helper unions measured paths with every pinned `source/<path>`, then returns a unique sorted inventory. Its regression tests use the original and completed manifests to check all 397 original path/size/digest rows unchanged, exactly eight added historical review-evidence paths, exact 405-member inventory, deduplication/sorting, and unsafe-path rejection. The test deliberately checks manifest inventory and does not claim to read archive member bodies; actual archive admission and certificate verification are separate Go-runner evidence.
- The README and THREATS boundary state that the artifact source-commit label is not authenticated, the capture is not freshly replayed, and Linux/amd64 is the tested platform; Windows and macOS are untested. The workflow separates Go-only portable verification from the Node 22 inventory test and existing Milestone 0 `bash run.sh` job.
- Static workflow parsing confirmed both jobs and the helper/Milestone 0 steps. This review did not run the Milestone 0 job, hosted CI, the browser pipeline, or the Go-only portable runner again. `actionlint` was unavailable in the author packet.

## Independent checks

Toolchain: Node `v22.23.4`, Go `go1.24.0 linux/amd64`, PyYAML `6.0.3`, rebalancer receipt validator `1.0.4`.

I ran the helper's three Node tests:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test backend-qualification/archive-source-inventory.test.mjs
```

All 3 passed. I also ran `bash -n run-portable-qualification.sh`, `node --check backend-qualification/run.mjs`, and parsed the workflow with PyYAML while checking its Go and Milestone Zero jobs. The sealed Go-runner attempt and archive evidence were checked read-only rather than rerun.

An initial reviewer audit script expected a separate `rejected-control.exit-code` file, which this runner does not emit; the authoritative exit is in `run-summary.json`. The failed audit is retained, the reader was corrected, and the final audit passed. This was a reviewer evidence-path assumption, not a runner failure.

## Pins reviewed

| Evidence | SHA-256 |
|---|---|
| Sealed E-DELIVERY report | `f1fe46c609f9874f88c2113e8b92c89c990ab2f04607ea5314af0328e99bbf91` |
| Sealed E-DELIVERY receipt | `b97be7eabb6a30bbfa235844a5c05eacd61a190d10b57828eae5acd49dbeb8f5` |
| `run-portable-qualification.sh` | `48e76af67eeaf5a802dfc8f86a1486a59f00b0c2818e1c22cbc05f78419aedf9` |
| `portable-qualification/README.md` | `48a83cc76690a702f193e11ce0a87878a187bec730bb4268473785af18f35b13` |
| `.github/workflows/gobi-portable-qualification.yml` | `7d75b9481957099f53e33fc52fa9158fee10f3128a84483216376b6b1452d5e9` |
| `backend-qualification/run.mjs` | `7593747006e835a72384dd17111a790d103306f8b38a4d67dea99a72cd6ee825` |
| `backend-qualification/archive-source-inventory.mjs` | `531e2f2824df8228c286b53a25cc9dbad30bdde041da1d91a21c1243b739bf49` |
| `backend-qualification/archive-source-inventory.test.mjs` | `1e3fc8be757b34612294c3e9e5206330760ab4a8b47013f7420005076bb6c2cd` |
| Original 397-member archive | `61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca` |
| Completed 405-member archive | `5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1` |

The checked candidate tree was `91b15c8b9f02a8b03b1677ae0eb68eff8f4948a4`. No source, Git, or shared state was changed by this review. This scoped acceptance does not supersede the separate certificate-verifier AMEND or establish fresh browser execution or hosted CI.
