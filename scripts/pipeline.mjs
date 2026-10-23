import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  appendFileSync,
  copyFileSync,
} from "node:fs";
import { dirname, join, resolve as pathResolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assemble, json } from "./assemble.mjs";
import { run, git, tryGit, remoteSha, resolve, identity } from "./git.mjs";

export const FORK = "gerardbalaoro/t3code";
export const FORK_URL = `https://github.com/${FORK}.git`;
export const UPSTREAM = "pingdotgg/t3code";
export const STATE_REF = "refs/heads/patch-state";
export const eligible = (release) =>
  !release.draft && !release.prerelease && /^v\d+\.\d+\.\d+$/.test(release.tag_name);
export function selectRelease(releases, state, requested) {
  const stable = releases.filter(eligible).sort((a, b) => a.id - b.id);
  if (requested) {
    const found = stable.find(
      (release) => String(release.id) === requested || release.tag_name === requested,
    );
    if (!found) throw new Error("Requested upstream release is missing or is not a stable release");
    return found;
  }
  // First poll starts at the newest stable release, not the entire historical catalog.
  if (!state.initialized) return stable.at(-1);
  return stable.find(
    (release) =>
      !["validated", "published", "baseline"].includes(state.releases[String(release.id)]?.status),
  );
}
export function assertFresh(cwd, repository, automationSha) {
  if (remoteSha(cwd, repository, "refs/heads/patch") !== automationSha)
    throw new Error("Stale automation: patch advanced; rerun from the current patch branch");
}
export function assertFastForward(cwd, previous, next) {
  if (previous && tryGit(cwd, ["merge-base", "--is-ancestor", previous, next]) === undefined)
    throw new Error("Fork main diverged from upstream; refusing to overwrite user commits");
}
export function guardedPush(cwd, repository, updates) {
  git(cwd, [
    "push",
    "--atomic",
    ...updates.map(({ ref, expected }) => `--force-with-lease=${ref}:${expected}`),
    repository,
    ...updates.map(({ ref, sha }) => `${sha}:${ref}`),
  ]);
}
// Release artifacts use their triggering tag. Only development validation replaces dev.
export function promotionUpdates(entry, mirrorSha) {
  const updates = [{ ref: "refs/heads/main", expected: entry.expectedMain, sha: mirrorSha }];
  if (!entry.release) {
    updates.push({
      ref: "refs/heads/dev",
      expected: entry.expectedDev,
      sha: entry.sources.assembledSha,
    });
  }
  if (entry.publish) {
    updates.push({
      ref: `refs/tags/v${entry.version}`,
      expected: "",
      sha: entry.sources.assembledSha,
    });
  }
  return updates;
}
function gh(args) {
  return run("gh", args);
}
function emit(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  else console.log(`${name}=${value}`);
}
function loadState(cwd) {
  const sha = remoteSha(cwd, FORK_URL, STATE_REF);
  if (!sha)
    return {
      sha: "",
      data: { schema: 1, nextSequence: 1, initialized: false, releases: {}, runs: {} },
    };
  resolve(cwd, FORK_URL, sha);
  const data = JSON.parse(git(cwd, ["show", `${sha}:state.json`]));
  if (
    data.schema !== 1 ||
    !Number.isSafeInteger(data.nextSequence) ||
    data.nextSequence < 1 ||
    !data.releases ||
    !data.runs
  ) {
    throw new Error("Invalid persistent patch state; refusing to reserve a version");
  }
  return { sha, data };
}
function saveState(cwd, state) {
  const index = join(cwd, ".git", "state-index");
  const env = { ...identity, GIT_INDEX_FILE: index };
  try {
    git(cwd, ["read-tree", "--empty"], { env });
    const blob = git(cwd, ["hash-object", "-w", "--stdin"], { input: json(state.data) }).trim();
    git(cwd, ["update-index", "--add", "--cacheinfo", `100644,${blob},state.json`], { env });
    const tree = git(cwd, ["write-tree"], { env }).trim();
    const sha = git(cwd, ["commit-tree", tree, ...(state.sha ? ["-p", state.sha] : [])], {
      input: "chore(ci): record patch build state\n",
      env,
    }).trim();
    guardedPush(cwd, FORK_URL, [{ ref: STATE_REF, expected: state.sha, sha }]);
    state.sha = sha;
  } finally {
    rmSync(index, { force: true });
  }
}
function currentRun() {
  const id = process.env.GITHUB_RUN_ID;
  if (!/^\d+$/.test(id || "")) throw new Error("GITHUB_RUN_ID is required");
  return `${id}-${process.env.GITHUB_RUN_ATTEMPT || "1"}`;
}
function checkContext(cwd) {
  if (process.env.GITHUB_REPOSITORY !== FORK || process.env.GITHUB_REF !== "refs/heads/patch")
    throw new Error("This workflow must run on gerardbalaoro/t3code:patch");
  const sha = git(cwd, ["rev-parse", "HEAD"]).trim();
  assertFresh(cwd, FORK_URL, sha);
  return sha;
}
function fetchReleases() {
  return JSON.parse(
    gh(["api", `repos/${UPSTREAM}/releases?per_page=100`, "--paginate", "--slurp"]),
  ).flat();
}
export function publicConnect(sourceRoot) {
  const text = readFileSync(join(sourceRoot, ".env.example"), "utf8");
  const names = [
    "T3CODE_CLERK_PUBLISHABLE_KEY",
    "T3CODE_CLERK_JWT_TEMPLATE",
    "T3CODE_CLERK_CLI_OAUTH_CLIENT_ID",
    "T3CODE_RELAY_URL",
  ];
  return Object.fromEntries(
    names.map((name) => {
      const value = text
        .split(/\r?\n/)
        .find((line) => line.startsWith(`${name}=`))
        ?.slice(name.length + 1);
      if (!value || /[\r\n]/.test(value))
        throw new Error(`Missing public Connect setting: ${name}`);
      return [name, value];
    }),
  );
}
async function prepare(cwd) {
  const automationSha = checkContext(cwd);
  const state = loadState(cwd);
  const manual = process.env.GITHUB_EVENT_NAME === "workflow_dispatch";
  const releases = fetchReleases();
  const release =
    !manual || process.env.UPSTREAM_RELEASE
      ? selectRelease(releases, state.data, process.env.UPSTREAM_RELEASE)
      : undefined;
  if (!manual && !release) {
    emit("build", "false");
    return;
  }
  const id = currentRun();
  const version = `1.0.${state.data.nextSequence++}`;
  if (!state.data.initialized) {
    for (const old of releases.filter(eligible)) {
      if (old.id !== release?.id)
        state.data.releases[String(old.id)] = { status: "baseline", tag: old.tag_name };
    }
    state.data.initialized = true;
  }
  const entry = {
    status: "building",
    automationSha,
    version,
    runId: id,
    release: release ? { id: release.id, tag: release.tag_name, url: release.html_url } : null,
    expectedMain: remoteSha(cwd, FORK_URL, "refs/heads/main"),
    expectedDev: remoteSha(cwd, FORK_URL, "refs/heads/dev"),
    publish: release != null && process.env.PUBLISH === "true",
  };
  if (manual && process.env.PUBLISH === "true" && !release)
    throw new Error(
      "Published builds require an explicit stable upstream release; development source cannot be published",
    );
  state.data.runs[id] = entry;
  if (release) state.data.releases[String(release.id)] = entry;
  saveState(cwd, state);
  mkdirSync(".output", { recursive: true });
  // Pin the release tag, never target_commitish (often a moving branch).
  const sources = assemble({
    manifestPath: "manifest.json",
    output: ".output/source",
    automationSha,
    sourceRef: release ? `refs/tags/${release.tag_name}` : process.env.SOURCE_REF || undefined,
    distributionPath: "distribution/cli-feed.patch",
    release: entry.release,
  });
  const source = pathResolve(".output/source");
  // Main advances independently of the selected release's older source.
  entry.mirrorSha = resolve(source, `https://github.com/${UPSTREAM}.git`, "refs/heads/main");
  if (entry.expectedMain) resolve(source, FORK_URL, entry.expectedMain);
  assertFastForward(source, entry.expectedMain, entry.mirrorSha);
  entry.sources = sources;
  saveState(cwd, state);
  writeFileSync(
    ".output/provenance.json",
    json({
      ...entry,
      workflowUrl: `https://github.com/${FORK}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    }),
  );
  copyFileSync("manifest.json", ".output/manifest.json");
  const connect = publicConnect(source);
  for (const [name, value] of Object.entries(connect)) emit(name.toLowerCase(), value);
  // A shallow clone retains the exact generated commit and usable Git metadata.
  // Sparse checkout excludes upstream's vendored gitlinks without touching source.
  git(cwd, [
    "clone",
    "--no-local",
    "--depth=1",
    "--no-checkout",
    pathToFileURL(source).href,
    ".output/package-source",
  ]);
  const packaged = pathResolve(".output/package-source");
  git(packaged, ["sparse-checkout", "set", "--no-cone", "/*", "!/.repos/"]);
  git(packaged, ["checkout", "--detach", sources.assembledSha]);
  run("tar", ["-cf", pathResolve(".output/source.tar"), "-C", packaged, "."]);
  emit("version", version);
  emit("build", "true");
}
async function finish(cwd) {
  const state = loadState(cwd);
  const id = currentRun();
  const entry = state.data.runs[id];
  if (!entry) throw new Error("No reservation exists for this run");
  if (process.env.BUILD_RESULT !== "success") {
    entry.status = "failed";
    if (entry.release) state.data.releases[String(entry.release.id)] = entry;
    saveState(cwd, state);
    throw new Error("Build or validation failed; dev and releases were not changed");
  }
  checkContext(cwd);
  const source = pathResolve("source");
  if (git(source, ["rev-parse", "HEAD"]).trim() !== entry.sources.assembledSha)
    throw new Error("Source artifact SHA does not match reservation");
  const manifestSource = JSON.parse(readFileSync(join(source, "PATCH-SOURCES.json")));
  if (manifestSource.automationSha !== entry.automationSha)
    throw new Error("Source automation mismatch");
  const mirrorSha = resolve(source, `https://github.com/${UPSTREAM}.git`, entry.mirrorSha);
  if (entry.expectedMain) resolve(source, FORK_URL, entry.expectedMain);
  assertFastForward(source, entry.expectedMain, mirrorSha);
  const updates = promotionUpdates(entry, mirrorSha);
  // The shallow source includes the generated commit but not its upstream parent.
  resolve(source, `https://github.com/${UPSTREAM}.git`, entry.sources.upstream.sha);
  rmSync(join(source, ".git", "shallow"), { force: true });
  git(source, ["fsck", "--connectivity-only"]);
  guardedPush(source, FORK_URL, updates);
  if (entry.publish) {
    const tag = `v${entry.version}`;
    const notesPath = join(cwd, ".output", "release-notes.md");
    mkdirSync(dirname(notesPath), { recursive: true });
    writeFileSync(
      notesPath,
      `Gerard's T3 Code distribution ${entry.version}\n\nUpstream: ${entry.release.url}\nSource: ${entry.sources.upstream.sha}\nAutomation: ${entry.automationSha}\nManifest: ${entry.sources.manifestSha256}\n\nSee provenance.json and SHA256SUMS for exact sources and assets. Optional signing depends on configured fork credentials.\n`,
    );
    gh([
      "release",
      "create",
      tag,
      "--repo",
      FORK,
      "--verify-tag",
      "--draft",
      "--title",
      `T3 Code — Gerard ${entry.version}`,
      "--notes-file",
      notesPath,
    ]);
    const assets = JSON.parse(readFileSync("release-assets/asset-list.json"));
    gh([
      "release",
      "upload",
      tag,
      ...assets.map((name) => `release-assets/${name}`),
      "--repo",
      FORK,
    ]);
    // Publication is last: a failed upload leaves only a draft.
    assertFresh(cwd, FORK_URL, entry.automationSha);
    gh(["release", "edit", tag, "--repo", FORK, "--draft=false", "--latest"]);
  }
  entry.status = entry.publish ? "published" : "validated";
  if (entry.release) state.data.releases[String(entry.release.id)] = entry;
  saveState(cwd, state);
  console.log(`${entry.status}: ${entry.version}, source ${entry.sources.assembledSha}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(pathResolve(process.argv[1])).href) {
  const command = process.argv[2];
  if (command === "prepare") await prepare(process.cwd());
  else if (command === "finish") await finish(process.cwd());
  else if (command === "connect") {
    for (const [name, value] of Object.entries(publicConnect(process.cwd())))
      appendFileSync(process.env.GITHUB_ENV, `${name}=${value}\n`);
  } else throw new Error("Usage: node scripts/pipeline.mjs prepare|finish|connect");
}
