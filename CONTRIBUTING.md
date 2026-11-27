# Contributing to G Code

## Branch Layout

| Branch | Purpose |
| --- | --- |
| `main` | Holds the approved source manifest, release notes, and workflows. |
| `feature/*` | Holds application features. A feature can build on another feature. |
| `dev/patch` | Holds distribution changes. |
| `dev/<name>` | Proposes application revisions or an upstream update in a PR to `main`. |
| `gcode/release` | Holds the release PR generated from pending Changesets. |
| `gcode/source/*` and `gcode/inputs/*` | Retain assembled commits and patch revisions for release builds and retries. |

Use an application worktree for feature and distribution development.

## Propose a Change

1. Open a `dev/<name>` PR to `main` with an updated [source manifest](release/source.json). Pin the official T3 Code nightly tag and commit.
2. For each patch, pin its full `base` and `commit` SHAs. CI replays the linear range `base..commit` in manifest order.
3. For a stacked patch, set `parent` to the earlier branch it depends on. Set `base` to that branch’s pinned commit. Apply distribution changes last.
4. Add a Markdown file in [`.changeset/`](.changeset/) with a `gcode` bump and the user-facing change. Use a `####` heading for each subject. Include any details below it.
5. When changing the upstream tag, add highlights in `release/upstream/<tag>.md`. For an upstream-only refresh, use a `patch` Changeset with an empty body.

A PR can bring in several feature revisions and an upstream update together. If the parent of a stacked patch moves, update the dependent patch in the same PR.

[Sync](.github/workflows/sync.yml) reports the latest official nightly on a schedule and checks whether PR inputs can be replayed. Review any icon changes it reports before advancing the upstream base.

## Build and Release

1. Merge the input PRs you want to ship. [Prepare G Code Release](.github/workflows/gcode-version.yml) opens or updates the release PR.
2. Review the version, notes, and source record in the release PR. Wait for the source check and all packaging jobs to pass.
3. Merge the release PR to start [G Code Release](.github/workflows/gcode-release.yml). It builds the recorded commit and publishes the installers, CLI, and updater manifests after verification.

Changesets uses the highest pending bump to assign the next G Code version. The release PR saves the notes once. The workflow puts that Markdown in the GitHub release body and each desktop updater manifest. Build provenance records the exact G Code commit and upstream nightly. The release workflow pins its reusable packaging workflow by commit.

Publish each recorded release before publishing the next one. Rerun a failed release from its original workflow run. For a build that keeps its assets in Actions, run **G Code Release** on `main` with **publish** unchecked.

## Local Checks

Run these commands from the release tooling checkout.

```sh
npm ci --ignore-scripts
npm test
node release/version.mjs validate
candidate="$(mktemp -d)"
node release/assemble.mjs "$candidate" https://github.com/gerardbalaoro/t3code.git
```

## Publishing Credentials

Configure the GitHub App ID in `RELEASE_APP_ID` and its private key in `RELEASE_APP_PRIVATE_KEY`. The app needs Contents, Workflows, and Pull Requests write access.

Require the PR checks before merging. Keep `gcode/source/*`, `gcode/inputs/*`, and published release tags available for retries. Allow the release app to create those refs.
