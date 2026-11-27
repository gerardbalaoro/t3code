# G Code Release Handoff

G Code needs its own version numbers and one public release channel. Sync should still build from the latest upstream T3 Code nightly. A change to a G Code feature should be able to ship on the same T3 Code base.

## Review Branches

- [feat/gcode-distribution](https://github.com/gerardbalaoro/t3code/tree/feat/gcode-distribution) is based on `dev/patch`. It contains the application changes and this handoff.
- [chore/gcode-release](https://github.com/gerardbalaoro/t3code/tree/chore/gcode-release) is based on `main`. It contains the corresponding changes to the README and release workflow.

The split follows the fork's [branch layout](https://github.com/gerardbalaoro/t3code/blob/main/CONTRIBUTING.md). Sync assembles the upstream base, `feature/*`, and `dev/patch` into `dev/main`. The release builds from that assembled source. Keep the root checkout on `main` and use worktrees for application branches.

Coordinate the rollout of both branches. The release workflow expects `gcode-*` archives and calls a reusable workflow on `dev/main` with the `upstream_tag` input.

## Application Changes

G Code installs a `gcode` command, separate service identities, and runtimes in `~/.t3/gcode/versions`. Its desktop packages have their own identity. T3 Code and G Code can be installed side by side and use the same projects, settings, and history in `~/.t3`. Use one app or service at a time for that data directory.

Builds can pass `GCODE_UPSTREAM_TAG` to identify their T3 Code base. About, `gcode --version`, and `gcode triage` use that value. Triage should establish whether an issue belongs to G Code or upstream before routing it. See [build provenance](packages/shared/src/buildProvenance.ts) and the [triage playbook](.github/triage/PLAYBOOK.md).

## Remaining Release Work

1. Pick the first independent G Code version and how subsequent versions are assigned. Use the G Code version for the Git tag, packages, and update manifests. Record the exact T3 Code nightly tag and commit as build inputs.
2. Rename the fork's `nightly.yml` to `gcode-release.yml`. Update Sync's workflow references, allowlist, and release detection. Detect a new assembled source commit even when its upstream tag matches the previous release.
3. Save user-facing G Code release notes in Git. Include changes since the previous G Code release, and treat patches carried forward by a rebase as existing changes. Assemble the notes in a fixed order and append a link to the recorded T3 Code nightly. Publish the same Markdown to GitHub and the desktop updater. The same build inputs should produce identical Markdown on retry. An upstream-only update can name the new base without repeating older G Code patches.
4. Verify the upgrade path from the existing G Code nightlies. Check how installed desktop clients discover the first regular release and how users of the old `t3` launcher or service switch to `gcode`. Keep the shared data directory intact.
5. Build from the assembled `dev/main` commit. Verify the installers, packaged version output, About, triage, and the update feed before publishing. Keep macOS 26 for arm64.

The workflow on the companion branch still uses the upstream nightly tag as the G Code version and fetches upstream release notes at build time. The independent versioning and notes generator are pending. No release was started for this handoff.

## Suggested Skills

- Use `git-conventions` when preparing commits and branches.
- Use `writing-documentation` for the release and migration instructions.
