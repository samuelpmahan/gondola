# XR-UTF8 — independent review of the sealed Unicode boundary

**Reviewer:** N2  
**Decision:** accepted  
**Author packet:** N1 E-UTF8  
**Scope:** the seven sealed compiler/encoder source files, their exact source and dependency pins, the GoScript contract and ruling, the E-COMPILER pipeline baseline, the author packet seals, and the actual N4 direct and mounted Unicode evidence. This review made no production or Git changes.

## Decision

The codec is a bounded and internally consistent fix for GoScript’s byte-string representation at the compiled-module boundary. I found no contract violation or counterexample in the reviewed paths.

The generated module converts well-formed JavaScript UTF-16 message fields to UTF-8 bytes before calling the compiled GoScript Update. It converts GoScript byte-strings back to strict UTF-8 while cloning returned views, retaining the generated object prototypes and GoSlice shape. Invalid UTF-8, code units outside the byte-string range, lone surrogates, unsupported accessors/prototypes, cycles, and over-depth view graphs fail closed. The view conversion copies values and the real fixture test confirms the GoScript state remains unchanged.

State encoding is explicitly opted into through GenerateGoScriptValueEncoder. The existing GenerateValueEncoder keeps the legacy JavaScript-string behavior; the paired real Node test checks both behaviors and rejects malformed UTF-8 and non-byte GoScript strings. Pipeline changes against the sealed E-COMPILER pipeline are limited to selecting the opt-in encoder and wrapping emitted Update/View with the boundary adapter. The standard gobiCompiled object and bridge logic are not changed by this packet.

## Evidence reviewed

- The E-UTF8 report, receipt, source inventory and seal files match the recorded seal values. The seven current source files match all author byte counts and SHA-256 pins. The pinned GoScript v0.6.2 slice and builtin sources also match.
- The scope contract and Unicode ruling match the hashes recorded in the author receipt. The E-COMPILER pipeline snapshot is 40,718 bytes with SHA-256 78463101a450aec88cf2ecf8b7182fe2da432aab99885edd6304aeccab264c16. A direct diff shows only the GoScript-mode encoder selection and the emitted string-boundary wrapper additions.
- The author’s recorded compilercontract and compiled-frontend build tests both exited 0. The real test fixture exercises accented Latin, CJK, emoji and U+2212 in state, messages, nested nodes, attributes, styles and event-handler records; it verifies state immutability, class prototypes, encoder round-trip, invalid UTF-8 rejection and lone-surrogate rejection.
- The recorded emitted React and DOM module probe returned exact “Step −” with no mojibake. The separate N4 direct result is pinned at SHA-256 8b1f8b10d32651d8adb3a240c33c6de0596672e45b1e5bda79aed0c1783de42b and reports matched for 24 events, 16 Go updates and 17 checkpoints.
- I independently re-read and hashed N4’s mounted browser evidence. The captured 31,814,241-byte browser JSON has SHA-256 0c02edf99ab891c1102236e26ccd697505dc68e882afd9cd02f6da207271b90c. Across all 12 React, DOM, swap and seeded profiles, every captured parent Go-view snapshot and every captured physical parent DOM snapshot contains exact “Step −”; no scanned string contains the prior mojibake, and no profile failure or page error is recorded. The run’s four ABI hashes match the fresh parent/child React/DOM build set.

The independent audit code, machine-readable results, initial audit failure, stdout/stderr/exit and raw index are pinned in module-coordination/rawlogs/XR-UTF8/index.json. The initial audit incorrectly assumed a different shape for the run’s ABI map and marked that one comparison red; I preserved it, corrected the audit to the actual schema, and reran it. The corrected result passes all source, dependency, evidence, seal, Unicode and ABI checks. This was a reviewer-script correction, not a product or evidence failure.

## Limits

This establishes the reviewed compiled-module boundary for valid UTF-8 Go strings and well-formed JavaScript Unicode text. Arbitrary Go byte strings that are not valid UTF-8 are intentionally rejected. It does not establish arbitrary Go compatibility, arbitrary JavaScript object support, malicious-code isolation, or browser/OS coverage beyond the pinned Chromium 153.0.8010.0 and Playwright 1.64.1 capture.
