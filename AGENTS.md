# Fork Maintenance

This checkout is the `patch` branch of `gerardbalaoro/t3code`. [README.md](README.md) explains the branches, `branches.txt`, and how Sync and Nightly build releases. Read it first.

A scheduled agent runs here to keep the fork current. Each run checks for a new upstream nightly, rebases the fork's branches onto it, and starts a build.

## Layout

```
t3code/                 the root checkout, always on `patch`; this file
  .worktrees/           ignored by `patch`'s .gitignore
    update/             feature/update
    create-files/       feature/create-files
```

- The root checkout stays on `patch`. Branch work happens only in `.worktrees/`.
- Each branch gets one worktree, named after the branch without `feature/`.
- Each worktree gets its own agent, started as a separate session with that worktree as its working directory. That session then reads the worktree's own `AGENTS.md` and skills, which are T3 Code's, instead of this file. A subagent of this session would inherit these instructions instead, so do not use one.
- Keep these instructions in `AGENTS.md` only. Claude Code loads every `CLAUDE.md` in parent folders, so a `CLAUDE.md` here would reach every worktree session.

## Setup

Do this once on the machine that runs the schedule.

1. Install `git`, `gh`, and the agent CLI. The worktree agents install T3 Code's own tools as its `AGENTS.md` describes.
2. Sign `gh` in with access to `gerardbalaoro/t3code` that can push branches and run workflows. An existing login works. On a dedicated machine, create a fine-grained token for this repository only, with **Contents**, **Workflows**, and **Actions** set to read and write, then run `gh auth login --with-token < token.txt` and `gh auth setup-git`. Workflows access is needed because rebased branches include upstream commits that change workflow files. If git already uses another credential helper, pass `-c credential.helper= -c 'credential.helper=!gh auth git-credential'` to each `git push` instead of running `gh auth setup-git`.
3. Clone the root checkout and add upstream:

   ```sh
   git clone --branch patch --filter=blob:none https://github.com/gerardbalaoro/t3code.git ~/t3code
   cd ~/t3code
   git remote add upstream https://github.com/pingdotgg/t3code.git
   ```

4. Create a worktree for each bare branch in `branches.txt` and install its dependencies, so the first scheduled run starts ready:

   ```sh
   git worktree add -B feature/update .worktrees/update origin/feature/update
   (cd .worktrees/update && vp i)
   ```

5. Schedule the check every 30 minutes. `flock` skips a run while the previous one is still going:

   ```cron
   */30 * * * * cd ~/t3code && flock -n /tmp/t3code-fork.lock claude -p "Run the scheduled check in AGENTS.md." --permission-mode bypassPermissions >> ~/t3code-fork.log 2>&1
   ```

   With Codex, use `codex exec "Run the scheduled check in AGENTS.md."` instead. Cron starts with a minimal `PATH`, so set `PATH` at the top of the crontab to include `git`, `gh`, Node, and the agent CLI.

## Scheduled Check

Each step ends when its stated condition holds.

1. **Update.** Run `git pull --ff-only` in the root checkout, then `git fetch origin` and `git fetch upstream --no-tags`.

2. **Find the target.** Upstream's newest nightly tag is the target. Sync picks it with the same rule:

   ```sh
   git ls-remote --tags --refs upstream 'v*-nightly.*' | sed 's|.*refs/tags/||' | sort -V | tail -n 1
   ```

   Fetch it with `git fetch upstream --no-tags "refs/tags/<tag>:refs/tags/<tag>"`. Its commit is the **target commit**.

3. **Decide.** Read the fork's latest release title. It ends with `(upstream <tag>)`:

   ```sh
   gh release list --repo gerardbalaoro/t3code --limit 1
   ```

   For each line of `branches.txt` that names a bare branch, its **base** is `git merge-base origin/<branch> upstream/main`. Skip lines with a clone URL, which name another fork's branch.

   Stop and report "up to date" when the release names the target tag and every base is the target commit.

   Stop and report "build in progress" when `gh run list --repo gerardbalaoro/t3code --limit 5` shows a Sync or Nightly run that is not completed.

4. **Rebase.** Take each branch whose base is not the target commit, in `branches.txt` order, one at a time:
   1. Create its worktree if it is missing: `git worktree add -B <branch> .worktrees/<name> origin/<branch>`. Otherwise reset it to the fork's copy: `git -C .worktrees/<name> checkout <branch> && git -C .worktrees/<name> reset --hard origin/<branch>`.
   2. Start its agent in the foreground with the brief below, run from the worktree with the same CLI and permission mode as this run (`cd .worktrees/<name> && claude -p "<brief>"`, or `codex exec -C .worktrees/<name> "<brief>"`).
   3. Read its final message. The step is done when the agent reports **rebased** with a pushed head, or **blocked** with a reason. Continue to the next branch either way.

   The brief:

   > Rebase `<branch>` onto upstream nightly `<tag>` (commit `<target commit>`). Its upstream base is `<base>`. Run `git rebase --onto <target commit> <base> <branch>`. Resolve conflicts so the branch keeps its change and upstream keeps theirs. Then follow this repository's AGENTS.md to install dependencies and verify, including `vp run check:changed`. If verification passes, push with `git push --force-with-lease origin <branch>`. If you cannot resolve a conflict or make verification pass, run `git rebase --abort` if a rebase is still in progress, reset to `origin/<branch>`, and push nothing. End with one line: `<branch>: rebased <new head SHA>` or `<branch>: blocked <reason>`.

5. **Build.** Start Sync: `gh workflow run sync.yml --repo gerardbalaoro/t3code --ref patch`. Find its run ID with `gh run list --repo gerardbalaoro/t3code --workflow sync.yml --limit 1`, then wait with `gh run watch <id> --repo gerardbalaoro/t3code --exit-status`.
   - **Sync failed:** two branches conflict with each other, or a blocked branch does not apply. Its run summary names the branch and files. Report it and stop. Branches that conflict with each other need Gerard.
   - **Sync started a Nightly:** wait for that run the same way. The step is done when the fork's latest release title names the target tag.
   - **Sync started no build:** this is expected when the release already names the target tag and the rebases left the content unchanged.

6. **Report.** End the run with one line per branch from step 4, the Sync result, and the new release tag if one was published.

## Boundaries

- Push only the bare branches listed in `branches.txt`, always with `--force-with-lease`. Sync alone writes `main` and `dev`.
- Change `patch` itself (`branches.txt`, `sync.sh`, the workflows, this file) only when Gerard asks.
- The Nightly workflow owns releases and the `update-feed` release.
- To test `sync.sh` locally, run it in a scratch worktree (`git worktree add --detach .worktrees/sync origin/main`, then `cd .worktrees/sync && DRY_RUN=1 ../../sync.sh`). It checks out commits in the checkout it runs in, so the root checkout would leave `patch`. Remove the scratch worktree afterwards.
