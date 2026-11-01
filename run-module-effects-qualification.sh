#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
USAGE="Usage:
  run-module-effects-qualification.sh --directory ROOT
  run-module-effects-qualification.sh --archive TAR --manifest MANIFEST
  run-module-effects-qualification.sh --fresh --source-commit SHA [--chromium PATH] [--output-root DIR]

Build and run the Go-only module-effects verifier. --fresh runs the existing
module-effects producer, then qualifies its archive with the native verifier."

fail() {
  local code="$1"
  shift
  printf 'run-module-effects-qualification.sh: %s\n%s\n' "$*" "$USAGE" >&2
  exit "$code"
}

resolve_command() {
  local explicit="$1"
  local name="$2"
  if [[ -n "$explicit" ]]; then
    [[ -x "$explicit" ]] || fail 127 "$name executable is not runnable: $explicit"
    printf '%s\n' "$explicit"
    return
  fi
  command -v "$name" || fail 127 "$name is required on PATH or through its GOBI_*_BIN override"
}

if [[ $# -eq 1 && "$1" == "--help" ]]; then
  printf '%s\n' "$USAGE"
  exit 0
fi

fresh=false
if [[ "${1:-}" == "--fresh" ]]; then
  fresh=true
  shift
fi

if [[ "$fresh" == false ]]; then
  [[ $# -gt 0 ]] || fail 2 "choose exactly one verification mode"
  GO_BIN="$(resolve_command "${GOBI_GO_BIN:-}" go)"
  GO_VERSION="$(GOTOOLCHAIN=local "$GO_BIN" version)"
  [[ "$GO_VERSION" == *"go1.24."* ]] || fail 1 "Go 1.24 is required, got: $GO_VERSION"

  BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/gobi-module-effects-qualify.XXXXXXXX")"
  trap 'rm -rf "$BUILD_ROOT"' EXIT
  export GOTOOLCHAIN=local
  export GOFLAGS="${GOFLAGS:+$GOFLAGS }-buildvcs=false"
  cd "$ROOT"
  "$GO_BIN" build -o "$BUILD_ROOT/module-effects-qualify" ./cmd/module-effects-qualify
  "$BUILD_ROOT/module-effects-qualify" "$@"
  exit $?
fi

source_commit=""
chromium=""
output_root=""
seen_source_commit=false
seen_chromium=false
seen_output_root=false
while [[ $# -gt 0 ]]; do
  name="$1"
  shift
  case "$name" in
    --source-commit)
      [[ "$seen_source_commit" == false ]] || fail 2 "--source-commit may only appear once"
      [[ $# -gt 0 && -n "$1" && "$1" != --* ]] || fail 2 "--source-commit requires a value"
      source_commit="$1"
      seen_source_commit=true
      shift
      ;;
    --chromium)
      [[ "$seen_chromium" == false ]] || fail 2 "--chromium may only appear once"
      [[ $# -gt 0 && -n "$1" && "$1" != --* ]] || fail 2 "--chromium requires a value"
      chromium="$1"
      seen_chromium=true
      shift
      ;;
    --output-root)
      [[ "$seen_output_root" == false ]] || fail 2 "--output-root may only appear once"
      [[ $# -gt 0 && -n "$1" && "$1" != --* ]] || fail 2 "--output-root requires a value"
      output_root="$1"
      seen_output_root=true
      shift
      ;;
    *)
      fail 2 "unknown --fresh argument: $name"
      ;;
  esac
done
[[ "$seen_source_commit" == true ]] || fail 2 "--fresh requires --source-commit"
[[ "$source_commit" =~ ^[0-9a-f]{40}$ ]] || fail 2 "--source-commit requires a 40-character lowercase Git commit ID"

GO_BIN="$(resolve_command "${GOBI_GO_BIN:-}" go)"
GO_VERSION="$(GOTOOLCHAIN=local "$GO_BIN" version)"
[[ "$GO_VERSION" == *"go1.24."* ]] || fail 1 "Go 1.24 is required, got: $GO_VERSION"
BUILD_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/gobi-module-effects-qualify.XXXXXXXX")"
trap 'rm -rf "$BUILD_ROOT"' EXIT
export GOTOOLCHAIN=local
export GOFLAGS="${GOFLAGS:+$GOFLAGS }-buildvcs=false"
cd "$ROOT"
"$GO_BIN" build -o "$BUILD_ROOT/module-effects-qualify" ./cmd/module-effects-qualify

if [[ -z "$output_root" ]]; then
  mkdir -p "$ROOT/module-effects-qualification/output"
  output_root="$(mktemp -d "$ROOT/module-effects-qualification/output/fresh.XXXXXXXX")"
elif [[ "$output_root" != /* ]]; then
  output_root="$ROOT/$output_root"
fi
mkdir -p "$output_root"
[[ -d "$output_root" && ! -L "$output_root" ]] || fail 2 "--output-root must name a real directory"
if [[ -n "$(find "$output_root" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  fail 2 "--output-root must be empty so this fresh run has one unambiguous attempt"
fi

producer_args=(--source-commit "$source_commit" --output-root "$output_root")
if [[ -n "$chromium" ]]; then
  producer_args+=(--chromium "$chromium")
fi
if ! bash "$ROOT/run-module-effects.sh" "${producer_args[@]}" >"$BUILD_ROOT/producer.stdout"; then
  cat "$BUILD_ROOT/producer.stdout" >&2
  fail 1 "module-effects producer failed"
fi
cat "$BUILD_ROOT/producer.stdout" >&2

mapfile -d '' attempts < <(find "$output_root" -mindepth 1 -maxdepth 1 -type d -name 'attempt-*' -print0)
[[ "${#attempts[@]}" -eq 1 ]] || fail 1 "fresh producer must create exactly one attempt directory"
attempt="${attempts[0]}"
attempt_id="$(basename "$attempt")"
archive="$output_root/$attempt_id.tar.gz"
manifest="$output_root/$attempt_id.manifest.json"
[[ -f "$archive" && -f "$manifest" ]] || fail 1 "fresh producer did not leave the archive and manifest beside its attempt"
report_path="$BUILD_ROOT/qualification-report.json"
if ! "$BUILD_ROOT/module-effects-qualify" --archive "$archive" --manifest "$manifest" >"$report_path" 2>"$output_root/qualification-archive.stderr.txt"; then
  cat "$output_root/qualification-archive.stderr.txt" >&2
  fail 1 "native archive qualification failed"
fi

go_test_log="$output_root/qualification-go-tests.log"
go_test_packages=(./cmd/module-effects-qualify ./effectqualification ./effectsreplay ./modulequalification)
if ! GOBI_EFFECTS_QUALIFICATION_INPUT="$attempt" GOBI_EFFECTS_EXPECTED_SOURCE_COMMIT="$source_commit" \
  "$GO_BIN" test -v -count=1 "${go_test_packages[@]}" >"$go_test_log" 2>&1; then
  cat "$go_test_log" >&2
  fail 1 "fixture-backed native Go test suite failed"
fi
cp "$report_path" "$output_root/qualification-report.json"
cat "$report_path"
