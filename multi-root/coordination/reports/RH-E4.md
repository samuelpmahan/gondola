# RH-E4 — bridge error-frame handling

**Job:** RH-E4
**Worker:** W3
**Outcome:** `accepted`

## Repair

Added `createMultiRootManagerAdapter()` in `multi-root/runtime.mjs`. It preserves
normal manager return values and method `this` binding, but converts the strict
Go bridge's exact one-key `{ error: string }` result into a contextual throw.
The adapter covers every required method: `create`, `list`, `snapshot`,
`dispatch`, `effects`, `complete`, `audit`, and `dispose`. It is idempotent so
the host and its session runtime can both establish the boundary without
wrapping an already adapted bridge again.

`createMultiRootHost()` now adapts the manager at construction, so its direct
`create()` and `dispose()` calls are protected. `createSessionRuntime()` adapts
its manager too, so snapshots, dispatches, replies, effects, and audits cannot
mistake an error frame for state or an empty result. Existing fake-manager
return values continue through unchanged.

Targeted tests cover error frames for all manager methods; plain fake values
and `this` binding; raw create and snapshot failures during mount; effects
errors during settled work; and disposal failure while a sibling remains
mounted. The actual Go/WASM bridge was also exercised through the host with an
invalid dispatch path, confirming that its returned frame reaches callers as a
thrown error with the original detail in its cause chain.

## Verification

Commands run:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --test multi-root/host.test.mjs multi-root/runtime.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node --test multi-root/*.test.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check multi-root/runtime.mjs
/tmp/gondola-node22/node_modules/node/bin/node --check multi-root/host.mjs
```

The focused host/runtime tests passed 19/19. The complete multi-root Node suite
passed 29/29. Both changed modules passed syntax checks.

The actual WASM probe used the existing `multi-root/build/multi-root.wasm` and
`multi-root/build/wasm_exec.js` artifacts. It initialized Go, created a raw
`gobiMultiRoot` bridge, mounted a host directly over that bridge, and asserted
that an invalid `dispatch` throws with the bridge error preserved in the cause
chain. It then unmounted and disposed the session. The probe passed.

The inline probe command was:

```sh
/tmp/gondola-node22/node_modules/node/bin/node --input-type=module <<'EOF'
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createMultiRootHost } from "./multi-root/host.mjs";
await import(pathToFileURL("/workspace/scratch/39a56936f173/gondola/multi-root/build/wasm_exec.js"));
const contains = (error, phrase) => Boolean(error && ((error.message ?? "").includes(phrase) ||
  contains(error.cause, phrase) || error.errors?.some((nested) => contains(nested, phrase))));
const go = new globalThis.Go();
const bytes = await readFile("./multi-root/build/multi-root.wasm");
const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
void go.run(instance);
for (let i = 0; i < 200 && !globalThis.gobiMultiRoot; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(globalThis.gobiMultiRoot);
const facades = [];
const host = createMultiRootHost({
  manager: globalThis.gobiMultiRoot,
  descriptors: { fake(_root, facade) {
    facades.push(facade);
    let current = facade.init();
    return { update(next) { current = next; }, snapshot() { return current; },
      domSnapshot() { return { html: "", disabled: [] }; }, click() {},
      focusState() { return null; }, restoreFocus() {}, unmount() {} };
  } },
  transportFactory: () => ({ start() {}, cancel() {} }),
});
const root = { replaceChildren() {} };
const { sessionID } = host.mount(root, "fake");
assert.throws(() => facades[0].dispatch({ Path: "999", Event: "click", Value: "", Key: "missing" }),
  (error) => contains(error, "gobiMultiRoot.dispatch") && contains(error, "out of range"));
assert.equal(host.session(root), sessionID);
host.unmount(root);
process.stdout.write("raw Go WASM host dispatch error propagation passed\n");
process.exit(0);
EOF
```

## Limits

The full inherited `run-multi-root.sh`, browser smoke, seeded replay, and CI
were not run for this repair. The actual-WASM host probe used pre-existing build
artifacts; Go bridge source was unchanged. The method-by-method returned-frame
matrix is covered by strict unit fakes, while the actual WASM end-to-end error
probe covers invalid `dispatch` specifically.
