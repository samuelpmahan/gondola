# Compiled keyed child collection results

## Author implementation status

The E-DELIVERY implementation provides a full-only runner, a GoScript-backed HTTP demo, an HTTP/Chromium smoke entry point, a scoped CI workflow, documentation, and immutable attempt/archive provenance. The runner is wired to the frozen parent/child generation contract and the N4 CLI contract.

Node and npm dependencies were installed from the existing three lockfiles with `npm ci`; the lockfiles remain unchanged. The local toolchain is Node v22.23.4, Go 1.24.0, compiler Go 1.27.3, and Chromium 153.0.8010.0.

The author HTTP demo was built from N2's existing complete React GoScript output at `compiled-children/compiler-evidence/build/react-repeat`. The exact 27,651-byte `BuildResult` hash is `5953b0f6f49bbc9249bc674de57f8faf4efb2547667a195125bdaad7814ad6d8`; all 67 output size/hash entries matched before and after smoke. The peer Go fixture source pins also stayed unchanged: `app.go` `d265bbac54017ab366bdf86aa646fdad808f464c5d35cd106259c6943fc32c99`, `view.go` `6d0ecf88dfc521ed197213e8922ec12f553505a37f88f5e8e63a1ec8cfda8185`.

Author demo commands:

```sh
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH node compiled-children/demo/build.mjs --compiled compiled-children/compiler-evidence/build/react-repeat --output compiled-children/demo/output/author-smoke-20261031-rerun1/site --backend react
PATH=/tmp/gondola-node22/node_modules/node/bin:$PATH CHROMIUM_PATH=/tmp/chromium node compiled-children/demo/smoke.mjs --demo compiled-children/demo/output/author-smoke-20261031-rerun1/site --output compiled-children/demo/output/author-smoke-20261031-rerun1/smoke.json --screenshot compiled-children/demo/output/author-smoke-20261031-rerun1/screenshot.png --chromium /tmp/chromium --port 0
```

The build passed and emitted a 1,853,920-byte bundle with SHA-256 `c2d5723c7c15a3bba3a59687a4f610682fe5d8cb387ed465118df79471a84ac9`. The HTTP/Chromium smoke passed **31/31** checks on ephemeral port 40899 with Chromium 153.0.8010.0; `/`, `/demo.css`, and `/demo.bundle.mjs` returned HTTP 200. It exercised parent/child requests, disabled actions, counter updates, reorder while work was pending, React/DOM swaps, incompatible rejection and recovery, key reuse with a fresh generation, stale reply rejection, child-first clear and parent removal cancellation, and parent remount. The smoke recorded no browser, console, failed-request, or WebAssembly activity. Its JSON hash is `6d5170a5fccbdd8210218fcc3b366f36b84ccdbd16c37348b5e2fcf25385f3cd`; the screenshot hash is `c9ee6fd06a30f5a353d9e1d46aeceda40149e3148040bffe4bc6bd1e0b8614b9`.

An earlier author smoke attempt is retained under `compiled-children/demo/output/author-smoke-20261031/`. It failed the initial state assertion because the Go runtime snapshot exposes canonical `AppValue` fields rather than direct Go struct properties. The smoke now decodes the snapshot's typed fields before comparing state; the fresh rerun above passed. The author E-DELIVERY receipt binds both attempts, and the full runner preserves the author receipt, report, and author smoke directory before updating canonical E-DELIVERY files.

Node 22 `--check` passed for all five owned JavaScript entry points, `bash -n run-compiled-children.sh` passed, and `git diff --check` passed. The full inherited `run-compiled-capabilities.sh` chain, fresh React/DOM children builds, N4 seeded browser replay, N5 literal oracle in the delivery runner, and final delivery archive remain pending the root-owned full source-bound run. No integrated acceptance claim is made before that run.

The standalone post-command archive consumer also passed an author probe against a temporary one-member tar: member set, extracted size/hash, archive size/hash, and external manifest hash matched. The full runner will repeat this with its generated archive after `archiveAndVerify` completes.

## Acceptance boundary

Acceptance requires a fresh full receipt with passing inherited regressions, actual React and DOM GoScript builds, the independent N5 oracle, N4 native/direct/React/DOM parity and seeded runs, a real HTTP smoke pass, stable source pins, and a byte-verified archive. Any failed stage must be recorded and return a nonzero process status.

The earlier accepted evidence identifier is `978eaea98831154f8152baa1a64f1d1356916596`. The known prior local-container archive corruption is preserved as a limitation and excluded from acceptance; this run does not rewrite or reconstruct it. A new attempt must independently verify its archive, external manifest, and delivery bytes.
