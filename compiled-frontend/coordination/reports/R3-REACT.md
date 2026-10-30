# R3-REACT

**Outcome: renderer repaired; browser conformance is pending N6.** The React adapter now admits the observed GoScript `spareZero` backing metadata by descriptor shape, validates the full GoSlice backing layout without reading through array properties, and copies only the visible window into a new dense array. The spare-capacity factory is never called. Ordinary arrays remain strict.

## Changes

- GoSlice wrappers retain the exact five own fields and require the own `target` descriptor value to be `undefined`.
- A GoSlice backing may have at most one own non-global symbol with description `goscript.spareZero`. Its descriptor must be an enumerable, writable, configurable data descriptor whose value is a function. The function is treated as metadata and is never invoked. This is structural ABI admission; the renderer does not authenticate the private symbol's identity.
- Backing-array keys and descriptors are inspected without ordinary property reads. Index keys must be canonical in-range array indexes with own enumerable/writable/configurable data descriptors. The visible `[offset, offset + length)` window must be dense. Missing own slots are allowed only in the unused capacity interval `[offset + length, offset + capacity)`, and only when the observed spare marker is present. Holes elsewhere, malformed metadata, unknown symbols, accessors, and invalid bounds reject.
- The renderer copies descriptor values from the visible window into a fresh dense array before lowering. It does not call `.slice()` on the caller-owned backing. Native arrays still use the strict dense-array snapshot path and reject all symbols and holes.

## Verification

The Node RED pass was run before the implementation: 18 tests passed and four new regressions failed. The expected failures were the accepted-marker visible-window case, malformed marker descriptor, visible-window hole, and sparse spare capacity without metadata. The Node GREEN pass then passed all 22 renderer tests. The combined renderer and bindings suite passes 25/25 on Node `v22.23.4`.

The direct compiled-module check used the current N1 outputs under `/tmp/gondola-compiled-atomic/apps/` and called the actual emitted `Init`, `Update`, and `View` role functions. Initial views for counter, form, list, and effect all passed `lowerView`. The list module also passed five consecutive emitted `Update({Name:"add",Arg:""})` then `View`/`lowerView` cycles, with row counts 1 through 5. Module SHA-256 values were counter `e7fd6d515cb1c90a28d90db51b85ee4d06986ed5999ee2b7d15b64fba2acfeda`, form `a3bbf244004e10ae1b82a895dc717247731fbddad8d57dd1fbffc36c91ac6a4a`, list `54b09d871576d33237c0bda34da1388b9ff9fa393ddafd4f26a71ca55cd75fd6`, and effect `7736585c8dea675a146861a840dbc7fec6afd3f0e4e70f2ea677dfbf757e038a`.

The Go emitter suite also passes on Go 1.27.3: `GOTOOLCHAIN=go1.27.3 /tmp/gondola-go/bin/go test -count=1 -v ./emit` (4 passed, 0 failed). Full test output is preserved under `frontend/react/`.

## Limits

The direct module check validates React lowering without mounting React into a browser. N6 owns the fresh-build, four-app browser run and post-unmount DOM assertions. The final browser gate is pending; no browser pass is claimed here.

## SHA-256

- `frontend/react/renderer.mjs`: `12e50f96ec61975551d4f63242a512912aa986727170186ccb83ad66a9902da0`
- `frontend/react/renderer.test.mjs`: `0d2c1483c19ff95cc320dab64aeb2f4ec795e0b14e4128b45fe9aa0dafc2e99f`
- RED Node log: `cae46e5086c49176972a0e0be82397b53dff459e5db2780a239e9110a7c0a0ee`
- GREEN renderer log: `c84c1a3431921d76f80baff039b77f0dd391fd147c52165cfd7155db11e0b43d`
- Combined Node log: `b7fb4bdaf005e06252ab02bcc50696038b4eca2a2cef24637ae1074857fd6e00`
- Go emitter log: `c410e1c5085fe292045730706603e23eb4222f0236c1a2ffc4d72cfa46a6b50b`
