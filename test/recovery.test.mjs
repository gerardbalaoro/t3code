import { test } from "node:test";
import assert from "node:assert/strict";
import { recoveryPlan } from "../scripts/recover.mjs";

function fixture() {
  const automationSha = "a".repeat(40);
  return {
    entry: {
      runId: "123-1",
      publish: true,
      release: { id: 44 },
      status: "building",
      version: "1.0.3",
      automationSha,
      sources: {
        assembledSha: "c".repeat(40),
        manifestSha256: "manifest",
        distribution: { sha256: "distribution" },
      },
    },
    sourceRun: {
      id: 123,
      status: "completed",
      conclusion: "failure",
      run_attempt: 1,
      head_sha: automationSha,
      head_branch: "patch",
    },
    attempt: 1,
    currentManifestHash: "manifest",
    currentDistributionHash: "distribution",
    jobs: [
      { name: "assemble", conclusion: "success" },
      { name: "bundle", conclusion: "success" },
      ...[
        "macOS arm64",
        "macOS x64",
        "Linux x64",
        "Linux arm64",
        "Windows x64",
        "Windows arm64",
      ].map((label) => ({ name: `Desktop ${label} / Build ${label}`, conclusion: "success" })),
      { name: "Desktop Windows x64 / Verify", conclusion: "success" },
      { name: "Desktop Windows arm64 / Verify", conclusion: "success" },
      {
        name: "finish",
        conclusion: "failure",
        steps: [
          { name: "Merge updater feeds and check every required asset", conclusion: "success" },
        ],
      },
    ],
    artifacts: ["validated-release", "assembled-source"].map((name, index) => ({
      id: 1000 + index,
      name,
      digest: `sha256:${"b".repeat(64)}`,
      expired: false,
      workflow_run: { id: 123, head_sha: automationSha },
    })),
  };
}

test("recovers the original reserved version after promotion failed, without changing source records", () => {
  const input = fixture();
  const before = structuredClone(input);
  const plan = recoveryPlan(input);
  assert.equal(plan.version, "1.0.3");
  assert.equal(plan.originalRunId, "123-1");
  assert.equal(plan.releaseArtifact.id, 1000);
  assert.equal(plan.sourceArtifact.id, 1001);
  assert.deepEqual(input, before);
});

test("rejects any missing or failed desktop/native gate", () => {
  const good = fixture();
  for (const name of good.jobs.filter((job) => job.name !== "finish").map((job) => job.name)) {
    const input = fixture();
    input.jobs.find((job) => job.name === name).conclusion = "failure";
    assert.throws(() => recoveryPlan(input), /requires successful gate/);
  }
});

test("rejects missing final asset validation even when desktop jobs succeeded", () => {
  const input = fixture();
  input.jobs.at(-1).steps[0].conclusion = "failure";
  assert.throws(() => recoveryPlan(input), /final asset\/hash validation/);
});

test("rejects changed selections or distribution code rather than rebuilding/relabeling old binaries", () => {
  for (const field of ["currentManifestHash", "currentDistributionHash"]) {
    const input = fixture();
    input[field] = "changed";
    assert.throws(() => recoveryPlan(input), /cannot mix new selections/);
  }
});

test("rejects another attempt or automation revision", () => {
  const input = fixture();
  input.sourceRun.run_attempt = 2;
  assert.throws(() => recoveryPlan(input), /run\/attempt/);
  input.sourceRun.run_attempt = 1;
  input.sourceRun.head_sha = "d".repeat(40);
  assert.throws(() => recoveryPlan(input), /recorded source/);
});

test("rejects expired, missing-digest, ambiguous, and foreign artifacts", () => {
  for (const mutate of [
    (item) => (item.expired = true),
    (item) => (item.digest = undefined),
    (item) => (item.workflow_run.id = 456),
  ]) {
    const input = fixture();
    mutate(input.artifacts[0]);
    assert.throws(() => recoveryPlan(input), /recovery artifact|another source run/);
  }
  const input = fixture();
  input.artifacts.push(input.artifacts[0]);
  assert.throws(() => recoveryPlan(input), /ambiguous/);
});
