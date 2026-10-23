# Gerard's T3 Code distribution

This orphan `patch` branch assembles Gerard's desktop and CLI distribution from upstream source and an ordered patch manifest.
The initial feature list is empty. A separate distribution patch keeps CLI release discovery and downloads on `gerardbalaoro/t3code`.

## Branches and source records

- `main` mirrors `pingdotgg/t3code:main`. Automation permits only fast-forward updates and uses an explicit lease.
- `feature/*` holds curated changes. External repositories and pull-request refs can also supply patches.
- `patch` holds the manifest, distribution patch, tooling, and workflows. Set it as the fork's default branch.
- `dev` contains generated source. Do not edit it. Automation replaces it with an explicit lease after all build checks pass.
- `patch-state` contains machine-owned release IDs, version reservations, results, and exact source records. Do not reset or delete it.

Development validation resolves `manifest.json`'s upstream ref, or the manual `source_ref`, to an immutable commit.
Published builds require a stable upstream release. They resolve that release's tag instead of building a newer `main`.
Main mirroring uses its own pinned upstream main commit, independent of the release source.

Every build records the automation commit, manifest digest, upstream commit, feature base/head commits, and distribution patch digest.
`PATCH-SOURCES.json` travels with generated source. `provenance.json` and the original manifest travel with release assets.
The generated commit has one upstream parent. Feature branch histories never become its parents.
Fixed author identity and source timestamps make identical resolved inputs produce identical source commits.
Build outputs can still vary with runner images, downloaded toolchains, and optional signing.

## Run a validation build

Use Node 24 or later and Git for standalone tooling:

```sh
npm test
npm run check
node scripts/assemble.mjs manifest.json .output/source
```

The output directory must not exist. Assembly never pushes branches.
On conflicts, the command names the feature and conflicted paths, deletes temporary output, and exits unsuccessfully.

Dispatch the full build explicitly to the fork:

```sh
gh workflow run distribute.yml --repo gerardbalaoro/t3code --ref patch \
  -f source_ref=66ee628e0875b2b735b199f42e6151e347833637 -f publish=false
```

To build a release's exact source, set `upstream_release` to its stable upstream tag or numeric release ID.
To publish after all checks pass, also set `publish=true`.
Development builds cannot publish. Failed or stale builds cannot replace `dev` or publish a release.

The workflow runs `check:changed` in isolated assembled source and focused distribution tests.
It does not start an application server or run browser tests.
The local asset integration tests use the selected upstream manifest parser:

```sh
PATCH_TEST_SOURCE=/path/to/isolated/source node --test test/assets.integration.mjs
```

## Add a feature

Append a source to `features` in application order:

```json
{
  "id": "example-fix",
  "repository": "https://github.com/OWNER/t3code.git",
  "base": "FULL_BASE_COMMIT_SHA",
  "head": "FULL_FEATURE_COMMIT_SHA"
}
```

Choose the base that isolates the intended feature delta. Inspect `git diff BASE HEAD` before selecting it.
The base must be an ancestor of the head. The assembler applies this binary-safe tree delta with Git's three-way merge.
It does not cherry-pick unrelated history. A patch already present in upstream is recorded as `already-present`.
References can move, but each assembly records the resolved SHAs. Prefer full SHAs for reviewed feature selections.
Conflicts require an updated feature selection. Never resolve them by editing generated `dev`.

## Polling and publication

GitHub Actions polls stable upstream releases every six hours and supports manual dispatch.
No fork release event triggers this workflow. Upstream preview and nightly releases are excluded from this first milestone.
The first run establishes a historical baseline. The first scheduled poll builds the newest stable release if initialization has not occurred.
Later polls process uncompleted release IDs in order. Failed or interrupted reservations remain eligible for another attempt.
Manual release dispatch can rebuild an already processed upstream release with the current manifest.

Scheduled publication stays disabled until repository variable `PATCH_RELEASES_ENABLED` equals `true`.
With that variable absent, scheduled runs validate builds and record their release IDs without publishing.
To publish a previously validated release, dispatch its tag manually with `publish=true`.

Versions use the independent sequence `1.0.N`, reserved persistently before assembly.
These versions use the existing stable updater path, never upstream's feed-disabled preview path.
Failed attempts leave gaps. All desktop feeds use `T3CODE_DESKTOP_UPDATE_REPOSITORY=gerardbalaoro/t3code`.
The distribution patch also changes shared CLI release URLs, so `t3 update` cannot silently install upstream binaries.
The workflow publishes all five supported CLI archives and their checksums.
Upstream does not support a macOS x64 CLI executable.

The workflow serializes runs, checks the current automation tip, and uses atomic pushes with explicit branch leases.
A divergent fork `main` stops promotion. A changed `dev` stops promotion. Neither branch is silently overwritten.
After all targets pass, the workflow checks required assets and their updater hashes, then promotes generated source.
Publication creates a draft, uploads the complete asset list, and makes the release public only after successful uploads.
An interrupted upload can leave a draft for operator inspection. It does not become a public partial release.

## Desktop coverage

- macOS arm64 on `macos-15`: DMG and updater ZIP.
- macOS x64 on `macos-15-intel`: DMG and updater ZIP.
- Linux x64 on `ubuntu-24.04`: AppImage, DEB, and CLI archive.
- Linux arm64 on `ubuntu-24.04-arm`: AppImage, DEB, and CLI archive.
- Windows x64: NSIS and CLI archive, built on Ubuntu and checked on `windows-2025`.
- Windows arm64: NSIS and CLI archive, built on Ubuntu and checked on `windows-11-arm`.

Windows embeds the same-architecture Linux CLI archive for WSL. Native dependencies use upstream's target-specific staging.
The final job merges macOS and Windows updater metadata across architectures.
It requires installers, macOS ZIPs, supported DEBs, blockmaps, updater manifests, CLI archives, provenance, and checksums.
No target can fail while a release succeeds.

Packaging adapts upstream `release-desktop.yml` at `66ee628e0875b2b735b199f42e6151e347833637`.
It calls the selected source's `build-desktop-artifact.ts`, CLI archive tools, smoke tests, and manifest merger.
When upstream changes those interfaces, update this adaptation and run another complete validation build.

## Production Connect and optional signing

The bundle uses the four public production Connect settings from the selected source's `.env.example`.
They are build inputs for the server, bundled web client, and Electron application.
No Clerk secret or relay deployment is required. Official mobile clients remain in use.
This tooling does not change authentication, mobile identities, or orchestration contracts.
The web client remains bundled with the server.

No signing secrets are required for the unsigned baseline.
Unsigned packaging does not establish working macOS automatic updates, production sign-in, or passkeys.
Those paths require testing on installed builds with Gerard's signing identity and suitable entitlements.

Optional macOS repository secrets:
`CSC_LINK` (base64 PKCS#12), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (P8 contents), `APPLE_API_KEY_ID`,
`APPLE_API_ISSUER`, and `MACOS_PROVISIONING_PROFILE` (base64 profile).
Set repository variable `APPLE_TEAM_ID`. Optional variable `CLERK_PASSKEY_RP_DOMAINS` supplies entitled RP domains.
The desktop signing path requires the complete Apple credentials, team ID, and provisioning profile.
Partial Apple credentials keep desktop packaging unsigned, except that a complete certificate pair can sign the CLI archive.
A complete Apple signing set without its required team/profile stops packaging.

Optional Windows repository secrets:
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TRUSTED_SIGNING_ENDPOINT`,
`AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`,
and `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`.
The desktop signing path requires the complete set. Without it, the desktop installer remains unsigned.
The CLI archive tool has its own upstream signing checks. Incomplete credentials can stop that job.
Enter credentials through GitHub's repository secrets interface. Never place them in the manifest, source records, or chat.
