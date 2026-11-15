# Gerard's T3 Code builds

This branch holds the build setup for this fork. It has no app code.

## Branches

| Branch      | What it is                                                         |
| ----------- | ------------------------------------------------------------------ |
| `main`      | An exact copy of upstream `pingdotgg/t3code` main. Never commit to it. |
| `feature/*` | One change each, made on top of `main`.                            |
| `dev`       | Upstream main plus every branch in `branches.txt`. Rebuilt from scratch on every sync, so never commit to it. |
| `patch`     | This branch: the branch list, the sync script and the workflows.  |

## How a build happens

1. **Sync** runs every hour, when `branches.txt` or `sync.sh` changes here, or by hand.
   It copies upstream main to `main`, then rebuilds `dev` by replaying each listed branch, in order, on top of it.
   Feature branches themselves are never changed.
2. If `dev` changed and the last nightly is at least 6 hours old, sync starts **Nightly**.
3. Nightly builds `dev` for macOS, Linux and Windows using upstream's own packaging workflow from `dev`,
   then publishes a prerelease named like `v0.1.9-nightly.20261115.3` with the installers and `t3` CLI downloads.
   Installed apps and `t3 update` pick it up.

To start a nightly now, run Sync by hand with **nightly** checked.

## Add or remove a change

Edit `branches.txt`. Order matters: later branches apply on top of earlier ones.
A branch from another fork goes on one line as its clone URL and branch name.

## When sync is blocked

If a branch no longer applies to upstream main, sync stops, leaves `dev` and the last nightly alone,
and the failed run's summary names the branch and files. Rebase that branch onto `main`, push it, and the next sync continues.
Or remove it from `branches.txt`.

To check locally without pushing anything, from a clone of this fork:

```sh
DRY_RUN=1 /path/to/patch/sync.sh
```

## Install on a server or WSL

The desktop app includes `t3` (Settings → About → t3 command) and installs it into WSL itself.
On a headless machine:

```sh
curl -fsSL https://raw.githubusercontent.com/gerardbalaoro/t3code/dev/scripts/install.sh | T3CODE_CHANNEL=nightly sh
```

Do not use the `t3` npm package. It is upstream's and updates to upstream's builds.

## Credentials

Pushing `main`, `dev` and release tags needs a GitHub App, because the default
Actions token cannot push commits that change workflow files. The app is installed
only on this fork with Contents and Workflows write access. Its ID is the
`RELEASE_APP_ID` variable and its key the `RELEASE_APP_PRIVATE_KEY` secret.
To stop all automation, uninstall the app or disable the Sync workflow.

Builds are unsigned. macOS will warn on first launch, and macOS auto-update needs signing.
