# G Code Maintenance

Keep the root checkout on `main`. Use `.worktrees/` for application branches. Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing release inputs, workflows, or distribution code.

For scheduled maintenance, compare the official T3 Code nightly with [the approved source](release/source.json). Report the newer nightly or any replay conflicts for review. Use a `dev/<name>` PR to propose a new base or patch revisions. Preserve local changes in application worktrees.
