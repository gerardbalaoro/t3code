import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve as pathResolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { sha256, json } from "./assemble.mjs";
import { validateAssets } from "./assets.mjs";
import { git, guardedPush, remoteSha, resolve, run } from "./git.mjs";
import { checkPushAccess, requirePushToken } from "./push-auth.mjs";
import {
  FORK,
  FORK_URL,
  UPSTREAM,
  checkContext,
  loadState,
  saveState,
  publishRelease,
} from "./pipeline.mjs";

const requiredJobs = [
  "assemble",
  "bundle",
  ...["macOS arm64", "macOS x64", "Linux x64", "Linux arm64", "Windows x64", "Windows arm64"].map(
    (label) => `Desktop ${label} / Build ${label}`,
  ),
  "Desktop Windows x64 / Verify",
  "Desktop Windows arm64 / Verify",
];

export function recoveryPlan({
  entry,
  sourceRun,
  jobs,
  artifacts,
  currentManifestHash,
  currentDistributionHash,
  attempt,
}) {
  if (!entry?.publish || !entry.release || !entry.sources || entry.status === "published")
    throw new Error("Recovery requires an unpublished stable-release reservation");
  if (
    sourceRun.status !== "completed" ||
    sourceRun.head_sha !== entry.automationSha ||
    sourceRun.head_branch !== "patch" ||
    sourceRun.run_attempt !== attempt ||
    entry.runId !== `${sourceRun.id}-${attempt}`
  )
    throw new Error("Recovery run/attempt does not match the recorded source");
  for (const name of requiredJobs) {
    if (jobs.filter((job) => job.name === name && job.conclusion === "success").length !== 1)
      throw new Error(`Recovery requires successful gate: ${name}`);
  }
  if (
    !jobs.some(
      (job) =>
        job.name === "finish" &&
        job.steps?.some(
          (step) =>
            step.name === "Merge updater feeds and check every required asset" &&
            step.conclusion === "success",
        ),
    )
  )
    throw new Error("Recovery requires successful final asset/hash validation");
  if (
    entry.sources.manifestSha256 !== currentManifestHash ||
    entry.sources.distribution.sha256 !== currentDistributionHash
  )
    throw new Error(
      "Manifest or distribution patch changed; recovery cannot mix new selections with old binaries",
    );
  const artifact = (name) => {
    const matches = artifacts.filter((item) => item.name === name && !item.expired);
    if (matches.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(matches[0].digest || ""))
      throw new Error(`Missing, ambiguous, or unverified recovery artifact: ${name}`);
    const item = matches[0];
    if (
      item.workflow_run &&
      (item.workflow_run.id !== sourceRun.id || item.workflow_run.head_sha !== entry.automationSha)
    )
      throw new Error(`Artifact belongs to another source run: ${name}`);
    return { id: item.id, digest: item.digest };
  };
  return {
    sourceRunId: sourceRun.id,
    sourceAttempt: attempt,
    originalRunId: entry.runId,
    version: entry.version,
    sourceSha: entry.sources.assembledSha,
    releaseArtifact: artifact("validated-release"),
    sourceArtifact: artifact("assembled-source"),
  };
}

function api(endpoint) {
  return JSON.parse(run("gh", ["api", `repos/${FORK}/${endpoint}`]));
}
function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  else console.log(`${name}=${value}`);
}

function plan(cwd, runId, attemptText) {
  if (!/^\d+$/.test(runId || "") || !/^[1-9]\d*$/.test(attemptText || ""))
    throw new Error("Provide a numeric source run ID and attempt");
  const attempt = Number(attemptText);
  const state = loadState(cwd);
  const sourceRun = api(`actions/runs/${runId}/attempts/${attempt}`);
  const jobPage = api(`actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`);
  const artifactPage = api(`actions/runs/${runId}/artifacts?per_page=100`);
  if (
    jobPage.total_count > jobPage.jobs.length ||
    artifactPage.total_count > artifactPage.artifacts.length
  )
    throw new Error("Recovery metadata was truncated; refusing incomplete gate checks");
  const entry = state.data.runs[`${runId}-${attempt}`];
  const result = recoveryPlan({
    entry,
    sourceRun,
    jobs: jobPage.jobs,
    artifacts: artifactPage.artifacts,
    attempt,
    currentManifestHash: sha256(readFileSync("manifest.json")),
    currentDistributionHash: sha256(readFileSync("distribution/cli-feed.patch")),
  });
  const automationSha = git(cwd, ["rev-parse", "HEAD"]).trim();
  resolve(cwd, FORK_URL, entry.automationSha);
  git(cwd, ["merge-base", "--is-ancestor", entry.automationSha, automationSha]);
  mkdirSync(".output", { recursive: true });
  writeFileSync(".output/recovery.json", json({ ...result, automationSha }));
  output("release_artifact_id", result.releaseArtifact.id);
  output("source_artifact_id", result.sourceArtifact.id);
  output("version", result.version);
}

async function finish(cwd) {
  const automationSha = checkContext(cwd);
  const token = requirePushToken();
  const saved = JSON.parse(readFileSync(".output/recovery.json"));
  if (saved.automationSha !== automationSha)
    throw new Error("Recovery automation changed after inspection");
  // Re-read original gates/state rather than trusting only a local plan file.
  plan(cwd, String(saved.sourceRunId), String(saved.sourceAttempt));
  const current = JSON.parse(readFileSync(".output/recovery.json"));
  if (!isDeepStrictEqual(current, saved))
    throw new Error("Recovery metadata changed after download");
  const state = loadState(cwd);
  const entry = state.data.runs[saved.originalRunId];
  const source = pathResolve("source");
  if (git(source, ["rev-parse", "HEAD"]).trim() !== entry.sources.assembledSha)
    throw new Error("Recovery source SHA mismatch");
  const { assembledSha, treeSha, ...sourceRecord } = entry.sources;
  if (
    !isDeepStrictEqual(JSON.parse(readFileSync(join(source, "PATCH-SOURCES.json"))), sourceRecord)
  )
    throw new Error("Recovery source record mismatch");
  const provenance = JSON.parse(readFileSync("release-assets/provenance.json"));
  if (
    !isDeepStrictEqual(provenance.sources, entry.sources) ||
    provenance.version !== entry.version ||
    provenance.automationSha !== entry.automationSha
  )
    throw new Error("Recovery provenance does not match the reservation");
  await validateAssets({
    directory: "release-assets",
    sourceRoot: source,
    version: entry.version,
    verifyOnly: true,
  });
  resolve(source, `https://github.com/${UPSTREAM}.git`, entry.sources.upstream.sha);
  rmSync(join(source, ".git", "shallow"), { force: true });
  git(source, ["fsck", "--connectivity-only"]);
  checkContext(cwd);
  const ref = `refs/tags/v${entry.version}`;
  const previous = remoteSha(source, FORK_URL, ref);
  if (previous && previous !== assembledSha)
    throw new Error("Recovery tag already points to different source; refusing replacement");
  const recovery = {
    ...saved,
    workflowRunId: process.env.GITHUB_RUN_ID,
    workflowAttempt: process.env.GITHUB_RUN_ATTEMPT || "1",
  };
  entry.recovery = recovery;
  entry.status = "promotion-pending";
  saveState(cwd, state);
  // Explicit recovery publishes the reserved tag only. Main and dev are preserved.
  if (!previous)
    guardedPush(source, FORK_URL, [{ ref, expected: "", sha: assembledSha }], { token });
  publishRelease(cwd, entry, automationSha);
  entry.status = "published";
  state.data.releases[String(entry.release.id)] = entry;
  saveState(cwd, state);
  console.log(
    `Recovered ${ref} from validated run ${saved.originalRunId}; no binaries were rebuilt`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(pathResolve(process.argv[1])).href) {
  if (process.argv[2] === "preflight") {
    checkContext(process.cwd());
    checkPushAccess(process.cwd(), FORK_URL);
  } else if (process.argv[2] === "inspect")
    plan(process.cwd(), process.argv[3], process.argv[4] || "1");
  else if (process.argv[2] === "finish") await finish(process.cwd());
  else throw new Error("Usage: node scripts/recover.mjs preflight|inspect RUN_ID [ATTEMPT]|finish");
}
