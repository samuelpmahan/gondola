# Portable qualification implementation plan

Goal: native Go verifies a real mounted qualification bundle end to end. Architecture: bounded safe extraction, existing Go certificate recomputation, deterministic CLI, actual positive/mutated archived inputs, independent policy tests, thin executable profile/CI. Spec: CONTRACT.md. Go1.24 standard library only; root owns Git/state/publication; six disjoint native-assigned Luna lanes.

1. N1 writes strict Extract/Bundle/Close plus archive tests. N5 concurrently creates independent malformed/unsafe/oversize archive tests; test failures gate N1 acceptance.
2. N2 consumes Extract and existing backendqualification.CertifyFile; compares archived and recomputed certificates and provenance. N3 consumes Verify in CLI, validates explicit expected commit and output behavior.
3. N4 restores exact 397-member published fixture and tests a healthy Verify plus deterministic structural/hash and rehashed semantic mutants. N6 adds Go-only wrapper, README and focused CI without new application/renderer behavior.
4. Root installs Go1.24/Node22, checks integrated native profile and M0 regression, records exact commands/version/hash/mismatches. No fresh browser claims from archive verification. Current source77f7ce's hosted qualification job passed at18:53UTC; other inherited CI still pending at reconnaissance.
5. Each worker announces immutable final report/receipt hashes; root seals, finishes native jobs, solves again, and actually dispatches eligible independent reviewers. Amendment findings get new explicit repair gates rather than overwriting sealed evidence.
6. Root publishes source through a scoped branch/PR stacked on PR18, publishes all native receipts and executed evidence, verifies Git readback, and records precise captured-evidence bounds. M0 receipts unchanged; no main merge/deploy.

Review focus: unsafe archive paths/types; gzip tails and resource exhaustion; well-rehashed semantic/certificate falsification; duplicate JSON keys/inventory; output clobber and failure cleanup. Owned tests cover each; general Go compilation/third backends remain outside this milestone.
