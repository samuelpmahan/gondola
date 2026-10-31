# E-RESULT-PROVENANCE

**Outcome: insufficient evidence.** The local source and archive are traceable, but the 31 October full invocation ended with a failed E-BUILD gate and an exit code of zero. This packet records the failed cohort for repair; it does not claim milestone acceptance.

## Source and execution evidence

The tested local commit is `031c462bcd72c0ae0bee2dc05a0972b3902ca40c`, tree `d22b75e18c7bea70a743cc79d53461b287c7d045`, parent `00da54ad0f5a4006b13a5cded18ce291845978bc`. The publication binding identifies remote commit `a2e1164d68abaaa7d028bdaf6a20bea842a131ae` with the same tree and parent; the hosted PR merge commit `b717449a8844ee695a8f1facd20d41a6b4bcf097` has the same tree and parents `[00da54…, a2e1164…]`. A separate source-pin audit verified all 161 before/after pins against the worktree and local/published Git blobs, and all 24 original M0 checksum rows (23 tracked inputs plus generated `react-map.gen.mjs`).

The full command ran from 09:53:56.051Z to 10:16:59.067Z with Node 22.23.4, Go 1.24.0, compiler Go 1.27.3, Chromium 153.0.8010.0, React/ReactDOM 19.3.1, Playwright 1.64.1, and esbuild 0.28.2. It used the frozen `fixtures/compiled/lifecycle/scenario.json` and oracle expectations; the capability runner recorded no random seed. The command ledger has 16 successful commands. Root observed the runner process exit 0.

The outer inherited gate failed because it searched for the phrase `inherited compiled-methods`. Its nested lifecycle receipt is independently `status: passed`, has zero failures, and reports every inherited stage passed. The actual check text was “fresh full run-compiled-methods.sh completed…”. This is a false-negative gate. Separately, the outer runner did not set a nonzero process exit when a collected stage failure made the final receipt `status: failed`; this is a false-green CI risk.

The React and DOM GoScript builds, backend comparison, N4 literal oracle, N3 compiled conformance, N5 HTTP demo, and compiled-output stability stages passed. The only failed recorded stage was `inherited-static-and-interaction-lifecycle`, due to the receipt-text predicate above.

## Archive and hosted CI

The failed run archive is 14,976,273 bytes (SHA-256 `adabec770f19f985e5ad499b87b1a2f8c0e3890822a905346432cd69133c7040`); its 34,885-byte manifest is SHA-256 `f51970414a096529361b283733be90f7ebf8bd72ebf686b333bc590aba623c7c`. N5’s verifier returned `status: verified`, 187 members, 161 source pins, and `completeAcceptance: false`. Its `--require-complete` mode rejected the receipt as expected.

N4's immutable catalog snapshot (`provider/source-run-catalog-snapshot-1008Z.json`, SHA-256 `54e3bcce33ca2d17e8417407d8584b22d5031c7178480ae08364237988ef636a`) binds all 30 runs to source head `a2e1164d…`: 15 push and 15 PR. At 10:08Z, 11 runs/jobs were complete-success and 19 were still in progress. The focused push run `41190743932` and PR run `41190759391` were both in progress, with primary artifact/log collection pending. CI artifact acceptance therefore remains unresolved here; a later green provider conclusion must not override the failed local E-BUILD receipt.

The prepared N1 source auditor could not parse the current `new Set([...])` runner declaration and stopped before pin/M0 verification. The independent pin audit in this lane completed those checks successfully. N1 owns a separate repair to its parser.

## Evidence files

The failed outer receipt, immutable pre-archive snapshot, command log, nested passed lifecycle receipt, archive, and manifest remain available at the paths recorded in the receipt below. The earlier startup failure at `/tmp/gondola-capabilities-full-2324068.log` failed before tests and is excluded from this cohort.
