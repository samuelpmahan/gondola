# Inherited preservation audit

**Run:** 2026-10-30 11:56 UTC  
**Scope:** read-only check of the five inherited delivery manifests, repository checksums, and working-tree diff against PR5. No source, receipt, manifest, or Git state was changed by this audit.

## Parent and tracked diff

Commands:

```text
git rev-parse --show-toplevel
/workspace/scratch/39a56936f173/gondola

git rev-parse HEAD
a376b834a6bb24d7a3fb950b2e80af1826a84bda
```

The current `HEAD` is the PR5 parent commit. The tracked working-tree diff against it is limited to the root `.gitignore` and `README.md`:

```text
git diff --stat a376b834a6bb24d7a3fb950b2e80af1826a84bda
 .gitignore |  1 +
 README.md  | 24 ++++++++++++++++++++++++
 2 files changed, 25 insertions(+)

git diff --name-status a376b834a6bb24d7a3fb950b2e80af1826a84bda
M  .gitignore
M  README.md
```

`.gitignore` adds only `/keyed-editor/build/`. `README.md` appends the keyed-editor section; it has no removals. `git diff --check a376b834a6bb24d7a3fb950b2e80af1826a84bda` passed with no output.

The 100 untracked paths at this checkpoint were all authorized new keyed additions: 1 `.github/workflows/keyed-editor.yml`, 1 `run-keyed-editor.sh`, 2 `collection/` files, 3 `cmd/collection-wasm/` files, and 93 `keyed-editor/` files. The classification check reported no out-of-scope untracked paths. Generated `keyed-editor/build/` output is ignored.

## Root checksum file

```text
wc -l SHA256SUMS
24 SHA256SUMS

sha256sum -c SHA256SUMS
24 entries: all OK
```

## Five delivery manifests

The read-only validator loaded each delivery manifest's `sha256` map and computed SHA-256 for every listed path from the repository root. It checked **373 pins total**:

| Manifest | Pins | Initial exact matches | Initial mismatches |
|---|---:|---:|---|
| `async-effects/evidence/delivery-manifest.json` | 72 | 72 | 0 |
| `backend-replacement/evidence/delivery-manifest.json` | 53 | 53 | 0 |
| `controlled-input/evidence/delivery-manifest.json` | 92 | 92 | 0 |
| `http-effects/evidence/delivery-manifest.json` | 100 | 100 | 0 |
| `interaction/evidence/delivery-manifest.json` | 56 | 55 | 1: `.gitignore` |
| **Total** | **373** | **372** | **1** |

The sole initial mismatch is the authorized root ignore-file edit, but it means the inherited pin set is not yet fully restored. The interaction manifest expects `.gitignore` SHA-256 `6aa343f3336b903965aa9fabfb49f56e17d7440fa054071badf760ab593f0dfc`; at this checkpoint the file hashes to `e98803e51f76efb1d15e731c73dbd4ea3327048fc955611dbc384c4471af6ff0`. Its only difference from PR5 is the `/keyed-editor/build/` line. The E6 owner is restoring the parent `.gitignore` and moving that rule into a new `keyed-editor/.gitignore`; repeat this 373-pin verification after that repair before treating preservation as final.

The earlier `keyed-editor/evidence/inherited-pins.json` says 373/373 with no mismatches, but it predates this root `.gitignore` edit and is not a final receipt for the current tree. Preserve it unchanged; root plans to rerun the final pins.

## Exact manifest validation command

This command checked every path in the five manifest maps and made no writes:

```sh
python3 - <<'PY'
import hashlib, json, pathlib
root = pathlib.Path.cwd()
paths = [
    'async-effects/evidence/delivery-manifest.json',
    'backend-replacement/evidence/delivery-manifest.json',
    'controlled-input/evidence/delivery-manifest.json',
    'http-effects/evidence/delivery-manifest.json',
    'interaction/evidence/delivery-manifest.json',
]
total = 0
for name in paths:
    manifest = json.loads((root / name).read_text())
    pins = manifest['sha256']
    total += len(pins)
    changed, missing = [], []
    for relative, expected in pins.items():
        target = root / relative
        if not target.is_file():
            missing.append(relative)
        elif hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            changed.append(relative)
    print(name, len(pins), 'pins;', 'changed=', changed, 'missing=', missing)
print('total manifest pins:', total)
PY
```

**Checkpoint result:** repository source diff is within the authorized root README/ignore and new keyed additions. All 373 inherited manifest paths were checked; 372 currently match and the one `.gitignore` mismatch is pending E6's agreed relocation. Re-run after that fix and append the final counts here.

## Final recheck after E6 ignore relocation

At 2026-10-30 11:57 UTC, E6 restored the root `.gitignore` byte-for-byte to its parent value and added the `/build/` ignore rule in the new `keyed-editor/.gitignore`. The same five-manifest validator then reported:

| Manifest | Pins | Exact matches | Mismatches |
|---|---:|---:|---:|
| `async-effects/evidence/delivery-manifest.json` | 72 | 72 | 0 |
| `backend-replacement/evidence/delivery-manifest.json` | 53 | 53 | 0 |
| `controlled-input/evidence/delivery-manifest.json` | 92 | 92 | 0 |
| `http-effects/evidence/delivery-manifest.json` | 100 | 100 | 0 |
| `interaction/evidence/delivery-manifest.json` | 56 | 56 | 0 |
| **Total** | **373** | **373** | **0** |

The root checksum command again passed all 24 entries. The final tracked diff against PR5 is only `README.md` (25 insertions, 1 deletion); the deletion replaces the old final build-output sentence with an updated note about the inherited M0 and keyed runner. Root `.gitignore` is no longer modified, and `sha256sum .gitignore` is back to the interaction manifest's expected `6aa343f3336b903965aa9fabfb49f56e17d7440fa054071badf760ab593f0dfc`.

The follow-up scope classification counted 104 untracked paths: workflow 1, keyed runner 1, `collection/` 2, `cmd/collection-wasm/` 3, and `keyed-editor/` 97. It found no path outside the authorized new keyed additions. `git diff --check a376b834a6bb24d7a3fb950b2e80af1826a84bda` remains clean.

**Final preservation result:** all 373 inherited delivery-manifest pins and all 24 root `SHA256SUMS` pins match; only the authorized README change remains in the tracked diff. The earlier 372/373 result is retained above as the audit history that led to the E6 relocation.
