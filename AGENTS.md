# G Code maintenance

Read [README.md](README.md) for the branch layout and release flow. Keep this checkout on `main`. Work on application branches in `.worktrees/`.

Sync owns `upstream/main` and `dev/main`. Nightly owns releases and the `update-feed` release. Change project files on `main` when Gerard requests them. During scheduled maintenance, push bare branches listed in `branches.txt` with `--force-with-lease`.

## Scheduled check

1. On `main`, pull with `git pull --ff-only`. Fetch `origin` and the official upstream with `git fetch upstream --no-tags`. Here `upstream` is the Git remote for `pingdotgg/t3code`, and `origin/upstream/main` is the fork's build branch.
2. Find upstream's newest nightly and fetch its tag. Use the same version sort as Sync.

   ```sh
   tag=$(git ls-remote --tags --refs upstream 'v*-nightly.*' | sed 's|.*refs/tags/||' | sort -V | tail -n 1)
   git fetch upstream --no-tags "refs/tags/$tag:refs/tags/$tag"
   git rev-parse "$tag^{commit}"
   ```

3. If a Sync or Nightly run is active on `gerardbalaoro/t3code`, report **build in progress** and finish. For each bare branch in `branches.txt`, get its base with `git merge-base origin/<branch> upstream/main`. Skip entries with clone URLs. If all bases match the nightly commit and the latest G Code release names that tag, report **up to date**. Also check the update feed if the applicable Nightly failed after publication.
4. For each bare branch with an older base, prepare a worktree in file order. Use `.worktrees/<name>` for `feature/<name>` and `.worktrees/dev-patch` for `dev/patch`. Start from `origin/<branch>`. Preserve any local changes and report a branch as blocked if they prevent a safe rebase.

   Before rebasing `dev/patch`, run `./check-upstream-icons.sh <base> <target commit>` from the root checkout. If it reports changes, stop and give Gerard the file list for review.

   Start a separate foreground agent session in that worktree so it loads the application's own `AGENTS.md`. Use the same agent CLI and permission mode. Give it the branch, base, and target commit and this brief:

   > Run `git rebase --onto <target commit> <base> <branch>`. Resolve conflicts while preserving both changes. Follow this worktree's instructions to install dependencies and run `vp run check:changed` with the repository-local `vp`. After checks pass, push with `git push --force-with-lease origin <branch>`. If blocked, abort any incomplete rebase, restore the original branch head, and push nothing. Return `<branch>: rebased <head SHA>` or `<branch>: blocked <reason>`.

5. Dispatch Sync with `gh workflow run sync.yml --repo gerardbalaoro/t3code --ref main`. Find the run ID with `gh run list --repo gerardbalaoro/t3code --workflow sync.yml --branch main`. Wait for its result and for any Nightly started by that run. If Sync reports a conflict, report the branch and files. If Nightly publishes, verify the release names the target tag. Report the branch results, workflow status, and release link.

## Test Sync locally

Use a scratch worktree so that Sync can check out and rebase detached commits. Remove the worktree after the dry run.

```sh
git worktree add --detach .worktrees/sync origin/upstream/main
(cd .worktrees/sync && DRY_RUN=1 ../../sync.sh)
git worktree remove .worktrees/sync
```

For scheduled agents outside GitHub Actions, use a lock such as `flock -n /tmp/g-code-maintenance.lock` to prevent overlapping maintenance runs. Authenticate `gh` for the fork with Contents, Actions, and Workflows write access. Use the official upstream remote:

```sh
git remote add upstream https://github.com/pingdotgg/t3code.git
```
