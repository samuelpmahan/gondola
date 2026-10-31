# E-ORACLE: independent capability contract oracle

## Change

Added `oracle/expectations.json` as the serializable, hand-authored capability contract and `oracle/literal-oracle.test.mjs` as its Node-only runtime oracle. The contract keeps host effect support (`effect.request-reply`, `effect.cancel`) separate from renderer support (`view.node`, `binding.value`, `binding.checked`). The test uses a synthetic AppIR module/runtime double; it does not claim compiled GoScript or actual React/DOM evidence.

The admission matrix checks that missing host support, missing required view/binding support, and a profile-less renderer for an `effect.cancel` component reject before Init or renderer update. It also checks the legacy implicit host and renderer path for a component without `effect.cancel`. Host and renderer declarations reject unknown, malformed, sparse, duplicate, and accessor entries without evaluating accessor elements or profile getters. A renderer cannot satisfy an effect requirement by listing `effect.cancel` as a view capability. A host-options accessor is also rejected without invocation.

Cancellation checks exercise both sides of the contract: a `lifecycle.cancel` emitted without the component capability is rejected before the optional policy and host; the explicitly declared component/host pair reaches the policy and effect host. The swap probe compares state, view, and DOM against fixed literals while a request is pending. An incompatible `binding.checked` profile is rejected before candidate rendering or old unmount; the pending correlation and old callback remain live. A compatible profile commits with the same snapshot, retires the old callback, and preserves the pending completion through delivery.

## Evidence

- Node `v22.23.4`: **8 passed, 0 failed**. Captured with:

  ```sh
  set -o pipefail
  /tmp/gondola-node22/node_modules/node/bin/node --test compiled-capabilities/oracle/literal-oracle.test.mjs 2>&1 | tee compiled-capabilities/oracle/node22-test.log
  ```

  Raw TAP, including the environment's `UNDICI-EHPA` experimental warning, is saved in `oracle/node22-test.log`.
- Node `--check` passed for `oracle/literal-oracle.test.mjs`.
- `oracle/expectations.json` parsed successfully.
- SHA-256: expectations `bce92447403c8afe81d23aedc67d4c6751e8c77a5bec18ecce9cc0df262855a4`; test `6ff34cd37ae9cbc7e8e63eb31972fb009793493551122c497e8e0c98d51bbe57`; TAP `f1e2e27b81dcb6bfccbbdee3cf3bd3e1fbdabad2373573d003adefae2756df1a`.

No pre-implementation RED run was captured. N3's actual compiled React/DOM integration remains separate and pending; this receipt records only the owned synthetic oracle and its literal checks.

## Scope

Modified only `compiled-capabilities/oracle/**` and the assigned `compiled-capabilities/coordination/reports/E-ORACLE.md` and `receipts/E-ORACLE.json`. No commit, merge, or deploy was performed.
