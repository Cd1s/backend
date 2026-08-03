#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/.github/scripts/sync-release.sh"
WORKFLOW="$ROOT/.github/workflows/upstream-sync.yml"
COMPATIBILITY_DOC="$ROOT/docs/singbox-anytls-compatibility.md"
failures=0

fail() {
    printf 'not ok - %s\n' "$1" >&2
    failures=$((failures + 1))
}

pass() {
    printf 'ok - %s\n' "$1"
}

assert_contains() {
    local haystack=$1
    local needle=$2
    grep -Fq -- "$needle" <<<"$haystack"
}

assert_file_contains() {
    local file=$1
    local needle=$2
    grep -Fq -- "$needle" "$file"
}

make_repo() {
    fixture_root="$(mktemp -d)"
    repo="$fixture_root/repo"
    origin="$fixture_root/origin.git"
    mkdir -p "$repo"
    git init -q "$repo"
    git -C "$repo" config user.name test
    git -C "$repo" config user.email test@example.invalid
    git -C "$repo" checkout -q -b singbox
    printf 'base\n' >"$repo/state"
    git -C "$repo" add state
    git -C "$repo" commit -q -m base
    old_sha="$(git -C "$repo" rev-parse HEAD)"
    git init -q --bare "$origin"
    git -C "$repo" remote add origin "$origin"
    git -C "$repo" push -q origin HEAD:singbox
    if [ "${1:-}" = historical ]; then
        git -C "$repo" tag 3.0.0
        git -C "$repo" push -q origin refs/tags/3.0.0
    fi
    printf 'adapted\n' >>"$repo/state"
    git -C "$repo" add state
    git -C "$repo" commit -q -m adapted
    new_sha="$(git -C "$repo" rev-parse HEAD)"
    git -C "$repo" push -q origin HEAD:singbox

    mock_bin="$fixture_root/bin"
    call_log="$fixture_root/gh.log"
    mkdir -p "$mock_bin"
    cat >"$mock_bin/gh" <<'EOF'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >>"$GH_CALL_LOG"
if [ "${1:-}" = release ] && [ "${2:-}" = view ]; then
    if [ "${GH_BEHAVIOR:-}" = resolve ]; then
        printf '%s\n' '{"tagName":"v3.0.0","url":"https://github.com/remnawave/backend/releases/tag/v3.0.0","publishedAt":"2026-08-01T00:00:00Z","isDraft":false,"isPrerelease":false}'
        exit 0
    fi
    case "${GH_BEHAVIOR:-}" in
        existing)
            printf '%s\n' '{"tagName":"3.0.0","url":"https://github.com/Cd1s/remnawave-test/releases/tag/3.0.0"}'
            ;;
        wrong-release-tag)
            printf '%s\n' '{"tagName":"wrong","url":"https://github.com/Cd1s/remnawave-test/releases/tag/wrong"}'
            ;;
        missing)
            printf '%s\n' 'release not found' >&2
            exit 1
            ;;
        query-error)
            printf '%s\n' 'permission denied' >&2
            exit 1
            ;;
    esac
    exit 0
fi
if [ "${1:-}" = release ] && [ "${2:-}" = create ]; then
    printf 'release create %s\n' "$*" >>"$GH_CALL_LOG"
    exit 0
fi
printf 'unexpected gh invocation\n' >&2
exit 2
EOF
    chmod +x "$mock_bin/gh"
}

run_sync() {
    local behavior=$1
    run_sync_commit "$behavior" "$new_sha"
}

run_sync_commit() {
    local behavior=$1
    local commit=$2
    (
        cd "$repo"
        PATH="$mock_bin:$PATH" \
        GH_BEHAVIOR="$behavior" \
        GH_CALL_LOG="$call_log" \
        FORK_REPO=Cd1s/remnawave-test \
        FORK_COMMIT="$commit" \
        UPSTREAM_REPO=remnawave/backend \
        UPSTREAM_RELEASE_TAG=3.0.0 \
        UPSTREAM_RELEASE_URL=https://github.com/remnawave/backend/releases/tag/3.0.0 \
        UPSTREAM_RELEASE_VERSION=3.0.0 \
        CI_RUN_URL=https://github.com/Cd1s/remnawave-test/actions/runs/1 \
        bash "$SCRIPT" sync
    )
}

test_resolve_tag_and_version() {
    make_repo
    output_file="$fixture_root/output"
    if ! (
        cd "$repo"
        : >"$output_file"
        PATH="$mock_bin:$PATH" GH_BEHAVIOR=resolve GH_CALL_LOG="$call_log" \
            GITHUB_OUTPUT="$output_file" UPSTREAM_REPO=remnawave/backend \
            bash "$SCRIPT" resolve
    ) >/dev/null 2>&1; then
        return 1
    fi
    assert_file_contains "$output_file" 'tag=v3.0.0' &&
        assert_file_contains "$output_file" 'version=3.0.0'
}

test_historical_release_is_idempotent() {
    make_repo historical
    output="$(run_sync existing 2>&1)" || return 1
    assert_contains "$output" 'release_sync=skipped' || return 1
    ! grep -Fq 'release create' "$call_log"
}

test_new_release_is_created() {
    make_repo
    output="$(run_sync missing 2>&1)" || return 1
    assert_contains "$output" 'release_sync=created' || return 1
    grep -Fq 'release create' "$call_log"
}

test_superseded_sync_is_skipped_without_release_side_effects() {
    make_repo
    output="$(run_sync_commit missing "$old_sha" 2>&1)" || return 1
    assert_contains "$output" 'release_sync=skipped reason=superseded_by_newer_sync' || return 1
    [ ! -s "$call_log" ]
}

test_diverged_branch_fails_closed() {
    make_repo
    git -C "$repo" checkout -q -b divergent "$old_sha"
    printf 'diverged\n' >>"$repo/state"
    git -C "$repo" add state
    git -C "$repo" commit -q -m divergent
    divergent_sha="$(git -C "$repo" rev-parse HEAD)"
    git -C "$repo" push -q --force origin HEAD:singbox
    output="$(run_sync_commit missing "$new_sha" 2>&1)" && return 1
    assert_contains "$output" "release_sync=failed reason=remote_branch_not_at_final_commit expected=${new_sha} actual=${divergent_sha}"
}

test_different_tag_without_release_fails() {
    make_repo historical
    output="$(run_sync missing 2>&1)" && return 1
    assert_contains "$output" 'tag_exists_without_release_points_to_different_commit'
}

test_release_without_tag_fails() {
    make_repo
    output="$(run_sync existing 2>&1)" && return 1
    assert_contains "$output" 'release_exists_but_tag_missing'
}

test_query_error_fails() {
    make_repo
    output="$(run_sync query-error 2>&1)" && return 1
    assert_contains "$output" 'release_query_error'
}

test_release_structure_mismatch_fails() {
    make_repo
    output="$(run_sync wrong-release-tag 2>&1)" && return 1
    assert_contains "$output" 'release_tag_mismatch'
}

test_workflow_can_push_workflow_files() {
    assert_file_contains "$WORKFLOW" 'contents: write' || return 1
    assert_file_contains "$WORKFLOW" 'WORKFLOW_TOKEN' || return 1
    assert_file_contains "$WORKFLOW" 'GH_TOKEN: ${{ secrets.WORKFLOW_TOKEN }}' || return 1
    assert_file_contains "$WORKFLOW" 'PACKAGE_TOKEN: ${{ github.token }}' || return 1
    ! assert_file_contains "$WORKFLOW" 'GITHUB_TOKEN: ${{ github.token }}' || return 1
    ! assert_file_contains "$WORKFLOW" 'WORKFLOW_CHANGED:' || return 1
    assert_file_contains "$WORKFLOW" 'GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $auth_header"' || return 1
    ! assert_file_contains "$WORKFLOW" 'Configure ephemeral GitHub auth for push' || return 1
    assert_file_contains "$WORKFLOW" 'PACKAGE_TOKEN: ${{ github.token }}' || return 1
    if grep -Eq '^[[:space:]]+workflows:[[:space:]]+write[[:space:]]*$' "$WORKFLOW"; then
        return 1
    fi
}

test_anytls_client_compatibility_contract() {
    assert_file_contains "$COMPATIBILITY_DOC" '1.11.4' || return 1
    assert_file_contains "$COMPATIBILITY_DOC" '1.12.0' || return 1
    assert_file_contains "$COMPATIBILITY_DOC" 'sing-box JSON' || return 1
    assert_file_contains "$COMPATIBILITY_DOC" 'AnyTLS URI' || return 1
    assert_file_contains "$COMPATIBILITY_DOC" 'Xray JSON' || return 1
    assert_file_contains "$COMPATIBILITY_DOC" 'must not be downgraded' || return 1
}

test_workflow_contract() {
    assert_file_contains "$WORKFLOW" 'schedule:' || return 1
    assert_file_contains "$WORKFLOW" 'workflow_dispatch:' || return 1
    assert_file_contains "$WORKFLOW" 'UPSTREAM_SYNC_REPORT_PATH' || return 1
    assert_file_contains "$WORKFLOW" 'actions/upload-artifact@v4' || return 1
    assert_file_contains "$WORKFLOW" 'if: ${{ failure() }}' || return 1
    assert_file_contains "$WORKFLOW" 'git push origin HEAD:singbox' || return 1
    assert_file_contains "$WORKFLOW" 'Verify pushed final commit' || return 1
    assert_file_contains "$WORKFLOW" 'Sync official fork Release' || return 1
    assert_file_contains "$WORKFLOW" 'if: steps.sync.outcome == '\''success'\''' || return 1
    assert_file_contains "$WORKFLOW" 'upstream-sync-lib.sh package' || return 1
    assert_file_contains "$WORKFLOW" 'upstream-sync-lib.sh preflight' || return 1
    assert_file_contains "$WORKFLOW" 'GH_TOKEN: ${{ github.token }}' || return 1
    assert_file_contains "$WORKFLOW" 'PACKAGE_TOKEN: ${{ github.token }}' || return 1
    ! assert_file_contains "$WORKFLOW" 'GITHUB_TOKEN: ${{ github.token }}' || return 1
    ! assert_file_contains "$WORKFLOW" 'WORKFLOW_CHANGED:' || return 1
    assert_file_contains "$WORKFLOW" '*/5 * * * *' || return 1
    if grep -Eq '(__RW_METADATA_VERSION|RWNODE_VERSION)=[0-9]' "$WORKFLOW"; then
        return 1
    fi

    local merge_line push_line verify_line release_line
    merge_line="$(grep -n -m1 'upstream-sync-lib.sh merge' "$WORKFLOW" | cut -d: -f1)"
    push_line="$(grep -n -m1 'git push origin HEAD:singbox' "$WORKFLOW" | cut -d: -f1)"
    verify_line="$(grep -n -m1 'name: Verify pushed final commit' "$WORKFLOW" | cut -d: -f1)"
    release_line="$(grep -n -m1 'name: Sync official fork Release' "$WORKFLOW" | cut -d: -f1)"
    [ -n "$merge_line" ] && [ "$merge_line" -lt "$push_line" ] &&
        [ "$push_line" -lt "$verify_line" ] && [ "$verify_line" -lt "$release_line" ]
}

run_case() {
    local name=$1
    if "$name"; then
        pass "$name"
    else
        fail "$name"
    fi
}

run_case test_resolve_tag_and_version
run_case test_historical_release_is_idempotent
run_case test_new_release_is_created
run_case test_superseded_sync_is_skipped_without_release_side_effects
run_case test_diverged_branch_fails_closed
run_case test_different_tag_without_release_fails
run_case test_release_without_tag_fails
run_case test_query_error_fails
run_case test_release_structure_mismatch_fails
run_case test_workflow_can_push_workflow_files
run_case test_anytls_client_compatibility_contract
run_case test_workflow_contract

if [ "$failures" -ne 0 ]; then
    printf '%s test(s) failed\n' "$failures" >&2
    exit 1
fi
printf 'all sync contract tests passed\n'
