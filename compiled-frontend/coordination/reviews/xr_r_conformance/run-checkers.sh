#!/usr/bin/env bash
set -euo pipefail
node_bin=/tmp/gondola-node22/node_modules/node/bin/node
raw=conformance/raw/r-conformance-final
out=coordination/reviews/xr_r_conformance
run_one() {
  local profile=$1 app_ir=$2 fixture=$3
  "$node_bin" conformance/check.mjs \
    --app-ir "$app_ir" \
    --fixture "$fixture" \
    --native "$raw/$profile.native.json" \
    --direct "$raw/$profile.direct.json" \
    --browser "$raw/$profile.browser.json" \
    --output "$out/$profile.check.json" \
    > "$out/$profile-check.stdout.log" \
    2> "$out/$profile-check.stderr.log"
  cmp "$out/$profile.check.json" "$raw/$profile.check.json"
}
run_one counter artifacts/compiled/apps/counter-b05e9eb0e4e6/app-ir.json fixtures/counter.json
run_one form artifacts/compiled/apps/form-a3fe6b48b000/app-ir.json fixtures/form.json
run_one list artifacts/compiled/apps/list-f8359aa2866d/app-ir.json fixtures/list.json
run_one effect artifacts/compiled/apps/effect-ff8449e8f5b2/app-ir.json fixtures/effect.json
run_one list-growth artifacts/compiled/apps/list-f8359aa2866d/app-ir.json conformance/fixtures/list-growth.json
