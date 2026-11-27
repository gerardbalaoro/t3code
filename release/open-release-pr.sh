#!/usr/bin/env bash
set -euo pipefail

gh auth setup-git
base="$(git rev-parse HEAD)"
branch=gcode/release
branch_ref="refs/heads/$branch"
previous="$(git ls-remote --refs origin "$branch_ref" | cut -f1)"

retain() {
  local sha="$1" namespace="$2" ref found
  ref="refs/heads/gcode/$namespace/$sha"
  found="$(git ls-remote --refs origin "$ref" | cut -f1)"
  if [[ "$found" == "$sha" ]]; then return; fi
  git -C "$SOURCE_DIR" push "--force-with-lease=$ref:" origin "$sha:$ref"
}

while read -r sha; do
  retain "$sha" inputs
done < <(jq -r '.patches[].commit' release/source.json)

if [[ "$(git ls-remote --refs origin refs/heads/main | cut -f1)" != "$base" ]]; then
  echo "main advanced during preparation. Rerun Prepare G Code release on main."
  exit 0
fi

git add .changeset package.json package-lock.json CHANGELOG.md release/versions
git -c user.name='G Code Release' -c user.email=release@gcode.codes \
  -c commit.gpgsign=false commit -m "chore(release): prepare G Code $VERSION"
git push "--force-with-lease=$branch_ref:$previous" origin "HEAD:$branch_ref"

title="Release G Code $VERSION"
number="$(gh pr list --repo "$GITHUB_REPOSITORY" --base main --head "$branch" --json number --jq '.[0].number // empty')"
body="$(mktemp)"
trap 'rm -f "$body"' EXIT
{
  echo "Merge to publish G Code $VERSION from the source recorded in this PR."
  echo
  cat "release/versions/$VERSION.md"
} > "$body"
if [[ -z "$number" ]]; then
  gh pr create --repo "$GITHUB_REPOSITORY" --base main --head "$branch" --title "$title" --body-file "$body"
else
  gh api --method PATCH "repos/$GITHUB_REPOSITORY/pulls/$number" \
    -f title="$title" -F body=@"$body" --silent
fi
