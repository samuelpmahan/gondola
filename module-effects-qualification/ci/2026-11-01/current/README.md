# Native module-effects evidence package

This guide describes a finite evidence package for native acceptance of saved module-effects captures and a fresh producer run. The publication is on branch `codex/gobi-native-effects-qualification-acceptance-20261101`, under `module-effects-qualification/ci/2026-11-01/current/`. It is not a merge to `main` or a deployment.

## Published artifacts

Payload A's immutable evidence commit and tree are `b0d5e0c3150f4e4a67e4119bb5b0cbbff777b05e` and `1e54333bb03729477ab7ba69dc9430b4dde0eaa3`. Browse the [Payload A prefix](https://github.com/samuelpmahan/gondola/tree/b0d5e0c3150f4e4a67e4119bb5b0cbbff777b05e/module-effects-qualification/ci/2026-11-01/current/) or open its [package index](https://github.com/samuelpmahan/gondola/blob/b0d5e0c3150f4e4a67e4119bb5b0cbbff777b05e/module-effects-qualification/ci/2026-11-01/current/data/index.json). Its prefix contains:

- `data/index.json` and `data/part-*.bin`: a deterministic, split package. The index records each part, the compressed aggregate, and each archived regular file by size and SHA-256.
- `tools/pack_evidence.py`: the standard-library pack, verify, and restore tool.
- `reports/*.md` and `reports/*.json`: plaintext reports and receipts for direct reading.

The frozen package archive contains 1,992 regular files: the coordination raw logs and source copies, the corrected-source fresh attempt archive and manifest under `runtime/`, and the associated evidence records. Keep raw `.go` source copies inside the compressed package; do not add them as uncompressed files at this prefix. The payload package index SHA-256 is `83947840e16dcfcec6dbfe8025d8bfaabdd61296b6693825e3cd0b4b673dfa08`; it has `75` parts and a `bc42fdd9ea39b88bc9b8349db66353a9d1688247eded8998591dfb9dc1357f98` compressed aggregate of `67259098` bytes.

The separately committed Guide B is this `README.md`; it points to Payload A by commit SHA. It is intentionally not included in Payload A, so neither artifact hashes itself. The later publication-review record (C) pins the final guide and payload URLs without changing this guide.

## Executed published-byte readback

Payload A was fetched as an actual Git object and its publication subtree exported. All 173 files (68,118,584 bytes) match their planned size, SHA-256, Git blob ID and Git tree mode, with no missing or extra paths. The published packer verified and restored all 1,992 package members. A Go 1.24.0 CLI built from a separate clean source-8632 Git archive then accepted the restored fresh archive with `PATH=/nonexistent`; restore, build and native check each exited 0. The restored archive/manifest match the SHA-256 values below and report 677 archive members, 237 source pins and all 20 profiles / four builds / two ABI pairs.

The publication-review appendix preserves the exact commands, output streams, byte inventories and independent reviews. Early readback-helper failures (overbroad export scope, Git format syntax, and tar permission assumptions) are retained separately; the successful checks use the exact subtree and authoritative Git tree modes. Tar header mode 0664 is export metadata, distinct from Git tree mode 100644.

## Source and run record

The existing source-433 baseline is commit `4338255bf8800d521b7f932fb530fe2cedebbf72`, tree `146daa2199e0c2ee679c622b6c765a2c0ff5b356`; its hosted native check is recorded as successful. This is one native check, not an all-workflows-green claim. A test-only fixture-selector correction repaired the inherited M0 failure: an absent unrequested integration fixture now skips, while explicit missing/bad paths still fail. Production Go bytes are unchanged between source433 and the corrected source below. A clean no-fixture M0 replay, a fresh fixture-backed qualification run, and the hosted native job passed on the corrected source:

| Final check | Recorded value |
| --- | --- |
| Corrected source commit | `8632f139354c0863482eb625c3ba99b4f607ea0c` |
| Hosted native CI result / run URL | `SUCCESS; https://github.com/samuelpmahan/gondola/actions/runs/41280353132 (job 124770852173; source SHA independently checked)` |
| Corrected source-pin count / bytes | `237 pins / 2,704,872 bytes` |
| M0 isolated replay result | `PASS: clean isolated Git archive, no GOBI_EFFECTS_* environment and no default fixture; 5,000 cases, seed 20261030; original 59 rules and receipts preserved` |
| M0 `run.sh` exit status | `0` |
| Corrected fresh attempt ID | `attempt-20261101T062545178Z-121-4b515620` |
| Fresh attempt archive SHA-256 | `d1503bec6ac4f280f5576670eac3b6c5c7de143b4d0bc32a0dd79a634125c272` |
| Fresh attempt manifest SHA-256 | `d8f7f6a1f8ab17762e56bfae838772f95cae01ddd815094b48b6dabfaa2ce51e` |
| Fresh profiles, event/state/effect/transport, and ABI summary | `4 scenarios, 20 profiles (8 direct / 12 mounted); 178 native events / 182 states / 58 effects / 116 native transport events; 890 profile events / 910 snapshots; 4 builds / 2 ABI pairs` |
| Fresh native and Go-suite result | `PASS: producer, native archive acceptance, explicit fixture-backed four-package Go suite; no effectqualification skips, five named unrelated legacy modulequalification skips` |

Do not treat the earlier E17 output as the corrected-source result. That baseline run used source `4338255bf8800d521b7f932fb530fe2cedebbf72` and recorded 236 source pins / 2,700,650 bytes; four canonical scenarios; 20 profiles; 890 profile events; 910 snapshots; 580 profile transport events; 178 native events; 182 states; 58 effects; 116 native transport events; four builds and two ABI pairs. Its four scenario event counts were literal 31 and seeds 20261104/20261105/20261106 with 49/50/48 events. The earlier archive was 8,789,735 bytes with SHA-256 `aa55ace290027a44ed772d755d10071d15f1067ab3eae1d49cc2bbbf18c59a71`, and its manifest SHA-256 was `a8bd7bbe412cc1fca4af1def49356db411a4fa120ce45c66b5d34ee58ab15a7c`. These are historical baseline values; The table above records the final rerun's values after the test-only correction.

## Executed evidence and coordination

Local execution used Go 1.24.0, Node 22.23.4, compiler Go 1.27.3, Python 3.12.14, Rebalancer 1.0.4, Chromium 153.0.8010.0, Playwright 1.64.1, React 19.3.1, GoScript 0.6.2, esbuild 0.28.2, GNU tar 1.35 and actionlint 1.7.12. The successful final-source hosted job used Ubuntu 24.04.5, Go 1.24.13, Node 22.23.4 and Chrome for Testing 156.0.8078.4 (Playwright browser revision v1248); the actual API/status and log are appended with the publication review. Its distinct hosted archive has SHA-256 `9910478faffe2b889fbdd802889d9e72b1d92b8fa1ee59a6e97c0be6c14813a8` (8,787,436 bytes) and manifest SHA-256 `bb288da6e6bde8b401e1076604f942260b58b95c370af62013f0990ed9bd0c15`; these do not replace the local fresh archive pinned above. Hosted success is API/log evidence; the final-source hosted artifact was not independently downloaded in this publication gate. The suite uses literal 31 actions and seeds 20261104/20261105/20261106 with 49/50/48 actions. The counter regression passed 107 scripts / 4,473 ticks (seed 20261030), with zero mismatches.

Seven reported session slots allowed the lead plus six actual Luna 6 XHigh workers. All six were spawned and reused with disjoint ownership; native Rebalancer 1.0.4 produced assignments, then explicit platform calls dispatched work. The frozen snapshot closes 40 extraction/review packets in 20 independent pairs. Publication and link review are appended outside the frozen snapshot. Native solver objective and independent exact objective agreed, with zero broken constraints. Source, reports, receipts, dispatch records, corrections and raw command streams are inspectable in the restored coordination directory. A scheduler acknowledgement alone is not evidence of worker execution.

Independent negative controls exposed and repaired a pending-count forgery and schema casing aliases. The original failures remain in the package. The hosted M0 fixture failure and its test-only repair also remain inspectable. Other inherited workflows were still queued or running at the recorded status check; this guide does not claim an all-green CI chain.

## Verify and restore Payload A

After all reviews close, root freezes the selected coordinator and runtime files into a new stage. Do not point the packer at the live coordinator: raw/source copies and the final fresh archive must come from one frozen snapshot. Create a new, empty package output directory's parent, then pack and verify the stage:

```sh
FROZEN_STAGE='/tmp/effectsqual-publish/stage'
PACKAGE_ROOT='/tmp/effectsqual-publish/payload-a'
PACKAGE="$PACKAGE_ROOT/data"
mkdir -p "$PACKAGE_ROOT"
python3 /tmp/effectsqual-publish/pack_evidence.py \
  --input "$FROZEN_STAGE" --output "$PACKAGE"
python3 /tmp/effectsqual-publish/pack_evidence.py \
  --input "$PACKAGE" --verify
```

Publish `data/`, the packer source under `tools/`, and the selected plaintext reports under `reports/` in Payload A. Record the actual `index.json`, part count, aggregate SHA-256, and byte count after packing.

Use a clean temporary directory and the exact Payload A commit SHA. Fetch that commit, export only this publication prefix, verify the package, and restore into a new directory:

```sh
set -euo pipefail
PAYLOAD_A_SHA='b0d5e0c3150f4e4a67e4119bb5b0cbbff777b05e'
PREFIX='module-effects-qualification/ci/2026-11-01/current'
TMP="$(mktemp -d /tmp/gobi-evidence-readback.XXXXXXXX)"
mkdir -p "$TMP/readback"
git fetch origin "$PAYLOAD_A_SHA"
git cat-file -e "$PAYLOAD_A_SHA^{commit}"
test "$(git rev-parse "$PAYLOAD_A_SHA^{tree}")" = '1e54333bb03729477ab7ba69dc9430b4dde0eaa3'
git archive --format=tar --prefix=payload/ "$PAYLOAD_A_SHA" \
  "$PREFIX/data" "$PREFIX/tools/pack_evidence.py" "$PREFIX/reports" \
  | tar -xf - -C "$TMP/readback"
PKG="$TMP/readback/payload/$PREFIX/data"
PACKER="$TMP/readback/payload/$PREFIX/tools/pack_evidence.py"
RESTORED="$TMP/restored"
python3 "$PACKER" --input "$PKG" --verify
python3 "$PACKER" --input "$PKG" --verify --restore "$RESTORED"
```

The packer rejects malformed or incomplete indexes, changed or missing parts, undeclared package entries, unsafe archive paths, non-regular files, member-size/hash mismatches, and overwriting an existing restore target. After a successful readback, the package is self-consistent and pinned by the Git commit tree; it is not a signed or authenticated provenance statement.

## Run the native Go archive check

Build the CLI from the corrected source commit in a separate temporary source tree, then verify the restored fresh archive and manifest. Go 1.24 is required. The consumer is Go-only; it does not launch Node, Python, Chromium, or a JavaScript checker at runtime.

Continue in the same shell as the restore commands above; this block uses the `TMP` and `RESTORED` variables they set.

```sh
FINAL_SOURCE_SHA='8632f139354c0863482eb625c3ba99b4f607ea0c'
mkdir -p "$TMP/source"
git fetch origin "$FINAL_SOURCE_SHA"
git archive --format=tar --prefix=source/ "$FINAL_SOURCE_SHA" | tar -xf - -C "$TMP/source"
cd "$TMP/source/source"
GOTOOLCHAIN=local go build -mod=readonly -trimpath \
  -o "$TMP/module-effects-qualify" ./cmd/module-effects-qualify
FRESH_TAR="$RESTORED/runtime/attempt-20261101T062545178Z-121-4b515620.tar.gz"
FRESH_MANIFEST="$RESTORED/runtime/attempt-20261101T062545178Z-121-4b515620.manifest.json"
PATH=/nonexistent "$TMP/module-effects-qualify" \
  --archive "$FRESH_TAR" --manifest "$FRESH_MANIFEST"
```

The archived fresh attempt and manifest must match the final source and run records above. The prior PR23 producer source commit is `e0933465725e470dc610e3f81b4bbee95538c1d0`, distinct from the corrected verifier source. Milestone 0's unchanged receipt files are `EXPECTED.json` SHA-256 `639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2` and `SHA256SUMS` SHA-256 `8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0`.

## Reproduce a fresh run

Use a separate clean Git checkout of the corrected source commit. The fresh producer reads Git metadata, so a `git archive` source extract used for the Go CLI build is not a valid fresh-run checkout. Fresh mode needs Go 1.24, Node 22, Python 3, GNU tar, and Chromium through Playwright; install the already locked dependencies and run the wrapper with the exact corrected source commit. Keep the output outside the checkout and preserve the command streams and report alongside the final archive and manifest.

```sh
TMP_SOURCE_PARENT="$(mktemp -d /tmp/gobi-module-effects-source.XXXXXXXX)"
FRESH_SRC="$TMP_SOURCE_PARENT/gondola"
git clone --no-checkout https://github.com/samuelpmahan/gondola.git "$FRESH_SRC"
git -C "$FRESH_SRC" fetch origin '8632f139354c0863482eb625c3ba99b4f607ea0c'
git -C "$FRESH_SRC" checkout --detach '8632f139354c0863482eb625c3ba99b4f607ea0c'
test "$(git -C "$FRESH_SRC" rev-parse HEAD)" = '8632f139354c0863482eb625c3ba99b4f607ea0c'
test -z "$(git -C "$FRESH_SRC" status --porcelain --untracked-files=all)"
cd "$FRESH_SRC"
npm ci --no-audit --no-fund
npm ci --prefix interaction --no-audit --no-fund
npm ci --prefix compiled-frontend --no-audit --no-fund
interaction/node_modules/.bin/playwright install --with-deps chromium
FRESH_OUT="$(mktemp -d /tmp/gobi-module-effects-final.XXXXXXXX)"
bash run-module-effects-qualification.sh \
  --fresh --source-commit '8632f139354c0863482eb625c3ba99b4f607ea0c' \
  --output-root "$FRESH_OUT"
```

The wrapper runs the existing producer, the native archive consumer, and the explicit four-package Go suite against the one fresh attempt. Record the final attempt identifier, archive and manifest SHA-256 values, native result, Go test exit code, and hosted CI URL in the table above. A failed check remains a failure; do not replace it with the earlier E17 result.

## Scope and retained metadata qualifications

The native verifier checks the recorded finite profiles and declared source, artifact, ABI, keyed lifecycle, event/effect/correlation, state, tree/DOM, and disabled-control contracts. The captured set is four scenarios and 20 profiles. A fresh run also records Chromium-backed captures, but the Go consumer evaluates the saved captures without launching a browser.

Two evidence-metadata limits remain explicit. The original 470-byte derived `rawlogs/XR-ORDER/review-packet.sha256` was unavailable during final audit and was not reconstructed; no runtime capture, source copy, or command stream was identified as missing. Also, the coordinator's pre-epoch-20 author-index serialization was not preserved; the root-sealed canonical index is authoritative, and later author indexes plus separate coordinator indexes and source-inventory digests are retained. The actual fresh captures and source data remain in the package. These limits preclude an exhaustive authoring-metadata claim.

This evidence does not establish pixel or browser-input equivalence, arbitrary applications/backends/module graphs, network or authentication behavior, authenticated compiler or Git provenance, or live cross-module fault injection. Another backend needs the declared ABI and helper/artifact manifests, an event/DOM adapter, and a native-registered capture profile. The next runtime milestone is live mounted asynchronous error, timeout, cancellation, and fault injection across independently compiled modules.

## Publication record and reproduction order

1. The test-only correction is published at the source commit above. The table records actual clean M0, fresh qualification and hosted native outputs.
2. After the independent reviews close, root freezes the exact coordinator and runtime outputs into a new staging tree. Do not package the moving coordinator directly. Include `runtime/` fresh archive and manifest, source/raw copies in the compressed evidence archive, plaintext reports/receipts, and `tools/pack_evidence.py`.
3. Pack and verify the frozen tree into a new package directory. Publish Payload A's `data/`, `tools/`, and plaintext `reports/` on the acceptance branch. Record the actual commit SHA, tree SHA, index SHA-256, part count, and aggregate digest.
4. Fetch Payload A by commit SHA, `git archive` the prefix to a temporary directory, verify the package, restore it, and run the Go-only archive consumer. Preserve actual output hashes and exit statuses.
5. Publish this completed guide as Guide B in a separate commit. Root's URL-review record C then verifies the immutable Payload A URLs and the final Guide B URL by Git readback, records the hashes and proof, and appends final state/closure without editing this guide.

The publication is an evidence branch only. Do not merge it to `main`, deploy it, or describe a hosted check as passing unless its final run URL and result are recorded above.
