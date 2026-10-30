# Milestone 1 asks

Three users, one maker. Each user has a real job and writes it down first as failing checks, so the maker builds
against tests, not descriptions.

| Folder | User | Job |
| --- | --- | --- |
| `asks/plain` | Haiku 1 | Plain pages: first paint of single pages, including awkward props (`</script>` in a string, slashes, non-ASCII, empty errors). |
| `asks/layouts` | Haiku 2 | Pages with shared layouts: nested layouts, shared props (signed-in user, flash), a layout kept across visits. |
| `asks/partial` | Haiku 3 | Partial reloads and the protocol: only and except, Optional and Always props, stale version, 303 after PUT, PATCH or DELETE. |

Rules:
- A user writes only in its own folder, as Go tests against `inertia` and `inertia/oracle`.
- A user may fix its own check when the check was wrong, never to make it pass. Every such fix is noted in that
  folder's `NOTES.md` with the reason.
- A user reports: what worked, what failed, and the exact failing call with its output.
- The maker owns `inertia/`, `inertia/oracle/`, the Node side and `cmd/gobi`. It changes the signatures in
  `inertia/inertia.go` or `inertia/oracle/oracle.go` only after an escalation.
- A round ends when all three users finish their jobs with the tool unchanged. That is the receipt.

Escalation: the maker stops and brings the planner the failing checks and its options when the same failure survives
two rounds, a fix would change the Go interface or the page contract, the users' reports contradict each other, or the
design needs a fork the maker can't decide.

## Planner rulings
- Round 0, layouts: a Layout receives the same resolved props as its page, which are the shared props merged with the
  page's own props.
- Round 0, layouts: when a page prop and a shared prop have the same key, the page prop wins. The Inertia docs do not
  say this outright; it is how the server adapters merge (shared first, then the page's props over them).
- Round 0, layouts: layouts listed in App.Page nest outermost first. This is the contract's own rule.
- Round 0, plain: users never write React components. The oracle draws Inertia's side from the Go view's own Node
  (one layer per layout), so the component name needs no React file and any text a view draws, JSON or otherwise, is
  drawn identically by construction.
- Round 0, plain: where a check asserts an exact byte rule taken from the docs (escaping in the data-page script), the
  oracle's output is the judge. If Inertia's own rendering disagrees with the check, the check is wrong and is fixed
  with a note in NOTES.md.
- Round 1, layouts: oracle.Visit keeps cookies across steps, as a browser does; checks may rely on that. A flash API
  in the contract (for example App.Flash) is a contract change, parked for after Milestone 1; a flash kept in a cookie
  by the page's own handlers is fine.
- Round 1, partial: swapping handlers to simulate a new asset version is fine for this milestone; a way to change an
  App's version while it runs is a contract change, parked. X-Inertia-Location stays relative (the maker's choice).

## Rounds
- Round 0 (30 October, about 02:45 UTC): the three users wrote 38 checks against the stub contract while the maker
  built. All 38 failed with "not built yet".
- Build (about 03:10 UTC): the maker's first build passed 36 of 38. Both failures were checks that contradicted
  Inertia's own output (the escaped less-than sign in the data-page script, and the root element's
  data-server-rendered attribute). No escalation trigger fired; no contract signature changed.
- Round 1: the tool was frozen at fingerprint 126c704d358ea93f (SHA-256 over inertia/, cmd/, gobi/, wire/, reactmap/,
  the .mjs files, run.sh and the package files). The plain user fixed its two checks with notes; each user added two
  checks for its real job. Result: plain 13 of 13, layouts 12 of 12, partial 21 of 21, with the tool unchanged. That is
  the receipt: asks/SHA256SUMS holds the hash of every check that passed.
- Escalations: none.
