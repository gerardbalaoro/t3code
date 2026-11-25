#!/usr/bin/env bash
# Run from a clean scratch checkout of the fork. DRY_RUN=1 skips the push.
# UPSTREAM_URL can override the official repository for local testing.
set -euo pipefail

project_dir="$(cd "$(dirname "$0")" && pwd)"
upstream_url="${UPSTREAM_URL:-https://github.com/pingdotgg/t3code.git}"
report="${SYNC_REPORT:-/dev/null}"

fail() {
  echo "sync: $*" >&2
  printf '%s\n' "$*" >>"$report"
  exit 1
}

output() {
  echo "$1=$2"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then echo "$1=$2" >>"$GITHUB_OUTPUT"; fi
}

[[ -z "$(git status --porcelain)" ]] || fail "Use a clean scratch checkout."
git fetch --quiet --no-tags "$upstream_url" "+refs/heads/main:refs/sync/upstream"
git fetch --quiet --no-tags origin \
  '+refs/heads/upstream/main:refs/sync/fork-upstream' \
  '+refs/heads/dev/main:refs/sync/fork-dev-main'

nightly_tag="$(git ls-remote --tags --refs "$upstream_url" 'v*-nightly.*' | sed 's|.*refs/tags/||' | sort -V | tail -n 1)"
[[ -n "$nightly_tag" ]] || fail "Upstream has no nightly tags."
git fetch --quiet --no-tags "$upstream_url" "+refs/tags/$nightly_tag:refs/sync/nightly"
upstream_commit="$(git rev-parse 'refs/sync/nightly^{commit}')"
old_upstream="$(git rev-parse refs/sync/fork-upstream)"
old_dev_main="$(git rev-parse refs/sync/fork-dev-main)"
git merge-base --is-ancestor "$upstream_commit" refs/sync/upstream ||
  fail "Upstream's $nightly_tag is not on upstream main."
git merge-base --is-ancestor "$old_upstream" "$upstream_commit" ||
  fail "Upstream's $nightly_tag does not descend from the previous build."
echo "Based on upstream $nightly_tag ($upstream_commit)."

git checkout --quiet --detach "$upstream_commit"

while read -r first second _ || [[ -n "$first" ]]; do
  [[ -z "$first" || "$first" == \#* ]] && continue
  if [[ -n "$second" ]]; then
    source_url="$first" branch="$second" label="$first $second"
  else
    source_url=origin branch="$first" label="$first"
  fi

  git fetch --quiet --no-tags "$source_url" "+refs/heads/$branch:refs/sync/feature" ||
    fail "Could not fetch $label."
  base="$(git merge-base refs/sync/feature refs/sync/upstream)" ||
    fail "$label shares no history with upstream main."
  if [[ "$source_url" == origin && "$branch" == dev/patch ]]; then
    if ! icon_review="$("$project_dir/check-upstream-icons.sh" "$base" "$upstream_commit" 2>&1)"; then
      fail "$icon_review"
    fi
  fi

  # Rebase a detached checkout so Sync never modifies feature branches.
  current="$(git rev-parse HEAD)"
  git checkout --quiet --detach refs/sync/feature
  if ! git -c commit.gpgsign=false rebase --quiet --onto "$current" "$base"; then
    conflicts="$(git diff --name-only --diff-filter=U | sed 's/^/  /')"
    git rebase --abort 2>/dev/null || true
    fail "$(printf 'Could not replay %s on %s. Conflicting files:\n%s' "$label" "$nightly_tag" "$conflicts")"
  fi
  echo "Applied $label."
done <"$project_dir/branches.txt"

new_dev_main="$(git rev-parse HEAD)"
if [[ "$upstream_commit" == "$old_upstream" ]] &&
  git merge-base --is-ancestor "$upstream_commit" "$old_dev_main" &&
  [[ "$(git rev-parse "$old_dev_main^{tree}")" == "$(git rev-parse "$new_dev_main^{tree}")" ]]; then
  new_dev_main="$old_dev_main"
  git checkout --quiet --detach "$new_dev_main"
fi

output upstream "$upstream_commit"
output upstream_nightly "$nightly_tag"
output dev_main "$new_dev_main"

if [[ "${DRY_RUN:-0}" == 1 ]]; then
  echo "Dry run complete."
  exit 0
fi

git push --atomic origin \
  "$upstream_commit:refs/heads/upstream/main" \
  "$new_dev_main:refs/heads/dev/main" \
  "--force-with-lease=refs/heads/upstream/main:$old_upstream" \
  "--force-with-lease=refs/heads/dev/main:$old_dev_main"
