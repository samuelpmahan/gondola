# XR-COHERENCY — independent review

## Decision

**Accepted.** I reran the concrete XR-CAPTURES false-acceptance witnesses against the frozen E-COHERENCY source. Every altered capture was rejected by the intended identity, seed, missing-field, or null-field check. The unmodified actual capture still passes, including valid zero/false values and nullable message pointers.

## Pins and scope

The reviewed source is `gondola/modulequalification/semantics.go` (89,156 bytes, SHA-256 `91bd74cdcdd8abfd37aca2f2056d5754c181e1bb4ac1b31a147389df83db1e13`) and `semantics_test.go` (7,252 bytes, SHA-256 `2c34657133632c838e847fa8b85b13e0b97432d964151088ceb31d0e885f3b6c`). These match the sealed E-COHERENCY inventory. The author report, receipt, seal, all 13 listed raw-evidence items, contract, and seven capture files also match their recorded hashes and sizes; the detailed 29-item check is in `rawlogs/XR-COHERENCY/author-pin-validation.json`.

The actual input root was `/tmp/gobi-published-restore-check`. Each mutation used an isolated hard-link overlay; only the overlay target was unlinked and rewritten. Each check ran the existing `TestCheckCapturesAgainstRestoredModuleRun` with Go 1.24.0, `GOTOOLCHAIN=local`, and `GOFLAGS=-buildvcs=false`. Baseline and all mutation commands, outputs, exit codes, and hashes are indexed in `rawlogs/XR-COHERENCY/index.json`.

## Independent probes

| Probe | Result |
| --- | --- |
| Unmodified actual capture | Accepted: 12-profile replay check passed |
| React `initialBackend` and trace `backend` both changed to `dom` | Rejected at `profiles.react.initialBackend` |
| React `initialBackend` changed alone | Rejected at `profiles.react.initialBackend` |
| React trace `backend` changed alone | Rejected at `profiles.react.trace.backend` |
| Seed `20261031` metadata changed to `20261032` | Rejected at the independently replayed seed comparison |
| Initial child `Counter.Count` set to `null` | Rejected as non-nullable |
| Initial child `Counter.Count` deleted | Rejected as missing |
| Initial parent `PublishedCount` set to `null` | Rejected as non-nullable |
| Registered `profiles.dom` entry deleted | Rejected as missing |

The accepted baseline contains `Counter.Count: 0`, `PublishedCount: 0`, and `Locked: false`. It also has nullable `events[4].message`, `events[6].message`, and other disabled-event message pointers represented as `null`; those valid values remain accepted. The checked capture hash is the E-COHERENCY pinned `579c8c4a17d26682fc30bfdbbc4de677ee63cda322b7bfdd00bd624c22b4ceec`.

## Limits

This is an independent review of the bounded frozen fixture and its recorded capture set. It does not launch a browser, independently regenerate the browser capture, or establish behavior beyond the one fixture and three deterministic seeds. I found no remaining false acceptance in the assigned metadata/state-field witnesses; the author's full package and directory-CLI results remain author evidence rather than tests rerun in this review.
