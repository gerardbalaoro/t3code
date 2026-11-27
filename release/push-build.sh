#!/usr/bin/env bash
set -euo pipefail

# The assembled source already carries the build workflow from dev/patch.
git -C "$SOURCE_DIR" cat-file -e HEAD:.github/workflows/gcode-build.yml
git -C "$SOURCE_DIR" cat-file -e HEAD:.github/workflows/release-desktop.yml
mkdir -p "$SOURCE_DIR/.gcode-release"
cp "$RECORD" "$SOURCE_DIR/.gcode-release/release.json"
cp "$NOTES" "$SOURCE_DIR/.gcode-release/notes.md"
date="$(git -C "$SOURCE_DIR" show -s --format=%aI HEAD)"
git -C "$SOURCE_DIR" add .gcode-release
GIT_AUTHOR_DATE="$date" GIT_COMMITTER_DATE="$date" \
  git -C "$SOURCE_DIR" commit -m "chore(release): build G Code $VERSION"

if [[ "${PUSH_BUILD:-true}" == false ]]; then
  git -C "$SOURCE_DIR" rev-parse HEAD
  exit 0
fi

gh auth setup-git
ref=refs/heads/dev/main
previous="$(git -C "$SOURCE_DIR" ls-remote --refs origin "$ref" | cut -f1)"
commit="$(git -C "$SOURCE_DIR" rev-parse HEAD)"
if [[ "$previous" == "$commit" ]]; then
  echo "dev/main already points to $commit. Rerun its build in Actions if needed."
  exit 0
fi
if [[ -n "$PREVIOUS_TAG" ]]; then
  published="$(gh release view "$PREVIOUS_TAG" --repo "$GITHUB_REPOSITORY" --json isDraft --jq .isDraft)"
  [[ "$published" == false ]] || { echo "Publish $PREVIOUS_TAG before advancing dev/main." >&2; exit 1; }
fi
if [[ -n "$previous" ]]; then
  git -C "$SOURCE_DIR" fetch --quiet --no-tags --filter=blob:none origin "$previous"
  if git -C "$SOURCE_DIR" cat-file -e "$previous:.gcode-release/release.json" 2>/dev/null; then
    prior_version="$(git -C "$SOURCE_DIR" show "$previous:.gcode-release/release.json" | jq -er .version)"
    if [[ "$prior_version" == "$VERSION" ]]; then
      tag="$(git -C "$SOURCE_DIR" ls-remote --refs origin "refs/tags/v$VERSION")"
      if [[ -n "$tag" ]]; then
        echo "G Code $VERSION already has a tag. Rerun its original build or inspect the draft release." >&2
        exit 1
      fi
      active="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs?branch=dev%2Fmain&head_sha=$previous" --jq '[.workflow_runs[] | select(.status != "completed")] | length')"
      if [[ "$active" != 0 ]]; then
        echo "Wait for the original dev/main build to finish before replacing G Code $VERSION." >&2
        exit 1
      fi
    elif [[ "$(printf '%s\n' "$VERSION" "$prior_version" | sort -V | tail -1)" == "$prior_version" ]]; then
      echo "dev/main already carries G Code $prior_version." >&2
      exit 1
    fi
  fi
fi
git -C "$SOURCE_DIR" push "--force-with-lease=$ref:$previous" origin "$commit:$ref"
