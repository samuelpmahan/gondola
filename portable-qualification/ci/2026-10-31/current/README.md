# Native Go verification of mounted frontend qualification

Review: [PR19](https://github.com/samuelpmahan/gondola/pull/19), stacked on PR18. Final source **`a275d646b0d8ceed956b27b6b8f3099e17106857`**, tree **`a33e9c526f56e981f56cf0d06edb12e0976381b2`**. No main merge or deployment.

Native Go now validates a bounded tar/gzip inventory, every declared source/provenance reference, and the existing Go qualification certificate recomputed from stored observations. The command requires neither Node nor a browser. The producer now includes every explicitly pinned source file and publishes only a completely verified archive through atomic, no-clobber publication. The shared Go certifier and archive verifier reject duplicate JSON keys, unknown closed-record fields, and noncanonical Go field aliases while preserving deliberately opaque state and diagnostic fields.

## Run the executable demonstration

At the source checkout, Go 1.24 is sufficient for the portable profile:

```sh
bash run-portable-qualification.sh
```

The checked-in 405-member positive fixture preserves every original captured byte and adds eight exact Git-verified source-support files. The original 397-member fixture is retained as a mandatory rejection control. This supplementation is not a new browser run.

For the new, unsupplemented archive produced by the final checkpoint, download the three `runtime.part000` through `runtime.part002` files and `runtime.manifest.json` from this directory:

```sh
cat runtime.part000 runtime.part001 runtime.part002 > runtime.tar.gz
sha256sum runtime.tar.gz runtime.manifest.json
go run ./cmd/verify-qualification \
  --archive runtime.tar.gz --manifest runtime.manifest.json \
  --source-commit a275d646b0d8ceed956b27b6b8f3099e17106857
```

Archive: **2,485,927 bytes**, SHA-256 **`b1d9d5bc30bcce395fae361845ee02b1896b595a567a4c2923d6f898a60c8556`**. Manifest: SHA-256 **`9ce8013a9afbf1b97c526e504961f6525ded134455de7f24e8a28acc89457a3d`**. All **409** members and **181** source pins are included. Source pins match Git exactly, including all **87** compiler inputs. `primary/producer-consumer.json` records each delivery part hash, exact consumer command, binary hash, and source identity.

Extract the runtime archive and serve `demo/site` over HTTP to inspect its recorded case matrix, measurements and Go certificate. For example: `python3 -m http.server 8123 --directory /tmp/gobi-demo/demo/site`. The viewer does not make qualification decisions. Its twelve HTTP checks passed in the fresh producer run.

## Executed results

- Fresh final-source attempt **`attempt-20261031T200506490Z-116`** passed all nine stages: two fresh GoScript builds, native trace, **13/13 mounted cases**, independent Go certificate, **12 HTTP checks**, source stability, and independent archive verification. Three healthy profiles (React, DOM, renderer swap) compare Go state, Gobi trees, physical DOM, disabled controls and event ordering over **50 events / 45 Go updates / 46 checkpoints**. Ten actual mounted faults cover five families on both backends; generic infrastructure errors do not count as detections.
- The final Go binary verified this archive with **`PATH=/nonexistent`**: **13/13 cases**, 409 members, no Node/browser execution. Binary SHA-256 **`a9d5590d507d6db19a9ee8058dcf344d546a8f62c4e45e69d50c59610f722411`**. The same binary verifies the separately completed local and hosted historical 405-member bundles, each 13/13. Producer source and verifier source identities are recorded separately; historical fixtures use producer commit `77f7ce36439f1ae457a397269ea5a8c6d2db1cb2`.
- Post-repair M0 **`bash run.sh`** passed **5,000** cases, seed **`20261030`**, matching the original receipt and checksum files; root Go vet/tests passed. Final atomic/CI changes contain no Go changes relative to that run. `EXPECTED.json` and `SHA256SUMS` remain byte-identical to M0 commit `ed3fd43b24a58375032a6bc8f9ef0411bcb0ad46`.
- Fresh original-counter browser/native regression passed **107 scripts / 4,473 ticks**, seed **`20261030`**, with zero mismatches. The full trace is retained in the audit: **49,491,627 bytes**, SHA-256 **`bc647b4a36311d2d19e32afa9686df74bfed46bc408a4d17c108c7c74a0bd934`**.
- Independent policy tests passed **10 groups / 27 nested cases** covering unsafe paths, links/types, inventory mismatches, compressed/expanded/per-file/member bounds, gzip trailing data and cleanup. The archive helper's **7** tests cover staged visibility, failure cleanup, no-clobber publication and roundtrip behavior. The inventory regression passed **3/3**. The five previously accepted, fully rehashed JSON variants now reject with nonzero exit and empty stdout. Actual commands, outputs and hashes are preserved.

Versions: native Go **1.24.0**, compiler Go **1.27.3**, Node **22.23.4**, React/ReactDOM **19.3.1**, Playwright **1.64.1**, Chromium **153.0.8010.0**, esbuild **0.28.2**. The recovered hosted input used Go **1.24.13** and Chrome for Testing **156.0.8078.4**; its completed run is [41228361042](https://github.com/samuelpmahan/gondola/actions/runs/41228361042), artifact `13054001746`, ZIP SHA-256 `fc1b9a191fe718bc64869f1579cebbc75b6578d878da9d351abfd5a3dba182d9`.

Fresh production/reproduction command (requires the pinned producer toolchains and locked npm dependencies):

```sh
bash run-backend-qualification.sh --source-commit a275d646b0d8ceed956b27b6b8f3099e17106857
bash run.sh
```

## Failures preserved and repaired

1. The original runtime archive recorded 177 source pins but contained only 169 source files. The generic walker excluded eight explicitly pinned compiler-support files. The original is unchanged and rejected; separately completed historical fixtures add exactly those bytes. The producer now unions inventory paths with every explicit source pin.
2. Independent review found five rehashed ambiguous/unknown JSON variants still qualified at candidate `f320919a392b6a5b1a7af5357e35547189cbcb75`. Strict decoding was repaired in both the shared Go certifier and archive verifier and independently checked against the exact counterexamples. Original passing outputs remain inspectable.
3. A report used the prior attempt's 4.725s duration for final attempt006; the actual final value is 4.540s. Both original records remain unchanged; an independently accepted addendum corrects the claim.
4. GitHub workflow initialization failed at `f7874237b1ceb5dab195a40b12f8df8a3dcc45a0`: `runner.temp` was used in job-level environment. Actionlint **1.7.12** reproduced the error and passes the step-level fix. Latest-source workflows now initialize and queue normally; this is not a claim that queued hosted jobs passed.
5. Two intermediate producer archives were observed truncated after producer and consumer checks passed. Their cause remains **unknown**. Both are preserved and excluded. All 409 original member bytes from the second were recovered against its manifest into a separately identified archive; **the original compressed bytes were not recovered**. That reconstruction passed independent custody review and Python/Node/Go consumers. Atomic publication was added and tested; the final primary archive above retained its exact compressed hash after command return. No universal filesystem durability claim is made.

The first fresh run also reflected a sparse checkout with four historical CI snapshots absent. Their exact Git bytes were restored, and the full source snapshot was rerun. Counts and identities for both attempts remain separate.

## Coordination and audit

Native Rebalancer **1.0.4**, probe SHA-256 **`5fa75295203944df8b7e2112dbd900b9c89255209a1ac92d61c01bf035d8066c`**, was verified against current toolkit PR1 head `989c295717511c812b69beda5d125817ffc054c9`. Actual capacity was seven sessions including root: all **six available Luna 6 XHigh** workers began concurrently with disjoint ownership. Native dependency gates and author exclusion controlled independent review. **22 jobs** are closed across **17 accepted scheduling epochs**; original amendments and subsequent accepted repairs remain visible. Solver recommendations and actual dispatch are separate events.

Concatenate `audit.part000` through `audit.part031` for the audit archive: **33,034,497 bytes**, SHA-256 **`9ea55edfac1390f77413a19aad92be51eecbe926221abc29625493deeaf62f6b`**. `audit.manifest.json` inventories **1,273** regular files / **119,071,749** raw bytes, including raw traces, actual pre-repair counterexamples, hosted input, damaged originals, reconstruction proofs and all author/reviewer packets. A separate consumer verified every part and member hash. Readable reports, receipts and native assignment JSON are also supplied outside the compressed audit. Historical packet pins describe their own checkpoints, not necessarily the latest edited source.

Latest-source hosted portable run **41237166990** and mounted run **41237166957** were queued at the recorded observation. Local passing results do not assert all hosted CI passed.

## Bounds and next milestone

This demonstrates the finite React/DOM scenario, activated fault matrix, declared source/provenance consistency, strict record decoding, bounded Linux extraction, and a Node/browser-independent Go consumer. It does not authenticate a producer, prove that fabricated observations are truthful, or replay a browser during offline verification. Pixels, other engines, arbitrary apps/Go/backend implementations, Windows/macOS filesystem behavior, real network scheduling and general fuzz/security coverage remain untested. Windows reserved-device-name behavior is specifically untested.

A further backend needs an explicit renderer ABI/host policy, a Go registry/profile extension, and the same positive and activated-fault gates. Next coherent milestone: independently compiled typed Go child modules with an explicit input/ABI manifest, composed and checked through this mounted producer and native Go consumer.
