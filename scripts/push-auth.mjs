import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { git, guardedPush, identity, remoteSha } from "./git.mjs";

export function requirePushToken(env = process.env) {
  const token = env.PATCH_PUSH_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Missing PATCH_PUSH_TOKEN repository secret. Configure a dedicated token for gerardbalaoro/t3code with Contents: write and Workflows: write. GITHUB_TOKEN and stored CLI credentials are not a fallback.",
    );
  }
  return token;
}

// Read-only API checks and push --dry-run do not exercise workflow-file permission.
// This short-lived, non-release tag changes a workflow; it never moves main/dev/patch.
export function checkPushAccess(cwd, repository, token = requirePushToken()) {
  const nonce = randomUUID();
  const ref = `refs/tags/patch-permission-probe/${nonce}`;
  const index = git(cwd, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    `probe-index-${nonce}`,
  ]).trim();
  const env = { ...identity, GIT_INDEX_FILE: index };
  let sha;
  try {
    git(cwd, ["read-tree", "HEAD"], { env });
    const blob = git(cwd, ["hash-object", "-w", "--stdin"], {
      input:
        "name: Permission probe\non: workflow_dispatch\njobs:\n  probe:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: 'true'\n",
    }).trim();
    git(
      cwd,
      [
        "update-index",
        "--add",
        "--cacheinfo",
        `100644,${blob},.github/workflows/patch-permission-probe-${nonce}.yml`,
      ],
      { env },
    );
    const tree = git(cwd, ["write-tree"], { env }).trim();
    sha = git(cwd, ["commit-tree", tree, "-p", "HEAD"], {
      input: "chore(ci): check workflow ref permission\n",
      env,
    }).trim();
    guardedPush(cwd, repository, [{ ref, expected: "", sha }], { token });
  } catch (error) {
    throw new Error(
      `PATCH_PUSH_TOKEN preflight failed; Contents: write and Workflows: write are required on gerardbalaoro/t3code. No build was started.\n${error.message.replaceAll(token, "<REDACTED>")}`,
    );
  } finally {
    rmSync(index, { force: true });
    // Also handle a lost push response. Delete only the exact probe we created.
    if (sha && remoteSha(cwd, repository, ref) === sha) {
      try {
        guardedPush(cwd, repository, [{ ref, expected: sha, sha: "" }], { token });
      } catch {
        throw new Error(
          `Permission probe cleanup failed. Remove only ${ref} at ${sha} in gerardbalaoro/t3code before retrying.`,
        );
      }
    }
  }
}
