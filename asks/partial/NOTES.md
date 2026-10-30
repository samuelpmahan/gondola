# Notes for asks/partial (Haiku 3: partial reloads and the protocol)

## Layout

- `helpers_test.go`: the fixture (one App at a version, a Users page, its routes), request helpers, the `attempt`
  wrapper that turns a panic into `t.Errorf`, and the assertion helpers. Every message names what was expected and why,
  with the Inertia 3 page it comes from.
- `partial_reload_test.go`: only, except, Optional, Always, and partial headers naming another component.
- `protocol_test.go`: errors in props, stale version (409 and X-Inertia-Location), and a stale PUT not answered 409.
- `redirect_test.go`: 303 after PUT, PATCH and DELETE, and 302 after POST, checked directly and through the client.
- `reload_patterns_test.go`: a reload naming two props, a failed validation answering with errors filled in, an expensive
  Optional prop run once per naming reload, and a stale version on a partial reload.

## Sources read

- https://inertiajs.com/the-protocol: request headers, page object (`errors` always present, defaulting to `{}`), 409
  with `X-Inertia-Location` on a stale GET, non-GET requests never answered 409, 303 after PUT, PATCH and DELETE.
  This page is where the `X-Inertia-Partial-Component`, `X-Inertia-Partial-Data` and `X-Inertia-Partial-Except`
  headers are documented, and that partial data narrows the response before except removes props.
- https://inertiajs.com/partial-reloads: only and except, Optional (never sent unless only names it), Always (sent
  even when left out of only), "partial reloads only work for visits made to the same page component".
- https://inertiajs.com/asset-versioning: the stale version triggers a full page visit on the next request.
- https://inertiajs.com/redirects: 302 converted to 303 after PUT, PATCH and DELETE.

## Choices made in the checks

- The stale-version-through-the-client check hands `oracle.Visit` a handler that serves the first request from a v1
  app and every later request from a v2 app. The contract has no way to change an App's version between visits, so
  this is the only route through `oracle.Visit` with the current signatures.
- A partial reload whose component differs from the rendered one is checked as a normal visit: all props of a normal
  visit go out, and the Optional prop stays out. The docs say partial reloads only work for the same component; they
  do not say the Optional prop is computed on an ignored partial. I read it as a normal visit.
- The 409 check expects `X-Inertia-Location` to equal the requested path exactly (`/users`). The docs say "the target
  URL" and do not say whether it is absolute. If the maker sends an absolute URL, this check is the one to relax.
- The 302 after POST is the task's contract. The redirects page documents only PUT, PATCH and DELETE (303); it does not
  document the POST status.
- Props are compared with `!=` on `any` values. They are strings, so this is safe.

## Mistakes in my own checks

- First draft had a comment on `TestExceptReloadSendsExceptHeaderThroughOracle` that said "Direct:" when the test goes
  through `oracle.Visit`. Fixed the comment before the first run. No check was changed in a way that moves what it
  expects.

- Round 1 fix: `TestFailedValidationAnswersWithErrorsFilledIn` used `expectValue` on a map (`errors`), which compares
  with `!=` and panicked (uncomparable type), killing the run. Replaced with explicit type and field checks. The
  expectation did not change.

## Result of the first run

`GOTOOLCHAIN=local go vet ./asks/partial/` compiles cleanly. `GOTOOLCHAIN=local go test ./asks/partial/` fails all 17
top-level tests (23 FAIL lines counting 6 subtests) with `inertia.New panicked: inertia.New: not built yet`, which is the expected
starting state. Every check that depends on `inertia.New` stops at that first panic; later panics in the same test
are not reached until the constructor exists.

## Round 1 (tool built)

With the maker's build in place, `GOTOOLCHAIN=local go test -count=1 ./asks/partial/` passes all 17 original top-level
tests and the 4 new ones (21 total, 0 failing). `go vet` is clean. The stale-version-through-the-client check still
relies on the handler swap described above, since the contract has no way to change an App's version between visits.
