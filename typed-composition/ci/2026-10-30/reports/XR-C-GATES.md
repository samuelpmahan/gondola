# XR-C-GATES — independent CI gate review

**Decision: accepted.** C-GATES matches the primary run log, CI metadata, and extracted typed report. The primary log SHA-256 is `41688d55e3ce524ed3b9697d4937108f51f25e89ec45c85b4d16dbbeb44a766a`; `ci.json` is `fe5dddd936dc2f04288d4af20683bc9a5e9c8f97751cd745534bae4a5c6b54b1`; the typed report is `338f88bcfc9dd62c1ae7909ad8f51eb677abf3350dab96a31397cea66c91591a`. CI metadata lists all ten runs completed/success, and the primary artifact gate says the primary job succeeded.

The log records `bash run-typed-composition.sh` under `/usr/bin/bash -e`; the reviewed runner begins with `set -euo pipefail` and orders the inherited runner, builds, Go test/race/vet gates, WASM smokes, `node --test typed-composition/*.test.mjs`, browser smoke, and checker in that sequence. `go vet` is silent, but later WASM probes, 47/47 Node tests, browser/HTTP smoke, matched-report output, and artifact upload follow without a fail-fast exit. The WASM log reports 16 methods, 18 malformed schemas and 6 unsafe IDs rejected, zero accessor reads, reentry blocked, and recovery after errors.

Runtime evidence agrees: Go 1.24.13, Node 22.23.4, npm 10.9.9, Chromium 156.0.8078.4, React/ReactDOM 19.3.1. The HTTP smoke explicitly passes the held request through the loopback lab. Claims are limited to the recorded Ubuntu/Linux CI run, not other runtimes.

One provenance limit: the runner file itself is not among the typed report's 49 source pins; this review checked the local runner contents and the log's invocation, but did not independently hash-pin the executed shell bytes. No tests, builds, checker, browser, Git, or repository mutation were performed.
