#!/usr/bin/env bash
# Rebuilds `dev` as upstream main plus every branch in branches.txt, then
# updates the fork's `main` and `dev`. Run it from a clone of the fork whose
# `origin` is the fork.
#
#   DRY_RUN=1     build `dev` locally and report, but push nothing
#   UPSTREAM_URL  defaults to pingdotgg/t3code
set -euo pipefail

upstream_url="${UPSTREAM_URL:-https://github.com/pingdotgg/t3code.git}"
branches_file="$(cd "$(dirname "$0")" && pwd)/branches.txt"
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

git fetch --quiet --no-tags "$upstream_url" "+refs/heads/main:refs/sync/upstream"
git fetch --quiet --no-tags origin "+refs/heads/main:refs/sync/fork-main"
# `dev` does not exist before the first sync.
git fetch --quiet --no-tags origin "+refs/heads/dev:refs/sync/fork-dev" 2>/dev/null ||
  git update-ref -d refs/sync/fork-dev

git merge-base --is-ancestor refs/sync/fork-main refs/sync/upstream ||
  fail "The fork's main has commits upstream does not. Reset it to upstream main by hand."

git checkout --quiet --force --detach refs/sync/upstream

while read -r first second _; do
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

  # Rebasing a scratch branch leaves the source branch untouched, and drops
  # commits upstream already contains.
  git branch --quiet --force sync-scratch refs/sync/feature
  if ! git rebase --quiet --onto HEAD "$base" sync-scratch >/dev/null 2>&1; then
    conflicts="$(git diff --name-only --diff-filter=U | sed 's/^/  /')"
    git rebase --abort
    fail "$(printf '%s conflicts with upstream main in:\n%s\nRebase %s onto main and push it, or remove it from branches.txt.' "$label" "$conflicts" "$label")"
  fi
  git checkout --quiet --detach sync-scratch
  echo "applied $label"
done <"$branches_file"

git branch --quiet --delete --force sync-scratch 2>/dev/null || true

new_dev="$(git rev-parse HEAD)"
old_dev="$(git rev-parse --verify --quiet refs/sync/fork-dev || true)"
# Rebasing gives new commit ids every run, so compare content, not ids.
if [[ -n "$old_dev" && "$(git rev-parse "$old_dev^{tree}")" == "$(git rev-parse HEAD^{tree})" ]]; then
  new_dev="$old_dev"
fi

output upstream "$(git rev-parse refs/sync/upstream)"
output dev "$new_dev"
output dev_changed "$([[ "$new_dev" != "$old_dev" ]] && echo true || echo false)"

if [[ -n "${DRY_RUN:-}" ]]; then
  echo "dry run: nothing pushed"
  exit 0
fi

# `main` moves only forward. `dev` is replaced, but only from the version read above.
git push --atomic origin \
  "refs/sync/upstream:refs/heads/main" \
  "$new_dev:refs/heads/dev" \
  "--force-with-lease=refs/heads/dev:$old_dev"
