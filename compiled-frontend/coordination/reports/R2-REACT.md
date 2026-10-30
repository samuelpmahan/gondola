# R2-REACT

**Outcome: repaired; browser integration is pending N6.** Renderer admission now uses own-property descriptors as the source of truth. Each accepted metadata object and dense native array is copied into fresh trusted storage before later reads. GoScript slice wrappers require exactly the observed five own fields, including `target` whose descriptor value must be `undefined`; the slice window is copied from a descriptor-snapshotted backing array.

The original Proxy repro was preserved before the repair: it exited 0 and printed `{"accepted":true}` despite a `target` descriptor containing `{}`. After the repair, the same command exits 1 with `Node.On has invalid GoScript slice bounds or backing`. Its `get` trap is no longer consulted for slice fields. Focused regressions also cover proxied array length/index reads, accessors that must not execute, own View/Node/handler descriptors, inherited View aliases, and a nonzero-offset GoScript slice window.

The adapter copies and validates the nested tree, attributes, styles, handlers, and bindings before React lowering. This prevents a raw Proxy value from being read again after descriptor validation. Copies use null-prototype records, so inherited aliases and `__proto__` assignment behavior cannot affect the accepted shape. The closed schema checks remain unchanged.

## Verification

- Red probe: `/tmp/gondola-node22/node_modules/node/bin/node --test frontend/react/renderer.test.mjs frontend/react/bindings.test.mjs` — exit 1, 15 passed and 4 failed before implementation; retained at `frontend/react/review-evidence/r2-node-red.log`.
- Green Node 22: same command — 20 passed, 0 failed with Node `v22.23.4`; log at `frontend/react/review-evidence/r2-node-green.log`.
- Go 1.27.3: `GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 -v ./emit` — 4 passed, 0 failed; log at `frontend/react/review-evidence/r2-go-emit.log`.
- The initial Go attempt with `GOTOOLCHAIN=local` failed because that setting selected Go 1.24.0 despite the wrapper's default `go version` reporting 1.27.0. Re-running with the explicit Go 1.27.3 toolchain passed.
- The preserved proxy repro command is `/tmp/gondola-node22/node_modules/node/bin/node coordination/reviews/xr_r_react/proxy-slice-repro.mjs`. Its pre-repair output and post-repair output, stderr, and exit status are retained under `frontend/react/review-evidence/`.

## Limits

No browser mount or four-app build was run in this lane. N6 owns browser confirmation, including actual post-unmount DOM state. The Go tests only verify the emitter package; they do not exercise React rendering.

## SHA-256

- `frontend/react/renderer.mjs`: `9f10b75d194aab53cbe504321e8f6df26592c20b6a7123d7f267ba2e68868e5a`
- `frontend/react/renderer.test.mjs`: `51b9dd07d3ded887adde821f89c0485ad1f244726a26fea4f0a7d8dd51f67257`
- Red Node log: `7ece21bd02f5f974363a6b859c18a8306451f9557a44185088c5b0bd8f63b076`
- Green Node log: `4a5d188bd31ad71a16f64e50a5d0b9b9f0a7ada199921ffb55a4ff53ca80e505`
- Go emitter log: `708c56c7a2bd11f88368b08692f76040bb11ccabcf3735c2a071a6aa1bac59f7`
- Pre-repair repro stdout: `11a49f853eb8befe94fef278d487125cd20930b9e41c4c0934394443e7f00878`
- Post-repair repro stdout (empty): `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- Post-repair repro stderr: `a93d5422375380b34365c5b1f4b28dc1a6d3aedf6dfd833d3ff26231423def08`
