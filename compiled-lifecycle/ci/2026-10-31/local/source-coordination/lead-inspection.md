# Lead inspection before integration

These are code-review observations, not executed regression results.

- The initial optional effect-policy hook received the validated effect object before queueing. A policy could mutate fields after validation. N2 was asked to freeze the policy input and add a mutation regression.
- The first draft token helper encoded the fixed replay request numbers by scope/generation and stopped after generation2. N1 was asked to derive tokens from actual generation and request IDs using admitted strconv.FormatUint, and test reordered requests plus a third remount. The frozen script tokens remain unchanged.
- Canceling only in the transport driver would leave core pending correlations alive. N2 owns a neutral cancelEffect API to retire pending and queued completions; direct stale Go messages separately challenge Go guards.

Final acceptance requires actual test logs and independent cross-reviews; this inspection file does not assert those gates have passed.
