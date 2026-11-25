<p align="center"><img src="branding/g.svg" alt="" width="32" height="40"></p>

# G Code

G Code is an unofficial fork of [T3 Code](https://github.com/pingdotgg/t3code). It adds workspace file tools and publishes its own nightly builds and update feed. G Code is independent of T3 Tools.

## Install

Download the desktop app from the [latest G Code release](https://github.com/gerardbalaoro/t3code/releases/latest). Nightlies support Apple silicon on macOS and x64 and arm64 on Windows and Linux. The builds are unsigned. macOS automatic updates require signing.

The desktop app can install the `t3` command from **Settings → About → t3 command**. On a headless machine, use the fork's installer:

```sh
curl -fsSL https://raw.githubusercontent.com/gerardbalaoro/t3code/dev/patch/scripts/install.sh | sh
```

Use `t3 update` to get the next G Code build. The `t3` package on npm belongs to upstream.

## Branches

| Branch | Contents |
| --- | --- |
| `main` | Project home, workflows, feature list, and [fork patches](patches/). |
| `upstream/main` | The exact T3 Code commit used as the base for the most recent build. |
| `feature/*` | Individual features based on `upstream/main`. [branches.txt](branches.txt) lists the features to include and their order. |
| `dev/main` | `upstream/main` plus the listed features. |
| `dev/patch` | `dev/main` plus the fork's update channel and G Code branding. Nightly builds this branch. |

The [Sync workflow](.github/workflows/sync.yml) runs every 15 minutes. It selects the newest upstream nightly tag on T3 Code's main branch, replays the features in order, and applies the Git patches in filename order. Sync updates all three generated branches together and leaves feature branches for their maintainers.

The [Nightly workflow](.github/workflows/nightly.yml) packages the resulting `dev/patch` commit and publishes the release and update feed. The release title gives the upstream nightly tag. To ship changes before the next upstream nightly, run Sync and select **nightly**. Sync skips the build if the release already contains the same commit.

## Make a change

- Add or update a `feature/*` branch based on `upstream/main`. Put its name in `branches.txt` to include it. For a branch in another fork, put its clone URL before the branch name.
- For changes specific to this distribution, start from `dev/patch` in a scratch worktree. Commit the change and export it with `git format-patch -1 --binary`. Add the patch under `patches/` in application order.
- If Sync fails to apply a feature or a patch, check the run summary for the conflicting files. The generated branches remain at their previous commits. See [AGENTS.md](AGENTS.md) for maintenance and local validation.

## Publishing credentials

The fork's GitHub App writes the generated branches and release tags. It needs Contents and Workflows write access because upstream commits contain workflow files. Configure its ID in `RELEASE_APP_ID` and its private key in `RELEASE_APP_PRIVATE_KEY`.
