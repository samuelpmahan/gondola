# Hosted evidence for source462

All 32/32 runs (16 workflow names, push and PR) succeeded on the source commit; see [the final matrix](workflow-matrix-final.json), fetched 2026-10-31 at 15:33:57 UTC. Earlier acceptance snapshots remain unchanged and explicitly predate this final status.

The successful keyed-child push run is [41211302195](https://github.com/samuelpmahan/gondola/actions/runs/41211302195), job 124566695902, artifact 13046728760. The PR counterpart 41211304775 also passed. Both workflow runs report head SHA `462a9827bfe1980600456b00d0a67843eaa9756d`.

`children-ci.json` records the fetched successful job/step results and artifact metadata. `children-job.log` is the completed job log. `children-independent-verification.json` and its console log record a separate root consumer check after the hosted run completed: all 1,893 ZIP CRCs, outer artifact digest, all 417 tar member byte counts/SHA-256s, and all 147 source files against exact Git commit 462. This consumer streams tar members and does not use the producer archive helper. The complete outer receipt and inventory are preserved here. The corresponding full local archive and prebuilt demo are preserved as chunks in the sibling archive directory; the full hosted children ZIP is retained by GitHub until 2027-01-29 according to its fetched metadata, and is not duplicated in this evidence commit.

Hosted children environment: Go 1.24.13 linux/amd64, compiler Go 1.27.3, Node 22.23.4, npm 10.9.9, Google Chrome for Testing 156.0.8078.4. React/ReactDOM 19.3.1, Playwright 1.64.1 and esbuild 0.28.2 match the captured lock hashes. The local captured environment differs in native Go/npm/Chromium; see the main guide. No cross-machine byte-identical-build claim follows from semantic parity.

Recheck the hosted ZIP while the artifact is available, from the evidence checkout with authenticated GitHub CLI access:

```sh
gh api repos/samuelpmahan/gondola/actions/artifacts/13046728760/zip > compiled-children/ci/2026-10-31/current/hosted/children.zip
python3 compiled-children/ci/2026-10-31/current/hosted/verify-children-artifact.py .
```

The verifier checks recorded semantic status, exact source pins, and archive hashes by assertion and writes the selected 43,430,390-byte tar plus a fresh verification report next to itself. The exact original local verifier invocation is `python /tmp/gondola-source462-ci/verify-children-artifact.py /workspace/scratch/39a56936f173/gondola-children-archive`.

The separate original-counter run [41211304774](https://github.com/samuelpmahan/gondola/actions/runs/41211304774), job 124566703068, artifact 13046685411, passed 107 scripts / 4,473 ticks with seed 20261030, React 19.3.1 and Chromium 156.0.8078.4. `counter.zip` preserves that 3,776,349-byte artifact (SHA-256 `4afbf5770ff7ecead54ed01350dcc3303e0504d3334c427f9f86f8100b8760cc`); its CRCs and native-comparison rows were independently checked. `counter-trace-header.json` is an extracted compact summary; full traces remain in the ZIP. This is fresh hosted execution, separate from the historical counter baseline cited in local acceptance.
