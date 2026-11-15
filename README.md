# Gerard's T3 Code Builds

This branch builds nightly releases of T3 Code with my changes applied on top of upstream.
It holds the build setup, not app code. The app code is on `dev`.

`patch` is the default branch because GitHub runs scheduled workflows only from the default branch.

## Applied Patches

These branches are applied to upstream main, in this order. `branches.txt` sets the order.

| Branch | Change |
| --- | --- |
| `feature/update` | Keeps this fork's builds on this fork's releases. It points `t3 update`, the install scripts, SSH host installs, and the startup recovery link here, and the install scripts default to nightly. It labels builds **Gerard** in the window title and sidebar, and hides the Update track setting, because this fork publishes one track. |
| `feature/create-files` | Adds a **New file** action to the workspace files panel. |

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | An exact copy of upstream `pingdotgg/t3code` main. Do not commit to it. |
| `feature/*` | One change each, based on `main`. |
| `dev` | Upstream main plus every branch in `branches.txt`. Sync rebuilds it from scratch, so do not commit to it. |
| `patch` | This branch: the branch list, the sync script, and the workflows. |

## Build Process

1. **Sync** runs every hour. It also runs when `branches.txt` or `sync.sh` changes, or when you start it by hand.
2. Sync copies upstream main to `main`. It then rebuilds `dev` by replaying each listed branch on top. It never changes the feature branches.
3. Sync starts **Nightly** if `dev` changed and the last nightly is at least 6 hours old.
4. Nightly builds `dev` with upstream's own packaging workflow, then publishes it as the latest release, such as `v0.1.10-nightly.20261115.2`.
5. Installed apps and `t3 update` find the new release.

To build a nightly now, run Sync by hand and check **nightly**.

## Patch Changes

To add or remove a patch, edit `branches.txt`. Later branches apply on top of earlier ones.

To use a branch from another fork, write its clone URL and branch name on one line.

## Blocked Sync

If a branch no longer applies to upstream main, sync stops. It leaves `dev` and the last nightly unchanged. The failed run's summary names the branch and the conflicting files.

To fix it, rebase that branch onto `main` and push it. The next sync continues. You can also remove the branch from `branches.txt`.

To test a sync without pushing, run this from a clone of this fork:

```sh
DRY_RUN=1 /path/to/patch/sync.sh
```

## Installation

Install the desktop app from the latest nightly release. The app includes the `t3` command (**Settings → About → t3 command**). It also installs its own server into WSL.

On a headless machine, run:

```sh
curl -fsSL https://raw.githubusercontent.com/gerardbalaoro/t3code/dev/scripts/install.sh | sh
```

With [mise](https://mise.jdx.dev), install it with the GitHub backend instead:

```sh
mise use -g github:gerardbalaoro/t3code
```

mise installs a new release only after it is a day old, and `mise up` updates it.

Do not use the `t3` npm package. It is upstream's build and updates to upstream's releases.

The builds are unsigned. Your OS shows a warning on first launch. On macOS, automatic updates need signing.

## Credentials

A GitHub App pushes `main`, `dev`, and release tags. The default Actions token cannot push commits that change workflow files, and upstream's commits do.

The app is installed only on this fork, with Contents and Workflows write access. Its ID is the `RELEASE_APP_ID` variable. Its key is the `RELEASE_APP_PRIVATE_KEY` secret.

To stop all automation, uninstall the app or disable the Sync workflow.
