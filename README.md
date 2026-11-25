<p align="center"><img src="assets/g-code.png" width="128" height="128" alt=""></p>

# G Code

G Code gives your coding agents one workspace. Run Codex, Claude Code, and other supported agents with the accounts you already use.

- Organize agent threads by project and give each task its own Git worktree.
- Review diffs, commit changes, and push from the app.
- Create, rename, and delete files and folders from the workspace file browser.

## Download

[Download G Code](https://github.com/gerardbalaoro/t3code/releases/latest) for macOS on Apple silicon or for Windows and Linux on x64 or ARM64. The desktop builds are unsigned.

Install and sign in to at least one supported coding agent before starting your first thread. See the [provider setup guide](https://github.com/gerardbalaoro/t3code/blob/dev/main/docs/user/install.md#providers).

## Command Line

In the desktop app, open **Settings → About → t3 command** to install the CLI. To install it directly on macOS or Linux, run this command.

```sh
curl -fsSL https://raw.githubusercontent.com/gerardbalaoro/t3code/dev/main/scripts/install.sh | sh
```

On Windows, run the installer in PowerShell.

```powershell
irm https://raw.githubusercontent.com/gerardbalaoro/t3code/dev/main/scripts/install.ps1 | iex
```

Run `t3` to start G Code. Use `t3 update` to install newer G Code CLI builds.

## About

G Code is an unofficial, independent fork of [T3 Code](https://github.com/pingdotgg/t3code). See [Contributing](CONTRIBUTING.md) for development and release instructions.
