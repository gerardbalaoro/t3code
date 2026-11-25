# Contributing to G Code

## Branch Layout

| Branch | Contents |
| --- | --- |
| `main` | Project documentation, workflows, and the branch list. |
| `upstream/main` | The upstream T3 Code commit selected by Sync. |
| `feature/*` | Individual features based on `upstream/main`. |
| `dev/patch` | G Code branding and update channel, based on `upstream/main`. |
| `dev/main` | The assembled source that Nightly builds. |

## Contribute a Change

1. Base the change on `upstream/main`. Use a `feature/*` branch for features and `dev/patch` for distribution changes.
2. Add new feature branches to [branches.txt](branches.txt) above `dev/patch`. For a branch from another fork, put its clone URL before its branch name.
3. Before rebasing `dev/patch`, run `./check-upstream-icons.sh <base> <target>`. Review any upstream icon changes it lists before rebasing.

For local Sync checks and scheduled maintenance, see [AGENTS.md](AGENTS.md).

## Build and Release

1. [Sync](.github/workflows/sync.yml) selects the latest upstream nightly every 15 minutes. It replays [branches.txt](branches.txt) in order, with `dev/patch` last. It updates `upstream/main` and `dev/main` together.
2. [Nightly](.github/workflows/nightly.yml) builds the assembled `dev/main` commit and publishes the release and update feed. The release title identifies the upstream nightly.

G Code uses the upstream nightly's version for both the packaged binaries and the release tag. Each upstream nightly has one G Code release. If its tag is still available, run Sync and select **nightly** to request a build.

If Sync reports a conflict, check the job summary for the branch and files that need attention.

## Publishing Credentials

The fork's GitHub App needs Contents and Workflows write access to update branches and release tags. Configure its ID in the `RELEASE_APP_ID` variable. Set its private key in the `RELEASE_APP_PRIVATE_KEY` secret.
