# Publications delivery results

## Author-level validation

- The frozen native scenario contains 50 source events: 45 Go updates and five non-dispatch control events.
- N2's fresh React and DOM GoScript CLI profiles each emitted 67 files with zero diagnostics. Their AppIR and encoder bytes match across backends, and the AppIR declares `view.node`, both numeric capabilities, `effect.request-reply`, and `effect.cancel`.
- N4's fixed and seeded conformance run matched 50 events, 45 Go updates, and 46 state checkpoints across React, DOM, and compatible-swap profiles. It detected 16 captured-data mutations. The three seeds are `20261031`, `20261032`, and `20261033`; seed `20261031` is the browser-mounted run.
- The executable HTTP demo author smoke passed 20 checks in Chromium 153.0.8010.0 with Playwright 1.64.1. It verified typed-step updates, locked-control suppression, captured-value stability, stale-revision rejection, accepted publication delivery, renderer swaps/rejection, pending request replies, cancellation, stale-reply rejection, and fresh remount. All ten configured no-WASM hooks were observable, with zero requests or API attempts.
- The author smoke's final screenshot and command result are retained under the ignored `compiled-publications/demo/output/author-smoke-20261031/` directory. Earlier failed attempts remain there alongside their failure summaries.

## Reproducible delivery runner

Run `bash run-compiled-publications.sh` with Node 22, Go 1.24, compiler Go 1.27.3, and the repository's locked dependencies. The command creates fresh React and DOM builds, a fresh native trace, fixed and seeded direct/browser conformance captures, an HTTP demo smoke, and a per-attempt archive. The full commands, versions, source pins, event/update/checkpoint counts, seeds, failure details, archive member inventory, and independent consumer result are written to each immutable receipt and report under `compiled-publications/evidence/attempts/<attempt>/`.

The author lane did not run the inherited PR16 pipeline locally. The GitHub Actions workflow installs the existing lockfiles, runs that full inherited chain, then runs this focused publications profile.
