# XR-ACCEPT-CUSTODY

**Decision: amend.** The hosted source-bound CI artifact and durable delivery evidence in N4's `E-ACCEPT-CUSTODY` packet verified. The local archive remains correctly marked rejected with cause unknown. One receipt path is inaccurate: the preserved zero-byte catalog-writer failure is recorded under a non-existent path with an extra `f` in the source prefix. The actual zero-byte file is present at the adjacent seven-character-prefix path. Correct that evidence pointer and refresh the receipt/report binding before accepting the packet.

## Verified custody evidence

The current N4 receipt is SHA-256 `d5368b4c74079a9af76117d60b209bda34a6ccd6d8084c288629a5949616b49a`. It differs from the preserved original only in the allowed `outcome` value (`mixed_change`); all other JSON fields match exactly.

The terminal catalog `source-60b5aeff-terminal-runs-jobs-20261031T111444Z-v2.json` is 135,588 bytes with SHA-256 `b69f432f53e8d4ff85ae0d855bbfabec35f76febb4830853d313cb0a8b2d9bfc`. Its 30 runs and 30 job snapshots are source-bound to commit `60b5aeff3172837ad7831c2b78b210454a3d81a2`, tree `cc3a129b4372d00d5168135aa2e5687dfbf6788f`, and parent `a2e1164d68abaaa7d028bdaf6a20bea842a131ae`. All 15 push and 15 pull-request runs, their jobs, and recorded steps are completed-success. I rehashed and parsed the raw provider run list and every per-run job response.

The primary push ZIP matches provider bytes and SHA-256 (`76,786,265` bytes; `3a54a53c81ac93ad1c5a8231b17ac289875ed57ad7bb12d7ae2b3609ff267de1`). Its 1,476 entries have unique safe paths and regular-file/directory types, and a full CRC pass found no corrupt member. The embedded E-BUILD receipt is full/passed with zero failures and 163 matching source pins. The 14,960,460-byte inner archive (`ba17805387c8204ef2624caec0af35641771bc8af48d4f03b82c1a6609586d8f`) has 189 regular-file members matching its manifest, with valid gzip EOF/trailer. The 553,782-byte pre-archive snapshot correctly records `archive_pending`, `archivePending: true`, and `finalAcceptance: false`; the final E-BUILD receipt binds the archive and its before/after/pre-archive source pins agree.

The published primary-CI delivery index and all 15 chunks were rehashed. Concatenating the chunks reconstructs the same 14,960,460-byte archive with the same SHA-256. All three canonical delivery records match their bytes and hashes.

## Finding requiring amendment

N4's receipt claims the zero-byte failed writer path is:

```text
compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/source-60b5aeff-terminal-runs-jobs-20261031T111444Z.json
```

That path does not exist. The preserved zero-byte file is:

```text
compiled-capabilities/ci/2026-10-31/source-60b5aef/custody/provider/source-60b5aef-terminal-runs-jobs-20261031T111444Z.json
```

The receipt has an extra `f` in the basename prefix. The 135,588-byte valid `...111444Z-v2.json` catalog is a separate file and passes the source/run/job checks above. The earlier malformed catalog is also separate, preserved, and excluded: its bytes end in the literal two-character `\\n` suffix and JSON parsing fails. These failed writer/catalog files are not being treated as successful evidence.

Amend N4's path reference to the observed zero-byte filename, preserve the original receipt snapshot, and regenerate the N4 receipt/report binding. This is a provenance-pointer correction; it does not invalidate the verified v2 catalog, hosted artifact, archive, or delivery.

## Verification performed

The read-only audit is `compiled-capabilities/coordination/reviews/XR-ACCEPT-CUSTODY/audit_custody.py`; its output `audit.json` records 952 passing byte/status/member checks and the single path mismatch. It recomputed the ZIP CRC stream, fully consumed the inner gzip stream, checked every tar member against the manifest, hashed every delivery chunk, and compared the N4 corrected receipt with the preserved original. A read-only call to `coordination.probe.validate_receipt` using the pinned `/tmp/gondola-rebalancer-env` also accepted this active N5 review receipt and verified its dependency assignment. No CI artifact was downloaded again and no build, browser smoke, or full test suite was rerun.

The local archive remains rejected: observed bytes/hash differ from the final local receipt binding, and the truncation cause is unknown. The original local receipt and archive are unchanged. This review covers custody only and does not close the overall capability milestone.
