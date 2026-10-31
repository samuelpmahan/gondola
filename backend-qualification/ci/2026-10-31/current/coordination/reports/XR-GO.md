# XR-GO (N5): independent review of the Go certificate library

**Decision: `amend`.** The 13-case policy and evidence checks are largely aligned with the contract, and the library accepts the real N4 report as a 13/13 qualified certificate. A raw `observedChannels` validation gap remains: unknown and duplicate values are silently discarded before comparison and both malformed reports still certify.

## Review scope and checks

Reviewed the frozen E-GO report and receipt, plus the exact sealed library source hashes:

- `backendqualification/certify.go` — `a1f579e1930cc2bcadf007d58b8ed3e421df3e28283528a2889ac71d801c463c`
- `backendqualification/registry.go` — `e9f1394ff38c26b303d8bd498a84a6a87a7a9514a7cd5878c09a89cd82da61a2`
- `backendqualification/qualification_test.go` — `498f526e54e366b5b4cb190818e98dc991aa629e148c3c239844293f32a0e4eb`

The Go 1.24 library tests passed. I also invoked the Go CLI on N4's actual Node 22 capture at `/tmp/gobi-backend-qualification-E-HARNESS-node22/qualification.raw.json` (SHA-256 `4222a32d73fde4e9fa31e534ebad7ab61fae8337f6cff7e0b2c9b05486586bcf`). It produced the same certificate hash as E-GO: `6877bc6cb8fc31d58d5378f2ac4770c6bf85f30dd06f6918398dd06b0f335174`, with `qualified: true` and 13 passed cases.

The registry defines the exact 3 healthy and 10 fault cases, pairs backends and families, fixes event-0 click activation and target path, and owns expected/allowed channel policy. Required report fields are presence-checked with typed pointers; unknown raw report fields are rejected. The library rejects malformed 40-character source commit strings, missing/duplicate/unknown cases, invalid activation counts, generic-error-only observations, infrastructure/page errors, missing or hash-mismatched evidence, and escaping paths. Healthy rows require 50 events and 46 ticks.

For the five semantic channels, the evidence map must contain exactly the known names. The validator binds DOM HTML, state, dispatch count, trace count, and disabled value to their corresponding expected/observed fields, derives the changed channel set from those pairs, and compares that set with the evidence and raw report claims. Evidence hashing is report-relative and path resolution rejects traversal and symlinks escaping the report directory.

## Finding: raw channel extras are silently ignored

In `certifyCase`, the raw report list is converted by `canonicalChannels` before comparison with the evidence-derived set. That helper only emits recognized channels in canonical order and uses a set, so it drops unknown names and duplicate entries. I changed only the raw `observedChannels` field in temporary copies of the actual capture, leaving every evidence file byte-identical and keeping its valid SHA-256:

| Raw mutation for `fault-react-text-corruption` | CLI result | Required result |
|---|---:|---|
| `["dom", "gpu-pixels"]` | Exit 0; certificate emitted | Reject unknown channel |
| `["dom", "dom"]` | Exit 0; certificate emitted | Reject duplicate channel |

The certificate omits these malformed values because it uses the evidence-derived channel list. Still, the raw report violates the fixed wire contract and should not be accepted. Validate the raw list for unknowns and duplicates before any order normalization; add raw-only unknown and duplicate regressions so the evidence stays unchanged during those tests.

## Additional callback metadata limitation

The Go validator correctly binds the `dispatch-count` channel to `observed.callbackCounts.dispatch`, and it validates fault activation count, family, backend, event index, and target path against the registry. The auxiliary `activation.callbackInvocations`, `observed.callbackInvocations`, and nested before/after callback fields are not structurally validated or cross-bound; the activation value is only checked for non-empty JSON. A copied `fault-react-drop-click` evidence file with those callback fields changed to `false`, a string, an array, and `null` still produced a qualified certificate after its evidence hash was recomputed. This does not bypass the separate five-channel dispatch measurement, but the certificate does not validate those supplemental callback counters. If they are intended as activation proof, validate their object shape and consistency; otherwise treat them as diagnostic evidence only.

## Boundary

This review covers the Go registry, certificate library, its Go tests, and a focused actual-report CLI replay. It does not rerun browser capture or the full delivery pipeline. The library checks that `sourceCommit` is 40 lowercase hexadecimal characters; binding that commit to source pins remains the delivery runner's responsibility. No Go source, CLI source, application, browser harness, Git, or scheduler files were changed by N5.
