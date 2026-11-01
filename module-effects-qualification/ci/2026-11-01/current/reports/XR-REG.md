# XR-REG — independent review of E-REG

**Reviewer:** N4  
**Decision:** accepted

## Review conclusion

E-REG's claims are supported by its sealed source, receipt, raw command streams, and hashes. The report keeps the two M0 runs distinct: the first used the unmodified e093 archive; the second used the same isolated extraction after the one authorized nested compiler module boundary was added. It does not describe the boundary-bearing source as pristine e093.

## Source and scope checks

The baseline commit tree is `0a52ae23ab32e0ca35f6b1385ea851e3edeede3a`, and a fresh archive of commit `e0933465725e470dc610e3f81b4bbee95538c1d0` hashes to `d7be4d1270cd50013b8c55837b5abed0f1b5448e280d310bc05a5b9b5d5e78c8`, matching E-REG's archive record. The boundary file is absent from the baseline Git tree. Its bytes in the isolated source and the current checkout hash to `4e5404a63d8ca4238ef43e70769024b229c3c88aa327574aa760b99a9fd3a463`, matching the sealed source inventory.

The current sparse checkout omits the two historical `source-snapshots` files. I checked their blobs at the e093 Git object and compared them with the isolated extracted source: `js_encoder.go` is `a605b3267f63f7c7ed90c17ee2ed9bf04c7667827a23496c8620070f13b9b46d`, and `js_encoder_test.go` is `d6dcbda61dc4dcb425164fc45d396f799a0574981103ad4866d268fb3fb9aa9f`, matching the E-REG hashes. The preserved files are intentionally partial and remain outside the compiler package graph after the boundary.

The M0 `package.json` pins React 19.3.1, React DOM 19.3.1, and fast-check 4.10.2, matching `EXPECTED.json`; the source checksums include its lockfile. The four compiler dependency lock inputs (`go.mod`, `go.sum`, `package.json`, `package-lock.json`) have identical hashes in the current checkout and isolated snapshot. The version evidence agrees: root Go 1.24.0, Node 22.23.4, npm 11.9.0, compiler Go 1.27.3, and esbuild 0.28.2.

## Command evidence

The sealed raw-log index and the E-REG report/receipt hashes all verify. Both M0 runs exit 0 and show `same over 5000 inputs`, `receipt matches`, and `SHA256SUMS ok`; `EXPECTED.json` and `SHA256SUMS` match the isolated snapshot and current root inputs.

The compiler failures before the boundary are retained with nonzero statuses. The first run records missing pinned esbuild and partial snapshot compile errors. After `npm ci`, the remaining failure is the same partial snapshot. The final uncached full package test exits 0 across the listed eight packages; the race run and vet run also exit 0. Their raw streams and statuses are present in the sealed index.

The preflight-rejected receipt with the original worker path remains preserved. The active sealed receipt correctly records worker slot N1, and its correction note points to the preserved preflight record.

## Review-only command repairs

Two exploratory verification commands initially referenced paths unavailable in the sparse checkout: the historical snapshot files, and an npm CLI path that does not exist in the pinned Node bundle. Both outputs are retained under `rawlogs/XR-REG/`. I corrected the snapshot check by comparing baseline Git blobs to the isolated source and used the environment's `npm --version` for the version check. The corrected checks passed; neither attempt changed repository source.

## Limits

This review validates the E-REG record and its inherited M0/compiler regression evidence. It does not independently rerun M0 or the compiler suite, and it does not validate the new effectqualification implementation.
