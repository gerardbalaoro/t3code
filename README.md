<p align="center"><img src="assets/g.svg" alt="" width="32" height="40"></p>

# G Code

G Code is an unofficial fork of [T3 Code](https://github.com/pingdotgg/t3code). It adds workspace file tools and publishes its own nightly builds and update feed. G Code is independent of T3 Tools.

## Install

Download the desktop app from the [latest G Code release](https://github.com/gerardbalaoro/t3code/releases/latest). Nightlies support Apple silicon on macOS and x64 and arm64 on Windows and Linux. The builds are unsigned. macOS automatic updates require signing.

The desktop app can install the `t3` command from **Settings → About → t3 command**. On a headless machine, use the fork's installer:

```sh
curl -fsSL https://raw.githubusercontent.com/gerardbalaoro/t3code/dev/main/scripts/install.sh | sh
```

Use `t3 update` to get the next G Code build. The `t3` package on npm belongs to upstream.

## Branches

| Branch | Contents |
| --- | --- |
| `main` | Project home, workflows, and branch list. |
| `upstream/main` | The exact T3 Code commit used as the base for the most recent build. |
| `feature/*` | Individual features based on `upstream/main`. |
| `dev/patch` | G Code branding and the fork's update channel, based on `upstream/main`. Sync applies this branch last. |
| `dev/main` | `upstream/main` with the features and `dev/patch` applied. Nightly builds this branch. |

The [Sync workflow](.github/workflows/sync.yml) runs every 15 minutes. It selects the newest upstream nightly from T3 Code's main branch and replays the branches in [branches.txt](branches.txt) in order. Sync updates `upstream/main` and `dev/main` together.

The [Nightly workflow](.github/workflows/nightly.yml) packages a `dev/main` commit and publishes the release and update feed. The release title gives the upstream nightly tag. To ship changes before the next upstream nightly, run Sync and select **nightly**. Sync skips the build if the release already contains the same commit.

## Make a change

- Base each `feature/*` branch on `upstream/main`. Add it to `branches.txt` before `dev/patch`. For a branch in another fork, put its clone URL before the branch name.
- Commit changes specific to this distribution on `dev/patch`.
- Before rebasing `dev/patch` onto a new nightly, run `./check-upstream-icons.sh <base> <target>`. Review any listed upstream icon changes before rebasing.
- If Sync stops on a branch conflict, check the run summary for the conflicting files. See [AGENTS.md](AGENTS.md) for maintenance and local validation.

## Publishing credentials

The fork's GitHub App writes the generated branches and release tags. It needs Contents and Workflows write access because upstream commits contain workflow files. Configure its ID in `RELEASE_APP_ID` and its private key in `RELEASE_APP_PRIVATE_KEY`.
