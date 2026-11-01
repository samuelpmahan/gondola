# E-SOURCEAUDIT — independent source, scope, and publication audit

**Worker:** N3  
**Job:** E-SOURCEAUDIT  
**Outcome:** mixed_change  
**Phase:** final source published, 430/430 Git-bound, and clean E-RUNPORTABLE passed; external extracted-source consumer and final pack execution remain pending  
**Base:** f4c8f70199a8ca896c13e225a85901abe658d0de  
**Published source commit:** e0933465725e470dc610e3f81b4bbee95538c1d0  
**Published tree:** 0a52ae23ab32e0ca35f6b1385ea851e3edeede3a  
**Publication:** PR 23 draft; local tree matched the API tree; worktree clean

## Scope and candidate inventory

The final published inventory has **43 modified or new production, test, configuration, and guide paths**. Every path maps to an assigned lane or approved shared-file addendum; none is unclassified. Generated build/output and evidence trees are excluded.

| Lane scope | Candidate paths |
|---|---:|
| N1 Go effect fixture and CLI | 6 |
| N1 approved compiler repair | 4 |
| N2 approved shared build and ABI repair | 4 |
| N2 build admission and path repair | 4 |
| N2 relocated-source loader repair | 2 |
| N3 runtime | 2 |
| N4 conformance | 9 |
| N5 oracle | 2 |
| N6 delivery | 10 |

The shared files are compiled-frontend/analyze/analyze.go, compiled-frontend/analyze/load.go, compiled-frontend/build/pipeline.go, and moduleabi/descriptor.go. Their changes stay within the approved compiler-loader/ParseUint53, build-stage-diagnostic, and child-effect-capability addenda. The N2 relocation repair changes the new-profile module loader and adds a focused relocation regression test. The Go child wrapper reuses modulechild for its Core state and existing counter transitions. The production runtime routes calls to compiled Go roles; the JavaScript oracle is a test model.

The final unique source pin set is **430 paths**: 295 E-REG inputs, 161 E-KEYEDREG inputs, 202 primary source/test pins (including 58 test sources), and 43 candidate paths. The E-KEYEDREG closure overlaps 143 earlier paths and contributes 18 unique paths. The final candidate inventory and combined pin manifest are rawlogs/E-SOURCEAUDIT/final-checkpoint/rawlogs/candidate-inventory-final-e093.json and rawlogs/E-SOURCEAUDIT/final-checkpoint/rawlogs/git-bind-inputs-final-e093.json.

## Go ownership, runtime, and browser boundary

The effect wrapper state contains modulechild.State as Core. Its Init, Update, Input, Publication, and View delegate to modulechild; add/reset continue through the existing child Update. Go owns mount identity, request IDs, pending/reply state, token equality, and cancellation. Removing a child calls compiled Update(unmount), records the full Go transition and emitted cancellation, retires the transport correlation, cancels transport, and only then tears down the renderer. Renderer callback epochs remain separate from reply lifetime keys.

The six E-HOST tests used actual emitted Go artifacts with a synthetic renderer and FakeElement; they do not claim mounted React/browser renderer evidence. N4/N6 provide the browser checks. A static scan of the browser runtime and its direct browser entry dependencies found no Node builtin imports. The browser bundle smoke also passed without node:path or node:fs imports.

## Entry points and source closure

The standalone entry point is bash run-module-effects.sh --source-commit <40-character-git-sha>. It resolves Go, Node, and Python from PATH or the documented GOBI_*_BIN overrides, requires root Go 1.24 and Node 22, and invokes compiler builds with Go 1.27.3. N6 pins EXPECTED.json and SHA256SUMS, and both workflow path filters include SHA256SUMS. Its static alignment check found 23 explicit source files, identical 39-path push/pull filters, every explicit pin covered, actionlint exit 0, and Node syntax-check exit 0.

The profile archive is not a full M0/counter checkout. The guide directs inherited regressions to a full Git checkout using bash run.sh and bash run-interaction.sh. The workflow runs M0, counter interaction, and the prior keyed-module regression separately before the new profile.

## Preserved regressions and conformance evidence

The original EXPECTED.json (320 bytes, SHA-256 639e4327a927cadf3530d12d3c9a80bdd89ac329ae333261cecb90f66aa333d2) and SHA256SUMS (1,966 bytes, SHA-256 8b6ec10d327152dc1d6b494223144b08dcf5c2f16bc80d53e9b059d1c9ffe1a0) match their signed E-REG receipt. E-REG passed M0 receipt/checksum validation, the 5,000-case seeded comparison, and the counter regression: 8/8 Node tests and 107 scripts / 4,473 ticks with zero mismatches. Only isolated-copy absolute inputPath values were normalized in the baseline trace. All 295 E-REG source pins match the final Git commit. Those suites were not repeated in E-RUNPORTABLE.

E-KEYEDREG passed separately at commit 88: four builds, five focused Go packages, five Node tests, 126 actions and 130 native checkpoints, eight direct and 12 browser profiles, 17 build-admission controls, 11 capture controls, and an independently checked 604-member archive. Its 161 source pins also match the final Git commit; the keyed suite itself was not repeated in E-RUNPORTABLE.

N4’s current conformance matrix matched four scenarios across 20 profiles, rejected all 16 capture mutations and seven build-admission mutations, passed 11/11 focused tests and 9/9 probes, and passed 32/32 full Node tests. E-ORACLELINK separately rejected 16 controls over each of four saved scenarios (64/64); those controls mutate saved evidence. Browser capture uses programmatic HTMLElement.click(), not trusted pointer or operating-system input.

## Final clean E-RUNPORTABLE

The final run receipt is compiled-module-effects/evidence/attempts/attempt-20261101T042914069Z-2-7d158b7a/receipt.json (716,076 bytes; SHA-256 31e60be9b368330a4d98040c0bd1f80a84b02d6eeb5cdea84ef12906db82e3bc). It records source commit e0933465725e470dc610e3f81b4bbee95538c1d0 before and after, a clean worktree, all 202 primary source pins matching Git, and no source pin mismatches. Those run pins match the final combined source binding.

All 20 recorded run commands exited 0. Four builds passed. Tests passed: 13 Go native tests, one module ABI test, four compiler analyzer tests/eight cases, one build-stage regression, and 36 Node tests across seven files. Four scenarios carried 31, 49, 50, and 48 events; all five profiles per scenario matched, producing 178 native events, 182 states, 58 effects, 116 native transport rows, and 20 lifecycle rows. The producer rejected 16 capture-control mutations and seven build-admission mutations. The independent oracle rejected 64 mutation applications over 16 distinct capture-control IDs.

The Chromium demo returned HTTP 200 and passed six browser steps covering initial mount, pending controls, Go-declared cancel, immediate React swap actions, pending timer survival across renderer swap, and swap/remove/remount child actions. It recorded four transport starts after the Go state showed pending/Saving, Save disabled, and Cancel enabled. The unmount evidence orders Go update, committed state, Go cancel effect, transport cancel, and renderer teardown at sequences 33, 35, 36, 37/38, and 40. Page errors and failed requests were zero.

The archive contained 639 members and measured 8,667,568 bytes (SHA-256 7eb9f28fc6504bf43207436dfc916549bb28e34059cee69bc138376be7940087); its manifest SHA-256 is 457073a81f1c93ba0edfe51b06667bb39f9baed95fd32ad3a9c630f9f476b1b9. The in-run independent Python archive consumer passed. The separate N5 consumer is testing the archive after extracting source and artifacts; that external acceptance and final pack execution remain pending.

## Final source binding and external acceptance

The published source proof identifies commit e0933465725e470dc610e3f81b4bbee95538c1d0, tree 0a52ae23ab32e0ca35f6b1385ea851e3edeede3a, and a clean local/API tree match. The read-only binder verified that base f4c8f70199a8ca896c13e225a85901abe658d0de is an ancestor and matched **430/430** Git blobs by path, size, and SHA-256. It found zero missing paths and zero mismatches. The final manifest and binding are rawlogs/E-SOURCEAUDIT/final-checkpoint/rawlogs/git-bind-inputs-final-e093.json and rawlogs/E-SOURCEAUDIT/final-checkpoint/rawlogs/git-binding-final-e093.json. The binder source itself is indexed and hashed.

The earlier f6 source commit had a clean run and a 429/429 binding, then N5 found that the extracted archive loader expected the original recorded repository path. N2’s relocated-source loader repair and focused test were independently reviewed and accepted, and the e093 clean run passed with the new code. That f6 packet, both 88-stage checkpoints, and the e093 pre-run binding checkpoint are preserved without overwriting their bytes.

The XR-PACKAGEROOT review accepted the external coordination-root guard repair after seven tests and alias-path probes rejected before output. The actual final external pack execution and N5 extracted-source/artifact consumer are still pending. They are separate publication-acceptance steps and do not alter the completed e093 source-to-Git binding.
