#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/../../../../.." && pwd)"
ci_root="$repo_root/compiled-frontend/ci/2026-10-30"
artifacts="$ci_root/provider/repaired-extracted/compiled-frontend/artifacts"
raw="$artifacts"
out="$ci_root/audits/CI2-BROWSER"
node_bin=/tmp/gondola-node22/node_modules/node/bin/node
checker="$repo_root/compiled-frontend/conformance/check.mjs"
run_one() {
  local profile=$1 app_ir=$2 fixture=$3
  "$node_bin" "$checker" \
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
run_one counter "$artifacts/compiled/apps/counter-b05e9eb0e4e6/app-ir.json" "$repo_root/compiled-frontend/fixtures/counter.json"
run_one form "$artifacts/compiled/apps/form-a3fe6b48b000/app-ir.json" "$repo_root/compiled-frontend/fixtures/form.json"
run_one list "$artifacts/compiled/apps/list-f8359aa2866d/app-ir.json" "$repo_root/compiled-frontend/fixtures/list.json"
run_one effect "$artifacts/compiled/apps/effect-ff8449e8f5b2/app-ir.json" "$repo_root/compiled-frontend/fixtures/effect.json"
run_one list-growth "$artifacts/compiled/apps/list-f8359aa2866d/app-ir.json" "$repo_root/compiled-frontend/conformance/fixtures/list-growth.json"
