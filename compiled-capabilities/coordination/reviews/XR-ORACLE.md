# XR-ORACLE: independent review of E-ORACLE

## Decision

**Accepted for the assigned oracle scope.** I found no mismatch between the hand-authored expectation contract and the synthetic runtime assertions, and the fresh Node 22 run passed all eight tests.

The review confirms coverage for the requested host/renderer boundary cases: missing required capabilities, unknown namespaces, malformed declarations, sparse and duplicate arrays, accessor elements and profile properties, legacy admission without `effect.cancel`, and cancellation rejection before optional policy when the component declaration is absent. The swap case compares the pending snapshot against fixed state/view/DOM literals, confirms the old callback remains live after rejection, then checks a compatible swap and delivery of the pending completion.

Precision note: the test named `mutation controls` verifies that local `assert.deepEqual` checks detect two manually altered fixture objects. It does not run implementation fault injection or establish mutant coverage; the rest of the oracle's direct host/renderer scenarios provide the behavior checks described above.

## Evidence and limits

- The review rerun used Node `v22.23.4` and wrote a separate raw TAP file to `reviews/XR-ORACLE/node22-test.log`; all 8 tests passed.
- `node --check` passed for the oracle source, and the expectation JSON plus author receipt parsed successfully.
- Reviewed source hashes: expectations `bce92447403c8afe81d23aedc67d4c6751e8c77a5bec18ecce9cc0df262855a4`; test `6ff34cd37ae9cbc7e8e63eb31972fb009793493551122c497e8e0c98d51bbe57`; author TAP `f1e2e27b81dcb6bfccbbdee3cf3bd3e1fbdabad2373573d003adefae2756df1a`. Review TAP SHA-256: `9097ce580d79d30db96a1965fa0f0f17f6cd61acb690d3f8bc8ef67d806297f4`.
- This oracle uses a synthetic AppIR module and fake renderer. It does not establish behavior of freshly compiled GoScript or actual React/DOM adapters; those checks remain with E-HARNESS/E-BUILD.

No production files were changed during this review.
