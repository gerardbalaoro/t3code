#!/usr/bin/env bash
# Run from a Git checkout with the upstream commits available.
set -euo pipefail

if [[ $# != 2 ]]; then
  echo 'Usage: check-upstream-icons.sh <base> <target>' >&2
  exit 2
fi

# Include edits later reverted along upstream's integration history.
changes="$(git log --first-parent --diff-merges=first-parent --format= --name-only --no-renames "$1..$2" -- \
  assets/dev/ assets/nightly/ assets/prod/ \
  ':(glob)apps/mobile/assets/android-icon-*.png' \
  ':(glob)apps/mobile/assets/android-splash-icon-*.png' \
  apps/mobile/assets/android-notification-icon.png apps/mobile/assets/widget/ \
  apps/mobile/modules/t3-agent-notifications/android/src/main/res/drawable/agent_activity_mark.xml \
  apps/desktop/resources/dmg/ \
  ':(glob)apps/web/public/favicon*' ':(glob)apps/web/public/apple-touch-icon*' \
  ':(glob)apps/web/public/icon-*.png' \
  apps/web/src/components/T3Wordmark.tsx apps/mobile/src/components/T3Wordmark.tsx)"
changes="$(printf '%s\n' "$changes" | sed '/^$/d' | sort -u)"
if [[ -n "$changes" ]]; then
  printf 'Upstream changed product icons. Review these files before rebasing dev/patch:\n%s\n' "$changes" >&2
  exit 1
fi
