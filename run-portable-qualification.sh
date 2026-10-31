#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
ARCHIVE="$ROOT/portable-qualification/testdata/runtime-complete.tar.gz"
MANIFEST="$ROOT/portable-qualification/testdata/runtime-complete.manifest.json"
CONTROL_ARCHIVE="$ROOT/portable-qualification/testdata/runtime.tar.gz"
CONTROL_MANIFEST="$ROOT/portable-qualification/testdata/runtime.manifest.json"
ARTIFACT_SOURCE_COMMIT="77f7ce36439f1ae457a397269ea5a8c6d2db1cb2"
EXPECTED_ARCHIVE_SHA256="5d895c53ef9fbbeeb6a88cbb71fee4b352f9ebc689605d431efca61b8fa78cc1"
EXPECTED_MANIFEST_SHA256="7645cb803edb5cbb053b43a5a02c04f124e3b60553f7057a6a92777f3d211dcd"
EXPECTED_CONTROL_ARCHIVE_SHA256="61bb3df8c16323be5ef856edf834ac73ac69fde462224dd1ac8b35ef93ed97ca"
EXPECTED_CONTROL_MANIFEST_SHA256="8adc8f345a5b66a6ea1fbb92fe9bd510d1682f4c37d4c76e8a0660e06ce30cb1"

if [[ -n "${GOBI_PORTABLE_OUTPUT_DIR:-}" ]]; then
  OUTPUT_DIR="$GOBI_PORTABLE_OUTPUT_DIR"
  [[ "$OUTPUT_DIR" = /* ]] || OUTPUT_DIR="$ROOT/$OUTPUT_DIR"
  OUTPUT_PARENT="$(dirname "$OUTPUT_DIR")"
  mkdir -p -- "$OUTPUT_PARENT"
  mkdir -- "$OUTPUT_DIR"
else
  OUTPUT_PARENT="${TMPDIR:-/tmp}/gobi-portable-qualification"
  mkdir -p -- "$OUTPUT_PARENT"
  OUTPUT_DIR="$(mktemp -d "$OUTPUT_PARENT/attempt-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
fi

ATTEMPT="$(basename "$OUTPUT_DIR")"
STAGE="preflight"
GO_TEST_STATUS="not_run"
VERIFICATION_STATUS="not_run"
ARCHIVE_SHA256="unavailable"
MANIFEST_SHA256="unavailable"
CONTROL_ARCHIVE_SHA256="unavailable"
CONTROL_MANIFEST_SHA256="unavailable"
GO_VERSION="unavailable"
VERIFICATION_SHA256="unavailable"
CONTROL_STATUS="not_run"
CONTROL_EXIT_CODE="not_run"
CONTROL_STDOUT_BYTES="unavailable"
SOURCE_PINS_BEFORE_SHA256="unavailable"
SOURCE_PINS_AFTER_SHA256="unavailable"
REPOSITORY_COMMIT="${GOBI_PORTABLE_REPOSITORY_COMMIT:-${GITHUB_SHA:-unknown}}"
FAILURE_STAGE="none"
SOURCE_PIN_COUNT=0

if [[ "$REPOSITORY_COMMIT" == "unknown" ]] && command -v git >/dev/null 2>&1; then
  REPOSITORY_COMMIT="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || printf 'unknown')"
fi
if [[ ! "$REPOSITORY_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  REPOSITORY_COMMIT="unknown"
fi

write_summary() {
  local exit_code="$1"
  if (( exit_code != 0 )); then
    FAILURE_STAGE="$STAGE"
  fi
  cat > "$OUTPUT_DIR/run-summary.json" <<EOF
{
  "schema": "gobi.portable-qualification-run/v1",
  "attempt": "$ATTEMPT",
  "verifierGitHead": "$REPOSITORY_COMMIT",
  "archiveSourceCommitExpected": "$ARTIFACT_SOURCE_COMMIT",
  "expectedMembers": 405,
  "expectedCases": 13,
  "goVersion": "$GO_VERSION",
  "bashVersion": "$BASH_VERSION",
  "archiveSHA256": "$ARCHIVE_SHA256",
  "manifestSHA256": "$MANIFEST_SHA256",
  "rejectedControlArchiveSHA256": "$CONTROL_ARCHIVE_SHA256",
  "rejectedControlManifestSHA256": "$CONTROL_MANIFEST_SHA256",
  "rejectedControlStatus": "$CONTROL_STATUS",
  "rejectedControlExitCode": "$CONTROL_EXIT_CODE",
  "rejectedControlStdoutBytes": "$CONTROL_STDOUT_BYTES",
  "verificationSHA256": "$VERIFICATION_SHA256",
  "sourcePinCount": $SOURCE_PIN_COUNT,
  "sourcePinsBeforeSHA256": "$SOURCE_PINS_BEFORE_SHA256",
  "sourcePinsAfterSHA256": "$SOURCE_PINS_AFTER_SHA256",
  "goTestStatus": "$GO_TEST_STATUS",
  "verificationStatus": "$VERIFICATION_STATUS",
  "status": "$([[ "$exit_code" == 0 ]] && printf 'passed' || printf 'failed')",
  "exitCode": $exit_code,
  "failureStage": "$FAILURE_STAGE"
}
EOF
}

snapshot_source_pins() {
  local destination="$1"
  {
    find backendqualification qualificationarchive cmd/verify-qualification -type f -name '*.go' -print0
    printf '%s\0' \
      go.mod \
      portable-qualification/README.md \
      portable-qualification/THREATS.md \
      portable-qualification/testdata/runtime.manifest.json \
      portable-qualification/testdata/runtime.tar.gz \
      portable-qualification/testdata/runtime-complete.manifest.json \
      portable-qualification/testdata/runtime-complete.tar.gz \
      backend-qualification/run.mjs \
      backend-qualification/archive-source-inventory.mjs \
      backend-qualification/archive-source-inventory.test.mjs \
      run-portable-qualification.sh \
      .github/workflows/gobi-portable-qualification.yml
  } | sort -z | xargs -0 sha256sum > "$destination"
}

finish() {
  local exit_code="$?"
  trap - EXIT
  write_summary "$exit_code" || true
  printf 'Portable qualification attempt: %s\n' "$OUTPUT_DIR"
  exit "$exit_code"
}
trap finish EXIT

if [[ -n "${GOBI_GO_BIN:-}" ]]; then
  GO_BIN="$GOBI_GO_BIN"
elif [[ -x /tmp/gondola-go/go/bin/go ]]; then
  GO_BIN=/tmp/gondola-go/go/bin/go
else
  GO_BIN="$(command -v go || true)"
fi
if [[ -z "$GO_BIN" || ! -x "$GO_BIN" ]]; then
  echo "Go 1.24 executable not found; set GOBI_GO_BIN or add go to PATH" >&2
  exit 127
fi

GOTOOLCHAIN=local
GOFLAGS="${GOFLAGS:+$GOFLAGS }-buildvcs=false"
export GOTOOLCHAIN GOFLAGS
GO_VERSION="$("$GO_BIN" version)"
[[ "$GO_VERSION" == *"go1.24."* ]] || {
  echo "Go 1.24 is required, got: $GO_VERSION" >&2
  exit 1
}

{
  printf 'GOTOOLCHAIN=%s\nGOFLAGS=%s\n' "$GOTOOLCHAIN" "$GOFLAGS"
  printf 'Go version: %s\n' "$GO_VERSION"
  printf 'Bash version: %s\nPlatform: %s\n' "$BASH_VERSION" "$(uname -srm)"
  printf 'Archive source commit: %s\n' "$ARTIFACT_SOURCE_COMMIT"
  printf 'Positive archive: %s\nPositive manifest: %s\n' "$ARCHIVE" "$MANIFEST"
  printf 'Rejection control archive: %s\nRejection control manifest: %s\n' "$CONTROL_ARCHIVE" "$CONTROL_MANIFEST"
  printf 'Command: '
  printf '%q ' sha256sum -- "$ARCHIVE"
  printf '\nCommand: '
  printf '%q ' sha256sum -- "$MANIFEST"
  printf '\nCommand: '
  printf '%q ' sha256sum -- "$CONTROL_ARCHIVE"
  printf '\nCommand: '
  printf '%q ' sha256sum -- "$CONTROL_MANIFEST"
  printf '\nCommand: '
  printf '%q ' "$GO_BIN" version
  printf '\nCommand: '
  printf '%q ' find backendqualification qualificationarchive cmd/verify-qualification -type f -name '*.go' -print0
  printf '| %q ' sort -z
  printf '| %q ' xargs -0 sha256sum
  printf '\nCommand: '
  printf '%q ' "$GO_BIN" test ./qualificationarchive ./cmd/verify-qualification
  printf '\nCommand: '
  printf '%q ' "$GO_BIN" run ./cmd/verify-qualification --archive "$ARCHIVE" --manifest "$MANIFEST" --source-commit "$ARTIFACT_SOURCE_COMMIT" --output "$OUTPUT_DIR/verification.json"
  printf '\nExpected-rejection command: '
  printf '%q ' "$GO_BIN" run ./cmd/verify-qualification --archive "$CONTROL_ARCHIVE" --manifest "$CONTROL_MANIFEST" --source-commit "$ARTIFACT_SOURCE_COMMIT" --output "$OUTPUT_DIR/rejected-control.json"
  printf '\n'
} > "$OUTPUT_DIR/commands.txt"

STAGE="fixture-integrity"
[[ -f "$ARCHIVE" && ! -L "$ARCHIVE" ]] || {
  echo "qualification archive is missing or is not a regular file" >&2
  exit 1
}
[[ -f "$MANIFEST" && ! -L "$MANIFEST" ]] || {
  echo "qualification manifest is missing or is not a regular file" >&2
  exit 1
}
[[ -f "$CONTROL_ARCHIVE" && ! -L "$CONTROL_ARCHIVE" ]] || {
  echo "qualification rejection-control archive is missing or is not a regular file" >&2
  exit 1
}
[[ -f "$CONTROL_MANIFEST" && ! -L "$CONTROL_MANIFEST" ]] || {
  echo "qualification rejection-control manifest is missing or is not a regular file" >&2
  exit 1
}
ARCHIVE_SHA256="$(sha256sum -- "$ARCHIVE" | awk '{print $1}')"
MANIFEST_SHA256="$(sha256sum -- "$MANIFEST" | awk '{print $1}')"
CONTROL_ARCHIVE_SHA256="$(sha256sum -- "$CONTROL_ARCHIVE" | awk '{print $1}')"
CONTROL_MANIFEST_SHA256="$(sha256sum -- "$CONTROL_MANIFEST" | awk '{print $1}')"
[[ "$ARCHIVE_SHA256" == "$EXPECTED_ARCHIVE_SHA256" ]] || {
  echo "archive fixture SHA-256 differs from the published baseline" >&2
  exit 1
}
[[ "$MANIFEST_SHA256" == "$EXPECTED_MANIFEST_SHA256" ]] || {
  echo "complete manifest SHA-256 differs from the pinned fixture" >&2
  exit 1
}
[[ "$CONTROL_ARCHIVE_SHA256" == "$EXPECTED_CONTROL_ARCHIVE_SHA256" ]] || {
  echo "397-member rejection-control archive SHA-256 differs from the pinned fixture" >&2
  exit 1
}
[[ "$CONTROL_MANIFEST_SHA256" == "$EXPECTED_CONTROL_MANIFEST_SHA256" ]] || {
  echo "397-member rejection-control manifest SHA-256 differs from the pinned fixture" >&2
  exit 1
}
{
  printf '%s  %s\n' "$ARCHIVE_SHA256" "$ARCHIVE"
  printf '%s  %s\n' "$MANIFEST_SHA256" "$MANIFEST"
  printf '%s  %s\n' "$CONTROL_ARCHIVE_SHA256" "$CONTROL_ARCHIVE"
  printf '%s  %s\n' "$CONTROL_MANIFEST_SHA256" "$CONTROL_MANIFEST"
} > "$OUTPUT_DIR/input-hashes.txt"

STAGE="source-snapshot-before"
snapshot_source_pins "$OUTPUT_DIR/source-pins-before.sha256"
SOURCE_PIN_COUNT="$(wc -l < "$OUTPUT_DIR/source-pins-before.sha256" | tr -d '[:space:]')"
SOURCE_PINS_BEFORE_SHA256="$(sha256sum -- "$OUTPUT_DIR/source-pins-before.sha256" | awk '{print $1}')"

STAGE="go-tests"
if "$GO_BIN" test ./qualificationarchive ./cmd/verify-qualification > "$OUTPUT_DIR/go-test.stdout.log" 2> "$OUTPUT_DIR/go-test.stderr.log"; then
  GO_TEST_STATUS="passed"
else
  GO_TEST_STATUS="failed"
  cat "$OUTPUT_DIR/go-test.stdout.log" >&2 || true
  cat "$OUTPUT_DIR/go-test.stderr.log" >&2 || true
  exit 1
fi

STAGE="archive-verification"
if "$GO_BIN" run ./cmd/verify-qualification \
  --archive "$ARCHIVE" \
  --manifest "$MANIFEST" \
  --source-commit "$ARTIFACT_SOURCE_COMMIT" \
  --output "$OUTPUT_DIR/verification.json" \
  > "$OUTPUT_DIR/verification.stdout.json" 2> "$OUTPUT_DIR/verification.stderr.log"; then
  VERIFICATION_STATUS="command_succeeded"
else
  VERIFICATION_STATUS="command_failed"
  cat "$OUTPUT_DIR/verification.stderr.log" >&2 || true
  exit 1
fi

STAGE="receipt-validation"
[[ -s "$OUTPUT_DIR/verification.json" && -s "$OUTPUT_DIR/verification.stdout.json" ]] || {
  echo "verifier returned an empty receipt" >&2
  exit 1
}
cmp -s "$OUTPUT_DIR/verification.stdout.json" "$OUTPUT_DIR/verification.json" || {
  echo "stdout receipt differs from the exclusive output receipt" >&2
  exit 1
}
VERIFICATION_SHA256="$(sha256sum -- "$OUTPUT_DIR/verification.json" | awk '{print $1}')"
for expression in \
  '"schema"[[:space:]]*:[[:space:]]*"gobi.portable-qualification-verification/v1"' \
  '"sourceCommit"[[:space:]]*:[[:space:]]*"'"$ARTIFACT_SOURCE_COMMIT"'"' \
  '"qualified"[[:space:]]*:[[:space:]]*true' \
  '"archiveSHA256"[[:space:]]*:[[:space:]]*"'"$ARCHIVE_SHA256"'"' \
  '"manifestSHA256"[[:space:]]*:[[:space:]]*"'"$MANIFEST_SHA256"'"' \
  '"members"[[:space:]]*:[[:space:]]*405([,}])' \
  '"cases"[[:space:]]*:[[:space:]]*\['; do
  grep -Eq -- "$expression" "$OUTPUT_DIR/verification.json" || {
    echo "verifier receipt is missing expected value matching: $expression" >&2
    exit 1
  }
done
case_count="$(grep -Ec '"id"[[:space:]]*:' "$OUTPUT_DIR/verification.json" || true)"
[[ "$case_count" == 13 ]] || {
  echo "verifier receipt contains $case_count case results; expected 13" >&2
  exit 1
}
VERIFICATION_STATUS="passed"

STAGE="rejection-control"
if "$GO_BIN" run ./cmd/verify-qualification \
  --archive "$CONTROL_ARCHIVE" \
  --manifest "$CONTROL_MANIFEST" \
  --source-commit "$ARTIFACT_SOURCE_COMMIT" \
  --output "$OUTPUT_DIR/rejected-control.json" \
  > "$OUTPUT_DIR/rejected-control.stdout.log" 2> "$OUTPUT_DIR/rejected-control.stderr.log"; then
  CONTROL_STATUS="unexpectedly_accepted"
  CONTROL_EXIT_CODE=0
  echo "397-member control archive was unexpectedly accepted" >&2
  exit 1
else
  CONTROL_EXIT_CODE="$?"
fi
CONTROL_STDOUT_BYTES="$(wc -c < "$OUTPUT_DIR/rejected-control.stdout.log" | tr -d '[:space:]')"
[[ "$CONTROL_EXIT_CODE" != 0 && ! -e "$OUTPUT_DIR/rejected-control.json" && "$CONTROL_STDOUT_BYTES" == 0 ]] || {
  echo "rejected control wrote a success receipt or returned an invalid status" >&2
  exit 1
}
grep -Fq 'source snapshot pin' "$OUTPUT_DIR/rejected-control.stderr.log" || {
  echo "397-member control failed outside the expected missing-source-pin check" >&2
  cat "$OUTPUT_DIR/rejected-control.stderr.log" >&2 || true
  exit 1
}
CONTROL_STATUS="rejected_missing_source_pins"

STAGE="source-snapshot-after"
snapshot_source_pins "$OUTPUT_DIR/source-pins-after.sha256"
SOURCE_PINS_AFTER_SHA256="$(sha256sum -- "$OUTPUT_DIR/source-pins-after.sha256" | awk '{print $1}')"
cmp -s "$OUTPUT_DIR/source-pins-before.sha256" "$OUTPUT_DIR/source-pins-after.sha256" || {
  echo "source, test, fixture, or runner inputs changed during verification" >&2
  exit 1
}
STAGE="complete"
echo "Portable archive verification passed (405 members; 13 cases); 397-member control rejected for missing pinned source files."
