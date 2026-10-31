# E-BUILD archive acceptance verifier

`verify_archive.py` is a read-only verifier for the final E-BUILD receipt, its
externally bound archive manifest, and the immutable evidence tar. It reads and
hashes members directly from the gzip tar; it never extracts files to disk.

After the full runner creates a final E-BUILD receipt, run from the repository
root:

```sh
python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py \
  --receipt compiled-capabilities/coordination/receipts/E-BUILD.json \
  --root . \
  --require-complete
```

The receipt supplies repo-relative paths for the archive and external manifest.
`--archive` and `--manifest` can override those locations while retaining the
receipt's exact byte-count and SHA-256 checks. A non-complete but internally
consistent archive may be inspected without `--require-complete`; that mode
reports `completeAcceptance: false` and does not make an acceptance claim.

The verifier checks safe tar paths and member types, duplicate paths, exact
manifest/tar/receipt inventories, every member's size and SHA-256, the snapshot
payload and pending status, pre-archive and final source pins, toolchain and
dependency records, the command-ledger prefix, and stage outcomes. Complete
mode also requires a passed full receipt, all required milestone stages, stable
source pins, React and ReactDOM 19.3.1, and the three archive commands after the
immutable command-ledger prefix. Every recorded pre-archive and outer command
must have exit code zero and no signal or command error. The archived snapshot,
embedded pre-archive receipt, and outer snapshot metadata must carry their
expected, mutually consistent pending/running statuses.

Complete mode requires root Go 1.24.x, compiler Go 1.27.3, Node 22, React and
ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2 in both installed and
locked metadata. Package-lock hashes must agree with the corresponding
`sourceBefore` pins. If `fast-check` appears in the runner's installed/locked
version maps, both must report 4.10.2. The current runner records the root lock
hash, which pins the lockfile containing fast-check 4.10.2, but does not record
an installed fast-check version. These checks establish consistency among
declared metadata and source pins; they are not an independent attestation of
toolchain execution or protection against a fully forged set of mutually
consistent records.

Tar validation also rejects regular-file and directory-prefix collisions, such
as a file named `react` alongside directory `react/` and child
`react/build-result.json`.

The in-memory fixture suite can be run independently:

```sh
python3 compiled-capabilities/coordination/acceptance/archive/verify_archive.py --self-test
```

The in-memory self-tests include the previously observed nonzero command
results, contradictory snapshot statuses, Node 18, installed/locked version
mismatches, and file/directory collision, in addition to the original
traversal, source-pin, missing-member, and tamper cases.

No full E-BUILD archive is accepted by this preparation checkpoint. Root must
run the verifier against the actual final receipt after the integrated run.
