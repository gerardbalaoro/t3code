<p align="center"><img src="assets/g-code.png" width="128" height="128" alt=""></p>

# G Code

G Code is a fork of T3 Code, the open-source control plane for coding agents, with a few additions.

## Added Features

- Create files from the workspace file browser. Missing parent folders are created automatically.
- Rename or move files and folders.
- Delete files and folders.

## Download

[Download G Code](https://github.com/gerardbalaoro/t3code/releases/latest) for macOS on Apple silicon or for Windows and Linux on x64 or ARM64. The desktop builds are unsigned.

Install and sign in to at least one supported coding agent before starting your first thread. See the [provider setup guide](https://github.com/gerardbalaoro/t3code/blob/dev/main/docs/user/install.md#providers).

## Command Line

In the desktop app, open **Settings → About → gcode command** to install the CLI. To install it directly on macOS or Linux, run this command.

```sh
curl -fsSL https://raw.githubusercontent.com/gerardbalaoro/t3code/dev/main/scripts/install.sh | sh
```

On Windows, run the installer in PowerShell.

```powershell
irm https://raw.githubusercontent.com/gerardbalaoro/t3code/dev/main/scripts/install.ps1 | iex
```

Run `gcode` to start G Code. Use `gcode update` to install newer G Code CLI builds.

G Code keeps your existing projects, threads, and server settings in `~/.t3`.
T3 Code and G Code can share that data one at a time. If a T3 Code background service is running, use `t3 service uninstall` before opening G Code Desktop or running `gcode service install`.

## About

G Code is an unofficial, independent fork of [T3 Code](https://github.com/pingdotgg/t3code). See [Contributing](CONTRIBUTING.md) for development and release instructions.
