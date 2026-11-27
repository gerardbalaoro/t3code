#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

repo="$GITHUB_REPOSITORY"
if [[ -n "$PREVIOUS_TAG" ]]; then
  previous="$(gh release view "$PREVIOUS_TAG" --repo "$repo" --json isDraft --jq .isDraft)"
  [[ "$previous" == false ]] || { echo "Publish $PREVIOUS_TAG before $TAG." >&2; exit 1; }
fi
latest="$(gh api "repos/$repo/releases/latest" --jq .tag_name)"
if [[ "$latest" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ && "$latest" != "$TAG" &&
      "$(printf '%s\n' "$latest" "$TAG" | sort -V | tail -1)" == "$latest" ]]; then
  echo "A newer G Code release ($latest) is already published."
  exit 1
fi

actual="$(git ls-remote --refs origin "refs/tags/$TAG" | cut -f1)"
if [[ -n "$actual" && "$actual" != "$REF" ]]; then
  echo "$TAG already points to a different commit." >&2
  exit 1
fi
if [[ -z "$actual" ]]; then
  gh api --method POST "repos/$repo/git/refs" -f ref="refs/tags/$TAG" -f sha="$REF" >/dev/null
fi

files=()
for file in release-assets/*; do
  case "${file##*/}" in
    builder-debug.yml) continue ;;
    *.dmg|*.zip|*.AppImage|*.deb|*.exe|*.blockmap|*.tar.gz|*.yml|SHA256SUMS|install.sh|install.ps1|build-provenance.json)
      files+=("$file") ;;
  esac
done

draft="$(gh release list --repo "$repo" --limit 100 --json tagName,isDraft \
  --jq ".[] | select(.tagName == \"$TAG\") | .isDraft")"
case "$draft" in
  false)
    echo "$TAG is already published."
    ;;
  true)
    gh release upload "$TAG" --repo "$repo" --clobber "${files[@]}"
    gh release edit "$TAG" --repo "$repo" --title "$NAME" --notes-file "$NOTES" --draft=false --latest
    ;;
  "")
    gh release create "$TAG" --repo "$repo" --verify-tag --draft --title "$NAME" --notes-file "$NOTES" "${files[@]}"
    gh release edit "$TAG" --repo "$repo" --draft=false --latest
    ;;
esac
