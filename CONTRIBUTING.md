# Contributing to G Code

## Branch Layout

| Branch | Purpose |
| --- | --- |
| `main` | Holds the approved source manifest, release notes, and workflows. |
| `feature/*` | Holds application features. A feature can build on another feature. |
| `dev/patch` | Holds distribution changes and the G Code build workflow. |
| `dev/main` | Holds the assembled app source, build workflow, and release notes for the current build. |
| `dev/<name>` | Proposes application revisions or an upstream update in a PR to `main`. |
| `gcode/release` | Holds the release PR generated from pending Changesets. |
| `gcode/inputs/*` | Retains pinned patch revisions for release assembly. |

Use an application worktree for feature and distribution development.

## Propose a Change

1. Open a `dev/<name>` PR to `main` with an updated [source manifest](release/source.json). Pin the official T3 Code nightly tag and commit.
2. For each patch, pin its full `base` and `commit` SHAs. CI replays the linear range `base..commit` in manifest order.
3. For a stacked patch, set `parent` to the earlier branch it depends on. Set `base` to that branch’s pinned commit. Apply distribution changes last.
4. Add a Markdown file in [`.changeset/`](.changeset/) with a `gcode` bump and the user-facing change. Use a `####` heading for each subject. Include any details below it.
5. When changing the upstream tag, add highlights in `release/upstream/<tag>.md`. For an upstream-only refresh, use a `patch` Changeset with an empty body.

A PR can bring in several feature revisions and an upstream update together. If the parent of a stacked patch moves, update the dependent patch in the same PR.

[G Code release inputs](.github/workflows/release-inputs.yml) reports the latest official nightly on a schedule and checks whether PR inputs can be replayed. Review any icon changes it reports before advancing the upstream base.

## Build and Release

1. Merge the input PRs you want to ship. [Prepare G Code Release](.github/workflows/gcode-version.yml) opens or updates the release PR.
2. Review its version, notes, and final source instructions. Wait for the source check to pass.
3. Merge the release PR. [Assemble G Code release](.github/workflows/gcode-release.yml) replays those instructions and force-pushes `dev/main` with a lease.
4. GitHub builds the pushed commit using the workflow from `dev/patch`. After verification, it tags that commit and publishes the installers, CLI, and updater manifests.

The release PR saves the notes and source instructions for its version. Changesets that merge later stay pending for the next release.

For a failed assembly, rerun its workflow or dispatch **Assemble G Code release** on `main` with the version. For a failed build or publish, rerun the original `dev/main` run. GitHub then uses the same pushed commit. Publish each recorded release before advancing to the next one.

## Correct an Unpublished Release

If a build needs a source fix, wait for its Actions run to finish. Open a PR that corrects the saved source instructions for that version in `release/versions/`. The source check replays the correction. Merging the PR replaces the failed build while its version is untagged.

If publishing already created the tag, rerun the original build to finish uploading the release.

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

Require the PR checks before merging. Keep `gcode/inputs/*` and published tags available for retries. Allow the release app to update `dev/main` and create tags.

## Switch From Nightly Releases

1. Verify that legacy **Sync** is disabled. Disable legacy **Nightly** and wait for any active legacy runs to finish.
2. Push the `dev/patch` revision pinned by the new source manifest. Then merge the release tooling into `main`.
3. If GitHub lists **Build and publish G Code** as disabled, enable it before merging the first release PR.

Legacy Sync can disable the new build workflow if it replays the new patch. Until the first stable release publishes, the existing nightly remains the available download. Nightly users can follow the [manual upgrade steps](README.md#upgrade-from-a-g-code-nightly) once stable is available.
