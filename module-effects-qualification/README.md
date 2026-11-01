# Native module-effects qualification

This package verifies a saved PR23 module-effects attempt with Go. Directory mode checks the captured source identity, four build artifacts and ABI, plus the saved asynchronous captures and ordering. Archive mode first checks and extracts the effects-specific archive, then runs the same directory verifier on the extracted attempt. The consumer does not invoke Node, Python, a browser, or a JavaScript consumer to decide whether a capture passes.

The native report covers only the recorded fixed and seeded profiles and their finite lifecycle, correlation, state, tree/DOM, disabled-control, and artifact contracts. A successful report does not authenticate Git history or the verifier binary, qualify arbitrary module graphs, or establish pixel or browser-input equivalence.

## Verify an existing attempt

Use Go 1.24.0. The directory can be an attempt restored from the immutable PR23 publication or one produced by the existing profile runner.

```sh
bash run-module-effects-qualification.sh --directory /path/to/attempt
```

For a local archive and its sibling manifest:

```sh
bash run-module-effects-qualification.sh \
  --archive /path/to/attempt.tar.gz \
  --manifest /path/to/attempt.manifest.json
```

Archive mode uses `modulequalification.VerifyEffectsArchive`, which accepts only the closed `gobi.module-effects-archive-manifest/v1` and `gobi.module-effects-execution-snapshot/v1` schemas. The older `modulequalification.VerifyArchive` remains limited to the compiled-modules schema. Both native verifiers reject malformed, incomplete, rehashed-but-inconsistent, or over-limit input and leave no extraction destination on failure.

## Restore and verify the prior PR23 capture

The fixture producer is pinned to historical source commit `e0933465725e470dc610e3f81b4bbee95538c1d0` (PR23). The immutable primary publication is under [the PR23 archived output directory](https://raw.githubusercontent.com/samuelpmahan/gondola/3df075a3cee25498b144e0d166c71e841cda50af/compiled-module-effects/ci/2026-11-01/current). Its segmented archive index is `bundle-parts.json`; the producer archive manifest and receipt are pinned separately:

| File | Immutable URL | SHA-256 |
| --- | --- | --- |
| Segmented archive index | [bundle-parts.json](https://raw.githubusercontent.com/samuelpmahan/gondola/3df075a3cee25498b144e0d166c71e841cda50af/compiled-module-effects/ci/2026-11-01/current/bundle-parts.json) | `81c4be5c700f77a39146bf6bebf5f7105cff0606f98a25472944553f1f4ef34d` |
| Producer archive manifest | [bundle.manifest.json](https://raw.githubusercontent.com/samuelpmahan/gondola/3df075a3cee25498b144e0d166c71e841cda50af/compiled-module-effects/ci/2026-11-01/current/bundle.manifest.json) | `457073a81f1c93ba0edfe51b06667bb39f9baed95fd32ad3a9c630f9f476b1b9` |
| Producer delivery receipt | [delivery-receipt.json](https://raw.githubusercontent.com/samuelpmahan/gondola/3df075a3cee25498b144e0d166c71e841cda50af/compiled-module-effects/ci/2026-11-01/current/delivery-receipt.json) | `31e60be9b368330a4d98040c0bd1f80a84b02d6eeb5cdea84ef12906db82e3bc` |
| Independent archive acceptance | [archive-acceptance.json](https://raw.githubusercontent.com/samuelpmahan/gondola/6daf25766c341d12fdd3e62b0597f5813d3dce0b/compiled-module-effects/ci/2026-11-01/current/archive-acceptance.json) | `24aae206e8f41b41a6fbaf88e6b09dfaa326acc5874dd0a4406ae00881890b84` |
| Restore consumer | [restore.py](https://raw.githubusercontent.com/samuelpmahan/gondola/3df075a3cee25498b144e0d166c71e841cda50af/compiled-module-effects/ci/2026-11-01/current/restore.py) | `9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98` |

The restore tool verifies the segmented publication and writes to a new destination. Its atomic no-overwrite restore requires Linux `renameat2(RENAME_NOREPLACE)`. Then qualify that restored attempt with the Go consumer:

```sh
BASE_URL='https://raw.githubusercontent.com/samuelpmahan/gondola/3df075a3cee25498b144e0d166c71e841cda50af/compiled-module-effects/ci/2026-11-01/current'
curl -fL "$BASE_URL/restore.py" -o restore.py
printf '9340386d0726e957fc87153c372c67c9331d3e52ef863fdf07ace65c17ba7e98  restore.py\n' | sha256sum --check -
python3 restore.py /tmp/gobi-module-effects-pr23 --base-url "$BASE_URL"
bash run-module-effects-qualification.sh --directory /tmp/gobi-module-effects-pr23
```

This checks the restored archive contents with the current Go verifier. The report's `sourceCommit` and source identity refer to the historical producer source (`e093346...`). Record the verifier checkout separately with `git rev-parse HEAD` and `git status --porcelain --untracked-files=all`; a dirty worktree does not have a separate verifier commit SHA. An offline report does not authenticate Git history or claim that the verifier commit equals the producer commit.

## Produce and qualify a fresh attempt

Fresh mode composes the existing PR23 producer with the Go archive consumer. It needs the already locked project dependencies, Go 1.24, Node 22, Python 3, GNU tar, and Chromium through Playwright. It requires a clean Git checkout whose current commit is passed explicitly. It does not enable the producer's diagnostic dirty mode.

```sh
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
VERIFIER_COMMIT="$(git rev-parse HEAD)"
bash run-module-effects-qualification.sh --fresh --source-commit "$VERIFIER_COMMIT"
```

The fresh producer records its producer source commit separately and snapshots the exact Go verifier/test import closure from `go list -deps -test` for `cmd/module-effects-qualify`, `effectqualification`, `effectsreplay`, and `modulequalification`. The wrapper runs the Go archive verifier, then reruns the four Go packages with the fresh attempt path and expected producer SHA explicitly set; the integration test defaults to the pinned PR23 SHA when that override is absent. The wrapper prints the native report only after both checks succeed and saves the verbose test log beside it. It leaves the attempt, archive, manifest, report, and test log under a unique `module-effects-qualification/output/fresh.*` directory. In CI, the verifier source commit is the checkout SHA; the historical PR23 archive's source commit remains `e093346...`.

The Go suite emits verbose test statuses. The effects tests use the explicit fresh attempt, while five legacy `modulequalification` tests still require their own unrelated compiled-module capture/archive environment variables; those tests appear as skips unless that separate input is supplied, and no passing evidence is attributed to them here.

## Extending the profile

Another backend must implement the declared Go node, message, input, publication, keyed lifecycle, effect, and correlation contracts; provide the exact artifact/helper manifests and an event/DOM capture adapter; and join the native-admitted profile registry so the same fixed, direct, browser, and swap suite replays canonically. This profile does not qualify pixels, other engines, arbitrary applications, network behavior, or authenticity. The next useful milestone is live mounted asynchronous error, timeout, cancellation, and fault injection across independently compiled modules; saved-capture mutations alone do not cover those runtime faults.

## Report boundary

The JSON report has no success-shaped output on failure. Archive mode includes the verified member count, compressed byte count, and producer source commit. Directory mode omits archive details. Neither mode treats producer mutation-control counters as Go-executed negative-control evidence; acceptance comes from the native checks on bytes in the directory.

The latest branch guide with the sealed E-DELIVERY report is [available here](https://github.com/samuelpmahan/gondola/blob/codex/gobi-native-effects-qualification-acceptance-20261101/module-effects-qualification/ci/2026-11-01/current/README.md). That branch URL is a moving publication reference; the final PR will pin the accepted guide to an immutable commit URL.
