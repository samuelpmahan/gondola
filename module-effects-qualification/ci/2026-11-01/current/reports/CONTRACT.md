# Native asynchronous module qualification contract

Source baseline PR23 e0933465725e470dc610e3f81b4bbee95538c1d0. User authorizes implementation/testing/feature PR, no main merge or deploy. All workers Luna6 XHigh. Seven session slots including lead, actual spawns recorded separately. Native Rebalancer 1.0.4 assigns six lanes and independent reviews; scheduler acknowledgement is not platform execution.

Goal: Go-only offline acceptance of real async keyed module captures with reusable fixture replay, exact source/artifact/ABI admission, state/tree/DOM/disabled checks and ordered lifecycle/correlation checks. No arbitrary Go/browser/pixel/network equivalence claim. Preserve M0 EXPECTED.json and SHA256SUMS and all prior receipts. New code root package effectqualification; no production dependency additions. Reuse modulequalification archive parser (verify schema compatibility before assuming). Public top API VerifyDirectory(string)(Report,error); capture API CheckCaptures(string)(CaptureReport,error); ordering CheckOrdering(expected,actual map[string]any)error; replay effectsreplay.ReplayJSON([]byte)([]byte,error). Cross-lane APIs agree via messages, no overlapping writes.

Go /tmp/gondola-go/go/bin/go (1.24.0), Node /tmp/gondola-node22/node_modules/node/bin/node (22.23.4), compiler Go1.27.3, Chromium /tmp/chromium-portable. Real source fixture directory compiled-module-effects/output/attempts/attempt-20261101T042914069Z-2-7d158b7a and sibling tar.gz/manifest.json. Inspect existing oracle and prior native modulequalification but do not shell to JS/Python for semantic checks. Default integration fixture via GOBI_EFFECTS_QUALIFICATION_INPUT explicit environment; avoid silent skipped claims.

Ownership below is exclusive. Root handles Git/publication and integration only. Workers never git add/commit/switch/reset/push or install shared deps. Do not edit frozen prior coordination/evidence. Create raw command outputs under this new coordinator/rawlogs/JOB; author report at reports/JOB.md and receipt at receipts/JOB.json. Receipt {job_id,worker,outcome: mixed_change|confirmed_reuse|not_reuse|insufficient_evidence,summary,owned_files,commands,evidence,limitations}; reviews use decision accepted|amend|rejected, no outcome required. Every claim pins exact command/output; report failures and repairs. Do not fabricate success.

Dependency gates: N1 replay API freeze before N2 native integration; N2 shared JSON helpers and CaptureReport agreed before N3 final top API; N2/N4 agree capture shape before order integration. N5 independent tests exercise integrated package after APIs land, meanwhile analyze actual fixtures and mutation cases. N6 CLI builds after Report exists; meanwhile archive/runner design and tests. Every lane must independently review another lane after author packet sealed by root. Root runs fresh regression and seals final receipts.

## N1 E-REPLAY
Owns `effectsreplay/** cmd/module-effects-native/**`. Extract existing native replay into reusable Go API ReplayJSON([]byte)([]byte,error); preserve all CLI/schema semantics and byte output.

## N2 E-CAPTURE
Owns `effectqualification/capture.go effectqualification/capture_test.go effectqualification/json.go`. Go capture semantics and strict canonical JSON helpers. CheckCaptures(root string)(CaptureReport,error), JSON maps decoded with UseNumber; recompute effectsreplay.ReplayJSON for every scenario; exact states/events/effects + Go-render DOM/disabled comparisons across 5 profiles.

## N3 E-ADMISSION
Owns `effectqualification/verify.go effectqualification/admission.go effectqualification/admission_test.go`. Native directory source/build/artifact/ABI admission and top-level VerifyDirectory(root string)(Report,error); reuse modulequalification.VerifyArchive through CLI for archive mode. Hash every input before/after; pin archived source bytes, 4 builds, ABI/caps. Must not accept producer boolean claims as proof.

## N4 E-ORDER
Owns `effectqualification/ordering.go effectqualification/ordering_test.go`. Native lifecycle/transport/correlation acceptance CheckOrdering(expected, actual map[string]any) error. Inspect actual capture vs native differences; ordering supports direct/browser/swap finite profiles. Coordinate exact capture API with N2; no semantic JS delegation.

## N5 E-NEGATIVE
Owns `effectqualification/integration_test.go effectqualification/adversarial_test.go`. Independent native integration and negative controls against real PR23 bundle; fully rehash mutated inventories where required so tests reach semantics; no edits to implementation files. Read-only analyze interfaces until available, own reproducible controls/report.

## N6 E-DELIVERY
Owns `cmd/module-effects-qualify/** run-module-effects-qualification.sh module-effects-qualification/** .github/workflows/gobi-module-effects-qualification.yml`. CLI directory/archive modes with modulequalification.VerifyArchive; fresh explicit runner, Go source closure and evidence/report docs; no dependency on Node for semantic consumer. No edits prior receipts/profile. Runner must work against existing PR23 bundle then fresh profile.

