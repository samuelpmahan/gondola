# XR-HOST: independent review of E-HOST

**Decision: accepted.** The publications host facade is a thin, package-agnostic reuse of the existing compiled-children host policy and shared runtime. It does not implement publication state or a JavaScript publication reducer.

## Review findings

`compiled-publications/runtime/runtime.mjs` directly aliases the frozen request/cancel capability list, effect validator, and correlation driver from `compiled-children/runtime/runtime.mjs`. Its mount export delegates the caller's options to `mountCompiledChildrenApp`, which forwards `module`, `componentId`, `appId`, `encoder`, renderer callbacks, the existing validator, and host effect capabilities to the shared frontend runtime. Neither facade hardcodes the publications package or component ID.

The host boundary preserves the exact `fixture.request/lookup/token/complete` and `lifecycle.cancel/cancel/token/empty` tuples. The reused validator checks exact object fields, string types, token grammar, canonical positive IDs within the safe-integer ceiling, and rejects unsupported kinds. The mounted mock component retains `numeric.safe-integer` and `numeric.float64` alongside view/binding/effect capabilities; the host adds only its two existing effect capabilities.

The five focused tests cover export identity and frozen capabilities, accepted and rejected effect tuples, publication messages passed to the Update boundary, compatible renderer replacement with pending request correlation, stale callback suppression, rejected candidate preservation, cancellation, and unmount retirement. The mock `Update` is test scaffolding only; its `publication.deliver` branch is a no-op, with no queue or publication acceptance logic. This review therefore validates the host boundary, not a real compiler-generated Go module or browser mount; N2/N4 own that integration evidence.

I also probed a terminal-newline token because the shared validator uses an anchored regular expression. The pinned Node 22 runtime rejected `parent:g1:r1` followed by LF with `TypeError`, consistent with the finite canonical-token policy.

## Verification

The targeted Node 22.23.4 suite passed **5/5** tests:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test compiled-publications/runtime/runtime.test.mjs
```

No production source, Git state, or native scheduler state was changed in this review.

## Pinned sources

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `compiled-publications/runtime/runtime.mjs` | 800 | `f496854ad89e8f2ee2b2fa6dc91daeaf81af7218427bd160b8b868f5e6319da0` |
| `compiled-publications/runtime/runtime.test.mjs` | 11,801 | `d9670376ec28335e2a8f198530c36799759b23b53c3787ac5b6c99b1fd679214` |
| `compiled-children/runtime/runtime.mjs` | 12,303 | `7ed7bfa6f567658a0fc283cfce4e76c4dd28fa2646eeea2d8519b2bf4746777b` |
| `compiled-frontend/frontend/runtime/runtime.mjs` | 62,312 | `52c44ead9f79f75ef7b211168d4cdb1260544846e8735f67cad93ff470240c5f` |
| `compiled-publications/CONTRACT.md` | 5,361 | `2ad4be1aeb1da3f3e6905bb01a7b3ef0eed22ecf60df7307aecbb997a0a2e296` |
| `compiled-publications/PLAN.md` | 1,942 | `ad01f8cfbf9e3dfa8157465591c6c85d35daef3682712ac3b872520a4df6f4b0` |
| `compiled-publications/coordination/reports/E-HOST.md` | 2,667 | `284657c558343eceab5821966298dd5caf271a3ca4e38c18d1d10b63da448aef` |
| `compiled-publications/coordination/receipts/E-HOST.json` | 4,839 | `e2958dad7637f16baef5fb70ea244632a1fc675b83b0a7cb57f2a06e6f7cc030` |

## Limits

This is a bounded review of the facade and its mock-backed host tests. It does not claim the generated Go app, real renderer, browser, or full pipeline acceptance.
